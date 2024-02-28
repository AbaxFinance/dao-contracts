import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
import { queryTGEGetAccountStorage } from 'tests/setup/queryTGEGetAccountStorage';
import { TgeStorage, TgeStorageNumericKey, queryTGEGetStorage } from 'tests/setup/queryTGEGetStorage';
import { getApiAt } from 'wookashwackomytest-polkahat-network-helpers';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';

async function changeTgeStorage<TKey extends TgeStorageNumericKey>(
  this: Chai.AssertionPrototype,
  contract: any,
  key: TKey,
  delta: BN,
): Promise<void> {
  //

  let tx: SignAndSendSuccessResponse;
  const maybeTx: SignAndSendSuccessResponse | Promise<SignAndSendSuccessResponse> = this._obj;

  if (maybeTx instanceof Promise) {
    tx = await maybeTx;
  } else {
    tx = maybeTx;
  }
  if (!tx.blockHash) {
    throw new Error('blockHash is not defined');
  }
  const block = await (contract.nativeAPI as ApiPromise).rpc.chain.getBlock(tx.blockHash);
  const postTxBlockNumber = block.block.header.number.toNumber();
  const preTxBlockNumber = postTxBlockNumber - 1;

  //get tge storage pre
  const apiPre = await getApiAt(contract.nativeAPI, preTxBlockNumber);
  const preTgeStorage = await queryTGEGetStorage(apiPre, contract);
  //get tge storage post
  const apiPost = await getApiAt(contract.nativeAPI, postTxBlockNumber);
  const postTgeStorage = await queryTGEGetStorage(apiPost, contract);

  //check
  const pre = preTgeStorage[key];
  const post = postTgeStorage[key];
  if (key.endsWith('Address')) {
    throw new Error('changeTgeStorage does not support address keys');
  }
  const expected = pre?.add(delta);
  const actualDelta = post?.sub(pre ?? new BN(0));
  this.assert(
    actualDelta?.eq(delta),
    `expected ${key} change to be ${delta.toString()} but was ${actualDelta?.toString()}. Balance before: ${pre?.toString()}, balance after: ${post?.toString()}`,
    `expected ${key} change not to be ${delta.toString()} but was ${actualDelta?.toString()}. Balance before: ${pre?.toString()}, balance after: ${post?.toString()}`,
    delta.toString(),
    actualDelta?.toString(),
    true,
  );
}

const CHANGE_TGE_STORAGE = 'changeTgeStorage';

export function supportChangeTgeStorage(Assertion: Chai.AssertionStatic, chaiUtils: Chai.ChaiUtils) {
  Assertion.addMethod(CHANGE_TGE_STORAGE, function <
    TKey extends TgeStorageNumericKey,
  >(this: Chai.AssertionPrototype, contract: any, key: TKey, delta: BN) {
    // preventAsyncMatcherChaining(
    //   this,
    //   CHANGE_TOKEN_BALANCES_MATCHER,
    //   chaiUtils
    // );

    const derivedPromise = changeTgeStorage.apply(this, [contract, key, delta]);
    (this as any).then = derivedPromise.then.bind(derivedPromise);
    (this as any).catch = derivedPromise.catch.bind(derivedPromise);

    return this;
  });
}
