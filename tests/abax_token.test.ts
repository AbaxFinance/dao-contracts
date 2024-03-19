import BN from 'bn.js';
import { ABAX_DECIMALS, AllAbaxDAORoleNames, ONE_YEAR } from 'tests/consts';
import { stringToSelectorId, testAccessControlForMessage } from 'tests/misc';
import { expect } from 'tests/setup/chai';
import AbaxToken from 'typechain/contracts/abax_token';
import AbaxTokenV2Contract from 'typechain/contracts/abax_token_v2';
import AbaxTokenDeployer from 'typechain/deployers/abax_token';
import AbaxTokenV2Deployer from 'typechain/deployers/abax_token_v2';
import { getSigners, localApi, time } from 'wookashwackomytest-polkahat-network-helpers';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';

const [deployer, upgrader, minter, generator, other, ...rest] = getSigners();
const ONE_TOKEN = new BN(10).pow(new BN(ABAX_DECIMALS));

function deploymentChecks(getCtx: () => { abaxToken: AbaxToken }) {
  it(`has set roles correctly`, async () => {
    await expect(getCtx().abaxToken.query.hasRole(stringToSelectorId('MINTER'), minter.address)).to.haveOkResult(true);
    await expect(getCtx().abaxToken.query.hasRole(stringToSelectorId('CODE_UPGRADER'), upgrader.address)).to.haveOkResult(true);
    await expect(getCtx().abaxToken.query.hasRole(stringToSelectorId('GENERATOR'), generator.address)).to.haveOkResult(true);
  });
  it('should have correct name', async () => {
    expect(await getCtx().abaxToken.query.tokenName()).to.haveOkResult('NAME');
  });
  it('should have correct symbol', async () => {
    expect(await getCtx().abaxToken.query.tokenSymbol()).to.haveOkResult('SYMBOL');
  });
  it('should have correct decimals', async () => {
    expect(await getCtx().abaxToken.query.tokenDecimals()).to.haveOkResult(ABAX_DECIMALS);
  });
  it('should have 0 total supply', async () => {
    expect(await getCtx().abaxToken.query.totalSupply()).to.haveOkResult(0);
  });
  it('should have cap 0', async () => {
    expect(await getCtx().abaxToken.query.cap()).to.haveOkResult(0);
  });
  it('should have inflation_rate_per_milisecond 0', async () => {
    expect(await getCtx().abaxToken.query.inflationRatePerMilisecond()).to.haveOkResult(0);
  });
}

