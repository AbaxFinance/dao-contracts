import { ReturnPromiseType } from '@abaxfinance/utils';
import type { KeyringPair } from '@polkadot/keyring/types';
import BN from 'bn.js';
import { ABAX_DECIMALS, AZERO_DECIMALS, AbaxDAOSpecificRoles } from 'tests/consts';
import { getTgeParams, roleToSelectorId } from 'tests/misc';
import { expect } from 'tests/setup/chai';
import { getApiPreAndPostTx } from 'tests/setup/queryAt';
import { queryNextIdVestOfAt } from 'tests/setup/queryVester';
import { default as AbaxTge, default as AbaxTgeContract } from 'typechain/contracts/abax_tge';
import AbaxToken from 'typechain/contracts/abax_token';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';
import AbaxTgeDeployer from 'typechain/deployers/abax_tge';
import AbaxTokenDeployer from 'typechain/deployers/abax_token';
import Psp22EmitableDeployer from 'typechain/deployers/psp22_emitable';
import VesterDeployer from 'typechain/deployers/vester';
import { AccessControlError } from 'typechain/types-arguments/abax_tge';
import { TGEErrorBuilder } from 'typechain/types-returns/abax_tge';
import { MAX_U128, ONE_YEAR, replaceNumericPropsWithStrings } from 'wookashwackomytest-polkahat-chai-matchers';
import { E3bn, E6bn, generateRandomSignerWithBalance, getSigners, localApi, time } from 'wookashwackomytest-polkahat-network-helpers';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';
import { queryTGEGetStorage } from './setup/queryTGEGetStorage';

const toE3 = (n: number) => new BN(n * 1e3);

const toTokenDecimals = (amount: string | number | BN) => (BN.isBN(amount) ? amount : new BN(amount)).mul(new BN(10).pow(new BN(ABAX_DECIMALS)));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PHASE_ONE_TOKEN_CAP = toTokenDecimals(1).mul(new BN((100_000_000).toString()));
const PHASE_ONE_TOKEN_FOR_PUBLIC_AMOUNT = toTokenDecimals(20_000_000);
const COST_TO_MINT_MILLION_TOKENS = new BN(1_000_000).divn(40);
const CONTRIBUTION_TO_GET_ONE_PERCENT_BONUS = toTokenDecimals(1_000);
const A_LOT_OF_TOKENS = toTokenDecimals(1_000_000_000);

const [admin, stakedropAdmin, founders, foundation, strategicReserves, other] = getSigners();

const INIT_CONTRIBUTOR_BALANCE = toTokenDecimals(100_000);

const ONE_TOKEN = toTokenDecimals(1);
const MINIMUM_AMOUNT_TO_GENERATE = ONE_TOKEN.muln(40);

const REFERRAL_BONUS_E3 = {
  CONTRIBUTOR: 10,
  REFERRER: 20,
};

