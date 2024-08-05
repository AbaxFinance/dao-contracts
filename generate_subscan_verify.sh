#!/bin/bash

root_dir=$(pwd)


cargo_toml_locations=(
    "$root_dir/src/contracts/abax_inflator/Cargo.toml",
    "$root_dir/src/contracts/abax_tge/Cargo.toml",
    "$root_dir/src/contracts/abax_governor/Cargo.toml",
    "$root_dir/src/contracts/abax_token/Cargo.toml",
    "$root_dir/src/contracts/abax_treasury/Cargo.toml"
    "$root_dir/src/contracts/abax_vester/Cargo.toml"
)

for cargo_toml in "${cargo_toml_locations[@]}"
do
    cd $(dirname $cargo_toml)
    python3 "$root_dir/convert.py" --manifest Cargo.toml > subscan_verify.json
    cd $root_dir
done

