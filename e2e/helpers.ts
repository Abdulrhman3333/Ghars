import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

/** Reads .env.test.local (gitignored) into process.env without extra dependencies. */
export function loadTestEnv() {
  const file = resolve(__dirname, '..', '.env.test.local');
  if (!existsSync(file)) {
    throw new Error('Missing .env.test.local. Copy the test account values into it first.');
  }
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export const accounts = {
  get admin() {
    return { email: process.env.GHARS_ADMIN_EMAIL!, password: process.env.GHARS_ADMIN_PASSWORD! };
  },
  get student() {
    return { email: process.env.GHARS_STUDENT_EMAIL!, password: process.env.GHARS_STUDENT_PASSWORD! };
  },
  get teacher() {
    return { email: process.env.GHARS_TEACHER_EMAIL!, password: process.env.GHARS_TEACHER_PASSWORD! };
  },
};

/** Arabic-Indic digits back to ASCII (the UI shows codes with Arabic digits). */
export const toAscii = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL('**/home');
}
