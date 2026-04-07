/**
 * Validates uploaded KTP and passport photos using GPT-4o Vision.
 * Returns { valid, reason } — if invalid, reason explains what's wrong
 * so the bot can ask the candidate to re-upload.
 */
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { readFileSync } from 'fs'
import { logger } from '../../logger'

export interface ValidationResult {
  valid: boolean
  reason?: string
}

const KTP_PROMPT = `Analyze this image and determine if it is a valid Indonesian KTP (Kartu Tanda Penduduk / national ID card).

A valid KTP must show:
- The card itself (not just a photo of a person)
- Text elements like NIK, Nama, Tempat/Tgl Lahir, or "REPUBLIK INDONESIA"
- It can be a photo of the physical card or a scanned copy

Respond in this exact JSON format only, no other text:
{"valid": true}
or
{"valid": false, "reason": "brief reason in Bahasa Indonesia"}`

const PHOTO_PROMPT = `Analyze this image and determine if it is suitable as a passport-style photo (pas foto) for a job application.

A valid passport photo should:
- Show a single person's face clearly
- Be a portrait/headshot style (not a group photo, landscape, or random image)
- The face should be reasonably visible

Respond in this exact JSON format only, no other text:
{"valid": true}
or
{"valid": false, "reason": "brief reason in Bahasa Indonesia"}`

async function validateImage(filePath: string, prompt: string): Promise<ValidationResult> {
  try {
    const buffer = readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpg'
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: `data:${mimeType};base64,${base64}` },
          { type: 'text', text: prompt },
        ],
      }],
      maxTokens: 150,
    })

    const text = result.text.trim()
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { valid: true } // fail-open if can't parse

    const parsed = JSON.parse(jsonMatch[0])
    return { valid: Boolean(parsed.valid), reason: parsed.reason }
  } catch (err) {
    logger.error({ event: 'vision_validation_error', filePath, err })
    // Fail-open: if vision API fails, accept the file
    return { valid: true }
  }
}

export async function validateKtp(filePath: string): Promise<ValidationResult> {
  return validateImage(filePath, KTP_PROMPT)
}

export async function validatePhoto(filePath: string): Promise<ValidationResult> {
  return validateImage(filePath, PHOTO_PROMPT)
}