describe('AbaxToken', () => {
  let abaxToken: AbaxToken;
  beforeEach(async () => {
    const api = await localApi.get();
    abaxToken = (await new AbaxTokenDeployer(api, deployer).new('NAME', 'SYMBOL', ABAX_DECIMALS)).contract;
    await abaxToken.withSigner(deployer).tx.grantRole(stringToSelectorId('MINTER'), minter.address);
    await abaxToken.withSigner(deployer).tx.grantRole(stringToSelectorId('CODE_UPGRADER'), upgrader.address);
    await abaxToken.withSigner(deployer).tx.grantRole(stringToSelectorId('GENERATOR'), generator.address);
  });

  describe('after deployment', () => {
    deploymentChecks(() => ({ abaxToken }));
  });

  describe('generate', () => {
    testAccessControlForMessage(['GENERATOR'], AllAbaxDAORoleNames, () => ({
      contract: abaxToken,
      method: 'generate',
      args: [other.address, 100],
      roleAdmin: deployer,
    }));
    describe('when called by generator', () => {
      describe('when called by generator', () => {
        let tx: Promise<SignAndSendSuccessResponse>;
        const amount = ONE_TOKEN.muln(100);
        const inflationChange = amount.muln(10).div(ONE_YEAR);
        let capBefore;
        let inflationRatePerMilisecondBefore;
        describe('single generate', () => {
          beforeEach(async () => {
            capBefore = (await abaxToken.query.cap()).value.ok!;
            inflationRatePerMilisecondBefore = (await abaxToken.query.inflationRatePerMilisecond()).value.ok!;
            tx = abaxToken.withSigner(generator).tx.generate(other.address, amount);
          });

          it('should mint tokens', async () => {
            await expect(tx).to.changePSP22Balances(abaxToken, [other.address], [amount]);
          });
          it('should emit Transfer event', async () => {
            await expect(tx).to.emitEvent(abaxToken, 'Transfer', { from: null, to: other.address, value: amount });
          });
          it('should increase cap', async () => {
            await tx;
            expect(await abaxToken.query.cap()).to.haveOkResult(capBefore.add(amount));
          });
          it('should increase inflation_rate_per_milisecond', async () => {
            await tx;
            expect(await abaxToken.query.inflationRatePerMilisecond()).to.haveOkResult(inflationRatePerMilisecondBefore.add(inflationChange));
          });
        });
        describe('when called multiple times', () => {
          it('should mint tokens', async () => {
            //1
            tx = abaxToken.withSigner(generator).tx.generate(other.address, amount);
            await expect(tx).to.changePSP22Balances(abaxToken, [other.address], [amount]);
            //2
            tx = abaxToken.withSigner(generator).tx.generate(other.address, amount);
            await expect(tx).to.changePSP22Balances(abaxToken, [other.address], [amount]);
            //3
            tx = abaxToken.withSigner(generator).tx.generate(other.address, amount);
            await expect(tx).to.changePSP22Balances(abaxToken, [other.address], [amount]);
          });
          it('should emit Transfer event', async () => {
            //1
            tx = abaxToken.withSigner(generator).tx.generate(other.address, amount);
            await expect(tx).to.emitEvent(abaxToken, 'Transfer', {
              from: null,
              to: other.address,
              value: amount,
            });
            //2
            tx = abaxToken.withSigner(generator).tx.generate(other.address, amount);
            await expect(tx).to.emitEvent(abaxToken, 'Transfer', {
              from: null,
              to: other.address,
              value: amount,
            });
            //3
            tx = abaxToken.withSigner(generator).tx.generate(other.address, amount);
            await expect(tx).to.emitEvent(abaxToken, 'Transfer', {
              from: null,
              to: other.address,
              value: amount,
            });
          });
          it('should increase cap', async () => {
            //1
            capBefore = (await abaxToken.query.cap()).value.ok!;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.cap()).to.be.haveOkResult(capBefore.add(amount));
            //2
            capBefore = (await abaxToken.query.cap()).value.ok!;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.cap()).to.be.haveOkResult(capBefore.add(amount));
            //3
            capBefore = (await abaxToken.query.cap()).value.ok!;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.cap()).to.be.haveOkResult(capBefore.add(amount));
          });
          it('should increase inflation_rate_per_milisecond', async () => {
            //1
            inflationRatePerMilisecondBefore = (await abaxToken.query.inflationRatePerMilisecond()).value.ok!;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.inflationRatePerMilisecond()).to.be.haveOkResult(inflationRatePerMilisecondBefore.add(inflationChange));
            //2
            inflationRatePerMilisecondBefore = (await abaxToken.query.inflationRatePerMilisecond()).value.ok!;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.inflationRatePerMilisecond()).to.be.haveOkResult(inflationRatePerMilisecondBefore.add(inflationChange));
            //3
            inflationRatePerMilisecondBefore = (await abaxToken.query.inflationRatePerMilisecond()).value.ok!;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.inflationRatePerMilisecond()).to.be.haveOkResult(inflationRatePerMilisecondBefore.add(inflationChange));
          });
        });
      });
    });
  });

  describe('mint', () => {
    describe('when called by non-minter', () => {
      it('should fail', async () => {
        const amount = new BN(100);
        for (const signer of [deployer, upgrader, generator, other]) {
          await expect(abaxToken.withSigner(signer).query.mint(other.address, amount)).to.be.revertedWithError({ custom: 'AC::MissingRole' });
        }
      });
    });
    describe('when called by minter', () => {
      it('when called while cap is 0 thenshould fail', async () => {
        await expect(abaxToken.withSigner(minter).query.mint(other.address, 1)).to.be.revertedWithError({ custom: 'CapReached' });
      });
      describe('when called after token generation and YEAR has passed', () => {
        const amount = ONE_TOKEN.muln(10);
        const INFLATION_PER_MILISECOND = ONE_TOKEN.div(ONE_YEAR);
        const INFLATION_PER_YEAR = INFLATION_PER_MILISECOND.mul(ONE_YEAR);
        beforeEach(async () => {
          await abaxToken.withSigner(generator).tx.generate(other.address, amount);
          await time.increase(ONE_YEAR.toNumber());
        });
        it('minting 0 amount should inflate cap', async () => {
          const capBefore = (await abaxToken.query.cap()).value.ok!;
          const tx = abaxToken.withSigner(minter).tx.mint(other.address, 0);
          await expect(tx).to.changePSP22Balances(abaxToken, [other.address], [new BN(0)]);
          await expect(tx).to.emitEvent(abaxToken, 'Transfer', {
            from: null,
            to: other.address,
            value: 0,
          });
          await expect(tx).to.emitEvent(abaxToken, 'CapUpdated', { cap: capBefore.add(INFLATION_PER_YEAR).toString() });
          expect(await abaxToken.query.cap()).to.haveOkResult(capBefore.add(INFLATION_PER_YEAR));
        });
        it('minting maximum amount should inflate cap and mint tokens', async () => {
          const capBefore = (await abaxToken.query.cap()).value.ok!;
          const tx = abaxToken.withSigner(minter).tx.mint(other.address, INFLATION_PER_YEAR);
          await expect(tx).to.changePSP22Balances(abaxToken, [other.address], [INFLATION_PER_YEAR]);
          await expect(tx).to.emitEvent(abaxToken, 'Transfer', {
            from: null,
            to: other.address,
            value: INFLATION_PER_YEAR,
          });
          await expect(tx).to.emitEvent(abaxToken, 'CapUpdated', { cap: capBefore.add(INFLATION_PER_YEAR).toString() });
          expect(await abaxToken.query.cap()).to.haveOkResult(capBefore.add(INFLATION_PER_YEAR));
        });
        it('minting more than maximum amount should fail', async () => {
          await expect(abaxToken.withSigner(minter).query.mint(other.address, INFLATION_PER_YEAR.addn(1))).to.be.revertedWithError({
            custom: 'CapReached',
          });
        });
      });
    });
  });

  describe(`upgradeability`, () => {
    let originalHash: string;
    let newCodeHash: string;
    beforeEach(async () => {
      const abaxTokenV2 = (await new AbaxTokenV2Deployer(await localApi.get(), deployer).new('NAME', 'SYMBOL', ABAX_DECIMALS)).contract;
      const api = await localApi.get();
      const resOriginal = (await api.query.contracts.contractInfoOf(abaxToken.address)).toHuman() as { codeHash: string };
      originalHash = resOriginal.codeHash;
      const res = (await api.query.contracts.contractInfoOf(abaxTokenV2.address)).toHuman() as { codeHash: string };
      newCodeHash = res.codeHash;
    });

    testAccessControlForMessage(['CODE_UPGRADER'], AllAbaxDAORoleNames, () => ({
      contract: abaxToken,
      method: 'setCodeHash',
      args: [newCodeHash],
      roleAdmin: deployer,
    }));
    it('should revert when hash is invalid', async () => {
      await expect(abaxToken.withSigner(upgrader).query.setCodeHash(newCodeHash.slice(0, -5) + '00000')).to.be.revertedWithError();
    });
    describe('should persist state after upgrade', async () => {
      let otherBalancePre: BN;
      beforeEach(async () => {
        await abaxToken.withSigner(generator).tx.generate(other.address, 10_000);
        otherBalancePre = (await abaxToken.query.balanceOf(other.address)).value.unwrapRecursively();
        (await abaxToken.withSigner(upgrader).query.setCodeHash(newCodeHash)).value.unwrapRecursively();
        await abaxToken.withSigner(upgrader).tx.setCodeHash(newCodeHash);
      });
      describe('after upgrade deployment checks should pass', () => {
        deploymentChecks(() => ({ abaxToken }));
      });

      describe('custom checks', () => {
        it(`code hash was updated`, async () => {
          const api = await localApi.get();
          const res = (await api.query.contracts.contractInfoOf(abaxToken.address)).toHuman() as { codeHash: string };
          expect(res.codeHash).to.equal(newCodeHash);
        });

        it(`should work after reverting back to previous hash`, async () => {
          (await abaxToken.withSigner(upgrader).query.setCodeHash(originalHash)).value.unwrapRecursively();
          await abaxToken.withSigner(upgrader).tx.setCodeHash(originalHash);
        });

        it('should have the same balance', async () => {
          const qr = await abaxToken.query.balanceOf(other.address);
          const otherBalancePost = qr.value.unwrapRecursively();
          expect(otherBalancePost).to.equal(otherBalancePre);
        });
        it('transfer should be possible', async () => {
          await expect(abaxToken.withSigner(other).query.transfer(rest[0].address, 100, [])).to.haveOkResult();
          const tx = abaxToken.withSigner(other).tx.transfer(rest[0].address, 100, []);
          await tx;
          await expect(tx).to.changePSP22Balances(abaxToken, [other.address, rest[0].address], [new BN(100).neg(), new BN(100)]);
        });

        it('should contain new fields', async () => {
          const abaxTokenAsV2 = new AbaxTokenV2Contract(abaxToken.address, abaxToken.signer, abaxToken.nativeAPI);
          await expect(abaxTokenAsV2.query.setNewFieldA(5)).to.haveOkResult();
          await abaxTokenAsV2.tx.setNewFieldA(5);
          expect(await abaxTokenAsV2.query.getNewField()).to.haveOkResult({ a: 5, b: 0 });
          await abaxTokenAsV2.tx.incrementCounter();
          await expect(abaxTokenAsV2.query.getCounter()).to.haveOkResult(1);
        });
      });
    });
  });
});
