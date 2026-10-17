import { parseArgs } from 'node:util'
import { runInit } from '../commands/init.ts'
import { runAudit } from '../commands/audit.ts'
import { runCi } from '../commands/ci.ts'
import { runStatus } from '../commands/status.ts'
import { runDoctor } from '../commands/doctor.ts'
import { printBanner } from './banner.ts'

const VERSION = '0.1.0'

function usage(): never {
  console.log(`dprov — doc-provenance: evidence gates for agent-written docs

Usage:
  dprov init   [target]   Install the doc constraint system into a repository
                          (vendors skills, writes config + docs standard + notes tree)
  dprov audit  [target]   Run every enabled gate against the repository docs
  dprov ci     [target]   Generate a CI workflow for the doc gates
  dprov status [target]   Show the repository's doc constraint state and doc-flow route
  dprov doctor [target]   Diagnose a broken or partial installation
  dprov --version | --help
`)
  process.exit(0)
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { version: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
    allowPositionals: true,
  })
  if (values.version) { console.log('dprov ' + VERSION); return 0 }
  if (values.help) usage()
  const command = positionals[0]
  const target = positionals[1] ?? process.cwd()
  if (!command) { printBanner(); usage() }
  switch (command) {
    case 'init': return runInit(target)
    case 'audit': return runAudit(target)
    case 'ci': return runCi(target)
    case 'status': return runStatus(target)
    case 'doctor': return runDoctor(target)
    default:
      console.error('Unknown command: ' + command + ' (see --help)')
      return 1
  }
}

// Launched only via bin/dprov.js; always run.
main(process.argv.slice(2)).then(code => process.exit(code))