-- 0006 · Row Level Security: enabled on EVERY table.
-- Privacy rule: email/phone reach only self, admin, teacher/student pairs,
-- and participants of a non-draft shared session.

alter table public.users                        enable row level security;
alter table public.user_roles                   enable row level security;
alter table public.notifications                enable row level security;
alter table public.chapters                     enable row level security;
alter table public.quran_verses                 enable row level security;
alter table public.quran_words                  enable row level security;
alter table public.progress                     enable row level security;
alter table public.exams                        enable row level security;
alter table public.progress_state_history       enable row level security;
alter table public.progress_allowed_transitions enable row level security;
alter table public.exam_allowed_transitions     enable row level security;
alter table public.error_types                  enable row level security;
alter table public.error_subtypes               enable row level security;
alter table public.mushaf_sessions              enable row level security;
alter table public.session_allowed_transitions  enable row level security;
alter table public.mushaf_errors                enable row level security;
alter table public.auto_accept_list             enable row level security;
alter table public.common_error_categories      enable row level security;
alter table public.common_errors                enable row level security;
alter table public.resources                    enable row level security;
alter table public.invites                      enable row level security;

-- ============ users ============
create policy users_select_self on public.users
  for select to authenticated using (auth_user_id = auth.uid());

create policy users_select_admin on public.users
  for select to authenticated using (public.is_admin());

-- teacher/student pairs, non-draft session participants, examiner↔examinee
create policy users_select_related on public.users
  for select to authenticated using (
    exists (select 1 from public.progress p
            where (p.student_id = public.current_profile_id() and p.teacher_id = users.id)
               or (p.teacher_id = public.current_profile_id() and p.student_id = users.id))
    or exists (select 1 from public.mushaf_sessions s
            where s.state <> 'draft'
              and ((s.reciter_id = public.current_profile_id() and s.listener_id = users.id)
                or (s.listener_id = public.current_profile_id() and s.reciter_id = users.id)))
    or exists (select 1 from public.exams e
            where e.examiner_id = public.current_profile_id() and e.student_id = users.id)
  );

create policy users_update_self on public.users
  for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy users_update_admin on public.users
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============ user_roles ============
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = public.current_profile_id() or public.is_admin());

create policy user_roles_insert_admin on public.user_roles
  for insert to authenticated with check (public.is_admin());

create policy user_roles_delete_admin on public.user_roles
  for delete to authenticated using (public.is_admin());

-- ============ notifications ============
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = public.current_profile_id());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());

create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = public.current_profile_id());

-- ============ quran snapshot (read-only reference for signed-in users) ============
create policy chapters_select     on public.chapters     for select to authenticated using (true);
create policy quran_verses_select on public.quran_verses for select to authenticated using (true);
create policy quran_words_select  on public.quran_words  for select to authenticated using (true);

-- ============ progress ============
create policy progress_select on public.progress
  for select to authenticated using (
    student_id = public.current_profile_id()
    or teacher_id = public.current_profile_id()
    or public.is_admin()
    or exists (select 1 from public.exams e
               where e.progress_id = progress.id
                 and e.examiner_id = public.current_profile_id())
  );

create policy progress_insert_admin on public.progress
  for insert to authenticated with check (public.is_admin());

create policy progress_update_teacher on public.progress
  for update to authenticated
  using (teacher_id = public.current_profile_id())
  with check (teacher_id = public.current_profile_id());

create policy progress_update_admin on public.progress
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============ exams ============
create policy exams_select on public.exams
  for select to authenticated using (
    student_id = public.current_profile_id()
    or nominated_by = public.current_profile_id()
    or examiner_id = public.current_profile_id()
    or public.is_examiner()          -- committee sees the claimable queue
    or public.is_admin()
  );

create policy exams_insert_admin on public.exams
  for insert to authenticated with check (public.is_admin());

create policy exams_update_examiner on public.exams
  for update to authenticated
  using (public.is_examiner()
         and (examiner_id is null or examiner_id = public.current_profile_id()))
  with check (public.is_examiner() and examiner_id = public.current_profile_id());

-- nominators withdraw via progress (nominated → in_progress cascades to cancel); no direct exam writes
create policy exams_update_admin on public.exams
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============ progress_state_history ============
create policy progress_history_select on public.progress_state_history
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.progress p
               where p.id = progress_state_history.progress_id
                 and (p.student_id = public.current_profile_id()
                      or p.teacher_id = public.current_profile_id()))
  );

-- ============ transition reference tables (read-only) ============
create policy pat_select on public.progress_allowed_transitions for select to authenticated using (true);
create policy eat_select on public.exam_allowed_transitions     for select to authenticated using (true);
create policy sat_select on public.session_allowed_transitions  for select to authenticated using (true);

-- ============ error types / subtypes ============
create policy error_types_select    on public.error_types    for select to authenticated using (true);
create policy error_subtypes_select on public.error_subtypes for select to authenticated using (true);

create policy error_types_admin_insert on public.error_types
  for insert to authenticated with check (public.is_admin());
create policy error_types_admin_update on public.error_types
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy error_types_admin_delete on public.error_types
  for delete to authenticated using (public.is_admin());

create policy error_subtypes_admin_insert on public.error_subtypes
  for insert to authenticated with check (public.is_admin());
