/**
 * verify-doc-headers.ts (dependency-free)
 * Enforce the document header contract in docs/doc-header.md: identity, type,
 * status, human ownership, provenance, evidence level, and freshness.
 *
 * Usage:
 *   node --experimental-strip-types scripts/verify-doc-headers.ts [--list] [--config <path>] [--today <YYYY-MM-DD>]
 *
 * --list reports every in-scope document without failing. --today pins the clock
 * so the freshness rules can be tested deterministically. Exit 0 when every
 * in-scope document conforms, 1 when any violates the contract.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { globToRegExp, isCounterpart, isExcluded, isMain, parseYaml, resolveGlob, walkFiles } from './doc-config.ts'

/** Evidence levels, weakest first. */
const LEVELS = ['E0', 'E1', 'E2', 'E3']
/** Document statuses. */
const STATUSES = ['draft', 'review', 'accepted', 'deprecated', 'superseded']
/** Provenance keys a source entry may use. */
const SOURCE_KEYS = ['issue', 'ticket', 'incident', 'adr', 'rfc', 'pr', 'commit', 'decision', 'doc', 'url']
/** Exactly one of these per evidence entry. */
const EVIDENCE_KINDS = ['path', 'test', 'command']
/** Optional companions on an evidence entry. */
const EVIDENCE_EXTRAS = ['commit', 'result']
/** The closed header schema. */
const SCALAR_FIELDS = ['id', 'type', 'status', 'owner', 'evidence_level', 'validated_at', 'reviewed_by', 'reviewed_at', 'superseded_by']
const LIST_FIELDS = ['source', 'evidence']
const KNOWN_FIELDS = [...SCALAR_FIELDS, ...LIST_FIELDS]

const ID_SHAPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\d{3}$/
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/
const HANDLE_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._@/-]*$/
const NON_HUMAN = /^(llm|ai|bot|agent|assistant|model|gpt[0-9]*|chatgpt|claude|codex|copilot|gemini|deepseek)([-_.].*)?$/i
const FENCE = '```'
const TICK = '`'

const DEFAULT_SCOPE = ['docs/**/*.md']
const DEFAULT_EXCLUSIONS = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/AGENTS.md', '.agents/notes']
const DEFAULT_TYPES = ['spec', 'subsystem', 'reference', 'architecture', 'runbook', 'postmortem']
const DEFAULT_MIN_LEVEL: Record<string, string> = { draft: 'E0', review: 'E1', accepted: 'E2', deprecated: 'E1', superseded: 'E1' }
const DEFAULT_TEST_GLOBS = [
  '**/*.test.ts', '**/*.test.tsx', '**/*.test.js', '**/*.test.mjs',
  '**/*.spec.ts', '**/*.spec.js',
  '**/*_test.go', '**/test_*.py', '**/*_test.py',
  '**/*Test.java', '**/*Tests.cs', '**/*_spec.rb',
]

type HeaderValue = string | string[] | Map<string, string>[]

interface HeaderParse {
  ok: boolean
  error: string
  fields: Map<string, HeaderValue>
  bodyStart: number
}

interface GateOptions {
  scopePatterns: string[]
  exclusions: string[]
  required: boolean
  allowedTypes: string[]
  minLevel: Record<string, string>
  requireReview: boolean
  checkDrift: boolean
  checkTests: boolean
  testGlobs: string[]
  maxAgeDays: number
  strict: boolean
  requireH1: boolean
  typeTiers: Record<string, string[]>
  tiers: { name: string; pattern: string }[]
  suffixes: string[]
}

interface Context {
  baseDir: string
  today: string
  options: GateOptions
  testIndex: string[] | null
  testContents: Map<string, string>
  gitWorkTree: boolean | null
  gitCommits: Map<string, boolean>
  drift: Map<string, string>
}

interface DocRecord {
  rel: string
  abs: string
  fields: Map<string, HeaderValue>
  id: string
  type: string
  status: string
  level: string
  validatedAt: string
  reviewedBy: string
  reviewedAt: string
  supersededBy: string
  sourceCount: number
  evidenceCount: number
  errors: string[]
}

function tick(value: string): string {
  return TICK + value + TICK
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const list = value.filter((item): item is string => typeof item === 'string' && item !== '')
  return list.length > 0 ? list : [...fallback]
}

