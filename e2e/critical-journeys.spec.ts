import { expect, test, type Page } from '@playwright/test'

import {
  ADMIN_ACCOUNT,
  LEADER_ACCOUNT,
  browserPng,
  callApiAsCurrentBrowserUser,
  chooseRowAction,
  login,
  openMemberDetailsAndReadRecord,
  rowFor,
  searchMembers,
  searchVisitors,
  signOut,
} from './helpers'

const ADMIN_MEMBER = 'QA003 Admin Member'
const ADMIN_MEMBER_EDITED = 'QA003 Admin Member'
const ADMIN_VISITOR = 'QA003 Admin Convert'
const ADMIN_HARVEST_VISITOR = 'QA003 Admin Harvest'
const ADMIN_SUNDAY_VISITOR = 'QA003 Admin Sunday'
const LEADER_MEMBER = 'QA003 Leader Member'
const LEADER_HARVEST_VISITOR = 'QA003 Leader Harvest'
const OPEN_SERVICE = 'Upcoming Sunday Service'
const OPEN_HARVEST = 'Bring a Friend Dinner'

async function navigate(page: Page, destination: string) {
  await page.getByRole('link', { name: destination, exact: true }).click()
  await expect(page.getByRole('heading', { name: destination, exact: true })).toBeVisible()
}

async function openSundayService(page: Page) {
  await navigate(page, 'Events')
  await chooseRowAction(page, OPEN_SERVICE, 'Open Service')
  await expect(page.getByRole('heading', { name: OPEN_SERVICE })).toBeVisible()
}

async function openHarvest(page: Page) {
  await navigate(page, 'Events')
  await page.getByRole('button', { name: /Harvest\s+\d+ Events/ }).click()
  await chooseRowAction(page, OPEN_HARVEST, 'Open Harvest')
  await expect(page.getByRole('heading', { name: OPEN_HARVEST })).toBeVisible()
}

