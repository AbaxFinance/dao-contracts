import { time, toE } from '@c-forge/polkahat-network-helpers';
import { BN } from 'bn.js';
import { VotingRules } from 'typechain/types-arguments/governor';

export const FOUNDATION_ADDRESS = '';
export const USDC_ADDRESS = '';
export const FOUNDERS_ADDRESS = '';
export const TGE_ADMIN_ADDRESS = '';

export const TGE_START_TIME = new Date('2024-06-30T00:00:00Z').getTime();
export const PHASE_TWO_DURATION = time.duration.days(90); // 90 days in milliseconds
const ONE_MILLION = 1_000_000;
const ONE_HUNDRED_MILLION = 100 * ONE_MILLION;
export const ABAX_DECIMALS = 12;
export const PHASE_ONE_TOKEN_CAP = new BN(ONE_HUNDRED_MILLION).pow(new BN(ABAX_DECIMALS)); // 100 million tokens with 12 decimals
export const COST_TO_MINT_MILLIARD_TOKENS = new BN(ONE_MILLION).divn(25); // in absolute units // 1USDC = 25 ABAX

export const UNSTAKE_PERIOD = time.duration.days(180); // 180 days in milliseconds

export const VOTING_RULES: VotingRules = {
  minimumStakePartE3: toE(3, 0.01),
  proposerDepositPartE3: toE(3, 0.1),
  initialPeriod: time.duration.days(3),
  flatPeriod: time.duration.days(7),
  finalPeriod: time.duration.days(4),
};