//makes a contribution and checks if eceryhing is allright
function createContributeTestPhase1() {
  let bonusMultiplierE3Internal: number | null = null;
  let referrerInternal: KeyringPair | null = null;
  type ContributeTestCtx = {
    tge: AbaxTgeContract;
    abaxToken: AbaxToken;
    wAZERO: PSP22Emitable;
    vester: Vester;
    contributor: KeyringPair;
    amount: BN | null;
  };
  async function testContribute(ctx: ContributeTestCtx, bonusMultiplierE3: number | null = null, referrer: KeyringPair | null = null) {
    const { tge, abaxToken, wAZERO, vester, contributor } = ctx;
    const desiredAmountOfAbaxToGet = ctx.amount === null ? toTokenDecimals(10000) : ctx.amount;
    const amountToContribute = desiredAmountOfAbaxToGet.divn(40);

    const contributedAmountBefore = (await tge.query.contributedAmountBy(contributor.address)).value.ok!;
    const generatedBonusBefore = (await tge.query.generatedBonusAmountBy(contributor.address)).value.ok!;
    const generatedBaseBefore = (await tge.query.generatedBaseAmountBy(contributor.address)).value.ok!;

    const expectedContributedAmount = contributedAmountBefore.add(amountToContribute);
    const expectedGeneratedBase = generatedBaseBefore.add(desiredAmountOfAbaxToGet);

    const contibutionBonusMultiplier = expectedContributedAmount.muln(10).div(CONTRIBUTION_TO_GET_ONE_PERCENT_BONUS);
    const bonusMultiplier = Math.min(
      100,
      (bonusMultiplierE3 ?? 0) + contibutionBonusMultiplier.toNumber() + (referrer ? REFERRAL_BONUS_E3.CONTRIBUTOR : 0),
    );

    let bonus = expectedGeneratedBase.muln(bonusMultiplier).divn(1000).sub(generatedBonusBefore);
    if (bonus.lt(new BN(0))) {
      bonus = new BN(0);
    }

    let totalGenerated = desiredAmountOfAbaxToGet.add(bonus);
    const expectedTokensReceivedInstant = totalGenerated.muln(4).divn(10);
    const expectedTokensReceivedVested = totalGenerated.muln(6).divn(10);

    if (bonusMultiplierE3) {
      await tge.withSigner(admin).tx.setExpBonusMultiplierE3(contributor.address, bonusMultiplierE3);
    }

    let referrerBonus = new BN(0);
    if (referrer) {
      await tge.withSigner(admin).tx.registerReferrer(referrer.address);
      referrerBonus = desiredAmountOfAbaxToGet.muln(REFERRAL_BONUS_E3.REFERRER).div(E3bn);
      totalGenerated = totalGenerated.add(referrerBonus);
    }

    const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, referrer?.address ?? null))
      .value.ok;
    expect(queryRes?.ok?.toString(), 'amountToContribute').to.equal(amountToContribute.toString());

    // TODO : blad w liczeniu, nie nalicza się bonusu za kontrybucje
    const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, referrer?.address ?? null);
    await expect(tx).to.eventually.be.fulfilled;

    await expect(tx).to.changeBNResults(tge, 'AbaxTGEView::total_amount_minted', [[]], [totalGenerated]);

    await expect(tx, 'PSP22 contributor balance').to.changePSP22Balances(abaxToken, [contributor.address], [expectedTokensReceivedInstant]);
    await expect(tx).to.changeGeneratedBaseAmounts(tge, [contributor.address], [desiredAmountOfAbaxToGet]);
    await expect(tx).to.changeContributedAmounts(tge, [contributor.address], [amountToContribute]);
    await expect(tx).to.changeGeneratedBonusAmounts(tge, [contributor.address], [bonus]);

    await expect(tx).to.createVestingSchedule(vester, contributor.address, abaxToken.address, [
      expectedTokensReceivedVested,
      [new BN(0), ONE_YEAR.muln(4)],
    ]);

    if (referrer) {
      await expect(tx).to.changePSP22Balances(abaxToken, [tge.address], [referrerBonus]);
      await expect(tx).to.changeReservedForAmounts(tge, [referrer.address], [referrerBonus]);
    }
  }

  return {
    run: async function (ctx: ContributeTestCtx) {
      return testContribute(ctx, bonusMultiplierE3Internal, referrerInternal);
    },
    withBonus: function (multiplierE3: number) {
      bonusMultiplierE3Internal = multiplierE3;
      return this;
    },
    withReferrer: function (ref: KeyringPair) {
      referrerInternal = ref;
      return this;
    },
  };
}

async function deployTGE(
  now: number,
  abaxToken: AbaxToken,
  wAZERO: PSP22Emitable,
  vester: Vester,
): Promise<{ contract: AbaxTge; initTx: SignAndSendSuccessResponse }> {
  const res = await new AbaxTgeDeployer(await localApi.get(), admin).new(
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
    stakedropAdmin.address,
  );

  await abaxToken.withSigner(admin).tx.grantRole(roleToSelectorId('GENERATOR'), res.contract.address);
  const initTx = await res.contract.withSigner(admin).tx.init();

  return { contract: res.contract, initTx: initTx };
}

const contributors: KeyringPair[] = [];

