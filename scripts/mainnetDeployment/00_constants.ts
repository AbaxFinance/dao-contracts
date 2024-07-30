import { time, toE } from '@c-forge/polkahat-network-helpers';
import { nobody } from '@polkadot/keyring/pair/nobody';
import BN from 'bn.js';
import { VotingRules } from 'typechain/types-arguments/governor';

export const FOUNDATION_ADDRESS = nobody().address; //TODO;
export const USDC_ADDRESS = '5FYFojNCJVFR2bBNKfAePZCa72ZcVX5yeTv8K9bzeUo8D83Z';
export const FOUNDERS_ADDRESS = nobody().address; //TODO;

export const TGE_START_TIME = new Date('2024-08-06T00:00:00Z').getTime();
export const PHASE_TWO_DURATION = time.duration.days(90); // 90 days in milliseconds
const ONE_MILLION = 1_000_000;
const ONE_HUNDRED_MILLION = 100 * ONE_MILLION;
export const ABAX_DECIMALS = 12;
const toABAXTokenDecimals = (amount: string | number | BN) => (BN.isBN(amount) ? amount : new BN(amount)).mul(new BN(10).pow(new BN(ABAX_DECIMALS)));
export const PHASE_ONE_TOKEN_CAP = toABAXTokenDecimals(1).mul(new BN(ONE_HUNDRED_MILLION)); // 100 million tokens with 12 decimals
export const COST_TO_MINT_MILLIARD_TOKENS = new BN(ONE_MILLION).divn(25); // in absolute units // 1USDC = 25 ABAX

export const UNSTAKE_PERIOD = time.duration.days(180); // 180 days in milliseconds

export const VOTING_RULES: VotingRules = {
  minimumStakePartE3: toE(3, 0.01),
  proposerDepositPartE3: toE(3, 0.1),
  initialPeriod: time.duration.days(3),
  flatPeriod: time.duration.days(7),
  finalPeriod: time.duration.days(4),
};
