/**
 * verify-doc-budgets.ts (dependency-free)
 * Enforce word-count ceilings from docs-constraint.yaml.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { isMain, loadConfig } from './doc-config.ts'

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '.next', '.cache', 'coverage'])

/**
 * Parse a constrained YAML subset into native JS values.
 */
function parseYaml(text: string): unknown {
  const lines = text.split('\n')

  const stripComment = (s: string): string => {
    let inDouble = false, inSingle = false
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (c === '"' && !inSingle) inDouble = !inDouble
      else if (c === "'" && !inDouble) inSingle = !inSingle
      else if (c === '#' && !inDouble && !inSingle) return s.slice(0, i)
    }
    return s
  }

  const parseScalar = (raw: string): unknown => {
    const v = raw.trim()
    if (v === '' || v === 'null' || v === '~') return null
    if (v === 'true') return true
    if (v === 'false') return false
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1)
    if (/^-?[0-9]+$/.test(v)) return parseInt(v, 10)
    if (/^-?[0-9]+\.[0-9]+$/.test(v)) return parseFloat(v)
    return v
  }

  const getIndent = (s: string): number => {
    let i = 0
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++
    return i
  }

  interface LineInfo { stripped: string; indent: number; trimmed: string }
  const processed: LineInfo[] = []
  for (const rawLine of lines) {
    const stripped = stripComment(rawLine)
    const trimmed = stripped.trim()
    processed.push({ stripped, indent: getIndent(stripped), trimmed })
  }

  // Look ahead to see if next non-empty line is a list item at greater indent
  const isNextLineList = (idx: number, currentIndent: number): boolean => {
    for (let j = idx + 1; j < processed.length; j++) {
      const next = processed[j]
      if (!next.trimmed || next.trimmed === '---') continue
      // Must be more indented and start with -
      return next.indent > currentIndent && next.trimmed.startsWith('- ')
    }
    return false
  }

  const root: Record<string, unknown> = {}

  interface Frame {
    type: 'map' | 'array'
    indent: number  // indent at which this frame's content lives
    target: Record<string, unknown> | unknown[]
  }
  const stack: Frame[] = [{ type: 'map', indent: -1, target: root }]

  for (let i = 0; i < processed.length; i++) {
    const { trimmed, indent } = processed[i]
    if (!trimmed || trimmed === '---') continue

    // A map frame holds children indented deeper than its owner key, so it stays
    // open for lines at its own indent; an array frame holds items at its own
    // indent, so only a lesser indent closes it.
    while (stack.length > 1) {
      const topFrame = stack[stack.length - 1]
      const closes = topFrame.type === 'array' ? indent < topFrame.indent : indent <= topFrame.indent
      if (closes) stack.pop()
      else break
    }

    const frame = stack[stack.length - 1]

    // List item
    if (trimmed.startsWith('- ')) {
      if (frame.type !== 'array') {
        throw new Error('List item outside array at line ' + (i + 1) + ': ' + trimmed)
      }

      const itemContent = trimmed.slice(2).trim()
      const colonIdx = itemContent.indexOf(':')
      const targetArr = frame.target as unknown[]

      if (colonIdx > 0) {
        // '- key: value' - map item in list
        const key = itemContent.slice(0, colonIdx).trim()
        const valPart = itemContent.slice(colonIdx + 1).trim()
        const itemObj: Record<string, unknown> = {}
        itemObj[key] = parseScalar(valPart)
        targetArr.push(itemObj)
        // Push for nested keys - use indent of this line
        stack.push({ type: 'map', indent, target: itemObj })
      } else if (itemContent.endsWith(':') || itemContent === '') {
        const itemObj: Record<string, unknown> = {}
        targetArr.push(itemObj)
        stack.push({ type: 'map', indent, target: itemObj })
      } else {
        // Scalar list item
        targetArr.push(parseScalar(itemContent))
      }
      continue
    }

    // Key: value
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim()
      const valPart = trimmed.slice(colonIdx + 1).trim()

      if (frame.type !== 'map') {
        throw new Error('Key-value inside array at line ' + (i + 1))
      }

      const targetMap = frame.target as Record<string, unknown>

      if (valPart === '' || valPart.startsWith('#')) {
        // Look ahead to determine type
        if (isNextLineList(i, indent)) {
          const arr: unknown[] = []
          targetMap[key] = arr
          // Use the indent of the list items, not the key
          const nextIndent = processed.slice(i + 1).find(l => l.trimmed && l.trimmed.startsWith('- '))?.indent ?? indent + 2
          stack.push({ type: 'array', indent: nextIndent, target: arr })
        } else {
          const newObj: Record<string, unknown> = {}
          targetMap[key] = newObj
          // Frame indent is the owner key's indent: children are deeper, siblings close it.
          stack.push({ type: 'map', indent, target: newObj })
        }
      } else if (valPart.startsWith('[')) {
        if (valPart === '[]') {
          targetMap[key] = []
        } else {
          const inner = valPart.slice(1, -1)
          targetMap[key] = inner.split(',').map(s => parseScalar(s.trim()))
        }
      } else if (valPart.startsWith('{')) {
        targetMap[key] = {}
      } else {
        targetMap[key] = parseScalar(valPart)
      }
      continue
    }
  }

  return root
}

