import { AnyAbaxContractEvent } from 'typechain/events/enum';
import { AnyAbaxContract } from './misc';

export type ValidateEventParameters = { eventName: string; event: AnyAbaxContractEvent; sourceContract: AnyAbaxContract; timestamp: number };
