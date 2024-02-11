import BN from 'bn.js';

export const ABAX_DECIMALS = 12;
export const AZERO_DECIMALS = 12;
export const ONE_DAY = new BN(24 * 60 * 60 * 1000);
export const ONE_YEAR = ONE_DAY.mul(new BN(365));
export const MAX_U128 = '340282366920938463463374607431768211455';