function unquote(raw: string): string {
  const value = raw.trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

/** Parse the leading --- block into its fields; returns the first body line index. */
function parseHeaderBlock(content: string): HeaderParse {
  const lines = content.split('\n')
  const fields = new Map<string, HeaderValue>()
  const fail = (error: string): HeaderParse => ({ ok: false, error, fields, bodyStart: 0 })
  if ((lines[0] ?? '').trimEnd() !== '---') return fail('line 1 must be the --- header opener')
  let close = -1
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trimEnd() === '---') { close = i; break }
  }
  if (close < 0) return fail('the header block is never closed by a --- line')
  if (close === 1) return fail('the header block is empty')
  const block = lines.slice(1, close)

  let i = 0
  while (i < block.length) {
    const raw = block[i] ?? ''
    const text = raw.trim()
    if (text === '' || text.startsWith('#')) { i++; continue }
    if (raw.length - raw.trimStart().length !== 0) return fail('line ' + (i + 2) + ' is indented but belongs to no field')
    const head = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(text)
    if (head === null) return fail('line ' + (i + 2) + ' is not a key: value pair')
    const key = head[1] ?? ''
    const rest = (head[2] ?? '').trim()
    if (fields.has(key)) return fail('duplicate field ' + tick(key))
    if (rest !== '') {
      fields.set(key, rest.startsWith('[') ? rest.slice(1, -1).split(',').map(part => unquote(part)).filter(part => part !== '') : unquote(rest))
      i++
      continue
    }
    const items: Map<string, string>[] = []
    i++
    while (i < block.length) {
      const itemRaw = block[i] ?? ''
      const itemText = itemRaw.trim()
      if (itemText === '' || itemText.startsWith('#')) { i++; continue }
      if (itemRaw.length - itemRaw.trimStart().length === 0) break
      if (itemText.startsWith('- ')) {
        const pair = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.+)$/.exec(itemText.slice(2).trim())
        if (pair === null) return fail('line ' + (i + 2) + ': list items must read - key: value')
        const item = new Map<string, string>()
        item.set(pair[1] ?? '', unquote(pair[2] ?? ''))
        items.push(item)
        i++
        continue
      }
      const pair = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.+)$/.exec(itemText)
      const last = items[items.length - 1]
      if (pair === null || last === undefined) return fail('line ' + (i + 2) + ': expected a - key: value list item')
      if (last.has(pair[1] ?? '')) return fail('line ' + (i + 2) + ': duplicate key ' + tick(pair[1] ?? '') + ' in one list item')
      last.set(pair[1] ?? '', unquote(pair[2] ?? ''))
      i++
    }
    if (items.length === 0) return fail('field ' + tick(key) + ' has no value')
    fields.set(key, items)
  }
  return { ok: true, error: '', fields, bodyStart: close + 1 }
}

function entryList(value: HeaderValue | undefined): Map<string, string>[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every(entry => entry instanceof Map)) return null
  return value as Map<string, string>[]
}

function toPlain(value: HeaderValue | undefined): unknown {
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(entry => (entry instanceof Map ? Object.fromEntries(entry) : entry))
  return value
}

function serializeHeader(fields: Map<string, HeaderValue>): string {
  return [...fields.keys()].sort().map(key => key + '=' + JSON.stringify(toPlain(fields.get(key)))).join('\n')
}

