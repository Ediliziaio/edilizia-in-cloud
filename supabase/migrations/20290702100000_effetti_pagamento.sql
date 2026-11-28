-- Effetti di pagamento: assegni, Ri.Ba., RID con data futura.
-- Un effetto "copre" una quota di scadenza/costo/fattura senza toccare la prima nota:
-- la prima nota nasce solo alla chiusura (chiudi_effetto), con la data dell'esito.
-- Tabella verificata inesistente il 28/11/2026 (to_regclass nullo).
-- Si scrive SOLO dalle funzioni qui sotto (nessun GRANT di scrittura).

SET LOCAL lock_timeout = '3s';

create table if not exists public.effetti_pagamento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  tipo text not null check (tipo in ('assegno','riba','rid')),
  direzione text not null check (direzione in ('emesso','ricevuto')),
  numero text,
  banca text,
  importo numeric(14,2) not null check (importo > 0),
  data_emissione date not null,
  data_scadenza date not null,
  stato text not null default 'in_attesa' check (stato in ('in_attesa','pagato','insoluto','annullato')),
  scadenza_id uuid,
  company_cost_id uuid,
  rata_fornitore_id uuid,
  documento_id uuid,
  data_esito date,
  richiesta_chiusura uuid,
  prima_nota_entry_id uuid,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  chiuso_da uuid,
  chiuso_il timestamptz,
  updated_at timestamptz not null default now(),
  constraint effetti_pagamento_una_fonte check (num_nonnulls(scadenza_id, company_cost_id, documento_id) = 1),
  -- la richiesta è unica per azienda (non globale): l'idempotenza la dà il confronto per effetto
  constraint effetti_pagamento_richiesta_uq unique (company_id, richiesta_chiusura),
  constraint effetti_pagamento_company_fk foreign key (company_id) references public.companies(id) on delete cascade,
  constraint effetti_pagamento_scadenza_fk foreign key (scadenza_id) references public.scadenze(id) on delete cascade,
  constraint effetti_pagamento_costo_fk foreign key (company_cost_id) references public.company_costs(id) on delete cascade,
  constraint effetti_pagamento_rata_fk foreign key (rata_fornitore_id) references public.rate_fornitori(id) on delete set null,
  constraint effetti_pagamento_documento_fk foreign key (documento_id) references public.documenti_fiscali(id) on delete cascade
);

create index if not exists effetti_pagamento_company_stato_scad_idx on public.effetti_pagamento (company_id, stato, data_scadenza);
create index if not exists effetti_pagamento_scadenza_idx on public.effetti_pagamento (scadenza_id);
create index if not exists effetti_pagamento_costo_idx on public.effetti_pagamento (company_cost_id);
create index if not exists effetti_pagamento_documento_idx on public.effetti_pagamento (documento_id);

alter table public.effetti_pagamento enable row level security;
drop policy if exists effetti_pagamento_select on public.effetti_pagamento;
create policy effetti_pagamento_select on public.effetti_pagamento
  for select to authenticated using (public.puo_vedere_scadenze(company_id));

drop policy if exists blocco_utente_bloccato on public.effetti_pagamento;
create policy blocco_utente_bloccato on public.effetti_pagamento
  as restrictive for all to authenticated using (not public.utente_bloccato());

revoke all on public.effetti_pagamento from public, anon, authenticated;
grant select on public.effetti_pagamento to authenticated;
grant all on public.effetti_pagamento to service_role;

-- ── Autorizzazione comune (interna: nessun GRANT, la chiamano solo le funzioni definer) ──
create or replace function public.effetti_autorizza(p_company uuid, p_incasso boolean default false)
returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(auth.jwt()->>'role','') = 'service_role' then return; end if;
  perform public.assert_company_access(p_company);
  if auth.uid() is null
     or public.utente_sola_lettura(p_company)
     or not public.puo_gestire_scadenze(p_company)
     or (p_incasso and not public.puo_incassare_fatture(p_company)) then
    raise exception 'Non hai il permesso di gestire gli effetti di pagamento.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.effetti_autorizza(uuid, boolean) from public, anon;

