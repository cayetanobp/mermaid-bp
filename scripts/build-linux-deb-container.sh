#!/usr/bin/env bash
set -euo pipefail

npm ci
npm ci --prefix desktop-app
npm run desktop:build
shopt -s nullglob
target_dir="${CARGO_TARGET_DIR:-desktop-app/src-tauri/target}"
packages=("$target_dir"/release/bundle/deb/mermaid-bp_*_amd64.deb)
[ "${#packages[@]}" -eq 1 ] || { echo "Expected one amd64 Debian package" >&2; exit 1; }
dpkg-deb --info "${packages[0]}"
output_dir=desktop-app/src-tauri/target/linux-bundle/deb
mkdir -p "$output_dir"
cp "${packages[0]}" "$output_dir/"
printf '%s\n' "$output_dir/$(basename "${packages[0]}")"
