import { replaceNumericPropsWithStrings } from '@abaxfinance/contract-helpers';
import { E6, E6bn, toE6 } from '@abaxfinance/utils';
import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
import { ABAX_DECIMALS, AZERO_DECIMALS, ONE_DAY, ONE_YEAR } from 'tests/consts';
import { expect } from 'tests/setup/chai';
import AbaxTge from 'typechain/contracts/abax_tge';
import AbaxToken from 'typechain/contracts/abax_token';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';
import AbaxTgeDeployer from 'typechain/deployers/abax_tge';
import AbaxTokenDeployer from 'typechain/deployers/abax_token';
import Psp22EmitableDeployer from 'typechain/deployers/psp22_emitable';
import VesterDeployer from 'typechain/deployers/vester';
import { AccessControlError } from 'typechain/types-arguments/abax_tge';
import { TGEErrorBuilder } from 'typechain/types-returns/abax_tge';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';
import { getSigners, localApi, time } from 'wookashwackomytest-polkahat-network-helpers';
import 'wookashwackomytest-polkahat-chai-matchers';

const toTokenDecimals = (amount: string | number | BN) => (BN.isBN(amount) ? amount : new BN(amount)).mul(new BN(10).pow(new BN(AZERO_DECIMALS)));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PHASE_ONE_TOKEN_CAP = new BN(10).pow(new BN(8 + 12)); // 10^8 tokens
const COST_TO_MINT_MILLION_TOKENS = new BN(10).pow(new BN(6)).divn(40); // 10^18 tokens
const [admin, founders, foundation, strategicReserves, other, ...contributors] = getSigners();
const INIT_CONTRIBUTOR_BALANCE = toTokenDecimals(100_000);

const ONE_TOKEN = toTokenDecimals(1);

const CONTRIBUTION_BONUS_DENOMINATOR = ONE_TOKEN.muln(1000);

//makes a contribution and checks if eceryhing is allright
function testContribute() {
  console.log('testContribute');
}

async function deployTGE(
  now: number,
  abaxToken: AbaxToken,
  wAZERO: PSP22Emitable,
  vester: Vester,
): Promise<{ contract: AbaxTge; result: SignAndSendSuccessResponse }> {
  return await new AbaxTgeDeployer(await localApi.get(), admin).new(
    now + DAY,
    90 * DAY,
    abaxToken.address,
    wAZERO.address,
    vester.address,
    founders.address,
    foundation.address,
    strategicReserves.address,
    toTokenDecimals(100_000_000),
    COST_TO_MINT_MILLION_TOKENS,
  );
}

