-- O Mundo do Pai Natal — configuração inicial Supabase
-- Executar no Supabase Dashboard > SQL Editor > New query.
-- Este script NÃO cria um utilizador administrador automaticamente.

create extension if not exists pgcrypto;

-- Perfil e papel administrativo. Por defeito, qualquer novo perfil não é admin.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin', 'editor', 'event_manager', 'moderator')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'editor', 'event_manager', 'moderator')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Conteúdos editoriais públicos
create table if not exists public.adventures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  body text not null default '',
  cover_path text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  episode_number integer,
  body text not null default '',
  cover_path text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null,
  album_name text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  venue text not null,
  public_address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_end_after_start check (ends_at is null or ends_at >= starts_at)
);

-- Cartas privadas: esquema preparado, sem acesso público.
create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  child_display_name text,
  message text not null,
  status text not null default 'received' check (status in ('received', 'in_review', 'response_draft', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.letter_responses (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null unique references public.letters(id) on delete cascade,
  response_text text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('stories_adventures', 'events', 'photos_videos', 'letter_updates')),
  channel text not null check (channel in ('web_push', 'email', 'in_app')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, category, channel)
);

-- RLS em todas as tabelas
alter table public.profiles enable row level security;
alter table public.adventures enable row level security;
alter table public.stories enable row level security;
alter table public.media_assets enable row level security;
alter table public.events enable row level security;
alter table public.letters enable row level security;
alter table public.letter_responses enable row level security;
alter table public.notification_preferences enable row level security;

-- Perfis: utilizador lê o próprio perfil; admins podem ler todos.
drop policy if exists "profile read self or admin" on public.profiles;
create policy "profile read self or admin" on public.profiles
for select to authenticated using (id = (select auth.uid()) or public.is_admin());

-- Conteúdos: público lê apenas publicados; utilizadores autenticados com papel autorizado gerem.
drop policy if exists "public read published adventures" on public.adventures;
create policy "public read published adventures" on public.adventures
for select to anon, authenticated using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists "staff manage adventures" on public.adventures;
create policy "staff manage adventures" on public.adventures
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read published stories" on public.stories;
create policy "public read published stories" on public.stories
for select to anon, authenticated using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists "staff manage stories" on public.stories;
create policy "staff manage stories" on public.stories
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read published media" on public.media_assets;
create policy "public read published media" on public.media_assets
for select to anon, authenticated using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists "staff manage media" on public.media_assets;
create policy "staff manage media" on public.media_assets
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read published events" on public.events;
create policy "public read published events" on public.events
for select to anon, authenticated using (status = 'published');

drop policy if exists "staff manage events" on public.events;
create policy "staff manage events" on public.events
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Cartas: só o responsável lê as suas; equipa autorizada pode moderar.
drop policy if exists "guardian read own letters" on public.letters;
create policy "guardian read own letters" on public.letters
for select to authenticated using (guardian_user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "guardian submit own letters" on public.letters;
create policy "guardian submit own letters" on public.letters
for insert to authenticated with check (guardian_user_id = (select auth.uid()));

drop policy if exists "staff manage letters" on public.letters;
create policy "staff manage letters" on public.letters
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "guardian read own responses" on public.letter_responses;
create policy "guardian read own responses" on public.letter_responses
for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.letters l
    where l.id = letter_id and l.guardian_user_id = (select auth.uid())
  )
);

drop policy if exists "staff manage responses" on public.letter_responses;
create policy "staff manage responses" on public.letter_responses
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Preferências: utilizador só gere as suas.
drop policy if exists "user read own notification preferences" on public.notification_preferences;
create policy "user read own notification preferences" on public.notification_preferences
for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "user insert own notification preferences" on public.notification_preferences;
create policy "user insert own notification preferences" on public.notification_preferences
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "user update own notification preferences" on public.notification_preferences;
create policy "user update own notification preferences" on public.notification_preferences
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Buckets: conteúdo público (ficheiros só podem ser enviados por equipa autenticada)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-media',
  'public-media',
  true,
  52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
)
on conflict (id) do nothing;

-- Cartas/desenhos são privados. Não criar URLs públicas para este bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-letters',
  'private-letters',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "public read published media files" on storage.objects;
create policy "public read published media files" on storage.objects
for select to anon, authenticated using (bucket_id = 'public-media');

drop policy if exists "staff upload public media files" on storage.objects;
create policy "staff upload public media files" on storage.objects
for insert to authenticated with check (bucket_id = 'public-media' and public.is_admin());

drop policy if exists "staff update public media files" on storage.objects;
create policy "staff update public media files" on storage.objects
for update to authenticated using (bucket_id = 'public-media' and public.is_admin())
with check (bucket_id = 'public-media' and public.is_admin());

drop policy if exists "staff delete public media files" on storage.objects;
create policy "staff delete public media files" on storage.objects
for delete to authenticated using (bucket_id = 'public-media' and public.is_admin());

-- Bucket privado: sem leitura/escrita para anon. O fluxo de cartas deverá ser revisto
-- antes de produção para permitir acesso do responsável e da equipa de moderação por pastas/IDs.
drop policy if exists "staff upload private letter files" on storage.objects;
create policy "staff upload private letter files" on storage.objects
for insert to authenticated with check (bucket_id = 'private-letters' and public.is_admin());

drop policy if exists "staff read private letter files" on storage.objects;
create policy "staff read private letter files" on storage.objects
for select to authenticated using (bucket_id = 'private-letters' and public.is_admin());

drop policy if exists "staff delete private letter files" on storage.objects;
create policy "staff delete private letter files" on storage.objects
for delete to authenticated using (bucket_id = 'private-letters' and public.is_admin());

create index if not exists adventures_publication_idx on public.adventures (status, published_at desc);
create index if not exists stories_publication_idx on public.stories (status, published_at desc);
create index if not exists media_publication_idx on public.media_assets (status, published_at desc);
create index if not exists events_schedule_idx on public.events (status, starts_at);
create index if not exists letters_guardian_idx on public.letters (guardian_user_id, created_at desc);
create index if not exists notifications_preferences_user_idx on public.notification_preferences (user_id);
