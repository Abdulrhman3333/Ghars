import { test, expect, type Browser } from '@playwright/test';
import { accounts, login, toAscii } from './helpers';

// A recitation session between two real accounts: the student marks, sends,
// the teacher accepts, and the mark appears on the teacher's own Mushaf.
// Each run leaves one accepted session behind (see the README for the cleanup query).

async function teacherCode(browser: Browser): Promise<string> {
  const ctx = await browser.newContext({ locale: 'ar-SA' });
  const page = await ctx.newPage();
  await login(page, accounts.teacher);
  await page.goto('/profile');
  const raw = (await page.locator('p.font-mono.text-4xl').textContent()) ?? '';
  await ctx.close();
  return toAscii(raw.trim());
}

test('a student marks a recitation, sends it, and the teacher accepts it', async ({ browser }) => {
  test.setTimeout(180_000);
  const code = await teacherCode(browser);

  const studentCtx = await browser.newContext({ locale: 'ar-SA' });
  const student = await studentCtx.newPage();
  await login(student, accounts.student);

  await student.goto('/sessions');
  await student.locator('input#code').fill(code);
  await student.getByRole('button', { name: 'بدء الجلسة' }).click();
  await student.waitForURL(/\/mushaf\/session\/[0-9a-f-]{36}\/1$/);
  await expect(student.locator('.mline').first()).toBeVisible({ timeout: 60_000 });

  const word = student.locator('.qw:not(.blocked)').first();
  const location = (await word.getAttribute('data-loc')) ?? '';
  await word.click();
  await expect(student.locator(`.qw[data-loc="${location}"]`)).toHaveCSS('color', 'rgb(239, 68, 68)');

  await student.getByRole('button', { name: 'إنهاء وإرسال الجلسة' }).click();
  await student.waitForURL('**/sessions?sent=pending');
  await expect(student.getByText('تم إرسال الجلسة. بانتظار موافقة القارئ.')).toBeVisible();
  await studentCtx.close();

  const teacherCtx = await browser.newContext({ locale: 'ar-SA' });
  const teacher = await teacherCtx.newPage();
  await login(teacher, accounts.teacher);
  await teacher.goto('/sessions');
  await expect(teacher.getByText('تنتظر موافقتك')).toBeVisible();
  await teacher.getByRole('button', { name: 'قبول' }).first().click();
  await expect(teacher.getByText('تنتظر موافقتك')).toHaveCount(0);

  // the accepted session's mark appears on the reciter's own Mushaf (the marked word is on page 1)
  await teacher.goto('/mushaf/1');
  await expect(teacher.locator(`.qw[data-loc="${location}"]`)).toHaveCSS('color', 'rgb(239, 68, 68)', {
    timeout: 60_000,
  });
  await teacherCtx.close();
});
