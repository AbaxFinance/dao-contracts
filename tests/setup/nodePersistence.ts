import chalk from 'chalk';
import { ChildProcess, spawn } from 'child_process';
import findProcess from 'find-process';
import fs from 'fs-extra';
import path from 'path';
import AbaxTge from '../../typechain/contracts/abax_tge';
import Vester from '../../typechain/contracts/vester';
import PSP22Emitable from '../../typechain/contracts/psp22_emitable';
import { apiProviderWrapper, getSigners } from './helpers';
import { getContractObject } from '@abaxfinance/contract-helpers';
import { TestEnv } from 'tests/make-suite';
import { increaseBlockTimestamp, setBlockTimestamp } from 'tests/misc';

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

const spawnContractsNode = async (testChainStateLocation: string) => {
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
    '9944',
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
    const endOfBootSequenceStr = `Running JSON-RPC server: addr=127.0.0.1:9944`;

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

export const restartAndRestoreNodeState = async (getOldContractsNodeProcess: () => ChildProcess | undefined) => {
  try {
    if (!process.env.PWD) throw 'could not determine pwd';
    const testChainStateLocation = path.join(process.env.PWD, 'test-chain-state');
    await apiProviderWrapper.closeApi();
    await restoreTestChainState(getOldContractsNodeProcess(), testChainStateLocation);
    const contractsNodeProcess = await spawnContractsNode(testChainStateLocation);

    contractsNodeProcess.stderr?.on('data', (data: string) => {
      logToFile(data);
    });
    contractsNodeProcess.stdout?.on('data', logToFile);

    await apiProviderWrapper.getAndWaitForReady();
    await restoreTimestamp();
    return () => contractsNodeProcess;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const readContractsFromFile = async (writePath = DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH): Promise<TestEnv> => {
  const api = await apiProviderWrapper.getAndWaitForReady();
  const contracts = JSON.parse(await fs.readFile(writePath, 'utf8')) as StoredContractInfo[];

  const [owner, ...users] = getSigners();

  const abaxTokenContractInfo = contracts.find((c) => c.name === 'psp22_emitable');
  if (!abaxTokenContractInfo) throw 'AbaxToken ContractInfo not found';
  const abaxToken = await getContractObject(PSP22Emitable, abaxTokenContractInfo.address!, owner, api);

  const tgeContractInfo = contracts.find((c) => c.name === 'abax_tge');
  if (!tgeContractInfo) throw 'BalanceViewer ContractInfo not found';
  const tge = await getContractObject(AbaxTge, tgeContractInfo.address!, owner, api);

  const vesterInfo = contracts.find((c) => c.name === 'vester');
  if (!vesterInfo) throw 'Vester ContractInfo not found';
  const vester = await getContractObject(Vester, vesterInfo.address!, owner, api);

  return {
    users: users,
    owner,
    abaxToken,
    tge,
    vester,
  };
};

async function restoreTestChainState(oldContractsNodeProcess: ChildProcess | undefined, testChainStateLocation: string) {
  try {
    if (!process.env.PWD) throw 'could not determine pwd';
    const backupLocation = path.join(process.env.PWD, 'test-chain-state-bp');
    if (oldContractsNodeProcess) {
      oldContractsNodeProcess.kill();
    }

    const existingProcessesListeningOnPort = await findProcess('port', 9944, { logLevel: 'error' });
    for (const p of existingProcessesListeningOnPort) {
      console.log(chalk.yellow(`Killing process `) + chalk.magenta(p.name) + `(${chalk.italic(p.cmd)})` + ` occupying test port\n\n`);
      process.kill(p.pid);
      await sleep(50);
    }

    fs.rmSync(testChainStateLocation, { force: true, recursive: true });
    fs.copySync(backupLocation, testChainStateLocation);
  } catch (e) {
    console.log(chalk.yellow(JSON.stringify(e, null, 2)));
    console.log('sleeping for 100ms then retrying...');
    await sleep(100);
    restoreTestChainState(oldContractsNodeProcess, testChainStateLocation);
  }
}

export async function storeTimestamp() {
  if (!process.env.PWD) throw 'could not determine pwd';
  const timestampBackupLocation = path.join(process.env.PWD, 'test-chain-timestamp');

  const api = await apiProviderWrapper.getAndWaitForReady();
  const timestamp = await api.query.timestamp.now();
  if (process.env.DEBUG) console.log(`storing timestamp to: ${timestamp}`);
  fs.writeFileSync(timestampBackupLocation, timestamp.toString());
}

export async function restoreTimestamp(): Promise<void> {
  try {
    if (!process.env.PWD) throw 'could not determine pwd';
    const timestampBackupLocation = path.join(process.env.PWD, 'test-chain-timestamp');
    let storedValue;
    if (fs.existsSync(timestampBackupLocation)) {
      storedValue = parseInt(fs.readFileSync(timestampBackupLocation, 'utf-8'), 10);
    }
    if (typeof storedValue === 'number') {
      await setBlockTimestamp(storedValue);
    } else {
      // used to push fake_timestamp equal to current timestamp
      await increaseBlockTimestamp(0);
    }
  } catch (error) {
    console.error('Error reading file:', error);
  }
}