describe.only('TGE', () => {
  const now = Date.now();
  let tge: AbaxTge;
  let abaxToken: AbaxToken;
  let wAZERO: PSP22Emitable;
  let vester: Vester;
  beforeEach(async () => {
    const api = await localApi.get();
    abaxToken = (await new AbaxTokenDeployer(api, admin).new('ABAX', 'ABAX', ABAX_DECIMALS)).contract;
    wAZERO = (await new Psp22EmitableDeployer(api, admin).new('WAZERO', 'WAZERO', AZERO_DECIMALS)).contract;
    vester = (await new VesterDeployer(api, admin).new()).contract;

    for (const contributor of contributors) {
      await wAZERO.tx.mint(contributor.address, INIT_CONTRIBUTOR_BALANCE);
    }
  });

  describe('constructor', () => {
    let deployment_tx: SignAndSendSuccessResponse;
    beforeEach(async () => {
      const deploymentResult = await deployTGE(now, abaxToken, wAZERO, vester);
      tge = deploymentResult.contract;
      deployment_tx = deploymentResult.result;
    });
    it(`should properly assign parameters of the tge`, async function () {
      await expect(tge.query.getTgeStorage()).to.haveOkResult([
        now + DAY,
        null,
        90 * DAY,
        abaxToken.address,
        wAZERO.address,
        vester.address,
        founders.address,
        foundation.address,
        strategicReserves.address,
        PHASE_ONE_TOKEN_CAP,
        COST_TO_MINT_MILLION_TOKENS,
        toTokenDecimals(80_000_000),
      ]);
    });
    it(`should mint tokens for the founders, foundation, strategic reserves`, async function () {
      await expect(deployment_tx).to.changePSP22Balances(abaxToken, [tge.address], [PHASE_ONE_TOKEN_CAP.muln(80).divn(100)]);
    });
    // it('should reserve tokens for founders', async function () {
    //   await expect(tge.query.reservedTokens(founders.address)).to.haveOkResult(PHASE_ONE_TOKEN_CAP.muln(20).divn(100));
    // });
    // it('should reserve tokens for foundation', async function () {
    //   await expect(tge.query.reservedTokens(foundation.address)).to.haveOkResult(PHASE_ONE_TOKEN_CAP.muln(2).divn(100));
    // });
    // it('should reserve tokens for strategic reserves', async function () {
    //   await expect(tge.query.reservedTokens(strategicReserves.address)).to.haveOkResult(PHASE_ONE_TOKEN_CAP.muln(58).divn(100));
    // });
    it('should assign ADMIN role to deployer - admin', async function () {
      await expect(tge.query.hasRole(0, admin.address)).to.haveOkResult(true);
    });
  });
  describe('messages', () => {
    describe('set bonus multiplier', function () {
      const bonusMultiplierE3 = 100;
      beforeEach(async function () {
        tge = (await deployTGE(now, abaxToken, wAZERO, vester)).contract;
      });
      it('should fail if called by non-admin', async function () {
        await expect(tge.withSigner(other).tx.setBonusMultiplierE3(contributors[0].address, bonusMultiplierE3)).to.be.revertedWithError({
          missingRole: AccessControlError,
        });
      });
      it('should work if called by admin', async function () {
        const tx = tge.withSigner(admin).tx.setBonusMultiplierE3(contributors[0].address, bonusMultiplierE3);
        await expect(tx).to.be.fulfilled;
        await expect(tx).to.emitEvent(tge, 'BonusMultiplierSet', {
          contributor: contributors[0].address,
          bonusMultiplierE3: bonusMultiplierE3,
        });

        await expect(tge.query.getBonusMultiplierE3(contributors[0].address)).to.haveOkResult(bonusMultiplierE3);
      });
    });

    describe('before phase one starts', function () {
      beforeEach(async function () {
        tge = (await deployTGE(now, abaxToken, wAZERO, vester)).contract;
      });
      describe('jsut after deployment', function () {
        it('contribute fails', async function () {
          await expect(tge.withSigner(contributors[0]).query.contribute(ONE_TOKEN, contributors[0].address, null)).to.be.revertedWithError({
            tgeNotStarted: null,
          });
        });
        it('collect reserved fails', async function () {
          await expect(tge.withSigner(founders).query.collectReserved()).to.be.revertedWithError({ tgeNotStarted: null });
        });

        testStakedrop(tge);
      });

      describe('jsut before start', function () {
        beforeEach(async function () {
          await time.setTo(now + DAY - 1);
        });
        it('contribute fails', async function () {
          await expect(tge.withSigner(contributors[0]).query.contribute(ONE_TOKEN, contributors[0].address, null)).to.be.revertedWithError({
            tgeNotStarted: null,
          });
        });
        it('collect reserved fails', async function () {
          await expect(tge.withSigner(founders).query.collectReserved()).to.be.revertedWithError({ tgeNotStarted: null });
        });

        testStakedrop(tge);
      });
    });
    describe('phase one', function () {
      beforeEach(async function () {
        await time.setTo(now + DAY);
      });

      it('stakedrop should fail', async function () {
        await expect(tge.withSigner(admin).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address)).to.be.revertedWithError({
          tgeStarted: null,
        });
      });

      describe('collect_reserved', function () {
        describe('when called by the founders', function () {
          it('should transfer 20% of tokens', async function () {
            expect(false).to.be.true;
          });
          it('should create the vesting schedule of 80% over 4 years', async function () {
            expect(false).to.be.true;
          });
          it('should set reserved to 0', async function () {
            expect(false).to.be.true;
          });
        });
        describe('when called by the foundation', function () {
          it('should transfer 100% of tokens', async function () {
            expect(false).to.be.true;
          });
          it('should set reserved to 0', async function () {
            expect(false).to.be.true;
          });
        });
        describe('when called by the strategic reserves', function () {
          it('should transfer 100% of tokens', async function () {
            expect(false).to.be.true;
          });
          it('should set reserved to 0', async function () {
            expect(false).to.be.true;
          });
        });
        describe('when called by stakedroped account', function () {
          const stakedroped = contributors[0];
          beforeEach(async function () {
            await tge.withSigner(admin).tx.stakedrop(ONE_TOKEN, ONE_TOKEN, stakedroped.address);
          });
          it('should transfer 40% of tokens', async function () {
            expect(false).to.be.true;
          });
          it('should create the vesting schedule of 60% over 4 years', async function () {
            expect(false).to.be.true;
          });
          it('should set reserved to 0', async function () {
            expect(false).to.be.true;
          });
        });
        describe('when called by other', function () {
          it('should fail', async function () {
            expect(false).to.be.true;
          });
        });
      });

      describe('contribute', function () {
        it('should fail with no allowance', async function () {
          await expect(tge.withSigner(contributors[0]).query.contribute(ONE_TOKEN, contributors[0].address, null)).to.be.revertedWithError({
            allowance: null,
          });
        });
        describe('when not trigering the 2nd phase', function () {
          beforeEach(async function () {
            await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, ONE_TOKEN);
          });
          it('should fail with less than minimum', async function () {
            await expect(tge.withSigner(contributors[0]).query.contribute(ONE_TOKEN.subn(1), contributors[0].address, null)).to.be.revertedWithError({
              amountLessThanMinimum: null,
            });
          });

          describe('with no exp bonus and with no referrer', function () {
            it('single contribution works', async function () {
              testContribute();
            });
            it('multiple contributions work', async function () {
              testContribute();
              testContribute();
              testContribute();
              testContribute();
            });
          });

          describe('with exp bonus and with no referrer', function () {
            it('single contribution works', async function () {
              testContribute();
            });
            it('multiple contributions work', async function () {
              testContribute();
              testContribute();
              testContribute();
              testContribute();
            });
          });

          describe('with exp bonus and with referrer', function () {
            it('single contribution works', async function () {
              testContribute();
            });
            it('multiple contributions work', async function () {
              testContribute();
              testContribute();
              testContribute();
              testContribute();
            });
          });
        });
        describe('when trigering the 2nd phase', function () {
          beforeEach(async function () {
            await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, -1);
            await tge.withSigner(contributors[0]).tx.contribute(PHASE_ONE_TOKEN_CAP.sub(ONE_TOKEN), contributors[0].address, null);
          });
          it('should correctyl calculate the cost', async function () {
            expect(false).to.be.true;
          });
          it('should emit event', async function () {
            expect(false).to.be.true;
          });
        });
      });
    });
    describe('phase two', function () {
      it('stakesdrop should fail', async function () {
        expect(false).to.be.true;
      });

      describe('collect_reserved', function () {
        it('should work', async function () {
          expect(false).to.be.true;
        });
      });

      describe('just after started', function () {
        describe('contribute', function () {
          beforeEach(async function () {
            await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, -1);
            await tge.withSigner(contributors[0]).tx.contribute(PHASE_ONE_TOKEN_CAP, contributors[0].address, null);
          });
          it('should correctyl calculate the cost and work', async function () {
            expect(false).to.be.true;
          });
        });
      });

      describe('just before ended', function () {
        describe('contribute', function () {
          beforeEach(async function () {
            await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, -1);
            await tge.withSigner(contributors[0]).tx.contribute(PHASE_ONE_TOKEN_CAP, contributors[0].address, null);
          });
          it('should correctyl calculate the cost and work', async function () {
            expect(false).to.be.true;
          });
        });
      });

      describe('after phase two', function () {
        it('stakesdrop should fail', async function () {
          expect(false).to.be.true;
        });

        it('contribute should fail', async function () {
          expect(false).to.be.true;
        });

        describe('collect_reserved', function () {
          it('should work', async function () {
            expect(false).to.be.true;
          });
        });
      });
    });
  });
});

