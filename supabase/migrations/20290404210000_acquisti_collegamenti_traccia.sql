-- Ciclo acquisti, lotto 2 (15/11/2026): traccia dei collegamenti e DDT ricollegati senza AI.
-- Documento: docs/automazioni-acquisti.md. Gemelli in TypeScript: shared/acquisti/.
--
-- Tre cose:
--   1. acquisti_collegamenti (+ _storia): ogni collegamento fatto da una regola o da una persona,
--      con regola, prove, autore, stato e storia. Si scrive solo dalle funzioni qui sotto.
--   2. acquisti_numero_documento(): il numero di un DDT/ordine reso confrontabile come
--      shared/acquisti/normalizza.ts → numeroDocumento() («9.363» = «9363», «1068/26» = «1068» del 2026).
--      La parità fra le due la controlla src/test/logic/acquistiCollegamentiSql.test.ts.
--   3. Il DDT citato nell'XML (DatiDDT) si aggancia alla bolla registrata quando c'è UNA sola
--      bolla dello stesso fornitore con lo stesso numero, dello stesso anno, con data entro 10
--      giorni. Prima si confrontava il numero esatto (180 collegati su 1.560 il 15/11), e solo
--      all'arrivo della fattura: una bolla registrata dopo non veniva più cercata. Ora la cerca
--      anche il trigger della bolla (documenti fuori sequenza).
--   Una bolla già agganciata a un'altra fattura (non nota di credito) non si aggancia da sola:
--   è un documento doppio o una fatturazione in due volte, e lo guarda una persona.
--   Un collegamento annullato o rifiutato non si rifà da solo.
--
-- Dati storici: acquisti_ricollega_ddt_anteprima(azienda) dice cosa cambierebbe senza scrivere;
-- acquisti_ricollega_ddt_lotto(azienda, limite) scrive a lotti, con lock_timeout e statement_timeout.

-- ─── 1. Traccia ──────────────────────────────────────────────────────────────

create table if not exists public.acquisti_collegamenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  da_tipo text not null,
  da_id uuid not null,
  da_riga text,
  a_tipo text not null,
  a_id uuid not null,
  a_riga text,
  quantita numeric,
  unita text,
  importo numeric,
  regola text not null,
  versione_regola integer not null default 1,
  esito text not null check (esito in ('automatico', 'proposta', 'manuale')),
  prove jsonb not null default '[]'::jsonb,
  percorso jsonb,
  stato text not null check (stato in ('proposto', 'collegato', 'verificato', 'approvato_pagamento', 'pagato', 'rifiutato', 'annullato')),
  autore_tipo text not null check (autore_tipo in ('utente', 'processo')),
  autore_id uuid,
  autore_processo text,
  con_ai boolean not null default false,
  chiave text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acquisti_collegamenti_chiave_unica unique (company_id, chiave)
);
create index if not exists acquisti_collegamenti_da on public.acquisti_collegamenti (company_id, da_tipo, da_id);
create index if not exists acquisti_collegamenti_a on public.acquisti_collegamenti (company_id, a_tipo, a_id);
create index if not exists acquisti_collegamenti_autore on public.acquisti_collegamenti (autore_id) where autore_id is not null;

