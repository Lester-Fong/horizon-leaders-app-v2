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

export interface Ministry {
  createdAt: string
  description: string | null
  id: string
  isActive: boolean
  name: string
  updatedAt: string
}

export interface MinistryInput {
  description: string | null
  name: string
}

export interface MinistryMember {
  email: string | null
  firstName: string
  id: string
  isActive: boolean
  lastName: string
  lifeGroup: MemberLifeGroup
  phone: string | null
}

export type MinistryListStatus = 'active' | 'archived' | 'all'

export interface MinistryListFilters {
  search?: string
  status?: MinistryListStatus
}

export interface GatheringLifeGroup {
  id: string
  isActive: boolean
  name: string
}

export interface GatheringCreator {
  id: string
  name: string
}

export interface LifeGroupGathering {
  attendanceCount: number
  createdAt: string
  createdBy: GatheringCreator
  gatheringDate: string
  id: string
  lifeGroup: GatheringLifeGroup
  location: string | null
  notes: string | null
  title: string | null
  updatedAt: string
}

export interface GatheringDirectory {
  gatherings: LifeGroupGathering[]
  lifeGroup: GatheringLifeGroup
}

export interface GatheringInput {
  gatheringDate: string
  location: string | null
  notes: string | null
  title: string | null
}

export interface GatheringAttendanceMember {
  currentLifeGroup: { id: string; name: string }
  email: string | null
  firstName: string
  id: string
  isActive: boolean
  isEligible: boolean
  isPresent: boolean
  lastName: string
  phone: string | null
}

export interface GatheringAttendanceRoster {
  members: GatheringAttendanceMember[]
}

export interface AttendanceMutationResult {
  isPresent: boolean
  memberId: string
}

export type VisitorStatus = 'active' | 'converted'
export type VisitorListStatus = VisitorStatus | 'all'

export interface Visitor {
  convertedMemberId: string | null
  createdAt: string
  email: string | null
  firstName: string
  id: string
  lastName: string
  phone: string | null
  status: VisitorStatus
  updatedAt: string
}

export interface VisitorInput {
  email: string | null
  firstName: string
  lastName: string
  phone: string | null
}

export interface VisitorListFilters {
  search?: string
  status?: VisitorListStatus
}

