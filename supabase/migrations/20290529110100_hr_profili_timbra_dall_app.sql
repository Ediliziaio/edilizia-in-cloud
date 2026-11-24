alter table public.hr_profili add column if not exists timbra_dall_app boolean not null default true;
comment on column public.hr_profili.timbra_dall_app is
  'Se false, la persona non timbra dall''app operai: le ore le segna il caposquadra o l''ufficio.';
