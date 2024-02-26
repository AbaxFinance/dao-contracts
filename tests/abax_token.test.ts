import BN from 'bn.js';
import { ABAX_DECIMALS, AZERO_DECIMALS, ContractRoles, ONE_YEAR } from 'tests/consts';
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
import { getSigners, localApi, time } from 'wookashwackomytest-polkahat-network-helpers';
import { SignAndSendSuccessResponse } from 'wookashwackomytest-typechain-types';

const [deployer, updater, minter, generator, other] = getSigners();
const ONE_TOKEN = new BN(10).pow(new BN(ABAX_DECIMALS));

describe.only('AbaxToken', () => {
  let abaxToken: AbaxToken;
  beforeEach(async () => {
    const api = await localApi.get();
    abaxToken = (await new AbaxTokenDeployer(api, deployer).new('NAME', 'SYMBOL', ABAX_DECIMALS)).contract;
    await abaxToken.withSigner(deployer).tx.grantRole(ContractRoles.MINTER, minter.address);
    await abaxToken.withSigner(deployer).tx.grantRole(ContractRoles.UPDATER, updater.address);
    await abaxToken.withSigner(deployer).tx.grantRole(ContractRoles.GENERATOR, generator.address);

    await expect(abaxToken.query.hasRole(ContractRoles.MINTER, minter.address)).to.haveOkResult(true);
    await expect(abaxToken.query.hasRole(ContractRoles.UPDATER, updater.address)).to.haveOkResult(true);
    await expect(abaxToken.query.hasRole(ContractRoles.GENERATOR, generator.address)).to.haveOkResult(true);
  });

  describe('after deployment', () => {
    it('should have correct name', async () => {
      expect(await abaxToken.query.tokenName()).to.haveOkResult('NAME');
    });
    it('should have correct symbol', async () => {
      expect(await abaxToken.query.tokenSymbol()).to.haveOkResult('SYMBOL');
    });
    it('should have correct decimals', async () => {
      expect(await abaxToken.query.tokenDecimals()).to.haveOkResult(ABAX_DECIMALS);
    });
    it('should have 0 total supply', async () => {
      expect(await abaxToken.query.totalSupply()).to.haveOkResult(0);
    });
    it('should have cap 0', async () => {
      expect(await abaxToken.query.cap()).to.haveOkResult(0);
    });
    it('should have inflation_rate_per_milisecond 0', async () => {
      expect(await abaxToken.query.inflationRatePerMilisecond()).to.haveOkResult(0);
    });
  });

  describe('generate', () => {
    describe('when called by generator', () => {
      describe('when called by non-generator', () => {
        it('should fail', async () => {
          const amount = new BN(100);
          for (const caller of [deployer, updater, minter, other]) {
            await expect(abaxToken.query.generate(other.address, amount)).to.be.revertedWithError({ custom: 'AC::MissingRole' });
          }
        });
      });
      describe('when called by generator', () => {
        let tx: Promise<SignAndSendSuccessResponse>;
        const amount = ONE_TOKEN.muln(100);
        const inflationChange = amount.muln(10).div(ONE_YEAR);
        let capBefore;
        let inflationRatePerMilisecondBefore;
        describe('single generate', () => {
          beforeEach(async () => {
            capBefore = (await abaxToken.query.cap()).value.ok!.rawNumber;
            inflationRatePerMilisecondBefore = (await abaxToken.query.inflationRatePerMilisecond()).value.ok!.rawNumber;
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
            capBefore = (await abaxToken.query.cap()).value.ok!.rawNumber;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.cap()).to.be.haveOkResult(capBefore.add(amount));
            //2
            capBefore = (await abaxToken.query.cap()).value.ok!.rawNumber;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.cap()).to.be.haveOkResult(capBefore.add(amount));
            //3
            capBefore = (await abaxToken.query.cap()).value.ok!.rawNumber;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.cap()).to.be.haveOkResult(capBefore.add(amount));
          });
          it('should increase inflation_rate_per_milisecond', async () => {
            //1
            inflationRatePerMilisecondBefore = (await abaxToken.query.inflationRatePerMilisecond()).value.ok!.rawNumber;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.inflationRatePerMilisecond()).to.be.haveOkResult(inflationRatePerMilisecondBefore.add(inflationChange));
            //2
            inflationRatePerMilisecondBefore = (await abaxToken.query.inflationRatePerMilisecond()).value.ok!.rawNumber;
            await abaxToken.withSigner(generator).tx.generate(other.address, amount);
            expect(await abaxToken.query.inflationRatePerMilisecond()).to.be.haveOkResult(inflationRatePerMilisecondBefore.add(inflationChange));
            //3
            inflationRatePerMilisecondBefore = (await abaxToken.query.inflationRatePerMilisecond()).value.ok!.rawNumber;
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
        for (const signer of [deployer, updater, generator, other]) {
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
          const capBefore = (await abaxToken.query.cap()).value.ok!.rawNumber;
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
          const capBefore = (await abaxToken.query.cap()).value.ok!.rawNumber;
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
});
