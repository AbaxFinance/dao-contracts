import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import path from 'path';
import { getApiProviderWrapper, time, toE } from '@c-forge/polkahat-network-helpers';
import { getArgvObj } from '@abaxfinance/utils';

import AbaxTgeContract from 'typechain/contracts/abax_tge';

import { expect } from 'chai';
import { roleToSelectorId } from 'tests/misc';
import { BONUS_LIST } from './02_bonusList';

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
  const bonus_admin = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];

  const ABAX_TGE_ADDRESS = '';

  const abaxTge = new AbaxTgeContract(ABAX_TGE_ADDRESS, bonus_admin, api);

  const hasRole = await abaxTge.query.hasRole(roleToSelectorId('BONUS_ADMIN'), bonus_admin.address);
  expect(hasRole).to.be.equal(true);

  for (const element of BONUS_LIST) {
    const { account, bonus } = element;
    await abaxTge.tx.setExpBonusMultiplierE3(account, bonus);
  }

  for (const element of BONUS_LIST) {
    const { account, bonus } = element;
    const query = (await abaxTge.query.expBonusMultiplierOfE3(account)).value!.ok!.toString();

    expect(query).to.be.equal(bonus.toString());
  }
  await abaxTge.tx.renounceRole(roleToSelectorId('BONUS_ADMIN'), bonus_admin.address);

  await api.disconnect();
  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
