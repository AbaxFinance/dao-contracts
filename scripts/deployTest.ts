import { deployAndConfigureSystem } from 'tests/setup/deploymentHelpers';
import path from 'path';
import { getArgvObj } from '@abaxfinance/utils';
import chalk from 'chalk';
import { apiProviderWrapper } from 'tests/setup/helpers';
import { storeTimestamp } from 'tests/setup/nodePersistence';
import { increaseBlockTimestamp, transferNoop } from 'tests/misc';

(async (args: Record<string, string>) => {
  if (require.main !== module) return;
  const outputJsonFolder = args['path'] ?? process.env.PWD;
  if (!outputJsonFolder) throw 'could not determine path';
  const api = await apiProviderWrapper.getAndWaitForReady();
  const deployPath = path.join(outputJsonFolder, 'deployedContracts.json');

  // to force mining first block and initializeing timestamp
  await transferNoop();
  // to force using fake_time
  await increaseBlockTimestamp(0);
  await deployAndConfigureSystem({}, deployPath);
  await storeTimestamp();
  api.disconnect();
  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});
