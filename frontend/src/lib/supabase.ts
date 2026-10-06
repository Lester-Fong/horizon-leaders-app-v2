import { createClient } from '@supabase/supabase-js'

import { readSupabasePublicConfig } from '../../config/public-environment'

const { supabasePublicKey, supabaseUrl } = readSupabasePublicConfig({
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_SUPABASE_PUBLISHABLE_KEY:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
})

export const supabase = createClient(supabaseUrl, supabasePublicKey)
