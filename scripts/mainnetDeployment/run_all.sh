#!/bin/bash
set -e 

# export WS_ENDPOINT="wss://ws.test.azero.dev"
export WS_ENDPOINT="wss://ws.azero.dev"

run_cmd() {
    echo "Running: $1"
    # filter output to not include CONTRACT: Unable to decode contract event: Unable to determine event
    eval $1 2>&1 | grep -v "CONTRACT: Unable to decode contract event: Unable to determine event"
}

echo "Running all scripts"
echo "WS_ENDPOINT: $WS_ENDPOINT"

echo "executing 10_deployContracts.ts"
run_cmd "npx tsx 10_deployContracts.ts"

echo "executing 20_initTGE.ts"
run_cmd "npx tsx 20_initTGE.ts"

echo "executing 21_setBonus.ts"
run_cmd "npx tsx 21_setBonus.ts"

echo "executing 22_distributeStakedrop.ts"
run_cmd "npx tsx 22_distributeStakedrop.ts"

echo "executing 23_registerReferrers.ts"
run_cmd "npx tsx 23_registerReferrers.ts"