-- Non tutti timbrano dall'app (24/11/2026, richiesta del founder): chi non ha il telefono, chi ha le ore segnate
-- dal caposquadra. Con l'interruttore spento la Home dell'area operai non mostra la timbratura e lo dice.
-- Acceso di base: niente cambia per chi oggi timbra.
alter table public.hr_profili add column if not exists timbra_dall_app boolean not null default true;

comment on column public.hr_profili.timbra_dall_app is
  'Se false, la persona non timbra dall''app operai: le ore le segna il caposquadra o l''ufficio.';
