import BN from 'bn.js';
import AbaxTge from 'typechain/contracts/abax_tge';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import { AnyAbaxContractEvent } from 'typechain/events/enum';
import { AccountId, replaceNumericPropsWithStrings } from 'wookashwackomytest-polkahat-chai-matchers';

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
