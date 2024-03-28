import BN from 'bn.js';
import { ABAX_DECIMALS, ONE_DAY, ONE_YEAR } from 'tests/consts';
import { expect } from 'tests/setup/chai';
import AbaxTreasury from 'typechain/contracts/abax_treasury';
import AbaxTreasuryDeployer from 'typechain/deployers/abax_treasury';
import Vester from 'typechain/contracts/vester';
import VesterDeployer from 'typechain/deployers/vester';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import PSP22EmitableDeployer from 'typechain/deployers/psp22_emitable';
import { getSigners, localApi, time, transferNativeFromTo } from '@c-forge/polkahat-network-helpers';
import { roleToSelectorId, testAccessControlForMessage } from './misc';
import { Operation } from './setup/createSpendingOrder';

const ALL_ROLES = ['PARAMETERS_ADMIN', 'SPENDER', 'EXECUTOR', 'CANCELLER', 'CODE_UPDATER'];

const [deployer, governor, foundation, other, receiver1, receiver2, receiver3, receiver4] = getSigners();
const ONE_TOKEN = new BN(10).pow(new BN(ABAX_DECIMALS));

describe('Abax Treasury tests', () => {
  let treasury: AbaxTreasury;
  let vester: Vester;
  let tokenA: PSP22Emitable;
  let tokenB: PSP22Emitable;
  let tokenC: PSP22Emitable;
  let api;
  beforeEach(async () => {
    api = await localApi.get();
    vester = (await new VesterDeployer(api, deployer).new()).contract;
    treasury = (await new AbaxTreasuryDeployer(api, deployer).new(governor.address, foundation.address, vester.address)).contract;
    tokenA = (await new PSP22EmitableDeployer(api, deployer).new('', '', 12)).contract;
    tokenB = (await new PSP22EmitableDeployer(api, deployer).new('', '', 12)).contract;
    tokenC = (await new PSP22EmitableDeployer(api, deployer).new('', '', 12)).contract;
  });

  describe('after deployment', () => {
    it('governor should have DEFAULT_ADMIN role', async () => {
      expect(await treasury.query.hasRole(roleToSelectorId('DEFAULT_ADMIN'), governor.address)).to.haveOkResult(true);
    });
    it('governor should have SPENDER role', async () => {
      expect(await treasury.query.hasRole(roleToSelectorId('SPENDER'), governor.address)).to.haveOkResult(true);
    });
    it('foundation should have EXECUTOR role', async () => {
      expect(await treasury.query.hasRole(roleToSelectorId('EXECUTOR'), foundation.address)).to.haveOkResult(true);
    });
    it('foundation should have CANCELLER role', async () => {
      expect(await treasury.query.hasRole(roleToSelectorId('CANCELLER'), foundation.address)).to.haveOkResult(true);
    });
    it('foundation should not have SPENDER  and DEFAULT_ADMIN role', async () => {
      expect(await treasury.query.hasRole(roleToSelectorId('SPENDER'), foundation.address)).to.haveOkResult(false);
      expect(await treasury.query.hasRole(roleToSelectorId('DEFAULT_ADMIN'), foundation.address)).to.haveOkResult(false);
    });
    it('vesting contract should not have any role', async () => {
      expect(await treasury.query.hasRole(roleToSelectorId('DEFAULT_ADMIN'), foundation.address)).to.haveOkResult(false);
      expect(await treasury.query.hasRole(roleToSelectorId('SPENDER'), foundation.address)).to.haveOkResult(false);
      expect(await treasury.query.hasRole(roleToSelectorId('EXECUTOR'), foundation.address)).to.haveOkResult(false);
      expect(await treasury.query.hasRole(roleToSelectorId('CANCELLER'), foundation.address)).to.haveOkResult(false);
    });
  });

  describe('Access Control ', () => {
    testAccessControlForMessage(['PARAMETERS_ADMIN'], ALL_ROLES, () => ({
      contract: treasury,
      method: 'setVester',
      args: [vester?.address ?? ''],
      roleAdmin: governor,
    }));
    testAccessControlForMessage(['SPENDER'], ALL_ROLES, () => ({
      contract: treasury,
      method: 'createOrder',
      args: [0],
      roleAdmin: governor,
    }));
  });
  describe('while in the vault there is 100 tokenA, 100tokenB, 100tokenC and 100 native token', () => {
    beforeEach(async () => {
      await tokenA.tx.mint(treasury.address, ONE_TOKEN.muln(100));
      await tokenB.tx.mint(treasury.address, ONE_TOKEN.muln(100));
      await tokenC.tx.mint(treasury.address, ONE_TOKEN.muln(100));
      await transferNativeFromTo(api, deployer, { address: treasury.address } as any, ONE_TOKEN.muln(100));
    });
    describe('while create order is called by the SPENDER', () => {
      // TODO handle event data
      it('should create order with one operation ', async () => {
        const earliestExecution = (await time.latest()) + ONE_DAY.toNumber();
        const latestExecution = earliestExecution + ONE_YEAR.toNumber();
        const operations: Operation[] = [
          {
            psp22Transfer: { asset: tokenA.address, to: receiver1.address, amount: ONE_TOKEN.muln(10) },
          },
        ];
        const tx = treasury.withSigner(governor).tx.createOrder(earliestExecution, latestExecution, operations);
        await expect(tx).to.createSpendingOrder(treasury, [
          {
            earliestExecution,
            latestExecution,
            operations,
          },
        ]);
        await expect(tx).to.emitEvent(treasury, 'OrderCreated', { id: 0, earliestExecution, latestExecution, operations });
      });

      it('should create two orders with one operation ', async () => {
        const earliestExecution1 = (await time.latest()) + ONE_DAY.toNumber();
        const earliestExecution2 = earliestExecution1 + 1;
        const latestExecution1 = earliestExecution1 + ONE_YEAR.toNumber();
        const latestExecution2 = earliestExecution2 + ONE_YEAR.toNumber();
        const operations1: Operation[] = [
          {
            psp22Transfer: { asset: tokenA.address, to: receiver1.address, amount: ONE_TOKEN.muln(10) },
          },
        ];
        const operations2: Operation[] = [
          {
            psp22Transfer: { asset: tokenA.address, to: receiver1.address, amount: ONE_TOKEN.muln(10) },
          },
        ];
        const tx1 = await treasury.withSigner(governor).tx.createOrder(earliestExecution1, latestExecution1, operations1);
        const tx2 = await treasury.withSigner(governor).tx.createOrder(earliestExecution2, latestExecution2, operations2);

        await expect(tx1).to.createSpendingOrder(treasury, [
          {
            earliestExecution: earliestExecution1,
            latestExecution: latestExecution1,
            operations: operations1,
          },
        ]);
        await expect(tx1).to.emitEvent(treasury, 'OrderCreated', {
          id: 0,
          earliestExecution: earliestExecution1,
          latestExecution: latestExecution1,
          operations: operations1,
        });
        await expect(tx2).to.createSpendingOrder(treasury, [
          {
            earliestExecution: earliestExecution2,
            latestExecution: latestExecution2,
            operations: operations2,
          },
        ]);
        await expect(tx2).to.emitEvent(treasury, 'OrderCreated', {
          id: 1,
          earliestExecution: earliestExecution2,
          latestExecution: latestExecution2,
          operations: operations2,
        });
      });

      it('should create order with many operation ', async () => {
        const earliestExecution = (await time.latest()) + ONE_DAY.toNumber();
        const latestExecution = earliestExecution + ONE_YEAR.toNumber();
        const operations: Operation[] = [
          { nativeTransfer: { to: receiver1.address, amount: ONE_TOKEN.muln(10) } },
          {
            vest: {
              asset: tokenA.address,
              receiver: receiver2.address,
              amount: ONE_TOKEN.muln(10),
              schedule: { constant: [ONE_DAY, ONE_YEAR] },
            },
          },
          {
            vest: {
              asset: tokenA.address,
              receiver: receiver3.address,
              amount: ONE_TOKEN.muln(10),
              schedule: { external: { account: other.address, fallbackValues: [ONE_DAY, ONE_YEAR] } },
            },
          },
          {
            psp22Transfer: { asset: tokenA.address, to: receiver4.address, amount: ONE_TOKEN.muln(10) },
          },
        ];
        const tx = treasury.withSigner(governor).tx.createOrder(earliestExecution, latestExecution, operations);

        await expect(tx).to.createSpendingOrder(treasury, [
          {
            earliestExecution,
            latestExecution,
            operations,
          },
        ]);
        await expect(tx).to.emitEvent(treasury, 'OrderCreated', { id: 0, earliestExecution, latestExecution, operations });
      });
      describe('while an order with 10 tokenA transfer operation was created', () => {
        let earliestExecution: number;
        let latestExecution: number;
        let operations: Operation[];
        beforeEach(async () => {
          earliestExecution = (await time.latest()) + ONE_DAY.toNumber();
          latestExecution = earliestExecution + ONE_YEAR.toNumber();
          operations = [
            {
              psp22Transfer: { asset: tokenA.address, to: receiver1.address, amount: ONE_TOKEN.muln(10) },
            },
          ];
          await treasury.withSigner(governor).tx.createOrder(earliestExecution, latestExecution, operations);
        });

        describe('while execute is called by the EXECUTOR(foundation)', () => {
          it('before earliestExecution it should fail', async () => {
            await expect(treasury.withSigner(foundation).query.executeOrder(0)).to.be.revertedWithError({ toEarlyToExecute: null });
          });
          describe('after earliestExecution', () => {
            beforeEach(async () => {
              await time.increase(ONE_DAY.toNumber() + 1);
            });
            describe('access control', () => {
              testAccessControlForMessage(['EXECUTOR'], ALL_ROLES, () => ({
                contract: treasury,
                method: 'executeOrder',
                args: [0],
                roleAdmin: governor,
              }));
            });
            it('operations should be executed', async () => {
              const tx = treasury.withSigner(foundation).tx.executeOrder(0);
              await expect(tx).to.emitEvent(treasury, 'OrderExecuted', { id: 0 });
              await expect(tx).to.changePSP22Balances(tokenA, [treasury.address, receiver1.address], [ONE_TOKEN.muln(10).neg(), ONE_TOKEN.muln(10)]);
            });
            it('order can not be executed many times', async () => {
              await expect(treasury.withSigner(foundation).tx.executeOrder(0)).to.be.eventually.fulfilled;
              await expect(treasury.withSigner(foundation).query.executeOrder(0)).to.be.revertedWithError({ noSuchOrder: null });
            });
            it('order can not be cancelled after it was executed', async () => {
              await expect(treasury.withSigner(foundation).tx.executeOrder(0)).to.be.eventually.fulfilled;
              await expect(treasury.withSigner(foundation).query.cancelOrder(0)).to.be.revertedWithError({ noSuchOrder: null });
            });
          });
        });
        describe('Cancel order', () => {
          describe('access control', () => {
            testAccessControlForMessage(['CANCELLER'], ALL_ROLES, () => ({
              contract: treasury,
              method: 'cancelOrder',
              args: [0],
              roleAdmin: governor,
            }));
          });
          it('should cancel order if called by CANCELLER(foundation) and order exists', async () => {
            const tx = treasury.withSigner(foundation).tx.cancelOrder(0);
            await expect(tx).to.emitEvent(treasury, 'OrderCancelled', { id: 0 });
          });
          it('should fail if called by CANCELLER and order does not exist', async () => {
            await expect(treasury.withSigner(foundation).query.cancelOrder(1)).to.be.revertedWithError({ noSuchOrder: null });
          });
          it('order can not be executed after it was cancelled', async () => {
            await expect(treasury.withSigner(foundation).tx.cancelOrder(0)).to.be.eventually.fulfilled;
            await expect(treasury.withSigner(foundation).query.executeOrder(0)).to.be.revertedWithError({ noSuchOrder: null });
          });
        });
      });

      describe('while an order with 10 native transfer, 10 tokenA vest, 10tokenB vest and 10 token C transfer operation was created', () => {
        let earliestExecution: number;
        let latestExecution: number;
        let operations: Operation[];
        beforeEach(async () => {
          earliestExecution = (await time.latest()) + ONE_DAY.toNumber();
          latestExecution = earliestExecution + ONE_YEAR.toNumber();
          //TODO add vest of native currency
          operations = [
            { nativeTransfer: { to: receiver1.address, amount: ONE_TOKEN.muln(10) } },
            {
              vest: {
                asset: tokenA.address,
                receiver: receiver2.address,
                amount: ONE_TOKEN.muln(10),
                schedule: { constant: [ONE_DAY, ONE_YEAR] },
              },
            },
            {
              vest: {
                asset: tokenB.address,
                receiver: receiver3.address,
                amount: ONE_TOKEN.muln(10),
                schedule: { external: { account: other.address, fallbackValues: [ONE_DAY, ONE_YEAR] } },
              },
            },
            {
              psp22Transfer: { asset: tokenC.address, to: receiver4.address, amount: ONE_TOKEN.muln(10) },
            },
          ];
          await treasury.withSigner(governor).tx.createOrder(earliestExecution, latestExecution, operations);
        });

        describe('while execute is called by the EXECUTOR(foundation)', () => {
          it('before earliestExecution it should fail', async () => {
            await expect(treasury.withSigner(foundation).query.executeOrder(0)).to.be.revertedWithError({ toEarlyToExecute: null });
          });
          describe('after earliestExecution', () => {
            beforeEach(async () => {
              await time.increase(ONE_DAY.toNumber() + 1);
            });
            it('operations should be executed', async () => {
              const tx = treasury.withSigner(foundation).tx.executeOrder(0);
              await expect(tx).to.emitEvent(treasury, 'OrderExecuted', { id: 0 });
              await expect(tx).to.changeBalances([treasury.address, receiver1.address], [ONE_TOKEN.muln(10).neg(), ONE_TOKEN.muln(10)]);
              await expect(tx).to.changePSP22Balances(tokenA, [treasury.address, vester.address], [ONE_TOKEN.muln(10).neg(), ONE_TOKEN.muln(10)]);
              await expect(tx).to.changePSP22Balances(tokenB, [treasury.address, vester.address], [ONE_TOKEN.muln(10).neg(), ONE_TOKEN.muln(10)]);
              await expect(tx).to.changePSP22Balances(tokenC, [treasury.address, receiver4.address], [ONE_TOKEN.muln(10).neg(), ONE_TOKEN.muln(10)]);
              // TODO: cehck that 2 vesting schedules were created
            });
          });
        });
      });
    });
  });
});
