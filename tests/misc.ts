import { blake2AsU8a } from '@polkadot/util-crypto';
import BN from 'bn.js';
import AbaxTge from 'typechain/contracts/abax_tge';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import { AnyAbaxContractEvent } from 'typechain/events/enum';
import { AccountId, replaceNumericPropsWithStrings } from 'wookashwackomytest-polkahat-chai-matchers';
import type { KeyringPair } from '@polkadot/keyring/types';
import { expect } from 'chai';

//based on the above
export async function getTgeParams(tge: AbaxTge) {
  const res = (await tge.query.getTgeStorage()).value.ok!;
  return {
    startTime: res[0],
    phaseTwoStartTime: res[1],
    phaseTwoDuration: res[2],
    generatedTokenAddress: res[3],
    wazeroAddress: res[4],
    vesterAddress: res[5],
    foundersAddress: res[6],
    foundationAddress: res[7],
    strategicReservesAddress: res[8],
    phaseOneTokenCap: res[9],
    costToMintMillionTokens: res[10],
    totalAmountMinted: res[11],
  };
}
export const createEnumChecker = <T extends string, TEnumValue extends string>(enumVariable: { [key in T]: TEnumValue }) => {
  const enumValues = Object.values(enumVariable);
  return (value: string): value is TEnumValue => enumValues.includes(value);
};
export type AnyAbaxContractEventEnumLiteral<T extends AnyAbaxContractEvent> = `${T}`;
export type AnyAbaxContract = AbaxTge | PSP22Emitable;

//////////////////////////

export function stringToSelectorId(str: string) {
  const strBlake2AsU8a = blake2AsU8a(str);
  const selectorU8Array = strBlake2AsU8a.slice(0, 4);
  const buffer = Buffer.from(selectorU8Array);
  const res = buffer.readUInt32BE(0);
  return res.toString();
}

export function testAccessControlForMessage(
  rolesWithAccess: readonly string[],
  allRoles: readonly string[],
  getCtx: () => { contract: any; method: string; args: any[]; admin: KeyringPair; signer: KeyringPair },
) {
  const ctx: ReturnType<typeof getCtx> = getCtx();
  const rolesWithoutAccess = allRoles.filter((role) => !rolesWithAccess.includes(role));

  describe(`Testing AccessControl for message "${ctx.method}" for ${rolesWithAccess.length === 0 ? `role` : `roles`} ${rolesWithAccess.join(
    ',',
  )}`, () => {
    beforeEach(() => {
      Object.assign(ctx, getCtx());
    });
    it(`should fail when no role is present`, async () => {
      await expect(ctx.contract.withSigner(ctx.signer).query[ctx.method](...ctx.args)).to.be.revertedWithError({ custom: 'AC::MissingRole' });
    });
    it(`should fail for roles ${rolesWithoutAccess.join(',')}`, async () => {
      for (const role of rolesWithoutAccess) {
        const requiredRoleAsSelector = stringToSelectorId(role);
        if ((await ctx.contract.query.hasRole(requiredRoleAsSelector, ctx.signer.address)).value.unwrapRecursively() === true) {
          console.warn(`warning: role ${role} already granted for ${ctx.signer.address}`);
        } else {
          await expect(ctx.contract.withSigner(ctx.admin).query.grantRole(requiredRoleAsSelector, ctx.signer.address)).to.haveOkResult();
          await ctx.contract.withSigner(ctx.admin).tx.grantRole(requiredRoleAsSelector, ctx.signer.address);
        }
        await expect(ctx.contract.withSigner(ctx.signer).query[ctx.method](...ctx.args), `failed for role ${role}`).to.be.revertedWithError({
          custom: 'AC::MissingRole',
        });
      }
    });
    for (const role of rolesWithAccess) {
      it(`should succeed when ${role} role is present`, async () => {
        const requiredRoleAsSelector = stringToSelectorId(role);
        await ctx.contract.withSigner(ctx.admin).tx.grantRole(requiredRoleAsSelector, ctx.signer.address);
        await expect(ctx.contract.withSigner(ctx.signer).query[ctx.method](...ctx.args)).to.haveOkResult();
      });
    }
  });
}
