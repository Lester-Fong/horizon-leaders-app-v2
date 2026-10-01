import { expect, type Page, type Response } from '@playwright/test'

export const ADMIN_ACCOUNT = {
  email: 'admin@example.test',
  password: 'Admin123!Aa',
}

export const LEADER_ACCOUNT = {
  email: 'leader1@example.test',
  password: 'Leader123!Aa',
}

export async function login(
  page: Page,
  account: { email: string; password: string },
) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

export function rowFor(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name }).first()
}

export async function chooseRowAction(page: Page, name: string, action: string) {
  const trigger = rowFor(page, name).getByRole('button', { name: `Actions for ${name}` })
  await trigger.focus()
  await trigger.press('Enter')
  const menuItem = page.getByRole('menuitem', { name: action, exact: true })
  await expect(menuItem).toBeVisible()
  await menuItem.press('Enter')
}

export async function searchMembers(page: Page, query: string) {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' &&
      url.pathname === '/api/members' &&
      url.searchParams.get('search') === query
  })
  await page.getByLabel('Search').fill(query)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  expect((await responsePromise).ok()).toBeTruthy()
  await expect(rowFor(page, query)).toBeVisible()
}

export async function searchVisitors(page: Page, query: string) {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return response.request().method() === 'GET' &&
      url.pathname === '/api/visitors' &&
      url.searchParams.get('search') === query
  })
  await page.getByLabel('Search').fill(query)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  expect((await responsePromise).ok()).toBeTruthy()
  await expect(rowFor(page, query)).toBeVisible()
}

interface MemberApiRecord {
  id: string
  qrToken: string
}

function isMemberDetailResponse(response: Response) {
  return response.request().method() === 'GET' && /\/api\/members\/[0-9a-f-]+$/i.test(response.url())
}

export async function openMemberDetailsAndReadRecord(page: Page, name: string) {
  const responsePromise = page.waitForResponse(isMemberDetailResponse)
  await chooseRowAction(page, name, 'View Member details')
  const response = await responsePromise
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { data?: Partial<MemberApiRecord> }
  expect(payload.data?.id).toEqual(expect.any(String))
  expect(payload.data?.qrToken).toEqual(expect.any(String))
  await expect(page.getByRole('dialog').getByRole('heading', { name })).toBeVisible()
  return payload.data as MemberApiRecord
}

export async function callApiAsCurrentBrowserUser(
  page: Page,
  path: string,
) {
  const apiBaseUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3000'
  return page.evaluate(async ({ apiBaseUrl: baseUrl, path: requestPath }) => {
    function findAccessToken(value: unknown): string | null {
      if (!value || typeof value !== 'object') return null
      if ('access_token' in value && typeof value.access_token === 'string') {
        return value.access_token
      }
      for (const nested of Object.values(value)) {
        const token = findAccessToken(nested)
        if (token) return token
      }
      return null
    }

    let accessToken: string | null = null
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      try {
        accessToken = findAccessToken(JSON.parse(raw))
      } catch {
        // Ignore unrelated local preferences that are not JSON.
      }
      if (accessToken) break
    }
    if (!accessToken) throw new Error('Authenticated Supabase browser session was not found.')

    const response = await window.fetch(`${baseUrl}/api${requestPath}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const body = await response.json().catch(() => null)
    return { body, status: response.status }
  }, { apiBaseUrl, path })
}

export async function browserPng(page: Page, color: string) {
  const encoded = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable.')
    context.fillStyle = fill
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  }, color)
  return Buffer.from(encoded, 'base64')
}
