import { replaceNumericPropsWithStrings } from '@abaxfinance/contract-helpers';
import { E6bn } from '@abaxfinance/utils';
import { ApiPromise } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { BN } from 'bn.js';
import { ABAX_DECIMALS, ONE_DAY, ONE_YEAR } from 'tests/consts';
import { getTgeParams, increaseBlockTimestamp, setBlockTimestamp, transferNoop } from 'tests/misc';
import { expect } from 'tests/setup/chai';
import { deployAbaxTge, deployEmitableToken, deployVester } from 'tests/setup/deploymentHelpers';
import { getApiProviderWrapper, getSigners } from 'tests/setup/helpers';
import AbaxTge from 'typechain/contracts/abax_tge';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';
import { TGEErrorBuilder } from 'typechain/types-returns/abax_tge';

const ABAX_DENOM = new BN(10).pow(new BN(ABAX_DECIMALS));

const [owner, ...signersRest] = getSigners();

async function prepareEnvBase(api: ApiPromise) {
  await transferNoop(api);
  // to force using fake_time
  await increaseBlockTimestamp(api, 0);

  const tge = await deployAbaxTge(api, owner);
  const abaxToken = await deployEmitableToken(api, owner, 'ABAX', ABAX_DECIMALS);
  const vester = await deployVester(api, owner);

  return {
    tge,
    abaxToken,
    vester,
  };
}

