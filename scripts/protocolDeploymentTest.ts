import '@polkadot/api-augment';
import '@polkadot/rpc-augment';
import { getArgvObj } from '@abaxfinance/utils';
import { stringifyNumericProps } from '@c-forge/polkahat-chai-matchers';
import {
  duration,
  getApiProviderWrapper,
  getLocalApiProviderWrapper,
  getSigners,
  time,
  toE,
  transferNativeFromTo,
} from '@c-forge/polkahat-network-helpers';
import { ApiPromise } from '@polkadot/api';
import Keyring from '@polkadot/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import BN from 'bn.js';
import chalk from 'chalk';
import { readFileSync } from 'fs-extra';
import path from 'path';
import { saveContractInfoToFileAsJson } from 'scripts/deployAudit';
import { roleToSelectorId } from 'tests/misc';
import ATokenContract from 'typechain/contracts/a_token';
import LendingPoolContract from 'typechain/contracts/lending_pool';
import PriceFeedProviderContract from 'typechain/contracts/price_feed_provider';
import Psp22ForAuditContract from 'typechain/contracts/psp22_for_audit';
import VTokenContract from 'typechain/contracts/v_token';
import ATokenDeployer from 'typechain/deployers/a_token';
import AbaxTgeDeployer from 'typechain/deployers/abax_tge';
import AbaxTokenDeployer from 'typechain/deployers/abax_token';
import AbaxTreasuryDeployer from 'typechain/deployers/abax_treasury';
import BalanceViewerDeployer from 'typechain/deployers/balance_viewer';
import GovernorDeployer from 'typechain/deployers/abax_governor';
import LendingPoolDeployer from 'typechain/deployers/lending_pool';
import PriceFeedProviderDeployer from 'typechain/deployers/price_feed_provider';
import Psp22EmitableDeployer from 'typechain/deployers/psp22_emitable';
import Psp22ForAuditDeployer from 'typechain/deployers/psp22_for_audit';
import VTokenDeployer from 'typechain/deployers/v_token';
import VesterDeployer from 'typechain/deployers/abax_vester';
import WazeroDeployer from 'typechain/deployers/wazero';
import { getContractObjectWrapper } from 'typechain/shared/utils';
import { InterestRateModelParams } from 'typechain/types-arguments/balance_viewer';
import { GovernError, Proposal, Transaction, Vote, VotingRules } from 'typechain/types-arguments/governor';
import { AssetRules, ReserveRestrictions, SetReserveFeesArgs } from 'typechain/types-arguments/lending_pool';
import { numbersToHex, paramsToInputNumbers } from 'tests/paramsHexConversionUtils';
import { isEqual } from 'lodash';
import GovernorContract from 'typechain/contracts/governor';
import { genValidContractOptionsWithValue } from '@c-forge/typechain-types';
import RegisterAssetProposalDeployer from 'typechain/deployers/register_asset_proposal';
import AddMarketRuleProposalDeployer from 'typechain/deployers/add_market_rule_proposal';
import DeployLpProposalDeployer from 'typechain/deployers/deploy_lp_proposal';

const descriptionUrl = 'https://github.com/abaxfinance/abax-protocol';

export async function propose(
  governor: GovernorContract,
  proposer: KeyringPair,
  transactions: Transaction[],
  description: string,
  earliestExecution: number | null = null,
) {
  console.log('Proposing...', description);
  let proposalId = new BN(-1);
  const descriptionHash = (await governor.query.hashDescription(description)).value.ok!;
  const query = await governor.withSigner(proposer).query.propose({ descriptionUrl, descriptionHash, transactions, earliestExecution }, description);
  query.value.unwrapRecursively();
  const tx = await governor.withSigner(proposer).tx.propose({ descriptionUrl, descriptionHash, transactions, earliestExecution }, description);
  const event = tx.events?.find((e) => e.name.includes('ProposalCreated'))?.args;
  proposalId = new BN(event.proposalId.toString());

  //votes for should be initiated to proposer deposit
  // TODO ideally checks that won't check state 1v1

  return [proposalId, descriptionHash.toString()] as const;
}
export type TokenMetadata = {
  name: string;
  symbol: string;
  decimals: number;
};

