import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import { GOVERNOR_ADDRESS } from 'scripts/mainnetDeployment/utils';
import { roleToSelectorId } from 'tests/misc';
import PriceFeedProviderDeployer from 'typechain/deployers/price_feed_provider';

const TOKEN_ADDRESSES_BY_SYMBOL = {
  WAZERO: '5CtuFVgEUz13SFPVY6s2cZrnLDEkxQXc19aXrNARwEBeCXgg',
  USDC: '5FYFojNCJVFR2bBNKfAePZCa72ZcVX5yeTv8K9bzeUo8D83Z',
  WBTC: '5EEtCdKLyyhQnNQWWWPM1fMDx1WdVuiaoR9cA6CWttgyxtuJ',
  WETH: '5EoFQd36196Duo6fPTz2MWHXRzwTJcyETHyCyaB3rb61Xo2u',
  USDT: '5Et3dDcXUiThrBCot7g65k3oDSicGy4qC82cq9f911izKNtE',
};

const ORACLE_ADDRESS = '5F7wPCMXX65RmL8oiuAFNKu2ydhvgcissDZ3NWZ5X85n2WPG';

// Asset      Query String
// Bitcoin    BTC/USD
// Ether      ETH/USD
// USDC       USDC/USD
// USDT       USDT/USD
// DOT        DOT/USD
// SOL        SOL/USD
// AVAX       AVAX/USD
// EUR        EUR/USD
// BNB        BNB/USD
// DOGE       DOGE/USD
// MATIC      MATIC/USD
// DAI        DAI/USD
// AZERO      AZERO/USD

const DIA_TOKEN_SYMBOL_BY_PSP22_SYMBOL = {
  WBTC: 'BTC',
  WETH: 'ETH',
  USDC: 'USDC',
  USDT: 'USDT',
  WAZERO: 'AZERO',
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
  const signer = keyring.createFromUri(seed, {}, 'sr25519');

  // PREREQUISITES

  const priceFeedProvider = (await new PriceFeedProviderDeployer(api, signer).new(ORACLE_ADDRESS, signer.address)).contract;
  console.log(`Price feed provider address: ${priceFeedProvider.address}`);

  const parametersAdminRoleId = roleToSelectorId('PARAMETERS_ADMIN');
  await priceFeedProvider.tx.grantRole(parametersAdminRoleId, signer.address);

  for (const [tokenSymbol, tokenAddress] of Object.entries(TOKEN_ADDRESSES_BY_SYMBOL)) {
    await priceFeedProvider.tx.setAccountSymbol(tokenAddress, DIA_TOKEN_SYMBOL_BY_PSP22_SYMBOL[tokenSymbol] + '/USD');
  }

  await priceFeedProvider.tx.renounceRole(parametersAdminRoleId, signer.address);

  await priceFeedProvider.tx.grantRole(0, GOVERNOR_ADDRESS);
  await priceFeedProvider.tx.renounceRole(0, signer.address);

  process.exit(0);
})().catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
