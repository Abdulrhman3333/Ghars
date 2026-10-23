import { test, expect } from '@playwright/test';
import { accounts, login } from './helpers';

// talqeen (red) — the first error type in the toolbar
const RED = 'rgb(239, 68, 68)';

test('the Mushaf page renders its lines with the Quran text', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/mushaf/2');
  await expect(page.locator('.mline').first()).toBeVisible({ timeout: 60_000 });
  // page 2 of the Madani mushaf holds the first five verses of al-Baqarah
  expect(await page.locator('.mline').count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.qw[data-loc="2:1:1"]')).toBeVisible();
});

test('a tapped word is marked, survives a reload, and can be unmarked', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/mushaf/2');
  await expect(page.locator('.mline').first()).toBeVisible({ timeout: 60_000 });

  const word = page.locator('.qw:not(.blocked)').first();
  const location = await word.getAttribute('data-loc');
  expect(location).toMatch(/^\d+:\d+:\d+$/);

  await word.click();
  await expect(page.locator(`.qw[data-loc="${location}"]`)).toHaveCSS('color', RED);

  await page.reload();
  await expect(page.locator(`.qw[data-loc="${location}"]`)).toHaveCSS('color', RED, { timeout: 60_000 });

  // tapping the same type again removes the mark, leaving the account clean
  await page.locator(`.qw[data-loc="${location}"]`).click();
  await expect(page.locator(`.qw[data-loc="${location}"]`)).not.toHaveCSS('color', RED);
});

test('the Bismillah words of al-Fatihah cannot be marked', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/mushaf/1');
  await expect(page.locator('.mline').first()).toBeVisible({ timeout: 60_000 });
  const blocked = page.locator('.qw.blocked').first();
  await expect(blocked).toHaveAttribute('data-loc', /^1:1:/);
  await blocked.click();
  await expect(page.getByText('البسملة لا تُعلَّم.')).toBeVisible();
});

test('navigating to the next page loads a different page', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/mushaf/3');
  await expect(page.locator('.mline').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'التالية ‹' }).click();
  await page.waitForURL('**/mushaf/4');
});
