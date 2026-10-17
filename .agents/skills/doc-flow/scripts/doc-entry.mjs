#!/usr/bin/env node
// doc-entry.mjs - doc-flow entry resolver
//
// Usage:
//   node doc-entry.mjs [target-repo] [--json] [--request <text>]
//
// Reads the target repository's doc state (vendored skills, config, notes tree,
// dirty docs) and prints a JSON resolution selecting exactly one downstream
// skill: doc-constraint (setup/audit/ci) or doc-standard (write/review/migrate).
// Output schema: doc.resolution.v1

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const jsonFlag = args.includes('--json')
const requestIdx = args.indexOf('--request')
const request = requestIdx >= 0 ? String(args[requestIdx + 1] ?? '') : ''
const positional = args.filter((a, i) => a !== '--json' && i !== requestIdx && (requestIdx === -1 || i !== requestIdx + 1))
const target = resolve(positional[0] ?? '.')

function out(payload) {
  const text = JSON.stringify(payload, null, jsonFlag ? 2 : 0)
  if (jsonFlag) console.log(text)
  else console.log(text)
  process.exit(0)
}

function fail(code, message) {
  console.error(JSON.stringify({ schema: 'doc.resolution.v1', error: { code, message } }))
  process.exit(1)
}

if (!existsSync(target) || !statSync(target).isDirectory()) {
  fail('TARGET_NOT_FOUND', 'target repository directory does not exist: ' + target)
}

const vendoredConstraint = join(target, '.agents', 'skills', 'doc-constraint')
const configPath = join(target, 'docs-constraint.yaml')
const hasConfig = existsSync(configPath)
const hasGates = existsSync(join(vendoredConstraint, 'scripts', 'run-gates.ts'))
const notesTree = existsSync(join(target, '.agents', 'notes'))
const docsDir = join(target, 'docs')
const hasDocs = existsSync(docsDir) && statSync(docsDir).isDirectory()

// Trivial keyword routing on the explicit request text; structural state wins
// when the request is absent or ambiguous.
const req = request.toLowerCase()
const asksWrite = /(write|author|draft|rewrite|restructure|migrate|review|readme|guide|翻译|写作|迁移)/.test(req)
const asksSetup = /(init|setup|install|configure|ci|audit|初始化|安装|配置)/.test(req)
const asksPair = /(bilingual|i18n|pair|translate|双语|翻译)/.test(req)

let skill, command, reason, state
if (!hasConfig || !hasGates) {
  skill = 'doc-constraint'
  command = 'init'
  state = 'uninitialized'
  reason = hasGates
    ? 'docs-constraint.yaml missing; run doc-constraint init to install the configuration'
    : 'doc-constraint skill is not vendored; run doc-constraint init to vendor it and install the configuration'
} else if (asksSetup && !asksWrite) {
  skill = 'doc-constraint'
  command = 'audit'
  state = 'configured'
  reason = 'explicit setup/audit request on a configured repository'
} else if (asksWrite || asksPair) {
  skill = 'doc-standard'
  command = 'write'
  state = notesTree ? 'notes-ready' : 'notes-missing'
  reason = 'authoring request routed to the writing standard' + (notesTree ? '' : '; scaffold .agents/notes first via doc-constraint init')
} else {
  skill = 'doc-standard'
  command = 'review'
  state = hasDocs ? 'docs-present' : 'docs-empty'
  reason = hasDocs
    ? 'no explicit request category; default to review against the writing standard'
    : 'no docs directory yet; plan the hierarchy with the writing standard before writing'
}

out({
  schema: 'doc.resolution.v1',
  target,
  skill,
  command,
  state,
  reason,
  chain: {
    setup: '.agents/skills/doc-constraint/templates/install.ts init',
    gates: '.agents/skills/doc-constraint/scripts/run-gates.ts',
  },
})
