import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  ADMIN_ACCOUNT,
  chooseRowAction,
  login,
  rowFor,
  searchMembers,
} from './helpers'

const OPEN_SERVICE = 'Upcoming Sunday Service'

async function expectNoSeriousAccessibilityViolations(
  page: Page,
  context: string,
) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({
      failureSummary: node.failureSummary,
      html: node.html,
      target: node.target.join(' '),
    })),
  }))
  expect(violations, `${context} accessibility violations`).toEqual([])
}

async function expectNoDocumentOverflow(page: Page, context: string) {
  const overflow = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => {
        const bounds = element.getBoundingClientRect()
        return {
          className: element.className.toString().slice(0, 160),
          right: Math.round(bounds.right),
          tag: element.tagName,
          width: Math.round(bounds.width),
        }
      })
      .filter((element) => element.right > clientWidth + 1)
      .slice(0, 8)
    return {
      clientWidth,
      offenders,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })
  expect(
    overflow.scrollWidth,
    `${context} document width ${overflow.scrollWidth}px exceeded ${overflow.clientWidth}px; offenders: ${JSON.stringify(overflow.offenders)}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

async function openSundayService(page: Page) {
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible()
  await chooseRowAction(page, OPEN_SERVICE, 'Open Service')
  await expect(page.getByRole('heading', { name: OPEN_SERVICE })).toBeVisible()
}

async function closeDialogWithEscape(page: Page, dialog: Locator) {
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
}

test('major Admin screens and shared overlays meet the automated accessibility baseline', async ({ page }) => {
  await page.goto('/login')
  await expectNoSeriousAccessibilityViolations(page, 'Login')
  await login(page, ADMIN_ACCOUNT)

  const screens = [
    { heading: 'Dashboard', path: '/' },
    { heading: 'Members', path: '/members' },
    { heading: 'Ministries', path: '/ministries' },
    { heading: 'Life Groups', path: '/life-groups' },
    { heading: 'Visitors', path: '/visitors' },
    { heading: 'Events', path: '/events' },
    { heading: 'Follow Up', path: '/follow-up' },
    { heading: 'OpenCell', path: '/opencell' },
  ]

  for (const screen of screens) {
    await page.goto(screen.path)
    await expect(
      page.getByRole('heading', { name: screen.heading, exact: true }),
    ).toBeVisible()
    await expectNoSeriousAccessibilityViolations(page, screen.heading)
  }

  await page.goto('/')
  await page.getByLabel('Theme').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectNoSeriousAccessibilityViolations(page, 'Dashboard dark theme')
  await page.getByLabel('Theme').selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expectNoSeriousAccessibilityViolations(page, 'Dashboard light theme')
  await page.getByLabel('Theme').selectOption('system')

  await page.goto('/members')
  await searchMembers(page, 'Ana Dela Cruz')
  const trigger = rowFor(page, 'Ana Dela Cruz').getByRole('button', {
    name: 'Actions for Ana Dela Cruz',
  })
  await trigger.click()
  await page.getByRole('menuitem', { name: 'View Member details' }).click()
  const memberDialog = page.getByRole('dialog', { name: 'Ana Dela Cruz' })
  await expect(memberDialog.getByText('Permanent attendance QR')).toBeVisible()
  await expect(memberDialog.getByRole('button', { name: 'Download QR' })).toBeVisible()
  await expect(memberDialog.getByLabel('Choose image')).toBeVisible()
  await expectNoSeriousAccessibilityViolations(page, 'Member detail, QR, and upload controls')
  await closeDialogWithEscape(page, memberDialog)
  await expect(trigger).toBeFocused()

  await page.goto('/life-groups')
  await chooseRowAction(page, 'North Life Group', 'View Gatherings')
  await expect(page.getByRole('heading', { name: /Gatherings/ })).toBeVisible()
  await expectNoSeriousAccessibilityViolations(page, 'Gatherings')

  await page.goto('/opencell')
  await expect(page.getByRole('dialog', { name: 'New Session' })).toHaveCount(0)
  await page.getByRole('button', { name: 'OpenCell New Beginnings', exact: true }).click()
  const programmeDialog = page.getByRole('dialog', {
    name: 'OpenCell New Beginnings',
  })
  await expect(programmeDialog.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  await expectNoSeriousAccessibilityViolations(page, 'OpenCell Programme workspace')
  await closeDialogWithEscape(page, programmeDialog)

  await page.goto('/events')
  await page.getByRole('button', { name: /Harvest\s+\d+ Events/ }).click()
  await chooseRowAction(page, 'Bring a Friend Dinner', 'Open Harvest')
  await expect(page.getByRole('heading', { name: 'Bring a Friend Dinner' })).toBeVisible()
  await expectNoSeriousAccessibilityViolations(page, 'Harvest workspace')

  await openSundayService(page)
  await expectNoSeriousAccessibilityViolations(page, 'Sunday Service workspace')
})

test('Sunday QR modal is keyboard safe and provides camera and scanner fallback states', async ({
  context,
  page,
}) => {
  await context.clearPermissions()
  await page.addInitScript(() => {
    if (!navigator.mediaDevices) return
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () =>
        Promise.reject(
          new DOMException('Permission denied by QA-005', 'NotAllowedError'),
        ),
    })
  })
  await login(page, ADMIN_ACCOUNT)
  await openSundayService(page)

  const trigger = page.getByRole('button', { name: 'QR check-in', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'QR check-in' })
  await expect(dialog.getByRole('button', { name: 'Camera', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByText('Camera access requires HTTPS or localhost')).toBeVisible()
  await expectNoSeriousAccessibilityViolations(page, 'Sunday QR camera modal')

  await dialog.getByRole('button', { name: 'Start camera' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    /permission|camera|compatible|browser/i,
    { timeout: 20_000 },
  )

  await dialog.getByRole('button', { name: 'Scanner input', exact: true }).click()
  const scannerInput = dialog.getByLabel('Member QR token')
  await expect(scannerInput).toBeVisible()
  await scannerInput.fill('temporary-token-is-not-submitted')
  await dialog.getByRole('button', { name: 'Camera', exact: true }).click()
  await expect(scannerInput).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Done' }).focus()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused()
  await closeDialogWithEscape(page, dialog)
  await expect(trigger).toBeFocused()
})

test('responsive critical surfaces have no page overflow at approved widths', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-edge',
    'The full viewport matrix runs once in Chromium; Firefox/WebKit use the cross-browser smoke above.',
  )

  await login(page, ADMIN_ACCOUNT)
  const viewports = [
    { height: 800, label: '360px mobile', width: 360 },
    { height: 844, label: '390px phone', width: 390 },
    { height: 900, label: '430px phone', width: 430 },
    { height: 1024, label: '768px tablet', width: 768 },
    { height: 900, label: '1024px small desktop', width: 1024 },
    { height: 1000, label: '1440px desktop', width: 1440 },
  ]

  for (const viewport of viewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width })
    for (const path of ['/', '/members', '/events', '/opencell']) {
      await page.goto(path)
      await page.locator('main').waitFor()
      await expectNoDocumentOverflow(page, `${viewport.label} ${path}`)
    }

    await openSundayService(page)
    await expectNoDocumentOverflow(page, `${viewport.label} Sunday workspace`)
    const trigger = page.getByRole('button', { name: 'QR check-in', exact: true })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'QR check-in' })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(viewport.width)
    expect(box?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(viewport.height)
    await expectNoDocumentOverflow(page, `${viewport.label} QR modal`)
    await closeDialogWithEscape(page, dialog)

    if (viewport.width < 768) {
      const menuButton = page.getByRole('button', { name: 'Open navigation' })
      await menuButton.click()
      const drawer = page.getByRole('dialog', { name: 'Main navigation' })
      await expect(drawer).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      await expect(menuButton).toBeFocused()
    }
  }
})
