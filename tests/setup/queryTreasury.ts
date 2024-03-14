import { ReturnPromiseType } from '@abaxfinance/utils';
import type { ApiDecoration } from '@polkadot/api/types';
// import { nobody } from '@polkadot/keyring/pair/nobody';
import { queryAt } from 'tests/setup/queryAt';
// import EVENT_DATA_TYPE_DESCRIPTIONS from 'typechain/event-data/abax_treasury.json';
import AbaxTreasuryMethods from 'typechain/query/abax_treasury';
import { getSigners } from 'wookashwackomytest-polkahat-network-helpers';
// import { getTypeDescription, handleReturnType } from 'wookashwackomytest-typechain-types';

const alice = getSigners()[0];

type RetType = ReturnPromiseType<AbaxTreasuryMethods['order']>['value']['ok'];
export async function queryOrder(apiAt: ApiDecoration<'promise'>, contract: any, order_id: number): Promise<RetType> {
  const res = await queryAt<any>(apiAt, contract, alice.address, 'AbaxTreasuryView::order', [order_id]);
  // return handleReturnType(res.value.toJSON(), getTypeDescription(55, EVENT_DATA_TYPE_DESCRIPTIONS));
  return res.value.toPrimitive();
}

export async function queryNextOrderIdAt(apiAt: ApiDecoration<'promise'>, contract: any): Promise<number> {
  return parseInt((await queryAt<any>(apiAt, contract, alice.address, 'AbaxTreasuryView::next_order_id', [])).toString());
}
