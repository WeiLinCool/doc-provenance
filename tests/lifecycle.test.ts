/**
 * Lifecycle guards: every edge in the status graph is a condition the gate checks,
 * so every edge gets a test. Two of them look like exceptions — staleness exempting
 * deprecated/superseded, and a review that predates its own validation — and both
 * are ordinary guarded transitions once you try to take them.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

const spec = (dir: string): string => join(dir, 'docs', 'doc-header.md')

/** An installed repository whose freshness window is narrow enough to expire. */
function installed(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dprov-life-'))
  roots.push(dir)
  const r = spawnSync(process.execPath, [CLI, 'init', dir], { encoding: 'utf8' })
  assert.equal(r.status, 0, 'init must succeed: ' + ((r.stdout ?? '') + (r.stderr ?? '')))
  const cfg = join(dir, 'docs-constraint.yaml')
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace(/max_age_days: \d+/, 'max_age_days: 30'))
  return dir
}

/** Rewrite chosen header fields, dropping the ones the case must not carry. */
function setHeader(dir: string, fields: Record<string, string>, drop: string[] = []): void {
  const path = spec(dir)
  const lines = readFileSync(path, 'utf8').split('\n')
  const end = lines.indexOf('---', 1)
  let header = lines.slice(1, end).filter(line => !drop.some(key => line.startsWith(key + ':')))
  header = header.map(line => {
    for (const key of Object.keys(fields)) if (line.startsWith(key + ':')) return key + ': ' + fields[key]
    return line
  })
  for (const key of Object.keys(fields)) {
    if (!header.some(line => line.startsWith(key + ':'))) header.push(key + ': ' + fields[key])
  }
  writeFileSync(path, ['---', ...header, '---', ...lines.slice(end + 1)].join('\n'))
}

function audit(dir: string): { status: number; out: string } {
  const r = spawnSync(process.execPath, [CLI, 'audit', dir], { encoding: 'utf8' })
  return { status: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

test('a stale review document is rejected', () => {
  const dir = installed()
  setHeader(dir, { status: 'review', validated_at: '2020-01-01' }, ['reviewed_by', 'reviewed_at'])
  const result = audit(dir)
  assert.equal(result.status, 1, 'an expired review must fail')
  assert.match(result.out, /days old/)
})

test('the same stale date is allowed once deprecated', () => {
  const dir = installed()
  setHeader(dir, { status: 'deprecated', validated_at: '2020-01-01' }, ['reviewed_by', 'reviewed_at'])
  const result = audit(dir)
  assert.equal(result.status, 0, 'deprecated is exempt from freshness:\n' + result.out)
})

test('the same stale date is allowed once superseded', () => {
  const dir = installed()
  // superseded_by must name a real document id in scope, so give it one.
  // Pairing is on in the installed config, so the successor needs its triplet.
  const successor = [
    '---',
    'id: spec-successor-001',
    'type: spec',
    'status: review',
    'owner: wlz',
    'evidence_level: E2',
    'source:',
    '  - decision: the successor replaces the header spec',
    'evidence:',
    '  - path: docs-constraint.yaml',
    'validated_at: 2026-10-18',
    '---',
    '',
    '# Successor spec',
    '',
    'Placeholder document that supersedes the header spec in this fixture.',
    '',
  ].join('\n')
  writeFileSync(join(dir, 'docs', 'successor.md'), successor)
  writeFileSync(join(dir, 'docs', 'successor.zh.md'), successor
    .replace('# Successor spec', '# 后继规格')
    .replace('Placeholder document that supersedes the header spec in this fixture.', '占位文档，在本夹具中取代头部规格。'))
  const hash = (s: string): string => {
    const b = Buffer.from(s, 'utf8')
    return createHash('sha1').update('blob ' + b.byteLength + '\u0000').update(b).digest('hex')
  }
  writeFileSync(join(dir, 'docs', 'successor.i18n.yaml'), [
    'successor.md: ' + hash(successor),
    'successor.zh.md: ' + hash(successor.replace('# Successor spec', '# 后继规格').replace('Placeholder document that supersedes the header spec in this fixture.', '占位文档，在本夹具中取代头部规格。')),
    '',
  ].join('\n'))
  setHeader(dir, { status: 'superseded', validated_at: '2020-01-01', superseded_by: 'spec-successor-001' }, ['reviewed_by', 'reviewed_at'])
  const result = audit(dir)
  assert.equal(result.status, 0, 'superseded is exempt from freshness:\n' + result.out)
})

test('a review older than its validation is rejected', () => {
  const dir = installed()
  setHeader(dir, { status: 'accepted', validated_at: '2026-10-18', reviewed_by: 'reva', reviewed_at: '2026-01-01' })
  const result = audit(dir)
  assert.equal(result.status, 1, 'a review that predates its material must fail')
  assert.match(result.out, /predates validated_at/)
})

test('an accepted document cannot be its own reviewer', () => {
  const dir = installed()
  const owner = readFileSync(spec(dir), 'utf8').match(/^owner: (.+)$/m)?.[1] ?? ''
  setHeader(dir, { status: 'accepted', validated_at: '2026-10-18', reviewed_by: owner, reviewed_at: '2026-10-18' })
  const result = audit(dir)
  assert.equal(result.status, 1, 'self-approval must fail')
  assert.match(result.out, /must differ from owner/)
})

test('a well-formed accepted document passes', () => {
  const dir = installed()
  setHeader(dir, { status: 'accepted', validated_at: '2026-10-18', reviewed_by: 'reva', reviewed_at: '2026-10-18' })
  const result = audit(dir)
  assert.equal(result.status, 0, 'the accepting edge must be traversable:\n' + result.out)
})