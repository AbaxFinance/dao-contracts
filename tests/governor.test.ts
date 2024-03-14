import type { KeyringPair } from '@polkadot/keyring/types';
import BN from 'bn.js';
import { isEqual } from 'lodash';
import { ABAX_DECIMALS, ContractRole } from 'tests/consts';
import { testStaking } from 'tests/governor.stake.test';
import { expect } from 'tests/setup/chai';
import FlipperContract from 'typechain/contracts/flipper';
import Governor from 'typechain/contracts/governor';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';
import FlipperDeployer from 'typechain/deployers/flipper';
import GovernorDeployer from 'typechain/deployers/governor';
import Psp22EmitableDeployer from 'typechain/deployers/psp22_emitable';
import VesterDeployer from 'typechain/deployers/vester';
import { ProposalCreated } from 'typechain/event-types/governor';
import { Proposal, Transaction, VotingRules } from 'typechain/types-arguments/governor';
import { GovernError, GovernErrorBuilder, ProposalStatus, Vote } from 'typechain/types-returns/governor';
import { ONE_DAY } from 'wookashwackomytest-polkahat-chai-matchers';
import { E12bn, duration, generateRandomSignerWithBalance, getSigners, localApi, time } from 'wookashwackomytest-polkahat-network-helpers';
import { numbersToHex, paramsToInputNumbers } from './paramsHexConversionUtils';

const [deployer, other] = getSigners();
const ONE_TOKEN = new BN(10).pow(new BN(ABAX_DECIMALS));

const smallStake = ONE_TOKEN;
const midStake = smallStake.muln(10);
const bigStake = midStake.muln(10);

export const UNSTAKE_PERIOD = ONE_DAY.muln(6 * 30); // 180 days

const VOTING_RULES: VotingRules = {
  minimumStakePartE3: 10,
  proposerDepositPartE3: 100,
  initialPeriod: ONE_DAY.muln(3),
  flatPeriod: ONE_DAY.muln(7),
  finalPeriod: ONE_DAY.muln(4),
};

async function proposeAndCheck(
  governor: Governor,
  proposer: KeyringPair,
  transactions: Transaction[],
  description: string,
  earliestExecution: number | null = null,
  expectedError?: GovernError,
) {
  let proposalId = new BN(-1);
  const descriptionHash = (await governor.query.hashDescription(description)).value.ok!;
  const query = governor.withSigner(proposer).query.propose({ descriptionHash, transactions, earliestExecution }, description);
  if (expectedError) {
    await expect(query).to.be.revertedWithError(expectedError);
  } else {
    await expect(query).to.haveOkResult();
    const tx = governor.withSigner(proposer).tx.propose({ descriptionHash, transactions, earliestExecution }, description);
    await expect(tx).to.emitEvent(governor, 'ProposalCreated', (event: ProposalCreated) => {
      proposalId = new BN(event.proposalId.toString());
      return (
        event.proposal.earliestExecution?.toString() === earliestExecution?.toString() &&
        event.proposal.descriptionHash === descriptionHash &&
        isEqual(
          event.proposal.transactions.map((t) => ({
            ...t,
            callee: t.callee.toString(),
            transferredValue: t.transferredValue.toString(),
            input: t.input.toString(),
            selector: t.selector.toString(),
          })),
          transactions.map((t) => ({
            ...t,
            callee: t.callee.toString(),
            transferredValue: t.transferredValue.toString(),
            input: '0x' + numbersToHex(t.input),
            selector: '0x' + numbersToHex(t.selector),
          })),
        )
      );
    });

    //votes for should be initiated to proposer deposit
    // TODO ideally checks that won't check state 1v1
  }

  return [proposalId, descriptionHash.toString()] as const;
}

async function voteAndCheck(governor: Governor, voter: KeyringPair, proposalId: BN, vote: Vote, expectedError?: GovernError) {
  const query = governor.withSigner(voter).query.vote(proposalId, vote, []);
  if (expectedError) {
    await expect(query).to.be.revertedWithError(expectedError);
  } else {
    await expect(query).to.haveOkResult();
    const tx = governor.withSigner(voter).tx.vote(proposalId, vote, []);
    await expect(tx).to.emitEvent(governor, 'VoteCasted', {
      account: voter.address,
      proposalId,
      vote,
    });

    //proposal's state updated ? ideally checks that won't check state 1v1
  }
}

async function finalizeAndCheck(governor: Governor, voter: KeyringPair, proposalId: BN, expectedOutcome: ProposalStatus | GovernError) {
  const isErrorExpected = typeof expectedOutcome !== 'string';
  const query = governor.withSigner(voter).query.finalize(proposalId);
  if (isErrorExpected) {
    await expect(query).to.be.revertedWithError(expectedOutcome);
  } else {
    await expect(query).to.haveOkResult();
    const tx = governor.withSigner(voter).tx.finalize(proposalId);
    if (expectedOutcome) {
      await expect(tx).to.emitEvent(governor, 'ProposalFinalized', {
        proposalId,
        status: expectedOutcome,
      });
    }
    // TODO ideally checks that won't check state 1v1
  }
}

async function executeAndCheck(governor: Governor, voter: KeyringPair, proposalId: BN, proposal: Proposal, expectedError?: GovernError) {
  const query = governor.withSigner(voter).query.execute(proposal);
  if (expectedError) {
    await expect(query).to.be.revertedWithError(expectedError);
  } else {
    await expect(query).to.haveOkResult();
    const tx = governor.withSigner(voter).tx.execute(proposal);
    await expect(tx).to.emitEvent(governor, 'ProposalExecuted', {
      proposalId: proposalId,
    });
  }
}

