import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { resolveSkillSource } from '../../platform/skills.ts'

/** Generate the CI workflow for the doc gates. */
export function runCi(target: string): number {
  const source = resolveSkillSource('doc-constraint')
  if (!source) {
    console.error('doc-constraint skill source not found.')
    return 1
  }
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', join(source, 'templates', 'install.ts'), 'ci', '--target', target],
    { stdio: 'inherit' },
  )
  return result.status ?? 1
}