describe.only('TGE', () => {
  const now = Date.now();
  let tge: AbaxTge;
  let abaxToken: AbaxToken;
  let wAZERO: PSP22Emitable;
  let vester: Vester;
  const TGE_START_TIME = now + DAY;

  before(async () => {
    const api = await localApi.get();
    for (let i = 0; i < 10; i++) {
      const contributor = await generateRandomSignerWithBalance(api);
      contributors.push(contributor);
    }
  });

  beforeEach(async () => {
    const api = await localApi.get();
    await time.setTo(now);
    abaxToken = (await new AbaxTokenDeployer(api, admin).new('ABAX', 'ABAX', ABAX_DECIMALS)).contract;

    wAZERO = (await new Psp22EmitableDeployer(api, admin).new('WAZERO', 'WAZERO', AZERO_DECIMALS)).contract;
    vester = (await new VesterDeployer(api, admin).new()).contract;

    for (const contributor of contributors) {
      await wAZERO.tx.mint(contributor.address, INIT_CONTRIBUTOR_BALANCE);
    }
    tge = (await deployTGE(now, abaxToken, wAZERO, vester)).contract;
  });

  describe('constructor', () => {
    let initTx: SignAndSendSuccessResponse;
    beforeEach(async () => {
      const deploymentResult = await deployTGE(now, abaxToken, wAZERO, vester);
      tge = deploymentResult.contract;
      initTx = deploymentResult.initTx;
    });
    it(`should properly assign parameters of the tge`, async function () {
      await expect(tge.query.tgeParameters()).to.haveOkResult([
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
      ]);
    });

    it('should properly update total minted amount', async function () {
      await expect(tge.query.totalAmountMinted()).to.haveOkResult(PHASE_ONE_TOKEN_CAP.muln(80).divn(100));
    });

    it(`should mint tokens for the founders, foundation, strategic reserves`, async function () {
      await expect(initTx).to.changePSP22Balances(abaxToken, [tge.address], [PHASE_ONE_TOKEN_CAP.muln(80).divn(100)]);
    });
    it('should reserve tokens for founders', async function () {
      await expect(initTx).to.changeReservedForAmounts(tge, [founders.address], [PHASE_ONE_TOKEN_CAP.muln(20).divn(100)]);
    });
    it('should reserve tokens for foundation', async function () {
      await expect(initTx).to.changeReservedForAmounts(tge, [foundation.address], [PHASE_ONE_TOKEN_CAP.muln(2).divn(100)]);
    });
    it('should reserve tokens for strategic reserves', async function () {
      await expect(initTx).to.changeReservedForAmounts(tge, [strategicReserves.address], [PHASE_ONE_TOKEN_CAP.muln(58).divn(100)]);
    });
    it('should assign ADMIN role to deployer - admin', async function () {
      await expect(tge.query.hasRole(0, admin.address)).to.haveOkResult(true);
    });
    it('should assign STAKEDROP_ADMIN role to stakedropAdmin', async function () {
      await expect(tge.query.hasRole(AbaxDAOSpecificRoles.STAKEDROP_ADMIN, stakedropAdmin.address)).to.haveOkResult(true);
    });
  });

  describe('messages', function () {
    beforeEach(async function () {
      for (const contributor of contributors) {
        await wAZERO.tx.mint(contributor.address, INIT_CONTRIBUTOR_BALANCE);
        await wAZERO.withSigner(contributor).tx.approve(tge.address, MAX_U128);
      }
    });
    describe('set bonus multiplier', function () {
      const bonusMultiplierE3 = 100;
      it('should fail if called by non-admin', async function () {
        await expect(tge.withSigner(other).query.setExpBonusMultiplierE3(contributors[0].address, bonusMultiplierE3)).to.be.revertedWithError({
          accessControlError: 'MissingRole',
        });
      });
      it('should work if called by admin', async function () {
        const tx = tge.withSigner(admin).tx.setExpBonusMultiplierE3(contributors[0].address, bonusMultiplierE3);
        await expect(tx).to.be.fulfilled;
        await expect(tx).to.emitEvent(tge, 'BonusMultiplierSet', {
          account: contributors[0].address,
          multiplier: bonusMultiplierE3,
        });

        await expect(tge.query.expBonusMultiplierOfE3(contributors[0].address)).to.haveOkResult(bonusMultiplierE3);
      });
    });

    describe('before phase one starts', function () {
      describe('just after deployment', function () {
        it('contribute fails', async function () {
          await expect(
            tge.withSigner(contributors[0]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[0].address, null),
          ).to.be.revertedWithError({
            tgeNotStarted: null,
          });
        });
        it('collect reserved fails', async function () {
          await expect(tge.withSigner(founders).query.collectReserved(founders.address)).to.be.revertedWithError({ tgeNotStarted: null });
        });

        testStakedrop(() => ({ tge, abaxToken }));
      });

      describe('just before start', function () {
        beforeEach(async function () {
          await time.setTo(now + DAY - 1);
        });
        it('contribute fails', async function () {
          await expect(
            tge.withSigner(contributors[0]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[0].address, null),
          ).to.be.revertedWithError({
            tgeNotStarted: null,
          });
        });
        it('collect reserved fails', async function () {
          await expect(tge.withSigner(founders).query.collectReserved(founders.address)).to.be.revertedWithError({ tgeNotStarted: null });
        });

        testStakedrop(() => ({ tge, abaxToken }));
      });
    });
    describe('phase one', function () {
      let stakedropped: KeyringPair;
      beforeEach(async function () {
        await time.setTo(TGE_START_TIME);
        stakedropped = contributors[contributors.length - 1];
      });

      it('stakedrop should fail', async function () {
        await expect(tge.withSigner(stakedropAdmin).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address)).to.be.revertedWithError({
          tgeStarted: null,
        });
      });

      describe('collect_reserved', function () {
        describe('when called by the founders', function () {
          let tx: SignAndSendSuccessResponse;
          const expectedTokensReceivedTotal = PHASE_ONE_TOKEN_CAP.muln(20).divn(100);
          const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(2).divn(10);
          const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(8).divn(10);
          beforeEach(async function () {
            (await tge.withSigner(founders).query.collectReserved(founders.address)).value.unwrapRecursively();
            tx = await tge.withSigner(founders).tx.collectReserved(founders.address);
          });
          it('should transfer 20% of tokens', async function () {
            await expect(tx).to.changePSP22Balances(abaxToken, [founders.address], [expectedTokensReceivedInstant]);
          });
          it('should create the vesting schedule of 80% over 4 years', async function () {
            await expect(tx).to.createVestingSchedule(vester, founders.address, abaxToken.address, [
              expectedTokensReceivedVested,
              [new BN(0), ONE_YEAR.muln(4)],
            ]);
          });
          it('should set reserved to 0', async function () {
            await expect(tge.query.reservedFor(founders.address)).to.haveOkResult(new BN(0));
          });
        });
        describe('when called by the foundation', function () {
          let tx: SignAndSendSuccessResponse;
          const expectedTokensReceivedTotal = PHASE_ONE_TOKEN_CAP.muln(2).divn(100);
          const expectedTokensReceivedInstant = expectedTokensReceivedTotal;
          beforeEach(async function () {
            (await tge.withSigner(foundation).query.collectReserved(foundation.address)).value.unwrapRecursively();
            tx = await tge.withSigner(foundation).tx.collectReserved(foundation.address);
          });
          it('should transfer 100% of tokens', async function () {
            await expect(tx).to.changePSP22Balances(abaxToken, [foundation.address], [expectedTokensReceivedInstant]);
          });
          it('should set reserved to 0', async function () {
            await expect(tge.query.reservedFor(foundation.address)).to.haveOkResult(new BN(0));
          });
          it('should not create any vesting', async function () {
            await expect(tx).not.to.createVestingSchedule(vester, foundation.address, abaxToken.address);
          });
        });
        describe('when called by the strategic reserves', function () {
          let tx: SignAndSendSuccessResponse;
          const expectedTokensReceivedTotal = PHASE_ONE_TOKEN_CAP.muln(58).divn(100);
          const expectedTokensReceivedInstant = expectedTokensReceivedTotal;
          beforeEach(async function () {
            (await tge.withSigner(strategicReserves).query.collectReserved(strategicReserves.address)).value.unwrapRecursively();
            tx = await tge.withSigner(strategicReserves).tx.collectReserved(strategicReserves.address);
          });
          it('should transfer 100% of tokens', async function () {
            await expect(tx).to.changePSP22Balances(abaxToken, [strategicReserves.address], [expectedTokensReceivedInstant]);
          });
          it('should set reserved to 0', async function () {
            await expect(tge.query.reservedFor(strategicReserves.address)).to.haveOkResult(new BN(0));
          });
          it('should not create any vesting', async function () {
            await expect(tx).not.to.createVestingSchedule(vester, strategicReserves.address, abaxToken.address);
          });
        });
        describe('when called by other', function () {
          it('should fail', async function () {
            await expect(tge.withSigner(other).query.collectReserved(other.address)).to.be.revertedWithError({
              noReservedTokens: null,
            });
          });
        });
      });
      describe('collect_reserved (stakedropped)', function () {
        beforeEach(async function () {
          await time.setTo(now);
          //v prerequisite for stakedrop test, has to be done prior to phase one start
          await tge.withSigner(stakedropAdmin).tx.stakedrop(ONE_TOKEN, ONE_TOKEN, stakedropped.address);
          //^ prerequisite for stakedrop test, has to be done prior to phase one start
          await time.setTo(TGE_START_TIME);
        });
        describe('when called by stakedroped account', function () {
          let tx: SignAndSendSuccessResponse;
          const expectedTokensReceivedTotal = ONE_TOKEN;
          const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(40).divn(100);
          const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(60).divn(100);
          beforeEach(async function () {
            tx = await tge.withSigner(stakedropped).tx.collectReserved(stakedropped.address);
          });
          it('should transfer 40% of tokens', async function () {
            await expect(tx).to.changePSP22Balances(abaxToken, [stakedropped.address], [expectedTokensReceivedInstant]);
          });
          it('should create the vesting schedule of 60% over 4 years', async function () {
            await expect(tx).to.createVestingSchedule(vester, stakedropped.address, abaxToken.address, [
              expectedTokensReceivedVested,
              [new BN(0), ONE_YEAR.muln(4)],
            ]);
          });
          it('should set reserved to 0', async function () {
            await expect(tge.query.reservedFor(stakedropped.address)).to.haveOkResult(new BN(0));
          });
        });
      });
      describe('contribute', function () {
        it('should fail with no allowance', async function () {
          await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, new BN(0));
          await expect(
            tge.withSigner(contributors[0]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[0].address, null),
          ).to.be.revertedWithError({ psp22Error: { insufficientAllowance: null } });
        });
        it('should fail with less than minimum', async function () {
          await expect(
            tge.withSigner(contributors[0]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE.subn(1), contributors[0].address, null),
          ).to.be.revertedWithError({
            amountLessThanMinimum: null,
          });
        });
        describe('when not trigering the 2nd phase', function () {
          describe('with no exp bonus and with no referrer', function () {
            it('single contribution works', async function () {
              await createContributeTestPhase1().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
            });
            it('multiple contributions work', async function () {
              await createContributeTestPhase1().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
            });
          });

          describe('with exp bonus and with no referrer', function () {
            it('single contribution works', async function () {
              await createContributeTestPhase1().withBonus(30).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
            });
            it('multiple contributions work', async function () {
              await createContributeTestPhase1().withBonus(30).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1().withBonus(30).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1().withBonus(30).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1().withBonus(30).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
            });
          });

          describe('with exp bonus and with referrer', function () {
            it('single contribution works', async function () {
              await createContributeTestPhase1()
                .withBonus(30)
                .withReferrer(contributors[5])
                .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
            });
            it('multiple contributions work - different referers', async function () {
              await createContributeTestPhase1()
                .withBonus(30)
                .withReferrer(contributors[5])
                .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1()
                .withBonus(40)
                .withReferrer(contributors[6])
                .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1()
                .withBonus(50)
                .withReferrer(contributors[7])
                .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
            });
            it('multiple contributions work - same referrer', async function () {
              await createContributeTestPhase1()
                .withBonus(10)
                .withReferrer(contributors[5])
                .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1()
                .withBonus(20)
                .withReferrer(contributors[5])
                .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1()
                .withBonus(30)
                .withReferrer(contributors[5])
                .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
              await createContributeTestPhase1()
                .withBonus(40)
                .withReferrer(contributors[5])
                .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4], amount: null });
            });
          });
        });
        describe('when trigering the 2nd phase', function () {
          beforeEach(async function () {
            await time.increase(DAY);
            await wAZERO.tx.mint(contributors[0].address, A_LOT_OF_TOKENS);
            const amountToGetClose = PHASE_ONE_TOKEN_FOR_PUBLIC_AMOUNT.sub(ONE_TOKEN.muln(40)).muln(100).divn(110).addn(1); // 100/110 to take into account 10% bonus \ +1 to take into account roundings
            await tge.withSigner(contributors[0]).tx.contribute(amountToGetClose, contributors[0].address, null);
          });
          it('state', async function () {
            await expect(tge.query.totalAmountMinted()).to.haveOkResult(PHASE_ONE_TOKEN_CAP.sub(ONE_TOKEN.muln(40)));
          });
          it('when exactly reaching cap the phase 2 should start', async function () {
            const amountToReach = ONE_TOKEN.muln(40);
            const tx = await tge.withSigner(contributors[1]).tx.contribute(amountToReach, contributors[1].address, null);
            await expect(tx).to.emitEvent(tge, 'PhaseChanged');
            const currentParams = await queryTGEGetStorage(await localApi.get(), tge);
            const curr_time = await time.latest();
            expect(currentParams.phaseTwoStartTime?.toString()).to.equal(curr_time.toString());
          });
          it('when overreaching cap the phase 2 should start and the cost should be properly calculated', async () => {
            await wAZERO.tx.mint(contributors[1].address, A_LOT_OF_TOKENS);
            /// it should result in minitng 40 tokens in phase1 and 20milions of toknens in phase2 (base, not including bonus)
            const baseAmountToMint = ONE_TOKEN.muln(20_000_040);
            const expectedCost = toTokenDecimals(750_021); // 750_000 (+20) phase2 and 1 phase1 (calculation rounding)

            const cost = (await tge.withSigner(contributors[1]).query.contribute(baseAmountToMint, contributors[1].address, null)).value.ok!.ok!;
            const tx = await tge.withSigner(contributors[1]).tx.contribute(baseAmountToMint, contributors[1].address, null);

            await expect(tx).to.emitEvent(tge, 'PhaseChanged');

            const curr_time = await time.latest();
            const currentParams = await queryTGEGetStorage(await localApi.get(), tge);
            expect(currentParams.phaseTwoStartTime?.toString()).to.equal(curr_time.toString());

            expect(cost.toString()).to.equal(expectedCost.toString());

            await expect(tx).to.changePSP22Balances(abaxToken, [contributors[1].address], [baseAmountToMint.muln(110).divn(100).muln(40).divn(100)]); //TODO agree on rounding
            await expect(tx).to.changePSP22Balances(wAZERO, [strategicReserves.address], [expectedCost]); //TODO agree on rounding
            await expect(tx).to.createVestingSchedule(vester, contributors[1].address, abaxToken.address, [
              baseAmountToMint.muln(110).divn(100).muln(60).divn(100),
              [new BN(0), ONE_YEAR.muln(4)],
            ]);
          });
        });
      });
    });
    describe('phase two', function () {
      beforeEach(async function () {
        await time.setTo(TGE_START_TIME);
        await wAZERO.tx.mint(contributors[0].address, A_LOT_OF_TOKENS);
        const amountToGetClose = PHASE_ONE_TOKEN_FOR_PUBLIC_AMOUNT.sub(ONE_TOKEN.muln(40)).muln(100).divn(110).addn(1); // 100/110 to take into account 10% bonus \ +1 to take into account roundings
        await tge.withSigner(contributors[0]).tx.contribute(amountToGetClose, contributors[0].address, null);
        const amountToReach = ONE_TOKEN.muln(40);
        await tge.withSigner(contributors[1]).tx.contribute(amountToReach, contributors[1].address, null);
      });

      it('state', async function () {
        await expect(tge.query.totalAmountMinted()).to.haveOkResult(PHASE_ONE_TOKEN_CAP.toString());
        const phaseTwoStartTime = (await tge.query.tgeParameters()).value.ok![1];
        expect(phaseTwoStartTime).not.to.be.null;
      });

      it('stakedrop should fail', async function () {
        await expect(tge.withSigner(stakedropAdmin).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address)).to.be.revertedWithError({
          tgeStarted: null,
        });
      });

      describe('collect_reserved', function () {
        it('should work', async function () {
          await expect(tge.withSigner(founders).query.collectReserved(founders.address)).to.haveOkResult();
        });
      });

      describe('just after started', function () {
        it('should correctly calculate the cost and work', async function () {
          const contributor = contributors[1];
          const desiredAmountOfAbaxToGet = toTokenDecimals(1_000_000);
          const expectedCost = toTokenDecimals(25_626); //1_000_000* 0.025 * (1.05 + 1)/2 + ( 0.00001 rounding)
          await expect(tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)).to.haveOkResult(
            expectedCost.toString(),
          );
        });
        describe('just before ended', function () {
          beforeEach(async function () {
            await time.increase(90 * DAY - 1);
          });
          describe('contribute', function () {
            it('should correctly calculate the cost and work', async function () {
              const contributor = contributors[1];
              const desiredAmountOfAbaxToGet = toTokenDecimals(2_000_000);
              const expectedCost = toTokenDecimals(52502); // 2000000 * (0.02625 * (1.10 + 1)/2 + ( 0.00001 rounding))
              await expect(tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)).to.haveOkResult(
                expectedCost.toString(),
              );
            });
          });
          describe('after phase two', function () {
            beforeEach(async function () {
              await time.increase(2);
            });
            it('stakesdrop should fail', async function () {
              await expect(tge.withSigner(stakedropAdmin).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address)).to.be.revertedWithError({
                tgeStarted: null,
              });
            });

            it('contribute should fail', async function () {
              await expect(
                tge.withSigner(contributors[0]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[0].address, null),
              ).to.be.revertedWithError({
                tgeEnded: null,
              });
            });

            describe('collect_reserved', function () {
              it('should work', async function () {
                await expect(tge.withSigner(founders).query.collectReserved(founders.address)).to.haveOkResult();
              });
            });
          });
        });
      });
    });
  });

  // TODO
  describe('price discovery', () => {
    beforeEach(async function () {
      for (const contributor of contributors) {
        await wAZERO.tx.mint(contributor.address, INIT_CONTRIBUTOR_BALANCE);
        await wAZERO.withSigner(contributor).tx.approve(tge.address, MAX_U128);
      }
    });
    describe('phase one', () => {
      describe('phase 2', () => {
        beforeEach(async () => {
          await time.setTo(TGE_START_TIME);
          await wAZERO.tx.mint(contributors[0].address, A_LOT_OF_TOKENS);
          const amountToGetClose = PHASE_ONE_TOKEN_FOR_PUBLIC_AMOUNT.sub(ONE_TOKEN.muln(40)).muln(100).divn(110).addn(1); // 100/110 to take into account 10% bonus \ +1 to take into account roundings
          await tge.withSigner(contributors[0]).tx.contribute(amountToGetClose, contributors[0].address, null);
          const amountToReach = ONE_TOKEN.muln(40);
          await tge.withSigner(contributors[1]).tx.contribute(amountToReach, contributors[1].address, null);
        });

        describe('price discovery', () => {
          it('user wants to creat 5 million tokens on top 20 million intended for Public Contributors. \n Ge will receive 5,5 millions because of 10% bonus. total of 27,5 million ABAX tokens being created. Price increases to 0.0315', async () => {
            const contributor = contributors[3];
            const desiredAmountOfAbaxToGet = toTokenDecimals(5_000_000);
            await wAZERO.tx.mint(contributor.address, A_LOT_OF_TOKENS);
            const cost =
              (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)).value.ok?.ok?.toString() ??
              '0';
            const pricePer1 = new BN(cost).mul(E6bn).div(desiredAmountOfAbaxToGet).toNumber() / 1e6;
            expect(pricePer1).to.equal(0.028126); //0.028125 + 0.000001 (rounding)

            await tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
            const totalAmountDistributed = (await tge.query.totalAmountMinted()).value.unwrapRecursively().toString();
            expect(totalAmountDistributed).to.equal(toTokenDecimals(127_500_000).toString()); //
            const nextCostPerMinimum =
              (await tge.withSigner(contributor).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributor.address, null)).value.ok?.ok?.toString() ??
              '0';
            const nextPricePer1 = new BN(nextCostPerMinimum).mul(E6bn).div(MINIMUM_AMOUNT_TO_GENERATE).toNumber() / 1e6;
            expect(nextPricePer1).to.equal(0.031876); // 0.025 * 1.275 + 0.000001 (rounding)
          });
          it('100 contributions - each asks to generate 1 million tokens to self./n one will receive 1.1 million becaouse of 10% bonus. \n The total of 5.5 milion tokens will be created.', async () => {
            const contributor = contributors[3];
            await wAZERO.tx.mint(contributor.address, A_LOT_OF_TOKENS);
            const amountToMint = toTokenDecimals(1_000_000);

            const priceLog: number[] = [];
            for (let i = 1; i < 100; i++) {
              const expectedPrice = 0.025 * (1 + 0.055 * (i - 1)) + 0.025 / 20 / 2 + 0.000001;
              const queryRes = (await tge.withSigner(contributor).query.contribute(amountToMint, contributor.address, null)).value.ok;
              const currentCost = queryRes?.ok?.toString() ?? '0';
              const currentPricePer1Base = new BN(currentCost).mul(E6bn).div(amountToMint).toNumber() / 1e6;
              expect(currentPricePer1Base.toString()).to.be.equal(expectedPrice.toFixed(6));
              priceLog.push(currentPricePer1Base);

              const qv = (await tge.withSigner(contributor).query.contribute(amountToMint, contributor.address, null)).value;
              expect(qv?.ok?.err, `failed on contribution number ${i}`).to.be.undefined;
              await tge.withSigner(contributor).tx.contribute(amountToMint, contributor.address, null);
            }
            console.log('price over time');
            console.table(priceLog);
            const queryRes = (await tge.withSigner(contributor).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributor.address, null)).value.ok;
            const currentCostPerMinimum = queryRes?.ok?.toString() ?? '0';
            const currentPricePer1 = new BN(currentCostPerMinimum).mul(E6bn).div(MINIMUM_AMOUNT_TO_GENERATE).toNumber() / 1e6;
            console.log('final price', currentPricePer1);
          });
        });
      });
    });
  });
});

