-- Tesserino di cantiere verificabile dal QR (richiesta del founder, 23/11/2026).
--
-- Prima il QR del tesserino conteneva un JSON con l'id dell'utente e il nome: non portava a nessuna pagina e
-- chiunque poteva scriverne uno uguale. Ora il QR apre /tesserino#<codice>: una pagina pubblica che chiede al
-- database se quel codice è di un lavoratore in forza e se formazione e idoneità sono in corso di validità.
--
-- - Il codice è un uuid non indovinabile, uno per scheda del personale, in una tabella che nessuno legge
--   direttamente. L'operaio ottiene il suo con `campo_mio_tesserino()`; l'ufficio lo rigenera (e quello vecchio
--   smette di funzionare) con `tesserino_rigenera()`.
-- - `verifica_tesserino()` è pubblica di proposito (chi controlla in cantiere non ha un account): espone nome,
--   foto, azienda, mansione, data di assunzione e lo stato dei controlli. Mai i documenti, i file, le date di
--   nascita o il tipo di permesso.
-- - In regola = scheda attiva e non cessata, corso di sicurezza e idoneità sanitaria (visita o giudizio) in corso
--   di validità nel modulo Personale, nessun documento personale (identità, permesso, UNILAV) scaduto.

create table if not exists public.tesserini_codici (
  hr_profilo_id uuid primary key references public.hr_profili(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  creato_il timestamptz not null default now()
);

alter table public.tesserini_codici enable row level security;
revoke all on public.tesserini_codici from anon, authenticated;

-- Il codice del mio tesserino: lo crea la prima volta.
create or replace function public.campo_mio_tesserino()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azienda uuid := public.get_effective_company_id();
  v_profilo uuid;
  v_token uuid;
begin
  if auth.uid() is null or v_azienda is null or public.utente_bloccato() then
    return null;
  end if;
  v_profilo := public.hr_profilo_da_user(auth.uid(), v_azienda);
  if v_profilo is null then
    return null;
  end if;
  insert into public.tesserini_codici (hr_profilo_id, company_id) values (v_profilo, v_azienda)
  on conflict (hr_profilo_id) do nothing;
  select t.token into v_token from public.tesserini_codici t where t.hr_profilo_id = v_profilo;
  return v_token;
end;
$$;

-- L'ufficio rigenera il codice (tesserino perso o rubato): il QR vecchio non verifica più.
create or replace function public.tesserino_rigenera(p_profilo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azienda uuid;
  v_token uuid;
begin
  select hp.company_id into v_azienda from public.hr_profili hp where hp.id = p_profilo;
  if v_azienda is null or auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(v_azienda)
     or (public.e_amministratore_di(v_azienda) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) is distinct from true then
    raise exception using errcode = '42501', message = 'Operazione non consentita';
  end if;
  insert into public.tesserini_codici (hr_profilo_id, company_id, token) values (p_profilo, v_azienda, gen_random_uuid())
  on conflict (hr_profilo_id) do update set token = gen_random_uuid(), creato_il = now()
  returning token into v_token;
  return v_token;
end;
$$;

-- Verifica pubblica dal QR. Codice sconosciuto o rigenerato → null.
create or replace function public.verifica_tesserino(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with persona as (
    select hp.id, hp.nome, hp.cognome, hp.mansione, hp.data_assunzione, hp.attivo, hp.data_cessazione,
           coalesce(nullif(hp.foto_url, ''), pr.avatar_url) as foto,
           c.id as azienda_id, coalesce(nullif(c.business_name, ''), c.name) as azienda, c.vat_number, c.deleted_at
      from public.tesserini_codici t
      join public.hr_profili hp on hp.id = t.hr_profilo_id
      join public.companies c on c.id = t.company_id
      left join public.profiles pr on pr.id = hp.user_id
     where t.token = p_token
  ),
  documenti as (
    select case
             when d.categoria = 'corso_sicurezza' then 'formazione'
             when d.categoria in ('idoneita', 'visita_medica') then 'idoneita'
             when d.categoria in ('documento_identita', 'permesso_soggiorno', 'unilav') then 'personali'
           end as gruppo,
           d.data_scadenza
      from public.hr_documenti d join persona p on d.hr_profilo_id = p.id
  ),
  controlli as (
    select g.gruppo,
           case
             when exists (select 1 from documenti d where d.gruppo = g.gruppo and (d.data_scadenza is null or d.data_scadenza >= current_date)) then 'ok'
             when exists (select 1 from documenti d where d.gruppo = g.gruppo) then 'scaduto'
             else 'mancante'
           end as stato,
           (select max(d.data_scadenza) from documenti d where d.gruppo = g.gruppo) as scadenza
      from (values ('formazione'), ('idoneita'), ('personali')) g(gruppo)
  )
  select jsonb_build_object(
    'esito', case
      when not coalesce(p.attivo, false) or (p.data_cessazione is not null and p.data_cessazione <= current_date) or p.deleted_at is not null
        then 'non_valido'
      when exists (select 1 from controlli c where (c.gruppo in ('formazione', 'idoneita') and c.stato <> 'ok')
                                               or (c.gruppo = 'personali' and c.stato = 'scaduto'))
        then 'da_verificare'
      else 'valido'
    end,
    'nome', p.nome,
    'cognome', p.cognome,
    'foto', case when p.foto ~ '^https://' then p.foto end,
    'azienda', p.azienda,
    'partita_iva', p.vat_number,
    'mansione', p.mansione,
    'assunto_il', p.data_assunzione,
    'controlli', (select jsonb_agg(jsonb_build_object('voce', c.gruppo, 'stato', c.stato,
                    'scadenza', case when c.gruppo = 'personali' then null else c.scadenza end) order by c.gruppo) from controlli c),
    'verificato_il', now()
  )
  from persona p;
$$;

revoke all on function public.campo_mio_tesserino() from public, anon;
grant execute on function public.campo_mio_tesserino() to authenticated;
revoke all on function public.tesserino_rigenera(uuid) from public, anon;
grant execute on function public.tesserino_rigenera(uuid) to authenticated;
revoke all on function public.verifica_tesserino(uuid) from public;
grant execute on function public.verifica_tesserino(uuid) to anon, authenticated;

insert into public.funzioni_pubbliche_di_proposito (nome, motivo, dal)
values ('verifica_tesserino',
  'Pagina pubblica aperta dal QR del tesserino di cantiere: dice se il lavoratore è in forza e se formazione e idoneità sono valide. Espone solo nome, foto, azienda, mansione, data di assunzione ed esito dei controlli; serve il codice del tesserino, un uuid non indovinabile che l''ufficio può rigenerare.',
  current_date)
on conflict do nothing;
