import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
import { getApiAt, getSigners } from 'wookashwackomytest-polkahat-network-helpers';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';
import { queryAt } from './queryAt';

const alice = getSigners()[0];

export async function changeBNResults(this: Chai.AssertionPrototype, contract: any, methodName: string, args: any[][], deltas: BN[]): Promise<void> {
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

  //get balances pre
  const apiPre = await getApiAt(contract.nativeAPI, preTxBlockNumber);
  const preBalances = await Promise.all(args.map((arg) => queryAt<BN>(apiPre, contract, alice.address, methodName, arg)));
  //get balances post
  const apiPost = await getApiAt(contract.nativeAPI, postTxBlockNumber);
  const postBalances = await Promise.all(args.map((arg) => queryAt<BN>(apiPost, contract, alice.address, methodName, arg)));
  //check
  for (let i = 0; i < args.length; i++) {
    const pre = preBalances[i];
    const post = postBalances[i];
    const delta = deltas[i];
    const expected = pre.add(delta);
    this.assert(
      post.eq(expected),
      `expected result of ${i}-th args to be ${expected.toString()} but got ${post.toString()}`,
      `expected result of ${i}-th args not to be ${expected.toString()} but got ${post.toString()}`,
      expected.toString(),
      post.toString(),
      true,
    );
  }
}

const CHANGE_BN_RESULTS = 'changeBNResults';

export function supportChangeBNResults(Assertion: Chai.AssertionStatic, chaiUtils: Chai.ChaiUtils) {
  Assertion.addMethod(CHANGE_BN_RESULTS, function (this: Chai.AssertionPrototype, contract: any, methodName: string, args: any[][], deltas: BN[]) {
    // preventAsyncMatcherChaining(
    //   this,
    //   CHANGE_TOKEN_BALANCES_MATCHER,
    //   chaiUtils
    // );

    const derivedPromise = changeBNResults.apply(this, [contract, methodName, args, deltas]);
    (this as any).then = derivedPromise.then.bind(derivedPromise);
    (this as any).catch = derivedPromise.catch.bind(derivedPromise);

    return this;
  });
}
