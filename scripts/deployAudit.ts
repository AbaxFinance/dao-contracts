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

const ALL_ROLES = ['MINTER', 'GENERATOR', 'PARAMETERS_ADMIN', 'SPENDER', 'EXECUTOR', 'CANCELLER', 'CODE_UPDATER'];

export interface StoredContractInfo {
  name: string;
  address: string;
}
export const DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH = `${path.join(__dirname, 'deployedContracts.json')}`;
export const saveContractInfoToFileAsJson = async (contractInfos: StoredContractInfo[], writePath = DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH) => {
  await writeJSON(writePath, contractInfos);
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

const auditorAddress = '5HC2j3oJrieqBd4zFdX1VcLe6GbgGhfMRbjQUSB8RdZeRZkf';

(async (args: Record<string, unknown>) => {
  if (require.main !== module) return;
  const outputJsonFolder = (args['path'] as string) ?? process.argv[2] ?? process.env.PWD;
  if (!outputJsonFolder) throw 'could not determine path';
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = process.env.SEED;
  if (!seed) throw 'could not determine seed';
  console.log(ALL_ROLES.map((role) => [role, roleToSelectorId(role as any)]));
  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const signer = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];
  const outputPath = path.join(outputJsonFolder, 'deployedContracts.azero.testnet.json');

  const ABAX_TGE_STAKEDROP_ADMIN = auditorAddress;
  const foundersAddress = auditorAddress; //keyring.createFromUri(testSeeds['founders'], {}, 'sr25519').address;
  const foundationAddress = auditorAddress; //keyring.createFromUri(testSeeds['foundation'], {}, 'sr25519').address;

  //TODO: hardcode wAZERO
  const wAZERO = (await new WazeroDeployer(api, signer).new()).contract;

  const abaxToken = (await new AbaxTokenDeployer(api, signer).new('ABAX', 'ABAX', ABAX_DECIMALS)).contract;

  const vester = (await new VesterDeployer(api, signer).new()).contract;

  const governor = (
    await new GovernorDeployer(api, signer).new(abaxToken.address, vester.address, UNSTAKE_PERIOD, 'ABAX Votes', 'vABAX', VOTING_RULES)
  ).contract;

  const treasury = (await new AbaxTreasuryDeployer(api, signer).new(governor.address, auditorAddress, vester.address)).contract;

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

  // await grantRole(treasury, roleToSelectorId('PARAMETERS_ADMIN' as any), auditorAddress, signer);
  // await grantRole(treasury, roleToSelectorId('SPENDER'), auditorAddress, signer);
  // await grantRole(treasury, roleToSelectorId('CANCELLER'), auditorAddress, signer);

  await grantRole(governor, roleToSelectorId('EXECUTOR'), auditorAddress, signer);
  // await grantRole(treasury, roleToSelectorId('EXECUTOR'), auditorAddress, signer);

  await grantRole(governor, DEFAULT_ADMIN_ROLE, auditorAddress, signer);
  // await grantRole(treasury, DEFAULT_ADMIN_ROLE, auditorAddress, signer);
  await grantRole(abaxTge, DEFAULT_ADMIN_ROLE, auditorAddress, signer);

  await saveContractInfoToFileAsJson(
    [
      {
        name: wAZERO.name,
        address: wAZERO.address,
      },
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

async function grantRole(contract: any, role: number, account: string, signer: any) {
  const error = (await contract.withSigner(signer).query.grantRole(role, account)).value.ok?.err as AccessControlError | undefined;
  if (error === AccessControlError.roleRedundant) {
    console.log(`Role ${role} already granted to ${account}`);
    return;
  }
  await contract.withSigner(signer).tx.grantRole(role, account);
}
