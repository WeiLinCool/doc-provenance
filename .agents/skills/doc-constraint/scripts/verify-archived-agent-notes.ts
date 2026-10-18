/** Verify and append-seal the frozen Agent Note archive. */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AGENT_NOTE_CLASSES, agentNoteRootFor } from './agent-note-tree.ts'
import { loadConfig } from './doc-config.ts'
import {
  extendArchiveManifest,
  parseArchiveManifest,
  renderArchiveManifest,
  validateArchiveArtifacts,
  validateArchiveManifestExtension,
  type ArchiveManifest,
} from './archived-agent-notes.ts'

// --config names the repository being audited. run-gates.ts passes it to every gate,
// so rejecting it turns a passing gate into a usage error; ignoring its value makes
// the gate seal whichever repository the process happens to run in.
const argv = process.argv.slice(2)
const configIndex = argv.indexOf('--config')
const configPath = configIndex >= 0 ? resolve(argv[configIndex + 1] ?? '') : resolve('docs-constraint.yaml')
const args = argv.filter((arg, index, all) => arg !== '--config' && all[index - 1] !== '--config')
const writeMode = args.length === 1 && args[0] === '--write'
if (args.length > 0 && !writeMode) {
  console.error('verify-archived-agent-notes: usage: node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-archived-agent-notes.ts [--write]')
  process.exit(1)
}

const agentNoteRoot = agentNoteRootFor(loadConfig(['--config', configPath]).baseDir)
const archiveRoot = resolve(agentNoteRoot, 'archived')
const manifestPath = resolve(archiveRoot, 'manifest.json')
const repoRoot = resolve(agentNoteRoot, '../..')
const manifestRepoPath = '.agents/notes/archived/manifest.json'
/** The baseline commit this archive last verified at; absent means "never bootstrapped". */
const stampRepoPath = '.agents/notes/archived/baseline'
const errors: string[] = []
const allowedRootFiles = new Set(['AGENTS.md', 'manifest.json', 'baseline'])

if (!existsSync(agentNoteRoot)) {
  console.log('verify-archived-agent-notes: no .agents/notes tree; nothing to check.')
  process.exit(0)
}
const kinds = new Set<string>()

// A fresh install archives nothing yet. With no manifest and no artifacts there is
// nothing to verify, and the tree's only requirement (archived/AGENTS.md) is created
// by init; requiring a manifest there would fail every new repository on its first run.
if (!writeMode && !existsSync(manifestPath)) {
  const sealed = readdirSync(archiveRoot, { withFileTypes: true })
    .some(entry => entry.isDirectory())
  if (!sealed) {
    console.log('verify-archived-agent-notes: no archived Agent Notes; nothing to check.')
    process.exit(0)
  }
}

if (!existsSync(resolve(archiveRoot, 'AGENTS.md'))) errors.push('archived/AGENTS.md is required')
const artifacts = new Map<string, Buffer>()
for (const entry of readdirSync(archiveRoot, { withFileTypes: true })) {
  if (entry.isFile()) {
    if (!allowedRootFiles.has(entry.name)) errors.push(`archived/${entry.name}: unexpected root file`)
    continue
  }
  if (!entry.isDirectory()) {
    errors.push(`archived/${entry.name}: only regular files and kind directories are allowed`)
    continue
  }
  if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(entry.name)) {
    errors.push(`archived/${entry.name}/: unknown Agent Note kind`)
    continue
  }
  kinds.add(entry.name)
  for (const child of readdirSync(resolve(archiveRoot, entry.name), { withFileTypes: true })) {
    const rel = `${entry.name}/${child.name}`
    if (!child.isFile()) {
      errors.push(`${rel}: archived kind directories contain regular files only`)
      continue
    }
    artifacts.set(rel, readFileSync(resolve(archiveRoot, rel)))
  }
}
// No "all kind directories must exist" rule: an empty directory cannot survive git,
// so a fresh clone of a repository that archived only one class would fail a rule it
// never broke. A kind directory that does exist is still checked against the closed
// class set above.
errors.push(...validateArchiveArtifacts(artifacts))

