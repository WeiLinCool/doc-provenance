#!/usr/bin/env node
/**
 * install.ts - doc-constraint installer
 *
 * Scaffolds the documentation constraint system into a repository:
 *   init    write docs-constraint.yaml + docs/ standard + .agents/notes/ skeleton
 *   audit   measure current docs against the enabled gates (no writes)
 *   ci      generate a GitHub Actions doc-sync workflow
 *
 * Usage:
 *   node --experimental-strip-types templates/install.ts init [--target <repo>]
 *   node --experimental-strip-types templates/install.ts audit [--target <repo>]
 *   node --experimental-strip-types templates/install.ts ci [--target <repo>] [--platform github]
 *
 * --target defaults to the current working directory. init vendors the skill
 * into <repo>/.agents/skills/doc-constraint/, so every gate is runnable from
 * inside the target repository.
 */

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const SKILL_ROOT = resolve(import.meta.dirname, '..')
const VENDORED = '.agents/skills/doc-constraint'

interface Options {
  target: string
  platform: string
}

function parseArgs(args: string[]): Options {
  let target = process.cwd()
  let platform = 'github'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target') target = resolve(args[i + 1] ?? process.cwd())
    if (args[i] === '--platform') platform = args[i + 1] ?? 'github'
  }
  return { target, platform }
}

function writeConfig(target: string): void {
  const template = join(import.meta.dirname, 'docs-constraint.yaml')
  const dest = join(target, 'docs-constraint.yaml')
  if (existsSync(dest)) {
    console.log('docs-constraint.yaml already exists; leaving it unchanged.')
    return
  }
  copyFileSync(template, dest)
  console.log('Wrote ' + dest)
}

function writeRootAgents(target: string): void {
  const template = join(import.meta.dirname, 'AGENTS.md.template')
  const dest = join(target, 'AGENTS.md')
  if (existsSync(dest)) {
    console.log('AGENTS.md already exists; leaving it unchanged.')
    return
  }
  copyFileSync(template, dest)
  console.log('Wrote ' + dest)
}

function localToday(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
}

/** Copy the skill into <target>/.agents/skills/doc-constraint/ so every gate is repo-local. */
function vendorSkill(target: string): void {
  const dest = join(target, '.agents', 'skills', 'doc-constraint')
  if (existsSync(join(dest, 'SKILL.md')) || existsSync(join(dest, 'scripts', 'run-gates.ts'))) {
    console.log('.agents/skills/doc-constraint already vendored; leaving it unchanged.')
    return
  }
  mkdirSync(dest, { recursive: true })
  // Runtime surface only: SKILL.md + scripts + references. templates/ and docs/
  // are init inputs — the installer consumes them here and does not ship them.
  for (const entry of ['SKILL.md', 'scripts', 'references']) {
    const from = join(SKILL_ROOT, entry)
    if (!existsSync(from)) continue
    cpSync(from, join(dest, entry), { recursive: true })
  }
  console.log('Vendored skill into ' + dest)

  // Companion skills: vendor the writing standard and the flow router when they
  // ship beside this skill. They live in the same assets/skills/ tree, so a
  // packaged install and a working checkout behave identically.
  for (const companion of ['doc-standard', 'doc-flow']) {
    const src = join(resolve(SKILL_ROOT, '..'), companion)
    const cdest = join(target, '.agents', 'skills', companion)
    if (!existsSync(join(src, 'SKILL.md'))) continue
    if (existsSync(join(cdest, 'SKILL.md'))) {
      console.log('.agents/skills/' + companion + ' already vendored; leaving it unchanged.')
      continue
    }
    mkdirSync(cdest, { recursive: true })
    for (const entry of ['SKILL.md', 'scripts', 'references', 'reference', 'templates', 'runtime']) {
      const from = join(src, entry)
      if (!existsSync(from)) continue
      cpSync(from, join(cdest, entry), { recursive: true })
    }
    console.log('Vendored companion skill into ' + cdest)
  }
}

/**
 * Docs ship with skill-repo-relative references to their own scripts; inside the
 * target repository those scripts live under the vendored skill directory. Every
 * form of reference is rewritten, not just evidence paths and shell commands: a
 * Markdown link left pointing at ../scripts/ is a broken link in the installed
 * repo, and the doc-header spec is exactly the kind of page to carry one.
 *
 * Link targets resolve relative to the document, and these docs land in docs/,
 * so the vendored scripts are one level up: ../.agents/skills/... — never
 * .agents/skills/..., which would resolve to docs/.agents/skills/...
 */
