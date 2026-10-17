import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Skills shipped with dprov: doc-constraint (gates), doc-standard (writing), doc-flow (routing). */
export const SKILLS = ['doc-constraint', 'doc-standard', 'doc-flow'] as const
export type SkillName = (typeof SKILLS)[number]

/**
 * Resolve a bundled skill from this repository's own tree:
 *   dprov/platform/skills.ts -> dprov/assets/skills/<name>/
 *
 * This is the only source. The skills ship inside the package, so an installed
 * copy and a working checkout resolve identically and nothing depends on a
 * sibling checkout existing beside the repository.
 */
export function resolveSkillSource(name: SkillName): string | null {
  const dir = resolve(HERE, '..', 'assets', 'skills', name)
  return existsSync(join(dir, 'SKILL.md')) ? dir : null
}