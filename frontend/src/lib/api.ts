export type AppRole = 'admin' | 'leader'

export interface HorizonActor {
  id: string
  isActive: true
  name: string
  role: AppRole
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHorizonActor(value: unknown): value is HorizonActor {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.isActive === true &&
    typeof value.name === 'string' &&
    (value.role === 'admin' || value.role === 'leader')
  )
}

function readApiError(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return undefined
  }

  const { code, message } = payload.error

  if (typeof code !== 'string' || typeof message !== 'string') {
    return undefined
  }

  return { code, message }
}

const apiUrl = import.meta.env.VITE_API_URL?.trim()

if (!apiUrl) {
  throw new Error('VITE_API_URL is required')
}

export async function getCurrentActor(
  accessToken: string,
): Promise<HorizonActor> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/me`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload: unknown = await response.json().catch(() => undefined)

  if (!response.ok) {
    const apiError = readApiError(payload)
    throw new ApiError(
      response.status,
      apiError?.code ?? 'REQUEST_FAILED',
      apiError?.message ?? 'Unable to complete the request.',
    )
  }

  if (!isRecord(payload) || !isHorizonActor(payload.data)) {
    throw new ApiError(
      502,
      'INVALID_RESPONSE',
      'The server returned an invalid current-user response.',
    )
  }

  return payload.data
}