// describe('phase 1', () => {
//   describe('initialization/access control', () => {
//     it('Contribute fails if desired amount of ABAX to get is less than one', async () => {
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
//       const minimum = ONE_ABAX;
//       expect((await tge.withSigner(contributors[0]).query.contribute(minimum.subn(1), null)).value.ok?.err).to.deep.equal(
//         TGEErrorBuilder.AmountLessThanMinimum(),
//       );
//       const queryRes = (await tge.withSigner(contributors[0]).query.contribute(minimum, null)).value.ok;
//       expect(queryRes?.err).to.be.undefined;
//     });

//     it('Contribute fails if TGE is not started', async () => {
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
//       await time.setTo(tgeStartTime - 1);
//       const queryRes = (await tge.withSigner(contributors[0]).query.contribute(1, null)).value.ok;
//       expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.TGENotStarted());
//     });

//     it('Fails if contribution amount exceeds phase one cap', async () => {
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
//       const desiredAmountOfAbaxToGet = publicContributionInitAmount.addn(1);
//       const queryRes = (await tge.withSigner(contributors[0]).query.contribute(desiredAmountOfAbaxToGet, null)).value.ok;
//       expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.Phase1TokenCapReached());
//     });

//     it('Upon reaching phase one cap switches to phase 2', async () => {
//       await time.setTo(tgeStartTime + 100);
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
//       const desiredAmountOfAbaxToGet = publicContributionInitAmount;
//       const tx = tge.withSigner(contributors[0]).tx.contribute(desiredAmountOfAbaxToGet, null);
//       await expect(tx).to.eventually.be.fulfilled;
//       await time.setTo(tgeStartTime + 100);
//       const currentParams = await getTgeParams(tge);
//       expect(currentParams.phaseTwoStartTime.toString()).to.equal((tgeStartTime + 100).toString());
//     });

