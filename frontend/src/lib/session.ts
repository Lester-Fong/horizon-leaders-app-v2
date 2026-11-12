import { ApiError } from './api'
import { supabase } from './supabase'

/**
 * Returns the current Supabase access token for authenticated API calls.
 * Throws a 401 `UNAUTHENTICATED` ApiError when there is no active session.
 */
export async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.')
  }
  return data.session.access_token
}