export type InterestRateModel = [
  number | string,
  number | string,
  number | string,
  number | string,
  number | string,
  number | string,
  number | string,
];

export interface TestToken {
  metadata: TokenMetadata;
  defaultRule: AssetRules;
  restrictions: ReserveRestrictions;
  fees: SetReserveFeesArgs;
}

export interface TestExternalToken extends TestToken {
  interestRateModelParams: InterestRateModelParams;
}

export interface TestInternalStableToken extends TestToken {
  debtRate?: string | BN;
}

export type TokensToDeployForTesting = {
  reserveTokens: Array<TestExternalToken>;
  stableTokens: Array<TestInternalStableToken>;
};

// 0.01 % / 365 * 24 * 60 * 60 * E18
export const ONE_PERCENT_APR_E18 = 3_170_979;

export const ONE_SEC = new BN(1000);
export const ONE_MIN = ONE_SEC.muln(60);
export const ONE_HOUR = ONE_MIN.muln(60);
export const ONE_DAY = ONE_HOUR.muln(24);
export const ONE_YEAR = ONE_DAY.muln(365);

/* eslint-disable */
export const DEFAULT_INTEREST_RATE_MODEL_FOR_TESTING: InterestRateModelParams = {
  targetUrE6: 900_000, //90%
  minRateAtTargetE18: 2 * ONE_PERCENT_APR_E18,
  maxRateAtTargetE18: 10 * ONE_PERCENT_APR_E18,

  rateAtMaxUrE18: 100 * ONE_PERCENT_APR_E18,
  minimalTimeBetweenAdjustments: ONE_HOUR,
};
export async function registerNewAsset(
  api: ApiPromise,
  owner: KeyringPair,
  lendingPool: LendingPoolContract,
  assetAddress: string,
  aTokenCodeHash: string,
  vTokenCodeHash: string,
  name: string,
  symbol: string,
  decimals: number,
  assetRules: AssetRules,
  restrictions: ReserveRestrictions,
  fees: SetReserveFeesArgs,
  interestRateModel: InterestRateModelParams | null,
): Promise<{ aToken: ATokenContract; vToken: VTokenContract }> {
  const registerAssetArgs: Parameters<typeof lendingPool.query.registerAsset> = [
    assetAddress,
    aTokenCodeHash as any,
    vTokenCodeHash as any,
    name,
    symbol,
    decimals,
    assetRules,
    restrictions,
    fees,
    interestRateModel,
  ];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  try {
    const res = await lendingPool.query.registerAsset(...registerAssetArgs);
  } catch (err) {
    console.log(err);
    throw new Error('Failed to register asset' + JSON.stringify(err));
  }
  await lendingPool.withSigner(owner).tx.registerAsset(...registerAssetArgs);

  const tokenAdresses = (await lendingPool.query.viewReserveTokens(assetAddress)).value.ok!;

  const aToken = getContractObjectWrapper(api, ATokenContract, tokenAdresses.aTokenAddress.toString(), owner);
  const vToken = getContractObjectWrapper(api, VTokenContract, tokenAdresses.vTokenAddress.toString(), owner);
  return { aToken, vToken };
}

