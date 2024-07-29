import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import path from 'path';
import { getApiProviderWrapper, time, toE } from '@c-forge/polkahat-network-helpers';
import { getArgvObj } from '@abaxfinance/utils';

import AbaxTgeContract from 'typechain/contracts/abax_tge';

import { STAKEDROP_LIST } from './01_stakedropList';
import { expect } from 'chai';
import { roleToSelectorId } from 'tests/misc';

export const DEFAULT_DEPLOYED_CONTRACTS_INFO_PATH = `${path.join(__dirname, 'deployedContracts.json')}`;

(async (args: Record<string, unknown>) => {
  if (require.main !== module) return;
  const outputJsonFolder = (args['path'] as string) ?? process.argv[2] ?? process.env.PWD;
  if (!outputJsonFolder) throw 'could not determine path';
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = process.env.SEED;
  if (!seed) throw 'could not determine seed';

  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const stakedrop_admin = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];

  const ABAX_TGE_ADDRESS = '';

  const abaxTge = new AbaxTgeContract(ABAX_TGE_ADDRESS, stakedrop_admin, api);

  const hasRole = await abaxTge.query.hasRole(roleToSelectorId('STAKEDROP_ADMIN'), stakedrop_admin.address);
  expect(hasRole).to.be.equal(true);

  for (const element of STAKEDROP_LIST) {
    const { staker, amountDropped, amountContributed } = element;
    await abaxTge.tx.stakedrop(amountDropped, amountContributed, staker);
  }

  for (const element of STAKEDROP_LIST) {
    const { staker, amountDropped } = element;
    const query = (await abaxTge.query.reservedFor(staker)).value!.ok!.toString();

    expect(query).to.be.equal(amountDropped.toString());
  }

  for (const element of STAKEDROP_LIST) {
    const { staker, amountContributed } = element;
    const query = (await abaxTge.query.contributedAmountBy(staker)).value!.ok!.toString();

    expect(query).to.be.equal(amountContributed.toString());
  }

  await abaxTge.tx.renounceRole(roleToSelectorId('STAKEDROP_ADMIN'), stakedrop_admin.address);

  await api.disconnect();
  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