create policy error_subtypes_admin_update on public.error_subtypes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy error_subtypes_admin_delete on public.error_subtypes
  for delete to authenticated using (public.is_admin());

-- ============ mushaf_sessions ============
create policy sessions_select on public.mushaf_sessions
  for select to authenticated using (
    reciter_id = public.current_profile_id()
    or listener_id = public.current_profile_id()
    or public.is_admin()
  );

create policy sessions_insert_listener on public.mushaf_sessions
  for insert to authenticated
  with check (listener_id = public.current_profile_id()
              and state = 'draft'
              and reciter_id <> public.current_profile_id());

-- transitions happen exclusively through send_session / respond_to_session
create policy sessions_update_admin on public.mushaf_sessions
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy sessions_delete_draft on public.mushaf_sessions
  for delete to authenticated
  using ((listener_id = public.current_profile_id() and state = 'draft')
         or public.is_admin());

-- ============ mushaf_errors ============
-- reciter sees own self-marks and errors of ACCEPTED sessions;
-- listener sees errors of their own sessions (any state)
create policy errors_select on public.mushaf_errors
  for select to authenticated using (
    (reciter_id = public.current_profile_id()
      and (session_id is null
           or exists (select 1 from public.mushaf_sessions s
                      where s.id = mushaf_errors.session_id and s.state = 'accepted')))
    or exists (select 1 from public.mushaf_sessions s
               where s.id = mushaf_errors.session_id
                 and s.listener_id = public.current_profile_id())
    or public.is_admin()
  );

create policy errors_insert on public.mushaf_errors
  for insert to authenticated with check (
    marker_id = public.current_profile_id()
    and ((session_id is null and reciter_id = public.current_profile_id())
         or exists (select 1 from public.mushaf_sessions s
                    where s.id = mushaf_errors.session_id
                      and s.listener_id = public.current_profile_id()
                      and s.state = 'draft'))
  );

-- reciter owns their Mushaf (even accepted marks); listener may fix while drafting
create policy errors_delete on public.mushaf_errors
  for delete to authenticated using (
    reciter_id = public.current_profile_id()
    or (marker_id = public.current_profile_id()
        and (session_id is null
             or exists (select 1 from public.mushaf_sessions s
                        where s.id = mushaf_errors.session_id and s.state = 'draft')))
    or public.is_admin()
  );

-- ============ auto_accept_list (managed by the reciter only) ============
create policy auto_accept_select on public.auto_accept_list
  for select to authenticated using (reciter_id = public.current_profile_id());

create policy auto_accept_insert on public.auto_accept_list
  for insert to authenticated with check (reciter_id = public.current_profile_id());

create policy auto_accept_delete on public.auto_accept_list
  for delete to authenticated using (reciter_id = public.current_profile_id());

-- ============ common error categories ============
create policy ce_categories_select on public.common_error_categories
  for select to authenticated using (true);
create policy ce_categories_admin_insert on public.common_error_categories
  for insert to authenticated with check (public.is_admin());
create policy ce_categories_admin_update on public.common_error_categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ce_categories_admin_delete on public.common_error_categories
  for delete to authenticated using (public.is_admin());

-- ============ common errors ============
create policy common_errors_select on public.common_errors
  for select to authenticated using (
    state = 'approved' or submitted_by = public.current_profile_id() or public.is_admin()
  );

create policy common_errors_insert on public.common_errors
  for insert to authenticated
  with check (submitted_by = public.current_profile_id() and state = 'pending_review');

create policy common_errors_admin_update on public.common_errors
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy common_errors_admin_delete on public.common_errors
  for delete to authenticated using (public.is_admin());

-- ============ resources ============
create policy resources_select on public.resources
  for select to authenticated using (true);
create policy resources_admin_insert on public.resources
  for insert to authenticated with check (public.is_admin());
create policy resources_admin_update on public.resources
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy resources_admin_delete on public.resources
  for delete to authenticated using (public.is_admin());

-- ============ invites ============
create policy invites_select on public.invites
  for select to authenticated using (teacher_id = public.current_profile_id() or public.is_admin());

-- only users who passed at least one juz may create invites (derived teacher status)
create policy invites_insert on public.invites
  for insert to authenticated with check (
    public.is_admin()
    or (teacher_id = public.current_profile_id()
        and exists (select 1 from public.progress pr
                    where pr.student_id = public.current_profile_id() and pr.state = 'passed'))
  );

create policy invites_delete on public.invites
  for delete to authenticated using (teacher_id = public.current_profile_id() or public.is_admin());

-- ============ storage.objects: audio + pdfs buckets ============
-- submissions live under '<uid>/...' ; approved common-error audio is readable by all users
create policy audio_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy audio_select on storage.objects
  for select to authenticated using (
    bucket_id = 'audio'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or public.is_admin()
         or exists (select 1 from public.common_errors ce
                    where ce.state = 'approved'
                      and (ce.correct_audio_path = storage.objects.name
                           or ce.incorrect_audio_path = storage.objects.name)))
  );

create policy audio_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'audio'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy pdfs_select on storage.objects
  for select to authenticated using (bucket_id = 'pdfs');

create policy pdfs_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pdfs' and public.is_admin());

create policy pdfs_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'pdfs' and public.is_admin())
  with check (bucket_id = 'pdfs' and public.is_admin());

create policy pdfs_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pdfs' and public.is_admin());
