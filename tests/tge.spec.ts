import { replaceNumericPropsWithStrings } from '@abaxfinance/contract-helpers';
import { E6bn, toE12, toE6 } from '@abaxfinance/utils';
import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
import { ABAX_DECIMALS, AZERO_DECIMALS, ONE_DAY, ONE_YEAR } from 'tests/consts';
import { getTgeParams, increaseBlockTimestamp, setBlockTimestamp, transferNoop } from 'tests/misc';
import { expect } from 'tests/setup/chai';
import { deployAbaxTge, deployEmitableToken, deployVester, deployWAZERO } from 'tests/setup/deploymentHelpers';
import { getApiProviderWrapper, getSigners } from 'tests/setup/helpers';
import AbaxTge from 'typechain/contracts/abax_tge';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';
import { AccessControlError } from 'typechain/types-arguments/abax_tge';
import { TGEErrorBuilder } from 'typechain/types-returns/abax_tge';

const toTokenDecimals = (amount: string | number | BN) => (BN.isBN(amount) ? amount : new BN(amount)).mul(new BN(10).pow(new BN(AZERO_DECIMALS)));

const [admin, foundersAddress, foundationAddress, strategicReservesAddress, ...contributors] = getSigners();

async function prepareEnvBase(api: ApiPromise) {
  await transferNoop(api);
  // to force using fake_time
  await increaseBlockTimestamp(api, 0);

  const tge = await deployAbaxTge(api, admin);
  const abaxToken = await deployEmitableToken(api, admin, 'ABAX', ABAX_DECIMALS);
  const wAZERO = await deployEmitableToken(api, admin, 'WAZERO', AZERO_DECIMALS);
  const vester = await deployVester(api, admin);

  return {
    tge,
    abaxToken,
    vester,
    wAZERO,
  };
}