describe('Governor', () => {
  let governor: Governor;
  let token: PSP22Emitable;
  let vester: Vester;
  const voters: KeyringPair[] = [];

  before(async () => {
    const api = await localApi.get();
    for (let i = 0; i < 10; i++) {
      const voter = await generateRandomSignerWithBalance(api);
      voters.push(voter);
    }
    const now = Date.now();
    await time.setTo(now);
  });

  beforeEach(async () => {
    const api = await localApi.get();
    token = (await new Psp22EmitableDeployer(api, deployer).new('Token', 'TOK', ABAX_DECIMALS)).contract;
    vester = (await new VesterDeployer(api, deployer).new()).contract;
    governor = (await new GovernorDeployer(api, deployer).new(token.address, vester.address, UNSTAKE_PERIOD, 'Governor Votes', 'VOTE', VOTING_RULES))
      .contract;
  });

  describe('after deployment', () => {
    it('should have correct name', async () => {
      await expect(governor.query.tokenName()).to.haveOkResult('Governor Votes');
    });
    it('should have correct symbol', async () => {
      await expect(governor.query.tokenSymbol()).to.haveOkResult('VOTE');
    });
    it('should have correct decimals', async () => {
      await expect(governor.query.tokenDecimals()).to.haveOkResult(ABAX_DECIMALS);
    });
    it('should have 0 total supply', async () => {
      await expect(governor.query.totalSupply()).to.haveOkResult(0);
    });
    it('should have a vester account set', async () => {
      await expect(governor.query.vester()).to.haveOkResult(vester.address);
    });
    it('should provide correct vesting schedule info', async () => {
      await expect(governor.query.getWaitingAndVestingDurations()).to.haveOkResult([0, UNSTAKE_PERIOD]);
    });
    it('should have correct voting rules', async () => {
      await expect(governor.query.rules()).to.haveOkResult(VOTING_RULES);
    });
  });

  describe('PSP22 transfers', () => {
    it('transfer should fail with "Transfer is not allowed"', async () => {
      await expect(governor.query.transfer(other.address, 1, [])).to.be.revertedWithError({ custom: 'Untransferrable' });
    });
    it('transferFrom should fail with "Transfer is not allowed"', async () => {
      await expect(governor.query.transferFrom(other.address, other.address, 1, [])).to.be.revertedWithError({ custom: 'Untransferrable' });
    });
  });

  describe(' There is 6 stakers (user0,...,user5), with stake proportions 100,100,10,10,1,1', () => {
    let totalStake: BN;
    beforeEach(async () => {
      await token.tx.mint(voters[0].address, bigStake);
      await token.tx.mint(voters[1].address, bigStake);
      await token.tx.mint(voters[2].address, midStake);
      await token.tx.mint(voters[3].address, midStake);
      await token.tx.mint(voters[4].address, smallStake);
      await token.tx.mint(voters[5].address, smallStake);

      await token.withSigner(voters[0]).tx.approve(governor.address, bigStake);
      await token.withSigner(voters[1]).tx.approve(governor.address, bigStake);
      await token.withSigner(voters[2]).tx.approve(governor.address, midStake);
      await token.withSigner(voters[3]).tx.approve(governor.address, midStake);
      await token.withSigner(voters[4]).tx.approve(governor.address, smallStake);
      await token.withSigner(voters[5]).tx.approve(governor.address, smallStake);

      await governor.withSigner(voters[0]).tx.deposit(bigStake, voters[0].address);
      await governor.withSigner(voters[1]).tx.deposit(bigStake, voters[1].address);
      await governor.withSigner(voters[2]).tx.deposit(midStake, voters[2].address);
      await governor.withSigner(voters[3]).tx.deposit(midStake, voters[3].address);
      await governor.withSigner(voters[4]).tx.deposit(smallStake, voters[4].address);
      await governor.withSigner(voters[5]).tx.deposit(smallStake, voters[5].address);
      totalStake = bigStake.muln(2).add(midStake.muln(2)).add(smallStake.muln(2));
    });

    it('state', async () => {
      await expect(governor.query.balanceOf(voters[0].address)).to.haveOkResult(bigStake);
      await expect(governor.query.balanceOf(voters[1].address)).to.haveOkResult(bigStake);
      await expect(governor.query.balanceOf(voters[2].address)).to.haveOkResult(midStake);
      await expect(governor.query.balanceOf(voters[3].address)).to.haveOkResult(midStake);
      await expect(governor.query.balanceOf(voters[4].address)).to.haveOkResult(smallStake);
      await expect(governor.query.balanceOf(voters[5].address)).to.haveOkResult(smallStake);
    });

    describe('Proposing:', () => {
      it('user4 trying to propose with insufficient Votes', async () => {
        const description = 'Abax will be the best ;-)';
        await proposeAndCheck(governor, voters[4], [], description, null, GovernErrorBuilder.InsuficientVotes());
      });
      it('user0 successfully creates proposal', async () => {
        const description = 'Abax will be the best ;-)';
        await proposeAndCheck(governor, voters[0], [], description, undefined);
      });

      it('user0 tries to submit the same proposal twice', async () => {
        const description = 'Abax will be the best ;-)';
        await proposeAndCheck(governor, voters[0], [], description);
        await proposeAndCheck(governor, voters[0], [], description, null, GovernErrorBuilder.ProposalAlreadyExists());
      });
      it('user0 tries to submit the same proposal twice - with earliestExecution', async () => {
        const description = 'Abax will be the best ;-)';
        const earliestExecution = (await time.latest()) + duration.days(1);
        await proposeAndCheck(governor, voters[0], [], description, earliestExecution);
        await proposeAndCheck(governor, voters[0], [], description, earliestExecution, GovernErrorBuilder.ProposalAlreadyExists());
      });

      it('user1 tries to submit proposal after user 0 already submitted it', async () => {
        const description = 'Abax will be the best ;-)';
        await proposeAndCheck(governor, voters[0], [], description, undefined);
        await proposeAndCheck(governor, voters[1], [], description, null, GovernErrorBuilder.ProposalAlreadyExists());
      });
      it('user1 tries to submit proposal after user 0 already submitted it - with earliestExecution', async () => {
        const description = 'Abax will be the best ;-)';
        const earliestExecution = (await time.latest()) + duration.days(1);
        await proposeAndCheck(governor, voters[0], [], description, earliestExecution);
        await proposeAndCheck(governor, voters[1], [], description, earliestExecution, GovernErrorBuilder.ProposalAlreadyExists());
      });
    });
    describe('Voting', () => {
      const description = 'Abax will be the best ;-)';
      let proposalId: BN;
      beforeEach(async () => {
        [proposalId] = await proposeAndCheck(governor, voters[0], [], description, undefined);
      });
      it('user6 with no stake tries to vote', async () => {
        await voteAndCheck(governor, voters[6], proposalId, Vote.agreed, GovernErrorBuilder.InsuficientVotes());
      });
      it('user0 tries to vote for non existing proposal', async () => {
        await voteAndCheck(governor, voters[0], new BN(1337), Vote.agreed, GovernErrorBuilder.ProposalDoesntExist());
      });
      it('user0 tries to vote after proposal is finalized ', async () => {
        await time.increase(duration.days(22));
        (await governor.query.finalize(proposalId)).value.unwrapRecursively();
        await governor.tx.finalize(proposalId);
        await voteAndCheck(governor, voters[0], proposalId, Vote.agreed, GovernErrorBuilder.WrongStatus());
      });
      it('many users can vote using different vote types', async () => {
        await voteAndCheck(governor, voters[0], proposalId, Vote.agreed);
        await voteAndCheck(governor, voters[1], proposalId, Vote.disagreedWithProposerSlashing);
        await voteAndCheck(governor, voters[2], proposalId, Vote.disagreed);
        await voteAndCheck(governor, voters[3], proposalId, Vote.disagreed);
        await voteAndCheck(governor, voters[4], proposalId, Vote.disagreedWithProposerSlashing);
      });
    });
    describe('Finalize', () => {
      const description = 'Abax will be the best ;-)';
      let proposalId: BN;
      beforeEach(async () => {
        [proposalId] = await proposeAndCheck(governor, voters[0], [], description, undefined);
      });
      it('user tries to finalize proposal that doesnt exist', async () => {
        await finalizeAndCheck(governor, voters[6], new BN(1337), GovernErrorBuilder.ProposalDoesntExist());
      });
      it('user tries to finalize proposal that doesnt meet finalization condition', async () => {
        await finalizeAndCheck(governor, voters[6], proposalId, GovernErrorBuilder.FinalizeCondition());
      });
      describe(`all stakers votes for 'agree`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[0], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[1], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[2], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[3], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[4], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[5], proposalId, Vote.agreed);
        });
        it('user is able to finalize succesfully', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.succeeded);
        });
        it('same proposal cannot be finalized multiple times', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.succeeded);
          await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.WrongStatus());
        });
      });
      describe(`all stakers votes for 'disagree`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[0], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[1], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[2], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[3], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[4], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[5], proposalId, Vote.disagreed);
        });
        it('user finalizes succesfully', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeated);
        });
      });
      describe(`all stakers vote for 'disagreedWithProposerSlashing'`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[0], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[1], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[2], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[3], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[4], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[5], proposalId, Vote.disagreedWithProposerSlashing);
        });
        it('user finalizes succesfully', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeatedWithSlash);
        });
      });
      describe(`all stakers votes for disagree or disagreedWithProposerSlashing, but most for disagreed`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[0], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[1], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[2], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[3], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[4], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[5], proposalId, Vote.disagreed);
        });
        it('user finalizes succesfully', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeated);
        });
      });
      describe(`all stakers votes for disagree or disagreedWithProposerSlashing, but most for disagreedWithProposerSlashing`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[0], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[1], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[2], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[3], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[4], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[5], proposalId, Vote.disagreedWithProposerSlashing);
        });
        it('user finalizes succesfully', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeatedWithSlash);
        });
      });
      describe(`more than 50% votes for agree, rest disagree`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[0], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[1], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[2], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[3], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[4], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[5], proposalId, Vote.agreed);
        });
        it('user tries to finalize that doesnt meet finalization condition', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
        });
        testFinalizationOverTime(() => ({
          proposalId,
          governor,
          finalizator: voters[0],
          expectedProposalStatus: ProposalStatus.succeeded,
        }));
      });
      describe(`more than 50% votes for disagree(most) or disagreedWithProposerSlashing, rest agree`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[0], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[1], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[2], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[3], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[4], proposalId, Vote.disagreed);
          await voteAndCheck(governor, voters[5], proposalId, Vote.disagreed);
        });
        it('user tries to finalize that doesnt meet finalization condition', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
        });
        testFinalizationOverTime(() => ({
          proposalId,
          governor,
          finalizator: voters[0],
          expectedProposalStatus: ProposalStatus.defeated,
        }));
      });
      describe(`more than 50% votes for disagreedWithProposerSlashing, rest disagree`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[0], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[1], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[2], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[3], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[4], proposalId, Vote.disagreedWithProposerSlashing);
          await voteAndCheck(governor, voters[5], proposalId, Vote.disagreedWithProposerSlashing);
        });
        it('user tries to finalize that doesnt meet finalization condition', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
        });
        testFinalizationOverTime(() => ({
          proposalId,
          governor,
          finalizator: voters[0],
          expectedProposalStatus: ProposalStatus.defeatedWithSlash,
        }));
      });
      describe(`only small % votes for agree, rest didnt vote`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[5], proposalId, Vote.agreed);
        });
        it('user tries to finalize that doesnt meet finalization condition', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
        });
        describe(`then 3 days passes`, () => {
          beforeEach(async () => {
            await time.increase(duration.days(3));
          });
          it('user tries to finalize that doesnt meet finalization condition', async () => {
            await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
          });
          describe(`then 7 days passes`, () => {
            beforeEach(async () => {
              await time.increase(duration.days(7));
            });
            it('user tries to finalize that doesnt meet finalization condition', async () => {
              await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
            });
            describe(`then 4 days minus 1 second passes`, () => {
              beforeEach(async () => {
                await time.increase(duration.days(4) - 1);
              });
              it('user is able to finalize succesfully as in final period treshold is almost 0', async () => {
                await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.succeeded);
              });
              describe(`then 2 second pass`, () => {
                beforeEach(async () => {
                  await time.increase(2);
                });
                it('user is able to finalize succesfully as in final period treshold goes to 0 is reached', async () => {
                  await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.succeeded);
                });
              });
            });
          });
        });
      });
      describe(`only small % votes for disagreed, rest didnt vote`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[5], proposalId, Vote.disagreed);
        });
        it('user tries to finalize that doesnt meet finalization condition', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
        });
        describe(`then 3 days passes`, () => {
          beforeEach(async () => {
            await time.increase(duration.days(3));
          });
          it('user tries to finalize that doesnt meet finalization condition', async () => {
            await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
          });
          describe(`then 7 days passes`, () => {
            beforeEach(async () => {
              await time.increase(duration.days(7));
            });
            it('user tries to finalize that doesnt meet finalization condition', async () => {
              await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
            });
            describe(`then 4 days minus 1 second passes`, () => {
              beforeEach(async () => {
                await time.increase(duration.days(4) - 1);
              });
              it('user is able to finalize succesfully as in final period treshold is almost 0', async () => {
                await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeated);
              });
              describe(`then 2 second pass`, () => {
                beforeEach(async () => {
                  await time.increase(2);
                });
                it('user is able to finalize succesfully as in final period treshold goes to 0 is reached', async () => {
                  await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeated);
                });
              });
            });
          });
        });
      });
      describe(`only small % votes for disagreedWithProposerSlashing, rest didnt vote`, () => {
        beforeEach(async () => {
          await voteAndCheck(governor, voters[1], proposalId, Vote.disagreedWithProposerSlashing);
        });
        it('user tries to finalize that doesnt meet finalization condition', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
        });
        describe(`then 3 days passes`, () => {
          beforeEach(async () => {
            await time.increase(duration.days(3));
          });
          it('user tries to finalize that doesnt meet finalization condition', async () => {
            await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
          });
          describe(`then 7 days passes`, () => {
            beforeEach(async () => {
              await time.increase(duration.days(7));
            });
            it('user tries to finalize that doesnt meet finalization condition', async () => {
              await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
            });
            describe(`then 4 days minus 1 second passes`, () => {
              beforeEach(async () => {
                await time.increase(duration.days(4) - 1);
              });
              it('user is able to finalize succesfully as in final period treshold is almost 0', async () => {
                await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeatedWithSlash);
              });
              describe(`then 2 second pass`, () => {
                beforeEach(async () => {
                  await time.increase(2);
                });
                it('user is able to finalize succesfully as in final period treshold goes to 0 is reached', async () => {
                  await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeatedWithSlash);
                });
              });
            });
          });
        });
      });
      describe(`no one has voted`, () => {
        it('user tries to finalize that doesnt meet finalization condition', async () => {
          await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
        });
        describe(`then 3 days passes`, () => {
          beforeEach(async () => {
            await time.increase(duration.days(3));
          });
          it('user tries to finalize that doesnt meet finalization condition', async () => {
            await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
          });
          describe(`then 7 days passes`, () => {
            beforeEach(async () => {
              await time.increase(duration.days(7));
            });
            it('user tries to finalize that doesnt meet finalization condition', async () => {
              await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
            });
            describe(`then 4 days minus 1 second passes`, () => {
              beforeEach(async () => {
                await time.increase(duration.days(4) - 1);
              });
              it('user tries to finalize that doesnt meet finalization condition', async () => {
                await finalizeAndCheck(governor, voters[0], proposalId, GovernErrorBuilder.FinalizeCondition());
              });
              describe(`then 2 second passes`, () => {
                beforeEach(async () => {
                  await time.increase(2);
                });
                it('user tries to finalize that doesnt meet finalization condition', async () => {
                  await finalizeAndCheck(governor, voters[0], proposalId, ProposalStatus.defeated);
                });
              });
            });
          });
        });
      });
    });
    describe('Finalize - minimum to finalize', () => {
      let proposalId: BN;
      let maliciousActor: KeyringPair;
      const maliciousActorStake = bigStake.muln(10);
      beforeEach(async () => {
        maliciousActor = voters[7];
        await token.tx.mint(maliciousActor.address, maliciousActorStake);
        await token.withSigner(maliciousActor).tx.approve(governor.address, maliciousActorStake);
      });
      describe(`proposal gets created & votes get casted before him`, () => {
        beforeEach(async () => {
          [proposalId] = await proposeAndCheck(governor, voters[0], [], 'does not matter', undefined);
          await voteAndCheck(governor, voters[0], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[1], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[2], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[3], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[4], proposalId, Vote.agreed);
          await voteAndCheck(governor, voters[5], proposalId, Vote.agreed);
        });
        describe(`then 3 days passes`, () => {
          beforeEach(async () => {
            await time.increase(duration.days(3));
          });
          it('unstaking has no effect on minimum to finalize', async () => {
            const minmumToFinalizeBefore = (await governor.query.minimumToFinalize(proposalId)).value.unwrap()!;
            const balanceOfVoter7Before = (await governor.query.balanceOf(voters[7].address)).value.unwrap()!;
            await governor.withSigner(voters[7]).tx.withdraw(balanceOfVoter7Before, voters[7].address, voters[7].address);
            const minmumToFinalizeAfter = (await governor.query.minimumToFinalize(proposalId)).value.unwrap()!;
            expect(minmumToFinalizeBefore).to.equal(minmumToFinalizeAfter);
          });

          it('staking additional amount raises minimum to finalize', async () => {
            const minmumToFinalizeBefore = (await governor.query.minimumToFinalize(proposalId)).value.unwrap()!;
            await governor.withSigner(voters[7]).tx.deposit(midStake.divn(2), voters[7].address);
            const minmumToFinalizeAfter = (await governor.query.minimumToFinalize(proposalId)).value.unwrap()!;
            expect(minmumToFinalizeBefore).to.be.lt(minmumToFinalizeAfter);
          });
        });
      });
      describe(`malicious actor creates a proposal`, () => {
        beforeEach(async () => {
          await governor.withSigner(maliciousActor).tx.deposit(bigStake.add(smallStake), maliciousActor.address);
          [proposalId] = await proposeAndCheck(governor, maliciousActor, [], 'malicious proposal');
        });
        it('malicious actor cannot finalize proposal himself', async () => {
          await voteAndCheck(governor, maliciousActor, proposalId, Vote.agreed);
          await finalizeAndCheck(governor, maliciousActor, proposalId, GovernErrorBuilder.FinalizeCondition());
        });
        describe(`then he immediately stakes the rest of tokens`, () => {
          beforeEach(async () => {
            await governor.withSigner(maliciousActor).tx.deposit(maliciousActorStake.sub(bigStake.add(smallStake)), maliciousActor.address);
          });
          it('malicious actor votes & tries to finalize proposal - fails to', async () => {
            await voteAndCheck(governor, maliciousActor, proposalId, Vote.agreed);
            await finalizeAndCheck(governor, maliciousActor, proposalId, GovernErrorBuilder.FinalizeCondition());
          });
        });
      });
      describe(`Malicious actor creates a proposal with big stake acc and waits a day`, () => {
        let maliciousActorUnstakeAcc: KeyringPair;
        let maliciousActorUnstakeAccStake: BN;
        beforeEach(async () => {
          maliciousActorUnstakeAcc = voters[8];
          maliciousActorUnstakeAccStake = totalStake.clone();
          await token.tx.mint(maliciousActorUnstakeAcc.address, maliciousActorUnstakeAccStake);
          await token.withSigner(maliciousActorUnstakeAcc).tx.approve(governor.address, maliciousActorUnstakeAccStake);
          await governor.withSigner(maliciousActorUnstakeAcc).tx.deposit(maliciousActorUnstakeAccStake, maliciousActorUnstakeAcc.address);
          [proposalId] = await proposeAndCheck(governor, maliciousActorUnstakeAcc, [], 'malicious proposal');
          await time.increase(duration.days(1));
        });

        it(`malicious actor votes, immediately unstakes to lower total supply & force finalize proposal => \n => fails to as unstaking does not lower threshold of proposals already submitted`, async () => {
          const maliciousActorUnstakeAccBalance = (await governor.query.balanceOf(maliciousActorUnstakeAcc.address)).value.unwrap()!;
          await voteAndCheck(governor, maliciousActorUnstakeAcc, proposalId, Vote.agreed);
          await governor
            .withSigner(maliciousActorUnstakeAcc)
            .tx.withdraw(maliciousActorUnstakeAccBalance, maliciousActorUnstakeAcc.address, maliciousActorUnstakeAcc.address);
          await finalizeAndCheck(governor, maliciousActor, proposalId, GovernErrorBuilder.FinalizeCondition());
        });
      });
    });
    describe('Execute', () => {
      const description = 'Abax will be the best ;-)';
      let proposalId: BN;
      let descriptionHash: string;
      let executor: KeyringPair;
      beforeEach(async () => {
        executor = voters[9];
        await governor.withSigner(deployer).tx.grantRole(ContractRole.EXECUTOR, executor.address);
      });
      describe(`earliestExecution is not set`, () => {
        beforeEach(async () => {
          [proposalId, descriptionHash] = await proposeAndCheck(governor, voters[0], [], description, undefined);
        });
        it('user0 tries to execute non-existing proposal', async () => {
          await executeAndCheck(
            governor,
            executor,
            proposalId,
            { descriptionHash: '', transactions: [], earliestExecution: null },
            GovernErrorBuilder.ProposalDoesntExist(),
          );
        });
        it('user0 tries to execute active proposal', async () => {
          await executeAndCheck(
            governor,
            executor,
            proposalId,
            { descriptionHash, transactions: [], earliestExecution: null },
            GovernErrorBuilder.WrongStatus(),
          );
        });
        describe(`proposal is finalized with defeated`, () => {
          beforeEach(async () => {
            await governor.withSigner(voters[0]).tx.vote(proposalId, Vote.disagreed, []);
            await governor.withSigner(voters[2]).tx.vote(proposalId, Vote.disagreed, []);
            await governor.withSigner(voters[3]).tx.vote(proposalId, Vote.disagreed, []);

            await time.increase(duration.days(9));
            await governor.tx.finalize(proposalId);
          });
          it('user0 tries to execute defeated proposal', async () => {
            await executeAndCheck(
              governor,
              executor,
              proposalId,
              { descriptionHash, transactions: [], earliestExecution: null },
              GovernErrorBuilder.WrongStatus(),
            );
          });
        });
        describe(`proposal is finalized with defeatedWithSlash`, () => {
          beforeEach(async () => {
            await governor.withSigner(voters[0]).tx.vote(proposalId, Vote.disagreedWithProposerSlashing, []);
            await governor.withSigner(voters[2]).tx.vote(proposalId, Vote.disagreedWithProposerSlashing, []);
            await governor.withSigner(voters[3]).tx.vote(proposalId, Vote.disagreedWithProposerSlashing, []);

            await time.increase(duration.days(9));
            await governor.tx.finalize(proposalId);
          });
          it('user0 tries to execute defeatedWithSlash proposal', async () => {
            await executeAndCheck(
              governor,
              executor,
              proposalId,
              { descriptionHash, transactions: [], earliestExecution: null },
              GovernErrorBuilder.WrongStatus(),
            );
          });
        });
        describe(`proposal is finalized with state Succeeded`, () => {
          beforeEach(async () => {
            await governor.withSigner(voters[0]).tx.vote(proposalId, Vote.agreed, []);
            await governor.withSigner(voters[2]).tx.vote(proposalId, Vote.agreed, []);
            await governor.withSigner(voters[3]).tx.vote(proposalId, Vote.agreed, []);

            await time.increase(duration.days(9));
            await governor.tx.finalize(proposalId);
          });
          it('user0 executes Succeded proposal with no Tx', async () => {
            await executeAndCheck(governor, executor, proposalId, { descriptionHash, transactions: [], earliestExecution: null });
          });
        });
      });

      describe(`earliestExecution is set to 9 days into the future`, () => {
        let earliestExecution: number;
        beforeEach(async () => {
          earliestExecution = (await time.latest()) + duration.days(9);
          [proposalId] = await proposeAndCheck(governor, voters[0], [], description, earliestExecution);
        });
        describe(`2 day pass`, () => {
          beforeEach(async () => {
            await time.increase(duration.days(2));
          });
          describe(`proposal is finalized with state Succeeded`, () => {
            beforeEach(async () => {
              await governor.withSigner(voters[0]).tx.vote(proposalId, Vote.agreed, []);
              await governor.withSigner(voters[1]).tx.vote(proposalId, Vote.agreed, []);
              await governor.withSigner(voters[2]).tx.vote(proposalId, Vote.agreed, []);
              await governor.withSigner(voters[3]).tx.vote(proposalId, Vote.agreed, []);
              (await governor.query.finalize(proposalId)).value.unwrapRecursively();
              await governor.tx.finalize(proposalId);
            });
            it('user0 tries to execute proposal', async () => {
              await executeAndCheck(
                governor,
                executor,
                proposalId,
                { descriptionHash, transactions: [], earliestExecution },
                GovernErrorBuilder.TooEarlyToExecuteProposal(),
              );
            });
            describe(`7 days pass - 1`, () => {
              beforeEach(async () => {
                await time.increase(duration.days(7) - 1);
              });
              it('user0 tries to execute proposal', async () => {
                await executeAndCheck(
                  governor,
                  executor,
                  proposalId,
                  { descriptionHash, transactions: [], earliestExecution },
                  GovernErrorBuilder.TooEarlyToExecuteProposal(),
                );
              });
              describe(`1 second pass`, () => {
                beforeEach(async () => {
                  await time.increase(1);
                });
                it('user0 executes proposal', async () => {
                  await executeAndCheck(governor, executor, proposalId, { descriptionHash, transactions: [], earliestExecution });
                });
              });
            });
          });
        });
      });
      describe(`earliestExecution is set to 28 days into the future`, () => {
        let earliestExecution: number;
        beforeEach(async () => {
          earliestExecution = (await time.latest()) + duration.days(28);
          [proposalId] = await proposeAndCheck(governor, voters[0], [], description, earliestExecution);
        });
        describe(`2 day pass`, () => {
          beforeEach(async () => {
            await time.increase(duration.days(2));
          });
          describe(`proposal is finalized with state Succeeded`, () => {
            beforeEach(async () => {
              await governor.withSigner(voters[0]).tx.vote(proposalId, Vote.agreed, []);
              await governor.withSigner(voters[1]).tx.vote(proposalId, Vote.agreed, []);
              await governor.withSigner(voters[2]).tx.vote(proposalId, Vote.agreed, []);
              await governor.withSigner(voters[3]).tx.vote(proposalId, Vote.agreed, []);
              (await governor.query.finalize(proposalId)).value.unwrapRecursively();
              await governor.tx.finalize(proposalId);
            });
            it('user0 tries to execute proposal', async () => {
              await executeAndCheck(
                governor,
                executor,
                proposalId,
                { descriptionHash, transactions: [], earliestExecution },
                GovernErrorBuilder.TooEarlyToExecuteProposal(),
              );
            });
            describe(`26 days pass - 1`, () => {
              beforeEach(async () => {
                await time.increase(duration.days(26) - 1);
              });
              it('user0 tries to execute proposal', async () => {
                await executeAndCheck(
                  governor,
                  executor,
                  proposalId,
                  { descriptionHash, transactions: [], earliestExecution },
                  GovernErrorBuilder.TooEarlyToExecuteProposal(),
                );
              });
              describe(`1 second pass`, () => {
                beforeEach(async () => {
                  await time.increase(1);
                });
                it('user0 executes proposal', async () => {
                  await executeAndCheck(governor, executor, proposalId, { descriptionHash, transactions: [], earliestExecution });
                });
              });
            });
          });
        });
      });
      describe(`with transactions`, () => {
        let proposal: Proposal;
        let transactions: Transaction[];
        const finalize = async () => {
          await governor.withSigner(voters[0]).tx.vote(proposalId, Vote.agreed, []);
          await governor.withSigner(voters[1]).tx.vote(proposalId, Vote.agreed, []);
          await governor.withSigner(voters[2]).tx.vote(proposalId, Vote.agreed, []);
          await governor.withSigner(voters[3]).tx.vote(proposalId, Vote.agreed, []);
          await time.increase(9 * duration.days(1));
          await governor.withSigner(voters[0]).tx.finalize(proposalId);
        };
        describe('that have params', () => {
          beforeEach(async () => {
            const message = token.abi.findMessage('PSP22::increase_allowance');
            const params1 = paramsToInputNumbers(message.toU8a([voters[0].address, E12bn.toString()]));
            const params2 = paramsToInputNumbers(message.toU8a([voters[1].address, E12bn.muln(2).toString()]));
            const params3 = paramsToInputNumbers(message.toU8a([voters[2].address, E12bn.muln(3).toString()]));
            transactions = [
              {
                callee: token.address,
                selector: params1.selector,
                input: params1.data,
                transferredValue: 0,
              },
              {
                callee: token.address,
                selector: params2.selector,
                input: params2.data,
                transferredValue: 0,
              },
              {
                callee: token.address,
                selector: params3.selector,
                input: params3.data,
                transferredValue: 0,
              },
            ];
            [proposalId, descriptionHash] = await proposeAndCheck(governor, voters[0], transactions, description);
            proposal = { descriptionHash, transactions, earliestExecution: null };
          });

          it('user0 executes proposal succesfully', async () => {
            await finalize();
            await governor.withSigner(deployer).tx.grantRole(ContractRole.EXECUTOR, voters[0].address);
            const query = governor.withSigner(voters[0]).query.execute(proposal);
            const tx = governor.withSigner(voters[0]).tx.execute(proposal);
            await expect(query).to.haveOkResult();
            await tx;

            await expect(await token.query.allowance(governor.address, voters[0].address)).to.haveOkResult(E12bn);
            await expect(await token.query.allowance(governor.address, voters[1].address)).to.haveOkResult(E12bn.muln(2));
            await expect(token.query.allowance(governor.address, voters[2].address)).to.haveOkResult(E12bn.muln(3));
          });
        });
        describe('that have no params', () => {
          let flipper: FlipperContract;
          beforeEach(async () => {
            const api = await localApi.get();
            const { contract: flipperC } = await new FlipperDeployer(api, deployer).new(false);
            flipper = flipperC;
            const flipMessageParams = paramsToInputNumbers(flipper.abi.findMessage('flip').toU8a([]));
            transactions = [
              {
                callee: flipper.address,
                selector: flipMessageParams.selector,
                input: flipMessageParams.data,
                transferredValue: 0,
              },
              {
                callee: flipper.address,
                selector: flipMessageParams.selector,
                input: flipMessageParams.data,
                transferredValue: 0,
              },
              {
                callee: flipper.address,
                selector: flipMessageParams.selector,
                input: flipMessageParams.data,
                transferredValue: 0,
              },
            ];

            [proposalId, descriptionHash] = await proposeAndCheck(governor, voters[0], transactions, description);
            proposal = { descriptionHash, transactions, earliestExecution: null };
          });
          it('user0 executes proposal succesfully', async () => {
            await finalize();
            let eventsCounter = 0;
            flipper.events.subscribeOnFlippedEvent(() => {
              eventsCounter++;
            });

            await governor.withSigner(deployer).tx.grantRole(ContractRole.EXECUTOR, voters[0].address);
            const query = governor.withSigner(voters[0]).query.execute(proposal);
            const tx = governor.withSigner(voters[0]).tx.execute(proposal);
            await expect(query).to.haveOkResult();
            await expect(tx).to.eventually.be.fulfilled;
            expect(eventsCounter).to.be.equal(3);
            expect((await flipper.query.get()).value.unwrapRecursively()).to.equal(true);
          });
          describe('handles errors properly', () => {
            beforeEach(async () => {
              const flipMessageParams = paramsToInputNumbers(flipper.abi.findMessage('flip').toU8a([]));
              const erroringMessageParams = paramsToInputNumbers(flipper.abi.findMessage('return_error').toU8a([]));
              transactions = [
                {
                  callee: flipper.address,
                  selector: flipMessageParams.selector,
                  input: flipMessageParams.data,
                  transferredValue: 0,
                },
                {
                  callee: flipper.address,
                  selector: erroringMessageParams.selector,
                  input: erroringMessageParams.data,
                  transferredValue: 0,
                },
                {
                  callee: flipper.address,
                  selector: flipMessageParams.selector,
                  input: flipMessageParams.data,
                  transferredValue: 0,
                },
              ];

              [proposalId, descriptionHash] = await proposeAndCheck(governor, voters[0], transactions, description);
              proposal = { descriptionHash, transactions, earliestExecution: null };
            });

            //TODO
            it.skip('user0 executes Succeded proposal with Tx but it fails due to error returned from the contract called via proposal tx', async () => {
              await finalize();
              let eventsCounter = 0;
              flipper.events.subscribeOnFlippedEvent(() => {
                eventsCounter++;
              });

              await governor.withSigner(deployer).tx.grantRole(ContractRole.EXECUTOR, voters[0].address);
              const query = governor.withSigner(voters[0]).query.execute(proposal);
              const tx = governor.withSigner(voters[0]).tx.execute(proposal);
              await expect(query).to.be.revertedWithError(GovernErrorBuilder.UnderlyingTransactionReverted('TODO'));
              await expect(tx).to.eventually.be.rejected;
              await tx;
              expect(eventsCounter).to.equal(0);
              expect((await flipper.query.get()).value.unwrap()).to.equal(false);
            });
          });
          describe('handles panics properly', () => {
            beforeEach(async () => {
              const flipMessageParams = paramsToInputNumbers(flipper.abi.findMessage('flip').toU8a([]));
              const panickingMessageParams = paramsToInputNumbers(flipper.abi.findMessage('do_panic').toU8a([]));
              transactions = [
                {
                  callee: flipper.address,
                  selector: flipMessageParams.selector,
                  input: flipMessageParams.data,
                  transferredValue: 0,
                },
                {
                  callee: flipper.address,
                  selector: panickingMessageParams.selector,
                  input: panickingMessageParams.data,
                  transferredValue: 0,
                },
                {
                  callee: flipper.address,
                  selector: flipMessageParams.selector,
                  input: flipMessageParams.data,
                  transferredValue: 0,
                },
              ];

              [proposalId, descriptionHash] = await proposeAndCheck(governor, voters[0], transactions, description);
              proposal = { descriptionHash, transactions, earliestExecution: null };
            });

            it('user0 executes Succeded proposal with Tx but it fails due to the contract called via proposal tx panicking', async () => {
              await finalize();
              let eventsCounter = 0;
              flipper.events.subscribeOnFlippedEvent(() => {
                eventsCounter++;
              });

              await governor.withSigner(deployer).tx.grantRole(ContractRole.EXECUTOR, voters[0].address);
              const query = governor.withSigner(voters[0]).query.execute(proposal);
              const tx = governor.withSigner(voters[0]).tx.execute(proposal);
              await expect(query).to.be.revertedWithError(GovernErrorBuilder.UnderlyingTransactionReverted('ReturnError(CalleeTrapped)'));
              await expect(tx).to.eventually.be.rejected;
              expect(eventsCounter).to.equal(0);
              expect((await flipper.query.get()).value.ok).to.equal(false);
            });
          });
        });
      });
    });
  });

  testStaking(() => ({
    governor,
    vester,
    govToken: token,
    users: voters,
  }));

  describe.skip('Performance tests', () => {
    it('Proposal submissions count: Submitted 1200 proposals', async function (this) {
      console.warn('Warning: slow test');
      const descriptionTemplate = 'Proposal number:';
      for (let i = 0; i < 1200; i++) {
        const description = `${descriptionTemplate}_${i}`;
        if (i % 100 === 0) console.log({ i });
        await proposeAndCheck(governor, voters[0], [], description, undefined);
      }
    });
  });
});

