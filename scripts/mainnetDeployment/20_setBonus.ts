import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';

import AbaxTgeContract from 'typechain/contracts/abax_tge';

import { expect } from 'chai';
import { readFileSync } from 'fs-extra';
import { DEPLOYED_CONTRACTS_INFO_PATH, StoredContractInfo } from 'scripts/mainnetDeployment/10_deployContracts';
import { roleToSelectorId } from 'tests/misc';
import { BONUS_LIST } from './01_bonusList';

const ABAX_TGE_ADDRESS = (JSON.parse(readFileSync(DEPLOYED_CONTRACTS_INFO_PATH, 'utf-8')) as StoredContractInfo[]).find(
  (contract) => contract.name === 'abax_tge',
)!.address;

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
  const bonus_admin = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];

  const abaxTge = new AbaxTgeContract(ABAX_TGE_ADDRESS, bonus_admin, api);

  const hasRole = await abaxTge.query.hasRole(roleToSelectorId('BONUS_ADMIN'), bonus_admin.address);
  expect(hasRole.value.ok).to.be.equal(true);

  let completedElements = 0;
  const totalElements = BONUS_LIST.reduce((acc, element) => acc + element.address.length, 0);

  for (const element of BONUS_LIST) {
    const { address, xp } = element;
    for (const account of address) {
      await abaxTge.tx.setExpBonusMultiplierE3(account, xp);

      completedElements++;
      const progress = Math.floor((completedElements / totalElements) * 100);
      if (progress % 5 === 0) {
        console.log(`Progress: ${progress}%`);
      }
    }
  }

  completedElements = 0;
  for (const element of BONUS_LIST) {
    const { address, xp } = element;
    for (const account of address) {
      const query = (await abaxTge.query.expBonusMultiplierOfE3(account)).value!.ok!.toString();
      expect(query).to.be.equal(xp.toString());

      completedElements++;
      const progress = Math.floor((completedElements / totalElements) * 100);
      if (progress % 5 === 0) {
        console.log(`Progress: ${progress}%`);
      }
    }
  }

  await abaxTge.tx.renounceRole(roleToSelectorId('BONUS_ADMIN'), bonus_admin.address);

  await api.disconnect();
  process.exit(0);
})().catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
