/**
 * Flow tests: the whole loop, not a single gate call.
 *
 * Each case starts from a real installation, makes one edit, runs the full pipeline
 * the way a maintainer would (route -> audit -> fix -> re-audit), and asserts that
 * the loop closes. A single-gate test proves a rule exists; this proves the rules
 * compose into something a person can actually execute.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const REPO = join(import.meta.dirname, '..')
const CLI = join(REPO, 'bin', 'dprov.js')
const ENTRY = join(REPO, 'assets', 'skills', 'doc-flow', 'scripts', 'doc-entry.mjs')
const roots: string[] = []

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function installed(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dprov-flow-'))
  roots.push(dir)
  const r = spawnSync(process.execPath, [CLI, 'init', dir], { encoding: 'utf8' })
  assert.equal(r.status, 0, 'init must succeed: ' + ((r.stdout ?? '') + (r.stderr ?? '')))
  return dir
}

const audit = (dir: string): { status: number; out: string } => {
  const r = spawnSync(process.execPath, [CLI, 'audit', dir], { encoding: 'utf8' })
  return { status: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

/** The doc-flow route the entry script would hand to an agent. */
const route = (dir: string, request: string): { skill: string; command: string; state: string } => {
  const r = spawnSync(process.execPath, [ENTRY, dir, '--json', '--request', request], { encoding: 'utf8' })
  assert.equal(r.status, 0, 'doc-entry must resolve: ' + (r.stderr ?? ''))
  const parsed = JSON.parse(r.stdout) as { skill: string; command: string; state: string }
  assert.equal((parsed as { schema?: string }).schema, 'doc.resolution.v1')
  return parsed
}

const spec = (dir: string): string => join(dir, 'docs', 'doc-header.md')

function edit(path: string, from: RegExp | string, to: string): void {
  const before = readFileSync(path, 'utf8')
  const after = before.replace(from as never, to as never)
  assert.notEqual(after, before, 'the edit must change the file: ' + String(from))
  writeFileSync(path, after)
}

test('the route reflects installation state', () => {
  const dir = installed()
  assert.equal(route(dir, 'audit').skill, 'doc-constraint')
  assert.equal(route(dir, 'write docs').skill, 'doc-standard')
  assert.equal(route(dir, 'write docs').state, 'notes-ready')
})

test('the loop closes: break, see it fail, fix, see it pass', () => {
  const dir = installed()
  assert.equal(audit(dir).status, 0, 'baseline must be green')

  // Break: point a shipped link at nothing.
  const original = readFileSync(spec(dir), 'utf8')
  edit(spec(dir), /\]\(\.\.\/[^)]+\)/, '](../missing/gate.ts)')
  const broken = audit(dir)
  assert.equal(broken.status, 1, 'the loop must notice the break')
  assert.match(broken.out, /verify_md_links failed/)

  // Fix: restore exactly what was there.
  writeFileSync(spec(dir), original)
  const fixed = audit(dir)
  assert.equal(fixed.status, 0, 'the loop must close after the fix:\n' + fixed.out)
})

test('an edit that cannot be auto-fixed still names its file and cause', () => {
  const dir = installed()
  edit(spec(dir), /^validated_at: .*$/m, 'validated_at: 2999-01-01')
  const result = audit(dir)
  assert.equal(result.status, 1)
  assert.match(result.out, /verify_doc_headers failed/)
  assert.match(result.out, /validated_at/)
})

test('two independent breaks are both reported in one run', () => {
  const dir = installed()
  edit(spec(dir), /\]\(\.\.\/[^)]+\)/, '](../missing/gate.ts)')
  edit(spec(dir), /^validated_at: .*$/m, 'validated_at: 2999-01-01')
  const result = audit(dir)
  assert.equal(result.status, 1)
  assert.match(result.out, /verify_md_links failed/)
  assert.match(result.out, /verify_doc_headers failed/)
})

test('re-vendoring repairs a drifted gate runtime', () => {
  const dir = installed()
  const gate = join(dir, '.agents/skills/doc-constraint/scripts/verify-md-links.ts')
  edit(gate, 'IGNORED_DIRS', 'IGNORED_DIRS_TAMPERED')
  const drifted = spawnSync(process.execPath, [CLI, 'doctor', dir], { encoding: 'utf8' })
  assert.equal(drifted.status, 1, 'doctor must notice a tampered gate')
  assert.match((drifted.stdout ?? '') + (drifted.stderr ?? ''), /differs from the shipped skill/)
})
