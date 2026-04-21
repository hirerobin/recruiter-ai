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

export interface FullJobDetail {
  title: string
  location: string
  company: string
  description: string
  requirements: string   // formatted single line e.g. "Usia 25-40 · SMA/SMK · SIM B1"
  salary: string
  benefit: string
  postTest: string
  recruiterName: string
  recruiterNumber: string
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

function parseFullJobDetail(text: string, metadata: Record<string, unknown>): FullJobDetail {
  const field = (label: string) => {
    const m = text.match(new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z]|$)`, 'si'))
    return m?.[1]?.trim() ?? ''
  }

  const ageMatch = text.match(/Usia\s+(\d+\s*[-–]\s*\d+)\s*tahun/i)
  const eduMatch = text.match(/Pendidikan\s+([A-Z0-9/]+)/i)
  const simMatch = text.match(/SIM\s+([A-Z0-9]+)/i)

  const agePart = ageMatch ? `Usia ${ageMatch[1]?.replace(/\s/g, '')}` : ''
  const eduPart = eduMatch ? eduMatch[1]!.toUpperCase() : ''
  const simPart = simMatch ? `SIM ${simMatch[1]}` : ''
  const reqParts = [agePart, eduPart, simPart].filter(Boolean)

  return {
    title:        (metadata?.judul_job as string) || field('Posisi'),
    location:     (metadata?.lokasi as string)    || field('Lokasi'),
    company:      (metadata?.client as string)    || field('Perusahaan/Client'),
    description:  field('Deskripsi'),
    requirements: reqParts.join(' · '),
    salary:       field('Gaji'),
    benefit:      field('Benefit'),
    postTest:     field('Post Test').replace(/^Tidak ada$/i, ''),
    recruiterName:   (metadata?.recruiter_name as string)     || '',
    recruiterNumber: (metadata?.recruitment_number as string) || '',
  }
}

export async function lookupFullJobDetail(jobTitle: string): Promise<FullJobDetail | null> {
  if (!jobTitle.trim()) return null
  try {
    const { embedding } = await embed({ model: EMBEDDING_MODEL, value: jobTitle })
    const results = await pgVector.query({ indexName: INDEX_NAME, queryVector: embedding, topK: 1 })
    const top = results[0]
    if (!top) return null
    const text = (top.metadata?.text as string) ?? ''
    if (!text) return null
    return parseFullJobDetail(text, (top.metadata ?? {}) as Record<string, unknown>)
  } catch {
    return null
  }
}
