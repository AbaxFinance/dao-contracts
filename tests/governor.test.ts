import BN from 'bn.js';
import { ABAX_DECIMALS, AZERO_DECIMALS, ContractRoles, ONE_YEAR } from 'tests/consts';
import { expect } from 'tests/setup/chai';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';
import Governor from 'typechain/contracts/governor';
import Psp22EmitableDeployer from 'typechain/deployers/psp22_emitable';
import VesterDeployer from 'typechain/deployers/vester';
import GovernorDeployer from 'typechain/deployers/governor';
import { AccessControlError } from 'typechain/types-arguments/abax_tge';
import { getSigners, localApi, time } from 'wookashwackomytest-polkahat-network-helpers';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';
import { ONE_DAY } from 'wookashwackomytest-polkahat-chai-matchers';
import { Proposal } from 'typechain/types-arguments/governor';
import { VotingRules } from 'typechain/types-arguments/governor';

const [deployer, other, ...voters] = getSigners();
const ONE_TOKEN = new BN(10).pow(new BN(ABAX_DECIMALS));

const smallStake = ONE_TOKEN;
const midStake = smallStake.muln(10);
const bigStake = midStake.muln(10);

const UNSTAKE_PERIOD = ONE_DAY.muln(6 * 30); // 180 days

const VOTING_RULES: VotingRules = {
  minimumStakePartE3: 10,
  proposerDepositPartE3: 100,
  initialPeriod: ONE_DAY.muln(3),
  flatPeriod: ONE_DAY.muln(10),
  finalPeriod: ONE_DAY.muln(4),
};

describe.only('Governor', () => {
  let governor: Governor;
  let token: PSP22Emitable;
  let vester: Vester;
  Psp22EmitableDeployer;
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
    });

    it('state', async () => {
      await expect(governor.query.balanceOf(voters[0].address)).to.haveOkResult(bigStake);
      await expect(governor.query.balanceOf(voters[1].address)).to.haveOkResult(bigStake);
      await expect(governor.query.balanceOf(voters[2].address)).to.haveOkResult(midStake);
      await expect(governor.query.balanceOf(voters[3].address)).to.haveOkResult(midStake);
      await expect(governor.query.balanceOf(voters[4].address)).to.haveOkResult(smallStake);
      await expect(governor.query.balanceOf(voters[5].address)).to.haveOkResult(smallStake);
    });
  });
});

//     describe('Proposing:', () => {
//       it()

//       it('user4 trying to propose with insufficient Votes', async () => {
//         const description = 'Abax will be the best ;-)';
//         const proposal: Proposal = {
//           rulesId: 0,
//           voterRewardPartE12: toE12(0.051),
//           transactions: [],
//         };
//         await proposeAndCheck(testEnv, users[4], proposal, description, GovernErrorBuilder.InnsuficientVotes());
//       });

//       it('user2 trying to set to high RewardMultiplier', async () => {
//         const description = 'Abax will be the best ;-)';
//         const proposal: Proposal = {
//           rulesId: 0,
//           voterRewardPartE12: toE12(0.051),
//           transactions: [],
//         };
//         await proposeAndCheck(testEnv, users[2], proposal, description, GovernErrorBuilder.RewardMultiplier());
//       });
//       it('user2 trying to set to high RewardMultiplier for him', async () => {
//         const description = 'Abax will be the best ;-)';
//         const proposal: Proposal = {
//           rulesId: 0,
//           voterRewardPartE12: toE12(0.05),
//           transactions: [],
//         };
//         await proposeAndCheck(testEnv, users[2], proposal, description, GovernErrorBuilder.RewardMultiplier());
//       });
//       it('user0 successfully creates proposal', async () => {
//         const description = 'Abax will be the best ;-)';
//         const proposal: Proposal = {
//           rulesId: 0,
//           voterRewardPartE12: toE12(0.05),
//           transactions: [],
//         };
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//       });

