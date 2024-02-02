import { ApiPromise } from '@polkadot/api';
import { CodePromise, ContractPromise } from '@polkadot/api-contract';
import { CodeSubmittableResult } from '@polkadot/api-contract/base';
import { KeyringPair } from '@polkadot/keyring/types';
import type { WeightV2 } from '@polkadot/types/interfaces';
import BN from 'bn.js';
import { readFileSync } from 'fs-extra';
import { TestEnv } from 'tests/make-suite';
import AbaxTge from 'typechain/contracts/abax_tge';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';

import AbaxTgeConstructor from 'typechain/constructors/abax_tge';
import PSP22EmitableConstructor from 'typechain/constructors/psp22_emitable';
import VesterConstructor from 'typechain/constructors/vester';

import { getContractObject } from '@abaxfinance/contract-helpers';
import { ABAX_DECIMALS } from 'tests/consts';
import { apiProviderWrapper, getSigners, getSignersWithoutOwner } from './helpers';
import { saveContractInfoToFileAsJson } from './nodePersistence';

const getCodePromise = (api: ApiPromise, contractName: string): CodePromise => {
  const abi = JSON.parse(readFileSync(`./artifacts/${contractName}.json`).toString());
  const wasm = readFileSync(`./artifacts/${contractName}.wasm`);

  return new CodePromise(api, abi, wasm);
};

export const setupContract = async (signer: KeyringPair, contractName: string, constructorName: string, ...constructorArgs: any[]) => {
  // maximum gas to be consumed for the instantiation. if limit is too small the instantiation will fail.\
  // eslint-disable-next-line no-magic-numbers
  const MAX_CALL_WEIGHT = new BN(5_000_000_000).isubn(1);
  // eslint-disable-next-line no-magic-numbers
  const PROOFSIZE = new BN(3_000_000);

  const api = await apiProviderWrapper.getAndWaitForReady();
  const codePromise = getCodePromise(api, contractName);
  const gasLimit = api?.registry.createType('WeightV2', {
    refTime: MAX_CALL_WEIGHT,
    proofSize: PROOFSIZE,
  }) as WeightV2;

  // const milion = 1000000n;
  // const gasLimit = milion * milion;
  // const gasLimit = 3000n * 1000000n;
  // const gasLimitFromNetwork = api.consts.system.blockWeights
  //   ? (api.consts.system.blockWeights as unknown as { maxBlock: WeightV1 }).maxBlock
  //   : (api.consts.system.maximumBlockWeight as unknown as WeightV1);
  // // a limit to how much Balance to be used to pay for the storage created by the instantiation
  // if null is passed, unlimited balance can be used

  // const storageDepositLimit = null;

  // used to derive contract address,
  // use null to prevent duplicate contracts
  // const salt = new Uint8Array();

  const deployedContract = await new Promise<ContractPromise>((resolve, reject) => {
    let unsub: () => void;
    const tx = codePromise.tx[constructorName](
      {
        storageDepositLimit: null,
        // gasLimit: new BN(gasLimitFromNetwork.toString()).divn(2),
        gasLimit,
        salt: undefined,
        value: undefined,
      },
      ...constructorArgs,
    );
    tx.signAndSend(signer, (result: CodeSubmittableResult<'promise'>) => {
      const { status, dispatchError, contract } = result;
      if (status.isInBlock) {
        if (dispatchError || !contract) {
          reject(dispatchError?.toString());
        } else {
          resolve(contract);
        }

        unsub();
      }
    })
      .then((_unsub) => {
        unsub = _unsub;
      })
      .catch(reject);
  });

  return { signer, deployedContract };
};

export const deployWithLog = async <T>(
  signer: KeyringPair,
  constructor: new (address: string, contractSigner: KeyringPair, nativeAPI: ApiPromise) => T,
  contractName: string,
  ...deployArgs
) => {
  const ret = await setupContract(signer, contractName, 'new', ...deployArgs);
  if (process.env.DEBUG) console.log(`Deployed ${contractName}: ${ret.deployedContract.address.toString()}`);
  return getContractObjectWrapper<T>(constructor, ret.deployedContract.address.toString(), ret.signer);
};

export const deployAbaxTge = async (owner: KeyringPair) => {
  const deployRet = await new AbaxTgeConstructor(await apiProviderWrapper.getAndWaitForReady(), owner).new();
  return getContractObjectWrapper(AbaxTge, deployRet.address, owner);
};
export const deployVester = async (owner: KeyringPair) => {
  const deployRet = await new VesterConstructor(await apiProviderWrapper.getAndWaitForReady(), owner).new();
  return getContractObjectWrapper(Vester, deployRet.address, owner);
};

export const deployEmitableToken = async (owner: KeyringPair, name: string, decimals: number = 6) => {
  const deployRet = await new PSP22EmitableConstructor(await apiProviderWrapper.getAndWaitForReady(), owner).new(
    name,
    `Reserve ${name} token `,
    decimals,
  );
  return getContractObjectWrapper(PSP22Emitable, deployRet.address, owner);
};

const getContractObjectWrapper = async <T>(
  constructor: new (address: string, signer: KeyringPair, api: ApiPromise) => T,
  contractAddress: string,
  signerPair: KeyringPair,
) => getContractObject(constructor, contractAddress, signerPair, await apiProviderWrapper.getAndWaitForReady());

export interface ProductionDeploymentParams {
  owner: KeyringPair;
}

export type DeploymentConfig = {
  owner: KeyringPair;
  users: KeyringPair[];
};
export const DEFAULT_TEST_DEPLOYMENT_CONFIG: DeploymentConfig = {
  owner: getSigners()[0],
  users: getSignersWithoutOwner(getSigners(), 0),
};

export const deployAndConfigureSystem = async (
  deploymentConfigOverrides: Partial<DeploymentConfig> = DEFAULT_TEST_DEPLOYMENT_CONFIG,
  saveConfigToFilePath?: string,
): Promise<TestEnv> => {
  const config: DeploymentConfig = {
    ...DEFAULT_TEST_DEPLOYMENT_CONFIG,
    ...deploymentConfigOverrides,
  };

  const { owner, users } = config;

  const tge = await deployAbaxTge(owner);

  const abaxToken = await deployEmitableToken(owner, 'ABAX', ABAX_DECIMALS);

  const vester = await deployVester(owner);
  const testEnv: TestEnv = {
    users: users,
    owner,
    tge,
    abaxToken,
    vester,
  };

  if (saveConfigToFilePath) {
    await saveConfigToFile(testEnv, saveConfigToFilePath);
  }
  return testEnv;
};

async function saveConfigToFile(testEnv: TestEnv, writePath: string) {
  await saveContractInfoToFileAsJson(
    [
      {
        name: testEnv.tge.name,
        address: testEnv.tge.address,
      },
      {
        name: testEnv.abaxToken.name,
        address: testEnv.abaxToken.address,
      },
      {
        name: testEnv.vester.name,
        address: testEnv.vester.address,
      },
    ],
    writePath,
  );
}
