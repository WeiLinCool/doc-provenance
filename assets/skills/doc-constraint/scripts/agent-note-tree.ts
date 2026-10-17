/**
 * Shared structural source of truth for the Agent Note tree. Lifecycle and class
 * sets are closed under `.agents/notes/README.md`; importing this module is pure.
 */

import { existsSync, globSync, readdirSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

/**
 * Locate the target repository's `.agents/notes` tree.
 *
 * The gates do not live at the repository root: inside an installed repo they run
 * from `.agents/skills/doc-constraint/scripts/`, and in a source checkout they can
 * live anywhere. Deriving the tree from this file's own location therefore pointed
 * at `.../doc-constraint/.agents/notes`, so every Agent Note gate silently reported
 * "no tree; nothing to check" while the real tree went unread.
 *
 * Walk up from the script until a directory containing `.agents/notes` is found.
 * That is the repository root by construction, because the installer always creates
 * the notes tree beside `docs-constraint.yaml`.
 */
function findRepoRoot(): string {
  let dir = import.meta.dirname
  for (;;) {
    if (existsSync(resolve(dir, '.agents', 'notes'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return import.meta.dirname
    dir = parent
  }
}

export const agentNoteRoot = resolve(findRepoRoot(), '.agents', 'notes')

/** The closed set of active Agent Note lifecycles (top-level folders under .agents/notes/). */
const AGENT_NOTE_LIFECYCLES = ['proposed', 'implemented', 'rejected'] as const

/**
 * The closed set of Agent Note classes (nested folder under each lifecycle). Adding a
 * class is a deliberate act: extend this list AND the README's Classification
 * section. The gate rejects any folder not listed here.
 */
export const AGENT_NOTE_CLASSES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'] as const

/** Historical implemented notes live outside the active lifecycle tree. */
const AGENT_NOTE_ARCHIVE = 'archived'

/** Non-Agent Note Markdown allowed to sit directly at a lifecycle root. */
const ROOT_ALLOWLIST = new Set(['AGENTS.md', 'CLAUDE.md'])

/** One Agent Note file, as discovered by the walker. */
export interface AgentNote {
  lifecycle: string
  /** Path relative to .agents/notes. */
  rel: string
  /** `yyyy-mm-dd` from the filename. */
  date: string
}

/**
 * Walk the Agent Note tree, enforcing the structure rules. Returns every valid Agent Note
 * plus one error string per violation (unknown lifecycle or class folder, bad
 * depth, or bad filename). Callers treat a non-empty error list as fatal.
 */
export function walkAgentNoteTree(): { notes: AgentNote[]; errors: string[]; rootExists: boolean } {
  const notes: AgentNote[] = []
  const errors: string[] = []
  // A repository that has not adopted Agent Notes yet has no tree at all; that is
  // not a violation, the gates simply have nothing to check.
  if (!existsSync(agentNoteRoot)) return { notes, errors, rootExists: false }
  // The lifecycle set is closed too: any directory under .agents/notes/ that is not
  // a known lifecycle would otherwise hold Agent Notes invisible to the walk below.
  for (const entry of readdirSync(agentNoteRoot, { withFileTypes: true })) {
    if (entry.name === 'INDEX.md') {
      errors.push('structure: INDEX.md — centralized Agent Note indexes are forbidden; browse the lifecycle/class tree or search the repository')
      continue
    }
    if (entry.isDirectory()
      && entry.name !== AGENT_NOTE_ARCHIVE
      && !(AGENT_NOTE_LIFECYCLES as readonly string[]).includes(entry.name)) {
      errors.push(`structure: ${entry.name}/ — unknown lifecycle folder (allowed: ${AGENT_NOTE_LIFECYCLES.join(', ')}, plus ${AGENT_NOTE_ARCHIVE}/)`)
    }
  }
  for (const lifecycle of AGENT_NOTE_LIFECYCLES) {
    for (const match of globSync(`${lifecycle}/**/*.md`, { cwd: agentNoteRoot }).map(path => path.split(sep).join('/')).sort()) {
      const segs = match.split('/')
      // Allowlisted file directly at the lifecycle root (e.g. implemented/AGENTS.md).
      if (segs.length === 2 && ROOT_ALLOWLIST.has(segs[1] ?? '')) continue
      // A Chinese counterpart (foo.zh.md, docs/i18n/README.md) is the SAME Agent Note,
      // indexed via its English filename; the pairing gate owns its consistency.
      if (match.endsWith('.zh.md')) continue
      const cls = segs[1]
      const base = segs[2]
      if (segs.length !== 3 || cls === undefined || base === undefined) {
        errors.push(`structure: ${match} — expected {lifecycle}/{class}/file.md (got depth ${segs.length})`)
        continue
      }
      if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(cls)) {
        errors.push(`structure: ${match} — unknown class folder "${cls}" (allowed: ${AGENT_NOTE_CLASSES.join(', ')})`)
        continue
      }
      if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(base)) {
        errors.push(`structure: ${match} — filename must be yyyy-mm-dd-topic.md`)
        continue
      }
      notes.push({ lifecycle, rel: match, date: base.slice(0, 10) })
    }
  }
  return { notes, errors, rootExists: true }
}