function retargetSkillRefs(content: string): string {
  return content
    // Evidence entries in a document header: "- path: scripts/..."
    .replace(/^([ \t]*- path: )scripts\//gm, '$1' + VENDORED + '/scripts/')
    // Shell invocations, in prose or inside a fenced block.
    .replace(/node --experimental-strip-types scripts\//g, 'node --experimental-strip-types ' + VENDORED + '/scripts/')
    // Markdown links and images: [text](../scripts/x.ts), [text](scripts/x.ts)
    .replace(/\]\(\.\.\/scripts\//g, '](../' + VENDORED + '/scripts/')
    .replace(/\]\(scripts\//g, '](../' + VENDORED + '/scripts/')
}

/** Install the documentation standard and the header format spec into <target>/docs/. */
function writeDocsStandard(target: string): void {
  const docsDir = join(target, 'docs')
  mkdirSync(docsDir, { recursive: true })
  for (const name of ['AGENTS.md', 'doc-header.md']) {
    const from = join(SKILL_ROOT, 'docs', name)
    const dest = join(docsDir, name)
    if (!existsSync(from)) continue
    if (existsSync(dest)) {
      console.log('docs/' + name + ' already exists; leaving it unchanged.')
      continue
    }
    // The spec ships at status: review with a validation date; stamp the install day
    // so its freshness window starts from this repository's own clock.
    let content = readFileSync(from, 'utf8').replace(/^validated_at: .*$/m, 'validated_at: ' + localToday())
    content = retargetSkillRefs(content)
    writeFileSync(dest, content)
    console.log('Wrote ' + dest)
  }
}

function scaffoldAgentNotes(target: string): void {
  const root = join(target, '.agents', 'notes')
  mkdirSync(join(root, 'implemented'), { recursive: true })
  mkdirSync(join(root, 'proposed'), { recursive: true })
  mkdirSync(join(root, 'rejected'), { recursive: true })
  mkdirSync(join(root, 'archived'), { recursive: true })

  const readme = join(root, 'README.md')
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      [
        '# Agent Notes',
        '',
        'Proposals live under proposed/{class}/yyyy-mm-dd-topic.md.',
        'Implemented decisions under implemented/{class}/yyyy-mm-dd-topic.md.',
        'Archived (frozen) implemented notes under archived/{class}/.',
        'Rejected under rejected/{class}/.',
        '',
      ].join('\n'),
    )
    console.log('Wrote ' + readme)
  }

  const implAgents = join(root, 'implemented', 'AGENTS.md')
  if (!existsSync(implAgents)) {
    writeFileSync(
      implAgents,
      [
        '# AGENTS.md - Implemented Agent Notes',
        '',
        'Keep paths, symbols, defaults, and mechanisms current in the same change that alters them.',
        '',
      ].join('\n'),
    )
    console.log('Wrote ' + implAgents)
  }

  const archAgents = join(root, 'archived', 'AGENTS.md')
  if (!existsSync(archAgents)) {
    writeFileSync(
      archAgents,
      [
        '# AGENTS.md - Archived Agent Notes',
        '',
        'Archived triplets are frozen historical snapshots. Never edit, translate, or delete them.',
        '',
      ].join('\n'),
    )
    console.log('Wrote ' + archAgents)
  }
}

function generateCi(target: string, platform: string): void {
  if (platform !== 'github') {
    console.log('CI generation currently supports --platform github only; nothing written.')
    return
  }
  const dir = join(target, '.github', 'workflows')
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, 'doc-sync.yml')
  const content = [
    'name: Doc Sync',
    '',
    'on:',
    '  pull_request:',
    '    paths:',
    "      - '**/*.md'",
    "      - 'docs-constraint.yaml'",
    '  push:',
    '    branches: [main]',
    '    paths:',
    "      - '**/*.md'",
    "      - 'docs-constraint.yaml'",
    '',
    'jobs:',
    '  doc-sync:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '',
    '      - name: Setup Node.js',
    '        uses: actions/setup-node@v4',
    '        with:',
    "          node-version: '22'",
    '',
    '      - name: Run doc gates',
    '        run: node --experimental-strip-types .agents/skills/doc-constraint/scripts/run-gates.ts --config docs-constraint.yaml',
    '',
  ].join('\n')
  writeFileSync(dest, content)
  console.log('Wrote ' + dest)
}

function runAudit(target: string): void {
  const script = join(SKILL_ROOT, 'scripts', 'run-gates.ts')
  if (!existsSync(script)) {
    console.error('run-gates.ts not found in skill directory. Is the skill properly installed?')
    process.exit(1)
  }
  const cmd = [
    process.execPath,
    '--experimental-strip-types',
    JSON.stringify(script),
    '--config',
    JSON.stringify(join(target, 'docs-constraint.yaml')),
  ].join(' ')
  execSync(cmd, { stdio: 'inherit' })
}

const cmd = process.argv[2]
const opts = parseArgs(process.argv.slice(3))

switch (cmd) {
  case 'init':
    vendorSkill(opts.target)
    writeConfig(opts.target)
    writeRootAgents(opts.target)
    writeDocsStandard(opts.target)
    scaffoldAgentNotes(opts.target)
    break
  case 'audit':
    runAudit(opts.target)
    break
  case 'ci':
    generateCi(opts.target, opts.platform)
    break
  default:
    console.error('Usage: install.ts <init|audit|ci> [--target <repo>] [--platform github]')
    process.exit(1)
}
