import { getArgvObj } from '@abaxfinance/utils';
import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import { ApiPromise } from '@polkadot/api';
import Keyring from '@polkadot/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import chalk from 'chalk';
import { isEqual } from 'lodash';
import fetch from 'node-fetch';
import { GOVERNOR_ADDRESS } from 'scripts/mainnetDeployment/utils';
import { tryPropose } from 'scripts/proposals/common';
import { paramsToInputNumbers } from 'tests/paramsHexConversionUtils';
import GovernorContract from 'typechain/contracts/governor';
import InitialPoolConfigProposalContract from 'typechain/contracts/initial_pool_config_proposal';
import LendingPoolContract from 'typechain/contracts/lending_pool';
import { Transaction } from 'typechain/types-arguments/governor';
import { GovernErrorBuilder } from 'typechain/types-returns/governor';

const LENDING_POOL_ADDRESS = '5E6Z623CywgZ1tCSGcH5Aeqn588y95A8tPB6GxQBtwcbhs8d';
const INITIAL_POOL_CONFIG_PROPOSAL_ADDRESS = '5GSagDBrTg1Eghqoj4xhSJWx14LLEitj7ki5QN1gikDMFTUL';

(async (args: Record<string, unknown>) => {
  if (require.main !== module) return;
  const url = (args['url'] as string) ?? process.argv[2] ?? process.env.PWD;
  if (!url) throw 'could not determine input path';
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = process.env.SEED;
  if (!seed) throw 'could not determine seed';
  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const signer = keyring.createFromUri(seed, {}, 'sr25519');

  //fetch from url
  const proposalMD = await fetch(url).then((res) => res.text());
  const governor = new GovernorContract(GOVERNOR_ADDRESS, signer, api);

  const proposalHash = (await governor.query.hashDescription(proposalMD)).value.ok!;

  console.log(`Proposal description hash: ${proposalHash}`);

  const transactions: Transaction[] = await createTransactions(signer, api);

  if (transactions.length === 0) {
    console.log('No transactions to propose');
    process.exit(0);
  }

  const qres = await tryPropose(governor, signer, transactions, proposalHash.toString(), url);

  if (isEqual(GovernErrorBuilder.InsuficientVotes(), qres.err)) {
    console.log('Insuficient votes');
    const vABAXBalance = await governor.query.balanceOf(signer.address);
    console.log(`vABAX balance: ${vABAXBalance.value.unwrap().toString()}`);
    process.exit(0);
  }
  const res = qres.unwrap();

  console.log(`Proposal id: ${res.proposalId.toString()}`);

  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
async function createTransactions(signer: KeyringPair, api: ApiPromise): Promise<Transaction[]> {
  //TODO: Implement this function
  return [];
}
