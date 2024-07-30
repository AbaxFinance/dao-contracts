import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';

import AbaxTgeContract from 'typechain/contracts/abax_tge';

import '@c-forge/polkahat-chai-matchers';
import { BN } from 'bn.js';
import { expect } from 'chai';
import { ABAX_TGE_ADDRESS } from 'scripts/mainnetDeployment/utils';
import { roleToSelectorId } from 'tests/misc';
import { STAKEDROP_LIST } from './02_stakedropList';

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
  const stakedrop_admin = keyring.createFromUri(seed, {}, 'sr25519');

  const abaxTge = new AbaxTgeContract(ABAX_TGE_ADDRESS, stakedrop_admin, api);

  const hasRole = await abaxTge.query.hasRole(roleToSelectorId('STAKEDROP_ADMIN'), stakedrop_admin.address);
  expect(hasRole.value.ok).to.be.equal(true);

  const allStakedropEntries = Object.entries(STAKEDROP_LIST);
  const totalElements = allStakedropEntries.length;

  let completedElements = 0;
  for (const [staker, element] of allStakedropEntries) {
    const { abaxReward, contributedAzero } = element;
    await abaxTge.tx.stakedrop(abaxReward, ((BigInt(contributedAzero) * 4n) / 10n).toString(), staker);

    completedElements++;
    const progress = Math.floor((completedElements / totalElements) * 100);
    if (progress % 5 === 0) {
      console.log(`Progress: ${progress}%`);
    }
  }

  completedElements = 0;
  for (const [staker, element] of allStakedropEntries) {
    const { abaxReward } = element;
    const query = (await abaxTge.query.reservedFor(staker)).value!.ok!.toString();

    expect(query).to.be.greaterThanOrEqual(new BN(abaxReward)).and.to.be.lessThanOrEqual(new BN(abaxReward).muln(11).divn(10));

    completedElements++;
    const progress = Math.floor((completedElements / totalElements) * 100);
    if (progress % 5 === 0) {
      console.log(`Reserved for Verification Progress: ${progress}%`);
    }
  }

  completedElements = 0;
  for (const [staker, element] of allStakedropEntries) {
    const { contributedAzero } = element;
    const query = (await abaxTge.query.contributedAmountBy(staker)).value!.ok!.toString();

    expect(query).to.be.equal(((BigInt(contributedAzero) * 4n) / 10n).toString());

    completedElements++;
    const progress = Math.floor((completedElements / totalElements) * 100);
    if (progress % 5 === 0) {
      console.log(`Contributed Amount Progress: ${progress}%`);
    }
  }

  await abaxTge.tx.renounceRole(roleToSelectorId('STAKEDROP_ADMIN'), stakedrop_admin.address);

  await api.disconnect();
  process.exit(0);
})().catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
