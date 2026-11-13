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

  // An Admin-set password is temporary: the new user must choose their own first.
  await page.goto('/login')
  await page.getByLabel('Email').fill(userAccount.email)
  await page.getByLabel('Password').fill(userAccount.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Set your own password' })).toBeVisible()
  const blocked = await callApiAsCurrentBrowserUser(page, '/members')
  expect(blocked.status).toBe(403)
  const personalPassword = 'Personal3Horizon'
  await page.getByLabel('Current password').fill(userAccount.password)
  await page.getByLabel(/^New password/).fill(personalPassword)
  await page.getByLabel('Confirm new password').fill(personalPassword)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  userAccount.password = personalPassword

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

  await chooseRowAction(page, userNameEdited, 'View profile')
  const activityDialog = page.getByRole('dialog', { name: `${userNameEdited} profile` })
  const activity = activityDialog.getByRole('region', { name: 'Account activity' })
  await expect(activity).toContainText('Account created')
  await expect(activity).toContainText('Changed their password')
  await expect(activity).toContainText(`name: ${userName} → ${userNameEdited}`)
  await expect(activity).toContainText(`by ${admin.name}`)
  await activityDialog.getByRole('button', { name: 'Close', exact: true }).click()

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
  const deleteDialog = page.getByRole('dialog', { name: 'Delete user?' })
  await deleteDialog.getByRole('button', { name: 'Delete user' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: `${userNameEdited} was deleted. Their history was kept.` }),
  ).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: userNameEdited })).toHaveCount(0)
})