function buildOptions(cfg: Record<string, unknown>): GateOptions {
  const gateConfig = isRecord(cfg.gate_config) ? cfg.gate_config : {}
  const gate = isRecord(gateConfig.verify_doc_headers) ? gateConfig.verify_doc_headers : {}
  const i18n = isRecord(cfg.i18n) ? cfg.i18n : {}
  const suffixMap = isRecord(i18n.suffix_map) ? i18n.suffix_map : {}
  const suffixes = i18n.enabled === true
    ? Object.values(suffixMap).filter((value): value is string => typeof value === 'string' && value !== '')
    : []
  const tiers = Array.isArray(cfg.tiers)
    ? cfg.tiers.filter(isRecord)
      .map(tier => ({ name: String(tier.name ?? ''), pattern: String(tier.pattern ?? '') }))
      .filter(tier => tier.name !== '' && tier.pattern !== '')
    : []
  const minLevel: Record<string, string> = { ...DEFAULT_MIN_LEVEL }
  if (isRecord(gate.min_level_by_status)) {
    for (const [status, level] of Object.entries(gate.min_level_by_status)) {
      if (typeof level === 'string' && LEVELS.includes(level)) minLevel[status] = level
    }
  }
  const typeTiers: Record<string, string[]> = {}
  if (isRecord(gate.type_tiers)) {
    for (const [type, names] of Object.entries(gate.type_tiers)) {
      if (Array.isArray(names)) typeTiers[type] = names.filter((name): name is string => typeof name === 'string')
    }
  }
  return {
    scopePatterns: stringList(gate.scope_patterns, DEFAULT_SCOPE),
    exclusions: stringList(gate.exclusions, DEFAULT_EXCLUSIONS),
    required: gate.required !== false,
    allowedTypes: stringList(gate.allowed_types, DEFAULT_TYPES),
    minLevel,
    requireReview: gate.require_review !== false,
    checkDrift: gate.check_drift !== false,
    checkTests: gate.check_tests !== false,
    testGlobs: stringList(gate.test_globs, DEFAULT_TEST_GLOBS),
    maxAgeDays: typeof gate.max_age_days === 'number' ? gate.max_age_days : 180,
    strict: gate.strict !== false,
    requireH1: gate.require_h1 !== false,
    typeTiers,
    tiers,
    suffixes,
  }
}

function localToday(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Whole days from value to today, or -1 for invalid or future dates. */
function dateAge(value: string, today: string): number {
  if (!isRealDate(value) || !isRealDate(today)) return -1
  const days = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(value + 'T00:00:00Z')) / 86400000)
  return days < 0 ? -1 : days
}

function levelRank(level: string): number {
  return LEVELS.indexOf(level)
}

function validateHandle(value: string, field: string, fail: (message: string) => void): void {
  if (!HANDLE_SHAPE.test(value)) {
    fail(field + ' ' + tick(value) + ' must be a handle or role (letters, digits, . _ @ / -)')
    return
  }
  if (NON_HUMAN.test(value)) {
    fail(field + ' ' + tick(value) + ' names a model or agent; name the human or team accountable for the document')
  }
}

function checkEvidencePath(context: Context, value: string): string {
  if (isAbsolute(value)) return 'must be repo-relative'
  const abs = resolve(context.baseDir, value)
  const rel = relative(context.baseDir, abs)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return 'must stay inside the repository'
  if (!existsSync(abs)) return 'does not exist'
  try {
    if (!statSync(abs).isFile()) return 'is not a file'
  } catch {
    return 'cannot be read'
  }
  return ''
}

function isWorkTree(context: Context): boolean {
  if (context.gitWorkTree !== null) return context.gitWorkTree
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: context.baseDir, encoding: 'utf8' })
  context.gitWorkTree = result.status === 0 && (result.stdout ?? '').trim() === 'true'
  return context.gitWorkTree
}

function commitExists(context: Context, commit: string): boolean {
  const cached = context.gitCommits.get(commit)
  if (cached !== undefined) return cached
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', commit + '^{commit}'], { cwd: context.baseDir, encoding: 'utf8' })
  const exists = result.status === 0
  context.gitCommits.set(commit, exists)
  return exists
}

/** clean | changed | unknown (git unavailable, no work tree, or unknown commit). */
function driftStatus(context: Context, commit: string, path: string): string {
  const key = commit + ' ' + path
  const cached = context.drift.get(key)
  if (cached !== undefined) return cached
  let status = 'unknown'
  if (isWorkTree(context) && commitExists(context, commit)) {
    const result = spawnSync('git', ['diff', '--quiet', commit, '--', path], { cwd: context.baseDir, encoding: 'utf8' })
    if (result.status === 0) status = 'clean'
    else if (result.status === 1) status = 'changed'
  }
  context.drift.set(key, status)
  return status
}

function indexTestFiles(context: Context): string[] {
  const patterns = context.options.testGlobs.map(globToRegExp)
  return walkFiles(context.baseDir, context.baseDir, [])
    .filter(rel => patterns.some(re => re.test(rel)))
}

function testExists(context: Context, name: string): boolean {
  if (context.testIndex === null) context.testIndex = indexTestFiles(context)
  const needle = name.trim()
  for (const rel of context.testIndex) {
    if (rel === needle || rel.endsWith('/' + needle)) return true
    let content = context.testContents.get(rel)
    if (content === undefined) {
      try { content = readFileSync(join(context.baseDir, rel), 'utf8') } catch { content = '' }
      context.testContents.set(rel, content)
    }
    if (content.includes(needle)) return true
  }
  return false
}