export const getLineSeparator = () => '='.repeat(process.stdout.columns - 20 ?? 60);
export async function deployCoreContracts(
  owner: KeyringPair,
  oracle: string,
): Promise<{
  priceFeedProvider: PriceFeedProviderContract;
  lendingPool: LendingPoolContract;
  aTokenCodeHash: string;
  vTokenCodeHash: string;
}> {
  if (process.env.DEBUG) {
    console.log(getLineSeparator());
    console.log('Deploying contracts');
    console.log(getLineSeparator());
    console.log(`Deployer: ${owner.address}`);
  }
  const api = await getLocalApiProviderWrapper(9944).getAndWaitForReady();

  const aTokenContract = await new ATokenDeployer(api, owner).new('Abacus Deposit Token', 'AToken', 0, owner.address, owner.address);
  const vTokenContract = await new VTokenDeployer(api, owner).new('Abacus Debt Token', 'VToken', 0, owner.address, owner.address);

  const { codeHash: aTokenCodeHashHex } = (await api.query.contracts.contractInfoOf(aTokenContract.contract.address)).toHuman() as {
    codeHash: string;
  };
  const { codeHash: vTokenCodeHashHex } = (await api.query.contracts.contractInfoOf(vTokenContract.contract.address)).toHuman() as {
    codeHash: string;
  };
  const aTokenCodeHash = aTokenCodeHashHex; //hexToBytes(aTokenCodeHashHex);
  const vTokenCodeHash = vTokenCodeHashHex; //hexToBytes(vTokenCodeHashHex);

  const lendingPool = (await new LendingPoolDeployer(api, owner).new()).contract;

  const priceFeedProvider = (await new PriceFeedProviderDeployer(api, owner).new(oracle)).contract;
  return { priceFeedProvider, lendingPool, aTokenCodeHash, vTokenCodeHash };
}

export const MINTER = 4_254_773_782;
export const BURNER = 1_711_057_910;

export const ROLES = {
  ROLE_ADMIN: 0,
  ASSET_LISTING_ADMIN: 1094072439,
  PARAMETERS_ADMIN: 368001360,
  STABLECOIN_RATE_ADMIN: 2742621032,
  EMERGENCY_ADMIN: 297099943,
  TREASURY: 2434241257,
  MINTER: MINTER,
  BURNER: BURNER,
} as const;

const RESERVE_TOKENS_TO_DEPLOY: TokensToDeployForTesting = {
  reserveTokens: [
    {
      metadata: { name: 'DAI_TEST', symbol: 'DAI', decimals: 6 },

      fees: {
        depositFeeE6: 0,
        debtFeeE6: 0,
      },
      interestRateModelParams: DEFAULT_INTEREST_RATE_MODEL_FOR_TESTING,
      defaultRule: { collateralCoefficientE6: toE(6, 0.92), borrowCoefficientE6: toE(6, 1.08), penaltyE6: toE(6, 0.04) },
      restrictions: { maximalTotalDeposit: null, maximalTotalDebt: null, minimalCollateral: 2000000, minimalDebt: 1000000 },
    },
    {
      metadata: { name: 'USDC_TEST', symbol: 'USDC', decimals: 6 },

      fees: {
        depositFeeE6: 0,
        debtFeeE6: 0,
      },
      interestRateModelParams: DEFAULT_INTEREST_RATE_MODEL_FOR_TESTING,
      defaultRule: { collateralCoefficientE6: toE(6, 0.95), borrowCoefficientE6: toE(6, 1.05), penaltyE6: toE(6, 0.025) },
      restrictions: { maximalTotalDeposit: null, maximalTotalDebt: null, minimalCollateral: 2000, minimalDebt: 1000 },
    },
    {
      metadata: { name: 'WETH_TEST', symbol: 'ETH', decimals: 18 },

      fees: {
        depositFeeE6: 0,
        debtFeeE6: 0,
      },
      interestRateModelParams: DEFAULT_INTEREST_RATE_MODEL_FOR_TESTING,
      defaultRule: { collateralCoefficientE6: toE(6, 0.75), borrowCoefficientE6: toE(6, 1.25), penaltyE6: toE(6, 0.125) },
      restrictions: { maximalTotalDeposit: null, maximalTotalDebt: null, minimalCollateral: 2000, minimalDebt: 1000 },
    },
    {
      metadata: { name: 'BTC_TEST', symbol: 'BTC', decimals: 8 },

      fees: {
        depositFeeE6: 0,
        debtFeeE6: 0,
      },
      interestRateModelParams: DEFAULT_INTEREST_RATE_MODEL_FOR_TESTING,
      defaultRule: { collateralCoefficientE6: toE(6, 0.75), borrowCoefficientE6: toE(6, 1.25), penaltyE6: toE(6, 0.125) },
      restrictions: { maximalTotalDeposit: null, maximalTotalDebt: null, minimalCollateral: 2000, minimalDebt: 1000 },
    },
    {
      metadata: { name: 'AZERO_TEST', symbol: 'AZERO', decimals: 12 },

      fees: {
        depositFeeE6: 0,
        debtFeeE6: 0,
      },
      interestRateModelParams: DEFAULT_INTEREST_RATE_MODEL_FOR_TESTING,
      defaultRule: { collateralCoefficientE6: toE(6, 0.63), borrowCoefficientE6: toE(6, 1.42), penaltyE6: toE(6, 0.2) },
      restrictions: { maximalTotalDeposit: null, maximalTotalDebt: null, minimalCollateral: 2000, minimalDebt: 1000 },
    },
    {
      metadata: { name: 'DOT_TEST', symbol: 'DOT', decimals: 12 },

      fees: {
        depositFeeE6: 0,
        debtFeeE6: 0,
      },
      interestRateModelParams: DEFAULT_INTEREST_RATE_MODEL_FOR_TESTING,
      defaultRule: { collateralCoefficientE6: toE(6, 0.7), borrowCoefficientE6: toE(6, 1.3), penaltyE6: toE(6, 0.15) },
      restrictions: {
        maximalTotalDeposit: '1000000000000000000000000000',
        maximalTotalDebt: '1000000000000000000000000000',
        minimalCollateral: 2000,
        minimalDebt: 1000,
      },
    },
  ],
  stableTokens: [],
};

