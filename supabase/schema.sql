-- =====================================================================
-- Twin SMP – Bewerbungen & Chat (Supabase)
-- Komplett im Supabase "SQL Editor" einfügen und auf "Run" klicken.
--
-- Sicherheitsmodell:
--  * Bewerber haben KEIN Konto. Sie dürfen die Tabellen nicht direkt lesen/schreiben,
--    sondern nur über die Funktionen unten – und nur mit ID + geheimem Token ihrer
--    eigenen Bewerbung.
--  * Admins melden sich über Supabase Auth an und müssen in der Tabelle "admins" stehen.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Tabellen
create table if not exists public.applications (
  id              uuid primary key default gen_random_uuid(),
  token           uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  mc_name         text not null check (mc_name ~ '^[A-Za-z0-9_]{3,16}$'),
  discord         text check (char_length(discord) <= 64),
  email           text check (char_length(email) <= 254),
  answers         jsonb not null default '{}'::jsonb,
  status          text not null default 'neu'
                  check (status in ('neu', 'in_pruefung', 'angenommen', 'abgelehnt')),
  last_message_at timestamptz not null default now(),
  last_sender     text,
  admin_seen_at   timestamptz
);

create table if not exists public.messages (
  id             bigint generated always as identity primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  created_at     timestamptz not null default now(),
  sender         text not null check (sender in ('bewerber', 'admin')),
  body           text not null check (char_length(body) between 1 and 2000)
);
create index if not exists messages_app_idx on public.messages (application_id, id);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------- Zugriffsregeln (RLS)
alter table public.applications enable row level security;
alter table public.messages     enable row level security;
alter table public.admins       enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

drop policy if exists "admins: bewerbungen" on public.applications;
create policy "admins: bewerbungen" on public.applications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins: nachrichten" on public.messages;
create policy "admins: nachrichten" on public.messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins: eigener eintrag" on public.admins;
create policy "admins: eigener eintrag" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Für anonyme Besucher gibt es absichtlich KEINE Policy -> kein direkter Tabellenzugriff.

-- ---------------------------------------------------------------- letzte Nachricht merken
create or replace function public.touch_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.applications
     set last_message_at = new.created_at, last_sender = new.sender
   where id = new.application_id;
  return new;
end $$;

drop trigger if exists messages_touch on public.messages;
create trigger messages_touch after insert on public.messages
  for each row execute function public.touch_application();

-- ---------------------------------------------------------------- Funktionen für Bewerber
create or replace function public.submit_application(
  p_mc_name text, p_discord text, p_email text, p_answers jsonb, p_first_message text)
returns table (app_id uuid, app_token uuid)
language plpgsql security definer set search_path = public as $$
declare a public.applications;
begin
  if coalesce(trim(p_discord), '') = '' and coalesce(trim(p_email), '') = '' then
    raise exception 'Bitte gib deinen Discord-Namen oder deine E-Mail an.';
  end if;
  if coalesce(trim(p_mc_name), '') !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Ungültiger Minecraft-Name.';
  end if;
  if octet_length(coalesce(p_answers, '{}'::jsonb)::text) > 10000 then
    raise exception 'Deine Antworten sind zu lang.';
  end if;
  -- einfacher Spam-Schutz
  if (select count(*) from public.applications where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Gerade kommen zu viele Bewerbungen rein. Bitte versuch es in ein paar Minuten nochmal.';
  end if;

  insert into public.applications (mc_name, discord, email, answers)
  values (trim(p_mc_name), nullif(trim(p_discord), ''), nullif(trim(p_email), ''), coalesce(p_answers, '{}'::jsonb))
  returning * into a;

  if coalesce(trim(p_first_message), '') <> '' then
    insert into public.messages (application_id, sender, body)
    values (a.id, 'bewerber', left(trim(p_first_message), 2000));
  end if;

  return query select a.id, a.token;
end $$;

create or replace function public.get_chat(p_id uuid, p_token uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare a public.applications;
begin
  select * into a from public.applications where id = p_id and token = p_token;
  if not found then raise exception 'Bewerbung nicht gefunden.'; end if;
  return json_build_object(
    'status', a.status,
    'mc_name', a.mc_name,
    'created_at', a.created_at,
    'answers', a.answers,
    'messages', coalesce((
      select json_agg(json_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at) order by m.id)
        from public.messages m where m.application_id = a.id), '[]'::json));
end $$;

create or replace function public.send_message(p_id uuid, p_token uuid, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.applications where id = p_id and token = p_token) then
    raise exception 'Bewerbung nicht gefunden.';
  end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Leere Nachricht.'; end if;
  if (select count(*) from public.messages
       where application_id = p_id and sender = 'bewerber' and created_at > now() - interval '1 minute') >= 8 then
    raise exception 'Langsam! Bitte warte kurz, bevor du weiterschreibst.';
  end if;
  insert into public.messages (application_id, sender, body) values (p_id, 'bewerber', left(trim(p_body), 2000));
end $$;

revoke all on function public.submit_application(text, text, text, jsonb, text) from public;
revoke all on function public.get_chat(uuid, uuid) from public;
revoke all on function public.send_message(uuid, uuid, text) from public;
grant execute on function public.submit_application(text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.get_chat(uuid, uuid) to anon, authenticated;
grant execute on function public.send_message(uuid, uuid, text) to anon, authenticated;

-- =====================================================================
-- ZUM SCHLUSS (erst nachdem du unter Authentication -> Users deinen Admin angelegt hast):
-- E-Mail anpassen und nur diese Zeile ausführen:
--
--   insert into public.admins (user_id) select id from auth.users where email = 'DEINE-ADMIN@MAIL.de';
-- =====================================================================
