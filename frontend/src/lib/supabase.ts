import { createClient } from '@supabase/supabase-js'

function readPublicEnvironmentValue(name: string, value: string | undefined) {
  const normalizedValue = value?.trim()

  if (!normalizedValue) {
    throw new Error(`${name} is required`)
  }

  return normalizedValue
}

const supabaseUrl = readPublicEnvironmentValue(
  'VITE_SUPABASE_URL',
  import.meta.env.VITE_SUPABASE_URL,
)
const supabasePublicKey = readPublicEnvironmentValue(
  'VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const supabase = createClient(supabaseUrl, supabasePublicKey)
