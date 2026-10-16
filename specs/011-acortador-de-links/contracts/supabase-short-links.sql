-- DISEÑO (Fase B) — no se aplica todavía. Se versionará en supabase/migrations/ cuando exista la integración
-- con la plataforma que ya tiene roles y usuarios. Ver specs/011-acortador-de-links/plan.md.

create table public.short_links (
  code          text primary key check (code ~ '^[2-9a-hjkmnp-z]{8}$'),
  destination   text not null check (length(destination) <= 2048),
  original_url  text not null check (length(original_url) <= 2048),
  revision      integer not null default 1,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- El mismo link original no puede tener dos códigos (idempotencia).
create unique index short_links_original_url_key on public.short_links (md5(original_url));

create table public.short_link_history (
  id           bigint generated always as identity primary key,
  code         text not null references public.short_links (code) on delete cascade,
  destination  text not null,
  changed_by   uuid references auth.users (id),
  changed_at   timestamptz not null default now()
);
create index short_link_history_code_idx on public.short_link_history (code, changed_at desc);

create table public.qr_assets (
  storage_key  text primary key,            -- qr/v1/{sha256}.svg
  payload      text not null,               -- lo que codifica (el link corto)
  svg_sha256   text not null,
  renderer     text not null,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);

alter table public.short_links        enable row level security;
alter table public.short_link_history enable row level security;
alter table public.qr_assets          enable row level security;

-- Las políticas dependen del modelo de roles de la plataforma (p. ej. un claim `app_role`):
--   create policy "producción y admin crean" on public.short_links for insert to authenticated
--     with check ((auth.jwt() ->> 'app_role') in ('produccion', 'admin'));
--   create policy "solo admin cambia destinos" on public.short_links for update to authenticated
--     using ((auth.jwt() ->> 'app_role') = 'admin');
-- El redirect público NO lee las tablas con RLS: usa una función de solo lectura.

create or replace function public.resolve_short_link(p_code text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select destination from public.short_links where code = p_code;
$$;
revoke all on function public.resolve_short_link(text) from public;
grant execute on function public.resolve_short_link(text) to anon, authenticated;
