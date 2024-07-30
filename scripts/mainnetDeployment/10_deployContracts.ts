import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import { ensureFileSync, writeJSON } from 'fs-extra';
import path from 'path';
import { roleToSelectorId } from 'tests/misc';
import AbaxTgeDeployer from 'typechain/deployers/abax_tge';
import AbaxTokenDeployer from 'typechain/deployers/abax_token';
import AbaxTreasuryDeployer from 'typechain/deployers/abax_treasury';
import GovernorDeployer from 'typechain/deployers/governor';
import VesterDeployer from 'typechain/deployers/vester';
import {
  ABAX_DECIMALS,
  COST_TO_MINT_MILLIARD_TOKENS,
  FOUNDATION_ADDRESS,
  FOUNDERS_ADDRESS,
  PHASE_ONE_TOKEN_CAP,
  PHASE_TWO_DURATION,
  TGE_START_TIME,
  UNSTAKE_PERIOD,
  USDC_ADDRESS,
  VOTING_RULES,
} from './00_constants';

export interface StoredContractInfo {
  name: string;
  address: string;
  [key: string]: string;
}

export const DEPLOYED_CONTRACTS_INFO_PATH = `${path.join(__dirname, 'results', 'deployedContracts.json')}`;
export const EXECUTED_TX_RESULTS_PATH = `${path.join(__dirname, 'results', '10_executed_tx_results.json')}`;
export const saveContractInfoToFileAsJson = async (contractInfos: StoredContractInfo[], writePath = DEPLOYED_CONTRACTS_INFO_PATH) => {
  ensureFileSync(writePath);
  await writeJSON(writePath, contractInfos);
};

(async () => {
  if (require.main !== module) return;
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = process.env.SEED;
  if (!seed) throw 'could not determine seed';

  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const deployer = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];

  // ABAX TOKEN is deployed with deployer as a RoleAdmin.
  const { result: abaxTokenResult, contract: abaxToken } = await new AbaxTokenDeployer(api, deployer).new('ABAX', 'ABAX', ABAX_DECIMALS);

  // TGE Vester is deployed. it doesn't have any admins.
  const { result: tgeVesterResult, contract: tgeVester } = await new VesterDeployer(api, deployer).new();

  // Governor Vester is deployed. it doesn't have any admins.
  const { result: governorVesterResult, contract: governorVester } = await new VesterDeployer(api, deployer).new();

  // Treasury Vester is deployed. it doesn't have any admins.
  const { result: treasuryVesterResult, contract: treasuryVester } = await new VesterDeployer(api, deployer).new();

  // Governor is deployed. Governor is it's own RoleAdmin. Foundation is the only Executor. There is no ParametersAdmin.
  // The AbaxToken is used as an underlying asset of PSP22Vault module.
  const { result: governorResult, contract: governor } = await new GovernorDeployer(api, deployer).new(
    abaxToken.address,
    governorVester.address,
    FOUNDATION_ADDRESS,
    null,
    UNSTAKE_PERIOD,
    'ABAX Votes',
    'vABAX',
    VOTING_RULES,
  );
  //} Treasury is deployed. Governor is the only RoleAdmin and Spender. Foundation is the only Executor and Canceller.
  const { result: treasuryResult, contract: treasury } = await new AbaxTreasuryDeployer(api, deployer).new(
    governor.address,
    FOUNDATION_ADDRESS,
    treasuryVester.address,
  );

  // TGE is deployed. deployer is the only RoleAdmin.
  const { result: abaxTgeResult, contract: abaxTge } = await new AbaxTgeDeployer(api, deployer).new(
    TGE_START_TIME,
    PHASE_TWO_DURATION,
    abaxToken.address,
    USDC_ADDRESS,
    tgeVester.address,
    FOUNDERS_ADDRESS,
    FOUNDATION_ADDRESS,
    treasury.address,
    PHASE_ONE_TOKEN_CAP,
    COST_TO_MINT_MILLIARD_TOKENS,
  );

  //} Give TGE GENERATOR role
  const res1 = await abaxToken.withSigner(deployer).tx.grantRole(roleToSelectorId('GENERATOR'), abaxTge.address);
  // Give Governor RoleAdmin role
  const res2 = await abaxToken.withSigner(deployer).tx.grantRole(0, governor.address);
  // deployer renounces RoleAdmin role
  const res3 = await abaxToken.withSigner(deployer).tx.renounceRole(0, deployer.address);

  // Give Governor RoleAdmin role
  const res4 = await abaxTge.withSigner(deployer).tx.grantRole(0, governor.address);

  // Give Deployer Stakedrop admin role
  const res5 = await abaxTge.withSigner(deployer).tx.grantRole(roleToSelectorId('STAKEDROP_ADMIN'), deployer.address);
  // Give Deployer Bonus admin role
  const res6 = await abaxTge.withSigner(deployer).tx.grantRole(roleToSelectorId('BONUS_ADMIN'), deployer.address);
  // Give Deployer Referrer admin role
  const res7 = await abaxTge.withSigner(deployer).tx.grantRole(roleToSelectorId('REFERRER_ADMIN'), deployer.address);
  // Give FOUNDATION Referrer admin role
  const res8 = await abaxTge.withSigner(deployer).tx.grantRole(roleToSelectorId('REFERRER_ADMIN'), FOUNDATION_ADDRESS);

  // deployer renounces RoleAdmin role
  const res9 = await abaxTge.withSigner(deployer).tx.renounceRole(0, deployer.address);

  await saveContractInfoToFileAsJson([
    {
      name: abaxToken.name,
      address: abaxToken.address,
      txHash: abaxTokenResult.txHash!,
      blockHash: abaxTokenResult.blockHash!,
    },
    {
      name: treasuryVester.name,
      address: treasuryVester.address,
      txHash: treasuryVesterResult.txHash!,
      blockHash: treasuryVesterResult.blockHash!,
      vestingFor: 'treasury',
    },
    {
      name: governorVester.name,
      address: governorVester.address,
      txHash: governorVesterResult.txHash!,
      blockHash: governorVesterResult.blockHash!,
      vestingFor: 'governor',
    },
    {
      name: tgeVester.name,
      address: tgeVester.address,
      txHash: tgeVesterResult.txHash!,
      blockHash: tgeVesterResult.blockHash!,
      vestingFor: 'tge',
    },
    {
      name: governor.name,
      address: governor.address,
      txHash: governorResult.txHash!,
      blockHash: governorResult.blockHash!,
    },
    {
      name: treasury.name,
      address: treasury.address,
      txHash: treasuryResult.txHash!,
      blockHash: treasuryResult.blockHash!,
    },
    {
      name: abaxTge.name,
      address: abaxTge.address,
      txHash: abaxTgeResult.txHash!,
      blockHash: abaxTgeResult.blockHash!,
    },
  ]);

  await writeJSON(
    EXECUTED_TX_RESULTS_PATH,
    [res1, res2, res3, res4, res5, res6, res7, res8, res9].map((r) => ({
      txHash: r.txHash!,
      blockHash: r.blockHash!,
    })),
  );

  await api.disconnect();
  process.exit(0);
})().catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