//     it('On first contribution handles founders, foundation and strategic reserves (and only on first one)', async () => {
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
//       const contributor = contributors[0];
//       const desiredAmountOfAbaxToGet = toTokenDecimals(40);
//       const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, null);
//       await expect(tx).to.eventually.be.fulfilled;
//       const contributorBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//       expect(contributorBalance?.toString()).to.equal(desiredAmountOfAbaxToGet.muln(4).divn(10).toString());

//       const foundersBalance = (await abaxToken.query.balanceOf(foundersAddress.address)).value.ok;
//       expect(foundersBalance?.toString()).to.equal(phaseOneTokenCap.muln(4).divn(100).toString());

//       const foundationBalance = (await abaxToken.query.balanceOf(foundationAddress.address)).value.ok;
//       expect(foundationBalance?.toString()).to.equal(phaseOneTokenCap.muln(2).divn(100).toString());

//       const strategicReservesBalance = (await abaxToken.query.balanceOf(strategicReservesAddress.address)).value.ok;
//       expect(strategicReservesBalance?.toString()).to.equal(phaseOneTokenCap.muln(58).divn(100).toString());

//       await tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, null);

//       const contributorBalance2 = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//       expect(contributorBalance2?.toString()).to.equal(desiredAmountOfAbaxToGet.muln(4).divn(10).muln(2).toString());

//       const foundersBalancePost2 = (await abaxToken.query.balanceOf(foundersAddress.address)).value.ok;
//       expect(foundersBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(4).divn(100).toString());

//       const foundationBalancePost2 = (await abaxToken.query.balanceOf(foundationAddress.address)).value.ok;
//       expect(foundationBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(2).divn(100).toString());

//       const strategicReservesBalancePost2 = (await abaxToken.query.balanceOf(strategicReservesAddress.address)).value.ok;
//       expect(strategicReservesBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(58).divn(100).toString());
//     });

//     it('Only admin can set bonus multiplier', async () => {
//       const contributor = contributors[1];
//       const bonusMultiplierE6 = new BN(toE6(1.08));
//       const queryRes = await tge.withSigner(contributor).query.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
//       expect(queryRes.value.ok?.err).to.deep.equal(TGEErrorBuilder.AccessControlError(AccessControlError.missingRole));
//       const tx = tge.withSigner(contributor).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
//       await expect(tx).to.eventually.be.rejected;

//       const queryRes2 = await tge.withSigner(admin).query.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
//       expect(queryRes2.value.ok?.err).to.be.undefined;
//       const tx2 = tge.withSigner(admin).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
//       await expect(tx2).to.eventually.be.fulfilled;
//       const bonusMultiplier = (await tge.query.getBonusMultiplierE6(contributor.address)).value.ok;
//       expect(bonusMultiplier?.toString()).to.equal(bonusMultiplierE6.toString());
//     });
//   });

//   describe('user has no bonus', () => {
//     it('Gets the correct amount of tokens & vesting', async () => {
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       const amountToContribute = toTokenDecimals(10);
//       const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
//       await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, amountToContribute);
//       const contributor = contributors[0];

//       const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, null)).value.ok;
//       expect(queryRes?.err).to.be.undefined;
//       expect(queryRes?.ok).not.to.be.null;
//       expect(queryRes?.ok?.toString()).to.equal(amountToContribute.toString());
//       const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, null);
//       await expect(tx).to.eventually.be.fulfilled;
//       const txRes = await tx;

