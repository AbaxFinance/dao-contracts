import { DEPLOYED_CONTRACTS_INFO_PATH, StoredContractInfo } from 'scripts/mainnetDeployment/10_deployContracts';
import { readFileSync } from 'fs-extra';

export const ABAX_TGE_ADDRESS = (JSON.parse(readFileSync(DEPLOYED_CONTRACTS_INFO_PATH, 'utf-8')) as StoredContractInfo[]).find(
  (contract) => contract.name === 'abax_tge',
)!.address;
