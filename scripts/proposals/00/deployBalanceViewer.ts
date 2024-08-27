import { getArgvObj } from '@abaxfinance/utils';
import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import BalanceViewerDeployer from 'typechain/deployers/balance_viewer';

const LENDING_POOL_ADDRESS = '<><><>';

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
  const balanceViewer = (await new BalanceViewerDeployer(api, signer).new(LENDING_POOL_ADDRESS)).contract;
  console.log(`BalanceViewer address: ${balanceViewer.address}`);

  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
