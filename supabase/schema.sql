-- WSE production database schema for Supabase/Postgres.
create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','assessor')),
  assigned_area_slugs text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create table if not exists public.assessment_areas (
  slug text primary key,
  name text not null,
  sort_order int not null
);

create table if not exists public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  area_slug text not null references public.assessment_areas(slug) on delete cascade,
  number text not null,
  section_name text,
  name text not null,
  statement text,
  sort_order int not null,
  source_improvement_options jsonb not null default '[]'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  unique(area_slug, number)
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  area_slug text not null references public.assessment_areas(slug),
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  completed_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(school_id, area_slug)
);

create table if not exists public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  item_id uuid not null references public.assessment_items(id) on delete cascade,
  rating int check (rating between 1 and 5),
  finding text,
  selected_suggestions jsonb not null default '[]'::jsonb,
  own_improvement text,
  recommendation text,
  action_required text,
  responsible_person text,
  priority text check (priority in ('High','Medium','Low') or priority is null),
  target_date date,
  estimated_budget numeric,
  status text not null default 'Not Started',
  progress text,
  updated_at timestamptz not null default now(),
  unique(assessment_id, item_id)
);

create or replace function public.is_school_member(target_school uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.school_members where school_id=target_school and user_id=auth.uid());
$$;

create or replace function public.is_school_admin(target_school uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.school_members where school_id=target_school and user_id=auth.uid() and role='admin');
$$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_members enable row level security;
alter table public.assessment_areas enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_responses enable row level security;

create policy "members can view their school" on public.schools for select using (public.is_school_member(id));
create policy "admins can update their school" on public.schools for update using (public.is_school_admin(id));

create policy "users can view own profile" on public.profiles for select using (id=auth.uid());
create policy "users can update own profile" on public.profiles for update using (id=auth.uid());

create policy "members can view membership" on public.school_members for select using (user_id=auth.uid() or public.is_school_member(school_id));
create policy "admins can manage membership" on public.school_members for all using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

create policy "authenticated users can read areas" on public.assessment_areas for select to authenticated using (true);
create policy "authenticated users can read items" on public.assessment_items for select to authenticated using (true);

create policy "members can view assessments" on public.assessments for select using (public.is_school_member(school_id));
create policy "members can insert assessments" on public.assessments for insert with check (public.is_school_member(school_id));
create policy "members can update assessments" on public.assessments for update using (public.is_school_member(school_id));

create policy "members can view responses" on public.assessment_responses for select using (
  exists(select 1 from public.assessments a where a.id=assessment_id and public.is_school_member(a.school_id))
);
create policy "members can insert responses" on public.assessment_responses for insert with check (
  exists(select 1 from public.assessments a where a.id=assessment_id and public.is_school_member(a.school_id))
);
create policy "members can update responses" on public.assessment_responses for update using (
  exists(select 1 from public.assessments a where a.id=assessment_id and public.is_school_member(a.school_id))
);