const ORACLE_ADDRESS = '5F5z8pZoLgkGapEksFWc2h7ZxH2vdh1A9agnhXvfdCeAfS9b';

type TokenReserve = {
  underlying: Psp22ForAuditContract;
  aToken: ATokenContract;
  vToken: VTokenContract;
  decimals: number;
};

export const ABAX_DECIMALS = 12;

const toABAXTokenDecimals = (amount: string | number | BN) => (BN.isBN(amount) ? amount : new BN(amount)).mul(new BN(10).pow(new BN(ABAX_DECIMALS)));

const TGE_START_TIME = new Date('2024-06-30T00:00:00Z').getTime();
const PHASE_TWO_DURATION = time.duration.days(90);
const ONE_MILLION = 1_000_000;
const ONE_HUNDRED_MILLION = 100 * ONE_MILLION;
const PHASE_ONE_TOKEN_CAP = toABAXTokenDecimals(1).mul(new BN(ONE_HUNDRED_MILLION.toString()));
const COST_TO_MINT_MILLION_TOKENS = new BN(ONE_MILLION).divn(40); // 1 AZERO = 40 ABAX

const UNSTAKE_PERIOD = time.duration.days(180);
const VOTING_RULES: VotingRules = {
  minimumStakePartE3: toE(3, 0.01),
  proposerDepositPartE3: toE(3, 0.1),
  initialPeriod: time.duration.days(3),
  flatPeriod: time.duration.days(7),
  finalPeriod: time.duration.days(4),
};

const ONE_TOKEN = new BN(10).pow(new BN(ABAX_DECIMALS));

const smallStake = ONE_TOKEN;
const midStake = smallStake.muln(10);
const bigStake = midStake.muln(10);