-- ── Registrazione ──
create or replace function public.registra_effetto(
  p_fonte_tipo text, p_fonte_id uuid, p_rata_fornitore_id uuid, p_tipo text, p_direzione text,
  p_numero text, p_banca text, p_importo numeric, p_data_emissione date, p_data_scadenza date, p_note text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid; v_residuo numeric; v_coperto numeric; v_id uuid;
  v_s public.scadenze; v_c public.company_costs; v_d public.documenti_fiscali;
  v_rata public.rate_fornitori; v_rata_res numeric; v_ha_rate boolean;
begin
  if p_fonte_tipo is null or p_fonte_tipo not in ('scadenza','costo','documento') or p_fonte_id is null then
    raise exception 'Fonte dell''effetto non valida'; end if;
  if p_tipo not in ('assegno','riba','rid') or p_direzione not in ('emesso','ricevuto') then
    raise exception 'Tipo o direzione dell''effetto non validi'; end if;
  if p_importo is null or p_importo <= 0 or p_importo <> round(p_importo,2) or p_importo > 999999999999.99 then
    raise exception 'Importo dell''effetto non valido'; end if;
  if p_data_emissione is null or p_data_scadenza is null or p_data_scadenza <= current_date
     or p_data_emissione > p_data_scadenza then
    raise exception 'La data dell''effetto deve essere futura (e non prima dell''emissione).'; end if;

  -- company_id: sempre dalla fonte, mai dal parametro. Lettura senza blocco per sapere l'azienda.
  if p_fonte_tipo = 'scadenza' then select company_id into v_company from public.scadenze where id = p_fonte_id;
  elsif p_fonte_tipo = 'costo' then select company_id into v_company from public.company_costs where id = p_fonte_id;
  else select company_id into v_company from public.documenti_fiscali where id = p_fonte_id; end if;
  if v_company is null then raise exception 'Fonte non trovata'; end if;

  perform public.effetti_autorizza(v_company, p_fonte_tipo = 'documento');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text, 2810));

  if p_fonte_tipo = 'scadenza' then
    select * into v_s from public.scadenze where id = p_fonte_id and company_id = v_company for update;
    if v_s.status = 'annullata' then raise exception 'Scadenza annullata'; end if;
    if coalesce(v_s.notes,'') like '%[DOC:%' then
      raise exception 'Questa scadenza è di una fattura: registra l''effetto dalla fattura.'; end if;
    if (v_s.direction = 'entrata') <> (p_direzione = 'ricevuto') then
      raise exception 'Direzione dell''effetto incoerente con la scadenza'; end if;
    v_residuo := v_s.amount - v_s.paid_amount;
    select coalesce(sum(importo),0) into v_coperto from public.effetti_pagamento
      where scadenza_id = p_fonte_id and stato = 'in_attesa';
  elsif p_fonte_tipo = 'costo' then
    perform public.spesa_pagamento_autorizza(v_company);
    select * into v_c from public.company_costs where id = p_fonte_id and company_id = v_company for update;
    if v_c.annullato_il is not null then raise exception 'Costo annullato'; end if;
    if p_direzione <> 'emesso' then raise exception 'Un costo si paga con un effetto emesso'; end if;
    if exists (select 1 from public.scadenze s where s.cost_id = v_c.id and s.status <> 'annullata') then
      raise exception 'Questo costo ha una scadenza propria: registra l''effetto dalla scadenza.'; end if;
    v_residuo := public.spesa_pagamento_totale(v_c.id) - coalesce((
      select sum(case when p.direction = 'uscita' then p.amount else -p.amount end)
        from public.prima_nota_entries p where p.company_id = v_company and p.cost_id = v_c.id), 0);
    select coalesce(sum(importo),0) into v_coperto from public.effetti_pagamento
      where company_cost_id = p_fonte_id and stato = 'in_attesa';
    select exists (select 1 from public.rate_fornitori r where r.company_cost_id = v_c.id and r.stato <> 'stornata')
      into v_ha_rate;
    if v_ha_rate and p_rata_fornitore_id is null then
      raise exception 'Questo costo è a rate: indica la rata'; end if;
    if p_rata_fornitore_id is not null then
      select * into v_rata from public.rate_fornitori
        where id = p_rata_fornitore_id and company_cost_id = v_c.id and company_id = v_company;
      if v_rata.id is null or v_rata.stato in ('stornata','pagata') then
        raise exception 'Rata non valida per questo costo'; end if;
      select v_rata.importo - coalesce(sum(importo),0) into v_rata_res from public.effetti_pagamento
        where rata_fornitore_id = v_rata.id and stato = 'in_attesa';
      if p_importo > v_rata_res then raise exception 'Importo superiore al residuo libero della rata'; end if;
    end if;
  else
    select * into v_d from public.documenti_fiscali where id = p_fonte_id and company_id = v_company for update;
    if v_d.deleted_at is not null or v_d.stato in ('bozza','annullata','stornata') or v_d.tipo = 'nota_credito' then
      raise exception 'Su questo documento non si registrano effetti'; end if;
    if p_direzione <> 'ricevuto' then raise exception 'Una fattura emessa si incassa con un effetto ricevuto'; end if;
    v_residuo := coalesce(v_d.totale_da_pagare,0) - public.documento_stornato_totale(v_d.id) - coalesce(v_d.importo_pagato,0);
    select coalesce(sum(importo),0) into v_coperto from public.effetti_pagamento
      where documento_id = p_fonte_id and stato = 'in_attesa';
  end if;

  if p_importo > v_residuo - v_coperto + 0.005 then
    raise exception 'Importo superiore al residuo libero (%)', round(v_residuo - v_coperto, 2); end if;

  insert into public.effetti_pagamento (company_id, tipo, direzione, numero, banca, importo, data_emissione,
    data_scadenza, scadenza_id, company_cost_id, rata_fornitore_id, documento_id, note)
  values (v_company, p_tipo, p_direzione, nullif(btrim(p_numero),''), nullif(btrim(p_banca),''), p_importo,
    p_data_emissione, p_data_scadenza,
    case when p_fonte_tipo = 'scadenza' then p_fonte_id end,
    case when p_fonte_tipo = 'costo' then p_fonte_id end,
    case when p_fonte_tipo = 'costo' then p_rata_fornitore_id end,
    case when p_fonte_tipo = 'documento' then p_fonte_id end, p_note)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'coperto', v_coperto + p_importo,
    'residuo_libero', round(v_residuo - v_coperto - p_importo, 2));
