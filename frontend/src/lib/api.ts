export type AppRole = 'admin' | 'leader'

export interface HorizonActor {
  id: string
  isActive: true
  name: string
  role: AppRole
}

export interface LifeGroupLeader {
  id: string
  isActive: boolean
  name: string
}

export interface LifeGroup {
  createdAt: string
  description: string | null
  id: string
  isActive: boolean
  leader: LifeGroupLeader
  name: string
  updatedAt: string
}

export interface LeaderOption extends LifeGroupLeader {
  assignedLifeGroup: {
    id: string
    isActive: boolean
    name: string
  } | null
}

export interface LifeGroupInput {
  description: string | null
  leaderProfileId: string
  name: string
}

export type MemberGender = 'male' | 'female'

export interface MemberLifeGroup {
  id: string
  isActive: boolean
  name: string
}

export interface Member {
  address: string | null
  birthDate: string | null
  createdAt: string
  email: string | null
  firstName: string
  gender: MemberGender | null
  id: string
  isActive: boolean
  lastName: string
  lifeGroup: MemberLifeGroup
  phone: string | null
  qrToken: string
  updatedAt: string
}

export interface MemberInput {
  address: string | null
  birthDate: string | null
  email: string | null
  firstName: string
  gender: MemberGender | null
  lastName: string
  lifeGroupId: string
  phone: string | null
}

export type MemberListStatus = 'active' | 'archived' | 'all'

export interface MemberListFilters {
  lifeGroupId?: string
  search?: string
  status?: MemberListStatus
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

function isLifeGroupLeader(value: unknown): value is LifeGroupLeader {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.isActive === 'boolean' &&
    typeof value.name === 'string'
  )
}

function isLifeGroup(value: unknown): value is LifeGroup {
  return (
    isRecord(value) &&
    typeof value.createdAt === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.id === 'string' &&
    typeof value.isActive === 'boolean' &&
    isLifeGroupLeader(value.leader) &&
    typeof value.name === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function isLeaderOption(value: unknown): value is LeaderOption {
  if (!isRecord(value) || !isLifeGroupLeader(value)) return false
  const assignedLifeGroup = value.assignedLifeGroup
  if (assignedLifeGroup === null) return true

  return (
    isRecord(assignedLifeGroup) &&
    typeof assignedLifeGroup.id === 'string' &&
    typeof assignedLifeGroup.isActive === 'boolean' &&
    typeof assignedLifeGroup.name === 'string'
  )
}

function isMemberLifeGroup(value: unknown): value is MemberLifeGroup {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.isActive === 'boolean' &&
    typeof value.name === 'string'
  )
}

function isMember(value: unknown): value is Member {
  return (
    isRecord(value) &&
    (typeof value.address === 'string' || value.address === null) &&
    (typeof value.birthDate === 'string' || value.birthDate === null) &&
    typeof value.createdAt === 'string' &&
    (typeof value.email === 'string' || value.email === null) &&
    typeof value.firstName === 'string' &&
    (value.gender === 'male' || value.gender === 'female' || value.gender === null) &&
    typeof value.id === 'string' &&
    typeof value.isActive === 'boolean' &&
    typeof value.lastName === 'string' &&
    isMemberLifeGroup(value.lifeGroup) &&
    (typeof value.phone === 'string' || value.phone === null) &&
    typeof value.qrToken === 'string' &&
    typeof value.updatedAt === 'string'
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

async function requestApi<T>(
  accessToken: string,
  path: string,
  isExpected: (value: unknown) => value is T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, '')}/api${path}`,
    {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    },
  )
  const payload: unknown = await response.json().catch(() => undefined)

  if (!response.ok) {
    const apiError = readApiError(payload)
    throw new ApiError(
      response.status,
      apiError?.code ?? 'REQUEST_FAILED',
      apiError?.message ?? 'Unable to complete the request.',
    )
  }

  if (!isRecord(payload) || !isExpected(payload.data)) {
    throw new ApiError(
      502,
      'INVALID_RESPONSE',
      'The server returned an invalid response.',
    )
  }

  return payload.data
}

const isLifeGroupList = (value: unknown): value is LifeGroup[] =>
  Array.isArray(value) && value.every(isLifeGroup)

const isLeaderOptionList = (value: unknown): value is LeaderOption[] =>
  Array.isArray(value) && value.every(isLeaderOption)

const isMemberList = (value: unknown): value is Member[] =>
  Array.isArray(value) && value.every(isMember)

export function getLifeGroups(accessToken: string) {
  return requestApi(accessToken, '/life-groups', isLifeGroupList)
}

export function getLeaderOptions(accessToken: string) {
  return requestApi(accessToken, '/life-groups/leaders', isLeaderOptionList)
}

export function createLifeGroup(
  accessToken: string,
  input: LifeGroupInput,
) {
  return requestApi(accessToken, '/life-groups', isLifeGroup, {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export function createMember(accessToken: string, input: MemberInput) {
  return requestApi(accessToken, '/members', isMember, {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export function getMembers(
  accessToken: string,
  filters: MemberListFilters = {},
) {
  const searchParameters = new URLSearchParams()
  if (filters.search) searchParameters.set('search', filters.search)
  if (filters.lifeGroupId) {
    searchParameters.set('lifeGroupId', filters.lifeGroupId)
  }
  if (filters.status) searchParameters.set('status', filters.status)
  const query = searchParameters.size > 0 ? `?${searchParameters}` : ''
  return requestApi(accessToken, `/members${query}`, isMemberList)
}

export function getMember(accessToken: string, memberId: string) {
  return requestApi(accessToken, `/members/${memberId}`, isMember)
}

export function updateMember(
  accessToken: string,
  memberId: string,
  input: MemberInput,
) {
  return requestApi(accessToken, `/members/${memberId}`, isMember, {
    body: JSON.stringify(input),
    method: 'PATCH',
  })
}

export function archiveMember(accessToken: string, memberId: string) {
  return requestApi(accessToken, `/members/${memberId}/archive`, isMember, {
    method: 'PATCH',
  })
}

export function updateLifeGroup(
  accessToken: string,
  lifeGroupId: string,
  input: LifeGroupInput,
) {
  return requestApi(accessToken, `/life-groups/${lifeGroupId}`, isLifeGroup, {
    body: JSON.stringify(input),
    method: 'PATCH',
  })
}

export function setLifeGroupActive(
  accessToken: string,
  lifeGroupId: string,
  isActive: boolean,
) {
  return requestApi(
    accessToken,
    `/life-groups/${lifeGroupId}/status`,
    isLifeGroup,
    { body: JSON.stringify({ isActive }), method: 'PATCH' },
  )
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
