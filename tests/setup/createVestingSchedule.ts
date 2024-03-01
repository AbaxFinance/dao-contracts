import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
import { getApiPreAndPostTx } from 'tests/setup/queryAt';
import { queryNextIdVestOfAt, queryVestingScheduleOfAt } from 'tests/setup/queryVester';
import { getApiAt } from 'wookashwackomytest-polkahat-network-helpers';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';

async function createVestingSchedule(
  this: Chai.AssertionPrototype,
  negated: boolean,
  contract: any,
  account: string,
  token: string,
  args?: [amount: BN, waitingTime: BN, vestingTime: BN],
): Promise<void> {
  let tx: SignAndSendSuccessResponse;
  const maybeTx: SignAndSendSuccessResponse | Promise<SignAndSendSuccessResponse> = this._obj;

  if (maybeTx instanceof Promise) {
    tx = await maybeTx;
  } else {
    tx = maybeTx;
  }
  const { apiPre, apiPost } = await getApiPreAndPostTx(tx, contract.nativeAPI as ApiPromise);

  const nextIdVestOfPre = await queryNextIdVestOfAt(apiPre, contract, account, token);
  const nextIdVestOfPost = await queryNextIdVestOfAt(apiPost, contract, account, token);
  this.assert(
    !negated ? nextIdVestOfPost === nextIdVestOfPre + 1 : !(nextIdVestOfPost === nextIdVestOfPre + 1),
    `expected vest to be created - nextIdVestOf should be ${nextIdVestOfPre + 1} but was ${nextIdVestOfPost}`,
    `expected vest not to be created - nextIdVestOf should be ${nextIdVestOfPre} but was ${nextIdVestOfPost + 1}`,
    !negated ? nextIdVestOfPre + 1 : nextIdVestOfPre,
    nextIdVestOfPost,
    true,
  );
  if (!args) return;
  if (negated) throw new Error('negated args not supported');

  const postVestingScheduleOf = await queryVestingScheduleOfAt(apiPost, contract, account, token, nextIdVestOfPost - 1);

  const postVestingScheduleOfIsNotNil = postVestingScheduleOf !== null && postVestingScheduleOf !== undefined;
  this.assert(
    !negated ? postVestingScheduleOfIsNotNil : !postVestingScheduleOfIsNotNil,
    `expected vesting schedule of ${account} not to be null or undefined`,
    `expected vesting schedule of ${account} to be null or undefined`,
    true,
  );

  const [amount, waitingTime, vestingTime] = args;

  this.assert(
    postVestingScheduleOf?.amount?.toString() === amount.toString(),
    `expected amount of ${account} to be ${amount.toString()} but got ${postVestingScheduleOf?.amount?.toString()}`,
    `expected amount of ${account} not to be ${amount.toString()} but got ${postVestingScheduleOf?.amount?.toString()}`,
    amount.toString(),
  );
  this.assert(
    postVestingScheduleOf?.released?.toString() === new BN(0).toString(),
    `expected released of ${account} to be ${new BN(0).toString()} but got ${postVestingScheduleOf?.released?.toString()}`,
    `expected released of ${account} not to be ${new BN(0).toString()} but got ${postVestingScheduleOf?.released?.toString()}`,
    new BN(0).toString(),
    postVestingScheduleOf?.released?.toString(),
    true,
  );
  this.assert(
    postVestingScheduleOf?.schedule?.constant?.[0]?.toString() === waitingTime.toString(),
    `expected constant[0] of ${account} to be ${new BN(0).toString()} but got ${postVestingScheduleOf?.schedule?.constant?.[0]?.toString()}`,
    `expected constant[0] of ${account} not to be ${new BN(0).toString()} but got ${postVestingScheduleOf?.schedule?.constant?.[0]?.toString()}`,
    new BN(0).toString(),
    postVestingScheduleOf?.schedule?.constant?.[0]?.toString(),
    true,
  );
  this.assert(
    postVestingScheduleOf?.schedule?.constant?.[1]?.toString() === vestingTime.toString(),
    `expected constant[1] of ${account} to be ${vestingTime.toString()} but got ${postVestingScheduleOf?.schedule?.constant?.[1]?.toString()}`,
    `expected constant[1] of ${account} not to be ${vestingTime.toString()} but got ${postVestingScheduleOf?.schedule?.constant?.[1]?.toString()}`,
    vestingTime.toString(),
    postVestingScheduleOf?.schedule?.constant?.[1]?.toString(),
    true,
  );
}

const CREATE_VESTING_SCHEDULE = 'createVestingSchedule';

export function supportCreateVestingSchedule(Assertion: Chai.AssertionStatic, chaiUtils: Chai.ChaiUtils) {
  Assertion.addMethod(
    CREATE_VESTING_SCHEDULE,
    function (this: Chai.AssertionPrototype, contract: any, account: string, token: string, args?: [amount: BN, waitingTime: BN, vestingTime: BN]) {
      // preventAsyncMatcherChaining(
      //   this,
      //   CHANGE_TOKEN_BALANCES_MATCHER,
      //   chaiUtils
      // );

      const negated = chaiUtils.flag(this, 'negated');

      const derivedPromise = createVestingSchedule.apply(this, [negated, contract, account, token, args]);
      (this as any).then = derivedPromise.then.bind(derivedPromise);
      (this as any).catch = derivedPromise.catch.bind(derivedPromise);

      return this;
    },
  );
}
