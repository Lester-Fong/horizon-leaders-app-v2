import { describe, expect, it } from 'vitest'

import { readPublicEnvironment } from './public-environment'

const validEnvironment = {
  VITE_API_URL: 'https://horizon-api.example',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'browser-safe-test-value',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
}

describe('frontend public environment configuration', () => {
  it('normalizes deployment-safe public origins and publishable key', () => {
    expect(readPublicEnvironment(validEnvironment)).toEqual({
      apiUrl: 'https://horizon-api.example',
      supabasePublicKey: 'browser-safe-test-value',
      supabaseUrl: 'https://example.supabase.co',
    })
  })

  it('supports the legacy browser-safe anon key as a fallback', () => {
    expect(
      readPublicEnvironment({
        VITE_API_URL: validEnvironment.VITE_API_URL,
        VITE_SUPABASE_ANON_KEY: 'legacy-browser-safe-test-value',
        VITE_SUPABASE_URL: validEnvironment.VITE_SUPABASE_URL,
      }).supabasePublicKey,
    ).toBe('legacy-browser-safe-test-value')
  })

  it.each([
    [{ ...validEnvironment, VITE_API_URL: undefined }, 'VITE_API_URL is required'],
    [
      { ...validEnvironment, VITE_API_URL: 'https://horizon-api.example/path' },
      'VITE_API_URL must be a valid http(s) origin',
    ],
    [
      { ...validEnvironment, VITE_SUPABASE_URL: 'not-a-url' },
      'VITE_SUPABASE_URL must be a valid http(s) origin',
    ],
    [
      { ...validEnvironment, VITE_SUPABASE_PUBLISHABLE_KEY: undefined },
      'VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY is required',
    ],
    [
      { ...validEnvironment, VITE_SUPABASE_ANON_KEY: 'second-public-key' },
      'Set only one of VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY',
    ],
  ])('fails clearly for invalid public configuration', (environment, message) => {
    expect(() => readPublicEnvironment(environment)).toThrow(message)
  })
})