describe('TGE', () => {
  let tge: AbaxTge;
  let abaxToken: PSP22Emitable;
  let vester: Vester;
  const phaseOneTokenCap = E6bn.muln(100).mul(ABAX_DENOM);
  // const phaseOneTokenCap = new BN(10).pow(new BN(ABAX_DECIMALS));
  const phaseOneAmountPerMilllionTokens = new BN(40).mul(E6bn).mul(ABAX_DENOM);
  const phaseTwoDuration = ONE_DAY.muln(90);
  let foundersAddress: string;
  let foundationAddress: string;
  let strategicReservesAddress: string;
  let tgeStartTime: string;
  let contributors: KeyringPair[];
  const apiProviderWrapper = getApiProviderWrapper(9944);

  beforeEach(async () => {
    const api = await apiProviderWrapper.getAndWaitForReady();
    const contracts = await prepareEnvBase(api);
    tge = contracts.tge;
    abaxToken = contracts.abaxToken;
    vester = contracts.vester;
  });

  beforeEach(async () => {
    const [foundersAddr, foundationAddr, strategicReservesAddr, ...rest] = signersRest;
    contributors = rest;
    foundersAddress = foundersAddr.address;
    foundationAddress = foundationAddr.address;
    strategicReservesAddress = strategicReservesAddr.address;
    const api = await apiProviderWrapper.getAndWaitForReady();
    const now = await api.query.timestamp.now();
    tgeStartTime = now.toString();
    await tge
      .withSigner(owner)
      .tx.setTgeParams(
        tgeStartTime,
        phaseOneTokenCap,
        phaseOneAmountPerMilllionTokens,
        phaseTwoDuration,
        abaxToken.address,
        vester.address,
        foundersAddress,
        foundationAddress,
        strategicReservesAddress,
      );
  });

  it('Contribute fails if no value is transferred', async () => {
    const queryRes = (await tge.withSigner(contributors[0]).query.contribute()).value.ok;
    expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.ContributedZero());
  });

  it('Emits event on contribution', async () => {
    await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
    const queryRes = (await tge.withSigner(contributors[0]).query.contribute({ value: 1337 })).value.ok;
    expect(queryRes?.err).to.be.undefined;
    expect(queryRes?.ok).not.to.be.null;
    const tx = await tge.withSigner(contributors[0]).tx.contribute({ value: 1337 });
    expect(tx.events).to.have.lengthOf(1);
    expect(tx.events?.[0].name).to.equal('Contribution');
    expect(replaceNumericPropsWithStrings(tx.events?.[0].args)).to.deep.equal({
      contributor: contributors[0].address,
      amountContributed: new BN(1337).toString(),
      amountIssued: new BN(1337).muln(40).mul(ABAX_DENOM).toString(),
    });
  });

  it('Contribute fails if TGE is not started', async () => {
    await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) - 1);
    const queryRes = (await tge.withSigner(contributors[0]).query.contribute({ value: 1 })).value.ok;
    expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.TGENotStarted());
  });

  it('Fails if contribution amount exceeds phase one cap', async () => {
    await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
    const queryRes = (
      await tge
        .withSigner(contributors[0])
        .query.contribute({ value: phaseOneTokenCap.muln(20).divn(100).mul(E6bn).div(phaseOneAmountPerMilllionTokens).addn(1) })
    ).value.ok;
    expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.Phase1TokenCapReached());
  });

  it('Upon reaching phase one cap switches to phase 2', async () => {
    await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100);
    await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
    const tx = tge
      .withSigner(contributors[0])
      .tx.contribute({ value: phaseOneTokenCap.muln(20).divn(100).mul(E6bn).div(phaseOneAmountPerMilllionTokens) });
    await expect(tx).to.eventually.be.fulfilled;
    await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100);
    const currentParams = await getTgeParams(tge);
    expect(currentParams.phaseTwoStartTime.toString()).to.equal((parseInt(tgeStartTime) + 100).toString());
  });

  it('Contribute fails if TGE is finished', async () => {
    await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100);
    await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
    await tge
      .withSigner(contributors[0])
      .tx.contribute({ value: phaseOneTokenCap.muln(20).divn(100).mul(E6bn).div(phaseOneAmountPerMilllionTokens) });

    await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100 + 100);
    const queryResPhaseTwo = (await tge.withSigner(contributors[0]).query.contribute({ value: 1 })).value.ok;
    expect(queryResPhaseTwo?.err).to.be.undefined;

    await setBlockTimestamp(await apiProviderWrapper.getAndWaitForReady(), parseInt(tgeStartTime) + 100 + phaseTwoDuration.toNumber() + 1);
    const queryRes = (await tge.withSigner(contributors[0]).query.contribute({ value: 1 })).value.ok;
    expect(queryRes?.err).to.deep.equal(TGEErrorBuilder.TGEEnded());
  });

  it('Sends tokens to contributor & creates vests', async () => {
    await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
    const contributor = contributors[0];

    const tx = tge.withSigner(contributor).tx.contribute({ value: 1 });
    await expect(tx).to.eventually.be.fulfilled;
    const cotributorABAXBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
    expect(cotributorABAXBalance?.toString()).to.equal(new BN(40).mul(ABAX_DENOM).muln(4).divn(10).toString());

    const vestData = (await vester.query.vestingScheduleOf(contributor.address, abaxToken.address, 0, [])).value.ok;

    expect(vestData).not.to.be.null;
    expect(vestData).not.to.be.undefined;
    expect(vestData?.amount.toString()).to.equal(new BN(40).mul(ABAX_DENOM).muln(6).divn(10).toString());
    expect(vestData?.released.toString()).to.equal(new BN(0).toString());
    expect(vestData?.schedule.constant?.[0]?.toString()).to.equal(new BN(0).toString());
    expect(vestData?.schedule.constant?.[1]?.toString()).to.equal(ONE_YEAR.muln(4).toString());
  });

  it('On first contribution handles founders, foundation and strategic reserves (and only on first one)', async () => {
    await abaxToken.tx.mint(tge.address, phaseOneTokenCap);
    const contributor = contributors[0];
    const tx = tge.withSigner(contributor).tx.contribute({ value: 1 });
    await expect(tx).to.eventually.be.fulfilled;
    const contributorBalance = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
    expect(contributorBalance?.toString()).to.equal(new BN(40).mul(ABAX_DENOM).muln(4).divn(10).toString());

    const foundersBalance = (await abaxToken.query.balanceOf(foundersAddress)).value.ok;
    expect(foundersBalance?.toString()).to.equal(phaseOneTokenCap.muln(4).divn(100).toString());

    const foundationBalance = (await abaxToken.query.balanceOf(foundationAddress)).value.ok;
    expect(foundationBalance?.toString()).to.equal(phaseOneTokenCap.muln(2).divn(100).toString());

    const strategicReservesBalance = (await abaxToken.query.balanceOf(strategicReservesAddress)).value.ok;
    expect(strategicReservesBalance?.toString()).to.equal(phaseOneTokenCap.muln(58).divn(100).toString());

    await tge.withSigner(contributor).tx.contribute({ value: 1 });

    const contributorBalance2 = (await abaxToken.query.balanceOf(contributor.address)).value.ok;
    expect(contributorBalance2?.toString()).to.equal(new BN(40).mul(ABAX_DENOM).muln(4).divn(10).muln(2).toString());

    const foundersBalancePost2 = (await abaxToken.query.balanceOf(foundersAddress)).value.ok;
    expect(foundersBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(4).divn(100).toString());

    const foundationBalancePost2 = (await abaxToken.query.balanceOf(foundationAddress)).value.ok;
    expect(foundationBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(2).divn(100).toString());

    const strategicReservesBalancePost2 = (await abaxToken.query.balanceOf(strategicReservesAddress)).value.ok;
    expect(strategicReservesBalancePost2?.toString()).to.equal(phaseOneTokenCap.muln(58).divn(100).toString());
  });

  //TODO bonus multiplier tests
  //TODO vesting schedule tests
  //TODO phase 2 tests

  // zero address?
  //   if address == AccountId::from([0_u8; 32]) {
  //     return Err(TGEError::IsZeroAddress)
  // }

  //allow to contribute via SC?
  // if self.env().is_contract(&application) {
  //     return Err(TGEError::ContributionViaContract);
  // }
});