async function registerNewHarvestVisitor(page: Page, firstName: string, lastName: string, email: string) {
  await page.getByRole('button', { name: 'Register Visitor' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Register Harvest Visitor' })
  await dialog.getByRole('tab', { name: 'New Visitor' }).click()
  await dialog.getByLabel('First name').fill(firstName)
  await dialog.getByLabel('Last name').fill(lastName)
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByRole('button', { name: 'Register Visitor' }).click()
  await expect(rowFor(page, `${firstName} ${lastName}`)).toBeVisible()
}

async function createHarvestFollowUp(page: Page, visitorName: string) {
  const participantRow = rowFor(page, visitorName)
  await participantRow.getByRole('button', { name: 'Record decision' }).click()
  const interestDialog = page.getByRole('dialog', { name: 'Record Sunday interest' })
  await interestDialog.getByRole('button', { name: 'Interested', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `${visitorName} is interested in Sunday Service.` })).toBeVisible()
}

async function completeFollowUp(page: Page, visitorName: string, note: string) {
  await navigate(page, 'Follow Up')
  await expect(rowFor(page, visitorName)).toBeVisible()
  await chooseRowAction(page, visitorName, `Complete Follow Up for ${visitorName}`)
  const dialog = page.getByRole('dialog', { name: 'Complete Follow Up?' })
  await dialog.getByLabel('Completion note').fill(note)
  await dialog.getByRole('button', { name: 'Complete Follow Up' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${visitorName} was completed and moved to History.` })).toBeVisible()
  await page.getByRole('button', { name: 'History' }).click()
  const historyRow = rowFor(page, visitorName)
  await expect(historyRow).toBeVisible()
  await expect(historyRow).toContainText(note)
}

test.describe.configure({ mode: 'serial' })

test('Admin manages a Member, permanent QR, private photo lifecycle, edit, and archive', async ({ page }) => {
  await login(page, ADMIN_ACCOUNT)
  await navigate(page, 'Members')
  await page.getByRole('button', { name: 'New Member' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create a Member' })
  await createDialog.getByLabel('First name').fill('QA003 Admin')
  await createDialog.getByLabel('Last name').fill('Member')
  await createDialog.getByLabel('Phone').fill('09170003001')
  await createDialog.getByLabel('Email').fill('qa003.admin.member@example.test')
  await createDialog.getByLabel('Life Group').selectOption({ label: 'North Life Group' })
  await createDialog.getByRole('button', { name: 'Create Member' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${ADMIN_MEMBER} was created.` })).toBeVisible()

  await searchMembers(page, ADMIN_MEMBER)
  const createdRecord = await openMemberDetailsAndReadRecord(page, ADMIN_MEMBER)
  const detailDialog = page.getByRole('dialog', { name: ADMIN_MEMBER })
  await expect(detailDialog.getByRole('img', { name: `Permanent attendance QR for ${ADMIN_MEMBER}` })).toBeVisible()
  await expect(detailDialog.getByText(createdRecord.qrToken, { exact: true })).toHaveCount(0)
  const downloadPromise = page.waitForEvent('download')
  await detailDialog.getByRole('button', { name: 'Download QR' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('qa003-admin-member-qr.png')

  const firstImage = await browserPng(page, '#111111')
  await detailDialog.getByLabel('Choose image').setInputFiles({
    name: 'member-a.png',
    mimeType: 'image/png',
    buffer: firstImage,
  })
  await detailDialog.getByRole('button', { name: 'Upload image' }).click()
  await expect(detailDialog.getByRole('status').filter({ hasText: 'Image uploaded.' })).toBeVisible()
  const photo = detailDialog.getByRole('img', { name: `Profile photo for ${ADMIN_MEMBER}` })
  await expect(photo).toBeVisible()
  const firstSource = await photo.getAttribute('src')

  const secondImage = await browserPng(page, '#eeeeee')
  await detailDialog.getByLabel('Choose image').setInputFiles({
    name: '../unsafe-name.png',
    mimeType: 'image/png',
    buffer: secondImage,
  })
  await detailDialog.getByRole('button', { name: 'Change image' }).click()
  await expect(detailDialog.getByRole('status').filter({ hasText: 'Image changed.' })).toBeVisible()
  await expect(photo).not.toHaveAttribute('src', firstSource ?? '')
  await detailDialog.getByRole('button', { name: 'Remove image' }).click()
  await expect(detailDialog.getByRole('status').filter({ hasText: 'Image removed.' })).toBeVisible()
  await expect(detailDialog.getByLabel(`Profile photo for ${ADMIN_MEMBER} placeholder`)).toBeVisible()

  await detailDialog.getByRole('button', { name: 'Edit Member' }).click()
  const editDialog = page.getByRole('dialog', { name: `Edit ${ADMIN_MEMBER}` })
  await editDialog.getByLabel('Address').fill('QA-003 verified address')
  await editDialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${ADMIN_MEMBER_EDITED} was updated.` })).toBeVisible()

  await chooseRowAction(page, ADMIN_MEMBER_EDITED, 'Archive Member')
  const archiveDialog = page.getByRole('dialog', { name: 'Archive Member?' })
  await archiveDialog.getByRole('button', { name: 'Archive Member' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${ADMIN_MEMBER_EDITED} was archived.` })).toBeVisible()
  await page.getByLabel('Status').selectOption('archived')
  await expect(rowFor(page, ADMIN_MEMBER_EDITED)).toContainText('Archived')
})

