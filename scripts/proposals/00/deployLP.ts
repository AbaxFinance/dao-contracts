import { getArgvObj } from '@abaxfinance/utils';
import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import { GOVERNOR_ADDRESS } from 'scripts/mainnetDeployment/utils';
import LendingPoolDeployer from 'typechain/deployers/lending_pool';

(async (args: Record<string, unknown>) => {
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
  const lendingPool = (await new LendingPoolDeployer(api, signer).new(GOVERNOR_ADDRESS)).contract;
  console.log(`lendingPool address: ${lendingPool.address}`);

  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