(async (args: Record<string, unknown>) => {
  if (require.main !== module) return;
  const outputJsonFolder = (args['path'] as string) ?? process.argv[2] ?? __dirname;
  if (!outputJsonFolder) throw 'could not determine path';
  const seed = process.env.SEED;
  if (!seed) throw 'could not determine seed';
  // const api = await getLocalApiProviderWrapper(9944).getAndWaitForReady();
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const signer = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];
  const outputPath = path.join(outputJsonFolder, 'deployedContracts.azero.testnet.json');

  const ABAX_TOKEN_DEFAULT_ADMIN = signer.address;
  const ABAX_TGE_DEFAULT_ADMIN = signer.address;
  const ABAX_TGE_STAKEDROP_ADMIN = signer.address;
  // const CUSTOM_ADMIN = '5EPYzg9NkmtSGcJD82465NG92XxXbX3MgzMsVv1Z3ZALR8aE';
  const CUSTOM_ADMIN = signer.address;
  const testSeeds = JSON.parse(readFileSync(path.join(__dirname, 'testSeeds.json')).toString()) as { [key: string]: string };
  const foundersAddress = signer.address; //keyring.createFromUri(testSeeds['founders'], {}, 'sr25519').address;
  const foundationAddress = signer.address; //keyring.createFromUri(testSeeds['foundation'], {}, 'sr25519').address;

  await transferNativeFromTo(api, getSigners()[0], signer, ONE_TOKEN.muln(1_000_000));
  //TODO: hardcode wAZERO
  // const wAZERO = (await new WazeroDeployer(api, signer).new()).contract;
  const wAZERO = (await new Psp22EmitableDeployer(api, signer).new('wAZERO', 'wAZERO', ABAX_DECIMALS)).contract;

  // const abaxToken = (await new AbaxTokenDeployer(api, signer).new('ABAX', 'ABAX', ABAX_DECIMALS)).contract;
  const abaxToken = (await new Psp22EmitableDeployer(api, signer).new('Token', 'TOK', ABAX_DECIMALS)).contract;

  const vester = (await new VesterDeployer(api, signer).new()).contract;

  const governor = (
    await new GovernorDeployer(api, signer).new(abaxToken.address, vester.address, UNSTAKE_PERIOD, 'ABAX Votes', 'vABAX', VOTING_RULES)
  ).contract;

  const treasury = (await new AbaxTreasuryDeployer(api, signer).new(governor.address, signer.address, vester.address)).contract;

  const abaxTge = (
    await new AbaxTgeDeployer(api, signer).new(
      TGE_START_TIME,
      PHASE_TWO_DURATION,
      abaxToken.address,
      wAZERO.address,
      vester.address,
      foundersAddress,
      foundationAddress,
      treasury.address,
      PHASE_ONE_TOKEN_CAP,
      COST_TO_MINT_MILLION_TOKENS,
      ABAX_TGE_STAKEDROP_ADMIN,
    )
  ).contract;

  const voters = [signer, ...getSigners()];

  await abaxToken.tx.mint(voters[0].address, bigStake.muln(10000));
  await abaxToken.tx.mint(voters[1].address, bigStake);
  await abaxToken.tx.mint(voters[2].address, midStake);
  await abaxToken.tx.mint(voters[3].address, midStake);
  await abaxToken.tx.mint(voters[4].address, smallStake);
  await abaxToken.tx.mint(voters[5].address, smallStake);

  await abaxToken.withSigner(voters[0]).tx.approve(governor.address, bigStake.muln(10000));
  await abaxToken.withSigner(voters[1]).tx.approve(governor.address, bigStake);
  await abaxToken.withSigner(voters[2]).tx.approve(governor.address, midStake);
  await abaxToken.withSigner(voters[3]).tx.approve(governor.address, midStake);
  await abaxToken.withSigner(voters[4]).tx.approve(governor.address, smallStake);
  await abaxToken.withSigner(voters[5]).tx.approve(governor.address, smallStake);

  await governor.withSigner(voters[0]).tx.deposit(bigStake.muln(10000), voters[0].address);
  await governor.withSigner(voters[1]).tx.deposit(bigStake, voters[1].address);
  await governor.withSigner(voters[2]).tx.deposit(midStake, voters[2].address);
  await governor.withSigner(voters[3]).tx.deposit(midStake, voters[3].address);
  await governor.withSigner(voters[4]).tx.deposit(smallStake, voters[4].address);
  await governor.withSigner(voters[5]).tx.deposit(smallStake, voters[5].address);

  await governor.withSigner(signer).tx.grantRole(roleToSelectorId('EXECUTOR'), signer.address);
  console.log('setup done...');
  let proposalId: BN;
  let descriptionHash: string;

  const finalize = async () => {
    await governor.withSigner(voters[0]).tx.vote(proposalId, Vote.agreed, []);
    await governor.withSigner(voters[1]).tx.vote(proposalId, Vote.agreed, []);
    await governor.withSigner(voters[2]).tx.vote(proposalId, Vote.agreed, []);
    await governor.withSigner(voters[3]).tx.vote(proposalId, Vote.agreed, []);
    await time.increase(9 * duration.days(1));
    await governor.withSigner(voters[0]).tx.finalize(proposalId);
  };

  const aTokenCodeHash = (await new ATokenDeployer(api, signer).deployCode()).codeHash;
  const vTokenCodeHash = (await new VTokenDeployer(api, signer).deployCode()).codeHash;
  const priceFeedProvider = (await new PriceFeedProviderDeployer(api, signer).new(ORACLE_ADDRESS)).contract;

  const lendingPoolHash = (await new LendingPoolDeployer(api, signer).deployCode()).codeHash;
  let lendingPoolAddress = '';

  const proposeProposalAndExecute = async (
    createProposal: () => Promise<{ descriptionUrl: string; descriptionHash: string; transactions: Transaction[]; earliestExecution: number | null }>,
  ) => {
    console.log('propose...');
    const proposal = await createProposal();
    console.log('finalize...');
    await finalize();
    const queryRes = await governor.withSigner(voters[0]).query.execute(proposal);
    queryRes.value.unwrapRecursively();
    const tx = await governor.withSigner(voters[0]).tx.execute(proposal);
    console.log('query', stringifyNumericProps(queryRes.value));
    console.log('blockHash', tx.blockHash);
  };
  const proposeDeployLendingPool = async () =>
    proposeProposalAndExecute(async () => {
      const deployLendingPoolProposalContract = (await new DeployLpProposalDeployer(api, signer).new(lendingPoolHash as any, governor.address))
        .contract;

      deployLendingPoolProposalContract.events.subscribeOnLendingPoolDeployedEvent((event) => {
        console.log('Lending pool deployed', event);
        lendingPoolAddress = event.lendingPool.toString();
      });

      const message = deployLendingPoolProposalContract.abi.findMessage('execute');
      const params = paramsToInputNumbers(message.toU8a([]));
      const transactions: Transaction[] = [
        {
          callee: deployLendingPoolProposalContract.address,
          selector: params.selector,
          input: params.data,
          transferredValue: 0,
        },
      ];
      [proposalId, descriptionHash] = await propose(governor, voters[0], transactions, `deploy lending pool`);

      return { descriptionUrl, descriptionHash, transactions, earliestExecution: null };
    });

  await proposeDeployLendingPool();

  //TODO DEPLOYMENT
  const lendingPool = new LendingPoolContract(lendingPoolAddress, signer, api);
  const proposeLpGrantRole = async (role: number, account: string) => {
    const gasLimit = await genValidContractOptionsWithValue(api);
    const message = lendingPool.abi.findMessage('accessControl::grantRole');
    const params = paramsToInputNumbers(message.toU8a([role, account]));
    const transactions: Transaction[] = [
      {
        callee: lendingPool.address,
        selector: params.selector,
        input: params.data,
        transferredValue: 0,
      },
    ];
    [proposalId, descriptionHash] = await propose(governor, voters[0], transactions, `grant role ${role} to ${account}`);

    return { descriptionUrl, descriptionHash, transactions, earliestExecution: null };
  };

  const proposeLpGrantRoleAndExecute = async (role: number, account: string) => {
    await proposeProposalAndExecute(() => proposeLpGrantRole(role, account));
  };

  await proposeLpGrantRoleAndExecute(ROLES['ASSET_LISTING_ADMIN'], CUSTOM_ADMIN);
  await proposeLpGrantRoleAndExecute(ROLES['PARAMETERS_ADMIN'], CUSTOM_ADMIN);
  await proposeLpGrantRoleAndExecute(ROLES['STABLECOIN_RATE_ADMIN'], CUSTOM_ADMIN);
  await proposeLpGrantRoleAndExecute(ROLES['EMERGENCY_ADMIN'], CUSTOM_ADMIN);

  await proposeLpGrantRoleAndExecute(ROLES['ASSET_LISTING_ADMIN'], governor.address);
  await proposeLpGrantRoleAndExecute(ROLES['PARAMETERS_ADMIN'], governor.address);
  await proposeLpGrantRoleAndExecute(ROLES['STABLECOIN_RATE_ADMIN'], governor.address);
  await proposeLpGrantRoleAndExecute(ROLES['EMERGENCY_ADMIN'], governor.address);

  const proposeSetPriceFeedProvider = async () => {
    await proposeProposalAndExecute(async () => {
      const gasLimit = await genValidContractOptionsWithValue(api);
      const message = lendingPool.abi.findMessage('LendingPoolManage::set_price_feed_provider');
      const params = paramsToInputNumbers(message.toU8a([priceFeedProvider.address]));
      const transactions: Transaction[] = [
        {
          callee: lendingPool.address,
          selector: params.selector,
          input: params.data,
          transferredValue: 0,
        },
      ];
      [proposalId, descriptionHash] = await propose(governor, voters[0], transactions, `set price feed provider to ${priceFeedProvider.address}`);

      return { descriptionUrl, descriptionHash, transactions, earliestExecution: null };
    });
  };

  lendingPool.events.subscribeOnPriceFeedProviderChangedEvent((event) => {
    console.log('Price feed provider changed emitted', event);
  });

  await proposeSetPriceFeedProvider();

  const proposeAddMarketRule = async (rules: (AssetRules | null)[]) => {
    await proposeProposalAndExecute(async () => {
      const addMarketRuleProposalContract = (await new AddMarketRuleProposalDeployer(api, signer).new(lendingPool.address, rules)).contract;

      await proposeLpGrantRoleAndExecute(ROLES['PARAMETERS_ADMIN'], addMarketRuleProposalContract.address);

      const message = addMarketRuleProposalContract.abi.findMessage('execute');
      const params = paramsToInputNumbers(message.toU8a([]));
      const transactions: Transaction[] = [
        {
          callee: addMarketRuleProposalContract.address,
          selector: params.selector,
          input: params.data,
          transferredValue: 0,
        },
      ];
      [proposalId, descriptionHash] = await propose(governor, voters[0], transactions, `add market rule`);

      return { descriptionUrl, descriptionHash, transactions, earliestExecution: null };
    });
  };

  lendingPool.events.subscribeOnAssetRulesChangedEvent((event) => {
    console.log('Asset rule change emitted', event);
  });
  await proposeAddMarketRule([]);

  const rules = await lendingPool.query.viewMarketRule(0);

  const reservesWithLendingTokens = {} as Record<string, TokenReserve>;
  for (const reserveData of RESERVE_TOKENS_TO_DEPLOY.reserveTokens) {
    //TODO
    const reserve = (
      await new Psp22ForAuditDeployer(api, signer).new(
        reserveData.metadata.name,
        `Reserve ${reserveData.metadata.name} token`,
        reserveData.metadata.decimals,
      )
    ).contract;
    if (process.env.DEBUG) console.log(`${reserveData.metadata.name} | insert reserve token price, deploy A/S/V tokens and register as an asset`);

    const proposeRegisterAssetAndExecute = async () => {
      await proposeProposalAndExecute(async () => {
        const registerAssetProposalContract = (
          await new RegisterAssetProposalDeployer(api, signer).new(
            lendingPool.address,
            reserve.address,
            aTokenCodeHash as any,
            vTokenCodeHash as any,
            reserveData.metadata.name,
            reserveData.metadata.symbol,
            reserveData.metadata.decimals,
            reserveData.defaultRule,
            reserveData.restrictions,
            reserveData.fees,
            reserveData.interestRateModelParams,
          )
        ).contract;

        await proposeLpGrantRoleAndExecute(ROLES['ASSET_LISTING_ADMIN'], registerAssetProposalContract.address);

        const message = registerAssetProposalContract.abi.findMessage('execute');
        const params = paramsToInputNumbers(message.toU8a([]));

        const transactions: Transaction[] = [
          {
            callee: registerAssetProposalContract.address,
            selector: params.selector,
            input: params.data,
            transferredValue: 0,
          },
        ];
        [proposalId, descriptionHash] = await propose(governor, voters[0], transactions, `register asset ${reserveData.metadata.name}`);

        return { descriptionUrl, descriptionHash, transactions, earliestExecution: null };
      });
    };
    console.log('REGISTERING ASSET');
    await proposeRegisterAssetAndExecute();
    const { aTokenAddress, vTokenAddress } = (await lendingPool.query.viewReserveTokens(reserve.address)).value.ok!;
    const aToken = getContractObjectWrapper(api, ATokenContract, aTokenAddress.toString(), signer);
    const vToken = getContractObjectWrapper(api, VTokenContract, vTokenAddress.toString(), signer);

    console.log('inserting token price');
    await priceFeedProvider.tx.setAccountSymbol(reserve.address, reserveData.metadata.symbol + '/USD');
    reservesWithLendingTokens[reserveData.metadata.name] = {
      underlying: reserve,
      aToken,
      vToken,
      decimals: reserveData.metadata.decimals,
    };
  }
  console.log(`signer: ${signer.address}`);
  console.log(`lendingPool: ${lendingPool.address}`);
  console.log(`priceFeedProvider: ${priceFeedProvider.address}`);
  console.log('a_token code hash:', aTokenCodeHash);
  console.log('v_token code hash:', vTokenCodeHash);

  // // stable
  await proposeAddMarketRule([
    { collateralCoefficientE6: 980000, borrowCoefficientE6: 1020000, penaltyE6: 10000 },
    { collateralCoefficientE6: 990000, borrowCoefficientE6: 1010000, penaltyE6: 5000 },
    null,
  ]);

  // // crypto
  await proposeAddMarketRule([
    null,
    null,
    { collateralCoefficientE6: 900000, borrowCoefficientE6: 1100000, penaltyE6: 50000 },
    { collateralCoefficientE6: 900000, borrowCoefficientE6: 1100000, penaltyE6: 50000 },
    { collateralCoefficientE6: 800000, borrowCoefficientE6: 1200000, penaltyE6: 100000 },
    { collateralCoefficientE6: 850000, borrowCoefficientE6: 1150000, penaltyE6: 75000 },
  ]);

  const balanceViewer = (await new BalanceViewerDeployer(api, signer).new(lendingPool.address)).contract;

  await saveContractInfoToFileAsJson(
    [
      ...Object.entries(reservesWithLendingTokens).flatMap(([reserveName, r]) =>
        [r.underlying, r.aToken, r.vToken].map((c) => ({
          name: c.name,
          address: c.address,
          reserveName,
        })),
      ),
      {
        name: 'dia_oracle',
        address: ORACLE_ADDRESS,
      },
      {
        name: balanceViewer.name,
        address: balanceViewer.address,
      },
      {
        name: lendingPool.name,
        address: lendingPool.address,
      },
      {
        name: priceFeedProvider.name,
        address: priceFeedProvider.address,
      },
      {
        name: 'aTokenCodeHash',
        codeHash: aTokenCodeHash,
      },
      {
        name: 'vTokenCodeHash',
        codeHash: aTokenCodeHash,
      },
    ],
    outputPath,
  );

  await api.disconnect();

  console.log(`Saved to: ${outputPath}`);

  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