//       expect(txRes.events).to.have.lengthOf(1);
//       expect(txRes.events?.[0].name).to.equal('Contribution');
//       expect(replaceNumericPropsWithStrings(txRes.events?.[0].args)).to.deep.equal({
//         contributor: contributors[0].address,
//         toCreate: desiredAmountOfAbaxToGet.toString(),
//       });
//       const expectedAbaxAmountReceived = desiredAmountOfAbaxToGet.muln(4).divn(10);
//       const expectedAbaxAmountVested = desiredAmountOfAbaxToGet.muln(6).divn(10);
//       const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//       expect(cotributorABAXBalance?.toString()).to.equal(expectedAbaxAmountReceived.toString());

//       const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

//       expect(vestData).not.to.be.null;
//       expect(vestData).not.to.be.undefined;
//       expect(vestData?.amount.toString()).to.equal(expectedAbaxAmountVested.toString());
//       expect(vestData?.released.toString()).to.equal(new BN(0).toString());
//       expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
//       expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(ONE_YEAR.muln(4).toString());
//     });

//     it('Uses referral address and receives bonus, as well as the referee address', async () => {
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       const amountToContribute = toTokenDecimals(10);
//       const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
//       const contributor = contributors[0];
//       await wAZERO.tx.mint(contributor.address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
//       const referrer = contributors[1];
//       const referralBonusMultiplierE6 = new BN(toE6(0.01));
//       await tge.withSigner(admin).tx.registerReferrer(referrer.address);

//       const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, referrer.address)).value.ok;
//       expect(queryRes?.err).to.be.undefined;
//       expect(queryRes?.ok).not.to.be.null;
//       expect(queryRes?.ok?.toString()).to.equal(amountToContribute.toString());
//       const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, referrer.address);
//       await expect(tx).to.eventually.be.fulfilled;
//       const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet.mul(E6bn.add(referralBonusMultiplierE6)).div(E6bn);
//       const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
//       const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

//       const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//       expect(cotributorABAXBalance?.toString()).to.equal(expectedTokensReceivedInstant);
//       const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

//       expect(vestData).not.to.be.null;
//       expect(vestData).not.to.be.undefined;
//       expect(vestData?.amount.toString()).to.equal(expectedTokensReceivedVested);
//       expect(vestData?.released.toString()).to.equal(new BN(0).toString());
//       expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
//       expect;
//     });
//   });

//   describe('user has bonus', () => {
//     it('Gets the correct amount of tokens & vesting', async () => {
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       const amountToContribute = ONE_ABAX;
//       const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
//       const contributor = contributors[1];
//       await wAZERO.tx.mint(contributor.address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
//       const queryPreMultiplier = await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, null);
//       expect(queryPreMultiplier.value.ok?.err).to.be.undefined;
//       expect(queryPreMultiplier.value.ok?.ok?.toString()).to.equal(amountToContribute.toString());

//       const bonusMultiplierE6 = new BN(toE6(0.08));
//       await tge.withSigner(admin).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);

//       const queryPostMultiplierSet = await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, null);
//       expect(queryPostMultiplierSet.value.ok?.ok?.toString()).to.equal(amountToContribute.toString());
//       const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet.mul(E6bn.add(bonusMultiplierE6)).div(E6bn);
//       const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
//       const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

//       const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, null);
//       await expect(tx).to.eventually.be.fulfilled;

//       const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//       expect(cotributorABAXBalance?.toString()).to.equal(expectedTokensReceivedInstant);
//       const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

//       expect(vestData).not.to.be.null;
//       expect(vestData).not.to.be.undefined;
//       expect(vestData?.amount.toString()).to.equal(expectedTokensReceivedVested);
//       expect(vestData?.released.toString()).to.equal(new BN(0).toString());
//       expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
//       expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(ONE_YEAR.muln(4).toString());
//     });

//     it('Uses referral address and receives bonus, as well as the referee address', async () => {
//       await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//       const amountToContribute = toTokenDecimals(10);
//       const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
//       const contributor = contributors[0];
//       await wAZERO.tx.mint(contributor.address, phaseOneTokenCap);
//       await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
//       const referrer = contributors[1];

//       const bonusMultiplierE6 = new BN(toE6(0.08));
//       await tge.withSigner(admin).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);

//       const referralBonusMultiplierE6 = new BN(toE6(0.01));
//       await tge.withSigner(admin).tx.registerReferrer(referrer.address);

//       const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, referrer.address)).value.ok;
//       expect(queryRes?.err).to.be.undefined;
//       expect(queryRes?.ok).not.to.be.null;
//       expect(queryRes?.ok?.toString()).to.equal(amountToContribute.toString());
//       const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, referrer.address);
//       await expect(tx).to.eventually.be.fulfilled;
//       const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet.mul(E6bn.add(referralBonusMultiplierE6).add(bonusMultiplierE6)).div(E6bn);
//       const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
//       const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