test('Admin operates Sunday manual, QR, duplicate, correction, and Visitor registration flows', async ({ page }) => {
  await login(page, ADMIN_ACCOUNT)
  await navigate(page, 'Members')
  await searchMembers(page, 'Ana Dela Cruz')
  const ana = await openMemberDetailsAndReadRecord(page, 'Ana Dela Cruz')
  await page.getByRole('dialog', { name: 'Ana Dela Cruz' }).getByRole('button', { name: 'Close', exact: true }).click()

  await openSundayService(page)
  const marcoRow = rowFor(page, 'Marco Dela Cruz')
  await marcoRow.getByRole('button', { name: 'Mark present' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Marco Dela Cruz is now present.' })).toBeVisible()
  await marcoRow.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Marco Dela Cruz is now not marked present.' })).toBeVisible()

  await page.getByRole('button', { name: 'QR check-in', exact: true }).click()
  const qrDialog = page.getByRole('dialog', { name: 'QR check-in' })
  await qrDialog.getByRole('button', { name: 'Scanner input', exact: true }).click()
  await qrDialog.getByLabel('Member QR token').fill(ana.qrToken)
  await qrDialog.getByRole('button', { name: 'Check in' }).click()
  await expect(qrDialog.getByRole('status').filter({ hasText: 'Ana Dela Cruz: check-in recorded.' })).toBeVisible()
  await qrDialog.getByLabel('Member QR token').fill(ana.qrToken)
  await qrDialog.getByLabel('Member QR token').press('Enter')
  await expect(qrDialog.getByRole('status').filter({ hasText: 'Ana Dela Cruz: already present.' })).toBeVisible()
  await qrDialog.getByRole('button', { name: 'Done' }).click()
  await rowFor(page, 'Ana Dela Cruz').getByRole('button', { name: 'Remove' }).click()

  await page.getByRole('button', { name: /Sunday Visitors\s+\d+ registered/ }).click()
  await page.getByRole('button', { name: 'Register Visitor' }).first().click()
  const visitorDialog = page.getByRole('dialog', { name: 'Register Sunday Visitor' })
  await visitorDialog.getByRole('tab', { name: 'New Visitor' }).click()
  await visitorDialog.getByLabel('First name').fill('QA003 Admin')
  await visitorDialog.getByLabel('Last name').fill('Sunday')
  await visitorDialog.getByLabel('Email').fill('qa003.admin.sunday@example.test')
  await visitorDialog.getByRole('button', { name: 'Register Visitor' }).click()
  await expect(rowFor(page, ADMIN_SUNDAY_VISITOR)).toBeVisible()
})

test('Admin converts an affiliated Visitor and sees the active OpenCell conversion blocker', async ({ page }) => {
  await login(page, ADMIN_ACCOUNT)
  await navigate(page, 'Visitors')
  await page.getByRole('button', { name: 'New Visitor' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create a Visitor' })
  await createDialog.getByLabel('First name').fill('QA003 Admin')
  await createDialog.getByLabel('Last name').fill('Convert')
  await createDialog.getByLabel('Email').fill('qa003.admin.convert@example.test')
  await createDialog.getByRole('button', { name: 'Create Visitor' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${ADMIN_VISITOR} was created.` })).toBeVisible()
  await searchVisitors(page, ADMIN_VISITOR)

  await chooseRowAction(page, ADMIN_VISITOR, 'Manage Life Group')
  const affiliationDialog = page.getByRole('dialog', { name: 'Manage Visitor Life Group' })
  await affiliationDialog.getByLabel('Life Group').selectOption({ label: 'North Life Group' })
  await affiliationDialog.getByRole('button', { name: 'Save affiliation' }).click()
  await expect(rowFor(page, ADMIN_VISITOR)).toContainText('North Life Group')

  await chooseRowAction(page, ADMIN_VISITOR, 'Convert to Member')
  const conversionDialog = page.getByRole('dialog', { name: 'Convert Visitor to Member?' })
  await expect(conversionDialog).toContainText('Inherited Life Group')
  await expect(conversionDialog).toContainText('North Life Group')
  await conversionDialog.getByRole('button', { name: 'Convert to Member' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${ADMIN_VISITOR} was converted to a Member in North Life Group.` })).toBeVisible()

  await page.getByLabel('Status').selectOption('converted')
  await expect(rowFor(page, ADMIN_VISITOR)).toContainText('Converted')
  await rowFor(page, ADMIN_VISITOR).getByRole('button', { name: `Actions for ${ADMIN_VISITOR}` }).click()
  await expect(page.getByRole('menuitem', { name: 'Edit Visitor' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Convert to Member' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await chooseRowAction(page, ADMIN_VISITOR, 'View Visitor details')
  const convertedDialog = page.getByRole('dialog', { name: ADMIN_VISITOR })
  await expect(convertedDialog).toContainText('Linked Member record preserved')
  await expect(convertedDialog.getByRole('button', { name: 'Edit Visitor' })).toHaveCount(0)
  await expect(convertedDialog.getByRole('button', { name: 'Convert' })).toHaveCount(0)
  await convertedDialog.getByRole('button', { name: 'Close', exact: true }).click()

  await navigate(page, 'Members')
  await searchMembers(page, 'qa003.admin.convert@example.test')
  await expect(rowFor(page, ADMIN_VISITOR)).toContainText('North Life Group')

  await navigate(page, 'Visitors')
  await searchVisitors(page, 'Bea Salazar')
  await chooseRowAction(page, 'Bea Salazar', 'Convert to Member')
  const blockedDialog = page.getByRole('dialog', { name: 'Convert Visitor to Member?' })
  await blockedDialog.getByRole('button', { name: 'Convert to Member' }).click()
  await expect(blockedDialog.getByRole('alert')).toContainText("Finish the Visitor's active OpenCell Programme before converting them to a Member.")
})

test('Admin creates and completes a source-generated Harvest Follow Up', async ({ page }) => {
  await login(page, ADMIN_ACCOUNT)
  await openHarvest(page)
  await registerNewHarvestVisitor(page, 'QA003 Admin', 'Harvest', 'qa003.admin.harvest@example.test')
  await createHarvestFollowUp(page, ADMIN_HARVEST_VISITOR)
  await completeFollowUp(page, ADMIN_HARVEST_VISITOR, 'QA-003 Admin pastoral contact complete.')
})

test('Leader manages only the own-Life-Group Member scope and is denied a guessed other-group Member ID', async ({ page }) => {
  await login(page, ADMIN_ACCOUNT)
  await navigate(page, 'Members')
  await searchMembers(page, 'Noah Bautista')
  const otherGroupMember = await openMemberDetailsAndReadRecord(page, 'Noah Bautista')
  await page.getByRole('dialog', { name: 'Noah Bautista' }).getByRole('button', { name: 'Close', exact: true }).click()
  await signOut(page)

  await login(page, LEADER_ACCOUNT)
  await navigate(page, 'Life Groups')
  await expect(page.getByRole('button', { name: 'New Life Group' })).toHaveCount(0)
  await chooseRowAction(page, 'North Life Group', 'View current roster')
  const rosterDialog = page.getByRole('dialog', { name: 'North Life Group roster' })
  await expect(rosterDialog.getByText('Ana Dela Cruz')).toBeVisible()
  await expect(rosterDialog.getByText('Gio Santiago')).toBeVisible()
  await expect(rosterDialog.getByText('Member', { exact: true }).first()).toBeVisible()
  await expect(rosterDialog.getByText('Visitor', { exact: true }).first()).toBeVisible()
  await rosterDialog.getByRole('button', { name: 'Close', exact: true }).click()

  await navigate(page, 'Members')
  await expect(page.getByLabel('Life Group')).toHaveCount(0)
  await expect(page.getByLabel('Status')).toHaveCount(0)
  await page.getByRole('button', { name: 'New Member' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create a Member' })
  await createDialog.getByLabel('First name').fill('QA003 Leader')
  await createDialog.getByLabel('Last name').fill('Member')
  await createDialog.getByLabel('Email').fill('qa003.leader.member@example.test')
  await expect(createDialog.getByLabel('Life Group')).toBeDisabled()
  await expect(createDialog.getByLabel('Life Group')).toHaveValue(/.+/)
  await createDialog.getByRole('button', { name: 'Create Member' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${LEADER_MEMBER} was created.` })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible()
  await expect(rowFor(page, LEADER_MEMBER)).toBeVisible()
  await openMemberDetailsAndReadRecord(page, LEADER_MEMBER)
  const detailDialog = page.getByRole('dialog', { name: LEADER_MEMBER })
  await expect(detailDialog.getByLabel('Choose image')).toBeVisible()
  await expect(detailDialog.getByRole('button', { name: 'Archive' })).toHaveCount(0)
  await detailDialog.getByRole('button', { name: 'Edit Member' }).click()
  const editDialog = page.getByRole('dialog', { name: `Edit ${LEADER_MEMBER}` })
  await expect(editDialog.getByLabel('Life Group')).toBeDisabled()
  await editDialog.getByLabel('Phone').fill('09170003002')
  await editDialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status').filter({ hasText: `${LEADER_MEMBER} was updated.` })).toBeVisible()

  await page.getByLabel('Search').fill('member6@example.test')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText('No Members match these controls')).toBeVisible()
  const directResult = await callApiAsCurrentBrowserUser(page, `/members/${otherGroupMember.id}`)
  expect(directResult.status).toBe(404)
  expect(directResult.body).toMatchObject({ error: { code: 'MEMBER_NOT_FOUND' } })
})

test('Leader Sunday attendance accepts own-group manual/QR check-in and safely rejects another group', async ({ page }) => {
  await login(page, ADMIN_ACCOUNT)
  await navigate(page, 'Members')
  await searchMembers(page, 'Ana Dela Cruz')
  const ownGroupMember = await openMemberDetailsAndReadRecord(page, 'Ana Dela Cruz')
  await page.getByRole('dialog', { name: 'Ana Dela Cruz' }).getByRole('button', { name: 'Close', exact: true }).click()
  await searchMembers(page, 'Noah Bautista')
  const otherGroupMember = await openMemberDetailsAndReadRecord(page, 'Noah Bautista')
  await page.getByRole('dialog', { name: 'Noah Bautista' }).getByRole('button', { name: 'Close', exact: true }).click()
  await signOut(page)

  await login(page, LEADER_ACCOUNT)
  await openSundayService(page)
  await expect(rowFor(page, 'Marco Dela Cruz')).toContainText('North Life Group')
  await expect(rowFor(page, 'Noah Bautista')).toHaveCount(0)
  await rowFor(page, 'Marco Dela Cruz').getByRole('button', { name: 'Mark present' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Marco Dela Cruz is now present.' })).toBeVisible()
  await rowFor(page, 'Marco Dela Cruz').getByRole('button', { name: 'Remove' }).click()

  await page.getByRole('button', { name: 'QR check-in', exact: true }).click()
  const qrDialog = page.getByRole('dialog', { name: 'QR check-in' })
  await qrDialog.getByRole('button', { name: 'Scanner input', exact: true }).click()
  await qrDialog.getByLabel('Member QR token').fill(ownGroupMember.qrToken)
  await qrDialog.getByRole('button', { name: 'Check in' }).click()
  await expect(qrDialog.getByRole('status').filter({ hasText: 'Ana Dela Cruz: check-in recorded.' })).toBeVisible()
  await qrDialog.getByLabel('Member QR token').fill(otherGroupMember.qrToken)
  await qrDialog.getByRole('button', { name: 'Check in' }).click()
  await expect(qrDialog.getByRole('alert')).toContainText('Member is not eligible for this Sunday Service.')
  await expect(qrDialog).not.toContainText('Noah Bautista')
  await qrDialog.getByRole('button', { name: 'Done' }).click()
  await rowFor(page, 'Ana Dela Cruz').getByRole('button', { name: 'Remove' }).click()
})

test('Leader creates a Harvest interest Follow Up and completes shared history', async ({ page }) => {
  await login(page, LEADER_ACCOUNT)
  await openHarvest(page)
  await expect(page.getByLabel('Choose image')).toHaveCount(0)
  await registerNewHarvestVisitor(page, 'QA003 Leader', 'Harvest', 'qa003.leader.harvest@example.test')
  await createHarvestFollowUp(page, LEADER_HARVEST_VISITOR)
  await completeFollowUp(page, LEADER_HARVEST_VISITOR, 'QA-003 Leader pastoral contact complete.')
})
