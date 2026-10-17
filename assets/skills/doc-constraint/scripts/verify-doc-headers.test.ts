/**
 * Regression tests for verify-doc-headers.ts. Dependency-free: runs on the Node
 * built-in test runner.
 *
 *   node --experimental-strip-types --test scripts/verify-doc-headers.test.ts
 *
 * Every fixture is a throwaway repository in the OS temp directory; the clock is
 * pinned with --today so the freshness rules stay deterministic.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'

const GATE = join(import.meta.dirname, 'verify-doc-headers.ts')
const TODAY = '2026-10-17'
const roots: string[] = []

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

const CONFIG = [
  'schema: docs-constraint/v1',
  '',
  'tiers:',
  '  - name: subsystems',
  '    pattern: "docs/**/*.md"',
  '    job: "Type definitions and semantics"',
  '    budget: null',
  '',
  'i18n:',
  '  enabled: false',
  '',
  'gate_config:',
  '  verify_doc_headers:',
  '    scope_patterns:',
  '      - "docs/**/*.md"',
  '    exclusions:',
  '      - "docs/AGENTS.md"',
  '    allowed_types: [spec, reference]',
  '    type_tiers:',
  '      spec: [subsystems]',
  '      reference: [subsystems]',
  '    require_review: true',
  '    check_tests: true',
  '    check_drift: false',
  '    max_age_days: 180',
  '',
].join('\n')

const I18N_CONFIG = CONFIG.replace('  enabled: false', '  enabled: true\n  source_language: en\n  target_languages: [zh]\n  suffix_map:\n    zh: ".zh.md"')

const BASE: Record<string, string | string[]> = {
  id: 'spec-auth-001',
  type: 'spec',
  status: 'accepted',
  owner: 'wlz',
  evidence_level: 'E2',
  source: ['issue: AUTH-123'],
  evidence: ['path: scripts/gate.ts'],
  validated_at: '2026-10-01',
  reviewed_by: 'reva',
  reviewed_at: '2026-10-02',
}

/** Render one document whose body satisfies the required shape. */
function document(fields: Record<string, string | string[]>): string {
  const lines = ['---']
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      lines.push(key + ':')
      for (const item of value) lines.push('  - ' + item)
    } else {
      lines.push(key + ': ' + value)
    }
  }
  lines.push('---', '', '# Title', '', 'A body.')
  return lines.join('\n') + '\n'
}

function fixture(files: Record<string, string>, config = CONFIG): string {
  const root = mkdtempSync(join(tmpdir(), 'doc-headers-'))
  roots.push(root)
  const written: Record<string, string> = {
    'docs-constraint.yaml': config,
    'scripts/gate.ts': 'export const gate = true\n',
    'tests/auth.test.ts': 'test("authServiceTest", () => {})\n',
    ...files,
  }
  for (const [rel, content] of Object.entries(written)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  return root
}

function run(root: string, args: string[] = []): { code: number; output: string } {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', GATE, '--config', join(root, 'docs-constraint.yaml'), '--today', TODAY, ...args],
    { encoding: 'utf8' },
  )
  return { code: result.status ?? -1, output: (result.stdout ?? '') + (result.stderr ?? '') }
}

test('a conforming E2 document passes and is counted', () => {
  const result = run(fixture({ 'docs/auth.md': document(BASE) }))
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /1 document\(s\) checked; E0:0 E1:0 E2:1 E3:0/)
})

test('E3 is supported by a test that exists in the repository', () => {
  const fields = { ...BASE, status: 'review', evidence_level: 'E3', evidence: ['test: authServiceTest'] }
  delete (fields as Record<string, unknown>).reviewed_by
  delete (fields as Record<string, unknown>).reviewed_at
  const result = run(fixture({ 'docs/auth.md': document(fields) }))
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /E3:1/)
})

test('a draft may claim E0 with no source or evidence', () => {
  const fields = { id: 'spec-sketch-001', type: 'spec', status: 'draft', owner: 'wlz', evidence_level: 'E0' }
  const result = run(fixture({ 'docs/sketch.md': document(fields) }))
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /E0:1/)
})

