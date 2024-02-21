import util from 'node:util';
import fs, { copy } from 'fs-extra';
import chalk from 'chalk';
import { exec, spawn } from 'child_process';
import path from 'path';
import glob from 'glob';

export const getLineSeparator = () => '='.repeat(process.stdout.columns ?? 60);
export const execPromise = util.promisify(exec);

export const createFileWithDirectoriesSync = (filePath: string, data: string) => {
  fs.ensureFileSync(filePath);
  fs.writeFileSync(filePath, data);
};

export const compileContract = async (contractPath: string) => {
  const command = 'cargo';
  const args = ['contract', 'build', ...(process.env.BUILD_PROD ? ['--release'] : [])];
  console.log(getLineSeparator());
  console.log(chalk.bgGreen(`running ${command} ${args.join(' ')}...`));
  console.log(getLineSeparator());

  return new Promise<number>((resolve, reject) => {
    const process = spawn(command, args, { cwd: contractPath, stdio: 'inherit' });
    process.stdout?.on('data', (data) => {
      console.log(data);
    });
    process.stderr?.on('data', (data) => {
      console.log(data);
    });
    process.on('exit', function (code) {
      if (code === null || code === 0) resolve(code ?? 0);
      reject(code);
    });
    process.on('error', function (err) {
      reject(err);
    });
  });
};

function copyArtifactsInternal(compileOutputPath: string, contractName: string, artifactsOutputPath: string) {
  fs.ensureDirSync(artifactsOutputPath);
  fs.copyFileSync(path.join(compileOutputPath, `${contractName}.contract`), path.join(artifactsOutputPath, `${contractName}.contract`));
  fs.copyFileSync(path.join(compileOutputPath, `${contractName}.wasm`), path.join(artifactsOutputPath, `${contractName}.wasm`));
  fs.copyFileSync(path.join(compileOutputPath, `${contractName}.json`), path.join(artifactsOutputPath, `${contractName}.json`));
}

export const copyArtifacts = (contractName: string, contractFolderPath: string) => {
  const contractNameSanitized = contractName.replace(/-/g, '_');
  const workspaceArtifactsCompileOutputPath = path.join('src', 'target', 'ink', contractNameSanitized);
  const localArtifactsCompileOutputPath = path.join(contractFolderPath, 'target', 'ink');
  const artifactsOutputPath = path.join('artifacts');
  console.log('Copying artifacts...');
  try {
    copyArtifactsInternal(localArtifactsCompileOutputPath, contractNameSanitized, artifactsOutputPath);
  } catch (_) {
    console.log('copying from local failed, trying from workspace');
    try {
      copyArtifactsInternal(workspaceArtifactsCompileOutputPath, contractNameSanitized, artifactsOutputPath);
    } catch (e) {
      console.error('Failed to copy artifacts');
      throw e;
    }
  }
};

const getContractsFolderPath = (contractsRootPath: string, contractName: string) => {
  const paths = glob.sync(`${contractsRootPath}/**/Cargo.toml`);
  for (const p of paths) {
    const data = fs.readFileSync(p);
    if (data.includes(`[package]\nname = "${contractName}"`)) {
      console.log(`Found contract ${contractName}!`);
      return path.dirname(p);
    }
  }
  throw new Error(`Contract ${contractName} not found`);
};

export const compileContractByNameAndCopyArtifacts = async (contractsRootPath: string, contractName: string) => {
  const contractFolderPath = getContractsFolderPath(contractsRootPath, contractName);
  console.log(getLineSeparator());
  console.log(chalk.bgGreen(`compiling contract ${contractName} from ${contractFolderPath}...`));
  console.log(getLineSeparator());
  try {
    await compileContract(contractFolderPath);
  } catch (e) {
    console.error(`Contract ${contractName} failed to compile`);
    throw e;
  }
  copyArtifacts(contractName, contractFolderPath);
};
