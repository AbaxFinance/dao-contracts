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

export async function queryTGEGetAccountStorage(apiAt: ApiDecoration<'promise'>, contract: any, address: string): Promise<RetTypeFin> {
  return queryAt(apiAt, contract, address, address);
}
