-- =============================================================================
-- Schéma Supabase — Analyse offres CIRAD
-- Basé sur les interfaces TypeScript (ProjectData, LotData, Company, NegotiationVersion)
-- =============================================================================

-- Extensions utiles (optionnel, selon votre projet Supabase)
-- create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Table PROJECTS (ProjectData + ProjectInfo)
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  market_ref text not null default '',
  analysis_date date not null default current_date,
  author text not null default '',
  number_of_lots int not null default 1,
  current_lot_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.projects is 'Projets d''analyse (ProjectData)';
comment on column public.projects.user_id is 'Propriétaire du projet (RLS)';

-- -----------------------------------------------------------------------------
-- 2. Table LOTS (LotData)
-- -----------------------------------------------------------------------------
create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null default 'Lot 1',
  lot_number text not null default '',
  lot_analyzed text not null default '',
  has_dual_dpgf boolean not null default false,
  estimation_dpgf1 numeric,
  estimation_dpgf2 numeric,
  tolerance_seuil int not null default 20,
  current_version_id uuid,
  lot_lines jsonb not null default '[]',
  weighting_criteria jsonb not null default '[]',
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lots is 'Lots d''un projet (LotData)';
comment on column public.lots.lot_lines is 'Tableau LotLine[] (id, label, type, dpgfAssignment, estimationDpgf1/2)';
comment on column public.lots.weighting_criteria is 'Tableau WeightingCriterion[] (id, label, weight, subCriteria)';

create index if not exists idx_lots_project_id on public.lots(project_id);
create index if not exists idx_lots_display_order on public.lots(project_id, display_order);

-- -----------------------------------------------------------------------------
-- 3. Table OFFERS (Company / soumissionnaires par lot)
-- -----------------------------------------------------------------------------
create type public.company_status as enum ('retenue', 'ecartee', 'non_defini');

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  company_id int not null,
  name text not null default '',
  status public.company_status not null default 'non_defini',
  exclusion_reason text not null default '',
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lot_id, company_id)
);

comment on table public.offers is 'Entreprises / soumissionnaires par lot (Company[])';

create index if not exists idx_offers_lot_id on public.offers(lot_id);
create index if not exists idx_offers_lot_display_order on public.offers(lot_id, display_order);

-- -----------------------------------------------------------------------------
-- 4. Table ANALYSES (NegotiationVersion)
-- -----------------------------------------------------------------------------
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  label text not null default 'V0',
  created_at timestamptz not null default now(),
  analysis_date date not null default current_date,
  frozen boolean not null default false,
  validated boolean not null default false,
  validated_at timestamptz,
  negotiation_decisions jsonb not null default '{}',
  documents_to_verify jsonb not null default '{}',
  questionnaire jsonb,
  technical_notes jsonb not null default '[]',
  price_entries jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

comment on table public.analyses is 'Versions d''analyse par lot (NegotiationVersion: V0, V1, V2…)';
comment on column public.analyses.technical_notes is 'Tableau TechnicalNote[]';
comment on column public.analyses.price_entries is 'Tableau PriceEntry[]';
comment on column public.analyses.negotiation_decisions is 'Record<companyId, NegotiationDecision>';
comment on column public.analyses.documents_to_verify is 'Record<companyId, string>';

create index if not exists idx_analyses_lot_id on public.analyses(lot_id);

-- Lien optionnel: lots.current_version_id -> analyses.id (après création des analyses)
alter table public.lots
  add constraint fk_lots_current_version
  foreign key (current_version_id) references public.analyses(id) on delete set null;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security (RLS) — chaque utilisateur ne voit que ses projets
-- -----------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.lots enable row level security;
alter table public.offers enable row level security;
alter table public.analyses enable row level security;

-- Projects: CRUD limité au propriétaire
create policy "Users see own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Lots: visibles/modifiables si le projet appartient à l'utilisateur
create policy "Users see lots of own projects"
  on public.lots for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = lots.project_id and p.user_id = auth.uid()
    )
  );

create policy "Users insert lots in own projects"
  on public.lots for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = lots.project_id and p.user_id = auth.uid()
    )
  );

create policy "Users update lots in own projects"
  on public.lots for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = lots.project_id and p.user_id = auth.uid()
    )
  );

create policy "Users delete lots in own projects"
  on public.lots for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = lots.project_id and p.user_id = auth.uid()
    )
  );

-- Offers: idem via lot -> project
create policy "Users see offers of own projects"
  on public.offers for select
  using (
    exists (
      select 1 from public.lots l
      join public.projects p on p.id = l.project_id
      where l.id = offers.lot_id and p.user_id = auth.uid()
    )
  );

create policy "Users insert offers in own projects"
  on public.offers for insert
  with check (
    exists (
      select 1 from public.lots l
      join public.projects p on p.id = l.project_id
      where l.id = offers.lot_id and p.user_id = auth.uid()
    )
  );

create policy "Users update offers in own projects"
  on public.offers for update
  using (
    exists (
      select 1 from public.lots l
      join public.projects p on p.id = l.project_id
      where l.id = offers.lot_id and p.user_id = auth.uid()
    )
  );

create policy "Users delete offers in own projects"
  on public.offers for delete
  using (
    exists (
      select 1 from public.lots l
      join public.projects p on p.id = l.project_id
      where l.id = offers.lot_id and p.user_id = auth.uid()
    )
  );

-- Analyses: idem via lot -> project
create policy "Users see analyses of own projects"
  on public.analyses for select
  using (
    exists (
      select 1 from public.lots l
      join public.projects p on p.id = l.project_id
      where l.id = analyses.lot_id and p.user_id = auth.uid()
    )
  );

create policy "Users insert analyses in own projects"
  on public.analyses for insert
  with check (
    exists (
      select 1 from public.lots l
      join public.projects p on p.id = l.project_id
      where l.id = analyses.lot_id and p.user_id = auth.uid()
    )
  );

create policy "Users update analyses in own projects"
  on public.analyses for update
  using (
    exists (
      select 1 from public.lots l
      join public.projects p on p.id = l.project_id
      where l.id = analyses.lot_id and p.user_id = auth.uid()
    )
  );

create policy "Users delete analyses in own projects"
  on public.analyses for delete
  using (
    exists (
      select 1 from public.lots l
      join public.projects p on p.id = l.project_id
      where l.id = analyses.lot_id and p.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Trigger updated_at (optionnel)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger lots_updated_at
  before update on public.lots
  for each row execute function public.set_updated_at();

create trigger offers_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

create trigger analyses_updated_at
  before update on public.analyses
  for each row execute function public.set_updated_at();
