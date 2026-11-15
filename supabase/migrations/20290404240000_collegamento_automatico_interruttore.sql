-- Collegamento automatico: un interruttore per azienda, spento di base (decisione del titolare, 15/11/2026).
-- Vale per tutti i collegamenti: acquisti, tesoreria, subappalti. Documento: docs/automazioni-acquisti.md §3.
--
--   acceso → ciò che ha esito «unico e verificato» si collega da solo, e la traccia lo segna «automatico»;
--   spento → lo stesso esito diventa una proposta (stato «proposto») che si conferma con un clic
--            (acquisti_collegamento_cambia_stato(id, 'collegato')).
--   Gli altri esiti (plausibile, più candidati, conflitto, nessuno) non cambiano in nessun caso.
--
-- Si legge SOLO lato server: azienda_collegamento_automatico(azienda). La scrive l'amministratore
-- dell'azienda dalla pagina Impostazioni → Approvazioni e avvisi (policy cgs_write già esistente).
-- La applicano qui acquisti_collega_ddt (aggancio fattura↔bolla) e acquisti_collegamento_registra
-- (la porta comune di B, C e D): chi passa da lì non deve leggerla da sé.
-- I collegamenti già fatti prima di oggi non si toccano.

alter table public.company_governance_settings
  add column if not exists collegamento_automatico boolean not null default false;
comment on column public.company_governance_settings.collegamento_automatico is
  'Se true, i collegamenti con esito «unico e verificato» si fanno da soli; se false diventano proposte da confermare.';

create or replace function public.azienda_collegamento_automatico(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select g.collegamento_automatico from public.company_governance_settings g where g.company_id = p_company), false)
     and (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or auth.uid() is null or public.user_can_access_company(p_company))
$$;
revoke all on function public.azienda_collegamento_automatico(uuid) from public, anon;
grant execute on function public.azienda_collegamento_automatico(uuid) to authenticated, service_role;

-- Aggancia le righe fattura_ddt ancora senza bolla. p_fattura o p_ddt restringono il lavoro
-- (una fattura appena arrivata, una bolla appena registrata); p_scrivi = false è l'anteprima.
-- Restituisce una riga per ogni riga fattura_ddt esaminata, con l'esito.
create or replace function public.acquisti_collega_ddt(p_company uuid, p_fattura uuid default null, p_ddt uuid default null,
                                                       p_scrivi boolean default true, p_limite integer default 500)
