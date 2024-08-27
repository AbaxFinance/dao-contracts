import { getArgvObj } from '@abaxfinance/utils';
import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import { isEqual } from 'lodash';
import fetch from 'node-fetch';
import { GOVERNOR_ADDRESS } from 'scripts/mainnetDeployment/utils';
import { LENDING_POOL_ADDRESS } from 'scripts/proposals/01/consts';
import { tryPropose } from 'scripts/proposals/common';
import { paramsToInputNumbers } from 'tests/paramsHexConversionUtils';
import GovernorContract from 'typechain/contracts/governor';
import InitialPoolConfigProposalContract from 'typechain/contracts/initial_pool_config_proposal';
import LendingPoolContract from 'typechain/contracts/lending_pool';
import { Transaction } from 'typechain/types-arguments/governor';
import { GovernErrorBuilder } from 'typechain/types-returns/governor';

const INITIAL_POOL_CONFIG_PROPOSAL_ADDRESS = '5FSUbdCB2qpDCkpVDbvR8Kv6yV5TML7Y4Ax5eEVr3emfPHHU';

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

  const initialConfigProposalContract = new InitialPoolConfigProposalContract(INITIAL_POOL_CONFIG_PROPOSAL_ADDRESS, signer, api);

  console.log(`Initial config proposal address: ${initialConfigProposalContract.address}`);

  const lendingPool = new LendingPoolContract(LENDING_POOL_ADDRESS, signer, api);

  const message = lendingPool.abi.findMessage('AccessControl::grant_role');
  const params = paramsToInputNumbers(message.toU8a([0, initialConfigProposalContract.address]));

  const transactions: Transaction[] = [
    {
      callee: lendingPool.address,
      selector: params.selector,
      input: params.data,
      transferredValue: 0,
    },
  ];

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
