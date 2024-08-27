import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import { FOUNDATION_ADDRESS } from 'scripts/mainnetDeployment/00_constants';
import { LENDING_POOL_ADDRESS, PRICE_FEED_PROVIDER_ADDRESS } from 'scripts/proposals/01/consts';
import InitialPoolConfigProposalDeployer from 'typechain/deployers/initial_pool_config_proposal';

const EMERGENCY_ADMIN = FOUNDATION_ADDRESS;

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

  const initialConfigProposalContract = (
    await new InitialPoolConfigProposalDeployer(api, signer).new(LENDING_POOL_ADDRESS, PRICE_FEED_PROVIDER_ADDRESS, EMERGENCY_ADMIN)
  ).contract;

  console.log(`Initial config proposal address: ${initialConfigProposalContract.address}`);

  process.exit(0);
})().catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
