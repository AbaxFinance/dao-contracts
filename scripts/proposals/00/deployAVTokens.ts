import { getArgvObj } from '@abaxfinance/utils';
import { getApiProviderWrapper } from '@c-forge/polkahat-network-helpers';
import Keyring from '@polkadot/keyring';
import chalk from 'chalk';
import ATokenDeployer from 'typechain/deployers/a_token';
import BalanceViewerDeployer from 'typechain/deployers/balance_viewer';
import VTokenDeployer from 'typechain/deployers/v_token';

(async (args: Record<string, unknown>) => {
  if (require.main !== module) return;
  const wsEndpoint = process.env.WS_ENDPOINT;
  if (!wsEndpoint) throw 'could not determine wsEndpoint';
  const seed = process.env.SEED;
  if (!seed) throw 'could not determine seed';
  const api = await getApiProviderWrapper(wsEndpoint).getAndWaitForReady();

  const timestamp = await api.query.timestamp.now();
  console.log(new Date(parseInt(timestamp.toString())));

  const keyring = new Keyring();
  const signer = keyring.createFromUri(seed, {}, 'sr25519');

  // PREREQUISITES

  const aTokenContractDeploymentRes = await new ATokenDeployer(api, signer).new('Abacus Deposit Token', 'AToken', 0, signer.address, signer.address);
  const vTokenContractDeploymentRes = await new VTokenDeployer(api, signer).new('Abacus Debt Token', 'VToken', 0, signer.address, signer.address);

  const { codeHash: aTokenCodeHashHex } = (await api.query.contracts.contractInfoOf(aTokenContractDeploymentRes.contract.address)).toHuman() as {
    codeHash: string;
  };
  const { codeHash: vTokenCodeHashHex } = (await api.query.contracts.contractInfoOf(vTokenContractDeploymentRes.contract.address)).toHuman() as {
    codeHash: string;
  };

  console.log(`aToken code hash: ${aTokenCodeHashHex}`);
  console.log(`vToken code hash: ${vTokenCodeHashHex}`);

  console.log('aToken contract address:', aTokenContractDeploymentRes.contract.address.toString());
  console.log('vToken contract address:', vTokenContractDeploymentRes.contract.address.toString());

  process.exit(0);
})(getArgvObj()).catch((e) => {
  console.log(e);
  console.error(chalk.red(JSON.stringify(e, null, 2)));
  process.exit(1);
});

// aToken code hash: 0x5adc19dea0f4a33458d689bdec40124691060f14d72623fbfe2914955009bc92
// vToken code hash: 0xa1b063ed23d600a7ca37f6340acec08f7352dd8834a2b3c79013c05f73cb0622
// aToken contract address: 5H1tNTUCv2pz9s3ZxPaPY5V3YujR9j2yHMFHr4xvAZshY9HC
// vToken contract address: 5Dztoa5wjanSqeetNUMvSp8JFmQBHUqqH7XPq9BsWGWUHTUL