function testFinalizationOverTime(
  getCtx: () => {
    governor: Governor;
    finalizator: KeyringPair;
    proposalId: BN;
    expectedProposalStatus: ProposalStatus | GovernError;
  },
) {
  const ctx: ReturnType<typeof getCtx> & { act: () => Promise<void> } = {} as any;
  describe(`then 3 days passes`, () => {
    beforeEach(async () => {
      Object.assign(ctx, getCtx());
      Object.assign(ctx, { act: () => finalizeAndCheck(ctx.governor, ctx.finalizator, ctx.proposalId, ctx.expectedProposalStatus) });
    });
    beforeEach(async () => {
      await time.increase(duration.days(3));
    });
    it('user is able to finalize succesfully as linear 50% is reached', async () => {
      await ctx.act();
    });
    describe(`then 7 days passes`, () => {
      beforeEach(async () => {
        await time.increase(duration.days(7));
      });
      it('user is still able to finalize', async () => {
        await ctx.act();
      });
      describe(`then 4 days minus 1 second passes`, () => {
        beforeEach(async () => {
          await time.increase(duration.days(4) - 1);
        });
        it('user is still able to finalize', async () => {
          await ctx.act();
        });
        describe(`then 2 second pass`, () => {
          beforeEach(async () => {
            await time.increase(2);
          });
          it('user is still able to finalize', async () => {
            await ctx.act();
          });
          describe(`then a day second pass`, () => {
            beforeEach(async () => {
              await time.increase(duration.days(1));
            });
            it('user is still able to finalize', async () => {
              await ctx.act();
            });
          });
        });
      });
    });
  });
}
