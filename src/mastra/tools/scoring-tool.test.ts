import { describe, test, expect } from 'bun:test'
import { scoreCandidate } from './scoring-tool'

const BASE = {
  candidateAge: 25,
  candidateEducation: 'SMA',
  candidateSimType: '',
  jobAgeRange: '20-35',
  jobEducationMin: 'SMA',
  jobSimRequired: '',
}

describe('scoreCandidate', () => {
  test('candidate meeting all criteria scores 100 (no SIM required)', () => {
    const result = scoreCandidate(BASE)
    expect(result.score).toBe(100)
    expect(result.passed).toBe(true)
    expect(result.failReason).toBeUndefined()
  })

  test('SIM weight redistributed when not required', () => {
    const result = scoreCandidate(BASE)
    expect(result.breakdown.sim.weight).toBe(0)
    expect(result.breakdown.age.weight).toBe(0.45)
    expect(result.breakdown.education.weight).toBe(0.55)
  })

  test('candidate out of age range fails age component', () => {
    const result = scoreCandidate({ ...BASE, candidateAge: 50, jobAgeRange: '20-35' })
    expect(result.breakdown.age.score).toBe(0)
    // No SIM required → age(0×0.45) + edu(1×0.55) = 55 → still passes
    expect(result.score).toBe(55)
    expect(result.passed).toBe(true)
  })

  test('candidate fails when age + SIM both missing (below 50%)', () => {
    const result = scoreCandidate({
      ...BASE, candidateAge: 50, jobAgeRange: '20-35',
      candidateSimType: '', jobSimRequired: 'B1',
    })
    // age(0×0.3) + edu(1×0.4) + sim(0×0.3) = 40 → fails
    expect(result.score).toBe(40)
    expect(result.passed).toBe(false)
    expect(result.failReason).toContain('usia')
  })

  test('candidate education below minimum fails education component', () => {
    const result = scoreCandidate({ ...BASE, candidateEducation: 'SMP', jobEducationMin: 'SMA' })
    expect(result.breakdown.education.score).toBe(0)
    expect(result.passed).toBe(false)
    expect(result.failReason).toContain('pendidikan')
  })

  test('candidate without required SIM scores 0 on SIM component', () => {
    const result = scoreCandidate({ ...BASE, candidateSimType: '', jobSimRequired: 'B1' })
    expect(result.breakdown.sim.score).toBe(0)
    expect(result.breakdown.sim.weight).toBe(0.3)
    // total = age(1*0.3) + edu(1*0.4) + sim(0*0.3) = 70
    expect(result.score).toBe(70)
    expect(result.passed).toBe(true) // 70 >= 50
  })

  test('candidate with correct SIM passes SIM component', () => {
    const result = scoreCandidate({ ...BASE, candidateSimType: 'B1', jobSimRequired: 'B1' })
    expect(result.breakdown.sim.score).toBe(1)
    expect(result.score).toBe(100)
  })

  test('fail reason includes all failing components', () => {
    const result = scoreCandidate({
      ...BASE,
      candidateAge: 55,
      jobAgeRange: '20-35',
      candidateSimType: '',
      jobSimRequired: 'B1',
    })
    expect(result.failReason).toContain('usia')
    expect(result.failReason).toContain('SIM')
  })

  test('is deterministic — same inputs always return same result', () => {
    const r1 = scoreCandidate(BASE)
    const r2 = scoreCandidate(BASE)
    expect(r1.score).toBe(r2.score)
    expect(r1.passed).toBe(r2.passed)
  })

  test('higher education than required still passes', () => {
    const result = scoreCandidate({ ...BASE, candidateEducation: 'S1', jobEducationMin: 'SMA' })
    expect(result.breakdown.education.score).toBe(1)
    expect(result.passed).toBe(true)
  })

  test('SIM not required note is present in breakdown', () => {
    const result = scoreCandidate(BASE)
    expect(result.breakdown.sim.note).toContain('redistributed')
  })
})