function validateBody(record: DocRecord, context: Context, lines: string[], bodyStart: number): void {
  const fail = (text: string): void => { record.errors.push(text) }
  if ((lines[bodyStart] ?? '') !== '') fail('the line after the closing --- must be blank')
  let first = bodyStart
  while (first < lines.length && (lines[first] ?? '').trim() === '') first++
  if (context.options.requireH1 && !/^#\s+\S/.test(lines[first] ?? '')) {
    fail('the body must open with a level-1 heading (# Title)')
  }
  let inFence = false
  let headings = 0
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.startsWith(FENCE)) { inFence = !inFence; continue }
    if (!inFence && /^#\s+\S/.test(line)) headings++
  }
  if (context.options.requireH1 && headings !== 1) {
    fail('the body must carry exactly one level-1 heading (found ' + headings + ')')
  }
}

function validateDoc(record: DocRecord, context: Context, lines: string[], bodyStart: number): void {
  const fields = record.fields
  const options = context.options
  const fail = (text: string): void => { record.errors.push(text) }

  for (const key of fields.keys()) {
    if (options.strict && !KNOWN_FIELDS.includes(key)) {
      fail('unknown header field ' + tick(key) + ' (known: ' + KNOWN_FIELDS.join(', ') + ')')
    }
  }

  const readScalar = (key: string, required: boolean): string => {
    if (!fields.has(key)) {
      if (required) fail('missing required field ' + tick(key))
      return ''
    }
    const value = fields.get(key)
    if (typeof value !== 'string' || value === '') {
      fail('field ' + tick(key) + ' must be a single non-empty value')
      return ''
    }
    return value
  }

  record.id = readScalar('id', true)
  record.type = readScalar('type', true)
  record.status = readScalar('status', true)
  const owner = readScalar('owner', true)
  record.level = readScalar('evidence_level', true)
  record.validatedAt = readScalar('validated_at', false)
  record.reviewedBy = readScalar('reviewed_by', false)
  record.reviewedAt = readScalar('reviewed_at', false)
  record.supersededBy = readScalar('superseded_by', false)

  if (record.id !== '') {
    if (!ID_SHAPE.test(record.id)) {
      fail('id ' + tick(record.id) + ' must read <type>-<slug>-<nnn> in lower case, e.g. spec-auth-001')
    } else {
      if (record.type !== '' && !record.id.startsWith(record.type + '-')) {
        fail('id ' + tick(record.id) + ' must start with the declared type ' + tick(record.type + '-'))
      }
      if (record.id.endsWith('-000')) fail('the id serial must be 001 or higher')
    }
  }
  if (record.type !== '' && !options.allowedTypes.includes(record.type)) {
    fail('unknown type ' + tick(record.type) + ' (allowed: ' + options.allowedTypes.join(', ') + ')')
  }
  if (record.status !== '' && !STATUSES.includes(record.status)) {
    fail('unknown status ' + tick(record.status) + ' (allowed: ' + STATUSES.join(', ') + ')')
  }
  if (owner !== '') validateHandle(owner, 'owner', fail)
  if (record.level !== '' && !LEVELS.includes(record.level)) {
    fail('unknown evidence_level ' + tick(record.level) + ' (allowed: ' + LEVELS.join(', ') + ')')
  }

  const errorsBeforeEvidence = record.errors.length
  const source = fields.get('source')
  if (source === undefined) {
    record.sourceCount = 0
  } else {
    const entries = entryList(source)
    if (entries === null) {
      fail('source must be a list of - key: value entries')
    } else {
      record.sourceCount = entries.length
      if (entries.length === 0) fail('source must not be empty; drop the field or name its provenance')
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index] as Map<string, string>
        const label = 'source[' + (index + 1) + ']'
        if (entry.size === 0) { fail(label + ' is empty'); continue }
        for (const key of entry.keys()) {
          if (!SOURCE_KEYS.includes(key)) fail(label + ' has unknown key ' + tick(key) + ' (allowed: ' + SOURCE_KEYS.join(', ') + ')')
        }
        for (const [key, value] of entry) {
          if (value.trim() === '') fail(label + ' ' + tick(key) + ' must not be empty')
        }
      }
    }
  }

  const evidence = fields.get('evidence')
  const verifiedPaths = new Set<string>()
  let verifiedBehaviour = false
  if (evidence === undefined) {
    record.evidenceCount = 0
  } else {
    const entries = entryList(evidence)
    if (entries === null) {
      fail('evidence must be a list of - path|test|command: <value> entries')
    } else {
      record.evidenceCount = entries.length
      if (entries.length === 0) fail('evidence must not be empty; drop the field or name its evidence')
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index] as Map<string, string>
        const label = 'evidence[' + (index + 1) + ']'
        for (const key of entry.keys()) {
          if (!EVIDENCE_KINDS.includes(key) && !EVIDENCE_EXTRAS.includes(key)) {
            fail(label + ' has unknown key ' + tick(key) + ' (allowed: ' + [...EVIDENCE_KINDS, ...EVIDENCE_EXTRAS].join(', ') + ')')
          }
        }
        const kinds = EVIDENCE_KINDS.filter(kind => entry.has(kind))
        if (kinds.length !== 1) {
          fail(label + ' must carry exactly one of ' + EVIDENCE_KINDS.join(', ') + ' (found ' + kinds.length + ')')
          continue
        }
        const kind = kinds[0] ?? ''
        const value = (entry.get(kind) ?? '').trim()
        if (value === '') { fail(label + ' ' + tick(kind) + ' must not be empty'); continue }
        if (entry.has('commit') && kind !== 'path') fail(label + ' commit is only valid on a path entry')
        if (kind === 'path') {
          const problem = checkEvidencePath(context, value)
          if (problem !== '') { fail(label + ' path ' + tick(value) + ' ' + problem); continue }
          verifiedPaths.add(value)
          const commit = (entry.get('commit') ?? '').trim()
          if (commit !== '' && options.checkDrift && driftStatus(context, commit, value) === 'changed') {
            fail(label + ' path ' + tick(value) + ' changed after commit ' + tick(commit) + '; re-verify the claim and bump validated_at')
          }
        } else if (kind === 'test') {
          if (options.checkTests && !testExists(context, value)) {
            fail(label + ' test ' + tick(value) + ' was not found under test_globs; name the test file or adjust gate_config.verify_doc_headers.test_globs')
          } else {
            verifiedBehaviour = true
          }
        } else {
          verifiedBehaviour = true
        }
      }
    }
  }

  const evidenceClean = record.errors.length === errorsBeforeEvidence
  const supported = record.sourceCount === 0 ? 'E0' : (verifiedBehaviour ? 'E3' : (verifiedPaths.size > 0 ? 'E2' : 'E1'))
  const declaredRank = levelRank(record.level)
  if (declaredRank >= 0 && STATUSES.includes(record.status)) {
    const floor = options.minLevel[record.status] ?? 'E0'
    if (declaredRank < levelRank(floor)) {
      fail('status ' + tick(record.status) + ' requires evidence_level ' + floor + ' or higher (declared ' + record.level + ')')
    }
  }
  if (declaredRank >= 0 && evidenceClean && declaredRank > levelRank(supported)) {
    fail('evidence_level ' + record.level + ' is not supported by the declared evidence; the strongest supported level is ' + supported + ' (see docs/doc-header.md)')
  }
  const needsProvenance = declaredRank > 0 || (STATUSES.includes(record.status) && record.status !== 'draft')
  if (record.sourceCount === 0 && needsProvenance) {
    fail('source is required from E1 up: name the issue, decision, or document this one rests on')
  }

  if (declaredRank >= 2 && record.validatedAt === '') {
    fail('validated_at is required at evidence level E2 and above (the date its evidence was last confirmed)')
  }
  const validatedAge = record.validatedAt === '' ? -1 : dateAge(record.validatedAt, context.today)
  if (record.validatedAt !== '') {
    if (validatedAge < 0) {
      fail('validated_at ' + tick(record.validatedAt) + ' must be a real YYYY-MM-DD date no later than today (' + context.today + ')')
    } else if (validatedAge > options.maxAgeDays && record.status !== 'deprecated' && record.status !== 'superseded') {
      fail('validated_at ' + tick(record.validatedAt) + ' is ' + validatedAge + ' days old (limit ' + options.maxAgeDays + '); re-verify the evidence and bump the date')
    }
  }

  if (record.reviewedBy !== '') validateHandle(record.reviewedBy, 'reviewed_by', fail)
  if ((record.reviewedBy === '') !== (record.reviewedAt === '')) {
    fail('reviewed_by and reviewed_at are a pair; set both or neither')
  }
  if (record.reviewedAt !== '') {
    const reviewedAge = dateAge(record.reviewedAt, context.today)
    if (reviewedAge < 0) {
      fail('reviewed_at ' + tick(record.reviewedAt) + ' must be a real YYYY-MM-DD date no later than today (' + context.today + ')')
    } else if (validatedAge >= 0 && reviewedAge > validatedAge) {
      fail('reviewed_at ' + tick(record.reviewedAt) + ' predates validated_at ' + tick(record.validatedAt) + '; review the current evidence before signing off')
    }
  }
  if (options.requireReview && record.status === 'accepted') {
    if (record.reviewedBy === '') fail('status accepted requires reviewed_by (a human reviewer other than the owner)')
    if (record.reviewedAt === '') fail('status accepted requires reviewed_at')
  }
  if (options.requireReview && record.reviewedBy !== '' && owner !== '' && record.reviewedBy === owner) {
    fail('reviewed_by must differ from owner; an accepted document needs a second pair of eyes')
  }

  if (STATUSES.includes(record.status)) {
    if (record.status === 'superseded' && record.supersededBy === '') fail('status superseded requires superseded_by: <id>')
    if (record.status !== 'superseded' && record.supersededBy !== '') fail('superseded_by is only valid with status superseded')
  }
  if (record.supersededBy !== '') {
    if (!ID_SHAPE.test(record.supersededBy)) fail('superseded_by ' + tick(record.supersededBy) + ' must be a document id')
    else if (record.supersededBy === record.id) fail('superseded_by must name a different document')
  }

  const tierNames = record.type === '' ? undefined : options.typeTiers[record.type]
  if (tierNames !== undefined && tierNames.length > 0) {
    const patterns = options.tiers.filter(tier => tierNames.includes(tier.name)).map(tier => tier.pattern)
    if (patterns.length === 0) {
      fail('type ' + tick(record.type) + ' maps to unknown tier(s) ' + tierNames.join(', ') + '; fix gate_config.verify_doc_headers.type_tiers')
    } else if (!patterns.some(pattern => globToRegExp(pattern).test(record.rel))) {
      fail('type ' + tick(record.type) + ' belongs to tier ' + tierNames.join('/') + ' (' + patterns.join(', ') + '); ' + record.rel + ' matches none of them')
    }
  }

  validateBody(record, context, lines, bodyStart)
}

