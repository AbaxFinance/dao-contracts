import { KeyringPair } from '@polkadot/keyring/types';
import { ChildProcess } from 'child_process';
import { apiProviderWrapper } from 'tests/setup/helpers';
import { readContractsFromFile, restartAndRestoreNodeState, sleep, storeTimestamp } from 'tests/setup/nodePersistence';
import AbaxTge from '../typechain/contracts/abax_tge';
import PSP22Emitable from '../typechain/contracts/psp22_emitable';
import Vester from '../typechain/contracts/vester';

export interface TestEnv {
  users: KeyringPair[];
  owner: KeyringPair;
  abaxToken: PSP22Emitable;
  tge: AbaxTge;
  vester: Vester;
}

function makeSuiteInternal(
  mode: 'none' | 'skip' | 'only',
  name: string,
  generateTests: (getTestEnv: () => TestEnv) => void,
  skipRegenerateEnvBeforeEach = false,
) {
  let hasAnyStoryStepFailed = false;
  (mode === 'none' ? describe : describe[mode])(`[Scenario Suite] ${name}`, () => {
    let suiteTestEnv: TestEnv;
    let getContractsNodeProcess: () => ChildProcess | undefined = () => undefined;
    before(async () => {
      if (!skipRegenerateEnvBeforeEach) return;

      getContractsNodeProcess = await restartAndRestoreNodeState(getContractsNodeProcess);
      await apiProviderWrapper.getAndWaitForReady();
      suiteTestEnv = await readContractsFromFile();
    });

    beforeEach(async function (this) {
      if (hasAnyStoryStepFailed && skipRegenerateEnvBeforeEach) {
        this.skip();
        return;
      }
      if (skipRegenerateEnvBeforeEach) {
        await apiProviderWrapper.getAndWaitForReady();
        return;
      }

      getContractsNodeProcess = await restartAndRestoreNodeState(getContractsNodeProcess);
      await apiProviderWrapper.getAndWaitForReady();
      suiteTestEnv = await readContractsFromFile();
    });

    generateTests(() => suiteTestEnv);

    afterEach(async function (this) {
      if (this.currentTest?.state === 'failed') {
        hasAnyStoryStepFailed = true;
      }
    });

    after(async () => {
      await apiProviderWrapper.closeApi();
      await storeTimestamp();
      getContractsNodeProcess()?.kill();
    });
  });
}

export function makeSuite(name: string, generateTests: (getTestEnv: () => TestEnv) => void, skipRegenerateEnvBeforeEach = false) {
  makeSuiteInternal('none', name, generateTests, skipRegenerateEnvBeforeEach);
}
makeSuite.only = function (name: string, generateTests: (getTestEnv: () => TestEnv) => void, skipRegenerateEnvBeforeEach = false) {
  makeSuiteInternal('only', name, generateTests, skipRegenerateEnvBeforeEach);
};
makeSuite.skip = function (name: string, generateTests: (getTestEnv: () => TestEnv) => void, skipRegenerateEnvBeforeEach = false) {
  makeSuiteInternal('skip', name, generateTests, skipRegenerateEnvBeforeEach);
};
