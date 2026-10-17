#!/usr/bin/env node
/**
 * Generate tests/sandbox/ by running `dprov init` for real.
 *
 *   node tests/tools/generate-sandbox.mjs
 *
 * This is the "look at it" half of `npm test`: the directory you can open, read,
 * and diff by hand. It is removed and rebuilt on every run, so it is never a
 * source of truth — tests/init-tree.txt is, and the assertions compare the two.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const REPO = resolve(import.meta.dirname, '..', '..')
const CLI = join(REPO, 'bin', 'dprov.js')
const SANDBOX = join(REPO, 'tests', 'sandbox')

/** Every file under a directory, as forward-slash relative paths, sorted. */
export function walkFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(base, full).split(sep).join('/')
    if (entry.isDirectory()) {
      out.push(rel + '/')
      walkFiles(full, base, out)
    } else {
      out.push(rel)
    }
  }
  return out.sort()
}

/** Rebuild the sandbox from scratch. Returns the installed file and directory list. */
export function generateSandbox() {
  if (existsSync(SANDBOX)) rmSync(SANDBOX, { recursive: true, force: true })
  mkdirSync(SANDBOX, { recursive: true })
  const result = spawnSync(process.execPath, [CLI, 'init', SANDBOX], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error('dprov init failed while generating the sandbox:\n' + result.stdout + result.stderr)
  }
  return walkFiles(SANDBOX)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const entries = generateSandbox()
  const files = entries.filter(e => !e.endsWith('/'))
  console.log('generated ' + SANDBOX)
  console.log('  ' + files.length + ' files, ' + (entries.length - files.length) + ' directories')
  console.log('  inspect it, then run `npm run test:gates` to verify the change')
}