//       it('user0 tires to submit the same proposal twice', async () => {
//         const description = 'Abax will be the best ;-)';
//         const proposal: Proposal = {
//           rulesId: 0,
//           voterRewardPartE12: toE12(0.05),
//           transactions: [],
//         };
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//         await proposeAndCheck(testEnv, users[0], proposal, description, GovernErrorBuilder.ProposalAlreadyExists());
//       });

//       it('user1 tires to submit proposal after user 0 already submitted it', async () => {
//         const description = 'Abax will be the best ;-)';
//         const proposal: Proposal = {
//           rulesId: 0,
//           voterRewardPartE12: toE12(0.05),
//           transactions: [],
//         };
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//         await proposeAndCheck(testEnv, users[1], proposal, description, GovernErrorBuilder.ProposalAlreadyExists());
//       });
//     });
//     describe('Voting', () => {
//       const description = 'Abax will be the best ;-)';
//       const proposal: Proposal = {
//         rulesId: 0,
//         voterRewardPartE12: 0,
//         transactions: [],
//       };
//       const proposal2: Proposal = {
//         rulesId: 1,
//         voterRewardPartE12: 11,
//         transactions: [],
//       };
//       let proposalId: number[];
//       let proposalId2: number[];
//       beforeEach(async () => {
//         proposalId = hexToNumbers(((await testEnv.hasher.query.hashProposalWithDescription(proposal, description)).value.ok! as string).substring(2));
//         proposalId2 = hexToNumbers(
//           ((await testEnv.hasher.query.hashProposalWithDescription(proposal2, description)).value.ok! as string).substring(2),
//         );
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//       });
//       it('user6 with no stake tries to vote', async () => {
//         await voteAndCheck(testEnv, users[6], proposalId, Vote.agreed, GovernErrorBuilder.ZeroVotes());
//       });
//       it('user0 tries to vote for not existing proposal', async () => {
//         await voteAndCheck(testEnv, users[0], proposalId2, Vote.agreed, GovernErrorBuilder.ProposalDoesntExist());
//       });
//       it('user0 tries to vote after prposal is finalized ', async () => {
//         await testEnv.timestampProvider.tx.increaseBlockTimestamp(22 * DAY);
//         await governor.tx.finalize(proposalId);
//         await voteAndCheck(testEnv, users[0], proposalId, Vote.agreed, GovernErrorBuilder.NotActive());
//       });
//       it('many users can vote for different', async () => {
//         await voteAndCheck(testEnv, users[0], proposalId, Vote.agreed);
//         await voteAndCheck(testEnv, users[1], proposalId, Vote.disagreedWithProposerSlashing);
//         await voteAndCheck(testEnv, users[2], proposalId, Vote.disagreed);
//         await voteAndCheck(testEnv, users[3], proposalId, Vote.disagreed);
//         await voteAndCheck(testEnv, users[4], proposalId, Vote.disagreedWithProposerSlashing);
//       });
//     });
//     describe('Finalize', () => {
//       const description = 'Abax will be the best ;-)';
//       const proposal: Proposal = {
//         rulesId: 0,
//         voterRewardPartE12: 0,
//         transactions: [],
//       };
//       const proposal2: Proposal = {
//         rulesId: 1,
//         voterRewardPartE12: 11,
//         transactions: [],
//       };
//       let proposalId: number[];
//       let proposalId2: number[];
//       beforeEach(async () => {
//         proposalId = hexToNumbers(((await testEnv.hasher.query.hashProposalWithDescription(proposal, description)).value.ok! as string).substring(2));
//         proposalId2 = hexToNumbers(
//           ((await testEnv.hasher.query.hashProposalWithDescription(proposal2, description)).value.ok! as string).substring(2),
//         );
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//       });
//       it('user tries to finalize proposal that doesnt exist', async () => {
//         await finalizeAndCheck(testEnv, users[6], proposalId2, undefined, GovernErrorBuilder.ProposalDoesntExist());
//       });
//       it('user tries to finalize proposal that doesnt meet finalization condition', async () => {
//         await finalizeAndCheck(testEnv, users[6], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//       });
//       describe(`all stakers votes for 'agree`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[0], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[1], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[2], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[3], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[4], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.agreed);
//         });
//         it('user finalize succesfully', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.succeeded);
//         });
//       });
//       describe(`all stakers votes for 'disagree`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[0], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[1], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[2], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[3], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[4], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.disagreed);
//         });
//         it('user finalize succesfully', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeated);
//         });
//       });
//       describe(`all stakers vote for 'disagreedWithProposerSlashing'`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[0], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[1], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[2], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[3], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[4], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.disagreedWithProposerSlashing);
//         });
//         it('user finalize succesfully', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeatedWithSlash);
//         });
//       });
//       describe(`all stakers votes for disagree or disagreedWithProposerSlashing, but most for disagreed`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[0], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[1], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[2], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[3], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[4], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.disagreed);
//         });
//         it('user finalize succesfully', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeated);
//         });
//       });
//       describe(`all stakers votes for disagree or disagreedWithProposerSlashing, but most for disagreedWithProposerSlashing`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[0], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[1], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[2], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[3], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[4], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.disagreedWithProposerSlashing);
//         });
//         it('user finalize succesfully', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeatedWithSlash);
//         });
//       });
//       describe(`more than 50% votes for agree, rest disagree`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[0], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[1], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[2], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[3], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[4], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.agreed);
//         });
//         it('user tries to finalize that doesnt meet finalization condition', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//         });
//         describe(`then 3 days passes`, () => {
//           beforeEach(async () => {
//             await timestmpProvider.tx.increaseBlockTimestamp(3 * DAY);
//           });
//           it('user finalize succesfully as linear 50% is reached', async () => {
//             await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.succeeded);
//           });
//         });
//       });
//       describe(`more than 50% votes for disagree(most) or disagreedWithProposerSlashing, rest agree`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[0], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[1], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[2], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[3], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[4], proposalId, Vote.disagreed);
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.disagreed);
//         });
//         it('user tries to finalize that doesnt meet finalization condition', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//         });
//         describe(`then 3 days passes`, () => {
//           beforeEach(async () => {
//             await timestmpProvider.tx.increaseBlockTimestamp(3 * DAY);
//           });
//           it('user finalize succesfully as linear 50% is reached', async () => {
//             await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeated);
//           });
//         });
//       });
//       describe(`more than 50% votes for disagreedWithProposerSlashing, rest disagree`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[0], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[1], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[2], proposalId, Vote.agreed);
//           await voteAndCheck(testEnv, users[3], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[4], proposalId, Vote.disagreedWithProposerSlashing);
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.disagreedWithProposerSlashing);
//         });
//         it('user tries to finalize that doesnt meet finalization condition', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//         });
//         describe(`then 3 days passes`, () => {
//           beforeEach(async () => {
//             await timestmpProvider.tx.increaseBlockTimestamp(3 * DAY);
//           });
//           it('user finalize succesfully as linear 50% is reached', async () => {
//             await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeatedWithSlash);
//           });
//         });
//       });
//       describe(`only small % votes for agree, rest didnt vote`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.agreed);
//         });
//         it('user tries to finalize that doesnt meet finalization condition', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//         });
//         describe(`then 3 days passes`, () => {
//           beforeEach(async () => {
//             await timestmpProvider.tx.increaseBlockTimestamp(3 * DAY);
//           });
//           it('user tries to finalize that doesnt meet finalization condition', async () => {
//             await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//           });
//           describe(`then 7 days passes`, () => {
//             beforeEach(async () => {
//               await timestmpProvider.tx.increaseBlockTimestamp(7 * DAY);
//             });
//             it('user tries to finalize that doesnt meet finalization condition', async () => {
//               await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//             });
//             describe(`then 4 days minus 1 second passes`, () => {
//               beforeEach(async () => {
//                 await timestmpProvider.tx.increaseBlockTimestamp(4 * DAY - 1);
//               });
//               it('user finalize succesfully as in final period treshold goes to 0 is reached', async () => {
//                 await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.succeeded);
//               });
//             });
//           });
//         });
//       });
//       describe(`only small % votes for disagreed, rest didnt vote`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.disagreed);
//         });
//         it('user tries to finalize that doesnt meet finalization condition', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//         });
//         describe(`then 3 days passes`, () => {
//           beforeEach(async () => {
//             await timestmpProvider.tx.increaseBlockTimestamp(3 * DAY);
//           });
//           it('user tries to finalize that doesnt meet finalization condition', async () => {
//             await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//           });
//           describe(`then 7 days passes`, () => {
//             beforeEach(async () => {
//               await timestmpProvider.tx.increaseBlockTimestamp(7 * DAY);
//             });
//             it('user tries to finalize that doesnt meet finalization condition', async () => {
//               await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//             });
//             describe(`then 4 days minus 1 second passes`, () => {
//               beforeEach(async () => {
//                 await timestmpProvider.tx.increaseBlockTimestamp(4 * DAY - 1);
//               });
//               it('user finalize succesfully as in final period treshold goes to 0 is reached', async () => {
//                 await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeated);
//               });
//             });
//           });
//         });
//       });
//       describe(`only small % votes for disagreedWithProposerSlashing, rest didnt vote`, () => {
//         beforeEach(async () => {
//           await voteAndCheck(testEnv, users[5], proposalId, Vote.disagreedWithProposerSlashing);
//         });
//         it('user tries to finalize that doesnt meet finalization condition', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//         });
//         describe(`then 3 days passes`, () => {
//           beforeEach(async () => {
//             await timestmpProvider.tx.increaseBlockTimestamp(3 * DAY);
//           });
//           it('user tries to finalize that doesnt meet finalization condition', async () => {
//             await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//           });
//           describe(`then 7 days passes`, () => {
//             beforeEach(async () => {
//               await timestmpProvider.tx.increaseBlockTimestamp(7 * DAY);
//             });
//             it('user tries to finalize that doesnt meet finalization condition', async () => {
//               await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//             });
//             describe(`then 4 days minus 1 second passes`, () => {
//               beforeEach(async () => {
//                 await timestmpProvider.tx.increaseBlockTimestamp(4 * DAY - 1);
//               });
//               it('user finalize succesfully as in final period treshold goes to 0 is reached', async () => {
//                 await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeatedWithSlash);
//               });
//             });
//           });
//         });
//       });
//       describe(`no one has voted`, () => {
//         it('user tries to finalize that doesnt meet finalization condition', async () => {
//           await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//         });
//         describe(`then 3 days passes`, () => {
//           beforeEach(async () => {
//             await timestmpProvider.tx.increaseBlockTimestamp(3 * DAY);
//           });
//           it('user tries to finalize that doesnt meet finalization condition', async () => {
//             await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//           });
//           describe(`then 7 days passes`, () => {
//             beforeEach(async () => {
//               await timestmpProvider.tx.increaseBlockTimestamp(7 * DAY);
//             });
//             it('user tries to finalize that doesnt meet finalization condition', async () => {
//               await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//             });
//             describe(`then 4 days minus 1 second passes`, () => {
//               beforeEach(async () => {
//                 await timestmpProvider.tx.increaseBlockTimestamp(4 * DAY - 1);
//               });
//               it('user tries to finalize that doesnt meet finalization condition', async () => {
//                 await finalizeAndCheck(testEnv, users[0], proposalId, undefined, GovernErrorBuilder.FinalizeCondition());
//               });
//               describe(`then 2 second passes`, () => {
//                 beforeEach(async () => {
//                   await timestmpProvider.tx.increaseBlockTimestamp(2);
//                 });
//                 it('user tries to finalize that doesnt meet finalization condition', async () => {
//                   await finalizeAndCheck(testEnv, users[0], proposalId, ProposalStatus.defeated);
//                 });
//               });
//             });
//           });
//         });
//       });
//     });
//     describe('SlashVoter', () => {
//       const description = 'Abax will be the best ;-)';
//       const proposal: Proposal = {
//         rulesId: 0,
//         voterRewardPartE12: toE12(0.001),
//         transactions: [],
//       };
//       const proposal2: Proposal = {
//         rulesId: 1,
//         voterRewardPartE12: 11,
//         transactions: [],
//       };
//       let proposalId: number[];
//       let proposalId2: number[];
//       beforeEach(async () => {
//         proposalId = hexToNumbers(((await testEnv.hasher.query.hashProposalWithDescription(proposal, description)).value.ok! as string).substring(2));
//         proposalId2 = hexToNumbers(
//           ((await testEnv.hasher.query.hashProposalWithDescription(proposal2, description)).value.ok! as string).substring(2),
//         );
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//       });
//       it('user0 tries to slash user 1 for non-existing proposal', async () => {
//         await slashVoterAndCheck(testEnv, users[0], users[1].address, proposalId2, GovernErrorBuilder.ProposalDoesntExist());
//       });
//       it('user0 tries to slash user 1 for active proposal', async () => {
//         await slashVoterAndCheck(testEnv, users[0], users[1].address, proposalId, GovernErrorBuilder.StillActive());
//       });
//       describe(`proposal is finalized in flat period`, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.agreed, []);
//           await governor.withSigner(users[2]).tx.vote(proposalId, Vote.agreed, []);
//           await governor.withSigner(users[3]).tx.vote(proposalId, Vote.agreed, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(9 * DAY);
//           await governor.tx.finalize(proposalId);
//         });
//         it(` so there is nothing to slash`, async () => {
//           await slashVoterAndCheck(testEnv, users[0], users[1].address, proposalId, GovernErrorBuilder.NothingToSlash());
//         });
//       });
//       describe(`proposal is finalized in final period`, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.agreed, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(12 * DAY);
//           await governor.tx.finalize(proposalId);
//         });
//         it(`someone tries to shals user0 ho has voted`, async () => {
//           await slashVoterAndCheck(testEnv, users[0], users[0].address, proposalId, GovernErrorBuilder.Voted());
//         });
//         it(`users who didnt vote are succesfully slashed`, async () => {
//           await slashVoterAndCheck(testEnv, users[0], users[1].address, proposalId);
//           await slashVoterAndCheck(testEnv, users[0], users[2].address, proposalId);
//           await slashVoterAndCheck(testEnv, users[0], users[3].address, proposalId);
//           await slashVoterAndCheck(testEnv, users[0], users[4].address, proposalId);
//           await slashVoterAndCheck(testEnv, users[0], users[5].address, proposalId);
//         });
//         it(`user can not be slashed twice`, async () => {
//           await slashVoterAndCheck(testEnv, users[0], users[1].address, proposalId);
//           await slashVoterAndCheck(testEnv, users[0], users[1].address, proposalId, GovernErrorBuilder.AlreadyClaimedOrSlashed());
//         });
//       });
//       describe(`proposal is finalized in final period and user6 has staken 0.5 DAY before finalization and hasnt voted `, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.agreed, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(12 * DAY);
//           await governor.withSigner(users[6]).tx.stake(smallStake);
//           await timestmpProvider.tx.increaseBlockTimestamp(DAY / 2);
//           await governor.tx.finalize(proposalId);
//         });
//         it(`someone tries to slash user6 who can't be slashed`, async () => {
//           await slashVoterAndCheck(testEnv, users[0], users[6].address, proposalId, GovernErrorBuilder.NothingToSlash());
//         });
//       });
//       describe(`proposal is finalized in final period and user6 has staken 0.5 DAY after finalization and hasnt voted `, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.agreed, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(12 * DAY);
//           await governor.tx.finalize(proposalId);
//           await timestmpProvider.tx.increaseBlockTimestamp(DAY / 2);
//           await governor.withSigner(users[6]).tx.stake(smallStake);
//         });
//         it(`someone tries to slash user6 who can't be slashed`, async () => {
//           await slashVoterAndCheck(testEnv, users[0], users[6].address, proposalId, GovernErrorBuilder.NothingToSlash());
//         });
//       });
//     });
//     describe('ClaimReward', () => {
//       const description = 'Abax will be the best ;-)';
//       const proposal: Proposal = {
//         rulesId: 0,
//         voterRewardPartE12: toE12(0.001),
//         transactions: [],
//       };
//       const proposal2: Proposal = {
//         rulesId: 1,
//         voterRewardPartE12: 11,
//         transactions: [],
//       };
//       let proposalId: number[];
//       let proposalId2: number[];
//       beforeEach(async () => {
//         proposalId = hexToNumbers(((await testEnv.hasher.query.hashProposalWithDescription(proposal, description)).value.ok! as string).substring(2));
//         proposalId2 = hexToNumbers(
//           ((await testEnv.hasher.query.hashProposalWithDescription(proposal2, description)).value.ok! as string).substring(2),
//         );
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//       });
//       it('user0 tries to claim non-existing proposal', async () => {
//         await claimRewardAndCheck(testEnv, users[0], proposalId2, GovernErrorBuilder.ProposalDoesntExist());
//       });
//       it('user0 tries to claim active proposal', async () => {
//         await claimRewardAndCheck(testEnv, users[0], proposalId, GovernErrorBuilder.StillActive());
//       });
//       describe(`proposal is finalized`, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.agreed, []);
//           await governor.withSigner(users[2]).tx.vote(proposalId, Vote.agreed, []);
//           await governor.withSigner(users[3]).tx.vote(proposalId, Vote.agreed, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(9 * DAY);
//           await governor.tx.finalize(proposalId);
//         });
//         it(` user who didn't vote treis to claim`, async () => {
//           await claimRewardAndCheck(testEnv, users[1], proposalId, GovernErrorBuilder.DidntVote());
//         });
//         it(`users who did vote claims succesfully`, async () => {
//           await claimRewardAndCheck(testEnv, users[0], proposalId);
//           await claimRewardAndCheck(testEnv, users[2], proposalId);
//           await claimRewardAndCheck(testEnv, users[3], proposalId);
//         });
//       });
//     });
//     describe('Execute', () => {
//       const description = 'Abax will be the best ;-)';
//       const proposal: Proposal = {
//         rulesId: 0,
//         voterRewardPartE12: toE12(0.001),
//         transactions: [],
//       };
//       const proposal2: Proposal = {
//         rulesId: 1,
//         voterRewardPartE12: 11,
//         transactions: [],
//       };
//       let proposalId: number[];
//       let proposalId2: number[];
//       let descriptionHash: number[];
//       beforeEach(async () => {
//         proposalId = hexToNumbers(((await testEnv.hasher.query.hashProposalWithDescription(proposal, description)).value.ok! as string).substring(2));
//         proposalId2 = hexToNumbers(
//           ((await testEnv.hasher.query.hashProposalWithDescription(proposal2, description)).value.ok! as string).substring(2),
//         );
//         descriptionHash = (await testEnv.hasher.query.hashDescription(description)).value.ok!;
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//       });
//       it('user0 tries to execute non-existing proposal', async () => {
//         await executeAndCheck(testEnv, users[0], proposal2, descriptionHash, description, GovernErrorBuilder.ProposalDoesntExist());
//       });
//       it('user0 tries to execute active proposal', async () => {
//         await executeAndCheck(testEnv, users[0], proposal, descriptionHash, description, GovernErrorBuilder.WrongStatus());
//       });
//       describe(`proposal is finalized with defeated`, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.disagreed, []);
//           await governor.withSigner(users[2]).tx.vote(proposalId, Vote.disagreed, []);
//           await governor.withSigner(users[3]).tx.vote(proposalId, Vote.disagreed, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(9 * DAY);
//           await governor.tx.finalize(proposalId);
//         });
//         it('user0 tries to execute defeated proposal', async () => {
//           await executeAndCheck(testEnv, users[0], proposal, descriptionHash, description, GovernErrorBuilder.WrongStatus());
//         });
//       });
//       describe(`proposal is finalized with defeatedWithSlash`, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.disagreedWithProposerSlashing, []);
//           await governor.withSigner(users[2]).tx.vote(proposalId, Vote.disagreedWithProposerSlashing, []);
//           await governor.withSigner(users[3]).tx.vote(proposalId, Vote.disagreedWithProposerSlashing, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(9 * DAY);
//           await governor.tx.finalize(proposalId);
//         });
//         it('user0 tries to execute defeatedWithSlash proposal', async () => {
//           await executeAndCheck(testEnv, users[0], proposal, descriptionHash, description, GovernErrorBuilder.WrongStatus());
//         });
//       });
//       describe(`proposal is finalized with Succeeded`, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.agreed, []);
//           await governor.withSigner(users[2]).tx.vote(proposalId, Vote.agreed, []);
//           await governor.withSigner(users[3]).tx.vote(proposalId, Vote.agreed, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(9 * DAY);
//           await governor.tx.finalize(proposalId);
//         });
//         it('user0 executes Succeded proposal with no Tx', async () => {
//           await executeAndCheck(testEnv, users[0], proposal, descriptionHash, description);
//         });
//       });
//     });
//     describe('Execute Proposal with transactions', () => {
//       const description = 'Abax will be the best ;-)';
//       let proposal: Proposal;

