<div align="center">
    <img src="./logo_black.png" alt="ink!" height="136" />
<h1 align="center">
    Abax Governance Smart Contracts
</h1>
This repository contains the source code of Abax Governance smart contracts as well as a set of comprehensive test suites.
</div>

# Project structure

- `src` - contains the source code of Abax Governance's contracts
- `tests` - contains e2e tests as well as utilities used for writing/running tests
- `scripts` - contains helpful scripts

## Contracts

## Overview

The repository's `src/contracts` folder contains the following contracts:

- `abax_token` - ABAX Token implementation compliant with PSP22 standard
- `abax_treasury` - Treasury contract that manages the treasury of the DAO
- `abax_tge` - Token Generation Event contract that manages the token generation event
- `governor` - Governor contract that manages the governance of the DAO, implements the voting mechanisms & manages ABAX token staking. It implements PSP22 standard & PSP22Vault trait for staking

The `pendzl` library was used to develop smart contracts - a library that provides implementations for PSP22, AccessControl, SetCodeHash and more used commonly in Abax projects. It is available at [https://github.com/pendzl/Pendzl](https://github.com/pendzl/Pendzl).

## File structure

Each contract follows a pattern with `lib.rs` file containing the smart contract definition/its entry point and modules folder containing the implementation of the contract's functionality as well as traits & storage definitions.
In all contracts AccessControl was used to manage the roles and permissions of the contracts.
Each contains a detailed inline documentation with a detailed description of the contract and its functionality.

The folder `test_purpose` contains contracts that were used for testing purposes only and are not part of the final implementation.

# Contracts build and deployment

## Prerequisites

- To build Abax Governance smart contracts without docker you need to have a prepared rust environment, with cargo-contract compatible with ink! 5.x .
  Follow official guides on how to set up/migrate to an environment that supports ink! 5.x:
- https://use.ink/faq/migrating-from-ink-3-to-4/#compatibility
- https://use.ink/faq/migrating-from-ink-4-to-5#how-to-upgrade
- https://use.ink/getting-started/setup

- To run tests and use convenience scripts you have to run the `pnpm`/`pnpm install` (or an adequate command for your npm package manager) command to install the required npm packages.

## Build

Run pnpm build:debug (for debug build) or pnpm build:release (for release build) to build the contracts.
Note: If you do not have docker installed change `verifiable` to false in `typechain.config.json`. Otherwise the build will fail.

# Tests

To run tests, execute the following command:

```bash
pnpm test
```

This will spin up a local node in background and run the tests.
The test log will be be stored to `substrate-contracts-node.testrun.log` file.

# Audits

The code was audited by [Kudelski Security](https://kudelskisecurity.com/) in June 2024. The audit is publicly available [here](./audits/Kudelski_Security_Abax_DAO_Secure_Code_Review_2.0.pdf)
