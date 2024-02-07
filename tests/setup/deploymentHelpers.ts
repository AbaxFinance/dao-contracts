import { ApiPromise } from '@polkadot/api';
import { CodePromise, ContractPromise } from '@polkadot/api-contract';
import { CodeSubmittableResult } from '@polkadot/api-contract/base';
import { KeyringPair } from '@polkadot/keyring/types';
import type { WeightV2 } from '@polkadot/types/interfaces';
import BN from 'bn.js';
import { readFileSync } from 'fs-extra';
import AbaxTge from 'typechain/contracts/abax_tge';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';

import AbaxTgeConstructor from 'typechain/constructors/abax_tge';
import PSP22EmitableConstructor from 'typechain/constructors/psp22_emitable';
import VesterConstructor from 'typechain/constructors/vester';

import { getContractObject } from '@abaxfinance/contract-helpers';
import { ABAX_DECIMALS } from 'tests/consts';
import { getSigners, getSignersWithoutOwner } from './helpers';

const getCodePromise = (api: ApiPromise, contractName: string): CodePromise => {
  const abi = JSON.parse(readFileSync(`./artifacts/${contractName}.json`).toString());
  const wasm = readFileSync(`./artifacts/${contractName}.wasm`);

  return new CodePromise(api, abi, wasm);
};

export const setupContract = async (
  api: ApiPromise,
  signer: KeyringPair,
  contractName: string,
  constructorName: string,
  ...constructorArgs: any[]
) => {
  // maximum gas to be consumed for the instantiation. if limit is too small the instantiation will fail.\
  // eslint-disable-next-line no-magic-numbers
  const MAX_CALL_WEIGHT = new BN(5_000_000_000).isubn(1);
  // eslint-disable-next-line no-magic-numbers
  const PROOFSIZE = new BN(3_000_000);

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
  api: ApiPromise,
  signer: KeyringPair,
  constructor: new (address: string, contractSigner: KeyringPair, nativeAPI: ApiPromise) => T,
  contractName: string,
  ...deployArgs
) => {
  const ret = await setupContract(api, signer, contractName, 'new', ...deployArgs);
  if (process.env.DEBUG) console.log(`Deployed ${contractName}: ${ret.deployedContract.address.toString()}`);
  return getContractObjectWrapper<T>(api, constructor, ret.deployedContract.address.toString(), ret.signer);
};

export const deployAbaxTge = async (api: ApiPromise, owner: KeyringPair) => {
  const deployRet = await new AbaxTgeConstructor(api, owner).new();
  return getContractObjectWrapper(api, AbaxTge, deployRet.address, owner);
};
export const deployVester = async (api: ApiPromise, owner: KeyringPair) => {
  const deployRet = await new VesterConstructor(api, owner).new();
  return getContractObjectWrapper(api, Vester, deployRet.address, owner);
};

export const deployEmitableToken = async (api: ApiPromise, owner: KeyringPair, name: string, decimals: number = 6) => {
  const deployRet = await new PSP22EmitableConstructor(api, owner).new(name, `Reserve ${name} token `, decimals);
  return getContractObjectWrapper(api, PSP22Emitable, deployRet.address, owner);
};

const getContractObjectWrapper = async <T>(
  api: ApiPromise,
  constructor: new (address: string, signer: KeyringPair, apiP: ApiPromise) => T,
  contractAddress: string,
  signerPair: KeyringPair,
) => getContractObject(constructor, contractAddress, signerPair, api);

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
