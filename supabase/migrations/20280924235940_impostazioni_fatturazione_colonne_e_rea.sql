-- Impostazioni → Fatturazione: le colonne che la pagina scriveva e che non
-- esistevano, più i dati del registro imprese (24/09/2026).
--
-- La pagina salva il form intero su anagrafica_azienda. Quindici dei suoi campi
-- non avevano una colonna: metodo e termini di pagamento predefiniti (nella
-- stessa scheda dell'IBAN), tipo documento predefinito, ritenuta e cassa
-- predefinite, rivalsa INPS, IVA per cassa, bollo automatico, testi di apertura
-- e chiusura. Toccarne uno bastava a far fallire TUTTO il salvataggio — IBAN
-- compreso — con l'errore di PostgREST sulla colonna che manca.
--
-- E per le società mancavano i campi del registro imprese: numero REA e
-- capitale sociale vanno in fattura (art. 2250 c.c., blocco <IscrizioneREA>),
-- ma l'ufficio era sempre la provincia della sede e lo stato sempre «non in
-- liquidazione». Ora ci sono rea_ufficio e stato_liquidazione.
--
-- Solo colonne nuove con valore predefinito su una tabella di poche righe:
-- istantaneo. Idempotente.

set local lock_timeout = '5s';

alter table public.anagrafica_azienda
  add column if not exists bollo_virtuale_auto boolean not null default true,
  add column if not exists iva_per_cassa boolean not null default false,
  add column if not exists rivalsa_inps boolean not null default false,
  add column if not exists ritenuta_acconto_default boolean not null default false,
  add column if not exists ritenuta_aliquota_default numeric,
  add column if not exists ritenuta_causale_default text,
  add column if not exists ritenuta_tipo_default text,
  add column if not exists cassa_previdenziale_default boolean not null default false,
  add column if not exists cassa_tipo_default text,
  add column if not exists cassa_aliquota_default numeric,
  add column if not exists metodo_pagamento_default text,
  add column if not exists termini_pagamento_default text,
  add column if not exists testo_intro_default text,
  add column if not exists testo_conclusivo_default text,
  add column if not exists tipo_documento_default text,
  add column if not exists rea_ufficio text,
  add column if not exists stato_liquidazione text not null default 'LN';

comment on column public.anagrafica_azienda.rea_ufficio is
  'Provincia dell''ufficio del registro imprese (<IscrizioneREA><Ufficio>). Vuoto = provincia della sede.';
comment on column public.anagrafica_azienda.stato_liquidazione is
  'LN non in liquidazione, LS in liquidazione (<IscrizioneREA><StatoLiquidazione>).';
comment on column public.anagrafica_azienda.iva_per_cassa is
  'Regime IVA per cassa (art. 32-bis DL 83/2012): esigibilità differita e dicitura in fattura.';
comment on column public.anagrafica_azienda.bollo_virtuale_auto is
  'Applica da solo il bollo virtuale di 2 euro quando la parte senza IVA supera 77,47 euro.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'anagrafica_azienda_rea_ufficio_check') then
    alter table public.anagrafica_azienda
      add constraint anagrafica_azienda_rea_ufficio_check check (rea_ufficio is null or rea_ufficio ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anagrafica_azienda_stato_liquidazione_check') then
    alter table public.anagrafica_azienda
      add constraint anagrafica_azienda_stato_liquidazione_check check (stato_liquidazione in ('LN', 'LS'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anagrafica_azienda_cassa_tipo_default_check') then
    alter table public.anagrafica_azienda
      add constraint anagrafica_azienda_cassa_tipo_default_check
      check (cassa_tipo_default is null or cassa_tipo_default ~ '^TC(0[1-9]|1[0-9]|2[0-2])$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anagrafica_azienda_ritenuta_tipo_default_check') then
    alter table public.anagrafica_azienda
      add constraint anagrafica_azienda_ritenuta_tipo_default_check
      check (ritenuta_tipo_default is null or ritenuta_tipo_default ~ '^RT0[1-6]$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anagrafica_azienda_metodo_pagamento_default_check') then
    alter table public.anagrafica_azienda
      add constraint anagrafica_azienda_metodo_pagamento_default_check
      check (metodo_pagamento_default is null or metodo_pagamento_default ~ '^MP(0[1-9]|1[0-9]|2[0-3])$');
  end if;
end $$;
