import { expect, test, type Page } from '@playwright/test'

import {
  callApiAsCurrentBrowserUser,
  chooseRowAction,
  login,
  rowFor,
  signOut,
} from './helpers'
import { IsolatedFixtures } from './local-supabase'

/**
 * Self-contained Users journey: it provisions its own Admin, Leader, and Life Group on local
 * Supabase, never touches demo/development records, and removes only what it created.
 * It does not require `demo:seed`/`demo:reset`.
 */

test.describe.configure({ mode: 'serial' })

let fixtures: IsolatedFixtures

test.beforeAll(() => {
  fixtures = new IsolatedFixtures()
})

test.afterAll(async () => {
  await fixtures.cleanup()
})

async function openUsers(page: Page) {
  await page.getByRole('link', { name: /^Users\b/ }).click()
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
}

async function searchUsers(page: Page, query: string) {
  await page.getByLabel('Search').fill(query)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
}

test('Admin manages a staff user through create, sign-in, edit, deactivate, reactivate, and delete', async ({ page }) => {
  const admin = await fixtures.createUser('admin', 'admin')
  const userName = fixtures.nameFor('Users Leader')
  const userNameEdited = `${userName} Edited`
  const userAccount = { email: fixtures.emailFor('users-leader'), password: 'Welcome2Horizon' }

  await login(page, admin)
  await openUsers(page)
  await searchUsers(page, fixtures.runId)
  await expect(rowFor(page, admin.name)).toContainText('(You)')

  await page.getByRole('button', { name: 'New User' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create a user' })
  await createDialog.getByLabel('Name').fill(userName)
  await createDialog.getByLabel('Email').fill(userAccount.email)
  await createDialog.getByLabel('Role').selectOption('leader')
  await createDialog.getByLabel('Initial password').fill('weak')
  await createDialog.getByRole('button', { name: 'Create user' }).click()
  await expect(createDialog.getByRole('alert').filter({ hasText: 'uppercase letter' })).toBeVisible()
  await createDialog.getByLabel('Initial password').fill(userAccount.password)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await createDialog.getByRole('button', { name: 'Copy password' }).click()
  await expect(createDialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(userAccount.password)
  await createDialog.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${userName} was created.` })).toBeVisible()
  await fixtures.trackUserByEmail(userAccount.email)
  await expect(rowFor(page, userName)).toContainText('Leader')
  await signOut(page)

  await login(page, userAccount)
  await expect(page.getByRole('link', { name: /^Users\b/ })).toHaveCount(0)
  const denied = await callApiAsCurrentBrowserUser(page, '/users')
  expect(denied.status).toBe(403)
  await page.getByRole('link', { name: `My profile: ${userName}` }).click()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  await expect(page.getByRole('main')).toContainText(userAccount.email)
  await expect(page.getByRole('main')).toContainText('Leader')
  await expect(page.getByRole('main')).toContainText('Not leading a Life Group')
  const otherProfile = await callApiAsCurrentBrowserUser(page, `/users/${admin.id}`)
  expect(otherProfile.status).toBe(403)
  await signOut(page)

  await login(page, admin)
  await openUsers(page)
  await searchUsers(page, fixtures.runId)
  await chooseRowAction(page, userName, 'Edit user')
  const editDialog = page.getByRole('dialog', { name: `Edit ${userName}` })
  await editDialog.getByLabel('Name').fill(userNameEdited)
  await editDialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${userNameEdited} was updated.` })).toBeVisible()

  await chooseRowAction(page, userNameEdited, 'Deactivate user')
  const deactivateDialog = page.getByRole('dialog', { name: 'Deactivate user?' })
  await deactivateDialog.getByRole('button', { name: 'Deactivate user' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${userNameEdited} was deactivated.` })).toBeVisible()
  await page.getByLabel('Status').selectOption('inactive')
  await expect(rowFor(page, userNameEdited)).toContainText('Inactive')
  await chooseRowAction(page, userNameEdited, 'Reactivate user')
  await expect(page.getByRole('status').filter({ hasText: `${userNameEdited} was reactivated.` })).toBeVisible()

  await page.getByLabel('Status').selectOption('all')
  await chooseRowAction(page, userNameEdited, 'Delete user')
  const deleteDialog = page.getByRole('dialog', { name: 'Delete user permanently?' })
  await deleteDialog.getByRole('button', { name: 'Delete user' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${userNameEdited} was permanently deleted.` })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: userNameEdited })).toHaveCount(0)
})

test('Admin cannot delete a user with history or remove their own access', async ({ page }) => {
  const admin = await fixtures.createUser('guard-admin', 'admin')
  const leader = await fixtures.createUser('history-leader', 'leader')
  const lifeGroup = await fixtures.createLifeGroupFor(leader.id)

  await login(page, admin)
  await openUsers(page)
  await searchUsers(page, fixtures.runId)
  await expect(rowFor(page, leader.name)).toContainText(lifeGroup.name)

  await chooseRowAction(page, leader.name, 'View profile')
  const profileDialog = page.getByRole('dialog', { name: `${leader.name} profile` })
  await expect(profileDialog).toContainText(leader.email)
  await expect(profileDialog).toContainText(lifeGroup.name)
  await expect(profileDialog).toContainText('Last sign-in')
  await profileDialog.getByRole('button', { name: 'Close', exact: true }).click()

  await chooseRowAction(page, leader.name, 'Delete user')
  const deleteDialog = page.getByRole('dialog', { name: 'Delete user permanently?' })
  await deleteDialog.getByRole('button', { name: 'Delete user' }).click()
  await expect(deleteDialog.getByRole('alert').filter({ hasText: 'Deactivate the account instead' })).toBeVisible()
  await deleteDialog.getByRole('button', { name: 'Cancel' }).click()

  await chooseRowAction(page, leader.name, 'Deactivate user')
  const deactivateDialog = page.getByRole('dialog', { name: 'Deactivate user?' })
  await expect(deactivateDialog.getByText(`leads ${lifeGroup.name}`)).toBeVisible()
  await deactivateDialog.getByRole('button', { name: 'Cancel' }).click()

  const ownTrigger = rowFor(page, admin.name).getByRole('button', { name: `Actions for ${admin.name}` })
  await ownTrigger.focus()
  await ownTrigger.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Deactivate user', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: 'Delete user', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Deactivating an assigned Leader is allowed; Life Groups then flags the group for reassignment.
  await chooseRowAction(page, leader.name, 'Deactivate user')
  await page.getByRole('dialog', { name: 'Deactivate user?' }).getByRole('button', { name: 'Deactivate user' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${leader.name} was deactivated.` })).toBeVisible()

  await page.getByRole('link', { name: 'Life Groups', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Life Groups', exact: true })).toBeVisible()
  const warning = page.getByRole('status').filter({ hasText: /needs? a new Leader/ })
  await expect(warning).toContainText(`${lifeGroup.name}: leader is deactivated (${leader.name})`)
  await expect(rowFor(page, lifeGroup.name)).toContainText('Needs new Leader · Leader is deactivated')
})