function validateCrossDocument(records: Map<string, DocRecord>, all: string[], context: Context): string[] {
  const violations: string[] = []
  const byId = new Map<string, string>()
  for (const record of records.values()) {
    if (record.id === '') continue
    const first = byId.get(record.id)
    if (first === undefined) byId.set(record.id, record.rel)
    else violations.push(record.rel + ': id ' + tick(record.id) + ' is already used by ' + first)
  }
  for (const record of records.values()) {
    if (record.supersededBy === '' || !ID_SHAPE.test(record.supersededBy)) continue
    if (!byId.has(record.supersededBy)) {
      violations.push(record.rel + ': superseded_by ' + tick(record.supersededBy) + ' names no document id in scope; widen gate_config.verify_doc_headers.scope_patterns or fix the id')
    }
  }
  if (context.options.suffixes.length === 0) return violations
  for (const record of records.values()) {
    for (const suffix of context.options.suffixes) {
      const counterpart = record.rel.replace(/\.md$/, '') + suffix
      if (!all.includes(counterpart)) continue
      let parsed: HeaderParse
      try {
        parsed = parseHeaderBlock(readFileSync(join(context.baseDir, counterpart), 'utf8'))
      } catch {
        continue
      }
      if (!parsed.ok) { violations.push(counterpart + ': ' + parsed.error); continue }
      if (serializeHeader(parsed.fields) !== serializeHeader(record.fields)) {
        violations.push(counterpart + ': header must match ' + record.rel + ' exactly; machine metadata is not translated')
      }
    }
  }
  return violations
}

