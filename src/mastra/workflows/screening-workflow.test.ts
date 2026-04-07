import { describe, test, expect } from 'bun:test'
import {
  validateField, applyField, nextField,
  buildDataReview, buildPassMessage, buildFailMessage,
  buildFarewellMessage, buildConsentMessage,
  nextFileStep, getFilePrompt,
} from './screening-workflow'

describe('validateField', () => {
  test('age: valid integer', () => {
    expect(validateField('age', '25').valid).toBe(true)
  })

  test('age: NaN string fails', () => {
    expect(validateField('age', 'abc').valid).toBe(false)
  })

  test('age: empty string fails', () => {
    expect(validateField('age', '').valid).toBe(false)
  })

  test('name: non-empty string is valid', () => {
    expect(validateField('name', 'John Doe').valid).toBe(true)
  })

  test('name: empty string fails', () => {
    expect(validateField('name', '').valid).toBe(false)
  })
})

describe('applyField', () => {
  test('applies age as number', () => {
    const data = applyField({}, 'age', '30')
    expect(data.age).toBe(30)
  })

  test('applies name as string', () => {
    const data = applyField({}, 'name', ' Budi ')
    expect(data.name).toBe('Budi')
  })
})

describe('nextField', () => {
  test('null → name (first field)', () => {
    expect(nextField(null)).toBe('name')
  })

  test('name → age', () => {
    expect(nextField('name')).toBe('age')
  })

  test('location → null (done)', () => {
    expect(nextField('location')).toBeNull()
  })
})

describe('buildDataReview', () => {
  test('contains all field values in Indonesian', () => {
    const data = { name: 'Budi', age: 25, education: 'SMA', phone: '08123', location: 'Jakarta' }
    const text = buildDataReview(data, 'id')
    expect(text).toContain('Budi')
    expect(text).toContain('25')
    expect(text).toContain('SMA')
    expect(text).toContain('ya')
  })

  test('contains all field values in English', () => {
    const data = { name: 'John', age: 28, education: 'S1', phone: '0899', location: 'Surabaya' }
    const text = buildDataReview(data, 'en')
    expect(text).toContain('John')
    expect(text).toContain('yes')
  })
})

describe('buildPassMessage', () => {
  test('includes congratulations in Indonesian', () => {
    expect(buildPassMessage('id', {})).toContain('Selamat')
  })

  test('includes congratulations in English', () => {
    expect(buildPassMessage('en', {})).toContain('Congratulations')
  })

  test('includes post_test link when provided', () => {
    const msg = buildPassMessage('en', { postTest: 'https://forms.example.com/test' })
    expect(msg).toContain('https://forms.example.com/test')
  })
})

describe('buildFailMessage', () => {
  test('includes fail reason in Indonesian', () => {
    const msg = buildFailMessage('id', 'usia (50 di luar range 20-35)')
    expect(msg).toContain('usia')
    expect(msg).toContain('lowongan lain')
  })

  test('includes re-entry offer in English', () => {
    const msg = buildFailMessage('en', 'age out of range')
    expect(msg).toContain('other job')
  })
})

describe('buildFarewellMessage', () => {
  test('Indonesian farewell', () => {
    expect(buildFarewellMessage('id')).toContain('/start')
  })

  test('English farewell', () => {
    expect(buildFarewellMessage('en')).toContain('/start')
  })
})

describe('buildConsentMessage', () => {
  test('Indonesian consent lists UU PDP', () => {
    const msg = buildConsentMessage('id')
    expect(msg).toContain('UU PDP')
    expect(msg).toContain('KTP')
  })

  test('English consent mentions CV', () => {
    const msg = buildConsentMessage('en')
    expect(msg).toContain('CV')
  })
})

describe('nextFileStep', () => {
  test('ktp → photo', () => expect(nextFileStep('ktp')).toBe('photo'))
  test('photo → cv', () => expect(nextFileStep('photo')).toBe('cv'))
  test('cv → null (done)', () => expect(nextFileStep('cv')).toBeNull())
})
