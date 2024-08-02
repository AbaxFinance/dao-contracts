import BN from 'bn.js';

export const ABAX_DECIMALS = 12;
export const USDC_DECIMALS = 6;
export const ONE_DAY = new BN(24 * 60 * 60 * 1000);
export const ONE_YEAR = ONE_DAY.mul(new BN(365));
export const MAX_U128 = '340282366920938463463374607431768211455';

export const ContractRoleNames = [
  'DEFAULT_ADMIN',
  'TREASURY',
  'MINTER',
  'BURNER',
  'UPDATER',
  'MANAGER',
  'EXECUTOR',
  'FINALIZER',
  'GENERATOR',
  'UPGRADER',
  'SPENDER',
  'CANCELLER',
  'STAKEDROP_ADMIN',
  'BONUS_ADMIN',
  'REFERRER_ADMIN',
  'PARAMETERS_ADMIN',
] as const;

export const AbaxDAOSpecificRoleNames = ['STAKEDROP_ADMIN'] as const;
export const AllAbaxDAORoleNames = [...ContractRoleNames, ...AbaxDAOSpecificRoleNames] as const;

export type AbaxAccessControlRole = (typeof ContractRoleNames)[number];

export enum AbaxDAOSpecificRoles {
  STAKEDROP_ADMIN = 4_193_574_647,
  CANCELLER = 4_141_332_106,
  SPENDER = 3_684_413_446,
}
