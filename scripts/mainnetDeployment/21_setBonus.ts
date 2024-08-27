import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';

import AbaxTgeContract from 'typechain/contracts/abax_tge';

import { expect } from 'chai';
import { readFileSync } from 'fs-extra';
import { DEPLOYED_CONTRACTS_INFO_PATH, StoredContractInfo } from 'scripts/mainnetDeployment/10_deployContracts';
import { roleToSelectorId } from 'tests/misc';
import { BONUS_LIST } from './01_bonusList';
import { SEED } from 'scripts/mainnetDeployment/cfg_seed';

const ABAX_TGE_ADDRESS = (JSON.parse(readFileSync(DEPLOYED_CONTRACTS_INFO_PATH, 'utf-8')) as StoredContractInfo[]).find(
  (contract) => contract.name === 'abax_tge',
)!.address;

(async () => {
  if (require.main !== module) return;
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = SEED;

  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const bonus_admin = keyring.createFromUri(seed, {}, 'sr25519'); // getSigners()[0];

  const abaxTge = new AbaxTgeContract(ABAX_TGE_ADDRESS, bonus_admin, api);

  const hasRole = await abaxTge.query.hasRole(roleToSelectorId('BONUS_ADMIN'), bonus_admin.address);
  expect(hasRole.value.ok).to.be.equal(true);

  const totalElements = BONUS_LIST.reduce((acc, element) => acc + element.address.length, 0);

  let completedElements = 0;
  let lastLoggedProgress = -1;
  // for (const element of BONUS_LIST) {
  for (let i = 0; i < BONUS_LIST.length; i++) {
    const element = BONUS_LIST[i];
    const { address, xp } = element;
    // for (const account of address) {
    for (let j = 0; j < address.length; j++) {
      const account = address[j];
      console.log('processing i', i, 'j', j, 'account', account);
      await abaxTge.tx.setExpBonusMultiplierE3(account, xp);

      completedElements++;
      const progress = Math.floor((completedElements / totalElements) * 100);
      if (progress % 5 === 0 && progress !== lastLoggedProgress) {
        console.log(`Progress: ${progress}%`);
        lastLoggedProgress = progress;
      }
    }
  }

  completedElements = 0;
  console.log('Checking the set values (xp)');
  for (const element of BONUS_LIST) {
    const { address, xp } = element;
    for (const account of address) {
      const query = (await abaxTge.query.expBonusMultiplierOfE3(account)).value!.ok!.toString();
      expect(query).to.be.equal(xp.toString());

      completedElements++;
      const progress = Math.floor((completedElements / totalElements) * 100);
      if (progress % 5 === 0 && progress !== lastLoggedProgress) {
        console.log(`Progress: ${progress}%`);
        lastLoggedProgress = progress;
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