//       let proposalId: number[];
//       let descriptionHash: number[];
//       let xxx;
//       beforeEach(async () => {
//         const api = await apiProviderWrapper.getAndWaitForReady();
//         const gasLimit = api?.registry.createType('WeightV2', {
//           refTime: new BN(10000),
//           proofSize: new BN(10000),
//         }) as WeightV2;
//         const params1 = paramsToInputNumbers(token'PSPmint::increase_allowance').toU8a([usersaddress, E12.toString()]));
//         const params2 = paramsToInputNumbers(token'PSPmint::increase_allowance').toU8a([usersaddress, E12.muln(2).toString()]));
//         const params3 = paramsToInputNumbers(token'PSPmint::increase_allowance').toU8a([usersaddress, E12.muln(3).toString()]));
//         proposal = {
//           rulesId: 0,
//           voterRewardPartE12: toE12(0.001),
//           transactions: [
//             {
//               callee: govToken.address,
//               selector: params1.selector,
//               input: params1.data,
//               transferredValue: 0,
//             },
//             {
//               callee: govToken.address,
//               selector: params2.selector,
//               input: params2.data,
//               transferredValue: 0,
//             },
//             {
//               callee: govToken.address,
//               selector: params3.selector,
//               input: params3.data,
//               transferredValue: 0,
//             },
//           ],
//         };
//         proposalId = hexToNumbers(((await testEnv.hasher.query.hashProposalWithDescription(proposal, description)).value.ok! as string).substring(2));
//         descriptionHash = (await testEnv.hasher.query.hashDescription(description)).value.ok!;
//         await proposeAndCheck(testEnv, users[0], proposal, description, undefined);
//       });

//       describe(`proposal is finalized with Succeeded`, () => {
//         beforeEach(async () => {
//           await governor.withSigner(users[0]).tx.vote(proposalId, Vote.agreed, []);
//           await governor.withSigner(users[2]).tx.vote(proposalId, Vote.agreed, []);
//           await governor.withSigner(users[3]).tx.vote(proposalId, Vote.agreed, []);

//           await timestmpProvider.tx.increaseBlockTimestamp(9 * DAY);
//           await governor.tx.finalize(proposalId);
//         });
//         it('user0 executes Succeded proposal with no Tx', async () => {
//           await executeAndCheck(testEnv, users[0], proposal, descriptionHash, description);

//           expect((await govToken.query.allowance(governor.address, users[0].address)).value.ok!.rawNumber.toString()).to.be.equal(E12.toString());
//           expect((await govToken.query.allowance(governor.address, users[1].address)).value.ok!.rawNumber.toString()).to.be.equal(
//             E12.muln(2).toString(),
//           );
//           expect((await govToken.query.allowance(governor.address, users[2].address)).value.ok!.rawNumber.toString()).to.be.equal(
//             E12.muln(3).toString(),
//           );
//         });
//       });
//     });
//   });
// });
