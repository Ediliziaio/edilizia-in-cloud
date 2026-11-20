set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.cassa_in_cloud_scritture (
  company_id uuid not null references public.companies(id) on delete cascade,
  punto_vendita_id text not null,
  cassa_id text not null,
  giorno date not null,
  versione text not null,
  scrittura_id uuid references public.contabilita_scritture(id) on delete set null,
  primary key(company_id, punto_vendita_id, cassa_id, giorno)
);

create table if not exists public.cassa_in_cloud_accrediti_pos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  lordo numeric(14,2) not null check(lordo > 0),
  commissioni numeric(14,2) not null check(commissioni >= 0 and commissioni < lordo),
  netto numeric(14,2) not null check(netto = lordo - commissioni),
  creato_da uuid not null,
  creato_il timestamptz not null default now(),
  scollegato_il timestamptz,
  scollegato_da uuid
);
create unique index if not exists cassa_in_cloud_accredito_pos_attivo
  on public.cassa_in_cloud_accrediti_pos(bank_transaction_id) where scollegato_il is null;
create index if not exists cassa_in_cloud_accrediti_pos_azienda on public.cassa_in_cloud_accrediti_pos(company_id);

create table if not exists public.cassa_in_cloud_chiusure_pos (
  company_id uuid not null references public.companies(id) on delete cascade,
  accredito_id uuid not null references public.cassa_in_cloud_accrediti_pos(id) on delete cascade,
  punto_vendita_id text not null,
  cassa_id text not null,
  giorno date not null,
  pos numeric(14,2) not null check(pos > 0),
  versione text not null,
  primary key(accredito_id, punto_vendita_id, cassa_id, giorno)
);
create index if not exists cassa_in_cloud_chiusure_pos_gruppo
  on public.cassa_in_cloud_chiusure_pos(company_id, punto_vendita_id, cassa_id, giorno);

alter table public.cassa_in_cloud_scritture enable row level security;
alter table public.cassa_in_cloud_accrediti_pos enable row level security;
alter table public.cassa_in_cloud_chiusure_pos enable row level security;
revoke all on public.cassa_in_cloud_scritture, public.cassa_in_cloud_accrediti_pos, public.cassa_in_cloud_chiusure_pos from public, anon, authenticated;
grant select, insert, update, delete on public.cassa_in_cloud_scritture, public.cassa_in_cloud_accrediti_pos, public.cassa_in_cloud_chiusure_pos to service_role;

