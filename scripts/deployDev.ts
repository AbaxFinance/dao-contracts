import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import path from 'path';
import { getApiProviderWrapper, getSigners, time, toE, transferNativeFromTo } from '@c-forge/polkahat-network-helpers';
import { getArgvObj } from '@abaxfinance/utils';
import { readFileSync, writeJSON } from 'fs-extra';
import AbaxTgeDeployer from 'typechain/deployers/abax_tge';
import AbaxTokenDeployer from 'typechain/deployers/abax_token';
import VesterDeployer from 'typechain/deployers/abax_vester';
import WazeroDeployer from 'typechain/deployers/wazero';
import AbaxTreasuryDeployer from 'typechain/deployers/abax_treasury';
import GovernorDeployer from 'typechain/deployers/abax_governor';
import { VotingRules } from 'typechain/types-arguments/governor';
import BN from 'bn.js';
import { roleToSelectorId } from 'tests/misc';
import { DEFAULT_ADMIN_ROLE } from '@c-forge/pendzl-tests';
import Psp22EmitableDeployer from 'typechain/deployers/psp22_emitable';
import Psp22EmitableContract from 'typechain/contracts/psp22_emitable';
import WazeroContract from 'typechain/contracts/wazero';
import { USDC_DECIMALS } from 'tests/consts';

const ALL_ROLES = ['MINTER', 'GENERATOR', 'PARAMETERS_ADMIN', 'SPENDER', 'EXECUTOR', 'CANCELLER', 'CODE_UPDATER'];

export interface StoredContractInfo {
  name: string;
  address: string;
  [key: string]: string;
}
export const DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH = `${path.join(__dirname, 'deployedContracts.json')}`;
export const saveContractInfoToFileAsJson = async (contractInfos: StoredContractInfo[], writePath = DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH) => {
  await writeJSON(writePath, contractInfos);
};
export const ABAX_DECIMALS = 12;

const toABAXTokenDecimals = (amount: string | number | BN) => (BN.isBN(amount) ? amount : new BN(amount)).mul(new BN(10).pow(new BN(ABAX_DECIMALS)));

const TGE_START_TIME = new Date('2024-06-30T00:00:00Z').getTime();
const TGE_START_TIME_FUTURE = new Date('2024-08-07T00:00:00Z').getTime();
const PHASE_TWO_DURATION = time.duration.days(90);
const ONE_MILLION = 1_000_000;
const ONE_HUNDRED_MILLION = 100 * ONE_MILLION;
const PHASE_ONE_TOKEN_CAP = toABAXTokenDecimals(1).mul(new BN(ONE_HUNDRED_MILLION.toString()));

const COST_TO_MINT_MILLION_TOKENS_E6 = new BN(1_000_000).divn(25);

const UNSTAKE_PERIOD = time.duration.days(180);
const VOTING_RULES: VotingRules = {
  minimumStakePartE3: toE(3, 0.01),
  proposerDepositPartE3: toE(3, 0.1),
  initialPeriod: time.duration.days(3),
  flatPeriod: time.duration.days(7),
  finalPeriod: time.duration.days(4),
};

