import { test, expect } from '@playwright/test';
import { accounts, login } from './helpers';

test('the profile shows a 6-digit public code and the registration date', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/profile');
  await expect(page.getByText('رمزك العام', { exact: true })).toBeVisible();
  const code = page.locator('p.font-mono.text-4xl');
  await expect(code).toHaveText(/^[٠-٩]{6}$/);
  await expect(page.getByRole('button', { name: 'نسخ الرمز' })).toBeVisible();
});

test('the email is shown read-only on the profile', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/profile');
  await expect(page.locator('input[type="email"]')).toBeDisabled();
  await expect(page.getByText('لا يمكن تغيير البريد الإلكتروني من هنا.')).toBeVisible();
});

test('saving the profile keeps the same name and shows the confirmation', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/profile');
  const name = await page.locator('input#name').inputValue();
  await page.locator('input#name').fill(name);
  await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expect(page.getByText('تم حفظ التغييرات.')).toBeVisible();
});

test('adding an unknown auto-accept code shows the not-found message', async ({ page }) => {
  await login(page, accounts.student);
  await page.goto('/profile');
  await page.locator('input#code').fill('000000');
  await page.getByRole('button', { name: 'إضافة' }).click();
  await expect(page.getByText('تعذّر العثور على مستخدم بهذا الرمز.')).toBeVisible();
});
