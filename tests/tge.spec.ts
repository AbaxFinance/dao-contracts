import { ReturnPromiseType } from '@abaxfinance/utils';
import type { KeyringPair } from '@polkadot/keyring/types';
import BN from 'bn.js';
import { ABAX_DECIMALS, AZERO_DECIMALS, AbaxDAOSpecificRoles } from 'tests/consts';
import { getTgeParams, roleToSelectorId } from 'tests/misc';
import { expect } from 'tests/setup/chai';
import { getApiPreAndPostTx } from 'tests/setup/queryAt';
import { queryTGEGetAccountStorage } from 'tests/setup/queryTGEGetAccountStorage';
import { queryTGEGetStorage } from 'tests/setup/queryTGEGetStorage';
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

const toE3 = (n: number) => new BN(n * 1e3);

const toTokenDecimals = (amount: string | number | BN) => (BN.isBN(amount) ? amount : new BN(amount)).mul(new BN(10).pow(new BN(ABAX_DECIMALS)));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PHASE_ONE_TOKEN_CAP = toTokenDecimals(1).mul(new BN((100_000_000).toString()));
const PHASE_ONE_PUBLIC_CONTRIBUTION_CAP = toTokenDecimals(20_000_000);
const COST_TO_MINT_MILLION_TOKENS = new BN(1_000_000).divn(40);

const [admin, stakedropAdmin, founders, foundation, strategicReserves, other] = getSigners();

const INIT_CONTRIBUTOR_BALANCE = toTokenDecimals(100_000);

const ONE_TOKEN = toTokenDecimals(1);
const MINIMUM_AMOUNT_TO_GENERATE = ONE_TOKEN.muln(40);

const REFERRAL_BONUS_E3 = {
  CONTRIBUTOR: new BN(toE3(0.01)),
  REFERRER: new BN(toE3(0.01)),
};

