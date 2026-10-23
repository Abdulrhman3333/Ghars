import { test, expect } from '@playwright/test';
import { accounts, login } from './helpers';

test('an administrator can open the admin dashboard', async ({ page }) => {
  await login(page, accounts.admin);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'لوحة الإدارة' })).toBeVisible();
  await expect(page.getByRole('link', { name: /المستخدمون والأدوار/ })).toBeVisible();
});

test('a learner gets a not-found page for admin and committee pages', async ({ page }) => {
  await login(page, accounts.student);
  for (const path of ['/admin', '/admin/users', '/committee']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test('the admin navigation link is hidden from learners', async ({ page }) => {
  await login(page, accounts.student);
  await expect(page.getByRole('link', { name: 'الإدارة' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'لجنة الاختبارات' })).toHaveCount(0);
});
