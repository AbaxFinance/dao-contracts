import type { Abi } from '@polkadot/api-contract';
import type { ContractCallOutcome } from '@polkadot/api-contract/types';
import type { ApiDecoration } from '@polkadot/api/types';
import type { ContractExecResult } from '@polkadot/types/interfaces';
import { firstValueFrom, map } from 'rxjs';
import { convertWeight } from 'wookashwackomytest-polkahat-chai-matchers';
import { _genValidGasLimitAndValue } from 'wookashwackomytest-typechain-types';
export async function queryAt<T>(
  apiAt: ApiDecoration<'promise'>,
  contract: any,
  asAddress: string,
  messageLabel: string,
  ...args: any[]
): Promise<T> {
  const message = (contract.contractAbi as Abi).findMessage(messageLabel);
  const encoded = message.toU8a([...args]);
  const observable = apiAt.rx.call.contractsApi
    .call<ContractExecResult>(
      asAddress,
      contract.address,
      0,
      (await _genValidGasLimitAndValue(contract.nativeAPI)).gasLimit!,
      null, //storageDepositLimit
      encoded,
    )
    .pipe(
      map(
        ({ debugMessage, gasConsumed, gasRequired, result, storageDeposit }): ContractCallOutcome => ({
          debugMessage,
          gasConsumed,
          gasRequired: gasRequired && !convertWeight(gasRequired).v1Weight.isZero() ? gasRequired : gasConsumed,
          output:
            result.isOk && message.returnType
              ? (contract.contractAbi as Abi).registry.createTypeUnsafe(
                  message.returnType.lookupName || message.returnType.type,
                  [result.asOk.data.toU8a(true)],
                  {
                    isPedantic: true,
                  },
                )
              : null,
          result,
          storageDeposit,
        }),
      ),
    );
  const queryRes = await firstValueFrom(observable);
  if ((queryRes.output as any).isOk) {
    return (queryRes.output as any).asOk as T;
  }

  throw new Error(`queryAt failed ${queryRes.debugMessage}`);
}