returns table (fattura_ddt_id uuid, fattura_id uuid, numero_ddt text, data_ddt date, esito text, ddt_id uuid, motivo text)
language plpgsql security definer set search_path = public as $$
declare r record; v_acceso boolean := public.azienda_collegamento_automatico(p_company); v_n integer; v_vicine integer; v_scelto uuid; v_data date; v_numero text; v_esito text; v_motivo text; v_chiave text;
begin
  for r in
    select fd.id, fd.fattura_ricevuta_id, fd.numero_ddt, fd.data_ddt, f.fornitore_id, f.tipo_documento
      from public.fattura_ddt fd join public.fatture_ricevute f on f.id = fd.fattura_ricevuta_id
     where fd.company_id = p_company and fd.ddt_ricezione_id is null
       and (p_fattura is null or fd.fattura_ricevuta_id = p_fattura)
       -- Per una bolla appena registrata: solo le righe dello stesso fornitore con la stessa chiave,
       -- filtrate PRIMA del limite (un fornitore può avere centinaia di righe in attesa).
       and (p_ddt is null or (f.fornitore_id, (public.acquisti_numero_documento(fd.numero_ddt)).chiave) =
            (select d.supplier_id, (public.acquisti_numero_documento(d.numero_ddt)).chiave from public.ddt_ricezione d where d.id = p_ddt))
     order by fd.created_at
     limit p_limite
  loop
    v_scelto := null; v_esito := 'nessuno'; v_motivo := null;
    if r.fornitore_id is null then
      v_motivo := 'fattura senza fornitore riconosciuto';
    else
      select count(*), count(*) filter (where k.vicina), min(k.ddt_id::text) filter (where k.vicina)::uuid
        into v_n, v_vicine, v_scelto
        from public.acquisti_ddt_candidati(p_company, r.fornitore_id, r.numero_ddt, r.data_ddt) k;
      if p_ddt is not null and not exists (select 1 from public.acquisti_ddt_candidati(p_company, r.fornitore_id, r.numero_ddt, r.data_ddt) k where k.ddt_id = p_ddt) then
        continue; -- la bolla appena registrata non c'entra con questa riga
      end if;
      -- Come shared/acquisti/catena.ts → abbinaDdt: più bolle candidate = scelta, anche se una sola ha la data vicina.
      if v_n = 0 then v_motivo := 'nessuna bolla registrata con questo numero';
      elsif v_n > 1 then v_esito := 'scelta'; v_motivo := v_n || ' bolle dello stesso fornitore con questo numero'; v_scelto := null;
      elsif v_vicine = 0 then v_esito := 'proposta'; v_motivo := 'stesso numero ma date lontane o mancanti';
        select k.ddt_id into v_scelto from public.acquisti_ddt_candidati(p_company, r.fornitore_id, r.numero_ddt, r.data_ddt) k limit 1;
      else
        v_esito := 'automatico'; v_motivo := 'stesso fornitore, stesso numero, data entro 10 giorni';
        if exists (select 1 from public.fattura_ddt o join public.fatture_ricevute f2 on f2.id = o.fattura_ricevuta_id
                    where o.ddt_ricezione_id = v_scelto and o.fattura_ricevuta_id <> r.fattura_ricevuta_id
                      and public.e_nota_credito_ricevuta(f2.tipo_documento) = public.e_nota_credito_ricevuta(r.tipo_documento)) then
          v_esito := 'proposta'; v_motivo := 'la bolla è già agganciata a un''altra fattura';
        end if;
        v_chiave := p_company || '|fattura_ricevuta:' || r.fattura_ricevuta_id || '|ddt:' || v_scelto || '|xml_ddt_numero_data_fornitore';
        if exists (select 1 from public.acquisti_collegamenti x where x.company_id = p_company and x.chiave = v_chiave and x.stato in ('rifiutato', 'annullato')) then
          v_esito := 'proposta'; v_motivo := 'collegamento già annullato da una persona: non si rifà da solo';
        end if;
      end if;
    end if;

    -- Interruttore dell'azienda spento: «unico e verificato» diventa una proposta da confermare con un clic
    -- (acquisti_collegamento_cambia_stato(id, 'collegato') mette la bolla sulla riga).
    if v_esito = 'automatico' and not v_acceso then
      v_esito := 'proposta'; v_motivo := v_motivo || ' — da confermare: il collegamento automatico è spento';
      if p_scrivi then
        select d.numero_ddt, d.data_ricezione into v_numero, v_data from public.ddt_ricezione d where d.id = v_scelto;
        insert into public.acquisti_collegamenti (company_id, da_tipo, da_id, a_tipo, a_id, regola, versione_regola, esito, prove, stato,
                                                   autore_tipo, autore_processo, chiave)
        values (p_company, 'fattura_ricevuta', r.fattura_ricevuta_id, 'ddt', v_scelto, 'xml_ddt_numero_data_fornitore', 1, 'proposta',
                jsonb_build_array(
                  jsonb_build_object('campo', 'fornitore', 'ruolo', 'conferma', 'esito', 'uguale', 'testo', 'stesso fornitore'),
                  jsonb_build_object('campo', 'numero_ddt', 'ruolo', 'identifica', 'esito', 'uguale', 'atteso', r.numero_ddt, 'trovato', v_numero,
                                     'testo', 'DDT ' || v_numero),
                  jsonb_build_object('campo', 'data_ddt', 'ruolo', 'conferma', 'esito', 'uguale', 'atteso', r.data_ddt, 'trovato', v_data,
                                     'testo', 'data compatibile (' || v_data || ')')),
                'proposto', 'processo', coalesce(nullif(current_setting('acquisti.processo', true), ''), 'acquisti_collega_ddt'), v_chiave)
        on conflict (company_id, chiave) do nothing;
      end if;
    end if;

    if p_scrivi and v_esito = 'automatico' then
      update public.fattura_ddt set ddt_ricezione_id = v_scelto where id = r.id and ddt_ricezione_id is null;
      if found then
        select d.numero_ddt, d.data_ricezione into v_numero, v_data from public.ddt_ricezione d where d.id = v_scelto;
        insert into public.acquisti_collegamenti (company_id, da_tipo, da_id, a_tipo, a_id, regola, versione_regola, esito, prove, stato,
                                                   autore_tipo, autore_processo, chiave)
        values (p_company, 'fattura_ricevuta', r.fattura_ricevuta_id, 'ddt', v_scelto, 'xml_ddt_numero_data_fornitore', 1, 'automatico',
                jsonb_build_array(
                  jsonb_build_object('campo', 'fornitore', 'ruolo', 'conferma', 'esito', 'uguale', 'testo', 'stesso fornitore'),
                  jsonb_build_object('campo', 'numero_ddt', 'ruolo', 'identifica', 'esito', 'uguale', 'atteso', r.numero_ddt, 'trovato', v_numero,
                                     'testo', 'DDT ' || v_numero),
                  jsonb_build_object('campo', 'data_ddt', 'ruolo', 'conferma', 'esito', 'uguale', 'atteso', r.data_ddt, 'trovato', v_data,
                                     'testo', 'data compatibile (' || v_data || ')')),
                'collegato', 'processo', coalesce(nullif(current_setting('acquisti.processo', true), ''), 'acquisti_collega_ddt'),
                p_company || '|fattura_ricevuta:' || r.fattura_ricevuta_id || '|ddt:' || v_scelto || '|xml_ddt_numero_data_fornitore')
        on conflict (company_id, chiave) do nothing;
      else
        v_esito := 'già collegata'; -- un altro giro, in parallelo, è arrivato prima
      end if;
    end if;
    fattura_ddt_id := r.id; fattura_id := r.fattura_ricevuta_id; numero_ddt := r.numero_ddt; data_ddt := r.data_ddt;
    esito := v_esito; ddt_id := v_scelto; motivo := v_motivo;
    return next;
  end loop;
