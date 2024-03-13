import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
import { getApiPreAndPostTx } from 'tests/setup/queryAt';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';
import { queryNextOrderIdAt, queryOrder } from './queryTreasury';
import { isNil } from 'lodash';

export type psp22Transfer = {
  asset: string;
  to: string;
  amount: BN;
};

export type Vest = {
  receiver: string;
  asset: string | null;
  amount: BN;
  schedule: { constant: [BN, BN] } | { external: { account: string; fallbackValues: [BN, BN] } };
};

export type Operation = { psp22Transfer: psp22Transfer } | { nativeTransfer: { to: string; amount: BN } } | { vest: Vest };

export type Order = {
  earliestExecution: number;
  latestExecution: number;
  operations: Operation[];
};

async function createSpendingOrder(this: Chai.AssertionPrototype, negated: boolean, treasury: any, args: Order[]): Promise<void> {
  let tx: SignAndSendSuccessResponse;
  const maybeTx: SignAndSendSuccessResponse | Promise<SignAndSendSuccessResponse> = this._obj;

  if (maybeTx instanceof Promise) {
    tx = await maybeTx;
  } else {
    tx = maybeTx;
  }
  const { apiPre, apiPost } = await getApiPreAndPostTx(tx, treasury.nativeAPI as ApiPromise);

  const nextOrderIdPre = await queryNextOrderIdAt(apiPre, treasury);
  const nextOrderIdPost = await queryNextOrderIdAt(apiPost, treasury);

  const ordersToCreate = args?.length ?? 0;

  this.assert(
    !negated ? nextOrderIdPost === nextOrderIdPre + ordersToCreate : !(nextOrderIdPost === nextOrderIdPre + ordersToCreate),
    `expected ${ordersToCreate} orders to be created - nextOrderId should be ${nextOrderIdPre + ordersToCreate} but was ${nextOrderIdPost}`,
    `expected vest not to be created - nextIdVestOf should not equal ${nextOrderIdPre + ordersToCreate}`,
    !negated ? nextOrderIdPre + 1 : nextOrderIdPre,
    nextOrderIdPost,
    true,
  );
  if (!args) return;
  if (negated) throw new Error('negated args not supported');

  for (let i = 0; i < ordersToCreate; i++) {
    const id = nextOrderIdPre + i;
    const resultOrder = await queryOrder(apiPost, treasury, id);

    const orderIsNotNill = !isNil(resultOrder);
    this.assert(
      !negated ? orderIsNotNill : !orderIsNotNill,
      `expected order with id ${id} not to be null or undefined`,
      `expected order with id ${id} to be null or undefined`,
      true,
    );
    if (!resultOrder) return;
    this.assert(
      resultOrder?.earliestExecution?.toString() === args[i].earliestExecution.toString(),
      `expected earliestExecution of order with id ${id} to be ${args[
        i
      ].earliestExecution.toString()} but got ${resultOrder?.earliestExecution?.toString()}`,
      `expected earliestExecution of order with id ${id} not to be ${args[
        i
      ]?.earliestExecution.toString()} but got ${resultOrder?.earliestExecution?.toString()}`,
      args[i]?.earliestExecution.toString(),
    );

    this.assert(
      resultOrder?.latestExecution?.toString() === args[i]?.latestExecution.toString(),
      `expected latestExecution of order with id ${id} to be ${args[
        i
      ]?.latestExecution.toString()} but got ${resultOrder?.latestExecution?.toString()}`,
      `expected latestExecution of order with id ${id} not to be ${args[
        i
      ]?.latestExecution.toString()} but got ${resultOrder?.latestExecution?.toString()}`,
      args[i]?.latestExecution.toString(),
    );

    const expectedOperations = args[i]?.operations;
    const operationsCount = expectedOperations?.length ?? 0;
    this.assert(
      resultOrder?.operations?.length === operationsCount,
      `expected order with id ${id} to have ${operationsCount} operations but got ${resultOrder?.operations?.length}`,
      `expected order with id ${id} not to have ${operationsCount} operations but got ${resultOrder?.operations?.length}`,
      operationsCount,
      resultOrder?.operations?.length,
      true,
    );

    for (let j = 0; j < operationsCount; j++) {
      const expectedOperation = expectedOperations[j];
      const resultOperation = resultOrder.operations?.[j];

      if ('psp22Transfer' in expectedOperation) {
        this.assert(
          resultOperation.psp22Transfer?.to?.toString() === expectedOperation.psp22Transfer.to,
          `expected psp22Transfer.to of order with id ${id} to be ${
            expectedOperation.psp22Transfer.to
          } but got ${resultOperation.psp22Transfer?.to?.toString()}`,
          `expected psp22Transfer.to of order with id ${id} not to be ${
            expectedOperation.psp22Transfer.to
          } but got ${resultOperation.psp22Transfer?.to?.toString()}`,
          expectedOperation.psp22Transfer.to,
          resultOperation.psp22Transfer?.to?.toString(),
          true,
        );
        this.assert(
          resultOperation.psp22Transfer?.amount?.toString() === expectedOperation.psp22Transfer.amount.toString(),
          `expected psp22Transfer.amount of order with id ${id} to be ${expectedOperation.psp22Transfer.amount.toString()} but got ${resultOperation.psp22Transfer?.amount?.toString()}`,
          `expected psp22Transfer.amount of order with id ${id} not to be ${expectedOperation.psp22Transfer.amount.toString()} but got ${resultOperation.psp22Transfer?.amount?.toString()}`,
          expectedOperation.psp22Transfer.amount.toString(),
          resultOperation.psp22Transfer?.amount?.toString(),
          true,
        );
      }
      if ('nativeTransfer' in expectedOperation) {
        this.assert(
          resultOperation.nativeTransfer?.to?.toString() === expectedOperation.nativeTransfer.to,
          `expected nativeTransfer.to of order with id ${id} to be ${
            expectedOperation.nativeTransfer.to
          } but got ${resultOperation.nativeTransfer?.to?.toString()}`,
          `expected nativeTransfer.to of order with id ${id} not to be ${
            expectedOperation.nativeTransfer.to
          } but got ${resultOperation.nativeTransfer?.to?.toString()}`,
          expectedOperation.nativeTransfer.to,
          resultOperation.nativeTransfer?.to?.toString(),
          true,
        );
        this.assert(
          resultOperation.nativeTransfer?.amount?.toString() === expectedOperation.nativeTransfer.amount.toString(),
          `expected nativeTransfer.amount of order with id ${id} to be ${expectedOperation.nativeTransfer.amount.toString()} but got ${resultOperation.nativeTransfer?.amount?.toString()}`,
          `expected nativeTransfer.amount of order with id ${id} not to be ${expectedOperation.nativeTransfer.amount.toString()} but got ${resultOperation.nativeTransfer?.amount?.toString()}`,
          expectedOperation.nativeTransfer.amount.toString(),
          resultOperation.nativeTransfer?.amount?.toString(),
          true,
        );
      }
      if ('vest' in expectedOperation) {
        this.assert(
          resultOperation.vest?.receiver?.toString() === expectedOperation.vest.receiver,
          `expected vest.receiver of order with id ${id} to be ${
            expectedOperation.vest.receiver
          } but got ${resultOperation.vest?.receiver?.toString()}`,
          `expected vest.receiver of order with id ${id} not to be ${
            expectedOperation.vest.receiver
          } but got ${resultOperation.vest?.receiver?.toString()}`,
          expectedOperation.vest.receiver,
          resultOperation.vest?.receiver?.toString(),
          true,
        );
        this.assert(
          resultOperation.vest?.amount?.toString() === expectedOperation.vest.amount.toString(),
          `expected vest.amount of order with id ${id} to be ${expectedOperation.vest.amount.toString()} but got ${resultOperation.vest?.amount?.toString()}`,
          `expected vest.amount of order with id ${id} not to be ${expectedOperation.vest.amount.toString()} but got ${resultOperation.vest?.amount?.toString()}`,
          expectedOperation.vest.amount.toString(),
          resultOperation.vest?.amount?.toString(),
          true,
        );
        const schedule = expectedOperation.vest.schedule;
        if ('constant' in schedule) {
          this.assert(
            resultOperation.vest?.schedule?.constant?.[0]?.toString() === schedule.constant[0].toString(),
            `expected vest.schedule.constant[0] of order with id ${id} to be ${schedule.constant[0].toString()} but got ${resultOperation.vest?.schedule?.constant?.[0]?.toString()}`,
            `expected vest.schedule.constant[0] of order with id ${id} not to be ${schedule.constant[0].toString()} but got ${resultOperation.vest?.schedule?.constant?.[0]?.toString()}`,
            schedule.constant[0].toString(),
            resultOperation.vest?.schedule?.constant?.[0]?.toString(),
            true,
          );
          this.assert(
            resultOperation.vest?.schedule?.constant?.[1]?.toString() === schedule.constant[1].toString(),
            `expected vest.schedule.constant[1] of order with id ${id} to be ${schedule.constant[1].toString()} but got ${resultOperation.vest?.schedule?.constant?.[1]?.toString()}`,
            `expected vest.schedule.constant[1] of order with id ${id} not to be ${schedule.constant[1].toString()} but got ${resultOperation.vest?.schedule?.constant?.[1]?.toString()}`,
            schedule.constant[1].toString(),
            resultOperation.vest?.schedule?.constant?.[1]?.toString(),
            true,
          );
        }
        if ('external' in schedule) {
          this.assert(
            resultOperation.vest?.schedule?.external?.account.toString() === schedule.external.account,
            `expected vest.schedule.external of order with id ${id} to be ${
              schedule.external.account
            } but got ${resultOperation.vest?.schedule?.external?.toString()}`,
            `expected vest.schedule.external of order with id ${id} not to be ${
              schedule.external.account
            } but got ${resultOperation.vest?.schedule?.external?.toString()}`,
            schedule.external.account,
            resultOperation.vest?.schedule?.external?.toString(),
            true,
          );
          this.assert(
            resultOperation.vest?.schedule?.external?.fallbackValues?.[0]?.toString() === schedule.external.fallbackValues[0].toString(),
            `expected vest.schedule.external.fallbackValues[0] of order with id ${id} to be ${schedule.external.fallbackValues[0].toString()} but got ${resultOperation.vest?.schedule?.external?.fallbackValues?.[0]?.toString()}`,
            `expected vest.schedule.external.fallbackValues[0] of order with id ${id} not to be ${schedule.external.fallbackValues[0].toString()} but got ${resultOperation.vest?.schedule?.external?.fallbackValues?.[0]?.toString()}`,
            schedule.external.fallbackValues[0].toString(),
            resultOperation.vest?.schedule?.external?.fallbackValues?.[0]?.toString(),
            true,
          );
          this.assert(
            resultOperation.vest?.schedule?.external?.fallbackValues?.[1]?.toString() === schedule.external.fallbackValues[1].toString(),
            `expected vest.schedule.external.fallbackValues[1] of order with id ${id} to be ${schedule.external.fallbackValues[1].toString()} but got ${resultOperation.vest?.schedule?.external?.fallbackValues?.[1]?.toString()}`,
            `expected vest.schedule.external.fallbackValues[1] of order with id ${id} not to be ${schedule.external.fallbackValues[1].toString()} but got ${resultOperation.vest?.schedule?.external?.fallbackValues?.[1]?.toString()}`,
            schedule.external.fallbackValues[1].toString(),
            resultOperation.vest?.schedule?.external?.fallbackValues?.[1]?.toString(),
            true,
          );
        }
      }
    }
  }
}

const CREATE_SPENDING_ORDER = 'createSpendingOrder';

export function supportCreateSpendingOrder(Assertion: Chai.AssertionStatic, chaiUtils: Chai.ChaiUtils) {
  Assertion.addMethod(CREATE_SPENDING_ORDER, function (this: Chai.AssertionPrototype, treasury: any, args: Order[]) {
    // preventAsyncMatcherChaining(
    //   this,
    //   CHANGE_TOKEN_BALANCES_MATCHER,
    //   chaiUtils
    // );

    const negated = chaiUtils.flag(this, 'negated');

    const derivedPromise = createSpendingOrder.apply(this, [negated, treasury, args]);
    (this as any).then = derivedPromise.then.bind(derivedPromise);
    (this as any).catch = derivedPromise.catch.bind(derivedPromise);

    return this;
  });
}
