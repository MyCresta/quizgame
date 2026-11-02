-- One-time update: run this once in Supabase → SQL Editor.
-- It enables the two delete buttons on the admin page and removes leftovers from
-- features that were tried and dropped (image uploads, map lines, single-question queue).

-- 1) Admin: add "delete set" and "remove a player's answers"
create or replace function public.quiz_admin(p_pass text, p_action text, p_args jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a jsonb := coalesce(p_args, '{}'::jsonb); sid bigint; d date := public.quiz_today_date();
begin
  if not public.quiz_admin_ok(p_pass) then
    return jsonb_build_object('error', 'Wrong password (or too many attempts, wait 10 minutes)');
  end if;

  if p_action = 'login' then
    return jsonb_build_object('ok', true);

  elsif p_action = 'list' then
    perform public.quiz_ensure_today();
    return jsonb_build_object('ok', true, 'today', d,
      'queue', coalesce((select jsonb_agg(public.quiz_admin_set_json(s.id) || jsonb_build_object('expected_date', public.quiz_set_expected_date(s.id))
                 order by s.queue_rank, s.created_at, s.id) from public.quiz_sets s where s.play_date is null and not s.is_backup), '[]'),
      'backups', coalesce((select jsonb_agg(public.quiz_admin_set_json(s.id) order by s.created_at, s.id)
                 from public.quiz_sets s where s.play_date is null and s.is_backup), '[]'),
      'days', coalesce((select jsonb_agg(public.quiz_admin_set_json(s.id) || jsonb_build_object(
                 'players', coalesce((select jsonb_agg(jsonb_build_object('id', sub.id, 'player', sub.player,
                     'total', (select sum(points) from public.quiz_guesses g where g.submission_id = sub.id)) order by sub.created_at)
                   from public.quiz_submissions sub where sub.play_date = s.play_date), '[]'))
               order by s.play_date desc)
               from (select * from public.quiz_sets where play_date is not null order by play_date desc limit 10) s), '[]'));

  elsif p_action = 'save' then
    sid := public.quiz_save_set(nullif(a->>'id','')::bigint, a->>'author', a->'questions', (a->>'is_backup')::boolean);
    return jsonb_build_object('ok', true, 'id', sid);

  elsif p_action = 'move' then
    perform public.quiz_move_set((a->>'id')::bigint, a->>'dir');
    return jsonb_build_object('ok', true);

  elsif p_action = 'set_backup' then
    update public.quiz_sets set is_backup = (a->>'backup')::boolean, queue_rank = extract(epoch from clock_timestamp())
    where id = (a->>'id')::bigint and play_date is null;
    return jsonb_build_object('ok', true);

  elsif p_action = 'unschedule' then
    sid := (a->>'id')::bigint;
    if exists (select 1 from public.quiz_submissions where play_date = d) then
      return jsonb_build_object('error', 'People have already answered today'); end if;
    update public.quiz_sets set play_date = null,
      queue_rank = (select coalesce(min(queue_rank), 0) - 1 from public.quiz_sets where play_date is null and not is_backup)
    where id = sid and play_date = d;
    return jsonb_build_object('ok', true);

  elsif p_action = 'delete' then   -- only sets that haven't been played
    sid := (a->>'id')::bigint;
    if exists (select 1 from public.quiz_sets where id = sid and play_date is not null) then
      return jsonb_build_object('error', 'This set has already been played. Edit it instead.'); end if;
    delete from public.quiz_sets where id = sid;   -- its questions go with it
    return jsonb_build_object('ok', true);

  elsif p_action = 'delete_submission' then   -- remove one player's answers for a day
    delete from public.quiz_submissions where id = (a->>'id')::bigint;
    return jsonb_build_object('ok', true);

  elsif p_action = 'set_password' then
    if char_length(coalesce(a->>'new','')) < 8 then return jsonb_build_object('error', 'Use at least 8 characters'); end if;
    update public.quiz_admin set pass_hash = extensions.crypt(a->>'new', extensions.gen_salt('bf')) where id = 1;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('error', 'Unknown action');
exception when others then
  return jsonb_build_object('error', sqlerrm);
end $$;

-- 2) Image uploads were replaced by image links: remove the upload bucket and its policy
drop policy if exists "quiz images upload" on storage.objects;
delete from storage.buckets where id = 'quiz-images';

-- 3) Unused columns and functions from the dropped experiments
drop index if exists public.quiz_questions_day_pos;
drop index if exists public.quiz_questions_queue;
alter table public.quiz_questions
  drop column if exists line,
  drop column if exists play_date,
  drop column if exists is_backup,
  drop column if exists queue_rank;
