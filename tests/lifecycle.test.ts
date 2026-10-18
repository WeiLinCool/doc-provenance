/**
 * Lifecycle guards: every edge in the status graph is a condition the gate checks,
 * so every edge gets a test. Two of them look like exceptions — staleness exempting
 * deprecated/superseded, and a review that predates its own validation — and both
 * are ordinary guarded transitions once you try to take them.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/**
 * Agent Notes are in pairing scope, so a decision record cannot be English-only.
 * The glob reaches {lifecycle}/{class}/file.md only: the tree's own instruction
 * files stay single-language, and a one-sided edit is reported as such.
 */
const note = (dir: string): string => {
  const classDir = join(dir, '.agents', 'notes', 'implemented', 'process')
  mkdirSync(classDir, { recursive: true })
  return join(classDir, '2026-10-18-pairing-scope.md')
}

/** The sidecar hash the pairing gate records: a git blob SHA-1 of the UTF-8 bytes. */
const hash = (content: string): string => {
  const bytes = Buffer.from(content, 'utf8')
  return createHash('sha1').update('blob ' + bytes.byteLength + '\u0000').update(bytes).digest('hex')
}

const noteText = (title: string, body: string): string =>
  ['# Agent Note: ' + title, '', 'Status: implemented', '', 'English | [中文](2026-10-18-pairing-scope.zh.md)', '', '## Problem', '', body, '', '## Decision', '', 'Decided.', '', '## Consequences', '', 'Nothing breaks.', '', '## Alternatives considered', '', '- **Do nothing.** Rejected: the gap stays.', ''].join('\n')

test('an Agent Note without a Chinese counterpart is rejected', () => {
  const dir = installed()
  writeFileSync(note(dir), noteText('Pairing scope', 'A decision recorded in English only.'))
  const result = audit(dir)
  assert.equal(result.status, 1, 'a single-language Agent Note must fail pairing')
  assert.match(result.out, /missing counterpart/)
})

test('the notes instruction files are outside the pairing scope', () => {
  const dir = installed()
  assert.equal(audit(dir).status, 0, 'README.md and AGENTS.md under .agents/notes must not pair')
})

test('a complete Agent Note triplet passes and a one-sided edit is reported', () => {
  const dir = installed()
  const source = noteText('Pairing scope', 'A decision recorded in both languages.')
  const counterpart = source
    .replace('# Agent Note: Pairing scope', '# Agent Note: 配对范围')
    .replace('A decision recorded in both languages.', '一个用两种语言记录的决策。')
    .replace('## Problem', '## 问题')
    .replace('Decided.', '已决定。')
    .replace('## Decision', '## 决策')
    .replace('Nothing breaks.', '没有破坏。')
    .replace('## Consequences', '## 后果')
    .replace('- **Do nothing.** Rejected: the gap stays.', '- **什么都不做。** 否决：缺口会一直存在。')
    .replace('## Alternatives considered', '## 考虑过的替代方案')
  writeFileSync(note(dir), source)
  writeFileSync(note(dir).replace(/\.md$/, '.zh.md'), counterpart)
  writeFileSync(note(dir).replace(/\.md$/, '.i18n.yaml'), [
    '2026-10-18-pairing-scope.md: ' + hash(source),
    '2026-10-18-pairing-scope.zh.md: ' + hash(counterpart),
    '',
  ].join('\n'))
  assert.equal(audit(dir).status, 0, 'a complete triplet must pass:\n' + audit(dir).out)

  writeFileSync(note(dir), source.replace('A decision recorded in both languages.', 'A decision edited on one side.'))
  const result = audit(dir)
  assert.equal(result.status, 1, 'a one-sided edit must be reported')
  assert.match(result.out, /edited since the pair was recorded/)
})

/**
 * The archive gate seals content, so the two ways it can go wrong are letting an
 * unsealed file in and letting a sealed file change. Both must be red; the empty
 * archive a fresh install ships must be green.
 */
const archivedNote = (dir: string): string => {
  const classDir = join(dir, '.agents', 'notes', 'archived', 'process')
  mkdirSync(classDir, { recursive: true })
  return join(classDir, '2026-10-18-frozen-decision.md')
}

