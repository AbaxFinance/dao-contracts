import BN from 'bn.js';
import { ABAX_DECIMALS, ONE_DAY, ONE_YEAR } from 'tests/consts';
import { expect } from 'tests/setup/chai';
import AbaxInflator from 'typechain/contracts/abax_inflator';
import AbaxInflatorDeployer from 'typechain/deployers/abax_inflator';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import PSP22EmitableDeployer from 'typechain/deployers/psp22_emitable';
import { getSigners, localApi, time, transferNativeFromTo } from '@c-forge/polkahat-network-helpers';
import { roleToSelectorId, testAccessControlForMessage } from './misc';

const ALL_ROLES = ['PARAMETERS_ADMIN', 'SPENDER', 'EXECUTOR', 'CANCELLER', 'CODE_UPDATER'];

const [deployer, governor, parametersAdmin, receiver1, receiver2, receiver3, receiver4] = getSigners();
const ONE_TOKEN = new BN(10).pow(new BN(ABAX_DECIMALS));

describe('Abax Treasury tests', () => {
  let inflator: AbaxInflator;
  let token: PSP22Emitable;
  let api;
  beforeEach(async () => {
    api = await localApi.get();
    token = (await new PSP22EmitableDeployer(api, deployer).new('token', 'TOK', 12)).contract;
    inflator = (
      await new AbaxInflatorDeployer(api, deployer).new(governor.address, token.address, [
        [receiver1.address, 1],
        [receiver2.address, 2],
      ])
    ).contract;
  });

  describe('after deployment', () => {
    it('governor should have DEFAULT_ADMIN role', async () => {
      await expect(await inflator.query.hasRole(roleToSelectorId('DEFAULT_ADMIN'), governor.address)).to.haveOkResult(true);
    });
    it('should have the correct token address', async () => {
      await expect(await inflator.query.abaxTokenAccountId()).to.haveOkResult(token.address);
    });
    it('should have correct distribution array', async () => {
      await expect(await inflator.query.inflationDistribution()).to.haveOkResult([
        [receiver1.address, 1],
        [receiver2.address, 2],
      ]);
    });

    it('inflate should work correctly', async () => {
      const amountInflated = new BN(10).pow(new BN(18));
      const tx = inflator.tx.inflate(amountInflated);
      await expect(tx).to.be.eventually.fulfilled;
      await expect(tx).to.emitEvent(inflator, 'InflationDistributed');
      await expect(tx).to.changePSP22Balances(
        token,
        [receiver1.address, receiver2.address],
        [amountInflated.divn(3).muln(1), amountInflated.divn(3).muln(2)],
      );
    });
  });

  describe('Access control', () => {
    beforeEach(async () => {
      await inflator.withSigner(governor).tx.grantRole(roleToSelectorId('PARAMETERS_ADMIN'), parametersAdmin.address);
    });
    testAccessControlForMessage(['PARAMETERS_ADMIN'], ALL_ROLES, () => ({
      contract: inflator,
      method: 'setInflationDistribution',
      args: [
        [
          [receiver1.address, 1],
          [receiver2.address, 2],
        ],
      ],
      roleAdmin: governor,
    }));
  });

  describe('setInflationDistribution', () => {
    let tx: Promise<any>;
    const newDistribution: [string, number | BN][] = [
      [receiver1.address, 2],
      [receiver2.address, 3],
      [receiver3.address, 4],
    ];
    beforeEach(async () => {
      await inflator.withSigner(governor).tx.grantRole(roleToSelectorId('PARAMETERS_ADMIN'), parametersAdmin.address);
      tx = inflator.withSigner(parametersAdmin).tx.setInflationDistribution(newDistribution);
    });
    it('should set the inflation distribution correctly', async () => {
      await expect(tx).to.be.eventually.fulfilled;
      await expect(tx).to.emitEvent(inflator, 'InflationDistributionChanged', {
        distribution: newDistribution,
      });
      await expect(await inflator.query.inflationDistribution()).to.haveOkResult(newDistribution);
    });

    it('after inflation distribution change, inflate should work correctly', async () => {
      await expect(tx).to.be.eventually.fulfilled;
      const amountInflated = new BN(10).pow(new BN(18));
      const txDistribute = inflator.tx.inflate(amountInflated);

      await expect(txDistribute).to.emitEvent(inflator, 'InflationDistributed');
      await expect(txDistribute).to.changePSP22Balances(
        token,
        [receiver1.address, receiver2.address, receiver3.address],
        [amountInflated.divn(9).muln(2), amountInflated.divn(9).muln(3), amountInflated.divn(9).muln(4)],
      );
    });
  });
});
