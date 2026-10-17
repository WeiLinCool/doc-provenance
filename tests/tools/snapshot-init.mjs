#!/usr/bin/env node
/**
 * Regenerate tests/init-tree.txt from a real `dprov init` run.
 *
 *   node tests/tools/snapshot-init.mjs
 *
 * Run this deliberately after an intended change to the installer, then review the
 * diff: an unexpected entry is the point of the snapshot, not noise.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

const REPO = resolve(import.meta.dirname, '..', '..')
const CLI = join(REPO, 'bin', 'dprov.js')
const OUT = join(REPO, 'tests', 'init-tree.txt')

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(base, full).split(sep).join('/')
    if (entry.isDirectory()) {
      out.push(rel + '/')
      walk(full, base, out)
    } else {
      out.push(rel)
    }
  }
  return out.sort()
}

const target = mkdtempSync(join(tmpdir(), 'dprov-snapshot-'))
try {
  const result = spawnSync(process.execPath, [CLI, 'init', target], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error(result.stdout + result.stderr)
    process.exit(1)
  }

  const entries = walk(target)
  const files = entries.filter(e => !e.endsWith('/'))
  const header = [
    '# What `dprov init` produces',
    '',
    'The golden tree: the exact structure a fresh installation must produce. Captured',
    'from a real run, never written by hand. `tests/init.test.ts` asserts against it, so',
    'an installer change that silently adds, drops, or moves a file fails here first.',
    '',
    'Directories end with a slash; every other line is a file. Regenerate after an',
    'intended change, then review the diff:',
    '',
    '```bash',
    'node tests/tools/snapshot-init.mjs   # rewrites this file',
    '```',
    '',
    '```text',
  ]
  const body = [...entries]
  const footer = ['```', '']
  writeFileSync(OUT, [...header, ...body, ...footer].join('\n'))
  console.log('wrote ' + OUT + ' (' + files.length + ' files, ' + (entries.length - files.length) + ' dirs)')
} finally {
  rmSync(target, { recursive: true, force: true })
}