const BT = '`'

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

interface Resolution { skill?: string; command?: string; state?: string; reason?: string }

/** Show the repository's doc constraint state and the doc-flow route. */
export function runStatus(target: string): number {
  const checks: Array<[string, boolean, string]> = [
    ['docs-constraint.yaml', existsSync(join(target, 'docs-constraint.yaml')), 'gate configuration'],
    ['.agents/skills/doc-constraint', existsSync(join(target, '.agents', 'skills', 'doc-constraint')), 'vendored gate runtime'],
    ['.agents/skills/doc-standard', existsSync(join(target, '.agents', 'skills', 'doc-standard')), 'vendored writing standard'],
    ['.agents/skills/doc-flow', existsSync(join(target, '.agents', 'skills', 'doc-flow')), 'vendored doc-flow router'],
    ['.agents/notes/', existsSync(join(target, '.agents', 'notes')), 'agent notes tree'],
    ['docs/', existsSync(join(target, 'docs')), 'documentation directory'],
    ['.github/workflows/doc-sync.yml', existsSync(join(target, '.github', 'workflows', 'doc-sync.yml')), 'CI workflow'],
  ]
  console.log('dprov status: ' + target)
  let ready = true
  for (const [path, ok, what] of checks) {
    console.log('  ' + (ok ? '\u2713' : '\u2717') + ' ' + path.padEnd(36) + ' ' + what)
    if (!ok) ready = false
  }
  console.log('')
  const entry = join(target, '.agents', 'skills', 'doc-flow', 'scripts', 'doc-entry.mjs')
  if (existsSync(entry)) {
    const result = spawnSync(process.execPath, [entry, target, '--json'], { encoding: 'utf8' })
    if (result.status === 0) {
      try {
        const resolution = JSON.parse(result.stdout) as Resolution
        console.log('doc-flow route: ' + resolution.skill + ' ' + (resolution.command ?? '') + ' \u2014 ' + resolution.reason)
      } catch {
        console.log('doc-flow route: unparseable resolution (run dprov doctor)')
      }
    }
  } else {
    console.log('doc-flow route: doc-flow not vendored \u2014 run ' + BT + 'dprov init' + BT)
  }
  console.log('')
  console.log(ready ? 'Ready. Docs work is verified by the gates.' : 'Incomplete installation. Run ' + BT + 'dprov init ' + target + BT + '.')
  return ready ? 0 : 1
}