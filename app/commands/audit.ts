const BT = '`'

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { resolveSkillSource } from '../../platform/skills.ts'

/** Run every enabled doc gate in the target repository. */
export function runAudit(rawTarget: string): number {
  // Resolve once: the script path is resolved against the target while the child
  // process runs with the target as its cwd. Leaving the target relative makes
  // those two disagree (tests/sandbox + tests/sandbox/...), which fails as a
  // module-not-found instead of running the gates.
  const target = resolve(rawTarget)
  const vendored = join(target, '.agents', 'skills', 'doc-constraint', 'scripts', 'run-gates.ts')
  const source = resolveSkillSource('doc-constraint')
  const script = existsSync(vendored) ? vendored : join(source ?? '', 'scripts', 'run-gates.ts')
  if (!existsSync(script)) {
    console.error('run-gates.ts not found. Run ' + BT + 'dprov init ' + target + BT + ' first.')
    return 1
  }
  const config = join(target, 'docs-constraint.yaml')
  const args = ['--experimental-strip-types', script]
  if (existsSync(config)) args.push('--config', config)
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: target })
  return result.status ?? 1
}