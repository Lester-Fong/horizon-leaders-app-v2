import {
  ArrowLeft,
  CalendarDays,
  Eye,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  GatheringFormModal,
  type GatheringFormContext,
} from '../components/gatherings/GatheringFormModal'
import { Button, LinkButton } from '../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
} from '../components/ui/Feedback'
import { FormField, TextInput } from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { RowActionsMenu, type RowAction } from '../components/ui/RowActionsMenu'
import {
  ApiError,
  createGathering,
  getGathering,
  getGatheringAttendance,
  getGatherings,
  markGatheringAttendance,
  removeGatheringAttendance,
  updateGathering,
  type GatheringAttendanceMember,
  type GatheringInput,
  type GatheringLifeGroup,
  type LifeGroupGathering,
} from '../lib/api'
import { supabase } from '../lib/supabase'

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.')
  }
  return data.session.access_token
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Gathering data is unavailable right now. Please try again.'
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
}

function gatheringName(gathering: LifeGroupGathering) {
  return gathering.title ?? `Gathering on ${formatDate(gathering.gatheringDate)}`
}

function memberName(member: GatheringAttendanceMember) {
  return `${member.firstName} ${member.lastName}`
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="hm-label">{label}</dt>
      <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
        {value}
      </dd>
    </div>
  )
}

