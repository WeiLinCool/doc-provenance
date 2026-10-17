/**
 * File-edit tests: after initialization, make one edit and assert which gate
 * notices and what it says. A test that only asserts a gate passes proves little;
 * these assert the failure and its stated cause.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const REPO = join(import.meta.dirname, '..')
const CLI = join(REPO, 'bin', 'dprov.js')
const roots: string[] = []

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/** An installed repository, ready to be edited. */
function installed(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dprov-edit-'))
  roots.push(dir)
  const r = spawnSync(process.execPath, [CLI, 'init', dir], { encoding: 'utf8' })
  assert.equal(r.status, 0, 'init must succeed: ' + ((r.stdout ?? '') + (r.stderr ?? '')))
  return dir
}

function audit(dir: string): { status: number; out: string } {
  const r = spawnSync(process.execPath, [CLI, 'audit', dir], { encoding: 'utf8' })
  return { status: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

const specPath = (dir: string): string => join(dir, 'docs', 'doc-header.md')

/** Rewrite a file in place with a single, targeted substitution. */
function edit(path: string, from: RegExp | string, to: string): void {
  const before = readFileSync(path, 'utf8')
  const after = before.replace(from as never, to as never)
  assert.notEqual(after, before, 'the edit must change the file: ' + String(from))
  writeFileSync(path, after)
}

test('a fresh installation is green before any edit', () => {
  const dir = installed()
  const result = audit(dir)
  assert.equal(result.status, 0, result.out)
})

test('breaking a relative link fails the link gate and names the file', () => {
  const dir = installed()
  edit(specPath(dir), /\]\(\.\.\/[^)]+\)/, '](../no-such-dir/gone.ts)')
  const result = audit(dir)
  assert.equal(result.status, 1, 'a broken link must fail the run')
  assert.match(result.out, /verify-md-links failed/)
  assert.match(result.out, /doc-header\.md/)
})

test('raising the evidence level past its evidence fails the header gate', () => {
  const dir = installed()
  // E3 requires a test or command entry; this document cites paths only.
  edit(specPath(dir), /^evidence_level: E\d$/m, 'evidence_level: E3')
  const result = audit(dir)
  assert.equal(result.status, 1, 'overstating the evidence must fail')
  assert.match(result.out, /verify-doc-headers failed/)
})

test('a future validated_at fails the header gate', () => {
  const dir = installed()
  edit(specPath(dir), /^validated_at: .*$/m, 'validated_at: 2999-01-01')
  const result = audit(dir)
  assert.equal(result.status, 1, 'a future validation date must fail')
  assert.match(result.out, /verify-doc-headers failed/)
})

test('an evidence path that does not exist fails the header gate', () => {
  const dir = installed()
  edit(specPath(dir), /^(  - path: ).*$/m, '$1does/not/exist.ts')
  const result = audit(dir)
  assert.equal(result.status, 1, 'a missing evidence path must fail')
  assert.match(result.out, /verify-doc-headers failed/)
})

test('an unpaired document fails the pairing gate', () => {
  const dir = installed()
  writeFileSync(join(dir, 'README.md'), '# Demo\n\nA demo repository.\n')
  const result = audit(dir)
  assert.equal(result.status, 1, 'a source without a counterpart must fail')
  assert.match(result.out, /missing counterpart/)
})
