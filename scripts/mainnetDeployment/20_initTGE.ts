import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';

import AbaxTgeContract from 'typechain/contracts/abax_tge';

import { ABAX_TGE_ADDRESS } from 'scripts/mainnetDeployment/utils';
import { SEED } from 'scripts/mainnetDeployment/cfg_seed';

(async () => {
  if (require.main !== module) return;
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = SEED;

  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const signer = keyring.createFromUri(seed, {}, 'sr25519');

  const abaxTge = new AbaxTgeContract(ABAX_TGE_ADDRESS, signer, api);

  const initQueryRes = await abaxTge.withSigner(signer).query.init();
  console.log('init query res', initQueryRes.value);
  await abaxTge.withSigner(signer).tx.init();

  await api.disconnect();
  process.exit(0);
})().catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
