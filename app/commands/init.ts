import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { resolveSkillSource } from '../../platform/skills.ts'

/** Install the doc constraint system into <target> by running the doc-constraint installer. */
export function runInit(target: string): number {
  const source = resolveSkillSource('doc-constraint')
  if (!source) {
    console.error('doc-constraint skill source not found in assets/skills/. Reinstall dprov (npm i -g doc-provenance).')
    return 1
  }
  const installer = join(source, 'templates', 'install.ts')
  const result = spawnSync(process.execPath, ['--experimental-strip-types', installer, 'init', '--target', target], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('init failed (exit ' + result.status + ')')
    return result.status ?? 1
  }
  console.log('')
  console.log('Next steps:')
  console.log('  dprov audit  ' + target + '   # run the doc gates')
  console.log('  dprov ci     ' + target + '   # add a CI workflow')
  return 0
}