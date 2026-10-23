import { test, expect } from '@playwright/test';
import { accounts, login } from './helpers';

test('guests are sent to the login page from protected pages', async ({ page }) => {
  await page.goto('/home');
  await page.waitForURL('**/login');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
});

test('a wrong password shows the Arabic error and stays on login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', accounts.student.email);
  await page.fill('#password', 'definitely-wrong-password');
  await page.getByRole('button', { name: 'دخول' }).click();
  // Next.js also renders an empty role="alert" route announcer, so target the message itself
  await expect(page.locator('p[role="alert"]')).toHaveText('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  await expect(page).toHaveURL(/\/login$/);
});

test('a learner signs in, sees the home page, and signs out', async ({ page }) => {
  await login(page, accounts.student);
  await expect(page.getByRole('heading', { name: /أهلًا بك/ })).toBeVisible();

  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await page.waitForURL('**/login');
});

test('signed-in users are redirected away from the login page', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/login');
  await page.waitForURL('**/home');
});

test('the page direction is right-to-left in Arabic', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});
