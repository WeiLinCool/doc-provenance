/**
 * Enforce Agent Note lifecycle/class paths and dated filenames. Structural rules
 * are shared with `agent-note-tree.ts`; the closed classification rules live
 * in `.agents/notes/README.md`.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { agentNoteRootFor, walkAgentNoteTree } from './agent-note-tree.ts'
import { loadConfig } from './doc-config.ts'

const { baseDir } = loadConfig(process.argv.slice(2))
const { notes, errors, rootExists } = walkAgentNoteTree(agentNoteRootFor(baseDir))

// Keep the former homes unavailable so new notes cannot silently escape this tree.
for (const legacyRoot of ['docs/rfc', 'docs/rfcs']) {
  if (existsSync(resolve(import.meta.dirname, '..', legacyRoot))) {
    errors.push(`legacy-path: ${legacyRoot}/ is forbidden — put Agent Notes under .agents/notes/`)
  }
}

if (errors.length === 0) {
  const scope = rootExists
    ? `${notes.length} Agent Note(s) checked, structure consistent.`
    : 'no .agents/notes tree; nothing to check.'
  console.log('verify-agent-note-classification: ' + scope)
  process.exit(0)
}

console.error('verify-agent-note-classification: violations found:')
for (const e of errors) console.error(`  ${e}`)
process.exit(1)