end $$;

revoke all on function public.acquisti_collega_ddt(uuid, uuid, uuid, boolean, integer) from public, anon, authenticated;

create or replace function public.acquisti_collegamento_registra(
  p_company uuid,
  p_da_tipo text, p_da_id uuid, p_da_riga text,
  p_a_tipo text, p_a_id uuid, p_a_riga text,
  p_regola text,
  p_esito text,
  p_prove jsonb default '[]'::jsonb,
  p_percorso jsonb default null,
  p_quantita numeric default null,
  p_unita text default null,
  p_importo numeric default null,
  p_versione_regola integer default 1,
  p_con_ai boolean default false,
  p_motivo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_chiave text; v_id uuid; v_stato text; v_nuovo text; v_utente uuid := auth.uid();
begin
  -- L'interruttore dell'azienda decide: spento (di base), «automatico» si registra come proposta.
  if p_esito = 'automatico' and not public.azienda_collegamento_automatico(p_company) then
    p_esito := 'proposta';
  end if;
  if not public.acquisti_puo_collegare(p_company) then
    raise exception 'Non hai il permesso di collegare i documenti d''acquisto.' using errcode = '42501';
  end if;
  if p_esito not in ('automatico', 'proposta', 'manuale') then
    raise exception 'Esito non valido: solo automatico, proposta o manuale si registrano (scelta, conflitto e nessuno restano all''utente).' using errcode = '22023';
  end if;
  if btrim(coalesce(p_regola, '')) = '' or length(p_regola) > 80 then
    raise exception 'Serve il nome della regola.' using errcode = '22023';
  end if;
  if p_prove is null or jsonb_typeof(p_prove) <> 'array' then
    raise exception 'Le prove vanno passate come elenco.' using errcode = '22023';
  end if;
  if p_esito = 'manuale' and v_utente is null then
    raise exception 'Un collegamento manuale lo fa una persona.' using errcode = '22023';
  end if;
  if not public.acquisti_documento_dell_azienda(p_da_tipo, p_da_id, p_company)
     or not public.acquisti_documento_dell_azienda(p_a_tipo, p_a_id, p_company) then
    raise exception 'Un documento non è di questa azienda.' using errcode = '42501';
  end if;

  v_chiave := p_company || '|' || p_da_tipo || ':' || p_da_id || coalesce('#' || nullif(p_da_riga, ''), '')
           || '|' || p_a_tipo || ':' || p_a_id || coalesce('#' || nullif(p_a_riga, ''), '') || '|' || p_regola;
  v_nuovo := case when p_esito = 'proposta' then 'proposto' else 'collegato' end;
  if p_motivo is not null then perform set_config('acquisti.motivo', p_motivo, true); end if;

  insert into public.acquisti_collegamenti (company_id, da_tipo, da_id, da_riga, a_tipo, a_id, a_riga, quantita, unita, importo,
                                            regola, versione_regola, esito, prove, percorso, stato, autore_tipo, autore_id,
                                            autore_processo, con_ai, chiave)
  values (p_company, p_da_tipo, p_da_id, nullif(p_da_riga, ''), p_a_tipo, p_a_id, nullif(p_a_riga, ''), p_quantita, p_unita, p_importo,
          p_regola, coalesce(p_versione_regola, 1), p_esito, p_prove, p_percorso, v_nuovo,
          case when v_utente is null then 'processo' else 'utente' end, v_utente,
          case when v_utente is null then coalesce(nullif(current_setting('acquisti.processo', true), ''), 'servizio') end,
          coalesce(p_con_ai, false), v_chiave)
  on conflict (company_id, chiave) do nothing
  returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- Esisteva già: si aggiorna solo quando è un passo avanti ammesso.
  select id, stato into v_id, v_stato from public.acquisti_collegamenti where company_id = p_company and chiave = v_chiave for update;
  if v_stato in ('rifiutato', 'annullato') then
    if p_esito <> 'manuale' then return v_id; end if; -- una regola non contraddice una persona
    update public.acquisti_collegamenti set stato = 'proposto', updated_at = now() where id = v_id;
    v_stato := 'proposto';
  end if;
  if v_stato = 'proposto' and v_nuovo = 'collegato' then
    update public.acquisti_collegamenti
       set stato = 'collegato', esito = p_esito, prove = p_prove, percorso = coalesce(p_percorso, percorso),
           quantita = coalesce(p_quantita, quantita), unita = coalesce(p_unita, unita), importo = coalesce(p_importo, importo),
           versione_regola = coalesce(p_versione_regola, versione_regola), con_ai = con_ai or coalesce(p_con_ai, false),
           autore_tipo = case when v_utente is null then autore_tipo else 'utente' end,
           autore_id = coalesce(v_utente, autore_id), updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.acquisti_collegamento_registra(uuid, text, uuid, text, text, uuid, text, text, text, jsonb, jsonb, numeric, text, numeric, integer, boolean, text) from public, anon;
grant execute on function public.acquisti_collegamento_registra(uuid, text, uuid, text, text, uuid, text, text, text, jsonb, jsonb, numeric, text, numeric, integer, boolean, text) to authenticated;