function testStakedrop(getCtx: () => { tge: AbaxTge; abaxToken: AbaxToken }) {
  describe('stakedrop', function () {
    let tge: AbaxTge;
    let abaxToken: AbaxToken;
    beforeEach(async function () {
      tge = getCtx().tge;
      abaxToken = getCtx().abaxToken;
    });
    it('fails if called by non-admin', async function () {
      await expect(tge.withSigner(other).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address)).to.be.revertedWithError(
        TGEErrorBuilder.AccessControlError(AccessControlError.missingRole),
      );
    });
    it('fails if called by default admin', async function () {
      await expect(tge.withSigner(admin).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address)).to.be.revertedWithError(
        TGEErrorBuilder.AccessControlError(AccessControlError.missingRole),
      );
    });

    describe('when called by stakedrop admin', function () {
      describe('when the receiver has no exp_bonus_multiplier', function () {
        let receiver: string;
        const FEE_PAID = ONE_TOKEN.muln(10);
        const AMOUNT = FEE_PAID.muln(40);
        let tx: SignAndSendSuccessResponse;
        beforeEach(async function () {
          receiver = contributors[0].address;
          tx = await tge.withSigner(stakedropAdmin).tx.stakedrop(AMOUNT, FEE_PAID, receiver);
        });
        it('should mint tokens to apropariate amount to self', async function () {
          await expect(tx).to.changePSP22Balances(abaxToken, [tge.address], [AMOUNT]);
        });
        it('should update the total amount of tokens generated', async function () {
          await expect(tx).to.changeBNResults(tge, 'AbaxTGEView::total_amount_minted', [[]], [AMOUNT]);
        });
        it('should update the receiver reserved tokens amount', async function () {
          await expect(tx).to.changeReservedForAmounts(tge, [receiver], [AMOUNT]);
        });
        it('should update the receiver contributed amount', async function () {
          await expect(tx).to.changeContributedAmounts(tge, [receiver], [FEE_PAID]);
        });
        it('should update the receiver received base amount', async function () {
          await expect(tx).to.changeGeneratedBaseAmounts(tge, [receiver], [AMOUNT]);
        });
        it('should update the receiver received bonus amount', async function () {
          await expect(tx).to.changeGeneratedBonusAmounts(tge, [receiver], [new BN(0)]);
        });

        it('should emit Stakedrop event', async function () {
          await expect(tx).to.emitEvent(tge, 'Stakedrop', {
            receiver: receiver,
            amount: AMOUNT,
            feePaid: FEE_PAID,
          });
        });
      });
      for (const bonusMultiplierE3 of [10, 40, 70, 100]) {
        describe(`when the receiver has ${(bonusMultiplierE3 * 100) / 1000}% exp_bonus_multiplier`, function () {
          let receiver: string;
          const FEE_PAID = ONE_TOKEN.muln(10);
          const AMOUNT = FEE_PAID.muln(40);
          let tx: SignAndSendSuccessResponse;
          beforeEach(async function () {
            receiver = contributors[0].address;
            await tge.withSigner(admin).tx.setExpBonusMultiplierE3(receiver, bonusMultiplierE3);
            tx = await tge.withSigner(stakedropAdmin).tx.stakedrop(AMOUNT, FEE_PAID, receiver);
          });
          it('should mint tokens to apropariate amount to self', async function () {
            await expect(tx).to.changePSP22Balances(abaxToken, [tge.address], [AMOUNT.mul(E3bn.add(new BN(bonusMultiplierE3))).divn(1000)]);
          });
          it('should update the total amount of tokens generated', async function () {
            const delta = AMOUNT.mul(E3bn.add(new BN(bonusMultiplierE3))).divn(1000);
            await expect(tx).to.changeBNResults(tge, 'AbaxTGEView::total_amount_minted', [[]], [delta]);
          });
          it('should update the receiver reserved tokens amount', async function () {
            await expect(tx).to.changeReservedForAmounts(tge, [receiver], [AMOUNT.mul(E3bn.add(new BN(bonusMultiplierE3))).divn(1000)]);
          });
          it('should update the receiver contributed amount', async function () {
            await expect(tx).to.changeContributedAmounts(tge, [receiver], [FEE_PAID]);
          });
          it('should update the receiver received base amount', async function () {
            await expect(tx).to.changeGeneratedBaseAmounts(tge, [receiver], [AMOUNT]);
          });
          it('should update the receiver received bonus amount', async function () {
            await expect(tx).to.changeGeneratedBonusAmounts(tge, [receiver], [AMOUNT.muln(bonusMultiplierE3).divn(1000)]);
          });
          it('should emit Stakedrop event', async function () {
            await expect(tx).to.emitEvent(tge, 'Stakedrop', {
              receiver: receiver,
              amount: AMOUNT,
              feePaid: FEE_PAID,
            });
          });
        });
      }
    });
  });
}
