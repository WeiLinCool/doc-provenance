/**
 * doc-config.ts (dependency-free)
 * Shared YAML-subset parsing and glob helpers for the doc gates. The reader is the
 * same constrained parser the budget and pairing gates carry inline; new gates
 * import it here instead of copying it a fourth time.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** Directories no gate ever walks into. */
export const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '.next', '.cache', 'coverage'])

/**
 * True when this module is the process entry point (works on Node >= 20.11).
 *
 * Compare canonical paths, not the strings Node happened to hand us. On macOS a
 * temp directory is reached as /tmp but resolved as /private/tmp, and Node reports
 * argv[1] in the caller's spelling while import.meta.filename is already resolved.
 * A plain string comparison then says "not main", the script exits 0 without
 * running anything, and the caller reads that as a passing gate — the exact
 * silent-green failure these gates exist to prevent.
 */
export function isMain(meta: ImportMeta): boolean {
  const argv1 = process.argv[1]
  if (argv1 === undefined) return false
  const canonical = (path: string): string => {
    try {
      return realpathSync(path)
    } catch {
      return resolve(path)
    }
  }
  return canonical(argv1) === canonical(meta.filename)
}

/**
 * Parse a constrained YAML subset into native JS values. Supports nested maps,
 * block lists, inline lists, quoted scalars, and comments; rejects everything else.
 */
export function parseYaml(text: string): unknown {
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

  const isNextLineList = (idx: number, currentIndent: number): boolean => {
    for (let j = idx + 1; j < processed.length; j++) {
      const next = processed[j]
      if (!next.trimmed || next.trimmed === '---') continue
      return next.indent > currentIndent && next.trimmed.startsWith('- ')
    }
    return false
  }

  const root: Record<string, unknown> = {}

  interface Frame {
    type: 'map' | 'array'
    indent: number
    target: Record<string, unknown> | unknown[]
  }
  const stack: Frame[] = [{ type: 'map', indent: -1, target: root }]

  for (let i = 0; i < processed.length; i++) {
    const { trimmed, indent } = processed[i]
    if (!trimmed || trimmed === '---') continue

    while (stack.length > 1) {
      const topFrame = stack[stack.length - 1]
      // A map frame holds children indented deeper than its owner key, so it stays
      // open for lines at its own indent; an array frame holds items at its own
      // indent, so only a lesser indent closes it.
      const closes = topFrame.type === 'array' ? indent < topFrame.indent : indent <= topFrame.indent
      if (closes) stack.pop()
      else break
    }

    const frame = stack[stack.length - 1]

    if (trimmed.startsWith('- ')) {
      if (frame.type !== 'array') {
        throw new Error('List item outside array at line ' + (i + 1) + ': ' + trimmed)
      }

      const itemContent = trimmed.slice(2).trim()
      const colonIdx = itemContent.indexOf(':')
      const targetArr = frame.target as unknown[]

      if (colonIdx > 0) {
        const key = itemContent.slice(0, colonIdx).trim()
        const valPart = itemContent.slice(colonIdx + 1).trim()
        const itemObj: Record<string, unknown> = {}
        itemObj[key] = parseScalar(valPart)
        targetArr.push(itemObj)
        stack.push({ type: 'map', indent, target: itemObj })
      } else if (itemContent.endsWith(':') || itemContent === '') {
        const itemObj: Record<string, unknown> = {}
        targetArr.push(itemObj)
        stack.push({ type: 'map', indent, target: itemObj })
      } else {
        targetArr.push(parseScalar(itemContent))
      }
      continue
    }

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim()
      const valPart = trimmed.slice(colonIdx + 1).trim()

      if (frame.type !== 'map') {
        throw new Error('Key-value inside array at line ' + (i + 1))
      }

      const targetMap = frame.target as Record<string, unknown>

      if (valPart === '' || valPart.startsWith('#')) {
        if (isNextLineList(i, indent)) {
          const arr: unknown[] = []
          targetMap[key] = arr
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

/** A dependency-free recursive walk returning repo-relative, /-separated paths. */
export function walkFiles(dir: string, base: string, out: string[]): string[] {
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

/** Translate a glob (** and * and ?) into an anchored regular expression. */
export function globToRegExp(pattern: string): RegExp {
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

/** Every existing file under baseDir matching one glob pattern. */
export function resolveGlob(pattern: string, baseDir: string): string[] {
  const all = walkFiles(baseDir, baseDir, [])
  const re = globToRegExp(pattern)
  return all.filter(f => re.test(f))
}

/** True when a repo-relative path is covered by one of the exclusion patterns. */
export function isExcluded(rel: string, exclusions: readonly string[]): boolean {
  return exclusions.some((pattern) => {
    const pat = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern
    if (pat.includes('*')) return globToRegExp(pat).test(rel)
    return rel === pat || rel.startsWith(pat + '/')
  })
}

/** A loaded `docs-constraint.yaml` plus the directory every relative path resolves against. */
export interface LoadedConfig {
  /** Absolute path of the config file that was read. */
  path: string
  /** Directory holding the config; every gate treats it as the repository root. */
  baseDir: string
  /** Parsed YAML, or an empty object when the file could not be read. */
  config: Record<string, unknown>
}

/**
 * Read `--config` out of a gate's arguments and load that file.
 *
 * Every gate derives the repository root the same way: the directory of the config it
 * was told to read. Deriving it from a script's own location instead is how
 * `agent-note-tree.ts` once resolved `.agents/skills/doc-constraint/.agents/notes`
 * and reported "no tree; nothing to check" while the real tree went unread — a gate
 * that is silently green is worse than one that fails.
 *
 * With no `--config`, the default is `docs-constraint.yaml` in the current directory,
 * which is how the gates have always behaved when run by hand from a repository root.
 */
export function loadConfig(args: readonly string[]): LoadedConfig {
  const index = args.indexOf('--config')
  const path = index >= 0 ? resolve(args[index + 1] ?? '') : resolve('docs-constraint.yaml')
  const baseDir = dirname(path)
  if (!existsSync(path)) return { path, baseDir, config: {} }
  try {
    const parsed = parseYaml(readFileSync(path, 'utf8'))
    return {
      path,
      baseDir,
      config: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {},
    }
  } catch {
    return { path, baseDir, config: {} }
  }
}

/** Narrow a parsed config value to a record without trusting its shape. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A string list from config, dropping anything that is not a string. */
export function stringList(value: unknown, fallback: readonly string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback]
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** True when a path is a translated counterpart (foo.zh.md) rather than a source doc. */
export function isCounterpart(rel: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => suffix !== '' && rel.endsWith(suffix))
}
