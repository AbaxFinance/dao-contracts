import { getApiProviderWrapper, toE } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import { ensureFileSync, writeJSON } from 'fs-extra';
import path from 'path';
import { roleToSelectorId } from 'tests/misc';
import AbaxTgeDeployer from 'typechain/deployers/abax_tge';
import AbaxTokenDeployer from 'typechain/deployers/abax_token';
import AbaxTreasuryDeployer from 'typechain/deployers/abax_treasury';
import GovernorDeployer from 'typechain/deployers/abax_governor';
import VesterDeployer from 'typechain/deployers/abax_vester';
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
import AbaxInflatorDeployer from 'typechain/deployers/abax_inflator';
import { ApiPromise } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';

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

  console.log('Deployer:', deployer.address);

  // ABAX TOKEN is deployed with deployer as a RoleAdmin.
  const { result: abaxTokenResult, contract: abaxToken } = await new AbaxTokenDeployer(api, deployer).new('ABAX', 'ABAX', ABAX_DECIMALS);
  console.log(`Deployed ABAX Token at ${abaxToken.address}`);

  // TGE Vester is deployed. it doesn't have any admins.
  const { result: tgeVesterResult, contract: tgeVester } = await new VesterDeployer(api, deployer).new();
  console.log(`Deployed TGE Vester at ${tgeVester.address}`);

  // AbaxGovernor Vester is deployed. it doesn't have any admins.
  const { result: governorVesterResult, contract: governorVester } = await new VesterDeployer(api, deployer).new();
  console.log(`Deployed AbaxGovernor Vester at ${governorVester.address}`);

  // Treasury Vester is deployed. it doesn't have any admins.
  const { result: treasuryVesterResult, contract: treasuryVester } = await new VesterDeployer(api, deployer).new();
  console.log(`Deployed Treasury Vester at ${treasuryVester.address}`);

  // AbaxGovernor is deployed. AbaxGovernor is it's own RoleAdmin. Foundation is the only Executor. There is no ParametersAdmin.
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
  console.log(`Deployed AbaxGovernor at ${governor.address}`);

  //} Treasury is deployed. AbaxGovernor is the only RoleAdmin and Spender. Foundation is the only Executor and Canceller.
  const { result: treasuryResult, contract: treasury } = await new AbaxTreasuryDeployer(api, deployer).new(
    governor.address,
    FOUNDATION_ADDRESS,
    treasuryVester.address,
  );
  console.log(`Deployed Treasury at ${treasury.address}`);

  // const usdcAddressToUse = wsEndpoint === 'wss://ws.test.azero.dev' ? (await deployUSDCDEBUG(api, deployer)).address : USDC_ADDRESS;
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
  console.log(`Deployed TGE at ${abaxTge.address}`);

  //inflator is deployed
  const { result: inflatorResult, contract: inflator } = await new AbaxInflatorDeployer(api, deployer).new(governor.address, abaxToken.address, [
    [FOUNDATION_ADDRESS, 1],
    [governor.address, 1],
  ]);
  console.log(`Deployed Inflator at ${inflator.address}`);

  //Give inflator MINTER role
  const res0 = await abaxToken.withSigner(deployer).tx.grantRole(roleToSelectorId('MINTER'), inflator.address);
  console.log('Granted MINTER role to Inflator');

  // Give TGE GENERATOR role
  const res1 = await abaxToken.withSigner(deployer).tx.grantRole(roleToSelectorId('GENERATOR'), abaxTge.address);
  console.log('Granted GENERATOR role to TGE');

  // Give AbaxGovernor RoleAdmin role
  const res2 = await abaxToken.withSigner(deployer).tx.grantRole(0, governor.address);
  console.log('Granted RoleAdmin role to AbaxGovernor');

  // deployer renounces RoleAdmin role
  const res3 = await abaxToken.withSigner(deployer).tx.renounceRole(0, deployer.address);
  console.log('Deployer eenounced RoleAdmin role from ABAX Token');

  // Give Deployer Stakedrop admin role
  const res4 = await abaxTge.withSigner(deployer).tx.grantRole(roleToSelectorId('STAKEDROP_ADMIN'), deployer.address);
  console.log('Granted STAKEDROP_ADMIN role to Deployer');

  // Give Deployer Bonus admin role
  const res5 = await abaxTge.withSigner(deployer).tx.grantRole(roleToSelectorId('BONUS_ADMIN'), deployer.address);
  console.log('Granted BONUS_ADMIN role to Deployer');

  // Give Deployer Referrer admin role
  const res6 = await abaxTge.withSigner(deployer).tx.grantRole(roleToSelectorId('REFERRER_ADMIN'), deployer.address);
  console.log('Granted REFERRER_ADMIN role to Deployer');

  // Give FOUNDATION Referrer admin role
  const res7 = await abaxTge.withSigner(deployer).tx.grantRole(roleToSelectorId('REFERRER_ADMIN'), FOUNDATION_ADDRESS);
  console.log('Granted REFERRER_ADMIN role to FOUNDATION');

  // Give AbaxGovernor RoleAdmin role
  const res8 = await abaxTge.withSigner(deployer).tx.grantRole(0, governor.address);
  console.log('Granted RoleAdmin role to AbaxGovernor');

  // deployer renounces RoleAdmin role
  const res9 = await abaxTge.withSigner(deployer).tx.renounceRole(0, deployer.address);
  console.log('Deployer renounced RoleAdmin role from TGE');

  await saveContractInfoToFileAsJson([
    {
      name: 'usdc',
      address: USDC_ADDRESS,
      displayName: 'USDC',
    },
    {
      name: abaxToken.name,
      address: abaxToken.address,
      txHash: abaxTokenResult.txHash!,
      blockHash: abaxTokenResult.blockHash!,
      displayName: 'ABAX',
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
      vestingFor: 'abax_governor',
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
    {
      name: inflator.name,
      address: inflator.address,
      txHash: inflatorResult.txHash!,
      blockHash: inflatorResult.blockHash!,
    },
  ]);

  await writeJSON(
    EXECUTED_TX_RESULTS_PATH,
    [res0, res1, res2, res3, res4, res5, res6, res7, res8, res9].map((r) => ({
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
