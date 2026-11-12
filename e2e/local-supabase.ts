import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Isolated E2E fixtures for local Supabase.
 *
 * Every record created here carries a per-run marker, is tracked by id, and is the only thing
 * cleanup ever deletes. Existing demo/development records are never read for mutation, updated,
 * or deleted. All targets must be loopback-local; anything else aborts before a request is sent.
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

function readEnvFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=')
          return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')]
        }),
    )
  } catch {
    return {}
  }
}

function assertLoopback(label: string, value: string | undefined): string {
  if (!value) throw new Error(`${label} is not configured; refusing to run isolated E2E fixtures.`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} is not a valid URL; refusing to run isolated E2E fixtures.`)
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${label} must be a loopback http:// URL (local Supabase only); refusing to continue.`)
  }
  return value.replace(/\/$/, '')
}

/** Resolves and verifies that the backend, frontend, and fixture targets are all local. */
export function readLocalSupabaseConfig() {
  const backendEnv = readEnvFile(resolve('backend/.env'))
  const frontendEnv = readEnvFile(resolve('frontend/.env'))
  const supabaseUrl = assertLoopback(
    'SUPABASE_URL',
    process.env.E2E_SUPABASE_URL ?? backendEnv.SUPABASE_URL,
  )
  // The servers under test must use the same local project the fixtures write to.
  assertLoopback('backend/.env SUPABASE_URL', backendEnv.SUPABASE_URL)
  assertLoopback('frontend/.env VITE_SUPABASE_URL', frontendEnv.VITE_SUPABASE_URL)
  assertLoopback('frontend/.env VITE_API_URL', frontendEnv.VITE_API_URL)
  assertLoopback('E2E backend URL', process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3000')

  const serviceRoleKey =
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? backendEnv.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in backend/.env.')
  }
  return { serviceRoleKey, supabaseUrl }
}

interface FixtureUser {
  email: string
  id: string
  name: string
  password: string
}

export class IsolatedFixtures {
  /** Unique per run; embedded in every created email and name. */
  readonly runId = randomUUID().slice(0, 8)
  private readonly userIds = new Set<string>()
  private readonly lifeGroupIds = new Set<string>()
  private readonly config = readLocalSupabaseConfig()

  emailFor(label: string) {
    return `e2e-${label}-${this.runId}@example.test`
  }

  nameFor(label: string) {
    return `E2E ${label} ${this.runId}`
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.config.supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      redirect: 'error',
    })
    const body: unknown = await response.json().catch(() => undefined)
    return { body, ok: response.ok, status: response.status }
  }

  async createUser(label: string, role: 'admin' | 'leader'): Promise<FixtureUser> {
    const user = {
      email: this.emailFor(label),
      name: this.nameFor(label),
      password: `E2e${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    }
    const created = await this.request('/auth/v1/admin/users', {
      body: JSON.stringify({
        email: user.email,
        email_confirm: true,
        password: user.password,
        user_metadata: { name: user.name },
      }),
      method: 'POST',
    })
    const id = (created.body as { id?: unknown } | undefined)?.id
    if (!created.ok || typeof id !== 'string') {
      throw new Error(`Fixture user could not be created (HTTP ${created.status}).`)
    }
    this.userIds.add(id)

    const profile = await this.request(`/rest/v1/profiles?id=eq.${id}`, {
      body: JSON.stringify({ role }),
      method: 'PATCH',
    })
    if (!profile.ok) throw new Error(`Fixture role could not be set (HTTP ${profile.status}).`)

    return { ...user, id }
  }

  /** Gives a fixture leader Horizon history so permanent delete must be refused. */
  async createLifeGroupFor(leaderId: string) {
    const name = this.nameFor('Life Group')
    const created = await this.request('/rest/v1/life_groups', {
      body: JSON.stringify({ leader_profile_id: leaderId, name }),
      headers: { Prefer: 'return=representation' },
      method: 'POST',
    })
    const id = (created.body as Array<{ id?: unknown }> | undefined)?.[0]?.id
    if (!created.ok || typeof id !== 'string') {
      throw new Error(`Fixture Life Group could not be created (HTTP ${created.status}).`)
    }
    this.lifeGroupIds.add(id)
    return { id, name }
  }

  /** Tracks a user created through the UI, found only by this run's unique email. */
  async trackUserByEmail(email: string) {
    if (!email.includes(this.runId)) throw new Error('Only this run\'s fixture emails can be tracked.')
    for (let page = 1; page <= 50; page += 1) {
      const listed = await this.request(`/auth/v1/admin/users?page=${page}&per_page=200`)
      const users = (listed.body as { users?: Array<{ email?: string; id: string }> } | undefined)?.users ?? []
      const match = users.find((user) => user.email === email)
      if (match) {
        this.userIds.add(match.id)
        return
      }
      if (users.length < 200) return
    }
  }

  /** Deletes only what this run created: Life Groups first (they reference users), then users. */
  async cleanup() {
    const failures: string[] = []
    for (const id of this.lifeGroupIds) {
      const result = await this.request(`/rest/v1/life_groups?id=eq.${id}`, { method: 'DELETE' })
      if (!result.ok) failures.push(`life group ${id} (HTTP ${result.status})`)
      else this.lifeGroupIds.delete(id)
    }
    for (const id of this.userIds) {
      const result = await this.request(`/auth/v1/admin/users/${id}`, { method: 'DELETE' })
      if (!result.ok && result.status !== 404) failures.push(`user ${id} (HTTP ${result.status})`)
      else this.userIds.delete(id)
    }
    if (failures.length > 0) {
      throw new Error(`E2E cleanup could not remove: ${failures.join(', ')}`)
    }
  }
}
