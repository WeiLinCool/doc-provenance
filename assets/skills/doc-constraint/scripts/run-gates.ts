/**
 * run-gates.ts
 * Unified doc gate runner. Reads the enabled gates from docs-constraint.yaml and
 * runs every enabled one in order, collecting failures rather than stopping at the
 * first: a run that reports one problem at a time makes the reader fix, rerun, and
 * discover the next one, which is how a gate suite earns a reputation for being
 * annoying instead of useful. Self-contained and dependency-free: it shells out to
 * `node --experimental-strip-types` for the gate scripts, so no npm install beyond a
 * modern Node (>= 20.11) is needed.
 *
 * Usage:
 *   node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts [--config <path>]
 *
 * Exit 0 when all enabled gates pass; 1 when any fails or the config is invalid.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { isMain } from './doc-config.ts'

interface GateConfig {
  verify_doc_budgets?: boolean
  verify_doc_headers?: boolean
  verify_translation_pairing?: boolean
  verify_md_links?: boolean
  verify_agent_note_format?: boolean
  verify_agent_note_classification?: boolean
  verify_archived_agent_notes?: boolean
  [key: string]: boolean | undefined
}

/** The gate scripts this runner knows how to dispatch. */
const GATES: { key: string; script: string }[] = [
  { key: 'verify_doc_budgets', script: 'verify-doc-budgets.ts' },
  { key: 'verify_doc_headers', script: 'verify-doc-headers.ts' },
  { key: 'verify_md_links', script: 'verify-md-links.ts' },
  { key: 'verify_translation_pairing', script: 'verify-translation-pairing.ts' },
  { key: 'verify_agent_note_format', script: 'verify-agent-note-format.ts' },
  { key: 'verify_agent_note_classification', script: 'verify-agent-note-classification.ts' },
  { key: 'verify_archived_agent_notes', script: 'verify-archived-agent-notes.ts' },
]

/** Lightweight extraction of the `gates:` mapping from the YAML config. */
function readGates(configPath: string): GateConfig {
  const gates: GateConfig = {}
  if (!existsSync(configPath)) return gates
  const lines = readFileSync(configPath, 'utf8').split('\n')
  const indentOf = (l: string): number => l.length - l.trimStart().length
  let inGates = false
  let gatesIndent = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (!inGates) {
      if (trimmed === 'gates:') { inGates = true; gatesIndent = indentOf(line) }
      continue
    }
    // Inside the gates block: a line at the same indent as 'gates:' closes it.
    if (indentOf(line) <= gatesIndent) break
    const m = trimmed.match(/^(\w+):\s*([^#\s].*)?$/) || trimmed.match(/^(\w+):\s*$/)
    if (m) {
      const k = m[1]
      const v = (m[2] ?? '').trim()
      gates[k] = v === 'true'
    }
  }
  return gates
}

export function main(args: string[]): number {
  const configIndex = args.indexOf('--config')
  const configPath = configIndex >= 0 ? resolve(args[configIndex + 1]) : resolve('docs-constraint.yaml')
  const gates = readGates(configPath)
  const scriptDir = import.meta.dirname

  const pass: string[] = []
  const failures: string[] = []

  for (const gate of GATES) {
    if (gates[gate.key] !== true) continue
    const scriptPath = join(scriptDir, gate.script)
    if (!existsSync(scriptPath)) {
      failures.push(gate.key + ': script not found at ' + scriptPath)
      continue
    }
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', scriptPath, '--config', configPath],
      { encoding: 'utf8' },
    )
    const shown = (result.stdout ?? '').trim() || (result.stderr ?? '').trim()
    if (result.status === 0) {
      pass.push(gate.key)
      if (shown) console.log(shown)
    } else {
      const err = (result.stderr ?? '').trim() || (result.stdout ?? '').trim() || 'unknown error'
      failures.push(gate.key + ' failed:\n' + err)
    }
  }

  if (failures.length > 0) {
    console.error('run-gates failed:')
    for (const f of failures) console.error('  ' + f)
    return 1
  }

  console.log('run-gates: ' + pass.length + ' gate(s) passed.')
  return 0
}

if (isMain(import.meta)) {
  process.exitCode = main(process.argv.slice(2))
}
