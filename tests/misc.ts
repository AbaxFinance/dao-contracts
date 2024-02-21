import AbaxTge from 'typechain/contracts/abax_tge';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import { AnyAbaxContractEvent } from 'typechain/events/enum';

export async function getTgeParams(tge: AbaxTge) {
  const res = (await tge.query.getTgeParams()).value.ok!;
  return {
    startTime: res[0],
    phaseTwoStartTime: res[1],
    phaseTwoDuration: res[2],
    contributionTokenAddress: res[3],
    vester: res[4],
    foundersAddress: res[5],
    foundationAddress: res[6],
    strategicReservesAddress: res[7],
    wazeroAddress: res[8],
    phaseOneTokenCap: res[9],
    phaseOneAmountPerMillionTokens: res[10],
    totalAmountDistributed: res[11],
    totalStakingAirdropAmount: res[12],
  };
}

export const createEnumChecker = <T extends string, TEnumValue extends string>(enumVariable: { [key in T]: TEnumValue }) => {
  const enumValues = Object.values(enumVariable);
  return (value: string): value is TEnumValue => enumValues.includes(value);
};
export type AnyAbaxContractEventEnumLiteral<T extends AnyAbaxContractEvent> = `${T}`;
export type AnyAbaxContract = AbaxTge | PSP22Emitable;
