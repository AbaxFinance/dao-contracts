import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';

import AbaxTgeContract from 'typechain/contracts/abax_tge';

import { expect } from 'chai';
import { ABAX_TGE_ADDRESS } from 'scripts/mainnetDeployment/utils';
import { roleToSelectorId } from 'tests/misc';
import { REFERRER_LIST } from './03_referrerList';
import { SEED } from 'scripts/mainnetDeployment/cfg_seed';
import { FOUNDATION_ADDRESS, FOUNDERS_ADDRESS } from 'scripts/mainnetDeployment/00_constants';
import AbaxTokenContract from 'typechain/contracts/abax_token';

(async () => {
  if (require.main !== module) return;
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = SEED;

  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const signer = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];
  const abaxToken = new AbaxTokenContract('5DfSpEnVDLgyf4Gkwwgh8JSeNbCGE89Fo9QgtZ4LfTC6Rh95', signer, api);

  console.log();
  // const TREASURY_ADDR = '5CzYtzUeyyEJjErAXTSPscNcxk5eiNb1UdovoWt4yoUzVJZd';
  // const foundersBalancePre = await abaxToken.query.balanceOf(FOUNDERS_ADDRESS);
  // const foundationBalancePre = await abaxToken.query.balanceOf(FOUNDATION_ADDRESS);
  // const treasuryBalancePre = await abaxToken.query.balanceOf(TREASURY_ADDR);

  // console.log('foundersBalance', foundersBalancePre.value.ok?.toString());
  // console.log('foundationBalance', foundationBalancePre.value.ok?.toString());
  // console.log('treasuryBalance', treasuryBalancePre.value.ok?.toString());

  const abaxTge = new AbaxTgeContract('5H6BtP9CYM4XUWpqqgAaVvha67SMxFqFveu66TKJ81Ljn1b1', signer, api);

  const qrs = await abaxTge.query.isReferrer(FOUNDATION_ADDRESS);
  console.log('qrs', qrs.value.ok);
  // console.log('QUERY 1');
  // const qrs1 = await abaxTge.query.collectReserved(FOUNDERS_ADDRESS);
  // console.log('QUERY 2');
  // const qrs2 = await abaxTge.query.collectReserved(FOUNDATION_ADDRESS);
  // console.log('QUERY 3');
  // const qrs3 = await abaxTge.query.collectReserved(TREASURY_ADDR);

  // cons

  // console.log('QUERY RESULTS');
  // console.log(qrs1.value);
  // console.log(qrs2.value);
  // console.log(qrs3.value);
  // await abaxTge.tx.collectReserved(TREASURY_ADDR);
  // // await abaxTge.tx.collectReserved(FOUNDERS_ADDRESS);
  // // await abaxTge.tx.collectReserved(FOUNDATION_ADDRESS);

  // const foundersBalance = await abaxToken.query.balanceOf(FOUNDERS_ADDRESS);
  // const foundationBalance = await abaxToken.query.balanceOf(FOUNDATION_ADDRESS);
  // const treasuryBalance = await abaxToken.query.balanceOf(TREASURY_ADDR);

  // console.log('foundersBalance', foundersBalance.value.ok?.toString());
  // console.log('foundationBalance', foundationBalance.value.ok?.toString());
  // console.log('treasuryBalance', treasuryBalance.value.ok?.toString());

  await api.disconnect();
  process.exit(0);
})().catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