function walkFiles(dir: string, base: string, out: string[]): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue
      walkFiles(full, base, out)
    } else if (st.isFile()) {
      out.push(relative(base, full).split('\\').join('/'))
    }
  }
  return out
}

function globToRegExp(pattern: string): RegExp {
  let re = '', i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*'; i += 2
        if (pattern[i] === '/') i++
      } else {
        re += '[^/]*'; i++
      }
    } else if (c === '?') {
      re += '[^/]'; i++
    } else if ('.+()[]{}^$|\\'.includes(c)) {
      re += '\\' + c; i++
    } else {
      re += c; i++
    }
  }
  return new RegExp('^' + re + '$')
}

function resolvePattern(pattern: string, baseDir: string): string[] {
  const all = walkFiles(baseDir, baseDir, [])
  const re = globToRegExp(pattern)
  return all.filter(f => re.test(f)).map(f => resolve(baseDir, f))
}

interface Tier { name: string; pattern: string; job: string; budget: number | null; required?: boolean }
interface GateConfig { verify_doc_budgets?: { headroom_percent?: number; fail_on_missing?: boolean } }
interface Config { tiers?: Tier[]; gate_config?: GateConfig }

export function main(args: string[]): number {
  const listOnly = args.includes('--list')
  const { path: configPath, baseDir, config } = loadConfig(args)

  if (!existsSync(configPath)) {
    console.error('Configuration not found: ' + configPath)
    return 1
  }

  const cfg = config as Config
  const headroomPercent = cfg.gate_config?.verify_doc_budgets?.headroom_percent ?? 5
  const failOnMissing = cfg.gate_config?.verify_doc_budgets?.fail_on_missing ?? true

  const failures: string[] = []
  const rows: string[] = []
  const tiers = cfg.tiers ?? []

  for (const tier of tiers) {
    const budget = tier.budget
    if (budget === null || budget === undefined) continue

    const files = resolvePattern(tier.pattern, baseDir)
    if (files.length === 0) {
      if (tier.required !== false && failOnMissing) {
        rows.push('MISS  ' + String(budget).padEnd(6) + ' ' + tier.pattern)
        failures.push(tier.name + ': no matching files (pattern: ' + tier.pattern + ')')
      } else {
        rows.push('MISS  ' + String(budget).padEnd(6) + ' ' + tier.pattern + ' (not required)')
      }
      continue
    }

    for (const file of files) {
      const words = readFileSync(file, 'utf8').split(/\s+/).filter(Boolean).length
      const status = words <= budget ? 'ok' : 'OVER'
      rows.push(status.padEnd(4) + ' ' + String(words).padStart(6) + ' / ' + String(budget).padEnd(6) + ' ' + file)
      if (words > budget) {
        const minTarget = Math.ceil(budget * (1 - headroomPercent / 100))
        failures.push(file + ': ' + words + ' words exceeds ' + budget + '-word ceiling; target <= ' + minTarget)
      }
    }
  }

  if (listOnly) {
    console.log(rows.join('\n'))
    return 0
  }
  if (failures.length > 0) {
    console.error('verify-doc-budgets failed:')
    for (const f of failures) console.error('  ' + f)
    console.error('\nSee docs/AGENTS.md for the documentation standard.')
    return 1
  }
  console.log('verify-doc-budgets: all budgeted docs within ceiling.')
  return 0
}

if (isMain(import.meta)) {
  process.exitCode = main(process.argv.slice(2))
}
