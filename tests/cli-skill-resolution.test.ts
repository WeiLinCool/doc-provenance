/**
 * Smoke test: the CLI resolves every bundled skill from this repository's own
 * assets/ tree. Guards the decoupling from any sibling checkout.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveSkillSource } from '../platform/skills.ts'

test('every bundled skill resolves from assets/skills', () => {
  for (const name of ['doc-constraint', 'doc-standard', 'doc-flow'] as const) {
    const source = resolveSkillSource(name)
    assert.ok(source, name + ' must resolve')
    assert.match(source, /assets[\\/]skills[\\/]/)
  }
})