end $$;

-- ── Blocco riga ──
create or replace function public.effetto_blocca(p_effetto uuid)
returns public.effetti_pagamento language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e public.effetti_pagamento; v_company uuid;
begin
  select company_id into v_company from public.effetti_pagamento where id = p_effetto;
  if v_company is null then raise exception 'Effetto non trovato' using errcode = '42501'; end if;
  perform public.effetti_autorizza(v_company);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text, 2810));
  select * into v_e from public.effetti_pagamento where id = p_effetto for update;
  return v_e;
end $$;

-- ── Esito ──
create or replace function public.effetto_segna_esito(
  p_effetto uuid, p_esito text, p_data date, p_richiesta uuid, p_pn_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e public.effetti_pagamento;
begin
  if p_esito not in ('pagato','insoluto','annullato') then raise exception 'Esito non valido'; end if;
  v_e := public.effetto_blocca(p_effetto);
  if v_e.stato <> 'in_attesa' then raise exception 'L''effetto è già chiuso (%)', v_e.stato; end if;
  if p_richiesta is null then raise exception 'Richiesta mancante'; end if;
  if p_esito = 'pagato' then
    if p_data is null or p_data > current_date then raise exception 'Data di pagamento non valida'; end if;
    -- La prima nota deve essere QUELLA della fonte dell'effetto (non una qualsiasi riga di pari importo),
    -- alla data dell'esito, e non già legata a un altro effetto.
    if p_pn_id is null or not exists (select 1 from public.prima_nota_entries p
        where p.id = p_pn_id
          and p.company_id = v_e.company_id
          and p.amount = v_e.importo
          and p.entry_date = p_data
          and (p.payment_request_id = p_richiesta or p.movimento_id is not null)
          and ((v_e.scadenza_id is not null and p.scadenza_id = v_e.scadenza_id)
            or (v_e.company_cost_id is not null and p.cost_id = v_e.company_cost_id)
            or (v_e.documento_id is not null and p.documento_fiscale_id = v_e.documento_id)))
       or exists (select 1 from public.effetti_pagamento x where x.prima_nota_entry_id = p_pn_id and x.id <> v_e.id) then
      raise exception 'Prima nota del pagamento non trovata per questo effetto'; end if;
  end if;
  update public.effetti_pagamento set stato = p_esito,
    data_esito = case when p_esito = 'pagato' then p_data else coalesce(p_data, current_date) end,
    richiesta_chiusura = p_richiesta,
    prima_nota_entry_id = case when p_esito = 'pagato' then p_pn_id end,
    chiuso_da = auth.uid(), chiuso_il = now(), updated_at = now()
  where id = p_effetto;
end $$;

-- ── Chiusura (INVOKER: le funzioni di pagamento girano coi diritti dell'utente) ──
create or replace function public.chiudi_effetto(
  p_effetto uuid, p_esito text, p_data date, p_richiesta uuid,
  p_conto_banca uuid default null, p_conto_liquidita uuid default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_e public.effetti_pagamento; v_pn uuid; v_r json; v_rj jsonb; v_mov uuid;
  v_metodo text; v_rif text; v_nome text;
begin
  if p_esito not in ('pagato','insoluto','annullato') or p_richiesta is null then
    raise exception 'Esito o richiesta non validi'; end if;
  v_e := public.effetto_blocca(p_effetto);

  if v_e.stato <> 'in_attesa' then
    if v_e.richiesta_chiusura = p_richiesta then
      return jsonb_build_object('stato', v_e.stato, 'prima_nota_entry_id', v_e.prima_nota_entry_id, 'gia_chiuso', true);
    end if;
    raise exception 'L''effetto è già chiuso (%)', v_e.stato;
  end if;

  if p_esito = 'pagato' then
    if p_data is null or p_data > current_date then
      raise exception 'La data di pagamento non può essere futura'; end if;
    -- Una rata fornitore non si può pagare da qui: non esiste una RPC di pagamento per rata
    -- (registra_pagamento_costo riceve solo il costo e alloca il pagato in ordine di scadenza),
    -- quindi il pagamento finirebbe su un'altra rata. Si rifiuta finché la RPC non c'è.
    -- Si rifiuta anche per un costo che HA rate non stornate, non solo se l'effetto ha la rata:
    -- rate_fornitori_da_fattura cancella e ricrea le rate a ogni rilettura della fattura, e la FK
    -- (on delete set null) azzererebbe rata_fornitore_id, riaprendo la chiusura «pagato» sulla rata sbagliata.
    -- Scelta preferita a `on delete restrict`, che bloccherebbe la rilettura delle fatture.
    if v_e.rata_fornitore_id is not null
       or (v_e.company_cost_id is not null and exists (select 1 from public.rate_fornitori r
             where r.company_cost_id = v_e.company_cost_id and r.stato <> 'stornata')) then
      raise exception 'Paga questa rata dalla fattura fornitore (l''effetto resta in attesa, oppure segnalo insoluto/annullato).'; end if;
    v_metodo := v_e.tipo;
    v_nome := case v_e.tipo when 'assegno' then 'Assegno' when 'riba' then 'Ri.Ba.' else 'RID' end;
    v_rif := v_nome || coalesce(' n. ' || v_e.numero, '') || coalesce(' – ' || v_e.banca, '');

    -- Se nel frattempo la fonte e' stata saldata a mano, le funzioni di pagamento dicono
    -- «Importo non valido. Residuo: 0», non «gia' pagata». L'interfaccia deve poter proporre
    -- «Annulla assegno» invece di insistere: le diamo un codice stabile, FONTE_GIA_PAGATA.
    begin
      if v_e.scadenza_id is not null then
        v_r := public.mark_scadenza_paid_con_richiesta(v_e.scadenza_id, v_e.importo, v_metodo, p_data, v_rif, 'banca', p_richiesta);
        if v_r->>'error' is not null then raise exception '%', v_r->>'error'; end if;
        v_pn := (v_r->>'prima_nota_entry_id')::uuid;
      elsif v_e.company_cost_id is not null then
        v_rj := public.registra_pagamento_costo_con_conto(v_e.company_cost_id, p_richiesta, v_e.importo, p_data,
          v_metodo, v_rif, p_conto_banca, p_conto_liquidita);
        v_pn := nullif(v_rj->>'prima_nota_id','')::uuid;
        if v_pn is null then
          select id into v_pn from public.prima_nota_entries
            where company_id = v_e.company_id and payment_request_id = p_richiesta; end if;
      else
        v_mov := public.registra_incasso_atomico(v_e.company_id, v_e.documento_id, v_e.importo, v_metodo, p_data, v_rif, v_e.note);
        select id into v_pn from public.prima_nota_entries where company_id = v_e.company_id and movimento_id = v_mov;
      end if;
    exception when others then
      if sqlerrm ~* '(importo non valido|residuo|gi. pagat|gi. sald|gi. incass)' then
        raise exception 'FONTE_GIA_PAGATA: la scadenza non e'' piu'' da pagare (%). Annulla l''assegno.', sqlerrm;
      end if;
      raise;
    end;
    if v_pn is null then raise exception 'Pagamento registrato senza riga di prima nota'; end if;
    perform public.effetto_segna_esito(p_effetto, 'pagato', p_data, p_richiesta, v_pn);
    return jsonb_build_object('stato', 'pagato', 'prima_nota_entry_id', v_pn, 'gia_chiuso', false);
  end if;

  -- insoluto / annullato: nessuna prima nota, il residuo si riapre da solo (conta solo in_attesa)
  perform public.effetto_segna_esito(p_effetto, p_esito, coalesce(p_data, current_date), p_richiesta, null);
  return jsonb_build_object('stato', p_esito, 'prima_nota_entry_id', null, 'gia_chiuso', false);
end $$;

-- ── Elenco ──
create or replace function public.effetti_elenco(p_company_id uuid, p_stati text[] default '{in_attesa}')
returns table (id uuid, tipo text, direzione text, numero text, banca text, importo numeric,
  data_emissione date, data_scadenza date, stato text, data_esito date,
  scadenza_id uuid, company_cost_id uuid, rata_fornitore_id uuid, documento_id uuid,
  riga_scadenzario_id uuid, descrizione_fonte text, controparte text, da_confermare boolean)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  perform public.assert_company_access(p_company_id);
  if not public.ai_is_service_role() and not public.puo_vedere_scadenze(p_company_id) then
    raise exception 'Non hai il permesso di vedere le scadenze.' using errcode = '42501';
  end if;
  return query
  with docs as materialized (
    select distinct x.documento_id as doc from public.effetti_pagamento x
     where x.company_id = p_company_id and x.stato = any (p_stati) and x.documento_id is not null
  ), dsc as materialized (
    -- una sola passata: per ogni documento della lista, la scadenza col SUO tag [DOC:id] (aperte prima)
    select distinct on (d.doc) d.doc, s.id
      from docs d
      join public.scadenze s on s.company_id = p_company_id and s.status <> 'annullata'
       and s.notes like '%[DOC:' || d.doc::text || ']%'
     order by d.doc, (s.status in ('da_pagare','parziale')) desc, s.due_date nulls last
  )
  select e.id, e.tipo, e.direzione, e.numero, e.banca, e.importo, e.data_emissione, e.data_scadenza,
    e.stato, e.data_esito, e.scadenza_id, e.company_cost_id, e.rata_fornitore_id, e.documento_id,
    case
      when e.scadenza_id is not null then e.scadenza_id
      when e.company_cost_id is not null then coalesce(
        (select s.id from public.scadenze s where s.cost_id = e.company_cost_id and s.status <> 'annullata'
          order by s.due_date nulls last limit 1),
        md5('scadenzario:costo:' || e.company_cost_id::text || ':' || coalesce(e.rata_fornitore_id::text, 'totale'))::uuid)
      else dsc.id
    end,
    coalesce(sc.description, co.name, 'Fattura ' || coalesce(d.numero, '')),
    coalesce(su.name, su2.name, d.cliente_snapshot->>'denominazione', d.cliente_snapshot->>'ragione_sociale',
      d.cliente_snapshot->>'name'),
    (e.stato = 'in_attesa' and e.data_scadenza < current_date)
  from public.effetti_pagamento e
  left join public.scadenze sc on sc.id = e.scadenza_id
  left join public.suppliers su on su.id = sc.supplier_id
  left join public.company_costs co on co.id = e.company_cost_id
  left join public.suppliers su2 on su2.id = co.supplier_id
  left join public.documenti_fiscali d on d.id = e.documento_id
  left join dsc on dsc.doc = e.documento_id
  where e.company_id = p_company_id and e.stato = any (p_stati)
  order by e.data_scadenza, e.created_at;
end $$;

-- ── Trigger: non si annulla una fonte con un effetto in attesa ──
create or replace function public.effetti_blocca_annullo_fonte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'scadenze' then
    if new.status = 'annullata' and old.status is distinct from 'annullata'
       and exists (select 1 from public.effetti_pagamento e where e.scadenza_id = new.id and e.stato = 'in_attesa') then
      raise exception 'Annulla prima l''assegno collegato.'; end if;
  else
    if new.annullato_il is not null and old.annullato_il is null
       and exists (select 1 from public.effetti_pagamento e where e.company_cost_id = new.id and e.stato = 'in_attesa') then
      raise exception 'Annulla prima l''assegno collegato.'; end if;
  end if;
  return new;
end $$;
revoke all on function public.effetti_blocca_annullo_fonte() from public, anon, authenticated;

drop trigger if exists effetti_blocca_annullo_scadenza on public.scadenze;
create trigger effetti_blocca_annullo_scadenza before update of status on public.scadenze
  for each row execute function public.effetti_blocca_annullo_fonte();
drop trigger if exists effetti_blocca_annullo_costo on public.company_costs;
create trigger effetti_blocca_annullo_costo before update of annullato_il on public.company_costs
  for each row execute function public.effetti_blocca_annullo_fonte();

-- ── Permessi: nessuna funzione per anon ──
revoke all on function public.registra_effetto(text,uuid,uuid,text,text,text,text,numeric,date,date,text) from public, anon;
revoke all on function public.effetto_blocca(uuid) from public, anon;
revoke all on function public.effetto_segna_esito(uuid,text,date,uuid,uuid) from public, anon;
revoke all on function public.chiudi_effetto(uuid,text,date,uuid,uuid,uuid) from public, anon;
revoke all on function public.effetti_elenco(uuid,text[]) from public, anon;
grant execute on function public.registra_effetto(text,uuid,uuid,text,text,text,text,numeric,date,date,text) to authenticated, service_role;
grant execute on function public.effetto_blocca(uuid) to authenticated, service_role;
grant execute on function public.effetto_segna_esito(uuid,text,date,uuid,uuid) to authenticated, service_role;
grant execute on function public.chiudi_effetto(uuid,text,date,uuid,uuid,uuid) to authenticated, service_role;
grant execute on function public.effetti_elenco(uuid,text[]) to authenticated, service_role;