export interface VisitorConversionResult {
  member: Member
  visitor: Visitor
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

function isMinistry(value: unknown): value is Ministry {
  return (
    isRecord(value) &&
    typeof value.createdAt === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.id === 'string' &&
    typeof value.isActive === 'boolean' &&
    typeof value.name === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function isMinistryMember(value: unknown): value is MinistryMember {
  return (
    isRecord(value) &&
    (typeof value.email === 'string' || value.email === null) &&
    typeof value.firstName === 'string' &&
    typeof value.id === 'string' &&
    typeof value.isActive === 'boolean' &&
    typeof value.lastName === 'string' &&
    isMemberLifeGroup(value.lifeGroup) &&
    (typeof value.phone === 'string' || value.phone === null)
  )
}

function isGatheringLifeGroup(value: unknown): value is GatheringLifeGroup {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.isActive === 'boolean' &&
    typeof value.name === 'string'
  )
}

function isGatheringCreator(value: unknown): value is GatheringCreator {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  )
}

function isLifeGroupGathering(value: unknown): value is LifeGroupGathering {
  return (
    isRecord(value) &&
    typeof value.attendanceCount === 'number' &&
    typeof value.createdAt === 'string' &&
    isGatheringCreator(value.createdBy) &&
    typeof value.gatheringDate === 'string' &&
    typeof value.id === 'string' &&
    isGatheringLifeGroup(value.lifeGroup) &&
    (typeof value.location === 'string' || value.location === null) &&
    (typeof value.notes === 'string' || value.notes === null) &&
    (typeof value.title === 'string' || value.title === null) &&
    typeof value.updatedAt === 'string'
  )
}

function isGatheringDirectory(value: unknown): value is GatheringDirectory {
  return (
    isRecord(value) &&
    Array.isArray(value.gatherings) &&
    value.gatherings.every(isLifeGroupGathering) &&
    isGatheringLifeGroup(value.lifeGroup)
  )
}

function isGatheringAttendanceMember(
  value: unknown,
): value is GatheringAttendanceMember {
  return (
    isRecord(value) &&
    isRecord(value.currentLifeGroup) &&
    typeof value.currentLifeGroup.id === 'string' &&
    typeof value.currentLifeGroup.name === 'string' &&
    (typeof value.email === 'string' || value.email === null) &&
    typeof value.firstName === 'string' &&
    typeof value.id === 'string' &&
    typeof value.isActive === 'boolean' &&
    typeof value.isEligible === 'boolean' &&
    typeof value.isPresent === 'boolean' &&
    typeof value.lastName === 'string' &&
    (typeof value.phone === 'string' || value.phone === null)
  )
}

function isGatheringAttendanceRoster(
  value: unknown,
): value is GatheringAttendanceRoster {
  return (
    isRecord(value) &&
    Array.isArray(value.members) &&
    value.members.every(isGatheringAttendanceMember)
  )
}

function isAttendanceMutationResult(
  value: unknown,
): value is AttendanceMutationResult {
  return (
    isRecord(value) &&
    typeof value.isPresent === 'boolean' &&
    typeof value.memberId === 'string'
  )
}

function isVisitor(value: unknown): value is Visitor {
  return (
    isRecord(value) &&
    (typeof value.convertedMemberId === 'string' || value.convertedMemberId === null) &&
    typeof value.createdAt === 'string' &&
    (typeof value.email === 'string' || value.email === null) &&
    typeof value.firstName === 'string' &&
    typeof value.id === 'string' &&
    typeof value.lastName === 'string' &&
    (typeof value.phone === 'string' || value.phone === null) &&
    (value.status === 'active' || value.status === 'converted') &&
    typeof value.updatedAt === 'string'
  )
}

function isVisitorConversionResult(value: unknown): value is VisitorConversionResult {
  return isRecord(value) && isMember(value.member) && isVisitor(value.visitor)
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

const isMinistryList = (value: unknown): value is Ministry[] =>
  Array.isArray(value) && value.every(isMinistry)

const isMinistryMemberList = (value: unknown): value is MinistryMember[] =>
  Array.isArray(value) && value.every(isMinistryMember)

const isVisitorList = (value: unknown): value is Visitor[] =>
  Array.isArray(value) && value.every(isVisitor)

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

export function getMinistries(
  accessToken: string,
  filters: MinistryListFilters = {},
) {
  const searchParameters = new URLSearchParams()
  if (filters.search) searchParameters.set('search', filters.search)
  if (filters.status) searchParameters.set('status', filters.status)
  const query = searchParameters.size > 0 ? `?${searchParameters}` : ''
  return requestApi(accessToken, `/ministries${query}`, isMinistryList)
}

export function getMinistry(accessToken: string, ministryId: string) {
  return requestApi(accessToken, `/ministries/${ministryId}`, isMinistry)
}

export function createMinistry(accessToken: string, input: MinistryInput) {
  return requestApi(accessToken, '/ministries', isMinistry, {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export function updateMinistry(
  accessToken: string,
  ministryId: string,
  input: MinistryInput,
) {
  return requestApi(accessToken, `/ministries/${ministryId}`, isMinistry, {
    body: JSON.stringify(input),
    method: 'PATCH',
  })
}

export function archiveMinistry(accessToken: string, ministryId: string) {
  return requestApi(accessToken, `/ministries/${ministryId}/archive`, isMinistry, {
    method: 'PATCH',
  })
}

export function getMinistryMembers(accessToken: string, ministryId: string) {
  return requestApi(
    accessToken,
    `/ministries/${ministryId}/members`,
    isMinistryMemberList,
  )
}

export function assignMemberToMinistry(
  accessToken: string,
  ministryId: string,
  memberId: string,
) {
  return requestApi(
    accessToken,
    `/ministries/${ministryId}/members`,
    isMinistryMember,
    { body: JSON.stringify({ memberId }), method: 'POST' },
  )
}

export function removeMemberFromMinistry(
  accessToken: string,
  ministryId: string,
  memberId: string,
) {
  return requestApi(
    accessToken,
    `/ministries/${ministryId}/members/${memberId}`,
    isMinistryMember,
    { method: 'DELETE' },
  )
}

export function getGatherings(accessToken: string, lifeGroupId: string) {
  return requestApi(
    accessToken,
    `/life-groups/${lifeGroupId}/gatherings`,
    isGatheringDirectory,
  )
}

export function getGathering(
  accessToken: string,
  lifeGroupId: string,
  gatheringId: string,
) {
  return requestApi(
    accessToken,
    `/life-groups/${lifeGroupId}/gatherings/${gatheringId}`,
    isLifeGroupGathering,
  )
}

export function createGathering(
  accessToken: string,
  lifeGroupId: string,
  input: GatheringInput,
) {
  return requestApi(
    accessToken,
    `/life-groups/${lifeGroupId}/gatherings`,
    isLifeGroupGathering,
    { body: JSON.stringify(input), method: 'POST' },
  )
}

export function updateGathering(
  accessToken: string,
  lifeGroupId: string,
  gatheringId: string,
  input: GatheringInput,
) {
  return requestApi(
    accessToken,
    `/life-groups/${lifeGroupId}/gatherings/${gatheringId}`,
    isLifeGroupGathering,
    { body: JSON.stringify(input), method: 'PATCH' },
  )
}

export function getGatheringAttendance(
  accessToken: string,
  lifeGroupId: string,
  gatheringId: string,
) {
  return requestApi(
    accessToken,
    `/life-groups/${lifeGroupId}/gatherings/${gatheringId}/attendance`,
    isGatheringAttendanceRoster,
  )
}

export function markGatheringAttendance(
  accessToken: string,
  lifeGroupId: string,
  gatheringId: string,
  memberId: string,
) {
  return requestApi(
    accessToken,
    `/life-groups/${lifeGroupId}/gatherings/${gatheringId}/attendance`,
    isAttendanceMutationResult,
    { body: JSON.stringify({ memberId }), method: 'POST' },
  )
}

export function removeGatheringAttendance(
  accessToken: string,
  lifeGroupId: string,
  gatheringId: string,
  memberId: string,
) {
  return requestApi(
    accessToken,
    `/life-groups/${lifeGroupId}/gatherings/${gatheringId}/attendance/${memberId}`,
    isAttendanceMutationResult,
    { method: 'DELETE' },
  )
}

export function getVisitors(
  accessToken: string,
  filters: VisitorListFilters = {},
) {
  const searchParameters = new URLSearchParams()
  if (filters.search) searchParameters.set('search', filters.search)
  if (filters.status) searchParameters.set('status', filters.status)
  const query = searchParameters.size > 0 ? `?${searchParameters}` : ''
  return requestApi(accessToken, `/visitors${query}`, isVisitorList)
}

export function getVisitor(accessToken: string, visitorId: string) {
  return requestApi(accessToken, `/visitors/${visitorId}`, isVisitor)
}

export function createVisitor(accessToken: string, input: VisitorInput) {
  return requestApi(accessToken, '/visitors', isVisitor, {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export function updateVisitor(
  accessToken: string,
  visitorId: string,
  input: VisitorInput,
) {
  return requestApi(accessToken, `/visitors/${visitorId}`, isVisitor, {
    body: JSON.stringify(input),
    method: 'PATCH',
  })
}

export function convertVisitor(
  accessToken: string,
  visitorId: string,
  lifeGroupId: string,
) {
  return requestApi(
    accessToken,
    `/visitors/${visitorId}/convert`,
    isVisitorConversionResult,
    { body: JSON.stringify({ lifeGroupId }), method: 'POST' },
  )
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