-- Il documento commerciale e le suddivisioni per aliquota/pagamento devono combaciare.
-- Le rettifiche fiscali, i differiti e le fatture collegate richiedono verifica prima di una proposta.
create or replace function private.cassa_in_cloud_scrittura_dati(p_company_id uuid, p_punto text, p_cassa text, p_giorno date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  g record; c jsonb; i jsonb; p jsonb;
  v_totale numeric := 0; v_numero bigint := 0;
  v_contanti numeric := 0; v_pos numeric := 0; v_base numeric := 0; v_iva numeric := 0;
  v_totale_chiusura numeric; v_imposte_chiusura numeric; v_lordo numeric; v_netto numeric; v_rata numeric; v_quota numeric; v_metodo numeric;
  v_arch record; v_arch_contanti numeric := 0; v_arch_pos numeric := 0;
begin
  if nullif(p_cassa,'') is null then return null; end if;
  select * into g from public.cassa_in_cloud_confronto(p_company_id, p_giorno, p_giorno) t
   where t.punto_vendita_id = p_punto and t.cassa_id = p_cassa;
  if not found or g.numero_scontrini = 0 or g.scontrini_assenti > 0 or g.con_resi or g.con_fatture or g.con_differiti
     or jsonb_array_length(g.chiusure) = 0 then return null; end if;
  if exists(select 1 from public.cassa_in_cloud_scontrini s
            where s.company_id = p_company_id and s.punto_vendita_id = p_punto and s.data = p_giorno
              and (s.cassa_id is null or s.valuta is distinct from 'EUR' or s.confermato = false)
              and s.presente_in_cassa) then return null; end if;

  for c in select value from jsonb_array_elements(g.chiusure) loop
    if c->>'valuta' is distinct from 'EUR' or (c->>'presente')::boolean is not true then return null; end if;
    c := c->'dati';
    v_totale_chiusura := (c->>'totale_scontrini')::numeric;
    if v_totale_chiusura is null or v_totale_chiusura < 0 or c->>'numero_scontrini' is null or exists(
      select 1 from unnest(array['numero_annulli','annulli','non_incassato','differiti','fatture_dirette','sconti','note_credito','conti']) k
       where coalesce((c->>k)::numeric,0) <> 0
    ) then return null; end if;
    v_imposte_chiusura := 0;
    for i in select value from jsonb_array_elements(c->'iva') loop
      v_lordo := (i->>'scontrini')::numeric;
      v_rata := (i->>'aliquota')::numeric;
      if v_lordo is null or v_lordo < 0 or v_rata is null or v_rata < 0 or v_rata > 100
         or v_lordo <> round(v_lordo,2) or coalesce((i->>'annulli')::numeric,0) <> 0
         or (i->>'ventilazione')::boolean or (i->>'non_fiscale')::boolean then return null; end if;
      v_quota := 0;
      for p in select value from jsonb_array_elements(i->'pagamenti') loop
        v_metodo := (p->>'importo')::numeric;
        if v_metodo is null or v_metodo < 0 or v_metodo <> round(v_metodo,2)
          or coalesce((p->>'annulli')::numeric,0) <> 0 then return null; end if;
        if v_metodo = 0 then continue; end if;
        if p->>'tipo' = 'CASH' then v_contanti := v_contanti + v_metodo;
        elsif p->>'tipo' in ('CASHCARD','CREDITCARD') then v_pos := v_pos + v_metodo;
        else return null;
        end if;
        v_quota := v_quota + v_metodo;
      end loop;
      if v_quota <> v_lordo then return null; end if;
      v_netto := round(v_lordo * 100 / (100 + v_rata), 2);
      v_base := v_base + v_netto;
      v_iva := v_iva + (v_lordo - v_netto);
      v_imposte_chiusura := v_imposte_chiusura + v_lordo;
    end loop;
    if v_imposte_chiusura <> v_totale_chiusura then return null; end if;
    v_numero := v_numero + (c->>'numero_scontrini')::bigint;
    v_totale := v_totale + v_totale_chiusura;
  end loop;
  if v_totale <= 0 or v_numero <> g.numero_scontrini or v_totale <> g.totale_scontrini
     or v_totale <> v_contanti + v_pos then return null; end if;
  -- Il dettaglio dei pagamenti dell'archivio conferma il totale per metodo.
  -- Con il resto, il fornitore può esporre il contante consegnato oppure già al netto.
  for v_arch in
    select s.totale, s.resto,
           coalesce(sum((pago->>'importo')::numeric) filter (where pago->>'tipo' = 'CASH'),0) as contanti,
           coalesce(sum((pago->>'importo')::numeric) filter (where pago->>'tipo' in ('CASHCARD','CREDITCARD')),0) as pos,
           bool_or((pago->>'importo')::numeric <> 0 and (pago->>'tipo' not in ('CASH','CASHCARD','CREDITCARD'))) as altri
      from public.cassa_in_cloud_scontrini s left join lateral jsonb_array_elements(s.pagamenti) pago on true
     where s.company_id = p_company_id and s.punto_vendita_id = p_punto and s.data = p_giorno and s.cassa_id = p_cassa
       and s.presente_in_cassa and s.confermato is distinct from false
     group by s.esterno_id,s.totale,s.resto
  loop
    if v_arch.altri or v_arch.contanti < 0 or v_arch.pos < 0 then return null; end if;
    if v_arch.contanti + v_arch.pos = v_arch.totale then
      v_arch_contanti := v_arch_contanti + v_arch.contanti;
    elsif v_arch.resto > 0 and v_arch.contanti >= v_arch.resto
          and v_arch.contanti + v_arch.pos - v_arch.resto = v_arch.totale then
      v_arch_contanti := v_arch_contanti + v_arch.contanti - v_arch.resto;
    else return null;
    end if;
    v_arch_pos := v_arch_pos + v_arch.pos;
  end loop;
  if (v_arch_contanti, v_arch_pos) is distinct from (v_contanti, v_pos) then return null; end if;
  return jsonb_build_object(
    'lordo',v_totale,'contanti',v_contanti,'pos',v_pos,'ricavi',v_base,'iva',v_iva,
    'versione',md5(to_jsonb(g)::text),'punto_vendita_nome',g.punto_vendita_nome
  );
end $$;
revoke all on function private.cassa_in_cloud_scrittura_dati(uuid,text,text,date) from public, anon, authenticated;

create or replace function public.cassa_in_cloud_proposta(p_company_id uuid, p_punto text, p_cassa text, p_giorno date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_proposta jsonb; v_scrittura uuid; v_accredito uuid; v_versione_scrittura text; v_versione_pos text;
begin
  if auth.uid() is null or public.utente_bloccato()
     or public.has_permission_for_company(auth.uid(), 'can_view_billing', p_company_id) is not true then
    raise exception 'Accesso alla chiusura negato' using errcode = '42501';
  end if;
  v_proposta := private.cassa_in_cloud_scrittura_dati(p_company_id,p_punto,p_cassa,p_giorno);
  if public.contabilita_puo_leggere(p_company_id) then
    select s.scrittura_id,s.versione into v_scrittura,v_versione_scrittura from public.cassa_in_cloud_scritture s
     where s.company_id = p_company_id and s.punto_vendita_id = p_punto and s.cassa_id = p_cassa and s.giorno = p_giorno
       and not exists(select 1 from public.contabilita_scritture x where x.storno_di = s.scrittura_id);
  end if;
  if public.has_permission_for_company(auth.uid(), 'can_view_tesoreria', p_company_id) then
    select a.id,r.versione into v_accredito,v_versione_pos from public.cassa_in_cloud_chiusure_pos r
     join public.cassa_in_cloud_accrediti_pos a on a.id = r.accredito_id and a.scollegato_il is null
     where r.company_id = p_company_id and r.punto_vendita_id = p_punto and r.cassa_id = p_cassa and r.giorno = p_giorno;
  end if;
  return jsonb_build_object('valori',v_proposta,'scrittura_id',v_scrittura,'accredito_id',v_accredito,
    'scrittura_da_verificare',v_scrittura is not null and v_versione_scrittura is distinct from v_proposta->>'versione',
    'pos_da_verificare',v_accredito is not null and v_versione_pos is distinct from v_proposta->>'versione',
    'puo_registrare',public.contabilita_puo_scrivere(p_company_id) and exists(
      select 1 from public.companies a where a.id = p_company_id and a.deleted_at is null and a.contabilita_generale_attiva
    ));
end $$;

create or replace function public.cassa_in_cloud_registra_chiusura(
  p_company_id uuid, p_punto text, p_cassa text, p_giorno date, p_versione text, p_conti jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_proposta jsonb; v_id uuid; v_gruppo text; v_conto uuid; v_valore numeric; v_natura text; v_righe jsonb := '[]';
begin
  if auth.uid() is null or public.utente_bloccato() or public.contabilita_puo_scrivere(p_company_id) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_billing', p_company_id) is not true
     or not exists(select 1 from public.companies a where a.id = p_company_id and a.deleted_at is null and a.contabilita_generale_attiva) then
    raise exception 'Accesso alla registrazione negato' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || '/' || p_punto || '/' || p_cassa || '/' || p_giorno, 183));
  -- Stesso lock del salvataggio del periodo per rileggere la chiusura senza import concorrenti.
  perform 1 from public.cassa_in_cloud_punti_vendita
   where company_id = p_company_id and punto_vendita_id = p_punto for update;
  v_proposta := private.cassa_in_cloud_scrittura_dati(p_company_id,p_punto,p_cassa,p_giorno);
  if v_proposta is null or v_proposta->>'versione' is distinct from p_versione then
    raise exception 'La chiusura è cambiata. Aggiorna il riepilogo prima di registrare.' using errcode = '22023';
  end if;
  select s.scrittura_id into v_id from public.cassa_in_cloud_scritture s
   where s.company_id = p_company_id and s.punto_vendita_id = p_punto and s.cassa_id = p_cassa and s.giorno = p_giorno
     and not exists(select 1 from public.contabilita_scritture x where x.storno_di = s.scrittura_id);
  if v_id is not null then raise exception 'Questa chiusura ha già una scrittura registrata.' using errcode = '23505'; end if;
  foreach v_gruppo in array array['contanti','pos','ricavi','iva'] loop
    v_valore := (v_proposta->>v_gruppo)::numeric;
    if v_valore = 0 then continue; end if;
    v_conto := nullif(p_conti->>v_gruppo,'')::uuid;
    v_natura := case when v_gruppo = 'ricavi' then 'ricavo' when v_gruppo = 'iva' then 'passivo' else 'attivo' end;
    if not exists(select 1 from public.contabilita_conti c where c.company_id = p_company_id and c.id = v_conto and c.movimentabile and c.attivo
                  and c.natura = v_natura) then
      raise exception 'Seleziona un conto movimentabile per ogni riga.' using errcode = '22023';
    end if;
    v_righe := v_righe || jsonb_build_object(
      'conto_id',v_conto,'dare',case when v_gruppo in ('contanti','pos') then v_valore else 0 end,
      'avere',case when v_gruppo in ('ricavi','iva') then v_valore else 0 end,
      'descrizione',case v_gruppo when 'contanti' then 'Cassa contanti' when 'pos' then 'POS da accreditare' when 'ricavi' then 'Ricavi da corrispettivi' else 'IVA su vendite' end
    );
  end loop;
  if (v_proposta->>'contanti')::numeric > 0 and (v_proposta->>'pos')::numeric > 0 and p_conti->>'contanti' = p_conti->>'pos' then
    raise exception 'Usa conti distinti per i contanti e il POS.' using errcode = '22023';
  end if;
  v_id := public.contabilita_registra_scrittura(
    p_company_id,p_giorno,'Corrispettivi Cassa in Cloud',
    (v_proposta->>'punto_vendita_nome') || ' · Cassa ' || p_cassa,'Chiusura ' || p_giorno,p_giorno,v_righe
  );
  insert into public.cassa_in_cloud_scritture(company_id,punto_vendita_id,cassa_id,giorno,scrittura_id,versione)
  values (p_company_id,p_punto,p_cassa,p_giorno,v_id,p_versione)
  on conflict (company_id,punto_vendita_id,cassa_id,giorno) do update
    set scrittura_id = excluded.scrittura_id, versione = excluded.versione;
  return v_id;
end $$;

-- Abbinamento a un accredito reale, anche cumulativo. Il denaro resta sul movimento
-- bancario esistente e il lordo e le commissioni sono conservati come prova.
create or replace function public.cassa_in_cloud_abbina_pos(
  p_company_id uuid, p_tx uuid, p_chiusure jsonb, p_commissioni numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions%rowtype; v_id uuid; v_lista jsonb := '[]'; v_riga record; v_proposta jsonb;
  v_lordo numeric := 0; v_netto numeric; v_pos numeric; v_n integer := 0; v_data date;
begin
  perform private.bank_operativa_access(p_company_id,true);
  if public.has_permission_for_company(auth.uid(),'can_view_billing',p_company_id) is not true
     or p_commissioni is null or p_commissioni < 0 or p_commissioni <> round(p_commissioni,2)
     or jsonb_typeof(p_chiusure) is distinct from 'array' or jsonb_array_length(p_chiusure) not between 1 and 31 then
    raise exception 'Controlla chiusure, importi e permessi.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,2810));
  select * into t from public.bank_transactions where company_id = p_company_id and id = p_tx for update;
  if not found or t.transaction_type <> 'credit' or t.currency <> 'EUR' or t.status is distinct from 'booked'
     or t.chiuso_senza_documento is not null or t.reconciliation_status in ('reconciled','parziale','ignored')
     or t.linked_invoice_id is not null or t.reconciled_invoice_id is not null or t.linked_installment_id is not null
     or t.linked_scadenza_id is not null or t.linked_cost_id is not null
     or exists(select 1 from public.bank_reconciliations r where r.transaction_id = p_tx and r.unmatched_at is null)
     or exists(select 1 from public.prima_nota_entries n where n.bank_transaction_id = p_tx) then
    raise exception 'L’accredito non è disponibile per la riconciliazione.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.bank_accounts_operativi a where a.id = t.account_id and a.company_id = p_company_id) then
    raise exception 'Conto bancario non disponibile.' using errcode = '22023';
  end if;
  v_netto := case when t.metadata->>'provider' = 'saltedge' and t.metadata->>'currency_code' = t.currency
                       and jsonb_typeof(t.metadata->'amount') = 'number' then (t.metadata->>'amount')::numeric else t.amount end;
  v_data := coalesce(t.booking_date,t.value_date);

  for v_riga in select distinct * from jsonb_to_recordset(p_chiusure) r(punto text, cassa text, giorno date, versione text) order by punto,cassa,giorno loop
    v_n := v_n + 1;
    perform 1 from public.cassa_in_cloud_punti_vendita where company_id = p_company_id and punto_vendita_id = v_riga.punto for update;
    v_proposta := private.cassa_in_cloud_scrittura_dati(p_company_id,v_riga.punto,v_riga.cassa,v_riga.giorno);
    v_pos := (v_proposta->>'pos')::numeric;
    if v_pos is null or v_pos <= 0 or v_data is null or v_data < v_riga.giorno or v_proposta->>'versione' is distinct from v_riga.versione
       or exists(select 1 from public.cassa_in_cloud_chiusure_pos r join public.cassa_in_cloud_accrediti_pos a
                 on a.id = r.accredito_id and a.scollegato_il is null
                 where r.company_id = p_company_id and r.punto_vendita_id = v_riga.punto and r.cassa_id = v_riga.cassa and r.giorno = v_riga.giorno) then
      raise exception 'Una chiusura è cambiata, è già abbinata o ha una data successiva all’accredito.' using errcode = '22023';
    end if;
    v_lordo := v_lordo + v_pos;
    v_lista := v_lista || jsonb_build_object('punto',v_riga.punto,'cassa',v_riga.cassa,'giorno',v_riga.giorno,'pos',v_pos,'versione',v_riga.versione);
  end loop;
  if v_n <> jsonb_array_length(p_chiusure) or v_netto <= 0 or v_lordo - p_commissioni <> v_netto then
    raise exception 'Il lordo POS meno le commissioni deve corrispondere all’accredito.' using errcode = '22023';
  end if;

  insert into public.cassa_in_cloud_accrediti_pos(company_id,bank_transaction_id,lordo,commissioni,netto,creato_da)
  values (p_company_id,p_tx,v_lordo,p_commissioni,v_netto,auth.uid()) returning id into v_id;
  insert into public.cassa_in_cloud_chiusure_pos(company_id,accredito_id,punto_vendita_id,cassa_id,giorno,pos,versione)
  select p_company_id,v_id,r.punto,r.cassa,r.giorno,r.pos,r.versione
    from jsonb_to_recordset(v_lista) r(punto text,cassa text,giorno date,pos numeric,versione text);
  update public.bank_transactions set reconciliation_status = 'reconciled', reconciled_at = now(),
    chiuso_senza_documento = 'nessun_costo'
   where id = p_tx and company_id = p_company_id;
  return v_id;
end $$;

create or replace function public.cassa_in_cloud_accredito_pos(p_company_id uuid, p_id uuid, p_tx uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_esito jsonb;
begin
  perform private.bank_operativa_access(p_company_id,false);
  select jsonb_build_object('id',a.id,'bank_transaction_id',t.id,'giorno',coalesce(t.booking_date,t.value_date),
    'conto',coalesce(b.display_name,b.account_name,'Conto corrente'),'lordo',a.lordo,'netto',a.netto,'commissioni',a.commissioni,
    'chiusure',x.numero,'dal_chiusure',x.dal,'al_chiusure',x.al) into v_esito
  from public.cassa_in_cloud_accrediti_pos a join public.bank_transactions t on t.id = a.bank_transaction_id and t.company_id = p_company_id
  join public.bank_accounts_operativi b on b.id = t.account_id and b.company_id = p_company_id
  cross join lateral (select count(*) numero,min(r.giorno) dal,max(r.giorno) al
     from public.cassa_in_cloud_chiusure_pos r where r.accredito_id = a.id) x
  where a.company_id = p_company_id and a.scollegato_il is null and (a.id = p_id or a.bank_transaction_id = p_tx);
  return v_esito;
end $$;

create or replace function public.cassa_in_cloud_candidati_pos(p_company_id uuid, p_dal date, p_netto numeric)
returns table(id uuid, conto text, giorno date, descrizione text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.bank_operativa_access(p_company_id,false);
  if p_netto is null or p_netto <= 0 then return; end if;
  return query select t.id, coalesce(b.display_name,b.account_name,'Conto corrente'),
      coalesce(t.booking_date,t.value_date), t.description
    from public.bank_transactions_operativi t
    join public.bank_accounts_operativi b on b.id = t.account_id and b.company_id = p_company_id
   where t.company_id = p_company_id and t.currency = 'EUR' and t.transaction_type = 'credit'
     and coalesce(t.booking_date,t.value_date) >= p_dal and t.status = 'booked'
     and t.chiuso_senza_documento is null and t.reconciliation_status in ('pending','suggestion')
     and t.linked_invoice_id is null and t.reconciled_invoice_id is null and t.linked_cost_id is null
     and t.linked_installment_id is null and t.linked_scadenza_id is null
     and not exists(select 1 from public.prima_nota_entries n where n.bank_transaction_id = t.id)
     and not exists(select 1 from public.bank_reconciliations r where r.transaction_id = t.id and r.unmatched_at is null)
     and p_netto = case when t.metadata->>'provider' = 'saltedge' and t.metadata->>'currency_code' = t.currency
                        and jsonb_typeof(t.metadata->'amount') = 'number' then (t.metadata->>'amount')::numeric else t.amount end
   order by coalesce(t.booking_date,t.value_date), t.id
   limit 100;
end $$;

create or replace function public.cassa_in_cloud_scollega_pos(p_company_id uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tx uuid;
begin
  perform private.bank_operativa_access(p_company_id,true);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,2810));
  update public.cassa_in_cloud_accrediti_pos set scollegato_il = now(), scollegato_da = auth.uid()
   where company_id = p_company_id and id = p_id and scollegato_il is null returning bank_transaction_id into v_tx;
  if found then
    update public.bank_transactions set reconciliation_status = 'pending', reconciled_at = null, chiuso_senza_documento = null
     where id = v_tx and company_id = p_company_id;
  end if;
end $$;

-- Anche una riapertura dal dettaglio banca deve passare per lo scollegamento POS.
create or replace function private.cassa_in_cloud_guarda_accredito_pos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.chiuso_senza_documento = 'nessun_costo' and new.chiuso_senza_documento is distinct from old.chiuso_senza_documento
     and exists(select 1 from public.cassa_in_cloud_accrediti_pos a
                where a.company_id = old.company_id and a.bank_transaction_id = old.id and a.scollegato_il is null) then
    raise exception 'Scollega l’accredito POS di Cassa in Cloud prima di riaprire il movimento.' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function private.cassa_in_cloud_guarda_accredito_pos() from public, anon, authenticated;
drop trigger if exists guarda_accredito_pos_cassa_in_cloud on public.bank_transactions;
create trigger guarda_accredito_pos_cassa_in_cloud before update of chiuso_senza_documento on public.bank_transactions
  for each row execute function private.cassa_in_cloud_guarda_accredito_pos();

revoke all on function public.cassa_in_cloud_proposta(uuid,text,text,date) from public, anon;
revoke all on function public.cassa_in_cloud_registra_chiusura(uuid,text,text,date,text,jsonb) from public, anon;
revoke all on function public.cassa_in_cloud_abbina_pos(uuid,uuid,jsonb,numeric) from public, anon;
revoke all on function public.cassa_in_cloud_accredito_pos(uuid,uuid,uuid) from public, anon;
revoke all on function public.cassa_in_cloud_candidati_pos(uuid,date,numeric) from public, anon;
revoke all on function public.cassa_in_cloud_scollega_pos(uuid,uuid) from public, anon;
grant execute on function public.cassa_in_cloud_proposta(uuid,text,text,date) to authenticated;
grant execute on function public.cassa_in_cloud_registra_chiusura(uuid,text,text,date,text,jsonb) to authenticated;
grant execute on function public.cassa_in_cloud_abbina_pos(uuid,uuid,jsonb,numeric) to authenticated;
grant execute on function public.cassa_in_cloud_accredito_pos(uuid,uuid,uuid) to authenticated;
grant execute on function public.cassa_in_cloud_candidati_pos(uuid,date,numeric) to authenticated;
grant execute on function public.cassa_in_cloud_scollega_pos(uuid,uuid) to authenticated;