//       const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//       expect(cotributorABAXBalance?.toString()).to.equal(expectedTokensReceivedInstant);
//       const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

//       expect(vestData).not.to.be.null;
//       expect(vestData).not.to.be.undefined;
//       expect(vestData?.amount.toString()).to.equal(expectedTokensReceivedVested);
//       expect(vestData?.released.toString()).to.equal(new BN(0).toString());
//       expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
//       expect;
//     });
//   });
// });

// describe('phase 2', () => {
//   beforeEach(async () => {
//     await time.setTo(tgeStartTime + 100);
//     await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
//     await wAZERO.tx.mint(admin.address, phaseOneTokenCap);
//     await wAZERO.withSigner(admin).tx.approve(tge.address, phaseOneTokenCap);
//     const tx = tge.withSigner(admin).tx.contribute(publicContributionInitAmount, null);
//     await expect(tx).to.eventually.be.fulfilled;
//     await time.setTo(tgeStartTime + 100);
//     const currentParams = await getTgeParams(tge);
//     expect(currentParams.phaseTwoStartTime.toString()).to.equal((tgeStartTime + 100).toString());
//   });

//   it('Contribute fails if TGE is finished', async () => {
//     await time.setTo(tgeStartTime + 100 + 100);
//     const contributor = contributors[0];
//     await wAZERO.tx.mint(contributor.address, phaseOneTokenCap);
//     await wAZERO.withSigner(contributor).tx.approve(tge.address, phaseOneTokenCap);
//     const queryResPhaseTwo = (await tge.withSigner(contributor).query.contribute(ONE_ABAX, null)).value.ok;
//     expect(queryResPhaseTwo?.err).to.be.undefined;

//     await time.setTo(tgeStartTime + 100 + phaseTwoDuration.toNumber() + 1);
//     const queryRes = (await tge.withSigner(contributor).query.contribute(ONE_ABAX, null)).value.ok;
//     expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.TGEEnded());
//   });

//   describe('user has no bonus', () => {
//     describe('Generates 40 ABAX tokens', async () => {
//       const contributor = contributors[0];
//       const desiredAmountOfAbaxToGet = toTokenDecimals(40);
//       const expectedAbaxAmountReceivedInstantly = desiredAmountOfAbaxToGet.muln(4).divn(10);
//       const expectedAbaxAmountVested = desiredAmountOfAbaxToGet.muln(6).divn(10);
//       let txRes: SignAndSendSuccessResponse;
//       beforeEach(async () => {
//         await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
//         await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);

//         const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, null)).value.ok;
//         expect(queryRes?.err).to.be.undefined;
//         expect(queryRes?.ok).not.to.be.null;
//         expect(queryRes?.ok?.toString()).to.almostEqualOrEqualNumber('1000001000000');
//         const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, null);
//         await expect(tx).to.eventually.be.fulfilled;
//         txRes = await tx;
//       });
//       it('Gets the correct amount of tokens & vesting', async () => {
//         expect(txRes.events).to.have.lengthOf(1);
//         expect(txRes.events?.[0].name).to.equal('Contribution');
//         expect(replaceNumericPropsWithStrings(txRes.events?.[0].args)).to.deep.equal({
//           contributor: contributors[0].address,
//           toCreate: desiredAmountOfAbaxToGet.toString(),
//         });
//         const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//         expect(cotributorABAXBalance?.toString()).to.equal(expectedAbaxAmountReceivedInstantly.toString());
//       });

//       it('Has correct vesting schedule & is able to collect vested tokens after the time passes', async () => {
//         const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;
//         const expectedVestingDuration = ONE_YEAR.muln(4).toNumber();
//         expect(vestData).not.to.be.null;
//         expect(vestData).not.to.be.undefined;
//         expect(vestData?.amount.toString()).to.equal(expectedAbaxAmountVested.toString());
//         expect(vestData?.released.toString()).to.equal(new BN(0).toString());
//         expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
//         expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(expectedVestingDuration.toString());
//         await time.increase(expectedVestingDuration);
//         const queryRes = await vester.withSigner(contributor).query.release(contributor.address, abaxToken.address, []);
//         expect(queryRes.value.ok?.err).to.be.undefined;
//         expect(queryRes.value.ok?.ok?.toString()).to.equal(expectedAbaxAmountVested.toString());
//         const tx = vester.withSigner(contributor).tx.release(contributor.address, abaxToken.address, []);
//         await expect(tx).to.eventually.be.fulfilled;
//         const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//         expect(cotributorABAXBalance?.toString()).to.equal(expectedAbaxAmountVested.add(expectedAbaxAmountReceivedInstantly).toString());
//       });
//     });
//   });

