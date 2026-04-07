import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

const EDU_RANK: Record<string, number> = {
  SD: 1, SMP: 2, SMA: 3, SMK: 3, 'SMA/SMK': 3,
  D1: 4, D2: 5, D3: 6, 'D3/S1': 6, S1: 7, S2: 8, S3: 9,
}

function eduRank(edu: string): number {
  const key = edu.toUpperCase().trim()
  return EDU_RANK[key] ?? 0
}

function scoreAge(candidateAge: number, rangeStr: string): number {
  const m = rangeStr.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (!m) return 1
  return candidateAge >= Number(m[1]) && candidateAge <= Number(m[2]) ? 1 : 0
}

function scoreEducation(candidateEdu: string, requiredEdu: string): number {
  return eduRank(candidateEdu) >= eduRank(requiredEdu) ? 1 : 0
}

function scoreSim(candidateSim: string, requiredSim: string): number | -1 {
  if (!requiredSim.trim()) return -1 // -1 = not required
  return candidateSim.trim().toUpperCase() === requiredSim.trim().toUpperCase() ? 1 : 0
}

export interface ScoringInput {
  candidateAge: number
  candidateEducation: string
  candidateSimType: string
  jobAgeRange: string
  jobEducationMin: string
  jobSimRequired: string
}

export interface ScoringResult {
  score: number
  passed: boolean
  failReason?: string
  breakdown: {
    age: { score: number; weight: number }
    education: { score: number; weight: number }
    sim: { score: number | null; weight: number; note?: string }
  }
}

/** Pure scoring function — deterministic, no side effects */
export function scoreCandidate(input: ScoringInput): ScoringResult {
  const { candidateAge, candidateEducation, candidateSimType, jobAgeRange, jobEducationMin, jobSimRequired } = input

  const ageScore = scoreAge(candidateAge, jobAgeRange)
  const eduScore = scoreEducation(candidateEducation, jobEducationMin)
  const simResult = scoreSim(candidateSimType, jobSimRequired)
  const simRequired = simResult !== -1

  let total: number
  let weights: { age: number; education: number; sim: number }

  if (!simRequired) {
    weights = { age: 0.45, education: 0.55, sim: 0 }
    total = Math.round((ageScore * 0.45 + eduScore * 0.55) * 100)
  } else {
    weights = { age: 0.3, education: 0.4, sim: 0.3 }
    total = Math.round((ageScore * 0.3 + eduScore * 0.4 + (simResult as number) * 0.3) * 100)
  }

  const passed = total >= 50

  let failReason: string | undefined
  if (!passed) {
    const reasons: string[] = []
    if (!ageScore) reasons.push(`usia (${candidateAge} di luar range ${jobAgeRange})`)
    if (!eduScore) reasons.push(`pendidikan (${candidateEducation} < ${jobEducationMin})`)
    if (simRequired && simResult === 0) reasons.push(`SIM (butuh ${jobSimRequired}, tidak dimiliki)`)
    failReason = reasons.join('; ')
  }

  return {
    score: total,
    passed,
    failReason,
    breakdown: {
      age: { score: ageScore, weight: weights.age },
      education: { score: eduScore, weight: weights.education },
      sim: simRequired
        ? { score: simResult as number, weight: weights.sim }
        : { score: null, weight: 0, note: 'not required — weight redistributed' },
    },
  }
}

/** Mastra tool wrapper */
export const scoringTool = createTool({
  id: 'scoring-tool',
  description: 'Calculate a weighted match score for a candidate against job requirements.',
  inputSchema: z.object({
    candidateAge: z.number().int().min(14).max(99),
    candidateEducation: z.string().min(1),
    candidateSimType: z.string().default(''),
    jobAgeRange: z.string(),
    jobEducationMin: z.string(),
    jobSimRequired: z.string().default(''),
  }),
  execute: async ({ context }) => {
    const result = scoreCandidate(context)
    return { success: true, data: result }
  },
})
