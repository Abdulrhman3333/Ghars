# Ghars (غَرْس) — Agent Guide

Arabic-first (RTL) platform for per-juz' Quran recitation learning. Learners who pass a juz' exam become teachers for that juz' (derived, not a role). **Not an official ijaza** — the certificate label lives in ONE constant: `CERTIFICATE_LABEL` in `src/lib/config.ts` («شهادة غرس»).

## Workflow
Phased build; one phase at a time, then stop for review:
0 Planning · 1 DB migrations/RLS/seed · 2 Auth+profile · 3 Mushaf+sessions · 4 Students/Teacher/exams/lineage/stats · 5 Examiner dashboard · 6 Common Errors + Resources · 7 Admin + tests + README.

## Conventions
- Stack: Next.js App Router + TypeScript strict + Tailwind (RTL). Supabase: Postgres, Auth, Storage, RLS on EVERY table.
- No `teacher` role ever. Privileged roles only: `admin`, `examiner` (table `user_roles`). Teacher eligibility = `progress.state='passed'` for that juz'.
- Lineage parent = `exams.nominated_by` of the PASSED attempt (not examiner, not current teacher).
- State machines (progress / exams / mushaf_sessions) are enforced by DB triggers + security-definer functions, never only in UI. Valid transitions live in `*_allowed_transitions` tables.
- Quran text is snapshotted into DB (`quran_words` etc.) by `npm run snapshot:quran`; never call quran.com at runtime. QCF v2 fonts load per page from CDN.
- An error = one word OR letters inside one word, never a range. Bismillah (incl. 1:1) is not markable.
- Privacy: email/phone visible only to self, admin, teacher/student pairs, and non-draft session participants. Users are addressed by `user_code`, never by searchable email.
- All UI copy in `src/messages/ar.json` (Arabic only, i18n-ready).
- `error-hilighter.html` is the reference prototype for the Mushaf renderer (Phase 3 port).
- Migrations: `supabase/migrations/<timestamp>_name.sql`. Seed: `supabase/seed.sql` + `supabase/seed/quran_snapshot.sql` (generated).
