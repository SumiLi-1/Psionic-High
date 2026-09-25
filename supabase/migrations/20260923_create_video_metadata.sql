create table if not exists public.video_metadata (
  bvid text primary key,
  source_url text not null,
  title text not null,
  cover_url text,
  owner_name text,
  duration_seconds integer,
  updated_at timestamptz not null default now()
);

alter table public.video_metadata enable row level security;

create policy "video metadata is publicly readable"
on public.video_metadata for select
to anon, authenticated
using (true);