export function main(args: string[]): number {
  const listOnly = args.includes('--list')
  const configIndex = args.indexOf('--config')
  const configPath = configIndex >= 0 ? resolve(args[configIndex + 1] ?? '') : resolve('docs-constraint.yaml')
  const todayIndex = args.indexOf('--today')
  const today = todayIndex >= 0 ? (args[todayIndex + 1] ?? '') : localToday()
  if (!DATE_SHAPE.test(today) || !isRealDate(today)) {
    console.error('verify-doc-headers: --today expects a real YYYY-MM-DD date')
    return 1
  }
  if (!existsSync(configPath)) {
    console.error('Configuration not found: ' + configPath)
    return 1
  }
  const baseDir = dirname(configPath)
  let cfg: Record<string, unknown>
  try {
    cfg = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    console.error('verify-doc-headers: cannot read ' + configPath + ': ' + message(error))
    return 1
  }

  const options = buildOptions(cfg)
  const context: Context = {
    baseDir,
    today,
    options,
    testIndex: null,
    testContents: new Map(),
    gitWorkTree: null,
    gitCommits: new Map(),
    drift: new Map(),
  }

  const all: string[] = []
  const seen = new Set<string>()
  for (const pattern of options.scopePatterns) {
    for (const rel of resolveGlob(pattern, baseDir)) {
      if (!rel.endsWith('.md') || seen.has(rel)) continue
      seen.add(rel)
      if (isExcluded(rel, options.exclusions)) continue
      all.push(rel)
    }
  }
  all.sort()
  const sources = all.filter(rel => !isCounterpart(rel, options.suffixes))

  const violations: string[] = []
  const records = new Map<string, DocRecord>()
  const unheadered: string[] = []
  for (const rel of sources) {
    const abs = join(baseDir, rel)
    let content: string
    try {
      content = readFileSync(abs, 'utf8')
    } catch {
      violations.push(rel + ': unreadable markdown file')
      continue
    }
    if ((content.split('\n')[0] ?? '').trimEnd() !== '---') {
      if (options.required) violations.push(rel + ': missing the document header block (see docs/doc-header.md)')
      else unheadered.push(rel)
      continue
    }
    const parsed = parseHeaderBlock(content)
    if (!parsed.ok) {
      violations.push(rel + ': ' + parsed.error)
      continue
    }
    const record: DocRecord = {
      rel,
      abs,
      fields: parsed.fields,
      id: '',
      type: '',
      status: '',
      level: '',
      validatedAt: '',
      reviewedBy: '',
      reviewedAt: '',
      supersededBy: '',
      sourceCount: 0,
      evidenceCount: 0,
      errors: [],
    }
    validateDoc(record, context, content.split('\n'), parsed.bodyStart)
    for (const problem of record.errors) violations.push(rel + ': ' + problem)
    records.set(rel, record)
  }
  violations.push(...validateCrossDocument(records, all, context))

  if (listOnly) {
    const rows: string[] = []
    for (const record of [...records.values()].sort((left, right) => left.rel.localeCompare(right.rel))) {
      const state = record.errors.length === 0 ? 'ok' : 'FAIL'
      rows.push(state.padEnd(5) + (record.level || '-').padEnd(4) + (record.status || '-').padEnd(12) + (record.id || '-').padEnd(28) + record.rel)
    }
    for (const rel of unheadered) rows.push('SKIP ' + '-'.padEnd(4) + '-'.padEnd(12) + '-'.padEnd(28) + rel + ' (no header; required: false)')
    console.log(rows.length > 0 ? rows.join('\n') : 'no documents in scope')
    return 0
  }

  if (violations.length > 0) {
    console.error('verify-doc-headers failed:')
    for (const violation of violations) console.error('  ' + violation)
    console.error('')
    console.error('See docs/doc-header.md for the header contract.')
    return 1
  }

  if (records.size === 0) {
    console.log('verify-doc-headers: nothing to check — ' + (all.length > 0
      ? all.length + ' document(s) in scope carry no header (required: false).'
      : 'the configured scope matched no files.'))
    return 0
  }

  const counts: Record<string, number> = { E0: 0, E1: 0, E2: 0, E3: 0 }
  for (const record of records.values()) {
    if (LEVELS.includes(record.level)) counts[record.level] = (counts[record.level] ?? 0) + 1
  }
  console.log('verify-doc-headers: ' + records.size + ' document(s) checked; '
    + LEVELS.map(level => level + ':' + (counts[level] ?? 0)).join(' ') + '; all headers conform.')
  if (unheadered.length > 0) {
    console.log('verify-doc-headers: ' + unheadered.length + ' document(s) skipped without a header (required: false).')
  }
  return 0
}

if (isMain(import.meta)) {
  process.exitCode = main(process.argv.slice(2))
}
