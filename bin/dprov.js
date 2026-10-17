#!/usr/bin/env node
// dprov CLI launcher (package: doc-provenance): run the TypeScript CLI directly via Node type stripping (Node >= 20.11).
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'app', 'cli', 'index.ts')
const result = spawnSync(process.execPath, ['--experimental-strip-types', cli, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
