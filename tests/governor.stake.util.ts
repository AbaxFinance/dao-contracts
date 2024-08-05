import type { KeyringPair } from '@polkadot/keyring/types';
import BN from 'bn.js';
import { UNSTAKE_PERIOD } from 'tests/governor.test';
import { expect } from 'tests/setup/chai';
import AbaxGovernor from 'typechain/contracts/governor';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import Vester from 'typechain/contracts/vester';
import { GovernError } from 'typechain/types-returns/governor';
import { PSP22Error, PSP22ErrorBuilder } from '@c-forge/polkahat-chai-matchers';
import { E12bn, E6bn, U128_MAX_VALUE } from '@c-forge/polkahat-network-helpers';

async function stakeAndCheck(
  govToken: PSP22Emitable,
  governor: AbaxGovernor,
  staker: KeyringPair,
  amount: BN,
  expectedError?: GovernError | PSP22Error,
) {
  const query = governor.withSigner(staker).query.deposit(amount, staker.address);
  if (expectedError) {
    await expect(query).to.be.revertedWithError(expectedError);
  } else {
    await expect(query).to.haveOkResult();
    const tx = governor.withSigner(staker).tx.deposit(amount, staker.address);
    await expect(tx).to.be.eventually.fulfilled;
    await expect(tx).to.emitEvent(governor, 'Deposit', {
      sender: staker.address,
      owner: staker.address,
      assets: amount,
      shares: amount,
    });
    await expect(tx).to.changePSP22Balances(govToken, [staker.address, governor.address], [amount.neg(), amount]);
    await expect(tx).to.changePSP22Balances(governor, [staker.address, governor.address], [amount, new BN(0)]);
  }
}

async function initializeUnstakeAndCheck(
  vester: Vester,
  govToken: PSP22Emitable,
  governor: AbaxGovernor,
  staker: KeyringPair,
  amount: BN,
  expectedError?: GovernError | PSP22Error,
) {
  const query = governor.withSigner(staker).query.withdraw(amount, staker.address, staker.address);
  if (expectedError) {
    await expect(query).to.be.revertedWithError(expectedError);
  } else {
    await expect(query).to.haveOkResult();
    const tx = governor.withSigner(staker).tx.withdraw(amount, staker.address, staker.address);
    await expect(tx).to.be.eventually.fulfilled;
    await expect(tx).to.emitEvent(governor, 'Withdraw', {
      sender: staker.address,
      receiver: staker.address,
      owner: staker.address,
      assets: amount,
      shares: amount,
    });
    await expect(tx).to.changePSP22Balances(governor, [staker.address], [amount.neg()]);
    await expect(tx).to.changePSP22Balances(govToken, [staker.address, governor.address], [new BN(0), amount.neg()]);
    await expect(tx).to.createVestingSchedule(vester, staker.address, govToken.address, [
      amount,
      {
        account: governor.address,
        fallbackValues: [UNSTAKE_PERIOD, new BN(0)],
      },
    ]);
  }
}

export function testStaking(
  getCtx: () => {
    governor: AbaxGovernor;
    govToken: PSP22Emitable;
    vester: Vester;
    users: KeyringPair[];
  },
) {
  describe(`Staking `, () => {
    const ctx: ReturnType<typeof getCtx> = {} as any;
    beforeEach(async () => {
      Object.assign(ctx, getCtx());
    });
    describe(`Stake `, () => {
      it(`tries to stake 0`, async () => {
        await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], new BN(0));
      });
      it(`tries to stake but hasn't given allowance`, async () => {
        await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], new BN(1), PSP22ErrorBuilder.InsufficientAllowance());
      });
      describe(`gives allowance to the governor and ... `, () => {
        beforeEach(async () => {
          await ctx.govToken.withSigner(ctx.users[0]).tx.increaseAllowance(ctx.governor.address, U128_MAX_VALUE.divn(2));
        });
        it(`tries to stake but has no balance at all`, async () => {
          await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], new BN(1), PSP22ErrorBuilder.InsufficientBalance());
        });
        describe(`receives E6*E12 tokens and ...`, () => {
          let userBalance: BN;
          beforeEach(async () => {
            userBalance = E6bn.mul(E12bn);
            await ctx.govToken.tx.mint(ctx.users[0].address, userBalance);
          });
          it(`tries to stake more than has`, async () => {
            await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], userBalance.addn(1), PSP22ErrorBuilder.InsufficientBalance());
          });

          it(`stakes all successfully - event is emitted, state of the contract is updated`, async () => {
            await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], userBalance);
          });

          it(`stakes all successfully in four transactions - event is emitted, state of the contract is updated`, async () => {
            const divBy = 4;
            await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], userBalance.divn(divBy));
            await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], userBalance.divn(divBy));
            await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], userBalance.divn(divBy));
            await stakeAndCheck(ctx.govToken, ctx.governor, ctx.users[0], userBalance.divn(divBy));
          });
        });
      });
    });

    describe(`Initialize Unstake : user0 `, () => {
      it(`tries to initialze unstake but hasn't any stake`, async () => {
        await initializeUnstakeAndCheck(ctx.vester, ctx.govToken, ctx.governor, ctx.users[0], new BN(1), PSP22ErrorBuilder.Custom('V:MaxWithdraw'));
      });
      describe(`stakes E6*E12 tokens`, () => {
        let amountStaked: BN;
        beforeEach(async () => {
          amountStaked = E6bn.mul(E12bn);
          await ctx.govToken.withSigner(ctx.users[0]).tx.increaseAllowance(ctx.governor.address, U128_MAX_VALUE.divn(2));
          await ctx.govToken.tx.mint(ctx.users[0].address, E6bn.mul(E12bn));
          await ctx.governor.withSigner(ctx.users[0]).tx.deposit(amountStaked, ctx.users[0].address);
        });
        it(`tries to initialize unstake of 0 amount`, async () => {
          await initializeUnstakeAndCheck(ctx.vester, ctx.govToken, ctx.governor, ctx.users[0], new BN(0));
        });

        it(`tries to unstake more than has`, async () => {
          await initializeUnstakeAndCheck(
            ctx.vester,
            ctx.govToken,
            ctx.governor,
            ctx.users[0],
            amountStaked.addn(1),
            PSP22ErrorBuilder.Custom('V:MaxWithdraw'),
          );
        });

        it(`initialize unstake of all stake successfully - event is emitted, state of the contract is updated`, async () => {
          await initializeUnstakeAndCheck(ctx.vester, ctx.govToken, ctx.governor, ctx.users[0], amountStaked);
        });
        it(`initialize unstake of 1/3 of stake 3 times successfully - event is emitted, state of the contract is updated`, async () => {
          const divBy = 3;
          await initializeUnstakeAndCheck(ctx.vester, ctx.govToken, ctx.governor, ctx.users[0], amountStaked.divn(divBy));
          await initializeUnstakeAndCheck(ctx.vester, ctx.govToken, ctx.governor, ctx.users[0], amountStaked.divn(divBy));
          await initializeUnstakeAndCheck(ctx.vester, ctx.govToken, ctx.governor, ctx.users[0], amountStaked.divn(divBy));
        });
      });
    });
  });
}