//   describe('user has bonus', () => {
//     describe('Generates 40 ABAX tokens with bonus', async () => {
//       const contributor = contributors[1];

//       const desiredAmountOfAbaxToGet = toTokenDecimals(40);
//       const bonusMultiplierE6 = new BN(toE6(0.08)); // 8% bonus multiplier
//       const expectedAbaxAmountReceivedInstantlyWithBonus = desiredAmountOfAbaxToGet.mul(bonusMultiplierE6.add(E6bn)).div(E6bn).muln(4).divn(10);
//       const expectedAbaxAmountVestedWithBonus = desiredAmountOfAbaxToGet.mul(bonusMultiplierE6.add(E6bn)).div(E6bn).muln(6).divn(10);
//       let txRes: SignAndSendSuccessResponse;
//       beforeEach(async () => {
//         await wAZERO.tx.mint(contributor.address, phaseOneTokenCap);
//         await wAZERO.withSigner(contributor).tx.approve(tge.address, phaseOneTokenCap);
//         await tge.withSigner(admin).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);

//         const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, null)).value.ok;
//         expect(queryRes?.err).to.be.undefined;
//         expect(queryRes?.ok).not.to.be.null;
//         expect(queryRes?.ok?.toString()).to.almostEqualOrEqualNumber('1000001080000'); // Adjusted for 8% bonus
//         const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, null);
//         await expect(tx).to.eventually.be.fulfilled;
//         txRes = await tx;
//       });
//       it('Gets the correct amount of tokens & vesting with bonus', async () => {
//         expect(txRes.events).to.have.lengthOf(1);
//         expect(txRes.events?.[0].name).to.equal('Contribution');
//         expect(replaceNumericPropsWithStrings(txRes.events?.[0].args)).to.deep.equal({
//           contributor: contributor.address,
//           toCreate: toTokenDecimals(40).toString(),
//         });
//         const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//         expect(cotributorABAXBalance?.toString()).to.equal(expectedAbaxAmountReceivedInstantlyWithBonus.toString());
//       });

//       it('Has correct vesting schedule & is able to collect vested tokens with bonus after the time passes', async () => {
//         const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;
//         expect(vestData).not.to.be.null;
//         expect(vestData).not.to.be.undefined;
//         expect(vestData?.amount.toString()).to.equal(expectedAbaxAmountVestedWithBonus.toString());
//         expect(vestData?.released.toString()).to.equal(new BN(0).toString());

//         const expectedVestingDuration = ONE_YEAR.muln(4).toNumber();
//         expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(expectedVestingDuration.toString());

//         await time.increase(expectedVestingDuration);
//         const queryRes = await vester.withSigner(contributor).query.release(contributor.address, abaxToken.address, []);
//         expect(queryRes.value.ok?.err).to.be.undefined;
//         expect(queryRes.value.ok?.ok?.toString()).to.equal(expectedAbaxAmountVestedWithBonus.toString());

//         const tx = vester.withSigner(contributor).tx.release(contributor.address, abaxToken.address, []);
//         await expect(tx).to.eventually.be.fulfilled;
//         const cotributorABAXBalanceAfter = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
//         expect(cotributorABAXBalanceAfter?.toString()).to.equal(
//           expectedAbaxAmountVestedWithBonus.add(expectedAbaxAmountReceivedInstantlyWithBonus).toString(),
//         );
//       });
//     });
//   });

//   describe('price discovery', () => {
//     it('5 million tokens get minted on top of the 20 million intended for Public Contributors. 25 million ABAX tokens being created. Price increases to 0.0315', async () => {
//       const contributor = contributors[0];
//       const desiredAmountOfAbaxToGet = toTokenDecimals(5_000_000);
//       const amountToContribute = desiredAmountOfAbaxToGet.muln(2);
//       await wAZERO.tx.mint(contributor.address, amountToContribute);
//       await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
//       const cost = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, null)).value.ok?.ok?.toString() ?? '0';
//       const pricePer1 = new BN(cost).mul(E6bn).div(desiredAmountOfAbaxToGet).toNumber() / E6;
//       expect(pricePer1).to.equal(0.028125); //0.02825

