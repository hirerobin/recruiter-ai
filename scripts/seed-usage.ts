/**
 * Seed example rows into the Usage sheet for demonstration.
 * Run: bun scripts/seed-usage.ts
 */
import { writeUsageToSheet } from '../src/mastra/tools/usage-sheet'
import type { SessionSnapshot } from '../src/mastra/tools/usage-tracker'

interface SeedEntry {
  chatId: string
  appliedJob: string
  snapshot: SessionSnapshot
}

function makeSnapshot(
  durationMin: number,
  gpt4oIn: number,
  gpt4oOut: number,
  gpt4oCalls: number,
): SessionSnapshot {
  const PRICE = { 'gpt-4o': { input: 2.50, output: 10.00 }, 'text-embedding-3-small': { input: 0.02, output: 0 } }
  const gpt4oCost = (gpt4oIn * 2.50 + gpt4oOut * 10.00) / 1_000_000
  const embIn = Math.floor(gpt4oCalls * 120)   // ~120 tokens per embed call
  const embCalls = gpt4oCalls
  const embCost = (embIn * 0.02) / 1_000_000

  const totalIn = gpt4oIn + embIn
  const totalOut = gpt4oOut
  const totalCost = gpt4oCost + embCost

  const summary = [
    `Total: in=${totalIn} out=${totalOut} | $${totalCost.toFixed(4)} | ${durationMin}min`,
    `gpt-4o: in=${gpt4oIn} out=${gpt4oOut} calls=${gpt4oCalls} | $${gpt4oCost.toFixed(4)}`,
    `text-embedding-3-small: in=${embIn} out=0 calls=${embCalls} | $${embCost.toFixed(4)}`,
  ].join('\n')

  return {
    durationMin,
    models: {
      'gpt-4o': { inputTokens: gpt4oIn, outputTokens: gpt4oOut, calls: gpt4oCalls, costUsd: gpt4oCost },
      'text-embedding-3-small': { inputTokens: embIn, outputTokens: 0, calls: embCalls, costUsd: embCost },
    },
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    totalCostUsd: totalCost,
    summary,
  }
}

const SEED_DATA: SeedEntry[] = [
  {
    chatId: '6042445719',
    appliedJob: 'Promotor Outlet — Malang',
    snapshot: makeSnapshot(22, 14820, 3640, 8),
  },
  {
    chatId: '7123456780',
    appliedJob: 'Operator Gudang — Palangkaraya',
    snapshot: makeSnapshot(15, 9240, 2110, 5),
  },
  {
    chatId: '8234567891',
    appliedJob: 'Crew Outlet — Sragen',
    snapshot: makeSnapshot(31, 21450, 5380, 12),
  },
  {
    chatId: '9345678902',
    appliedJob: 'Driver Ekspedisi — Palangkaraya',
    snapshot: makeSnapshot(18, 11600, 2870, 7),
  },
  {
    chatId: '5901234563',
    appliedJob: 'Promotor Outlet — Malang',
    snapshot: makeSnapshot(11, 7130, 1520, 4),
  },
]

async function main() {
  console.log(`Seeding ${SEED_DATA.length} example rows into Usage sheet...`)
  for (const entry of SEED_DATA) {
    await writeUsageToSheet(entry.chatId, entry.appliedJob, entry.snapshot)
    console.log(`  ✓ ${entry.chatId} — ${entry.appliedJob} ($${entry.snapshot.totalCostUsd.toFixed(4)})`)
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