test('Admin deletes a user with history: sign-in removed, record kept, email reusable', async ({ page }) => {
  const admin = await fixtures.createUser('delete-admin', 'admin')
  const leader = await fixtures.createUser('deleted-leader', 'leader')
  const lifeGroup = await fixtures.createLifeGroupFor(leader.id, 'Deleted Leader Group')

  await login(page, admin)
  await openUsers(page)
  await searchUsers(page, fixtures.runId)

  await chooseRowAction(page, leader.name, 'Delete user')
  const deleteDialog = page.getByRole('dialog', { name: 'Delete user?' })
  await expect(deleteDialog).toContainText('This cannot be undone.')
  await expect(deleteDialog).not.toContainText('cannot be deleted')
  await expect(deleteDialog.getByText(`leads ${lifeGroup.name}`)).toBeVisible()
  await deleteDialog
    .getByLabel('New Leader')
    .selectOption({ label: `Reassign later — leave ${lifeGroup.name} without a Leader for now` })
  await deleteDialog.getByRole('button', { name: 'Delete user' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: `${leader.name} was deleted. Their history was kept.` }),
  ).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: leader.name })).toHaveCount(0)

  // Deleted users are listed read-only under Deleted, with the email they used.
  await page.getByLabel('Status').selectOption('deleted')
  const deletedRow = rowFor(page, leader.name)
  await expect(deletedRow).toContainText('Deleted')
  await expect(deletedRow).toContainText(leader.email)
  const trigger = deletedRow.getByRole('button', { name: `Actions for ${leader.name}` })
  await trigger.click()
  await expect(page.getByRole('menuitem')).toHaveText(['View profile'])
  await page.getByRole('menuitem', { name: 'View profile' }).click()
  const profileDialog = page.getByRole('dialog', { name: `${leader.name} profile` })
  await expect(profileDialog).toContainText(/Deleted \w/)
  await expect(profileDialog.getByRole('region', { name: 'Account activity' })).toBeVisible()
  await expect(profileDialog.getByRole('button', { name: 'Edit user' })).toHaveCount(0)
  await profileDialog.getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('link', { name: 'Life Groups', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Life Groups', exact: true })).toBeVisible()
  await expect(rowFor(page, lifeGroup.name)).toContainText(`${leader.name} (deleted)`)
  await expect(rowFor(page, lifeGroup.name)).toContainText('Needs new Leader · Leader was deleted')

  // The old sign-in no longer works.
  await signOut(page)
  await page.getByLabel('Email').fill(leader.email)
  await page.getByLabel('Password').fill(leader.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('#login-error')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)

  // The email can be used for a new account.
  await login(page, admin)
  await openUsers(page)
  await page.getByRole('button', { name: 'New User' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create a user' })
  const replacementName = fixtures.nameFor('Replacement Leader')
  await createDialog.getByLabel('Name').fill(replacementName)
  await createDialog.getByLabel('Email').fill(leader.email)
  await createDialog.getByLabel('Role').selectOption('leader')
  await createDialog.getByLabel('Initial password').fill('Welcome2Horizon')
  await createDialog.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${replacementName} was created.` })).toBeVisible()
  await fixtures.trackUserByEmail(leader.email)
})

test('Admin cannot remove their own access and can deactivate an assigned Leader', async ({ page }) => {
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

  await chooseRowAction(page, leader.name, 'Deactivate user')
  const deactivateDialog = page.getByRole('dialog', { name: 'Deactivate user?' })
  await expect(deactivateDialog.getByText(`leads ${lifeGroup.name}`)).toBeVisible()
  await deactivateDialog.getByRole('button', { name: 'Cancel' }).click()

  const ownTrigger = rowFor(page, admin.name).getByRole('button', { name: `Actions for ${admin.name}` })
  await ownTrigger.focus()
  await ownTrigger.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Reset password', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: 'Deactivate user', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: 'Delete user', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Deactivating an assigned Leader is allowed once the Admin explicitly chooses to reassign later;
  // Life Groups then flags the group for reassignment.
  await chooseRowAction(page, leader.name, 'Deactivate user')
  const confirmDialog = page.getByRole('dialog', { name: 'Deactivate user?' })
  const confirmButton = confirmDialog.getByRole('button', { name: 'Deactivate user' })
  const newLeader = confirmDialog.getByLabel('New Leader')
  const reassignLater = `Reassign later — leave ${lifeGroup.name} without a Leader for now`
  await expect(newLeader.getByRole('option', { name: reassignLater })).toHaveCount(1)
  // With other unassigned Leaders available, nothing is preselected and Deactivate waits for a choice.
  if ((await newLeader.inputValue()) === '') await expect(confirmButton).toBeDisabled()
  await newLeader.selectOption({ label: reassignLater })
  await confirmButton.click()
  await expect(page.getByRole('status').filter({ hasText: `${leader.name} was deactivated.` })).toBeVisible()

  await page.getByRole('link', { name: 'Life Groups', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Life Groups', exact: true })).toBeVisible()
  const warning = page.getByRole('status').filter({ hasText: /needs? a new Leader/ })
  await expect(warning).toContainText(`${lifeGroup.name}: leader is deactivated (${leader.name})`)
  await expect(rowFor(page, lifeGroup.name)).toContainText('Needs new Leader · Leader is deactivated')

  // Admins change their own password on My profile; this device stays signed in.
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Change password' }).click()
  const passwordDialog = page.getByRole('dialog', { name: 'Change your password' })
  const ownNewPassword = 'Profile4Horizon'
  await passwordDialog.getByLabel('Current password').fill(admin.password)
  await passwordDialog.getByLabel(/^New password/).fill(ownNewPassword)
  await passwordDialog.getByLabel('Confirm new password').fill(ownNewPassword)
  await passwordDialog.getByRole('button', { name: 'Change password' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Password changed. Other devices were signed out.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible()
  admin.password = ownNewPassword
})

test('Admin hands a Life Group to another Leader while deactivating its Leader', async ({ page }) => {
  const admin = await fixtures.createUser('handover-admin', 'admin')
  const leader = await fixtures.createUser('handover-leader', 'leader')
  const successor = await fixtures.createUser('handover-successor', 'leader')
  const lifeGroup = await fixtures.createLifeGroupFor(leader.id, 'Handover Group')

  await login(page, admin)
  await openUsers(page)
  await searchUsers(page, fixtures.runId)
  await chooseRowAction(page, leader.name, 'Deactivate user')
  const deactivateDialog = page.getByRole('dialog', { name: 'Deactivate user?' })
  const newLeader = deactivateDialog.getByLabel('New Leader')
  await expect(newLeader.getByRole('option', { name: successor.name })).toHaveCount(1)
  await expect(newLeader.getByRole('option', { name: leader.name })).toHaveCount(0)
  await newLeader.selectOption({ label: successor.name })
  await deactivateDialog.getByRole('button', { name: 'Deactivate user' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: `${lifeGroup.name} is now led by ${successor.name}.` }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Life Groups', exact: true }).click()
  await expect(rowFor(page, lifeGroup.name)).toContainText(successor.name)
  await expect(rowFor(page, lifeGroup.name)).not.toContainText('Needs new Leader')
})
