import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';

import AbaxTgeContract from 'typechain/contracts/abax_tge';

import { expect } from 'chai';
import { ABAX_TGE_ADDRESS } from 'scripts/mainnetDeployment/utils';
import { roleToSelectorId } from 'tests/misc';
import { REFERRER_LIST } from './03_referrerList';

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
  const referrer_admin = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];

  const abaxTge = new AbaxTgeContract(ABAX_TGE_ADDRESS, referrer_admin, api);

  const hasRole = await abaxTge.query.hasRole(roleToSelectorId('REFERRER_ADMIN'), referrer_admin.address);
  expect(hasRole.value.ok).to.be.equal(true);

  for (const referrer of REFERRER_LIST) {
    await abaxTge.tx.registerReferrer(referrer);
  }

  for (const referrer of REFERRER_LIST) {
    const query = (await abaxTge.query.isReferrer(referrer)).value!.ok!;

    expect(query).to.be.equal(true);
  }

  // await abaxTge.tx.renounceRole(roleToSelectorId('REFERRER_ADMIN'), referrer_admin.address);

  await api.disconnect();
  process.exit(0);
})().catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
