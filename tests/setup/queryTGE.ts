import { ReturnPromiseType } from '@abaxfinance/utils';
import type { ApiDecoration } from '@polkadot/api/types';
import BN from 'bn.js';
import { queryAt } from 'tests/setup/queryAt';
import AbaxTgeMethods from 'typechain/query/abax_tge';
import { getSigners } from 'wookashwackomytest-polkahat-network-helpers';

const alice = getSigners()[0];

type TotalAmountMintedRetType = NonNullable<ReturnPromiseType<AbaxTgeMethods['totalAmountMinted']>['value']['ok']>;
export async function queryTGETotalAmountMinted(apiAt: ApiDecoration<'promise'>, contract: any): Promise<TotalAmountMintedRetType> {
  const res = await queryAt<TotalAmountMintedRetType>(apiAt, contract, alice.address, 'AbaxTgeView::total_amount_minted', []);
  return res;
}

type ExpBonusMultiplierOfE3RetType = NonNullable<ReturnPromiseType<AbaxTgeMethods['expBonusMultiplierOfE3']>['value']['ok']>;
export async function queryTGEExpBonusMultiplierOfE3(apiAt: ApiDecoration<'promise'>, contract: any): Promise<ExpBonusMultiplierOfE3RetType> {
  const res = await queryAt<ExpBonusMultiplierOfE3RetType>(apiAt, contract, alice.address, 'AbaxTgeView::exp_bonus_multiplier_of_e3', []);
  return res;
}

type ContributedAmountByRetType = NonNullable<ReturnPromiseType<AbaxTgeMethods['contributedAmountBy']>['value']['ok']>;
export async function queryTGEContributedAmountBy(
  apiAt: ApiDecoration<'promise'>,
  contract: any,
  address: string,
): Promise<ContributedAmountByRetType> {
  const res = await queryAt<ContributedAmountByRetType>(apiAt, contract, alice.address, 'AbaxTGEView::contributed_amount_by', [address]);
  return res;
}

type GeneratedBaseAmountByRetType = NonNullable<ReturnPromiseType<AbaxTgeMethods['generatedBaseAmountBy']>['value']['ok']>;
export async function queryTGEGeneratedBaseAmountBy(
  apiAt: ApiDecoration<'promise'>,
  contract: any,
  address: string,
): Promise<GeneratedBaseAmountByRetType> {
  const res = await queryAt<GeneratedBaseAmountByRetType>(apiAt, contract, alice.address, 'AbaxTGEView::generated_base_amount_by', [address]);
  return res;
}

type GeneratedBonusAmountByRetType = NonNullable<ReturnPromiseType<AbaxTgeMethods['generatedBonusAmountBy']>['value']['ok']>;
export async function queryTGEGeneratedBonusAmountBy(
  apiAt: ApiDecoration<'promise'>,
  contract: any,
  address: string,
): Promise<GeneratedBonusAmountByRetType> {
  const res = await queryAt<GeneratedBonusAmountByRetType>(apiAt, contract, alice.address, 'AbaxTGEView::generated_bonus_amount_by', [address]);
  return res;
}

type ReservedForRetType = NonNullable<ReturnPromiseType<AbaxTgeMethods['reservedFor']>['value']['ok']>;
export async function queryTGEReservedFor(apiAt: ApiDecoration<'promise'>, contract: any, address: string): Promise<ReservedForRetType> {
  const res = await queryAt<ReservedForRetType>(apiAt, contract, alice.address, 'AbaxTGEView::reserved_for', [address]);
  return res;
}
