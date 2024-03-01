import { ReturnPromiseType } from '@abaxfinance/utils';
import type { ApiDecoration } from '@polkadot/api/types';
import { queryAt } from 'tests/setup/queryAt';
import VesterMethods from 'typechain/query/vester';
type RetType = ReturnPromiseType<VesterMethods['vestingScheduleOf']>['value']['ok'];
export async function queryVestingScheduleOfAt(
  apiAt: ApiDecoration<'promise'>,
  contract: any,
  vestingScheduleOf: string,
  token: string,
  vest_id: number,
): Promise<RetType> {
  const res = await queryAt<any>(apiAt, contract, vestingScheduleOf, 'GeneralVest::vesting_schedule_of', [vestingScheduleOf, token, vest_id, []]);
  return res.value.toPrimitive();
}
export async function queryNextIdVestOfAt(apiAt: ApiDecoration<'promise'>, contract: any, vestingScheduleOf: string, token: string): Promise<number> {
  return parseInt(
    (await queryAt<any>(apiAt, contract, vestingScheduleOf, 'GeneralVest::next_id_vest_of', [vestingScheduleOf, token, []])).toString(),
  );
}