describe('TGE', () => {
  let tge: AbaxTge;
  let abaxToken: PSP22Emitable;
  let wAZERO: PSP22Emitable;
  let vester: Vester;
  const phaseOneTokenCap = toTokenDecimals(E6bn.muln(100));
  const publicContributionInitAmount = phaseOneTokenCap.muln(20).divn(100);
  const costToMintMillionTokens = toTokenDecimals(E6bn).div(new BN(40));
  const phaseTwoDuration = ONE_DAY.muln(90);
  let tgeStartTime: string;
  const apiProviderWrapper = getApiProviderWrapper(9944);

  beforeEach(async () => {
    const api = await apiProviderWrapper.getAndWaitForReady();
    const contracts = await prepareEnvBase(api);
    tge = contracts.tge;
    abaxToken = contracts.abaxToken;
    vester = contracts.vester;
    wAZERO = contracts.wAZERO;
  });

  beforeEach(async () => {
    const api = await apiProviderWrapper.getAndWaitForReady();
    const now = await api.query.timestamp.now();
    tgeStartTime = now.toString();
    await tge
      .withSigner(admin)
      .tx.setTgeParams(
        tgeStartTime,
        phaseOneTokenCap,
        costToMintMillionTokens,
        phaseTwoDuration,
        abaxToken.address,
        vester.address,
        foundersAddress.address,
        foundationAddress.address,
        strategicReservesAddress.address,
        wAZERO.address,
        0,
      );
  });

  describe('phase 1', () => {
    describe('initialization/access control', () => {
      it('Contribute fails if desired amount of ABAX to get is less than one', async () => {
        await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
        await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
        await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
        const minimum = toTokenDecimals(1);
        expect((await tge.withSigner(contributors[0]).query.contribute(minimum.subn(1))).value.ok?.err).to.deep.equal(
          TGEErrorBuilder.AmountLessThanMinimum(),
        );
        const queryRes = (await tge.withSigner(contributors[0]).query.contribute(minimum)).value.ok;
        expect(queryRes?.err).to.be.undefined;
      });

      it('Contribute fails if TGE is not started', async () => {
        await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
        await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
        await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
        await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) - 1);
        const queryRes = (await tge.withSigner(contributors[0]).query.contribute(1)).value.ok;
        expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.TGENotStarted());
      });

      it('Fails if contribution amount exceeds phase one cap', async () => {
        await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
        await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
        await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
        const desiredAmountOfAbaxToGet = publicContributionInitAmount.addn(1);
        const queryRes = (await tge.withSigner(contributors[0]).query.contribute(desiredAmountOfAbaxToGet)).value.ok;
        expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.Phase1TokenCapReached());
      });

      it('Upon reaching phase one cap switches to phase 2', async () => {
        await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100);
        await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
        await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
        await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
        const desiredAmountOfAbaxToGet = publicContributionInitAmount;
        const tx = tge.withSigner(contributors[0]).tx.contribute(desiredAmountOfAbaxToGet);
        await expect(tx).to.eventually.be.fulfilled;
        await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100);
        const currentParams = await getTgeParams(tge);
        expect(currentParams.phaseTwoStartTime.toString()).to.equal((parseInt(tgeStartTime) + 100).toString());
      });

      it('On first contribution handles founders, foundation and strategic reserves (and only on first one)', async () => {
        await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
        await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
        await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, phaseOneTokenCap);
        const contributor = contributors[0];
        const desiredAmountOfAbaxToGet = toTokenDecimals(40);
        const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet);
        await expect(tx).to.eventually.be.fulfilled;
        const contributorBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
        expect(contributorBalance?.toString()).to.equal(desiredAmountOfAbaxToGet.muln(4).divn(10).toString());

        const foundersBalance = (await abaxToken.query.balanceOf(foundersAddress.address)).value.ok;
        expect(foundersBalance?.toString()).to.equal(phaseOneTokenCap.muln(4).divn(100).toString());

        const foundationBalance = (await abaxToken.query.balanceOf(foundationAddress.address)).value.ok;
        expect(foundationBalance?.toString()).to.equal(phaseOneTokenCap.muln(2).divn(100).toString());

        const strategicReservesBalance = (await abaxToken.query.balanceOf(strategicReservesAddress.address)).value.ok;
        expect(strategicReservesBalance?.toString()).to.equal(phaseOneTokenCap.muln(58).divn(100).toString());

        await tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet);

        const contributorBalance2 = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
        expect(contributorBalance2?.toString()).to.equal(desiredAmountOfAbaxToGet.muln(4).divn(10).muln(2).toString());

        const foundersBalancePost2 = (await abaxToken.query.balanceOf(foundersAddress.address)).value.ok;
        expect(foundersBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(4).divn(100).toString());

        const foundationBalancePost2 = (await abaxToken.query.balanceOf(foundationAddress.address)).value.ok;
        expect(foundationBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(2).divn(100).toString());

        const strategicReservesBalancePost2 = (await abaxToken.query.balanceOf(strategicReservesAddress.address)).value.ok;
        expect(strategicReservesBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(58).divn(100).toString());
      });

      it('Only admin can set bonus multiplier', async () => {
        const contributor = contributors[1];
        const bonusMultiplierE6 = new BN(toE6(1.08));
        const queryRes = await tge.withSigner(contributor).query.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
        expect(queryRes.value.ok?.err).to.deep.equal(TGEErrorBuilder.AccessControlError(AccessControlError.missingRole));
        const tx = tge.withSigner(contributor).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
        await expect(tx).to.eventually.be.rejected;

        const queryRes2 = await tge.withSigner(admin).query.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
        expect(queryRes2.value.ok?.err).to.be.undefined;
        const tx2 = tge.withSigner(admin).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
        await expect(tx2).to.eventually.be.fulfilled;
        const bonusMultiplier = (await tge.query.getBonusMultiplierE6(contributor.address)).value.ok;
        expect(bonusMultiplier?.toString()).to.equal(bonusMultiplierE6.toString());
      });
    });

    describe('user has no bonus', () => {
      it('Gets the correct amount of tokens & vesting', async () => {
        await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
        const amountToContribute = toTokenDecimals(10);
        const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
        await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
        await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, amountToContribute);
        const contributor = contributors[0];

        const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet)).value.ok;
        expect(queryRes?.err).to.be.undefined;
        expect(queryRes?.ok).not.to.be.null;
        expect(queryRes?.ok?.toString()).to.equal(amountToContribute.toString());
        const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet);
        await expect(tx).to.eventually.be.fulfilled;
        const txRes = await tx;

        expect(txRes.events).to.have.lengthOf(1);
        expect(txRes.events?.[0].name).to.equal('Contribution');
        expect(replaceNumericPropsWithStrings(txRes.events?.[0].args)).to.deep.equal({
          contributor: contributors[0].address,
          toCreate: desiredAmountOfAbaxToGet.toString(),
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
    });

    describe('user has bonus', () => {
      it('Gets the correct amount of tokens & vesting', async () => {
        await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
        const amountToContribute = toTokenDecimals(1);
        const desiredAmountOfAbaxToGet = amountToContribute.muln(40);
        const contributor = contributors[1];
        await wAZERO.tx.mint(contributor.address, phaseOneTokenCap);
        await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
        const queryPreMultiplier = await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet);
        expect(queryPreMultiplier.value.ok?.err).to.be.undefined;
        expect(queryPreMultiplier.value.ok?.ok?.toString()).to.equal(amountToContribute.toString());

        const bonusMultiplierE6 = new BN(toE6(0.08));
        await tge.withSigner(admin).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);

        const queryPostMultiplierSet = await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet);
        expect(queryPostMultiplierSet.value.ok?.ok?.toString()).to.equal(amountToContribute.toString());
        const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet.mul(E6bn.add(bonusMultiplierE6)).div(E6bn);
        const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
        const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

        const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet);
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
    });
  });

  describe('phase 2', () => {
    beforeEach(async () => {
      await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100);
      await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
      await wAZERO.tx.mint(admin.address, phaseOneTokenCap);
      await wAZERO.withSigner(admin).tx.approve(tge.address, phaseOneTokenCap);
      const tx = tge.withSigner(admin).tx.contribute(publicContributionInitAmount);
      await expect(tx).to.eventually.be.fulfilled;
      await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100);
      const currentParams = await getTgeParams(tge);
      expect(currentParams.phaseTwoStartTime.toString()).to.equal((parseInt(tgeStartTime) + 100).toString());
    });

    describe('user has no bonus', () => {
      it('Gets the correct amount of tokens & vesting', async () => {
        const contributor = contributors[0];
        const desiredAmountOfAbaxToGet = toTokenDecimals(40);
        await wAZERO.tx.mint(contributors[0].address, phaseOneTokenCap);
        await wAZERO.withSigner(contributors[0]).tx.approve(tge.address, '1000000200000');

        const queryRes = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet)).value.ok;
        expect(queryRes?.err).to.be.undefined;
        expect(queryRes?.ok).not.to.be.null;
        expect(queryRes?.ok?.toString()).to.almostEqualOrEqualNumber('1000000200000');
        const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet);
        await expect(tx).to.eventually.be.fulfilled;
        const txRes = await tx;

        expect(txRes.events).to.have.lengthOf(1);
        expect(txRes.events?.[0].name).to.equal('Contribution');
        expect(replaceNumericPropsWithStrings(txRes.events?.[0].args)).to.deep.equal({
          contributor: contributors[0].address,
          toCreate: desiredAmountOfAbaxToGet.toString(),
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
    });

    it('Contribute fails if TGE is finished', async () => {
      await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100 + 100);
      const contributor = contributors[0];
      await wAZERO.tx.mint(contributor.address, phaseOneTokenCap);
      await wAZERO.withSigner(contributor).tx.approve(tge.address, phaseOneTokenCap);
      const queryResPhaseTwo = (await tge.withSigner(contributor).query.contribute(toTokenDecimals(1))).value.ok;
      expect(queryResPhaseTwo?.err).to.be.undefined;

      await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100 + phaseTwoDuration.toNumber() + 1);
      const queryRes = (await tge.withSigner(contributor).query.contribute(toTokenDecimals(1))).value.ok;
      expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.TGEEnded());
    });

    describe('user has bonus', () => {
      const contributor = contributors[1];
      const bonusMultiplierE6 = new BN(toE6(0.08));
      beforeEach(async () => {
        await tge.withSigner(admin).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);
      });
      it('Gets the correct amount of tokens & vesting', async () => {
        await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
        const desiredAmountOfAbaxToGet = toTokenDecimals(40);
        await wAZERO.tx.mint(contributor.address, phaseOneTokenCap);
        await wAZERO.withSigner(contributor).tx.approve(tge.address, '1000000200000');
        const queryPreMultiplier = await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet);
        expect(queryPreMultiplier.value.ok?.err).to.be.undefined;
        expect(queryPreMultiplier.value.ok?.ok?.toString()).to.equal('1000000200000');
        await tge.withSigner(admin).tx.setBonusMultiplierE6(contributor.address, bonusMultiplierE6);

        const queryPostMultiplierSet = await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet);
        expect(queryPostMultiplierSet.value.ok?.ok?.toString()).to.equal('1000000200000');
        const expectedTokensReceivedTotal = desiredAmountOfAbaxToGet.mul(E6bn.add(bonusMultiplierE6)).div(E6bn);
        const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
        const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();

        const tx = tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet);
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
    });

    describe('price discovery', () => {
      it.only('5 million tokens get minted on top of the 20 million intended for Public Contributors. 25 million ABAX tokens being created. Price increases to 0.0315', async () => {
        const contributor = contributors[0];
        const desiredAmountOfAbaxToGet = toTokenDecimals(5_000_000);
        const amountToContribute = desiredAmountOfAbaxToGet.muln(2);
        await wAZERO.tx.mint(contributor.address, amountToContribute);
        await wAZERO.withSigner(contributor).tx.approve(tge.address, amountToContribute);
        const price = (await tge.withSigner(contributor).query.contribute(desiredAmountOfAbaxToGet)).value.ok?.ok?.toString();
        let params = replaceNumericPropsWithStrings(await getTgeParams(tge));

        console.log('params', params);
        console.log('amount contributing', amountToContribute);
        console.log('price', price);

        await tge.withSigner(contributor).tx.contribute(desiredAmountOfAbaxToGet);
        params = replaceNumericPropsWithStrings(await getTgeParams(tge));
        console.log(params);
        const totalAmountDistributed = params.totalAmountDistributed.toString();
        console.log('totalAmountDistributed', totalAmountDistributed);
        const phaseTwoPublicContributionDistributed = params.phaseTwoPublicContributionDistributed.toString();
        console.log('phaseTwoPublicContributionDistributed', phaseTwoPublicContributionDistributed);
      });
      // it.skip('5 million tokens get minted on top of the 20 million intended for Public Contributors. 25 million ABAX tokens being created. Price increases to 0.0315', async () => {
      //   const contributor = contributors[0];

      //   console.log('currentParams', replaceNumericPropsWithStrings(await getTgeParams(tge)));
      //   //contributes the amount that would oversubscribe the 20 million tokens for public contributors by 5 million
      //   // const amountToContribute = new BN(5_003_160).mul(E6bn).div(phaseOneAmountPerMilllionTokens).subn(1);
      //   // const contributeQueryRes = await tge.withSigner(contributor).query.contribute({ value: amountToContribute });
      //   // console.log('amount received', (await tge.withSigner(contributor).query.contribute({ value: 1 })).value.ok?.ok?.toString());
      //   // await tge.withSigner(contributor).tx.contribute({ value: 1 });
      //   let params = replaceNumericPropsWithStrings(await getTgeParams(tge));
      //   // console.log('totalAmountDistributed', params.totalAmountDistributed.toString());
      //   // console.log('phaseTwoPublicContributionDistributed', params.phaseTwoPublicContributionDistributed.toString());

      //   // console.log('amount received', (await tge.withSigner(contributor).query.contribute({ value: 1 })).value.ok?.ok?.toString());
      //   // await tge.withSigner(contributor).tx.contribute({ value: 1 });
      //   // params = replaceNumericPropsWithStrings(await getTgeParams(tge));
      //   // console.log('totalAmountDistributed', params.totalAmountDistributed.toString());
      //   // console.log('phaseTwoPublicContributionDistributed', params.phaseTwoPublicContributionDistributed.toString());

      //   console.log('amount received', (await tge.withSigner(contributor).query.contribute({ value: 1 })).value.ok?.ok?.toString());
      //   await tge.withSigner(contributor).tx.contribute({ value: 1 });
      //   params = replaceNumericPropsWithStrings(await getTgeParams(tge));
      //   console.log('totalAmountDistributed', params.totalAmountDistributed.toString());
      //   console.log('phaseTwoPublicContributionDistributed', params.phaseTwoPublicContributionDistributed.toString());

      //   const data: {
      //     amountContributing: number;
      //     amountReceived: string | undefined;
      //     price: number;
      //     totalAmountDistributed: any;
      //     phaseTwoPublicContributionDistributed: any;
      //   }[] = [];

      //   for (let i = 0; i < 300; i++) {
      //     const amountContributing = 500_000_000;
      //     const amountToCreate = 500;
      //     const amountReceived = (
      //       await tge.withSigner(contributor).query.contribute(amountToCreate, { value: amountContributing })
      //     ).value.ok?.ok?.toString();
      //     const price = amountContributing / parseInt(amountReceived ?? '0');

      //     console.log('amount contributing', amountContributing);
      //     console.log('amount received', amountReceived);
      //     console.log('price', price);

      //     await tge.withSigner(contributor).tx.contribute({ value: amountContributing });
      //     params = replaceNumericPropsWithStrings(await getTgeParams(tge));
      //     const totalAmountDistributed = params.totalAmountDistributed.toString();
      //     console.log('totalAmountDistributed', totalAmountDistributed);
      //     const phaseTwoPublicContributionDistributed = params.phaseTwoPublicContributionDistributed.toString();
      //     console.log('phaseTwoPublicContributionDistributed', phaseTwoPublicContributionDistributed);

      //     data.push({ amountContributing, amountReceived, price, totalAmountDistributed, phaseTwoPublicContributionDistributed });
      //   }
      //   console.log('Amount Contributing, Amount Received, Price, Total Amount Distributed, Phase Two Public Contribution Distributed');
      //   for (const dataPoint of data) {
      //     const { amountContributing, amountReceived, price, totalAmountDistributed, phaseTwoPublicContributionDistributed } = dataPoint;

      //     console.log(
      //       `${amountContributing}, ${amountReceived || ''}, ${price}, ${totalAmountDistributed || ''}, ${
      //         phaseTwoPublicContributionDistributed || ''
      //       }`,
      //     );
      //   }

      //   // const expectedTotalTokensDistributed = phaseOneTokenCap.add(amountToContribute);

      //   // const currentParams = await getTgeParams(tge);
      //   // // console.log('currentParams', replaceNumericPropsWithStrings(currentParams));
      //   // const expectedTokensReceivedTotal = new BN(40);
      //   // const queryPreMultiplier = await tge.withSigner(contributor).query.contribute({ value: amountToContribute });
      //   // expect(queryPreMultiplier.value.ok?.ok?.toString()).to.equal(new BN(40).toString());

      //   // const tx = tge.withSigner(contributor).tx.contribute({ value: 1 });
      //   // await expect(tx).to.eventually.be.fulfilled;

      //   // const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
      //   // const expectedTokensReceivedInstant = expectedTokensReceivedTotal.muln(4).divn(10).toString();
      //   // expect(cotributorABAXBalance?.toString()).to.equal(expectedTokensReceivedInstant);
      //   // const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

      //   // const expectedTokensReceivedVested = expectedTokensReceivedTotal.muln(6).divn(10).toString();
      //   // expect(vestData).not.to.be.null;
      //   // expect(vestData).not.to.be.undefined;
      //   // expect(vestData?.amount.toString()).to.equal(expectedTokensReceivedVested);
      //   // expect(vestData?.released.toString()).to.equal(new BN(0).toString());
      //   // expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
      //   // expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(ONE_YEAR.muln(4).toString());
      // });
    });
  });

  //TODO bonus multiplier tests
  //TODO vesting schedule tests
  //TODO phase 2 tests
});