function runGit(args: string[]): string {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git exited with status ${result.status}`)
  return result.stdout
}

/** Whether a commit exists at all, as opposed to merely lacking the manifest. */
function commitExists(ref: string): boolean {
  try {
    runGit(['cat-file', '-e', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

function readRepoFile(ref: string, path: string): string | null {
  const entry = runGit(['ls-tree', '--name-only', ref, '--', path]).trim()
  return entry === '' ? null : runGit(['show', `${ref}:${path}`])
}

function readBaselineManifest(ref: string): ArchiveManifest {
  const rendered = readRepoFile(ref, manifestRepoPath)
  return rendered === null ? { version: 1, files: {} } : parseArchiveManifest(rendered)
}

let manifest: ArchiveManifest = { version: 1, files: {} }
if (existsSync(manifestPath)) {
  try {
    manifest = parseArchiveManifest(readFileSync(manifestPath, 'utf8'))
  } catch (error: unknown) {
    errors.push(`archived/manifest.json: ${error instanceof Error ? error.message : String(error)}`)
  }
} else if (!writeMode && artifacts.size > 0) {
  errors.push('archived/manifest.json is required; seal new artifacts with `node --experimental-strip-types .agents/skills/doc-constraint/scripts/verify-archived-agent-notes.ts --write`')
}

// The append-only rule needs a trusted "before". CI supplies it as the pre-change
// commit; locally it is the bootstrap stamp. Two states are ordinary setup rather
// than tampering, and both used to fail with a message that described neither:
//
//   - no commit yet (a working tree, or a directory copy): nothing has been sealed
//     against anything, and the manifest-vs-files check below still holds;
//   - no stamp (an archive that predates the stamp, or one just unsealed by --write):
//     the next commit picks it up.
//
// A configured baseline that cannot be read is still an error: that is a broken CI
// wiring, not a missing history.
const baselineRef = process.env.DSH_ARCHIVE_BASE_REF
let baseline: ArchiveManifest | null = null
if (baselineRef !== undefined) {
  try {
    baseline = readBaselineManifest(baselineRef)
  } catch (error: unknown) {
    errors.push(`archived/manifest.json: cannot read the configured baseline ${JSON.stringify(baselineRef)}: ${error instanceof Error ? error.message : String(error)}`)
  }
} else if (commitExists('HEAD')) {
  // Prefer the stamp: it pins the commit that first carried the current seal, so a
  // manifest entry deleted in a later commit is still caught. Without one, fall back
  // to HEAD's manifest — weaker (HEAD already contains the deletion) but free, and it
  // still catches a seal that was never committed.
  let baselineRefLocal: string | null = null
  try {
    const stamp = readRepoFile('HEAD', stampRepoPath)?.trim()
    if (stamp !== undefined && stamp !== null && stamp !== '') baselineRefLocal = stamp
  } catch {
    // A stamp naming a commit that no longer resolves (shallow clone, rebase) falls
    // through to HEAD below.
  }
  try {
    baseline = readBaselineManifest(baselineRefLocal ?? 'HEAD')
  } catch {
    // An unreadable HEAD manifest leaves no baseline; the manifest check below still applies.
  }
}
if (baseline !== null) errors.push(...validateArchiveManifestExtension(baseline, manifest))

const extended = extendArchiveManifest(manifest, artifacts)
errors.push(...extended.errors)
if (!writeMode) {
  for (const path of extended.added) errors.push(`${path}: archived artifact is not sealed in manifest.json`)
}

if (errors.length > 0) {
  console.error('verify-archived-agent-notes: archive rules violated:')
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

if (writeMode) {
  const rendered = renderArchiveManifest(extended.files)
  if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== rendered) {
    writeFileSync(manifestPath, rendered)
  }
  // The stamp records a commit that already carries this seal, so it is written one
  // run after sealing — never in the same run, which would point at a commit whose
  // manifest is the pre-seal one.
  const sealIsCommitted = commitExists('HEAD')
    && readRepoFile('HEAD', manifestRepoPath) === rendered
  const stampPath = resolve(archiveRoot, 'baseline')
  if (sealIsCommitted) {
    const head = runGit(['rev-parse', 'HEAD']).trim()
    if (!existsSync(stampPath) || readFileSync(stampPath, 'utf8').trim() !== head) {
      writeFileSync(stampPath, head + '\n')
      console.log('Recorded archive baseline at ' + head.slice(0, 7) + '.')
    }
  }
  console.log(`verify-archived-agent-notes: sealed ${extended.added.length} new artifact(s); existing seals unchanged.`)
} else {
  console.log(`verify-archived-agent-notes: ${artifacts.size} frozen artifact(s) checked across ${kinds.size} kind(s).`)
}
