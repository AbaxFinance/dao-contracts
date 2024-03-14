import { ReturnPromiseType } from '@abaxfinance/utils';
import type { ApiDecoration } from '@polkadot/api/types';
import { nobody } from '@polkadot/keyring/pair/nobody';
import BN from 'bn.js';
import { queryAt } from 'tests/setup/queryAt';
import AbaxTgeMethods from 'typechain/query/abax_tge';
type RetType = NonNullable<ReturnPromiseType<AbaxTgeMethods['tgeParameters']>['value']['ok']>;

export async function queryTGEGetStorage(apiAt: ApiDecoration<'promise'>, tge: any) {
  const res = (await queryAt<any>(apiAt, tge, nobody().address, 'AbaxTGEView::tge_parameters', [])) as RetType;
  return {
    startTime: res[0],
    phaseTwoStartTime: res[1],
    phaseTwoDuration: res[2],
    generatedTokenAddress: res[3],
    wazeroAddress: res[4],
    vesterAddress: res[5],
    foundersAddress: res[6],
    foundationAddress: res[7],
    strategicReservesAddress: res[8],
    phaseOneTokenCap: res[9],
    costToMintMillionTokens: res[10],
  };
}

type OnlyBNNullableProperties<T> = {
  [P in keyof T]: T[P] extends BN | null ? T[P] : never;
};
export type OmitType<T, V> = { [K in keyof T as T[K] extends V ? never : K]: T[K] };

export type TgeStorage = ReturnPromiseType<typeof queryTGEGetStorage>;
export type TgeStorageKey = keyof TgeStorage;
export type TgeStorageNumericKey = keyof OmitType<OnlyBNNullableProperties<TgeStorage>, 'never'>;
