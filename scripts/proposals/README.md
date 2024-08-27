## README: Submitting a Proposal to Governor and Using `template.ts`

### Overview

This guide outlines the process of submitting a proposal to the Abax Governor. The process involves interacting with smart contracts, preparing transactions, and ensuring that proposals meet the necessary requirements before submission.

### Prerequisites

Before you begin, ensure you have the following:

- **Node.js** and **npm** installed. (version specified in .nvmrc)
- A valid **seed phrase** for signing transactions.

### Instructions

#### 2. **Install Dependencies**

Install the necessary dependencies using package manager (npm/pnpm)

#### 4. **Understanding `template.ts`**

The `template.ts` script is a template for creating and submitting proposals to the Governor contract. It fetches a proposal's metadata, creates transactions, and submits them to the blockchain.

Key sections of the script:

- **Fetching Proposal Metadata:** The script fetches the proposal description from a URL.
- **Creating Transactions:** Transactions are crafted based on the proposal and sent to the Governor contract.
- **Proposal Submission:** The script checks for sufficient votes and submits the proposal if all conditions are met.

#### 5. **Customizing Transactions**

Implement the `createTransactions` function in `template.ts` to define the specific transactions you want to include in your proposal:

```typescript
async function createTransactions(signer: KeyringPair, api: ApiPromise): Promise<Transaction[]> {
  // Example: Granting a role in the lending pool
  const lendingPool = new LendingPoolContract(LENDING_POOL_ADDRESS, signer, api);
  const message = lendingPool.abi.findMessage('AccessControl::grant_role');
  const params = paramsToInputNumbers(message.toU8a([0, INITIAL_POOL_CONFIG_PROPOSAL_ADDRESS]));

  return [
    {
      callee: lendingPool.address,
      selector: params.selector,
      input: params.data,
      transferredValue: 0,
    },
  ];
}

You might need to create a smart contract that will perform some actions. An example of such instance is available in `initial_pool_config_proposal` folder.
The example relies on governor to grant a role to the Proposal contract which then is able to perform actions on the Lending Pool contract - triggerable by anyone.

```

Replace the example with your specific transaction logic.

#### 6. **Run the Script**

Once you have customized the script, execute it with the required arguments:

```bash
WS_ENDPOINT="wss://ws.azero.dev" SEED="<seed phrase to use to submit transaction>" npx tsx <path_to_proposal_submission> <proposal-url>
```

Replace `<proposal-url>` with the URL where your proposal description is hosted.

#### 7. **Monitoring the Submission**

The script will output important information such as the proposal description hash, proposal ID, and any errors encountered during submission. Ensure you review the output for confirmation of a successful submission.

#### 8. **Handling Errors**

If the script encounters insufficient votes, it will log this and exit. You may need to acquire additional votes or adjust the proposal before resubmitting.

### Important Considerations

- **Security:** Always review the smart contract code and the generated transactions to ensure they perform as intended.
- **Governance Rules:** Ensure that your proposal aligns with the governance model and has the required support within the community before submission.
- **Environment:** Test the script in a development environment before deploying on the mainnet to avoid costly mistakes.

### Conclusion

By following this guide, you should be able to effectively submit governance proposals to the Abax protocol using `template.ts`. Customize the transactions to meet your specific needs and ensure that all prerequisites are in place before executing the script.
