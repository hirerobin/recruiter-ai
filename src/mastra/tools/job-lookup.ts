/**
 * Looks up real job requirements from pgvector using the job title the
 * candidate applied for. Used by runScoring() to replace hardcoded fallbacks.
 *
 * Falls back to generic requirements when no match is found or the store is
 * unavailable (e.g. local dev without Docker).
 */
import { openai } from '@ai-sdk/openai'
import { embed } from 'ai'
import { pgVector } from '../index'
import { INDEX_NAME, EMBEDDING_MODEL } from '../rag/knowledge'
import type { ScoringInput } from './scoring-tool'

export interface JobLookupResult {
  jobAgeRange: string
  jobEducationMin: string
  jobSimRequired: string
  postTest?: string
  recruiterName?: string
  recruiterNumber?: string
}

const FALLBACK: JobLookupResult = {
  jobAgeRange: '18-55',
  jobEducationMin: 'SMA',
  jobSimRequired: '',
}

function parseJobData(text: string): JobLookupResult {
  // Text format from seed: "Persyaratan: Usia 18-35 tahun. Pendidikan SMA. SIM A."
  const ageMatch = text.match(/Usia\s+(\d+\s*[-–]\s*\d+)\s*tahun/i)
  const eduMatch = text.match(/Pendidikan\s+([A-Z0-9/]+)/i)
  const simMatch = text.match(/SIM\s+([A-Z0-9]+)/i)
  const postTestMatch = text.match(/Post Test:\s*(.+)/i)
  const recruiterMatch = text.match(/Recruiter:\s*(.+?)\s*\((.+?)\)/)

  return {
    jobAgeRange: (ageMatch?.[1] ?? '').replace(/\s/g, '') || FALLBACK.jobAgeRange,
    jobEducationMin: (eduMatch?.[1] ?? '').toUpperCase() || FALLBACK.jobEducationMin,
    jobSimRequired: (simMatch?.[1] ?? '').toUpperCase(),
    postTest: postTestMatch?.[1]?.trim() !== 'Tidak ada' ? postTestMatch?.[1]?.trim() : undefined,
    recruiterName: recruiterMatch?.[1]?.trim(),
    recruiterNumber: recruiterMatch?.[2]?.trim(),
  }
}

export async function lookupJobRequirements(jobTitle: string): Promise<JobLookupResult> {
  if (!jobTitle.trim()) return FALLBACK

  try {
    const { embedding } = await embed({ model: EMBEDDING_MODEL, value: jobTitle })
    const results = await pgVector.query({
      indexName: INDEX_NAME,
      queryVector: embedding,
      topK: 1,
    })

    if (!results.length) return FALLBACK

    const topResult = results[0]
    if (!topResult) return FALLBACK
    const text: string = (topResult.metadata?.text as string) ?? ''
    if (!text) return FALLBACK

    return parseJobData(text)
  } catch {
    // pgvector not reachable (e.g. Docker not running) — use fallback silently
    return FALLBACK
  }
}
