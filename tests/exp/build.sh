#!/bin/sh
# builds the DOM harness bundle -> /tmp/exp_bundle.js (needs esbuild; react / react-dom from NODE_PATH when node_modules is absent)
set -e
cd "$(dirname "$0")/../.."
ESB=./node_modules/.bin/esbuild; [ -x "$ESB" ] || ESB=/opt/npm-tools/node_modules/.bin/esbuild
NODE_PATH=${NODE_PATH:-/opt/npm-tools/node_modules} $ESB tests/exp/entry.tsx --bundle --format=iife --jsx=automatic --tsconfig=tsconfig.json \
  --alias:zustand=./tests/exp/zustand.ts --alias:lenis=./tests/exp/lenis.ts --define:process.env.NODE_ENV='"development"' \
  --loader:.css=empty --outfile=/tmp/exp_bundle.js --log-level=error
echo built /tmp/exp_bundle.js
