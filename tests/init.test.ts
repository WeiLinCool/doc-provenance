/**
 * Initialization contract. `npm test` regenerates tests/sandbox/ by running
 * `dprov init` for real, so the tree asserted here is the same tree you can open
 * and read. The golden list lives in tests/init-tree.txt.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { generateSandbox, walkFiles } from './tools/generate-sandbox.mjs'

const REPO = join(import.meta.dirname, '..')
const CLI = join(REPO, 'bin', 'dprov.js')
const GOLDEN = join(REPO, 'tests', 'init-tree.txt')
const SANDBOX = join(REPO, 'tests', 'sandbox')

/**
 * The golden tree, parsed out of the fenced block in init-tree.txt. Directories are
 * listed with a trailing slash and everything else is a file path relative to the
 * installed root, so no indentation state has to be reconstructed.
 */
function goldenFiles(): string[] {
  const text = readFileSync(GOLDEN, 'utf8')
  const block = text.split('```text')[1]?.split('```')[0] ?? ''
  return block
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && line !== '.' && !line.endsWith('/'))
    .sort()
}

const installedFiles = (): string[] => walkFiles(SANDBOX).filter(entry => !entry.endsWith('/'))

test('the golden tree file is readable and non-trivial', () => {
  assert.ok(existsSync(GOLDEN), 'tests/init-tree.txt must exist')
  assert.ok(goldenFiles().length > 20, 'the golden tree should list the full install')
})

test('npm test regenerates tests/sandbox with a real init', () => {
  generateSandbox()
  assert.ok(existsSync(join(SANDBOX, 'docs-constraint.yaml')), 'the sandbox must be a real install')
})

test('the sandbox equals the golden tree', () => {
  assert.deepEqual(installedFiles(), goldenFiles(),
    'the installed tree drifted from tests/init-tree.txt; if the change is intended, ' +
    'rerun node tests/tools/snapshot-init.mjs and review the diff')
})

test('init vendors the runtime surface only', () => {
  const skill = join(SANDBOX, '.agents/skills/doc-constraint')
  assert.ok(existsSync(join(skill, 'scripts')), 'scripts/ must be vendored')
  assert.ok(existsSync(join(skill, 'references')), 'references/ must be vendored')
  for (const leak of ['templates', 'docs', 'node_modules']) {
    assert.ok(!existsSync(join(skill, leak)), leak + '/ must not be vendored')
  }
})

test('the installed docs link to paths that exist', () => {
  const spec = readFileSync(join(SANDBOX, 'docs/doc-header.md'), 'utf8')
  const links = [...spec.matchAll(/\]\((\.\.\/[^)\s]+)\)/g)].map(m => m[1] as string)
  assert.ok(links.length > 0, 'the header spec should link to its gate')
  for (const link of links) {
    assert.ok(existsSync(join(SANDBOX, 'docs', link)), 'installed link must resolve: ' + link)
  }
})

test('every enabled gate passes on the generated sandbox', () => {
  const gates = spawnSync(process.execPath, [CLI, 'audit', SANDBOX], { encoding: 'utf8' })
  assert.equal(gates.status, 0, 'a new installation must start green:\n' + (gates.stdout ?? '') + (gates.stderr ?? ''))
})

test('doctor reports a root AGENTS.md that drifted from the template', () => {
  const dir = join(SANDBOX)
  const local = join(dir, 'AGENTS.md')
  const original = readFileSync(local, 'utf8')
  try {
    writeFileSync(local, original + '\n- standing order added on one side only\n')
    const doctor = spawnSync(process.execPath, [CLI, 'doctor', dir], { encoding: 'utf8' })
    assert.equal(doctor.status, 1, 'a one-sided edit must be reported')
    assert.match((doctor.stdout ?? '') + (doctor.stderr ?? ''), /AGENTS\.md differs from the shipped template/)
  } finally {
    writeFileSync(local, original)
  }
})

test('doctor reports the sandbox clean', () => {
  const doctor = spawnSync(process.execPath, [CLI, 'doctor', SANDBOX], { encoding: 'utf8' })
  assert.equal(doctor.status, 0, (doctor.stdout ?? '') + (doctor.stderr ?? ''))
})
