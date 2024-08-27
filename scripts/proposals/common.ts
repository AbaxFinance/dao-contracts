import { Result, ResultBuilder } from '@c-forge/typechain-types';
import { KeyringPair } from '@polkadot/keyring/types';
import BN from 'bn.js';
import GovernorContract from 'typechain/contracts/governor';
import { Transaction } from 'typechain/types-arguments/governor';
import { GovernError } from 'typechain/types-returns/governor';

export async function tryPropose(
  governor: GovernorContract,
  proposer: KeyringPair,
  transactions: Transaction[],
  descriptionHash: string,
  descriptionUrl: string,
  earliestExecution: number | null = null,
): Promise<Result<{ proposalId: BN }, Error | GovernError>> {
  try {
    const query = await governor.withSigner(proposer).query.propose({ descriptionUrl, descriptionHash, transactions, earliestExecution });
    query.value.unwrapRecursively();
    const tx = await governor.withSigner(proposer).tx.propose({ descriptionUrl, descriptionHash, transactions, earliestExecution });
    const event = tx.events?.find((e) => e.name.includes('ProposalCreated'))?.args;
    return ResultBuilder.Ok({ proposalId: new BN(event.proposalId.toString()) });
  } catch (e: any) {
    return ResultBuilder.Err(e);
  }
}