export function GatheringsPage() {
  const { lifeGroupId } = useParams()
  const navigate = useNavigate()
  const [lifeGroup, setLifeGroup] = useState<GatheringLifeGroup | null>(null)
  const [gatherings, setGatherings] = useState<LifeGroupGathering[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formContext, setFormContext] = useState<GatheringFormContext | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<LifeGroupGathering | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [attendanceTarget, setAttendanceTarget] = useState<LifeGroupGathering | null>(null)
  const [roster, setRoster] = useState<GatheringAttendanceMember[]>([])
  const [attendanceSearch, setAttendanceSearch] = useState('')
  const [attendanceError, setAttendanceError] = useState<string | null>(null)
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false)
  const [changingMemberId, setChangingMemberId] = useState<string | null>(null)

  const loadDirectory = useCallback(async () => {
    if (!lifeGroupId) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      const directory = await getGatherings(token, lifeGroupId)
      setLifeGroup(directory.lifeGroup)
      setGatherings(directory.gatherings)
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [lifeGroupId])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDirectory(), 0)
    return () => window.clearTimeout(timer)
  }, [loadDirectory])

  async function openDetails(gathering: LifeGroupGathering) {
    if (!lifeGroupId) return
    setDetailId(gathering.id)
    setDetail(null)
    setDetailError(null)
    setIsDetailLoading(true)
    try {
      const token = await getAccessToken()
      setDetail(await getGathering(token, lifeGroupId, gathering.id))
    } catch (error) {
      setDetailError(errorMessage(error))
    } finally {
      setIsDetailLoading(false)
    }
  }

  async function openAttendance(gathering: LifeGroupGathering) {
    if (!lifeGroupId) return
    setAttendanceTarget(gathering)
    setRoster([])
    setAttendanceSearch('')
    setAttendanceError(null)
    setIsAttendanceLoading(true)
    try {
      const token = await getAccessToken()
      const result = await getGatheringAttendance(token, lifeGroupId, gathering.id)
      setRoster(result.members)
    } catch (error) {
      setAttendanceError(errorMessage(error))
    } finally {
      setIsAttendanceLoading(false)
    }
  }

  async function saveGathering(input: GatheringInput) {
    if (!lifeGroupId) {
      throw new ApiError(404, 'LIFE_GROUP_NOT_FOUND', 'Life Group was not found.')
    }
    const token = await getAccessToken()
    if (formContext?.mode === 'edit') {
      return updateGathering(token, lifeGroupId, formContext.gathering.id, input)
    }
    return createGathering(token, lifeGroupId, input)
  }

  function handleGatheringSaved(saved: LifeGroupGathering) {
    const wasEditing = formContext?.mode === 'edit'
    setFormContext(null)
    setNotice(`${gatheringName(saved)} was ${wasEditing ? 'updated' : 'created'}.`)
    void loadDirectory()
  }

  async function changeAttendance(member: GatheringAttendanceMember) {
    if (!lifeGroupId || !attendanceTarget) return
    setChangingMemberId(member.id)
    setAttendanceError(null)
    try {
      const token = await getAccessToken()
      if (member.isPresent) {
        await removeGatheringAttendance(
          token,
          lifeGroupId,
          attendanceTarget.id,
          member.id,
        )
      } else {
        await markGatheringAttendance(
          token,
          lifeGroupId,
          attendanceTarget.id,
          member.id,
        )
      }
      const isPresent = !member.isPresent
      setRoster((current) =>
        current.map((currentMember) =>
          currentMember.id === member.id
            ? { ...currentMember, isPresent }
            : currentMember,
        ),
      )
      setGatherings((current) =>
        current.map((gathering) =>
          gathering.id === attendanceTarget.id
            ? {
                ...gathering,
                attendanceCount: Math.max(
                  0,
                  gathering.attendanceCount + (isPresent ? 1 : -1),
                ),
              }
            : gathering,
        ),
      )
      setAttendanceTarget((current) =>
        current
          ? {
              ...current,
              attendanceCount: Math.max(
                0,
                current.attendanceCount + (isPresent ? 1 : -1),
              ),
            }
          : current,
      )
    } catch (error) {
      setAttendanceError(errorMessage(error))
    } finally {
      setChangingMemberId(null)
    }
  }

  const filteredRoster = useMemo(() => {
    const query = attendanceSearch.trim().toLocaleLowerCase('en')
    if (!query) return roster
    return roster.filter((member) =>
      [
        member.firstName,
        member.lastName,
        member.email ?? '',
        member.phone ?? '',
      ].some((value) => value.toLocaleLowerCase('en').includes(query)),
    )
  }, [attendanceSearch, roster])

  const currentMembers = filteredRoster.filter((member) => member.isEligible)
  const historicalMembers = filteredRoster.filter(
    (member) => !member.isEligible && member.isPresent,
  )
  const presentCount = roster.filter((member) => member.isPresent).length

  function rowActions(gathering: LifeGroupGathering): RowAction[] {
    return [
      {
        icon: Eye,
        label: 'View Gathering details',
        onSelect: () => void openDetails(gathering),
      },
      {
        icon: ListChecks,
        label: 'Manage attendance',
        onSelect: () => void openAttendance(gathering),
      },
      {
        icon: Pencil,
        label: 'Edit Gathering',
        onSelect: () => setFormContext({ gathering, mode: 'edit' }),
      },
    ]
  }

  if (!lifeGroupId) {
    return (
      <ErrorState
        title="Life Group could not be identified"
        description="Return to Life Groups and choose View Gatherings again."
        action={<Button onClick={() => navigate('/life-groups')}>Life Groups</Button>}
      />
    )
  }

  if (isLoading) {
    return (
      <LoadingState
        title="Loading Gatherings"
        description="Preparing this Life Group's meeting history."
      />
    )
  }

  if (loadError && !lifeGroup) {
    return (
      <ErrorState
        title="Gatherings could not be loaded"
        description={loadError}
        action={<Button onClick={() => void loadDirectory()}>Try again</Button>}
      />
    )
  }

  return (
    <div className="space-y-8">
      <LinkButton to="/life-groups" variant="ghost" size="sm" className="-ml-3">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Life Groups
      </LinkButton>

      <PageHeader
        marker="Life Group / Gatherings"
        title={lifeGroup?.name ?? 'Gatherings'}
        description="Review meeting history, keep practical notes, and record Member presence for this Life Group."
        actions={
          <>
            <Button
              disabled={!lifeGroup?.isActive}
              title={lifeGroup?.isActive ? undefined : 'New Gatherings require an active Life Group'}
              onClick={() => setFormContext({ mode: 'create' })}
            >
              <Plus aria-hidden="true" className="size-4" />
              New Gathering
            </Button>
            <Button variant="secondary" onClick={() => void loadDirectory()}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
          </>
        }
      />

      {lifeGroup && !lifeGroup.isActive && (
        <FeedbackBanner title="Archived Life Group" tone="info">
          Historical Gatherings remain available to review and correct. New Gatherings are closed until the Life Group is active again.
        </FeedbackBanner>
      )}
      {notice && <FeedbackBanner tone="success">{notice}</FeedbackBanner>}
      {loadError && <FeedbackBanner tone="error">{loadError}</FeedbackBanner>}

      <section aria-labelledby="gathering-history-heading" className="space-y-5">
        <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="hm-label">Meeting history</p>
            <h2 id="gathering-history-heading" className="mt-1 text-base font-semibold text-ink">
              Gatherings
            </h2>
          </div>
          <p className="font-mono text-xs text-muted" aria-live="polite">
            {gatherings.length} {gatherings.length === 1 ? 'record' : 'records'}
          </p>
        </div>

        {gatherings.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No Gatherings recorded"
            description={
              lifeGroup?.isActive
                ? 'Use New Gathering above to record this Life Group’s first meeting.'
                : 'This archived Life Group has no recorded Gathering history.'
            }
          />
        ) : (
          <ResponsiveTable
            caption={`Gatherings for ${lifeGroup?.name ?? 'Life Group'}`}
            tableClassName="horizon-table--gatherings"
          >
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Topic</th>
                <th scope="col">Location</th>
                <th scope="col">Attendance</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {gatherings.map((gathering) => (
                <tr key={gathering.id}>
                  <td className="gathering-cell-date">
                    <span className="hm-table-mobile-label">Date</span>
                    <button
                      type="button"
                      className="min-h-10 text-left font-semibold text-ink underline-offset-4 hover:underline"
                      onClick={() => void openDetails(gathering)}
                    >
                      {formatDate(gathering.gatheringDate)}
                    </button>
                  </td>
                  <td className="gathering-cell-title">
                    <span className="hm-table-mobile-label">Topic</span>
                    <span className="text-sm text-ink">{gathering.title ?? 'Untitled Gathering'}</span>
                  </td>
                  <td className="gathering-cell-location">
                    <span className="hm-table-mobile-label">Location</span>
                    <span className="text-sm text-muted">{gathering.location ?? 'Not recorded'}</span>
                  </td>
                  <td className="gathering-cell-attendance">
                    <span className="hm-table-mobile-label">Attendance</span>
                    <span className="font-mono text-xs font-semibold text-ink">
                      {gathering.attendanceCount} present
                    </span>
                  </td>
                  <td className="gathering-cell-actions text-right">
                    <RowActionsMenu
                      label={`Actions for ${gatheringName(gathering)}`}
                      actions={rowActions(gathering)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        )}
      </section>

      {formContext && lifeGroup && (
        <GatheringFormModal
          context={formContext}
          lifeGroupName={lifeGroup.name}
          onClose={() => setFormContext(null)}
          onSave={saveGathering}
          onSaved={handleGatheringSaved}
        />
      )}

      <Modal
        className="max-w-2xl"
        isOpen={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        preventClose={isDetailLoading}
        title={detail ? gatheringName(detail) : 'Gathering details'}
        description="Life Group meeting record and attendance summary."
      >
        {isDetailLoading ? (
          <LoadingState title="Loading Gathering" description="Retrieving the meeting record." />
        ) : detailError ? (
          <FeedbackBanner tone="error">{detailError}</FeedbackBanner>
        ) : detail ? (
          <div>
            <dl>
              <DetailItem label="Life Group" value={detail.lifeGroup.name} />
              <DetailItem label="Date" value={formatDate(detail.gatheringDate)} />
              <DetailItem label="Topic or title" value={detail.title ?? 'Not recorded'} />
              <DetailItem label="Location" value={detail.location ?? 'Not recorded'} />
              <DetailItem label="Notes" value={detail.notes ?? 'No notes recorded'} />
              <DetailItem label="Recorded by" value={detail.createdBy.name} />
              <DetailItem label="Attendance" value={`${detail.attendanceCount} present`} />
            </dl>
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setDetailId(null)}>Close</Button>
              <Button variant="secondary" onClick={() => void openAttendance(detail)}>
                <ListChecks aria-hidden="true" className="size-4" />
                Manage attendance
              </Button>
              <Button onClick={() => {
                setDetailId(null)
                setFormContext({ gathering: detail, mode: 'edit' })
              }}>
                <Pencil aria-hidden="true" className="size-4" />
                Edit
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        className="max-w-3xl"
        isOpen={Boolean(attendanceTarget)}
        onClose={() => !changingMemberId && setAttendanceTarget(null)}
        preventClose={Boolean(changingMemberId)}
        title={attendanceTarget ? `Attendance — ${gatheringName(attendanceTarget)}` : 'Manage attendance'}
        description="Presence is recorded manually. An unchecked Member has no attendance record; absence is not stored."
      >
        {attendanceError && (
          <FeedbackBanner className="mb-5" tone="error">{attendanceError}</FeedbackBanner>
        )}
        {isAttendanceLoading ? (
          <LoadingState title="Loading attendance" description="Preparing the current Life Group roster and preserved historical records." />
        ) : attendanceTarget ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
              <FormField id="attendance-search" label="Find a Member" description="Name, email, or phone">
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" />
                  <TextInput
                    id="attendance-search"
                    data-modal-autofocus
                    type="search"
                    className="pl-10"
                    value={attendanceSearch}
                    placeholder="Search roster"
                    disabled={Boolean(changingMemberId)}
                    onChange={(event) => setAttendanceSearch(event.target.value)}
                  />
                </div>
              </FormField>
              <p className="shrink-0 font-mono text-xs font-semibold text-ink" aria-live="polite">
                {presentCount} present
              </p>
            </div>

            <section aria-labelledby="current-roster-heading">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="hm-label">Current Life Group</p>
                  <h3 id="current-roster-heading" className="mt-1 text-base font-semibold text-ink">Member roster</h3>
                </div>
                <span className="font-mono text-xs text-muted">{currentMembers.length}</span>
              </div>
              {currentMembers.length === 0 ? (
                <p className="py-7 text-sm text-muted">No current Members match this search.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {currentMembers.map((member) => (
                    <li key={member.id} className="flex items-center gap-4 py-3">
                      <input
                        id={`attendance-${member.id}`}
                        type="checkbox"
                        className="size-5 shrink-0 accent-[var(--hm-ink)]"
                        checked={member.isPresent}
                        disabled={Boolean(changingMemberId)}
                        onChange={() => void changeAttendance(member)}
                      />
                      <label htmlFor={`attendance-${member.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block text-sm font-semibold text-ink">{memberName(member)}</span>
                        <span className="mt-1 block font-mono text-xs text-muted">
                          {member.isActive ? 'Active Member' : 'Archived Member'}{member.isPresent ? ' / Present' : ' / Not marked'}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {historicalMembers.length > 0 && (
              <section aria-labelledby="historical-attendance-heading">
                <p className="hm-label">Preserved history</p>
                <h3 id="historical-attendance-heading" className="mt-1 text-base font-semibold text-ink">
                  Members now in another Life Group
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  These presence records remain historical truth. They may be removed to correct an error, but cannot be added back while the Member belongs elsewhere.
                </p>
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {historicalMembers.map((member) => (
                    <li key={member.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{memberName(member)}</p>
                        <p className="mt-1 font-mono text-xs text-muted">
                          Present / Now in {member.currentLifeGroup.name}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={Boolean(changingMemberId)}
                        onClick={() => void changeAttendance(member)}
                      >
                        Remove record
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex justify-end border-t border-line pt-5">
              <Button variant="secondary" disabled={Boolean(changingMemberId)} onClick={() => setAttendanceTarget(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