const NUMBER_OF_DEPLOYMENTS = 6;

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
  const deployPath = path.join(outputJsonFolder, 'deployedContracts.azero.testnet.json');

  const deployments: StoredContractInfo[][] = [];

  for (let i = 0; i < NUMBER_OF_DEPLOYMENTS; i++) {
    //TMP
    const alice = getSigners()[0];
    await transferNativeFromTo(api, alice, signer, toABAXTokenDecimals(1_000));
    await transferNativeFromTo(api, alice, { address: '5H6nGQEZTed1Cab7JeJhpuSQ7CeNscXWQcoXqwSJ26saNAUB' } as any, toABAXTokenDecimals(1_000));
    await transferNativeFromTo(api, alice, { address: '5GdrpTpaSsdACTVHXG9iSUmzK8ewz6sPPRsVkqBHPzj8N7Xq' } as any, toABAXTokenDecimals(1_000));

    //TMP

    //Note: hardcode addresses
    const ABAX_TOKEN_DEFAULT_ADMIN = signer.address;
    const ABAX_TGE_DEFAULT_ADMIN = signer.address;
    const ABAX_TGE_STAKEDROP_ADMIN = signer.address;
    const testSeeds = JSON.parse(readFileSync(path.join(__dirname, 'testSeeds.json')).toString()) as { [key: string]: string };
    const foundersAddress = signer.address; //keyring.createFromUri(testSeeds['founders'], {}, 'sr25519').address;
    const foundationAddress = signer.address; //keyring.createFromUri(testSeeds['foundation'], {}, 'sr25519').address;

    // const wAZERO = new WazeroContract('5EFDb7mKbougLtr5dnwd5KDfZ3wK55JPGPLiryKq4uRMPR46', signer, api);
    // const USDC = new Psp22EmitableContract('5CVGYujZnkBvNsUypdMuEYT2qRzFWhZHufteSfYguQMLkaE3', signer, api);
    // const qs = await USDC.query.mint('5H6nGQEZTed1Cab7JeJhpuSQ7CeNscXWQcoXqwSJ26saNAUB', toE(6, 1_000_000_000));
    // qs.value.unwrapRecursively();
    const wAZERO = (await new WazeroDeployer(api, signer).new()).contract;

    const USDC = (await new Psp22EmitableDeployer(api, signer).new('USD Coin', 'USDC', USDC_DECIMALS)).contract;

    await USDC.withSigner(signer).tx.mint(signer.address, toE(USDC_DECIMALS, 1_000_000_000).muln(10_000));
    await USDC.withSigner(signer).tx.mint('5H6nGQEZTed1Cab7JeJhpuSQ7CeNscXWQcoXqwSJ26saNAUB', toE(USDC_DECIMALS, 1_000_000_000));
    await USDC.withSigner(signer).tx.mint('5GdrpTpaSsdACTVHXG9iSUmzK8ewz6sPPRsVkqBHPzj8N7Xq', toE(USDC_DECIMALS, 30_000));
    await USDC.withSigner(signer).tx.mint('5G419JZ4UK9VU4Y29SpVgt3cjBkMhcNX7uJ18d5VTxtDFjwo', toE(USDC_DECIMALS, 1_000_000_000).muln(10_000));
    await USDC.withSigner(signer).tx.mint('5EbfQJeLXme5DHFaBZjza1FA47D6rZJajMLDahENNk9ArtDj', toE(USDC_DECIMALS, 500_000));
    await USDC.withSigner(signer).tx.mint('5ERPh1iB4jGkFpHKNExg9wEm5NxxamFF797bG3cf5aYFMh2D', toE(USDC_DECIMALS, 30_000));

    await USDC.withSigner(signer).tx.mint('5FeXodVJgh6hvZs2ZniJyCZhpNjDxsm8bUXhsh3sCw7VzDT3', toE(USDC_DECIMALS, 5_000_000));
    await USDC.withSigner(signer).tx.mint('5ExyTZgRGxiT7nyD6h8jGsbr6hL88bbm2gvqTquu65qrbSJM', toE(USDC_DECIMALS, 500_000));

    const abaxToken = (await new AbaxTokenDeployer(api, signer).new('ABAX', 'ABAX', ABAX_DECIMALS)).contract;

    const tgeVester = (await new VesterDeployer(api, signer).new()).contract;
    const governorVester = (await new VesterDeployer(api, signer).new()).contract;
    const treasuryVester = (await new VesterDeployer(api, signer).new()).contract;

    const governor = (
      await new GovernorDeployer(api, signer).new(
        abaxToken.address,
        governorVester.address,
        foundationAddress,
        signer.address,
        UNSTAKE_PERIOD,
        'ABAX Votes',
        'vABAX',
        VOTING_RULES,
      )
    ).contract;

    const treasury = (await new AbaxTreasuryDeployer(api, signer).new(governor.address, signer.address, treasuryVester.address)).contract;

    const qrs = await governor.query.getWaitingAndVestingDurations();
    const val = qrs.value.unwrapRecursively();
    console.log('getWaitingAndVestingDurations', [val[0].toString(), val[1].toString()]);

    const abaxTge = (
      await new AbaxTgeDeployer(api, signer).new(
        i === 0 ? TGE_START_TIME_FUTURE : TGE_START_TIME,
        PHASE_TWO_DURATION,
        abaxToken.address,
        USDC.address,
        tgeVester.address,
        foundersAddress,
        foundationAddress,
        treasury.address,
        PHASE_ONE_TOKEN_CAP,
        COST_TO_MINT_MILLION_TOKENS_E6,
      )
    ).contract;

    await abaxToken.withSigner(signer).tx.grantRole(roleToSelectorId('GENERATOR'), abaxTge.address);
    await abaxTge.tx.init();

    await abaxTge.withSigner(signer).tx.registerReferrer(signer.address);
    await abaxTge.withSigner(signer).tx.registerReferrer('5H6nGQEZTed1Cab7JeJhpuSQ7CeNscXWQcoXqwSJ26saNAUB');
    await abaxTge.withSigner(signer).tx.registerReferrer('5ERPh1iB4jGkFpHKNExg9wEm5NxxamFF797bG3cf5aYFMh2D');
    await abaxTge.withSigner(signer).tx.registerReferrer('5FeXodVJgh6hvZs2ZniJyCZhpNjDxsm8bUXhsh3sCw7VzDT3');

    // await governor.withSigner(signer).tx.grantRole(roleToSelectorId('PARAMETERS_ADMIN' as any), auditorAddress);

    // await treasury.withSigner(signer).tx.grantRole(roleToSelectorId('PARAMETERS_ADMIN' as any), auditorAddress);
    // await treasury.withSigner(signer).tx.grantRole(roleToSelectorId('SPENDER'), auditorAddress);
    // await treasury.withSigner(signer).tx.grantRole(roleToSelectorId('CANCELLER'), auditorAddress);

    // await governor.withSigner(signer).tx.grantRole(roleToSelectorId('EXECUTOR'), auditorAddress);
    // await treasury.withSigner(signer).tx.grantRole(roleToSelectorId('EXECUTOR'), auditorAddress);

    // await governor.withSigner(signer).tx.grantRole(DEFAULT_ADMIN_ROLE, auditorAddress);
    // await treasury.withSigner(signer).tx.grantRole(DEFAULT_ADMIN_ROLE, auditorAddress);
    // await abaxTge.withSigner(signer).tx.grantRole(DEFAULT_ADMIN_ROLE, auditorAddress);

    deployments.push([
      {
        name: wAZERO.name,
        address: wAZERO.address,
        displayName: 'AZERO',
      },
      {
        name: 'usdc',
        address: USDC.address,
        displayName: 'USDC',
      },
      {
        name: abaxToken.name,
        address: abaxToken.address,
        displayName: 'ABAX',
      },
      {
        name: treasuryVester.name,
        address: treasuryVester.address,
        vestingFor: 'treasury',
      },
      {
        name: tgeVester.name,
        address: tgeVester.address,
        vestingFor: 'tge',
      },
      {
        name: governorVester.name,
        address: governorVester.address,
        vestingFor: 'abax_governor',
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
    ]);
  }

  await saveContractInfoToFileAsJson(deployments as any, deployPath.replace('.json', `${new Date().toISOString()}.json`));

  await api.disconnect();
  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
