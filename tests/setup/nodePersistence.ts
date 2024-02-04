import { ApiPromise } from '@polkadot/api';
import chalk from 'chalk';
import { ChildProcess, exec, spawn } from 'child_process';
import findProcess from 'find-process';
import fs from 'fs-extra';
import path from 'path';
import { increaseBlockTimestamp, setBlockTimestamp } from 'tests/misc';
import { getApiProviderWrapper } from './helpers';

export const DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH = `${path.join(__dirname, 'deployedContracts.json')}`;

export interface StoredContractInfo {
  name: string;
  address?: string;
  reserveName?: string;
  stableName?: string;
  codeHash?: string;
}

export const saveContractInfoToFileAsJson = async (contractInfos: StoredContractInfo[], writePath = DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH) => {
  await fs.writeJSON(writePath, contractInfos);
};

const logToFile = (data: string) => {
  if (!process.env.PWD) throw 'could not determine pwd';
  fs.appendFile(path.join(process.env.PWD, `substrate-contracts-node.testrun.log`), data, { encoding: 'utf-8' });
};
export const sleep = (waitTimeInMs) => new Promise((resolve) => setTimeout(resolve, waitTimeInMs));

export async function waitFor(valueGetter: () => any, logMessage = 'Waiting for value...') {
  while (!valueGetter()) {
    console.log(logMessage);
    await sleep(1000);
  }
}

export const spawnContractsNode = async (testChainStateLocation: string, port: number) => {
  if (!process.env.PWD) throw 'could not determine pwd';
  const command = path.join(process.env.PWD, 'substrate-contracts-node');
  const cliArgs = [
    '--dev',
    '--base-path',
    `${testChainStateLocation}`,
    '--rpc-max-connections',
    '1000',
    '--max-runtime-instances',
    '256',
    '--rpc-port',
    port.toString(),
  ];
  const contractsNodeProcess = spawn(command, cliArgs, { cwd: process.env.PWD, stdio: 'overlapped' });

  contractsNodeProcess.on('exit', function (code) {
    if (code === null || code === 0) return code ?? 0;
    throw code;
  });
  contractsNodeProcess.on('error', function (err) {
    throw err;
  });

  const waitForStartupFinish = new Promise<ChildProcess>((resolve) => {
    const endOfBootSequenceStr = `Running JSON-RPC server: addr=127.0.0.1:${port}`;

    contractsNodeProcess.stderr?.on('data', (data: string) => {
      logToFile(data);
      if (data.includes(endOfBootSequenceStr)) {
        resolve(contractsNodeProcess);
      }
    });
    contractsNodeProcess.stdout?.on('data', logToFile);
  });

  await waitForStartupFinish;
  return contractsNodeProcess;
};

export const restartAndRestoreNodeState = async (
  getOldContractsNodeProcess: () => ChildProcess | undefined,
  backupLocation: string,
  port: number,
) => {
  try {
    if (!process.env.PWD) throw 'could not determine pwd';
    await getApiProviderWrapper(port).closeApi();
    const testChainDbLocation = await restoreTestChainState(getOldContractsNodeProcess(), backupLocation);
    const contractsNodeProcess = await spawnContractsNode(testChainDbLocation, port);

    contractsNodeProcess.stderr?.on('data', (data: string) => {
      logToFile(data);
    });
    contractsNodeProcess.stdout?.on('data', logToFile);
    const api = await getApiProviderWrapper(port).getAndWaitForReady();
    await restoreTimestamp(api);
    return () => contractsNodeProcess;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

async function restoreTestChainState(oldContractsNodeProcess: ChildProcess | undefined, backupLocation: string) {
  try {
    if (!process.env.PWD) throw 'could not determine pwd';
    if (oldContractsNodeProcess?.pid) {
      await killProcessAndWaitForExit(oldContractsNodeProcess.pid);
    }

    const testChainStateLocation = `${backupLocation}-in-use`;

    fs.rmSync(testChainStateLocation, { force: true, recursive: true });
    fs.copySync(backupLocation, testChainStateLocation);

    return testChainStateLocation;
  } catch (e) {
    console.log(chalk.yellow(JSON.stringify(e, null, 2)));
    console.log('sleeping for 100ms then retrying...');
    await sleep(100);
    return restoreTestChainState(oldContractsNodeProcess, backupLocation);
  }
}

export async function forceKillProcessOnPort(port: number) {
  const existingProcessesListeningOnPort = await findProcess('port', port, { logLevel: 'error' });
  for (const p of existingProcessesListeningOnPort) {
    console.log(chalk.yellow(`Killing process `) + chalk.magenta(p.name) + `(${chalk.italic(p.cmd)})` + ` occupying test port\n\n`);
    process.kill(p.pid);
    await sleep(50);
  }
}
async function killProcessWithoutHandlingErr(pid: number): Promise<void> {
  return new Promise((resolve) => {
    exec(`kill ${pid}`, () => {
      resolve();
    });
  });
}
export async function killProcessAndWaitForExit(pid: number) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await killProcessWithoutHandlingErr(pid);
    const existingProcess = await findProcess('pid', pid, { logLevel: 'error' });
    if (existingProcess.length === 0) {
      return;
    }
  }
}

export async function storeTimestamp(api: ApiPromise) {
  if (!process.env.PWD) throw 'could not determine pwd';
  const timestampBackupLocation = path.join(process.env.PWD, 'test-chain-timestamp');

  const timestamp = await api.query.timestamp.now();
  if (process.env.DEBUG) console.log(`storing timestamp to: ${timestamp}`);
  fs.writeFileSync(timestampBackupLocation, timestamp.toString());
}

export async function restoreTimestamp(api: ApiPromise): Promise<void> {
  try {
    if (!process.env.PWD) throw 'could not determine pwd';
    const timestampBackupLocation = path.join(process.env.PWD, 'test-chain-timestamp');
    let storedValue;
    if (fs.existsSync(timestampBackupLocation)) {
      storedValue = parseInt(fs.readFileSync(timestampBackupLocation, 'utf-8'), 10);
    }
    if (typeof storedValue === 'number') {
      await setBlockTimestamp(api, storedValue);
    } else {
      // used to push fake_timestamp equal to current timestamp
      await increaseBlockTimestamp(api, 0);
    }
  } catch (error) {
    console.error('Error reading file:', error);
  }
}
