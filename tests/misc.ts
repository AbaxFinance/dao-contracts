import { deployEmitableToken } from 'tests/setup/deploymentHelpers';
import { getSigners } from 'tests/setup/helpers';
import AbaxTge from 'typechain/contracts/abax_tge';
import PSP22Emitable from 'typechain/contracts/psp22_emitable';
import { AnyAbaxContractEvent } from 'typechain/events/enum';
import { getEventTypeDescription } from 'typechain/shared/utils';
import { handleEventReturn } from 'wookashwackomytest-typechain-types';
import { ApiPromise } from '@polkadot/api';

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

const subscribeOnEvent = async <TEvent extends AnyAbaxContractEventEnumLiteral<AnyAbaxContractEvent>>(
  api: ApiPromise,
  contract: AnyAbaxContract,
  eventName: string,
  cb: (event: TEvent, timestamp: number) => void,
) => {
  // @ts-ignore
  return api.query.system.events((events) => {
    try {
      for (const record of events) {
        const { event } = record;

        if (event.method === 'ContractEmitted') {
          const [address, data] = record.event.data;
          const signatureTopic = record.topics[0].toString();

          if (address.toString() === contract.address.toString()) {
            const eventDecoded =
              contract.abi.events[(contract.abi.json as any).spec.events.findIndex((e: any) => e.signature_topic === signatureTopic)]!.fromU8a(data);

            if (eventDecoded.event.identifier.toString() === eventName) {
              api.query.timestamp.now().then((timestamp) => {
                try {
                  // console.table({ eventName: eventDecoded.event.identifier.toString(), timestamp: timestamp.toString() });

                  const _event: Record<string, any> = {};
                  for (let i = 0; i < eventDecoded.args.length; i++) {
                    _event[eventDecoded.event.args[i].name] = eventDecoded.args[i].toJSON();
                  }

                  const eventParsed = handleEventReturn(
                    _event,
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    getEventTypeDescription(signatureTopic, require(`typechain/event-data/${contract.name}.json`)),
                  ) as TEvent;
                  const timestampParsed = parseInt(timestamp.toString());
                  cb(eventParsed, timestampParsed);
                } catch (e) {
                  console.error('Fatal error during processing events from api.query.system.events', 'api.query.timestamp.now', e);
                }
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Fatal error during processing events from api.query.system.events', e);
    }
  });
};

// export const subscribeOnEvents = async (
//   testEnv: TestEnv,
//   reserveName: string,
//   callback: (eventName: string, event: AnyAbaxContractEvent, emitingContract: AnyAbaxContract, timestamp: number) => void,
// ): Promise<VoidFn[]> => {
//   const api = await apiProviderWrapper.getAndWaitForReady();
//   await transferNoop();
//   const { tge, abaxToken } = testEnv;

//   const subscribePromises: Promise<any>[] = [];
//   const callbackDecorator = (eventName: string, emitingContract: AnyAbaxContract) => (event: AnyAbaxContractEvent, timestamp: number) => {
//     // console.log('callbackDecorator', { eventName, event, emitingContract, timestamp });
//     return callback(eventName, event, emitingContract, timestamp);
//   };

//   for (const event of Object.values(ContractsEvents.AbaxTgeEvent)) {
//     subscribePromises.push(subscribeOnEvent(tge, event, callbackDecorator(event, tge)));
//   }
//   for (const event of Object.values(ContractsEvents.Psp22EmitableEvent)) {
//     subscribePromises.push(subscribeOnEvent(abaxToken, event, callbackDecorator(event, abaxToken)));
//   }

//   return Promise.all(subscribePromises);
// };

export async function setBlockTimestamp(api: ApiPromise, timestamp: number) {
  const signer = getSigners()[0];
  if (process.env.DEBUG) console.log(`setting timestamp to: ${timestamp}`);
  await api.tx.timestamp.setTime(timestamp).signAndSend(signer, {});
  await transferNoop(api);
  const timestampNowPostChange = parseInt((await api.query.timestamp.now()).toString());
  if (timestampNowPostChange !== timestamp) throw new Error('Failed to set custom timestamp');
}
export async function increaseBlockTimestamp(api: ApiPromise, deltaTimestamp: number): Promise<number> {
  const timestampNow = await api.query.timestamp.now();
  const timestampToSet = parseInt(timestampNow.toString()) + deltaTimestamp;
  if (process.env.DEBUG) console.log(`increasing timestamp by ${deltaTimestamp}`);
  await setBlockTimestamp(api, timestampToSet);
  const timestampNowPostChange = parseInt((await api.query.timestamp.now()).toString());
  if (timestampNowPostChange !== timestampToSet) throw new Error('Failed to set custom timestamp');
  return timestampToSet;
}

/// makes an operation just to force new block production.
export async function transferNoop(api: ApiPromise) {
  const signer = getSigners()[0];
  await deployEmitableToken(api, signer, 'noop'); //TODO
  return;
  await new Promise((resolve, reject) => {
    api.tx.balances
      .transferKeepAlive(signer.address, 1)
      .signAndSend(signer, ({ status }) => {
        if (status.isInBlock) {
          resolve(status.asInBlock.toString());
        }
      })
      .catch((error: any) => {
        reject(error);
      });
  });
}