create table if not exists public.acquisti_collegamenti_storia (
  id uuid primary key default gen_random_uuid(),
  collegamento_id uuid not null references public.acquisti_collegamenti(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  stato_prima text,
  stato_dopo text not null,
  motivo text,
  autore_id uuid,
  processo text,
  creato_il timestamptz not null default now()
);
create index if not exists acquisti_collegamenti_storia_coll on public.acquisti_collegamenti_storia (collegamento_id);
create index if not exists acquisti_collegamenti_storia_azienda on public.acquisti_collegamenti_storia (company_id);
create index if not exists acquisti_collegamenti_storia_autore on public.acquisti_collegamenti_storia (autore_id) where autore_id is not null;

alter table public.acquisti_collegamenti enable row level security;
alter table public.acquisti_collegamenti_storia enable row level security;
revoke all on public.acquisti_collegamenti, public.acquisti_collegamenti_storia from anon;
revoke insert, update, delete on public.acquisti_collegamenti, public.acquisti_collegamenti_storia from authenticated;
grant select on public.acquisti_collegamenti, public.acquisti_collegamenti_storia to authenticated;

drop policy if exists acquisti_collegamenti_legge on public.acquisti_collegamenti;
create policy acquisti_collegamenti_legge on public.acquisti_collegamenti for select to authenticated
  using (not utente_bloccato() and not utente_e_cliente_esterno()
         and (e_super_admin_dentro(company_id)
              or company_id = any ((select aziende_con_permesso('can_view_costs') || aziende_con_permesso('can_manage_purchasing'))::uuid[])));
drop policy if exists acquisti_collegamenti_storia_legge on public.acquisti_collegamenti_storia;
create policy acquisti_collegamenti_storia_legge on public.acquisti_collegamenti_storia for select to authenticated
  using (not utente_bloccato() and not utente_e_cliente_esterno()
         and (e_super_admin_dentro(company_id)
              or company_id = any ((select aziende_con_permesso('can_view_costs') || aziende_con_permesso('can_manage_purchasing'))::uuid[])));

-- La storia la scrive il trigger: nessun percorso di scrittura la può saltare.
create or replace function public.acquisti_collegamenti_storia_scrivi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.stato is distinct from old.stato then
    insert into public.acquisti_collegamenti_storia (collegamento_id, company_id, stato_prima, stato_dopo, motivo, autore_id, processo)
    values (new.id, new.company_id, case when tg_op = 'UPDATE' then old.stato end, new.stato,
            nullif(current_setting('acquisti.motivo', true), ''), auth.uid(),
            case when auth.uid() is null then coalesce(nullif(current_setting('acquisti.processo', true), ''), new.autore_processo) end);
  end if;
  return null;
end $$;
revoke all on function public.acquisti_collegamenti_storia_scrivi() from public, anon, authenticated;
drop trigger if exists acquisti_collegamenti_storia on public.acquisti_collegamenti;
create trigger acquisti_collegamenti_storia after insert or update on public.acquisti_collegamenti
  for each row execute function public.acquisti_collegamenti_storia_scrivi();

-- Le transizioni ammesse: stesse di shared/acquisti/traccia.ts → transizioneAmmessa().
create or replace function public.acquisti_transizione_ammessa(p_da text, p_a text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_da
    when 'proposto' then p_a in ('collegato', 'rifiutato')
    when 'collegato' then p_a in ('verificato', 'annullato')
    when 'verificato' then p_a in ('approvato_pagamento', 'annullato')
    when 'approvato_pagamento' then p_a in ('pagato', 'verificato', 'annullato')
    when 'rifiutato' then p_a = 'proposto'
    when 'annullato' then p_a = 'proposto'
    else false end
$$;
revoke all on function public.acquisti_transizione_ammessa(text, text) from public, anon;
grant execute on function public.acquisti_transizione_ammessa(text, text) to authenticated;

-- ─── 2. Numero di documento confrontabile ────────────────────────────────────

create or replace function public.acquisti_numero_documento(p text, out chiave text, out anno integer, out serie text)
language plpgsql immutable set search_path = '' as $$
declare s text := btrim(coalesce(p, '')); m text[]; a integer; i integer;
begin
  if s = '' or length(s) > 60 then return; end if;
  if s ~* '^(\.|-|_|/|0+|x+|n\.?\s*d\.?|n\.?\s*a\.?|s\.?\s*n\.?|no\.?\s*ord\.?|nessuno|vs\.?\s*ord(ine)?|verbale|telefonico|a\s+voce|come\s+da\s+accordi)$' then return; end if;
  if s !~ '\d' then return; end if;
  s := upper(s);
  for i in 1..3 loop
    s := regexp_replace(s, '^(D\.?\s*D\.?\s*T\.?|DDT|BOLLA|DOC(UMENTO)?|ORDINE|ORD|ODA|ODV|CONF(ERMA)?|N(R|UM(ERO)?)?\.?|NR|N°|NO\.?)(\s*[:.°º#]\s*|\s+)', '');
  end loop;
  s := btrim(regexp_replace(s, '\s+DEL\s+.*$', ''));
  m := regexp_match(s, '^([A-Z]{1,6})\s*[/\-\s]\s*(\d[0-9A-Z./\-\s]*)$');
  if m is not null then serie := m[1]; s := m[2]; end if;
  m := regexp_match(s, '^(.*\d.*?)\s*[/\-]\s*(20\d{2}|\d{2})$');
  if m is not null and m[1] ~ '[A-Z0-9]' then
    a := m[2]::integer; if a < 100 then a := 2000 + a; end if;
  end if;
  if m is not null and a between 2000 and 2040 then
    anno := a; s := m[1];
  else
    m := regexp_match(s, '^(20\d{2})\s*[/\-]\s*(.*\d.*)$');
    if m is not null and m[1]::integer <= 2040 then anno := m[1]::integer; s := m[2]; end if;
  end if;
  if serie is null then
    m := regexp_match(s, '^(\d[0-9./\-\s]*)\s*[/\-]\s*([A-Z]{1,4})$');
    if m is not null then serie := m[2]; s := m[1]; end if;
  end if;
  s := regexp_replace(s, '[^A-Z0-9]', '', 'g');
  s := regexp_replace(s, '^0+(?=.)', '');
  if s = '' or s !~ '\d' or s = '0' then anno := null; serie := null; return; end if;
  chiave := s;
end $$;
revoke all on function public.acquisti_numero_documento(text) from public, anon;
grant execute on function public.acquisti_numero_documento(text) to authenticated;

-- ─── 3. DDT della fattura ↔ bolla registrata ─────────────────────────────────

-- Le bolle candidate per un DDT citato in una fattura. Stessa azienda, stesso fornitore,
-- stessa chiave, anno e serie compatibili. `vicina` = data entro 10 giorni.
create or replace function public.acquisti_ddt_candidati(p_company uuid, p_fornitore uuid, p_numero text, p_data date)
returns table (ddt_id uuid, numero text, data date, vicina boolean)
language sql stable security definer set search_path = public as $$
  with r as (select (public.acquisti_numero_documento(p_numero)).*)
  select d.id, d.numero_ddt, d.data_ricezione,
         p_data is not null and d.data_ricezione is not null and abs(d.data_ricezione - p_data) <= 10
    from public.ddt_ricezione d, r, lateral public.acquisti_numero_documento(d.numero_ddt) n
   where p_fornitore is not null and r.chiave is not null
     and d.company_id = p_company and d.supplier_id = p_fornitore
     and n.chiave = r.chiave
     and (r.serie is null or n.serie is null or r.serie = n.serie)
     -- Stesso numero, un altro anno = un'altra bolla. L'anno è quello scritto nel numero o quello della data.
     and (coalesce(r.anno, extract(year from p_data)::integer) is null
          or coalesce(n.anno, extract(year from d.data_ricezione)::integer) is null
          or coalesce(r.anno, extract(year from p_data)::integer) = coalesce(n.anno, extract(year from d.data_ricezione)::integer))
$$;
revoke all on function public.acquisti_ddt_candidati(uuid, uuid, text, date) from public, anon, authenticated;

-- Aggancia le righe fattura_ddt ancora senza bolla. p_fattura o p_ddt restringono il lavoro
-- (una fattura appena arrivata, una bolla appena registrata); p_scrivi = false è l'anteprima.
-- Restituisce una riga per ogni riga fattura_ddt esaminata, con l'esito.
create or replace function public.acquisti_collega_ddt(p_company uuid, p_fattura uuid default null, p_ddt uuid default null,
                                                       p_scrivi boolean default true, p_limite integer default 500)
returns table (fattura_ddt_id uuid, fattura_id uuid, numero_ddt text, data_ddt date, esito text, ddt_id uuid, motivo text)
language plpgsql security definer set search_path = public as $$
declare r record; c record; v_n integer; v_vicine integer; v_scelto uuid; v_data date; v_numero text; v_esito text; v_motivo text; v_chiave text;
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

-- All'arrivo della fattura: come prima (righe fattura_ddt dai DatiDDT, mezzi dalla targa), poi l'aggancio.
create or replace function public.fattura_collega_ddt_e_mezzi(p_fattura_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.fatture_ricevute%rowtype; v_ddt integer := 0; v_mezzi integer := 0; v_nota boolean; v_agganciati integer := 0;
begin
  select * into f from public.fatture_ricevute where id = p_fattura_id;
  if not found then return jsonb_build_object('ddt', 0, 'mezzi', 0); end if;
  v_nota := public.e_nota_credito_ricevuta(f.tipo_documento);

  if f.xml_raw is not null and position('NumeroDDT' in f.xml_raw) > 0 then
    with letti as (
      select distinct left(btrim(m[1]), 100) as numero,
             case when m[2] ~ '^\d{4}-\d{2}-\d{2}$' then m[2]::date end as data
        from regexp_matches(f.xml_raw, '<(?:[\w.-]+:)?NumeroDDT>\s*([^<]+?)\s*</(?:[\w.-]+:)?NumeroDDT>\s*<(?:[\w.-]+:)?DataDDT>\s*([^<]+?)\s*</', 'g') as m
    ), scritti as (
      insert into public.fattura_ddt (company_id, fattura_ricevuta_id, numero_ddt, data_ddt, origine, created_by)
      select f.company_id, f.id, l.numero, l.data, 'xml', null from letti l
      on conflict do nothing returning 1
    ) select count(*) into v_ddt from scritti;
  end if;
  select count(*) into v_agganciati from public.acquisti_collega_ddt(f.company_id, f.id) where esito = 'automatico';

  if not public.e_autofattura_ricevuta(f.tipo_documento) and jsonb_typeof(f.righe) = 'array' then
    with chiavi as (
      select m.id, upper(regexp_replace(coalesce(nullif(m.targa, ''), m.matricola, ''), '[^A-Za-z0-9]', '', 'g')) as k
        from public.mezzi m where m.company_id = f.company_id and m.deleted_at is null
    ), righe as (
      select upper(regexp_replace(coalesce(r->>'descrizione', ''), '[^A-Za-z0-9]', '', 'g')) as testo,
             case when (r->>'imponibile') ~ '^-?\d+(\.\d+)?$' then (r->>'imponibile')::numeric else 0 end as importo
        from jsonb_array_elements(f.righe) r
    ), trovati as (
      select c.id as mezzo_id, sum(abs(ri.importo)) as importo
        from chiavi c join righe ri on length(c.k) >= 6 and ri.testo like '%' || c.k || '%'
       group by c.id
    ), scritti as (
      insert into public.fattura_ricevuta_mezzi (company_id, fattura_ricevuta_id, mezzo_id, importo, origine, created_by)
      select f.company_id, f.id, t.mezzo_id,
             public.importo_legame_mezzo(t.importo, (select count(*)::integer from trovati), f.imponibile_totale, v_nota), 'targa', null
        from trovati t
      on conflict (fattura_ricevuta_id, mezzo_id) do nothing returning 1
    ) select count(*) into v_mezzi from scritti;
  end if;
  return jsonb_build_object('ddt', v_ddt, 'mezzi', v_mezzi, 'ddt_agganciati', v_agganciati);
end $$;

-- Quando arriva (o si corregge) la bolla: le fatture che la citavano e la aspettavano.
create or replace function public.acquisti_ddt_cerca_fatture() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.supplier_id is null or btrim(coalesce(new.numero_ddt, '')) = '' then return new; end if;
  if tg_op = 'UPDATE' and new.numero_ddt is not distinct from old.numero_ddt and new.supplier_id is not distinct from old.supplier_id
     and new.data_ricezione is not distinct from old.data_ricezione then
    return new;
  end if;
  begin
    perform 1 from public.acquisti_collega_ddt(new.company_id, null, new.id, true, 200);
  exception when others then
    -- Registrare la bolla viene prima: l'aggancio si rifà col lotto o alla prossima modifica.
    raise log 'acquisti_ddt_cerca_fatture %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.acquisti_ddt_cerca_fatture() from public, anon, authenticated;
drop trigger if exists acquisti_ddt_cerca_fatture on public.ddt_ricezione;
create trigger acquisti_ddt_cerca_fatture after insert or update of numero_ddt, supplier_id, data_ricezione on public.ddt_ricezione
  for each row execute function public.acquisti_ddt_cerca_fatture();

-- ─── Chi può farlo, anteprima, lotti, annullamento ───────────────────────────

create or replace function public.acquisti_puo_collegare(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or public.e_super_admin_dentro(p_company)
    or ((p_company = any (public.aziende_con_permesso('can_view_costs')) or p_company = any (public.aziende_con_permesso('can_manage_purchasing')))
        and not public.utente_sola_lettura(p_company)),
  false)
$$;
revoke all on function public.acquisti_puo_collegare(uuid) from public, anon;
grant execute on function public.acquisti_puo_collegare(uuid) to authenticated;

-- Cosa cambierebbe, senza scrivere niente.
create or replace function public.acquisti_ricollega_ddt_anteprima(p_company uuid, p_esempi integer default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.acquisti_puo_collegare(p_company) then raise exception 'Non hai il permesso di collegare i documenti d''acquisto.' using errcode = '42501'; end if;
  perform set_config('statement_timeout', '60s', true);
  with e as (select * from public.acquisti_collega_ddt(p_company, null, null, false, 100000))
  select jsonb_build_object(
    'esaminate', count(*),
    'si_collegherebbero', count(*) filter (where esito = 'automatico'),
    'da_scegliere', count(*) filter (where esito = 'scelta'),
    'da_confermare', count(*) filter (where esito = 'proposta'),
    'senza_bolla', count(*) filter (where esito = 'nessuno'),
    'esempi', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from e where esito <> 'nessuno' limit p_esempi) x), '[]'::jsonb))
    into v from e;
  return v;
end $$;
revoke all on function public.acquisti_ricollega_ddt_anteprima(uuid, integer) from public, anon;
grant execute on function public.acquisti_ricollega_ddt_anteprima(uuid, integer) to authenticated;

-- Un lotto. Meglio fallire per timeout che bloccare la produzione: si rilancia più piccolo.
create or replace function public.acquisti_ricollega_ddt_lotto(p_company uuid, p_limite integer default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_coll integer; v_esam integer;
begin
  if not public.acquisti_puo_collegare(p_company) then raise exception 'Non hai il permesso di collegare i documenti d''acquisto.' using errcode = '42501'; end if;
  perform set_config('lock_timeout', '3s', true);
  perform set_config('statement_timeout', '60s', true);
  perform set_config('acquisti.processo', 'acquisti_ricollega_ddt_lotto', true);
  select count(*), count(*) filter (where esito = 'automatico') into v_esam, v_coll
    from public.acquisti_collega_ddt(p_company, null, null, true, least(greatest(coalesce(p_limite, 200), 1), 1000));
  return jsonb_build_object('esaminate', v_esam, 'collegate', v_coll);
end $$;
revoke all on function public.acquisti_ricollega_ddt_lotto(uuid, integer) from public, anon;
grant execute on function public.acquisti_ricollega_ddt_lotto(uuid, integer) to authenticated;

-- Cambiare lo stato di un collegamento. Annullare un aggancio fattura↔bolla lo toglie anche da fattura_ddt.
create or replace function public.acquisti_collegamento_cambia_stato(p_id uuid, p_stato text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.acquisti_collegamenti%rowtype;
begin
  select * into c from public.acquisti_collegamenti where id = p_id for update;
  if not found then raise exception 'Collegamento non trovato.' using errcode = 'P0002'; end if;
  if not public.acquisti_puo_collegare(c.company_id) then raise exception 'Non hai il permesso di collegare i documenti d''acquisto.' using errcode = '42501'; end if;
  if not public.acquisti_transizione_ammessa(c.stato, p_stato) then
    raise exception 'Da «%» non si passa a «%».', c.stato, p_stato using errcode = 'P0001';
  end if;
  if p_stato in ('annullato', 'rifiutato') and btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Scrivi perché: resta nella storia del collegamento.' using errcode = '22023';
  end if;
  perform set_config('acquisti.motivo', coalesce(p_motivo, ''), true);
  update public.acquisti_collegamenti set stato = p_stato, updated_at = now() where id = p_id;
  if c.da_tipo = 'fattura_ricevuta' and c.a_tipo = 'ddt' then
    if p_stato in ('annullato', 'rifiutato') then
      update public.fattura_ddt set ddt_ricezione_id = null
       where fattura_ricevuta_id = c.da_id and ddt_ricezione_id = c.a_id and company_id = c.company_id;
    elsif p_stato = 'collegato' then
      -- Riconfermato da una persona: la bolla torna sulla riga del DDT che la cita (se è ancora libera).
      update public.fattura_ddt fd set ddt_ricezione_id = c.a_id
       where fd.fattura_ricevuta_id = c.da_id and fd.company_id = c.company_id and fd.ddt_ricezione_id is null
         and exists (select 1 from public.ddt_ricezione d join public.fatture_ricevute f on f.id = fd.fattura_ricevuta_id
                      where d.id = c.a_id and d.supplier_id = f.fornitore_id
                        and (public.acquisti_numero_documento(d.numero_ddt)).chiave = (public.acquisti_numero_documento(fd.numero_ddt)).chiave);
    end if;
  end if;
  return jsonb_build_object('id', p_id, 'stato', p_stato);
end $$;
revoke all on function public.acquisti_collegamento_cambia_stato(uuid, text, text) from public, anon;
grant execute on function public.acquisti_collegamento_cambia_stato(uuid, text, text) to authenticated;