test('a declared level the evidence cannot support is rejected', () => {
  const fields = { ...BASE, evidence_level: 'E3', evidence: ['path: scripts/gate.ts'] }
  const result = run(fixture({ 'docs/auth.md': document(fields) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /the strongest supported level is E2/)
})

test('a stale validated_at is rejected with its age', () => {
  const fields = { ...BASE, validated_at: '2026-01-01', reviewed_at: '2026-01-02' }
  const result = run(fixture({ 'docs/auth.md': document(fields) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /289 days old \(limit 180\)/)
})

test('a future validated_at is rejected', () => {
  const result = run(fixture({ 'docs/auth.md': document({ ...BASE, validated_at: '2026-12-01', reviewed_at: '2026-12-02' }) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /no later than today/)
})

test('an agent owner is rejected', () => {
  const result = run(fixture({ 'docs/auth.md': document({ ...BASE, owner: 'claude' }) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /names a model or agent/)
})

test('an evidence path that does not exist is rejected', () => {
  const result = run(fixture({ 'docs/auth.md': document({ ...BASE, evidence: ['path: src/missing.ts'] }) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /path \S+src\/missing\.ts\S+ does not exist/)
})

test('a test name the repository does not contain is rejected', () => {
  const fields = { ...BASE, status: 'review', evidence_level: 'E3', evidence: ['test: authServiceTestThatIsGone'] }
  delete (fields as Record<string, unknown>).reviewed_by
  delete (fields as Record<string, unknown>).reviewed_at
  const result = run(fixture({ 'docs/auth.md': document(fields) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /was not found under test_globs/)
})

test('duplicate ids across documents are rejected', () => {
  const result = run(fixture({
    'docs/auth.md': document(BASE),
    'docs/other.md': document({ ...BASE, evidence: ['path: tests/auth.test.ts'] }),
  }))
  assert.equal(result.code, 1)
  assert.match(result.output, /is already used by docs\/auth\.md/)
})

test('accepted requires a human reviewer other than the owner', () => {
  const noReview = { ...BASE }
  delete (noReview as Record<string, unknown>).reviewed_by
  delete (noReview as Record<string, unknown>).reviewed_at
  const missing = run(fixture({ 'docs/auth.md': document(noReview) }))
  assert.equal(missing.code, 1)
  assert.match(missing.output, /status accepted requires reviewed_by/)

  const selfReview = run(fixture({ 'docs/auth.md': document({ ...BASE, reviewed_by: 'wlz' }) }))
  assert.equal(selfReview.code, 1)
  assert.match(selfReview.output, /must differ from owner/)
})

test('a review that predates the last validation is rejected', () => {
  const result = run(fixture({ 'docs/auth.md': document({ ...BASE, validated_at: '2026-10-05', reviewed_at: '2026-10-02' }) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /predates validated_at/)
})

test('an id that does not start with its type is rejected', () => {
  const result = run(fixture({ 'docs/auth.md': document({ ...BASE, id: 'spec_auth_1' }) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /must read <type>-<slug>-<nnn>/)
})

test('an unknown header field is rejected while strict is on', () => {
  const result = run(fixture({ 'docs/auth.md': document({ ...BASE, confidence: 'high' }) }))
  assert.equal(result.code, 1)
  assert.match(result.output, /unknown header field/)
})

test('a body without exactly one level-1 heading is rejected', () => {
  const root = fixture({ 'docs/auth.md': document(BASE).replace('# Title\n\n', '') })
  const result = run(root)
  assert.equal(result.code, 1)
  assert.match(result.output, /level-1 heading/)
})

test('a missing header is fatal while required is true and skipped while false', () => {
  const files = { 'docs/auth.md': '# Title\n\nA body.\n' }
  const strict = run(fixture(files))
  assert.equal(strict.code, 1)
  assert.match(strict.output, /missing the document header block/)

  const lenient = run(fixture(files, CONFIG.replace('    max_age_days: 180', '    max_age_days: 180\n    required: false')))
  assert.equal(lenient.code, 0, lenient.output)
  assert.match(lenient.output, /carry no header \(required: false\)/)
})

test('a translated counterpart must repeat the source header exactly', () => {
  const files = {
    'docs/auth.md': document(BASE),
    'docs/auth.zh.md': document({ ...BASE, status: 'draft' }).replace('# Title', '# 标题'),
  }
  const result = run(fixture(files, I18N_CONFIG))
  assert.equal(result.code, 1)
  assert.match(result.output, /docs\/auth\.zh\.md: header must match docs\/auth\.md exactly/)
})

test('a type outside its declared tier is rejected', () => {
  const fields = { ...BASE, id: 'reference-auth-001', type: 'reference' }
  const result = run(fixture({ 'docs/auth.md': document(fields) }, CONFIG.replace('pattern: "docs/**/*.md"', 'pattern: "docs/reference/**/*.md"')))
  assert.equal(result.code, 1)
  assert.match(result.output, /matches none of them/)
})

test('the source vocabulary is closed and covers incident references', () => {
  const accepted = run(fixture({ 'docs/restore.md': document({ ...BASE, id: 'spec-restore-001', source: ['incident: INC-451'] }) }))
  assert.equal(accepted.code, 0, accepted.output)

  const rejected = run(fixture({ 'docs/auth.md': document({ ...BASE, source: ['vibes: it felt right'] }) }))
  assert.equal(rejected.code, 1)
  assert.match(rejected.output, /source\[1\] has unknown key/)
})

test('--list reports every document without failing', () => {
  const result = run(fixture({ 'docs/auth.md': document({ ...BASE, owner: 'gpt-5' }) }), ['--list'])
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /FAIL E2\s+accepted\s+spec-auth-001\s+docs\/auth\.md/)
})
