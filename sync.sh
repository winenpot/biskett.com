#!/usr/bin/env bash
# Sync the deployable parts of the repo to the server (atpg SSH alias). Run from repo root
# after `pnpm build`. The Figma export and tooling stay local (the image does not use them).
set -euo pipefail
pnpm -s build
rsync -az --delete --progress \
    --exclude='.git' --exclude='node_modules' --exclude='data/' --exclude='graphify-out/' \
    --exclude='figma/' --exclude='.hermes/' --exclude='.env' \
    ./ atpg:~/biskett.com/