const seal = (dir: string): { status: number; out: string } => {
  const r = spawnSync(process.execPath, [
    join(dir, '.agents', 'skills', 'doc-constraint', 'scripts', 'verify-archived-agent-notes.ts'),
    '--write',
    // The runner always names the config; without it a gate falls back to the current
    // directory and would seal this repository's archive instead of the fixture's.
    '--config', join(dir, 'docs-constraint.yaml'),
  ], { encoding: 'utf8' })
  return { status: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

const archivedText = (title: string, switcher: string): string =>
  ['# Agent Note: ' + title, '', 'Status: implemented', 'Archived: 2026-10-18', '', switcher, '', '## Problem', '', 'Frozen.', '', '## Decision', '', 'Decided.', '', '## Consequences', '', 'Nothing breaks.', '', '## Alternatives considered', '', '- **Keep it active.** Rejected: it is done.', ''].join('\n')

test('a fresh install archives nothing and the archive gate is green', () => {
  const dir = installed()
  const result = audit(dir)
  assert.equal(result.status, 0, 'an empty archive must not fail the gate:\n' + result.out)
})

test('an archived triplet must be sealed before it passes', () => {
  const dir = installed()
  const source = archivedText('Frozen decision', 'English | [中文](2026-10-18-frozen-decision.zh.md)')
  const counterpart = archivedText('已冻结的决策', '[English](2026-10-18-frozen-decision.md) | 中文')
    .replace('Frozen.', '已冻结。')
    .replace('## Problem', '## 问题')
    .replace('Decided.', '已决定。')
    .replace('## Decision', '## 决策')
    .replace('Nothing breaks.', '没有破坏。')
    .replace('## Consequences', '## 后果')
    .replace('- **Keep it active.** Rejected: it is done.', '- **保持活跃。** 否决：它已经完成。')
    .replace('## Alternatives considered', '## 考虑过的替代方案')
  writeFileSync(archivedNote(dir), source)
  writeFileSync(archivedNote(dir).replace(/\.md$/, '.zh.md'), counterpart)
  writeFileSync(archivedNote(dir).replace(/\.md$/, '.i18n.yaml'), [
    '2026-10-18-frozen-decision.md: ' + hash(source),
    '2026-10-18-frozen-decision.zh.md: ' + hash(counterpart),
    '',
  ].join('\n'))

  const unsealed = audit(dir)
  assert.equal(unsealed.status, 1, 'an unsealed archived artifact must fail')
  assert.match(unsealed.out, /not sealed in manifest\.json/)

  const sealed = seal(dir)
  assert.equal(sealed.status, 0, 'sealing must succeed:\n' + sealed.out)
  const afterSeal = audit(dir)
  assert.equal(afterSeal.status, 0, 'a sealed archive must pass:\n' + afterSeal.out)

  writeFileSync(archivedNote(dir), source.replace('Frozen.', 'Edited after sealing.'))
  const tampered = audit(dir)
  assert.equal(tampered.status, 1, 'editing a sealed artifact must fail')
  assert.match(tampered.out, /sealed content hash changed/)
})

/**
 * Re-recording is the step every paired edit owes. The gate performs it, so it must
 * never guess: a structurally divergent pair stays a failure even under --write.
 */
const record = (dir: string): { status: number; out: string } => {
  const r = spawnSync(process.execPath, [
    join(dir, '.agents', 'skills', 'doc-constraint', 'scripts', 'verify-translation-pairing.ts'),
    '--config', join(dir, 'docs-constraint.yaml'),
    '--write',
  ], { encoding: 'utf8' })
  return { status: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

test('--write re-records an edited pair instead of requiring hand-made hashes', () => {
  const dir = installed()
  writeFileSync(note(dir), noteText('Pairing scope', 'A decision recorded in both languages.'))
  writeFileSync(note(dir).replace(/\.md$/, '.zh.md'), noteText('配对范围', '一个用两种语言记录的决策。'))
  const first = record(dir)
  assert.equal(first.status, 0, 'recording a complete pair must succeed:\n' + first.out)
  assert.equal(audit(dir).status, 0, 'the recorded pair must pass')

  writeFileSync(note(dir), noteText('Pairing scope', 'A decision recorded in both languages, revised.'))
  assert.equal(audit(dir).status, 1, 'the edit must be visible before re-recording')
  assert.equal(record(dir).status, 0, 're-recording must succeed')
  assert.equal(audit(dir).status, 0, 'the re-recorded pair must pass')
})

test('--write refuses to record a pair whose structures diverge', () => {
  const dir = installed()
  writeFileSync(note(dir), noteText('Pairing scope', 'A decision recorded in both languages.'))
  writeFileSync(note(dir).replace(/\.md$/, '.zh.md'),
    noteText('配对范围', '一个用两种语言记录的决策。') + '\n## 额外章节\n\n结构不同。\n')
  const result = record(dir)
  assert.equal(result.status, 1, 'a structural mismatch must stay a failure')
  assert.match(result.out, /structures diverge/)
})

/**
 * A gate must read the repository its config names. Deriving the root from the
 * script's own location is how the note gates once reported "no tree; nothing to
 * check" while a real tree sat one directory away — a silent pass over nothing.
 */
test('note gates read the repository the config names, not their own', () => {
  const dir = installed()
  const classDir = join(dir, '.agents', 'notes', 'implemented', 'process')
  mkdirSync(classDir, { recursive: true })
  writeFileSync(join(classDir, '2026-10-18-broken.md'), '# not an Agent Note\n')

  const gate = join(dir, '.agents', 'skills', 'doc-constraint', 'scripts', 'verify-agent-note-format.ts')
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types', gate,
    '--config', join(dir, 'docs-constraint.yaml'),
  ], { encoding: 'utf8', cwd: REPO })
  const out = (result.stdout ?? '') + (result.stderr ?? '')
  assert.equal(result.status, 1, 'the broken note in the named repository must be found:\n' + out)
  assert.match(out, /2026-10-18-broken\.md/)
})