//       await tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, null);
//       const totalAmountDistributed = replaceNumericPropsWithStrings(await getTgeParams(tge)).totalAmountDistributed.toString();
//       expect(totalAmountDistributed).to.equal(toTokenDecimals(125_000_000).toString());
//       const nextCostPer1 = (await tge.withSigner(contributor).query.contribute(ONE_ABAX, null)).value.ok?.ok?.toString() ?? '0';
//       const nextPricePer1 = new BN(nextCostPer1).mul(E6bn).div(ONE_ABAX).toNumber() / E6;
//       expect(nextPricePer1).to.equal(0.03125); // 0.0315
//     });
//     it('25 contributions of 10 thousands tokens each. Price increases on subsequent contributions', async () => {
//       const contributor = contributors[0];
//       const initAzeroBalance = toTokenDecimals(1_000_000);
//       await wAZERO.tx.mint(contributor.address, initAzeroBalance);
//       await wAZERO.withSigner(contributor).tx.approve(tge.address, initAzeroBalance);

//       const amountToContribute = toTokenDecimals(10_000);
//       let previousPricePer1 = 0;
//       for (let i = 0; i < 25; i++) {
//         const queryRes = (await tge.withSigner(contributor).query.contribute(ONE_ABAX, null)).value.ok;
//         const currentCostPer1 = queryRes?.ok?.toString() ?? '0';
//         const currentPricePer1 = new BN(currentCostPer1).mul(E6bn).div(ONE_ABAX).toNumber() / E6;
//         expect(currentPricePer1).to.be.greaterThan(previousPricePer1);
//         previousPricePer1 = currentPricePer1;
//         const desiredAmountOfAbaxToGet = amountToContribute.mul(ONE_ABAX).div(new BN(currentCostPer1));
//         // console.log({ desiredAmountOfAbaxToGet: desiredAmountOfAbaxToGet.toString() });
//         const qv = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, null)).value;
//         expect(qv?.ok?.err, `failed on contribution number ${i}`).to.be.undefined;
//         await tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, null);
//       }
//       // const params = await getTgeParams(tge);
//       // console.log('totalAmountDistributed', new BN(params.totalAmountDistributed.toString()).div(ONE_ABAX).toString());
//       // const queryRes = (await tge.withSigner(contributor).query.contribute(ONE_ABAX, null)).value.ok;
//       // const currentCostPer1 = queryRes?.ok?.toString() ?? '0';
//       // const currentPricePer1 = new BN(currentCostPer1).mul(E6bn).div(ONE_ABAX).toNumber() / E6;
//       // console.log({ currentPricePer1 });
//     });
//   });
// });
function testStakedrop(tge: AbaxTge) {
  describe('stakedrop', function () {
    it('failes if called by non-admin', async function () {
      await expect(tge.withSigner(other).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address)).to.be.revertedWithError({
        missingRole: AccessControlError,
      });
    });

    describe('when called by admin', function () {
      describe('when the receiver has no bonus_multiplier', function () {
        const receiver = contributors[0].address;
        it('should mint tokens to apropariate amount to self', async function () {
          expect(false).to.be.true;
        });
        it('should update the total amount of tokens generated', async function () {
          expect(false).to.be.true;
        });
        it('should update the receiver reserved tokens amount', async function () {
          expect(false).to.be.true;
        });
        it('should update the receiver contributed amount', async function () {
          expect(false).to.be.true;
        });
        it('should update the receiver received base amount', async function () {
          expect(false).to.be.true;
        });
        it('should update the receiver received bonus amount', async function () {
          expect(false).to.be.true;
        });
      });
      for (const bonusMultiplierE3 of [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
        describe(`when the receiver has no ${bonusMultiplierE3} bonus_multiplier`, function () {
          const receiver = contributors[0].address;
          beforeEach(async function () {
            await tge.withSigner(admin).tx.setBonusMultiplierE3(receiver, bonusMultiplierE3);
          });
          it('should mint tokens to apropariate amount to self', async function () {
            expect(false).to.be.true;
          });
          it('should update the total amount of tokens generated', async function () {
            expect(false).to.be.true;
          });
          it('should update the receiver reserved tokens amount', async function () {
            expect(false).to.be.true;
          });
          it('should update the receiver contributed amount', async function () {
            expect(false).to.be.true;
          });
          it('should update the receiver received base amount', async function () {
            expect(false).to.be.true;
          });
          it('should update the receiver received bonus amount', async function () {
            expect(false).to.be.true;
          });
        });
      }
    });
  });
}
