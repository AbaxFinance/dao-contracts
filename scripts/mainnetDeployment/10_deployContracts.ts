import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import path from 'path';
import { getApiProviderWrapper, time, toE } from '@c-forge/polkahat-network-helpers';
import { getArgvObj } from '@abaxfinance/utils';
import { readFileSync, writeJSON } from 'fs-extra';
import AbaxTgeDeployer from 'typechain/deployers/abax_tge';
import AbaxTokenDeployer from 'typechain/deployers/abax_token';
import VesterDeployer from 'typechain/deployers/vester';
import WazeroDeployer from 'typechain/deployers/wazero';
import AbaxTreasuryDeployer from 'typechain/deployers/abax_treasury';
import GovernorDeployer from 'typechain/deployers/governor';
import { VotingRules } from 'typechain/types-arguments/governor';
import BN from 'bn.js';
import { roleToSelectorId } from 'tests/misc';
import { AccessControlError, DEFAULT_ADMIN_ROLE } from '@c-forge/pendzl-tests';
import {
  FOUNDATION_ADDRESS,
  USDC_ADDRESS,
  FOUNDERS_ADDRESS,
  TGE_ADMIN_ADDRESS,
  TGE_START_TIME,
  PHASE_TWO_DURATION,
  PHASE_ONE_TOKEN_CAP,
  COST_TO_MINT_MILLIARD_TOKENS,
  UNSTAKE_PERIOD,
  VOTING_RULES,
  ABAX_DECIMALS,
} from './00_constants';

const ALL_ROLES = ['MINTER', 'GENERATOR', 'PARAMETERS_ADMIN', 'SPENDER', 'EXECUTOR', 'CANCELLER', 'CODE_UPDATER'];

export interface StoredContractInfo {
  name: string;
  address?: string;
  reserveName?: string;
  stableName?: string;
  codeHash?: string;
}

export const DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH = `${path.join(__dirname, 'deployedContracts.json')}`;
export const saveContractInfoToFileAsJson = async (contractInfos: StoredContractInfo[], writePath = DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH) => {
  await writeJSON(writePath, contractInfos);
};

(async (args: Record<string, unknown>) => {
  if (require.main !== module) return;
  const outputJsonFolder = (args['path'] as string) ?? process.argv[2] ?? process.env.PWD;
  if (!outputJsonFolder) throw 'could not determine path';
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = process.env.SEED;
  if (!seed) throw 'could not determine seed';

  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const deployer = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];
  const outputPath = path.join(outputJsonFolder, 'deployedContracts.azero.testnet.json');

  // ABAX TOKEN is deploued with deployer as a RoleAdmin.
  const abaxToken = (await new AbaxTokenDeployer(api, deployer).new('ABAX', 'ABAX', ABAX_DECIMALS)).contract;

  // Vester is deployed. it doesn't have any admins.
  const vester = (await new VesterDeployer(api, deployer).new()).contract;

  // Governor is deployed. Governor is it's own RoleAdmin. Foundation is the only Executor. There is no ParametersAdmin.
  // The AbaxToken is used as an underlying asset of PSP22Vault module.
  const governor = (
    await new GovernorDeployer(api, deployer).new(
      abaxToken.address,
      vester.address,
      FOUNDATION_ADDRESS,
      null,
      UNSTAKE_PERIOD,
      'ABAX Votes',
      'vABAX',
      VOTING_RULES,
    )
  ).contract;

  // Treasury is deployed. Governor is the only RoleAdmin and Spender. Foundation is the only Executor and Canceller.
  const treasury = (await new AbaxTreasuryDeployer(api, deployer).new(governor.address, FOUNDATION_ADDRESS, vester.address)).contract;

  // TGE is deployed. deployer is the only RoleAdmin. TGE_ADMIN is the only STAKEDROPADMIN.
  const abaxTge = (
    await new AbaxTgeDeployer(api, deployer).new(
      TGE_START_TIME,
      PHASE_TWO_DURATION,
      abaxToken.address,
      USDC_ADDRESS,
      vester.address,
      FOUNDERS_ADDRESS,
      FOUNDATION_ADDRESS,
      treasury.address,
      PHASE_ONE_TOKEN_CAP,
      COST_TO_MINT_MILLIARD_TOKENS,
      TGE_ADMIN_ADDRESS,
    )
  ).contract;

  // Give TGE GENERATOR role
  await abaxToken.withSigner(deployer).tx.grantRole(roleToSelectorId('GENERATOR'), abaxTge.address);
  // Give Governor RoleAdmin role
  await abaxToken.withSigner(deployer).tx.grantRole(0, governor.address);
  // deployer renounces RoleAdmin role
  await abaxToken.withSigner(deployer).tx.renounceRole(0, deployer.address);

  // Give Governor RoleAdmin role
  await abaxTge.withSigner(deployer).tx.grantRole(0, deployer.address);
  // deployer renounces RoleAdmin role
  await abaxTge.withSigner(deployer).tx.renounceRole(0, deployer.address);

  await saveContractInfoToFileAsJson(
    [
      {
        name: abaxToken.name,
        address: abaxToken.address,
      },
      {
        name: vester.name,
        address: vester.address,
      },
      {
        name: governor.name,
        address: governor.address,
      },
      {
        name: treasury.name,
        address: treasury.address,
      },
      {
        name: abaxTge.name,
        address: abaxTge.address,
      },
    ],
    outputPath,
  );

  await api.disconnect();
  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
