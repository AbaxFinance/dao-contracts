import BN from 'bn.js';

export const ABAX_DECIMALS = 12;
export const AZERO_DECIMALS = 12;
export const ONE_DAY = new BN(24 * 60 * 60 * 1000);
export const ONE_YEAR = ONE_DAY.mul(new BN(365));
export const MAX_U128 = '340282366920938463463374607431768211455';

export enum ContractRole {
  DEFAULT_ADMIN = 0,
  GLOBAL_ADMIN = 2_459_877_095,
  TREASURY = 2_434_241_257,
  MINTER = 4_254_773_782,
  BURNER = 1_711_057_910,
  UPDATER = 2_546_860_072,
  MANAGER = 1_940_245_101,
  EXECUTOR = 3_551_554_066,
  FINALIZER = 3_361_999_854,
  GENERATOR = 3_883_411_479,
  CODE_UPDATER = 737462621,
  SPENDER = 3_684_413_446,
  CANCELLER = 4_141_332_106,
}

export const ContractRoleNames = [
  'GLOBAL_ADMIN',
  'TREASURY',
  'MINTER',
  'BURNER',
  'UPDATER',
  'MANAGER',
  'EXECUTOR',
  'FINALIZER',
  'GENERATOR',
  'CODE_UPDATER',
] as const;

export const AbaxDAOSpecificRoleNames = ['STAKEDROP_ADMIN'] as const;
export const AllAbaxDAORoleNames = [...ContractRoleNames, ...AbaxDAOSpecificRoleNames] as const;

export enum AbaxDAOSpecificRoles {
  STAKEDROP_ADMIN = 4_193_574_647,
  CANCELLER = 4_141_332_106,
  SPENDER = 3_684_413_446,
}