//makes a contribution and checks if eceryhing is allright
function createContributeTest() {
  let bonusMultiplierE3Internal: BN | null = null;
  let referrerInternal: KeyringPair | null = null;
  type ContributeTestCtx = {
    tge: AbaxTgeContract;
    abaxToken: AbaxToken;
    wAZERO: PSP22Emitable;
    vester: Vester;
    contributor: KeyringPair;
  };
  async function testContribute(
    ctx: ContributeTestCtx,
    bonusMultiplierE3: BN | null = null,
    referrer: KeyringPair | null = null,
    previousClaimableByReferer: BN,
  ) {
    const { tge, abaxToken, wAZERO, vester, contributor } = ctx;
    const amountToContribute = toTokenDecimals(10);
    const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
    await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);

    if (bonusMultiplierE3) {
      await tge.withSigner(admin).tx.setBonusMultiplierE3(contributor.address, bonusMultiplierE3);
    }

    if (referrer) {
      await tge.withSigner(admin).tx.registerReferrer(referrer.address);
    }

    const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, referrer?.address ?? null))
      .value.ok;
    expect(queryRes?.err).to.be.undefined;
    expect(queryRes?.ok).not.to.be.null;
    expect(queryRes?.ok?.toString()).to.equal(amountToContribute.toString());
    const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, referrer?.address ?? null);
    await expect(tx).to.eventually.be.fulfilled;
    const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet
      .mul(E3bn.add(referrer ? REFERRAL_BONUS_E3.CONTRIBUTOR : new BN(0)).add(bonusMultiplierE3 ?? new BN(0)))
      .div(E3bn);
    const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
    const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

    const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
    expect(cotributorABAXBalance?.toString()).to.equal(expectedTokensReceivedInstant);
    const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

    expect(vestData).not.to.be.null;
    expect(vestData).not.to.be.undefined;
    expect(vestData?.amount.toString()).to.equal(expectedTokensReceivedVested);
    expect(vestData?.released.toString()).to.equal(new BN(0).toString());
    expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());

    if (referrer) {
      await expect(tx).to.changePSP22Balances(abaxToken, [referrer.address], [new BN(0)]);
      await expect(tge.withSigner(referrer).query.collectReserved()).to.haveOkResult(
        previousClaimableByReferer.add(desiredAmountOfAbaxToGet.mul(REFERRAL_BONUS_E3.REFERRER).div(E3bn)),
      );
    }
  }

  return {
    run: async function (ctx: ContributeTestCtx) {
      let previousClaimableByReferer = new BN(0);
      if (referrerInternal) {
        const qr = await ctx.tge.withSigner(referrerInternal).query.collectReserved();
        if (qr.value.ok?.ok) {
          previousClaimableByReferer = new BN(qr.value.ok.ok.toString());
        }
      }
      return testContribute(ctx, bonusMultiplierE3Internal, referrerInternal, previousClaimableByReferer);
    },
    withBonus: function (multiplierE3: BN) {
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

describe.skip('TGE', () => {
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
      await expect(initTx).to.changePSP22Balances(abaxToken, [tge.address], [PHASE_ONE_TOKEN_CAP.muln(80).divn(100)]);
    });
    it('should reserve tokens for founders', async function () {
      await expect(initTx).to.changeReservedTokenAmounts(tge, [founders.address], [PHASE_ONE_TOKEN_CAP.muln(20).divn(100)]);
    });
    it('should reserve tokens for foundation', async function () {
      await expect(initTx).to.changeReservedTokenAmounts(tge, [foundation.address], [PHASE_ONE_TOKEN_CAP.muln(2).divn(100)]);
    });
    it('should reserve tokens for strategic reserves', async function () {
      await expect(initTx).to.changeReservedTokenAmounts(tge, [strategicReserves.address], [PHASE_ONE_TOKEN_CAP.muln(58).divn(100)]);
    });
    it('should assign ADMIN role to deployer - admin', async function () {
      await expect(tge.query.hasRole(0, admin.address)).to.haveOkResult(true);
    });
    it('should assign STAKEDROP_ADMIN role to stakedropAdmin', async function () {
      await expect(tge.query.hasRole(AbaxDAOSpecificRoles.STAKEDROP_ADMIN, stakedropAdmin.address)).to.haveOkResult(true);
    });
  });
  describe('messages', () => {
    describe('set bonus multiplier', function () {
      const bonusMultiplierE3 = 100;
      it('should fail if called by non-admin', async function () {
        await expect(tge.withSigner(other).query.setBonusMultiplierE3(contributors[0].address, bonusMultiplierE3)).to.be.revertedWithError({
          accessControlError: 'MissingRole',
        });
      });
      it('should work if called by admin', async function () {
        const tx = tge.withSigner(admin).tx.setBonusMultiplierE3(contributors[0].address, bonusMultiplierE3);
        await expect(tx).to.be.fulfilled;
        await expect(tx).to.emitEvent(tge, 'BonusMultiplierSet', {
          account: contributors[0].address,
          multiplier: bonusMultiplierE3,
        });

        await expect(tge.query.getBonusMultiplierE3(contributors[0].address)).to.haveOkResult(bonusMultiplierE3);
      });
    });

    describe('before phase one starts', function () {
      describe('just after deployment', function () {
        beforeEach(async function () {
          await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, MINIMUM_AMOUNT_TO_GENERATE);
        });
        it('contribute fails', async function () {
          await expect(
            tge.withSigner(contributors[0]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[0].address, null),
          ).to.be.revertedWithError({
            tgeNotStarted: null,
          });
        });
        it('collect reserved fails', async function () {
          await expect(tge.withSigner(founders).query.collectReserved()).to.be.revertedWithError({ tgeNotStarted: null });
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
          await expect(tge.withSigner(founders).query.collectReserved()).to.be.revertedWithError({ tgeNotStarted: null });
        });

        testStakedrop(() => ({ tge, abaxToken }));

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
              let accStorageBefore: ReturnPromiseType<typeof queryTGEGetAccountStorage>;
              beforeEach(async function () {
                accStorageBefore = await queryTGEGetAccountStorage(await localApi.get(), tge, founders.address);
                (await tge.withSigner(founders).query.collectReserved()).value.unwrapRecursively();
                tx = await tge.withSigner(founders).tx.collectReserved();
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
                const accStorageAfter = await queryTGEGetAccountStorage(await localApi.get(), tge, founders.address);
                expect(accStorageAfter.reservedTokens.toString()).to.equal('0');
                expect(accStorageAfter.contributedAmount.toString()).to.equal(accStorageBefore.contributedAmount.toString());
                expect(accStorageAfter.baseAmountCreated.toString()).to.equal(accStorageBefore.baseAmountCreated.toString());
                expect(accStorageAfter.bonusAmountCreated.toString()).to.equal(accStorageBefore.bonusAmountCreated.toString());
              });
            });
            describe('when called by the foundation', function () {
              let tx: SignAndSendSuccessResponse;
              const expectedTokensReceivedTotal = PHASE_ONE_TOKEN_CAP.muln(2).divn(100);
              const expectedTokensReceivedInstant = expectedTokensReceivedTotal;
              const expectedTokensReceivedVested = new BN(0);
              let accStorageBefore: ReturnPromiseType<typeof queryTGEGetAccountStorage>;
              beforeEach(async function () {
                accStorageBefore = await queryTGEGetAccountStorage(await localApi.get(), tge, foundation.address);
                (await tge.withSigner(foundation).query.collectReserved()).value.unwrapRecursively();
                tx = await tge.withSigner(foundation).tx.collectReserved();
              });
              it('should transfer 100% of tokens', async function () {
                await expect(tx).to.changePSP22Balances(abaxToken, [foundation.address], [expectedTokensReceivedInstant]);
              });
              it('should set reserved to 0', async function () {
                const accStorageAfter = await queryTGEGetAccountStorage(await localApi.get(), tge, foundation.address);
                expect(accStorageAfter.reservedTokens.toString()).to.equal('0');
                expect(accStorageAfter.contributedAmount.toString()).to.equal(accStorageBefore.contributedAmount.toString());
                expect(accStorageAfter.baseAmountCreated.toString()).to.equal(accStorageBefore.baseAmountCreated.toString());
                expect(accStorageAfter.bonusAmountCreated.toString()).to.equal(accStorageBefore.bonusAmountCreated.toString());
              });
              it('should not create any vesting', async function () {
                await expect(tx).not.to.createVestingSchedule(vester, foundation.address, abaxToken.address);
              });
            });
            describe('when called by the strategic reserves', function () {
              let tx: SignAndSendSuccessResponse;
              const expectedTokensReceivedTotal = PHASE_ONE_TOKEN_CAP.muln(58).divn(100);
              const expectedTokensReceivedInstant = expectedTokensReceivedTotal;
              let accStorageBefore: ReturnPromiseType<typeof queryTGEGetAccountStorage>;
              beforeEach(async function () {
                accStorageBefore = await queryTGEGetAccountStorage(await localApi.get(), tge, strategicReserves.address);
                (await tge.withSigner(strategicReserves).query.collectReserved()).value.unwrapRecursively();
                tx = await tge.withSigner(strategicReserves).tx.collectReserved();
              });
              it('should transfer 100% of tokens', async function () {
                await expect(tx).to.changePSP22Balances(abaxToken, [strategicReserves.address], [expectedTokensReceivedInstant]);
              });
              it('should set reserved to 0', async function () {
                const accStorageAfter = await queryTGEGetAccountStorage(await localApi.get(), tge, strategicReserves.address);
                expect(accStorageAfter.reservedTokens.toString()).to.equal('0');
                expect(accStorageAfter.contributedAmount.toString()).to.equal(accStorageBefore.contributedAmount.toString());
                expect(accStorageAfter.baseAmountCreated.toString()).to.equal(accStorageBefore.baseAmountCreated.toString());
                expect(accStorageAfter.bonusAmountCreated.toString()).to.equal(accStorageBefore.bonusAmountCreated.toString());
              });
              it('should not create any vesting', async function () {
                await expect(tx).not.to.createVestingSchedule(vester, strategicReserves.address, abaxToken.address);
              });
            });
            describe('when called by other', function () {
              it('should fail', async function () {
                await expect(tge.withSigner(other).query.collectReserved()).to.be.revertedWithError({
                  noReservedTokens: null,
                });
              });
            });
          });
          describe('collect_reserved (stakedropped)', function () {
            beforeEach(async function () {
              await time.setTo(now);
              //v prerequisite for stakedrop test, has to be done prior to phase one start
              (await tge.withSigner(stakedropAdmin).query.stakedrop(ONE_TOKEN, ONE_TOKEN, stakedropped.address)).value.unwrapRecursively();
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
                (await tge.withSigner(stakedropped).query.collectReserved()).value.unwrapRecursively();
                tx = await tge.withSigner(stakedropped).tx.collectReserved();
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
                const accStorageAfter = await queryTGEGetAccountStorage(await localApi.get(), tge, stakedropped.address);
                expect(accStorageAfter.reservedTokens.toString()).to.equal('0');
              });
            });
          });
          describe('contribute', function () {
            it('should fail with no allowance', async function () {
              await expect(
                tge.withSigner(contributors[0]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[0].address, null),
              ).to.be.revertedWithError({ psp22Error: { insufficientAllowance: null } });
            });
            describe('when not trigering the 2nd phase', function () {
              beforeEach(async function () {
                await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, MINIMUM_AMOUNT_TO_GENERATE);
              });
              it('should fail with less than minimum', async function () {
                await expect(
                  tge.withSigner(contributors[0]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE.subn(1), contributors[0].address, null),
                ).to.be.revertedWithError({
                  amountLessThanMinimum: null,
                });
              });

              describe('with no exp bonus and with no referrer', function () {
                it('single contribution works', async function () {
                  await createContributeTest().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                });
                it('multiple contributions work', async function () {
                  await createContributeTest().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest().run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                });
              });

              describe('with exp bonus and with no referrer', function () {
                it('single contribution works', async function () {
                  await createContributeTest().withBonus(toE3(0.3)).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                });
                it('multiple contributions work', async function () {
                  await createContributeTest().withBonus(toE3(0.3)).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest().withBonus(toE3(0.3)).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest().withBonus(toE3(0.3)).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest().withBonus(toE3(0.3)).run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                });
              });

              describe('with exp bonus and with referrer', function () {
                it('single contribution works', async function () {
                  await createContributeTest()
                    .withBonus(toE3(0.3))
                    .withReferrer(contributors[5])
                    .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                });
                it('multiple contributions work - different referers', async function () {
                  await createContributeTest()
                    .withBonus(toE3(0.3))
                    .withReferrer(contributors[5])
                    .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest()
                    .withBonus(toE3(0.3))
                    .withReferrer(contributors[6])
                    .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest()
                    .withBonus(toE3(0.3))
                    .withReferrer(contributors[7])
                    .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                });
                it('multiple contributions work - same referrer', async function () {
                  await createContributeTest()
                    .withBonus(toE3(0.3))
                    .withReferrer(contributors[5])
                    .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest()
                    .withBonus(toE3(0.3))
                    .withReferrer(contributors[5])
                    .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest()
                    .withBonus(toE3(0.3))
                    .withReferrer(contributors[5])
                    .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                  await createContributeTest()
                    .withBonus(toE3(0.3))
                    .withReferrer(contributors[5])
                    .run({ tge, abaxToken, wAZERO, vester, contributor: contributors[4] });
                });
              });
            });
            describe('when trigering the 2nd phase', function () {
              beforeEach(async function () {
                await time.increase(DAY);
                await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, MAX_U128);
                await wAZERO.withSigner(contributors[0]).tx.mint(contributors[0].address, PHASE_ONE_PUBLIC_CONTRIBUTION_CAP);
                const amountToGetClose = PHASE_ONE_PUBLIC_CONTRIBUTION_CAP.sub(ONE_TOKEN).muln(10).divn(11);
                (await tge.withSigner(contributors[0]).query.contribute(amountToGetClose, contributors[0].address, null)).value.unwrapRecursively();
                await tge.withSigner(contributors[0]).tx.contribute(amountToGetClose, contributors[0].address, null);
              });
              it('should correctly calculate the cost & emit event', async () => {
                await wAZERO.withSigner(contributors[1]).tx.approve(tge.address, MAX_U128);
                const cost = (
                  await tge.withSigner(contributors[1]).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[1].address, null)
                ).value.unwrapRecursively();
                const tx = await tge.withSigner(contributors[1]).tx.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[1].address, null);
                await expect(tx).to.emitEvent(tge, 'PhaseChanged');
                await time.increase(DAY);
                const currentParams = await queryTGEGetStorage(await localApi.get(), tge);
                expect(currentParams.phaseTwoStartTime?.toString()).to.equal((now + DAY).toString());
                expect(parseInt(cost.toString()) / 1e6)
                  .to.be.greaterThan(0.0025)
                  .but.lessThan(0.0025001);

                const { apiPre, apiPost } = await getApiPreAndPostTx(tx, tge.nativeAPI);

                const nextIdVestOfPre = await queryNextIdVestOfAt(apiPre, vester, contributors[1].address, abaxToken.address);
                const nextIdVestOfPost = await queryNextIdVestOfAt(apiPost, vester, contributors[1].address, abaxToken.address);

                await expect(tx).to.changePSP22Balances(
                  abaxToken,
                  [contributors[1].address],
                  [MINIMUM_AMOUNT_TO_GENERATE.muln(40).divn(100).subn(1)],
                ); //TODO agree on rounding
                expect(nextIdVestOfPost).to.equal(nextIdVestOfPre + 2); // during switch to phase 2 creates 2 vesting schedules, 1 for each phase

                let totalVestedAmount = new BN(0);
                for (let i = nextIdVestOfPre; i < nextIdVestOfPost; i++) {
                  const postVestingScheduleOf = (
                    await vester.query.vestingScheduleOf(contributors[1].address, abaxToken.address, i, [])
                  ).value.unwrapRecursively()!;
                  totalVestedAmount = totalVestedAmount.add(postVestingScheduleOf.amount);
                  expect(postVestingScheduleOf.released).to.equal(0);
                  expect(postVestingScheduleOf.schedule.constant).to.exist;
                  expect(postVestingScheduleOf.schedule.constant![0]).to.equal(0);
                  expect(postVestingScheduleOf.schedule.constant![1]).to.equal(ONE_YEAR.muln(4));
                }
                expect(totalVestedAmount).to.equal(MINIMUM_AMOUNT_TO_GENERATE.muln(60).divn(100));
              });
              describe('phase two', function () {
                beforeEach(async function () {
                  await wAZERO.withSigner(contributors[1]).tx.approve(tge.address, MAX_U128);
                  const tx = await tge.withSigner(contributors[1]).tx.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributors[1].address, null);
                  await expect(tx).to.emitEvent(tge, 'PhaseChanged');
                });
                it('stakedrop should fail', async function () {
                  await expect(tge.withSigner(stakedropAdmin).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address)).to.be.revertedWithError(
                    {
                      tgeStarted: null,
                    },
                  );
                });

                describe('collect_reserved', function () {
                  it('should work', async function () {
                    await expect(tge.withSigner(founders).query.collectReserved()).to.haveOkResult();
                  });
                });

                describe('just after started', function () {
                  beforeEach(async function () {
                    await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, MAX_U128);
                    (
                      await tge.withSigner(contributors[0]).query.contribute(PHASE_ONE_PUBLIC_CONTRIBUTION_CAP, contributors[0].address, null)
                    ).value.unwrapRecursively();
                    await tge.withSigner(contributors[0]).tx.contribute(PHASE_ONE_PUBLIC_CONTRIBUTION_CAP, contributors[0].address, null);
                  });
                  describe('contribute', function () {
                    it('should correctly calculate the cost and work', async function () {
                      const contributor = contributors[1];
                      const desiredAmountOfAbaxToGet = toTokenDecimals(5_000_000);
                      const amountToContribute = desiredAmountOfAbaxToGet.muln(2);
                      await wAZERO.tx.mint(contributor.address, amountToContribute);
                      await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
                      const cost =
                        (
                          await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)
                        ).value.ok?.ok?.toString() ?? '0';
                      const pricePer1 = new BN(cost).mul(E6bn).div(desiredAmountOfAbaxToGet).toNumber() / 1e6;
                      expect(pricePer1).to.equal(0.028125); //0.02825
                    });
                  });
                  describe('just before ended', function () {
                    beforeEach(async function () {
                      await time.increase(90 * DAY - 1);
                    });
                    describe('contribute', function () {
                      it('should correctly calculate the cost and work', async function () {
                        const contributor = contributors[0];
                        const desiredAmountOfAbaxToGet = toTokenDecimals(5_000_000);
                        const amountToContribute = desiredAmountOfAbaxToGet.muln(2);
                        await wAZERO.tx.mint(contributor.address, amountToContribute);
                        await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
                        const cost =
                          (
                            await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)
                          ).value.ok?.ok?.toString() ?? '0';
                        const pricePer1 = new BN(cost).mul(E6bn).div(desiredAmountOfAbaxToGet).toNumber() / 1e6;
                        expect(pricePer1).to.equal(0.028125); //0.02825
                      });
                    });
                    describe('after phase two', function () {
                      beforeEach(async function () {
                        await time.increase(2);
                      });
                      it('stakesdrop should fail', async function () {
                        await expect(
                          tge.withSigner(stakedropAdmin).query.stakedrop(ONE_TOKEN, ONE_TOKEN, contributors[0].address),
                        ).to.be.revertedWithError({
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
                          await expect(tge.withSigner(founders).query.collectReserved()).to.haveOkResult();
                        });
                      });
                    });
                  });
                });
              });
            });
          });

          describe('holistic', () => {
            describe('phase one', () => {
              describe('user has no bonus', () => {
                it('Gets the correct amount of tokens & vesting', async () => {
                  const amountToContribute = toTokenDecimals(10);
                  const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
                  await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, amountToContribute);
                  const contributor = contributors[0];

                  const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)).value.ok;
                  expect(queryRes?.err).to.be.undefined;
                  expect(queryRes?.ok).not.to.be.null;
                  expect(queryRes?.ok?.toString()).to.equal(amountToContribute.toString());
                  const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
                  await expect(tx).to.eventually.be.fulfilled;
                  const txRes = await tx;

                  expect(txRes.events).to.have.lengthOf(1);
                  expect(txRes.events?.[0].name).to.equal('Contribution');
                  expect(replaceNumericPropsWithStrings(txRes.events?.[0].args)).to.deep.equal({
                    contributor: contributors[0].address,
                    receiver: contributors[0].address,
                    toCreate: desiredAmountOfAbaxToGet.toString(),
                    referrer: null,
                  });
                  const expectedAbaxAmountReceived = desiredAmountOfAbaxToGet.muln(4).divn(10);
                  const expectedAbaxAmountVested = desiredAmountOfAbaxToGet.muln(6).divn(10);
                  const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
                  expect(cotributorABAXBalance?.toString()).to.equal(expectedAbaxAmountReceived.toString());

                  const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

                  expect(vestData).not.to.be.null;
                  expect(vestData).not.to.be.undefined;
                  expect(vestData?.amount.toString()).to.equal(expectedAbaxAmountVested.toString());
                  expect(vestData?.released.toString()).to.equal(new BN(0).toString());
                  expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
                  expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(ONE_YEAR.muln(4).toString());
                });

                it('Uses referral address and receives bonus, as well as the referee address', async () => {
                  const amountToContribute = toTokenDecimals(10);
                  const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
                  const contributor = contributors[0];
                  await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
                  const referrer = contributors[1];
                  await tge.withSigner(admin).tx.registerReferrer(referrer.address);

                  const queryRes = (
                    await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, referrer.address)
                  ).value.ok;
                  expect(queryRes?.err).to.be.undefined;
                  expect(queryRes?.ok).not.to.be.null;
                  expect(queryRes?.ok?.toString()).to.equal(amountToContribute.toString());
                  const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, referrer.address);
                  await expect(tx).to.eventually.be.fulfilled;
                  const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet.mul(E6bn.add(REFERRAL_BONUS_E3.CONTRIBUTOR)).div(E3bn);
                  const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
                  const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

                  const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
                  expect(cotributorABAXBalance?.toString()).to.equal(expectedTokensReceivedInstant);
                  const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

                  expect(vestData).not.to.be.null;
                  expect(vestData).not.to.be.undefined;
                  expect(vestData?.amount.toString()).to.equal(expectedTokensReceivedVested);
                  expect(vestData?.released.toString()).to.equal(new BN(0).toString());
                  expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());

                  await expect(tx).to.changePSP22Balances(abaxToken, [referrer.address], [new BN(0)]);
                  await expect(tge.withSigner(referrer).query.collectReserved()).to.haveOkResult(
                    desiredAmountOfAbaxToGet.mul(REFERRAL_BONUS_E3.REFERRER).div(E3bn),
                  );
                });
              });

              describe('user has bonus', () => {
                it('Gets the correct amount of tokens & vesting', async () => {
                  const desiredAmountOfAbaxToGet = MINIMUM_AMOUNT_TO_GENERATE;
                  const amountToContribute = MINIMUM_AMOUNT_TO_GENERATE.divn(40);
                  const contributor = contributors[1];
                  await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
                  const queryPreMultiplier = await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
                  expect(queryPreMultiplier.value.ok?.err).to.be.undefined;
                  expect(queryPreMultiplier.value.ok?.ok?.toString()).to.equal(amountToContribute.toString());

                  const bonusMultiplierE3 = new BN(toE3(0.08));
                  await tge.withSigner(admin).tx.setBonusMultiplierE3(contributor.address, bonusMultiplierE3);

                  const queryPostMultiplierSet = await tge
                    .withSigner(contributor)
                    .query.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
                  expect(queryPostMultiplierSet.value.ok?.ok?.toString()).to.equal(amountToContribute.toString());
                  const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet.mul(E6bn.add(bonusMultiplierE3)).div(E3bn);
                  const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
                  const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

                  const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
                  await expect(tx).to.eventually.be.fulfilled;

                  const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
                  expect(cotributorABAXBalance?.toString()).to.equal(expectedTokensReceivedInstant);
                  const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

                  expect(vestData).not.to.be.null;
                  expect(vestData).not.to.be.undefined;
                  expect(vestData?.amount.toString()).to.equal(expectedTokensReceivedVested);
                  expect(vestData?.released.toString()).to.equal(new BN(0).toString());
                  expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
                  expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(ONE_YEAR.muln(4).toString());
                });

                it('Uses referral address and receives bonus, as well as the referee address', async () => {
                  const amountToContribute = toTokenDecimals(10);
                  const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
                  const contributor = contributors[0];
                  await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
                  const referrer = contributors[1];

                  const bonusMultiplierE3 = new BN(toE3(0.08));
                  await tge.withSigner(admin).tx.setBonusMultiplierE3(contributor.address, bonusMultiplierE3);

                  await tge.withSigner(admin).tx.registerReferrer(referrer.address);

                  const queryRes = (
                    await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, referrer.address)
                  ).value.ok;
                  expect(queryRes?.err).to.be.undefined;
                  expect(queryRes?.ok).not.to.be.null;
                  expect(queryRes?.ok?.toString()).to.equal(amountToContribute.toString());
                  const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, referrer.address);
                  await expect(tx).to.eventually.be.fulfilled;
                  const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet
                    .mul(E6bn.add(REFERRAL_BONUS_E3.CONTRIBUTOR).add(bonusMultiplierE3))
                    .div(E3bn);
                  const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
                  const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

                  const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
                  expect(cotributorABAXBalance?.toString()).to.equal(expectedTokensReceivedInstant);
                  const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

                  expect(vestData).not.to.be.null;
                  expect(vestData).not.to.be.undefined;
                  expect(vestData?.amount.toString()).to.equal(expectedTokensReceivedVested);
                  expect(vestData?.released.toString()).to.equal(new BN(0).toString());
                  expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());

                  await expect(tx).to.changePSP22Balances(abaxToken, [referrer.address], [new BN(0)]);
                  await expect(tge.withSigner(referrer).query.collectReserved()).to.haveOkResult(
                    desiredAmountOfAbaxToGet.mul(REFERRAL_BONUS_E3.REFERRER).div(E3bn),
                  );
                });
              });
            });

            describe('phase 2', () => {
              beforeEach(async () => {
                await time.setTo(TGE_START_TIME + 100);

                await wAZERO.withSigner(admin).tx.approve(tge.address, MAX_U128);
                await wAZERO.withSigner(admin).tx.mint(admin.address, PHASE_ONE_PUBLIC_CONTRIBUTION_CAP);
                const amountToGetClose = PHASE_ONE_PUBLIC_CONTRIBUTION_CAP.sub(ONE_TOKEN).muln(10).divn(11);
                (await tge.withSigner(admin).query.contribute(amountToGetClose, admin.address, null)).value.unwrapRecursively();
                await tge.withSigner(admin).tx.contribute(amountToGetClose, admin.address, null);
                await tge.withSigner(admin).tx.contribute(MINIMUM_AMOUNT_TO_GENERATE, admin.address, null);
                await time.increase(100);
                const currentParams = await queryTGEGetStorage(await localApi.get(), tge);
                expect(currentParams.phaseTwoStartTime?.toString()).to.equal((TGE_START_TIME + 100).toString());
              });
              describe('user has no bonus', () => {
                describe('Generates 40 ABAX tokens', async () => {
                  const desiredAmountOfAbaxToGet = toTokenDecimals(40);
                  const expectedAbaxAmountReceivedInstantly = desiredAmountOfAbaxToGet.muln(4).divn(10);
                  const expectedAbaxAmountVested = desiredAmountOfAbaxToGet.muln(6).divn(10);
                  let txRes: SignAndSendSuccessResponse;
                  let contributor;
                  beforeEach(async () => {
                    contributor = contributors[0];
                    await wAZERO.tx.mint(contributors[0].address, PHASE_ONE_TOKEN_CAP);
                    await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, PHASE_ONE_TOKEN_CAP);

                    const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)).value
                      .ok;
                    expect(queryRes?.err).to.be.undefined;
                    expect(queryRes?.ok).not.to.be.null;
                    expect(queryRes?.ok?.toString()).to.almostEqualOrEqualNumber('1000040000000');
                    const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
                    await expect(tx).to.eventually.be.fulfilled;
                    txRes = await tx;
                  });
                  it('Gets the correct amount of tokens & vesting', async () => {
                    expect(txRes.events).to.have.lengthOf(1);
                    expect(txRes.events?.[0].name).to.equal('Contribution');
                    expect(replaceNumericPropsWithStrings(txRes.events?.[0].args)).to.deep.equal({
                      contributor: contributors[0].address,
                      receiver: contributors[0].address,
                      toCreate: desiredAmountOfAbaxToGet.toString(),
                      referrer: null,
                    });
                    const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
                    expect(cotributorABAXBalance?.toString()).to.equal(expectedAbaxAmountReceivedInstantly.toString());
                  });

                  it('Has correct vesting schedule & is able to collect vested tokens after the time passes', async () => {
                    const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;
                    const expectedVestingDuration = ONE_YEAR.muln(4).toNumber();
                    expect(vestData).not.to.be.null;
                    expect(vestData).not.to.be.undefined;
                    expect(vestData?.amount.toString()).to.equal(expectedAbaxAmountVested.toString());
                    expect(vestData?.released.toString()).to.equal(new BN(0).toString());
                    expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
                    expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(expectedVestingDuration.toString());
                    await time.increase(expectedVestingDuration);
                    const queryRes = await vester.withSigner(contributor).query.release(contributor.address, abaxToken.address, []);
                    expect(queryRes.value.ok?.err).to.be.undefined;
                    expect(queryRes.value.ok?.ok?.toString()).to.equal(expectedAbaxAmountVested.toString());
                    const tx = vester.withSigner(contributor).tx.release(contributor.address, abaxToken.address, []);
                    await expect(tx).to.eventually.be.fulfilled;
                    const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
                    expect(cotributorABAXBalance?.toString()).to.equal(expectedAbaxAmountVested.add(expectedAbaxAmountReceivedInstantly).toString());
                  });
                });
              });

              describe('user has bonus', () => {
                describe('Generates 40 ABAX tokens with bonus', async () => {
                  const desiredAmountOfAbaxToGet = toTokenDecimals(40);
                  const bonusMultiplierE3 = new BN(toE3(0.08)); // 8% bonus multiplier
                  const expectedAbaxAmountReceivedInstantlyWithBonus = desiredAmountOfAbaxToGet
                    .mul(bonusMultiplierE3.add(E3bn))
                    .div(E3bn)
                    .muln(4)
                    .divn(10);
                  const expectedAbaxAmountVestedWithBonus = desiredAmountOfAbaxToGet.mul(bonusMultiplierE3.add(E3bn)).div(E3bn).muln(6).divn(10);
                  let txRes: SignAndSendSuccessResponse;
                  let contributor: KeyringPair;
                  beforeEach(async () => {
                    contributor = contributors[1];
                    await wAZERO.withSigner(contributor).tx.approve(tge.address, MAX_U128);
                    await tge.withSigner(admin).tx.setBonusMultiplierE3(contributor.address, bonusMultiplierE3);

                    const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)).value
                      .ok;
                    expect(queryRes?.err).to.be.undefined;
                    expect(queryRes?.ok).not.to.be.null;
                    expect(queryRes?.ok?.toString()).to.almostEqualOrEqualNumber('1000040000000');
                    const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
                    await expect(tx).to.eventually.be.fulfilled;
                    txRes = await tx;
                  });
                  it('Gets the correct amount of tokens & vesting with bonus', async () => {
                    expect(txRes.events).to.have.lengthOf(1);
                    expect(txRes.events?.[0].name).to.equal('Contribution');
                    expect(replaceNumericPropsWithStrings(txRes.events?.[0].args)).to.deep.equal({
                      contributor: contributor.address,
                      receiver: contributor.address,
                      toCreate: toTokenDecimals(40).toString(),
                      referrer: null,
                    });
                    const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
                    expect(cotributorABAXBalance?.toString()).to.equal(expectedAbaxAmountReceivedInstantlyWithBonus.toString());
                  });

                  it('Has correct vesting schedule & is able to collect vested tokens with bonus after the time passes', async () => {
                    const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;
                    expect(vestData).not.to.be.null;
                    expect(vestData).not.to.be.undefined;
                    expect(vestData?.amount.toString()).to.equal(expectedAbaxAmountVestedWithBonus.toString());
                    expect(vestData?.released.toString()).to.equal(new BN(0).toString());

                    const expectedVestingDuration = ONE_YEAR.muln(4).toNumber();
                    expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(expectedVestingDuration.toString());

                    await time.increase(expectedVestingDuration);
                    const queryRes = await vester.withSigner(contributor).query.release(contributor.address, abaxToken.address, []);
                    expect(queryRes.value.ok?.err).to.be.undefined;
                    expect(queryRes.value.ok?.ok?.toString()).to.equal(expectedAbaxAmountVestedWithBonus.toString());

                    const tx = vester.withSigner(contributor).tx.release(contributor.address, abaxToken.address, []);
                    await expect(tx).to.eventually.be.fulfilled;
                    const cotributorABAXBalanceAfter = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
                    expect(cotributorABAXBalanceAfter?.toString()).to.equal(
                      expectedAbaxAmountVestedWithBonus.add(expectedAbaxAmountReceivedInstantlyWithBonus).toString(),
                    );
                  });
                });
              });

              describe('price discovery', () => {
                it('5 million tokens get minted on top of the 20 million intended for Public Contributors. 25 million ABAX tokens being created. Price increases to 0.0315', async () => {
                  const contributor = contributors[0];
                  const desiredAmountOfAbaxToGet = toTokenDecimals(5_000_000);
                  const amountToContribute = desiredAmountOfAbaxToGet.muln(2);
                  await wAZERO.tx.mint(contributor.address, amountToContribute);
                  await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
                  const cost =
                    (
                      await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)
                    ).value.ok?.ok?.toString() ?? '0';
                  const pricePer1 = new BN(cost).mul(E6bn).div(desiredAmountOfAbaxToGet).toNumber() / 1e6;
                  expect(pricePer1).to.equal(0.028125); //0.02825

                  await tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
                  const totalAmountDistributed = (await queryTGEGetStorage(await localApi.get(), tge)).totalAmountMinted.toString();
                  expect(totalAmountDistributed).to.equal(toTokenDecimals(125_000_000).toString());
                  const nextCostPerMinimum =
                    (
                      await tge.withSigner(contributor).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributor.address, null)
                    ).value.ok?.ok?.toString() ?? '0';
                  const nextPricePer1 = new BN(nextCostPerMinimum).mul(E6bn).div(MINIMUM_AMOUNT_TO_GENERATE).toNumber() / 1e6;
                  expect(nextPricePer1).to.equal(0.03125); // 0.0315
                });
                it('100 contributions - each generates 50 thousands tokens to self. Price increases on subsequent contributions', async () => {
                  const contributor = contributors[3];
                  const initAzeroBalance = toTokenDecimals(1_000_000);
                  await wAZERO.tx.mint(contributor.address, initAzeroBalance);
                  await wAZERO.withSigner(contributor).tx.approve(tge.address, initAzeroBalance);

                  let previousPricePer1 = 0;
                  const previousPricePer1Log: number[] = [];
                  for (let i = 0; i < 100; i++) {
                    const queryRes = (await tge.withSigner(contributor).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributor.address, null)).value
                      .ok;
                    const currentCostPerMinimum = queryRes?.ok?.toString() ?? '0';
                    const currentPricePer1 = new BN(currentCostPerMinimum).mul(E6bn).div(MINIMUM_AMOUNT_TO_GENERATE).toNumber() / 1e6;
                    expect(currentPricePer1).to.be.greaterThan(previousPricePer1);
                    previousPricePer1 = currentPricePer1;
                    previousPricePer1Log.push(currentPricePer1);
                    const desiredAmountOfAbaxToGet = toTokenDecimals(50_000);

                    const qv = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet, contributor.address, null)).value;
                    expect(qv?.ok?.err, `failed on contribution number ${i}`).to.be.undefined;
                    await tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet, contributor.address, null);
                  }
                  console.log('price over time');
                  console.table(previousPricePer1Log);
                  console.log('totalAmountMinted', new BN((await getTgeParams(tge)).totalAmountMinted.toString()).div(ONE_TOKEN).toString());
                  const queryRes = (await tge.withSigner(contributor).query.contribute(MINIMUM_AMOUNT_TO_GENERATE, contributor.address, null)).value
                    .ok;
                  const currentCostPerMinimum = queryRes?.ok?.toString() ?? '0';
                  const currentPricePer1 = new BN(currentCostPerMinimum).mul(E6bn).div(MINIMUM_AMOUNT_TO_GENERATE).toNumber() / 1e6;
                  console.log('final price', currentPricePer1);
                });
              });
            });
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
      describe('when the receiver has no bonus_multiplier', function () {
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
          await expect(tx).to.changeTgeStorage(tge, 'totalAmountMinted', AMOUNT);
        });
        it('should update the receiver reserved tokens amount', async function () {
          await expect(tx).to.changeReservedTokenAmounts(tge, [receiver], [AMOUNT]);
        });
        it('should update the receiver contributed amount', async function () {
          await expect(tx).to.changeContributedAmounts(tge, [receiver], [FEE_PAID]);
        });
        it('should update the receiver received base amount', async function () {
          await expect(tx).to.changeBaseCreatedAmounts(tge, [receiver], [AMOUNT]);
        });
        it('should update the receiver received bonus amount', async function () {
          await expect(tx).to.changeBonusCreatedAmounts(tge, [receiver], [new BN(0)]);
        });

        it('should emit Stakedrop event', async function () {
          await expect(tx).to.emitEvent(tge, 'Stakedrop', {
            receiver: receiver,
            amount: AMOUNT,
            feePaid: FEE_PAID,
          });
        });
      });
      for (const bonusMultiplierE3 of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
        describe(`when the receiver has ${(bonusMultiplierE3 * 100) / 1000}% bonus_multiplier`, function () {
          let receiver: string;
          const FEE_PAID = ONE_TOKEN.muln(10);
          const AMOUNT = FEE_PAID.muln(40);
          let tx: SignAndSendSuccessResponse;
          beforeEach(async function () {
            receiver = contributors[0].address;
            await tge.withSigner(admin).tx.setBonusMultiplierE3(receiver, bonusMultiplierE3);
            tx = await tge.withSigner(stakedropAdmin).tx.stakedrop(AMOUNT, FEE_PAID, receiver);
          });
          it('should mint tokens to apropariate amount to self', async function () {
            await expect(tx).to.changePSP22Balances(abaxToken, [tge.address], [AMOUNT.mul(E3bn.add(new BN(bonusMultiplierE3))).divn(1000)]);
          });
          it('should update the total amount of tokens generated', async function () {
            await expect(tx).to.changeTgeStorage(tge, 'totalAmountMinted', AMOUNT.mul(E3bn.add(new BN(bonusMultiplierE3))).divn(1000));
          });
          it('should update the receiver reserved tokens amount', async function () {
            await expect(tx).to.changeReservedTokenAmounts(tge, [receiver], [AMOUNT.mul(E3bn.add(new BN(bonusMultiplierE3))).divn(1000)]);
          });
          it('should update the receiver contributed amount', async function () {
            await expect(tx).to.changeContributedAmounts(tge, [receiver], [FEE_PAID]);
          });
          it('should update the receiver received base amount', async function () {
            await expect(tx).to.changeBaseCreatedAmounts(tge, [receiver], [AMOUNT]);
          });
          it('should update the receiver received bonus amount', async function () {
            await expect(tx).to.changeBonusCreatedAmounts(tge, [receiver], [AMOUNT.muln(bonusMultiplierE3).divn(1000)]);
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
