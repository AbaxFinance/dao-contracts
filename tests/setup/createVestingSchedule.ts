import { ReturnPromiseType } from '@abaxfinance/utils';
import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
import { queryAt } from 'tests/setup/queryAt';
import VesterMethods from 'typechain/query/vester';
import { VestingSchedule } from 'typechain/types-returns/abax_tge';
import { getApiAt } from 'wookashwackomytest-polkahat-network-helpers';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';
import type { ApiDecoration } from '@polkadot/api/types';
type RetType = ReturnPromiseType<VesterMethods['vestingScheduleOf']>['value']['ok'];
async function queryVestingScheduleOfAt(
  apiAt: ApiDecoration<'promise'>,
  contract: any,
  vestingScheduleOf: string,
  token: string,
  vest_id: number,
): Promise<RetType> {
  return queryAt(apiAt, contract, vestingScheduleOf, 'GeneralVest::vesting_schedule_of', [vestingScheduleOf, token, vest_id]);
}
async function queryNextIdVestOf(apiAt: ApiDecoration<'promise'>, contract: any, vestingScheduleOf: string, token: string): Promise<number> {
  return parseInt((await queryAt<any>(apiAt, contract, vestingScheduleOf, 'GeneralVest::next_id_vest_of', [vestingScheduleOf, token])).toString());
}

async function createVestingSchedule(
  this: Chai.AssertionPrototype,
  contract: any,
  account: string,
  token: string,
  amount: BN,
  waitingTime: BN,
  vestingTime: BN,
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
  const apiPost = await getApiAt(contract.nativeAPI, postTxBlockNumber);
  const preTxBlockNumber = postTxBlockNumber - 1;

  //get balances pre
  const apiPre = await getApiAt(contract.nativeAPI, preTxBlockNumber);
  const nextIdVestOfPre = await queryNextIdVestOf(apiPre, contract, account, token);
  const nextIdVestOfPost = await queryNextIdVestOf(apiPost, contract, account, token);
  this.assert(
    nextIdVestOfPost === nextIdVestOfPre + 1,
    `expected nextIdVestOf to be ${nextIdVestOfPre + 1} but got ${nextIdVestOfPost}`,
    `expected nextIdVestOf not to be ${nextIdVestOfPre + 1} but got ${nextIdVestOfPost}`,
    nextIdVestOfPre + 1,
    true,
  );
  const postVestingScheduleOf = await queryVestingScheduleOfAt(apiPost, contract, account, token, nextIdVestOfPost);

  this.assert(
    postVestingScheduleOf !== null && postVestingScheduleOf !== undefined,
    `expected vesting schedule of ${account} not to be null or undefined`,
    `expected vesting schedule of ${account} to be null or undefined`,
    true,
  );
  this.assert(
    postVestingScheduleOf?.amount.toString() === amount.toString(),
    `expected amount of ${account} to be ${amount.toString()} but got ${postVestingScheduleOf?.amount.toString()}`,
    `expected amount of ${account} not to be ${amount.toString()} but got ${postVestingScheduleOf?.amount.toString()}`,
    amount.toString(),
    postVestingScheduleOf?.amount.toString(),
    true,
  );
  this.assert(
    postVestingScheduleOf?.released.toString() === new BN(0).toString(),
    `expected released of ${account} to be ${new BN(0).toString()} but got ${postVestingScheduleOf?.released.toString()}`,
    `expected released of ${account} not to be ${new BN(0).toString()} but got ${postVestingScheduleOf?.released.toString()}`,
    new BN(0).toString(),
    postVestingScheduleOf?.released.toString(),
    true,
  );
  this.assert(
    postVestingScheduleOf?.schedule.constant?.[0]?.toString() === waitingTime.toString(),
    `expected constant[0] of ${account} to be ${new BN(0).toString()} but got ${postVestingScheduleOf?.schedule.constant?.[0]?.toString()}`,
    `expected constant[0] of ${account} not to be ${new BN(0).toString()} but got ${postVestingScheduleOf?.schedule.constant?.[0]?.toString()}`,
    new BN(0).toString(),
    postVestingScheduleOf?.schedule.constant?.[0]?.toString(),
    true,
  );
  this.assert(
    postVestingScheduleOf?.schedule.constant?.[1]?.toString() === vestingTime.toString(),
    `expected constant[1] of ${account} to be ${vestingTime.toString()} but got ${postVestingScheduleOf?.schedule.constant?.[1]?.toString()}`,
    `expected constant[1] of ${account} not to be ${vestingTime.toString()} but got ${postVestingScheduleOf?.schedule.constant?.[1]?.toString()}`,
    vestingTime.toString(),
    postVestingScheduleOf?.schedule.constant?.[1]?.toString(),
    true,
  );
}

const CREATE_VESTING_SCHEDULE = 'createVestingSchedule';

export function supportCreateVestingSchedule(Assertion: Chai.AssertionStatic, chaiUtils: Chai.ChaiUtils) {
  Assertion.addMethod(
    CREATE_VESTING_SCHEDULE,
    function (this: Chai.AssertionPrototype, contract: any, account: string, token: string, amount: BN, waitingTime: BN, vestingTime: BN) {
      // preventAsyncMatcherChaining(
      //   this,
      //   CHANGE_TOKEN_BALANCES_MATCHER,
      //   chaiUtils
      // );

      const derivedPromise = createVestingSchedule.apply(this, [contract, account, token, amount, waitingTime, vestingTime]);
      (this as any).then = derivedPromise.then.bind(derivedPromise);
      (this as any).catch = derivedPromise.catch.bind(derivedPromise);

      return this;
    },
  );
}
