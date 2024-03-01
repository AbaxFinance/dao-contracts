import { ReturnPromiseType } from '@abaxfinance/utils';
import type { ApiDecoration } from '@polkadot/api/types';
import BN from 'bn.js';
import { queryAt } from 'tests/setup/queryAt';
import AbaxTgeMethods from 'typechain/query/abax_tge';
type RetType = NonNullable<ReturnPromiseType<AbaxTgeMethods['getAccountStorage']>['value']['ok']>;
type ExtractRawNumbers<T> = {
  [P in keyof T]: T[P] extends { rawNumber: BN } ? T[P]['rawNumber'] : never;
};
type RetTypeFin = ExtractRawNumbers<RetType>;

export async function queryTGEGetAccountStorage(apiAt: ApiDecoration<'promise'>, contract: any, address: string) {
  const res = await queryAt<RetTypeFin>(apiAt, contract, address, 'get_account_storage', [address]);
  return {
    reservedTokens: res[0],
    contributedAmount: res[1],
    baseAmountCreated: res[2],
    bonusAmountCreated: res[3],
  };
}
