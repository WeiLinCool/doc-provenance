const BT = '`'

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { resolveSkillSource } from '../../platform/skills.ts'

/** Files under a skill directory, relative to it, as forward-slash paths. */
function listFiles(root: string, base = root, out: string[] = []): string[] {
  if (!existsSync(root)) return out
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) listFiles(full, base, out)
    else if (entry.isFile()) out.push(relative(base, full).split('\\').join('/'))
  }
  return out.sort()
}

/**
 * Compare the vendored runtime against the shipped skill source. Once the skills
 * ship inside this package there is no upstream to drift from, so the only copy
 * that can go stale is the vendored one — and a stale gate is a gate that reports
 * the wrong verdict. Text files only; binaries would fail a content comparison.
 */
function checkVendoredDrift(target: string, problems: string[]): void {
  const vendored = join(target, '.agents', 'skills', 'doc-constraint')
  const source = resolveSkillSource('doc-constraint')
  if (!source || !existsSync(vendored)) return
  for (const sub of ['scripts', 'references']) {
    const sourceFiles = listFiles(join(source, sub))
    const vendoredFiles = listFiles(join(vendored, sub))
    for (const rel of sourceFiles) {
      if (rel.endsWith('.test.ts')) continue
      if (!vendoredFiles.includes(rel)) {
        problems.push('vendored ' + sub + '/' + rel + ' is missing — rerun ' + BT + 'dprov init' + BT)
        continue
      }
      let shipped: string
      let installed: string
      try {
        shipped = readFileSync(join(source, sub, rel), 'utf8')
        installed = readFileSync(join(vendored, sub, rel), 'utf8')
      } catch {
        problems.push('cannot compare vendored ' + sub + '/' + rel + ' with the shipped skill')
        continue
      }
      if (shipped !== installed) {
        problems.push('vendored ' + sub + '/' + rel + ' differs from the shipped skill — re-vendor it so the gate reports the real verdict')
      }
    }
  }
}

/** Diagnose a partial or broken doc constraint installation. */
export function runDoctor(target: string): number {
  console.log('dprov doctor: ' + target)
  const problems: string[] = []
  const config = join(target, 'docs-constraint.yaml')
  const vendored = join(target, '.agents', 'skills', 'doc-constraint')
  if (existsSync(config) && !existsSync(vendored)) {
    problems.push('config exists but the gate runtime is not vendored — rerun ' + BT + 'dprov init' + BT)
  }
  if (!existsSync(config) && existsSync(vendored)) {
    problems.push('gate runtime vendored but docs-constraint.yaml is missing — rerun ' + BT + 'dprov init' + BT)
  }
  if (existsSync(vendored) && !existsSync(join(vendored, 'SKILL.md'))) {
    problems.push('vendored doc-constraint is incomplete (no SKILL.md) — delete it and rerun ' + BT + 'dprov init' + BT)
  }
  const node = spawnSync(process.execPath, ['--version'], { encoding: 'utf8' })
  const major = Number.parseInt((node.stdout ?? '').replace('v', '').split('.')[0] ?? '0', 10)
  if (major < 20) problems.push('Node >= 20.11 required for --experimental-strip-types; found ' + (node.stdout ?? 'unknown').trim())
  const notes = join(target, '.agents', 'notes')
  if (existsSync(notes)) {
    for (const lifecycle of ['implemented', 'proposed', 'rejected', 'archived']) {
      if (!existsSync(join(notes, lifecycle))) problems.push('agent notes tree missing ' + lifecycle + '/ — recreate it per docs/AGENTS.md')
    }
  }
  if (existsSync(vendored)) {
    for (const junk of ['node_modules', 'templates', 'docs', 'pnpm-lock.yaml', 'package.json']) {
      if (existsSync(join(vendored, junk))) problems.push('process artifact vendored into the skill: ' + junk + ' — vendor only SKILL.md, scripts/, references/')
    }
    checkVendoredDrift(target, problems)
  }
  if (problems.length === 0) {
    console.log('  No problems found.')
    return 0
  }
  for (const p of problems) console.log('  ⚠ ' + p)
  return 1
}