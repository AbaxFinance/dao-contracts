import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
import { getApiAt } from '@c-forge/polkahat-network-helpers';
import { SignAndSendSuccessResponse } from '@c-forge/typechain-types';
import { queryTGEGeneratedBonusAmountBy } from './queryTGE';

async function changeGeneratedBonusAmounts(this: Chai.AssertionPrototype, token: any, addresses: string[], deltas: BN[]): Promise<void> {
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
  const block = await (token.nativeAPI as ApiPromise).rpc.chain.getBlock(tx.blockHash);
  const postTxBlockNumber = block.block.header.number.toNumber();
  const preTxBlockNumber = postTxBlockNumber - 1;

  //get balances pre
  const apiPre = await getApiAt(token.nativeAPI, preTxBlockNumber);
  const preBalances = await Promise.all(addresses.map((address) => queryTGEGeneratedBonusAmountBy(apiPre, token, address)));
  //get balances post
  const apiPost = await getApiAt(token.nativeAPI, postTxBlockNumber);
  const postBalances = await Promise.all(addresses.map((address) => queryTGEGeneratedBonusAmountBy(apiPost, token, address)));
  //check
  for (let i = 0; i < addresses.length; i++) {
    const pre = preBalances[i];
    const post = postBalances[i];
    const delta = deltas[i];
    const expected = pre.add(delta);
    this.assert(
      post.eq(expected),
      `expected reserved token amount of ${addresses[i]} to be ${expected.toString()} but got ${post.toString()}`,
      `expected reserved token amount of ${addresses[i]} not to be ${expected.toString()} but got ${post.toString()}`,
      expected.toString(),
      post.toString(),
      true,
    );
  }
}

const CHANGE_GENERATED_BONUS_AMOUNTS = 'changeGeneratedBonusAmounts';

export function supportchangeGeneratedBonusAmounts(Assertion: Chai.AssertionStatic, chaiUtils: Chai.ChaiUtils) {
  Assertion.addMethod(CHANGE_GENERATED_BONUS_AMOUNTS, function (this: Chai.AssertionPrototype, token: any, addresses: string[], deltas: BN[]) {
    // preventAsyncMatcherChaining(
    //   this,
    //   CHANGE_TOKEN_BALANCES_MATCHER,
    //   chaiUtils
    // );

    const derivedPromise = changeGeneratedBonusAmounts.apply(this, [token, addresses, deltas]);
    (this as any).then = derivedPromise.then.bind(derivedPromise);
    (this as any).catch = derivedPromise.catch.bind(derivedPromise);

    return this;
  });
}
