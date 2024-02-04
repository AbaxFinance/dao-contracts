import { ApiPromise } from '@polkadot/api';
import { ChildProcess } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { increaseBlockTimestamp, transferNoop } from 'tests/misc';
import { getApiProviderWrapper } from 'tests/setup/helpers';
import { killProcessAndWaitForExit, restartAndRestoreNodeState, spawnContractsNode, storeTimestamp } from 'tests/setup/nodePersistence';
import { describe as mochaDescribe } from 'mocha';

export interface TestEnv<T extends Record<string, unknown>> {
  api: ApiPromise;
  contracts: T;
}

let NEXT_FREE_PORT = 9944;
const SUITE_ID_TO_PORT = new Map<string, number>();

export const TEST_CHAIN_DATA_LOCATION = path.join(process.env.PWD!, 'test-chain-data');

async function handlePrepareEnv<T>(suiteID: string, parentSuiteID?: string, prepareEnv?: (api: ApiPromise) => Promise<T>) {
  const testChainTmpStateLocation = path.join(TEST_CHAIN_DATA_LOCATION, `${suiteID}_tmp`);
  if (parentSuiteID) {
    fs.copySync(path.join(TEST_CHAIN_DATA_LOCATION, parentSuiteID), testChainTmpStateLocation);
    const apiProviderWrapper = getApiProviderWrapper(SUITE_ID_TO_PORT.get(parentSuiteID)!);
    await apiProviderWrapper.closeApi();
  }

  const contractsNodeProcess = await spawnContractsNode(testChainTmpStateLocation, SUITE_ID_TO_PORT.get(suiteID)!);

  const apiProviderWrapper = getApiProviderWrapper(SUITE_ID_TO_PORT.get(suiteID)!);
  const api = await apiProviderWrapper.getAndWaitForReady();
  // to force mining first block and initializeing timestamp
  await transferNoop(api);
  // to force using fake_time
  await increaseBlockTimestamp(api, 0);

  let contractsRes = {} as T;
  if (prepareEnv) {
    contractsRes = await prepareEnv(api);
  }

  await storeTimestamp(api);

  const testChainBpStateTargetLocation = path.join(TEST_CHAIN_DATA_LOCATION, parentSuiteID ? `${parentSuiteID}_${suiteID}` : suiteID);
  if (contractsNodeProcess.pid) await killProcessAndWaitForExit(contractsNodeProcess.pid);
  await apiProviderWrapper.closeApi();
  fs.copySync(testChainTmpStateLocation, testChainBpStateTargetLocation);
  fs.rmSync(testChainTmpStateLocation, { force: true, recursive: true });
  return { contracts: contractsRes, testChainBpStateLocation: testChainBpStateTargetLocation };
}

type SuiteInfo = {
  suiteID: string;
  nodeProcessPID: string;
};

function describeInternal<T extends Record<string, unknown>>(
  mode: 'none' | 'skip' | 'only',
  name: string,
  generateTests: (getTestEnv: () => TestEnv<T>) => void,
  prepareEnvBase?: (api: ApiPromise) => Promise<T>,
) {
  const suiteID = Math.random().toString(36).substring(7);
  (mode === 'none' ? mochaDescribe : mochaDescribe[mode])(name, function (this) {
    let prepareEnvRes: { contracts: T; testChainBpStateLocation: string };
    let suiteTestEnv: TestEnv<T>;
    let getContractsNodeProcess: () => ChildProcess | undefined = () => undefined;

    before(async () => {
      const parentSuiteInfo = (this.parent as any).suiteInfo;
      console.log('parentSuiteInfo', parentSuiteInfo);

      SUITE_ID_TO_PORT.set(suiteID, NEXT_FREE_PORT);
      NEXT_FREE_PORT++;
      prepareEnvRes = await handlePrepareEnv(suiteID, parentSuiteInfo?.suiteID, prepareEnvBase);
    });

    beforeEach(async () => {
      getContractsNodeProcess = await restartAndRestoreNodeState(
        getContractsNodeProcess,
        prepareEnvRes.testChainBpStateLocation,
        SUITE_ID_TO_PORT.get(suiteID)!,
      );

      const apiProviderWrapper = getApiProviderWrapper(SUITE_ID_TO_PORT.get(suiteID)!);
      const api = await apiProviderWrapper.getAndWaitForReady();
      suiteTestEnv = {
        api,
        contracts: Object.fromEntries(Object.entries(prepareEnvRes.contracts).map(([key, value]) => [key, (value as any).withAPI(api)]) as any) as T,
      };
      (this as any).suiteInfo = { suiteID, nodeProcessPID: getContractsNodeProcess()?.pid?.toString() } as SuiteInfo;
    });

    generateTests(() => suiteTestEnv);

    after(async () => {
      const apiProviderWrapper = getApiProviderWrapper(SUITE_ID_TO_PORT.get(suiteID)!);
      await apiProviderWrapper.closeApi();
      const p = getContractsNodeProcess();
      if (p?.pid) killProcessAndWaitForExit(p?.pid);
    });
  });
}

export function describe<T extends Record<string, unknown>>(
  name: string,
  generateTests: (getTestEnv: () => TestEnv<T>) => void,
  prepareEnvBase?: (api: ApiPromise) => Promise<T>,
) {
  describeInternal('none', name, generateTests, prepareEnvBase);
}
describe.only = function <T extends Record<string, unknown>>(
  name: string,
  generateTests: (getTestEnv: () => TestEnv<T>) => void,
  prepareEnvBase?: (api: ApiPromise) => Promise<T>,
) {
  describeInternal('only', name, generateTests, prepareEnvBase);
};
describe.skip = function <T extends Record<string, unknown>>(
  name: string,
  generateTests: (getTestEnv: () => TestEnv<T>) => void,
  prepareEnvBase?: (api: ApiPromise) => Promise<T>,
) {
  describeInternal('skip', name, generateTests, prepareEnvBase);
};
