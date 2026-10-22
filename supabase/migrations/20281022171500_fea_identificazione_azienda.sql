-- Firma elettronica avanzata: l'identificazione la può fare anche l'azienda.
--
-- Il DPCM 22/02/2013 art. 57 c.1 a chiede di identificare chi firma con un
-- documento di riconoscimento valido: lo può fare chi firma (caricando la foto
-- dalla pagina di firma) oppure l'azienda, che vede il documento di persona, in
-- ufficio o in cantiere, e lo carica dal gestionale. In tutti e due i casi la
-- dichiarazione di accettazione delle condizioni la dà SOLO chi firma, dalla
-- pagina di firma, dopo il codice: per questo i campi della dichiarazione
-- restano vuoti finché non la accetta.
alter table public.fea_firmatari
  alter column dichiarazione_versione drop not null,
  alter column dichiarazione_hash drop not null,
  alter column dichiarazione_accettata_at drop not null,
  alter column dichiarazione_accettata_at drop default,
  add column if not exists modalita text not null default 'autonoma',
  add column if not exists identificato_da uuid,
  add column if not exists dichiarazione_ip inet,
  add column if not exists dichiarazione_user_agent text,
  add column if not exists dichiarazione_richiesta_id uuid,
  add column if not exists revocato_da uuid;
alter table public.fea_firmatari drop constraint if exists fea_firmatari_modalita_check;
alter table public.fea_firmatari add constraint fea_firmatari_modalita_check
  check (modalita in ('autonoma', 'azienda'));
-- La dichiarazione o c'è tutta o non c'è.
alter table public.fea_firmatari drop constraint if exists fea_firmatari_dichiarazione_completa;
alter table public.fea_firmatari add constraint fea_firmatari_dichiarazione_completa
  check ((dichiarazione_versione is null) = (dichiarazione_hash is null)
     and (dichiarazione_hash is null) = (dichiarazione_accettata_at is null));

-- Chi manda i documenti in firma (titolare e ufficio) vede chi è già identificato.
drop policy if exists fea_firmatari_lettura on public.fea_firmatari;
create policy fea_firmatari_lettura on public.fea_firmatari for select to authenticated
  using (public.e_amministratore_di(company_id)
    or (company_id = (select public.get_my_company_id()) and (select public.has_role(auth.uid(), 'company_staff'::public.app_role)))
    or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)));
