-- 23/11/2026 — una fattura di un fornitore di calcestruzzo.
-- La fattura cita «2026-DT05-0004727», la bolla di carta dice «4727 /05»: è lo stesso documento
-- (il 4727 della serie 05, uno degli stabilimenti del fornitore). Prima:
--   «2026-DT05-0004727» → chiave DT050004727, anno 2026
--   «4727/05»           → chiave 4727, anno 2005
-- quindi nessun aggancio, nessun prezzo, e il collegamento a mano aggiungeva una 42ª riga.
-- Gemello di shared/acquisti/normalizza.ts (numeroDocumento, lettureNumero, confrontaNumeri).

-- 1. La serie di stabilimento con cifre: «DT05-0004727» = serie 5, numero 4727.
create or replace function public.acquisti_numero_documento(p text, out chiave text, out anno integer, out serie text)
returns record language plpgsql immutable set search_path = '' as $$
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
  if serie is null then
    m := regexp_match(s, '^[A-Z]{1,4}0*(\d{1,3})\s*[/\-]\s*(\d[0-9\s]*)$');
    if m is not null then serie := m[1]; s := m[2]; end if;
  end if;
  s := regexp_replace(s, '[^A-Z0-9]', '', 'g');
  s := regexp_replace(s, '^0+(?=.)', '');
  if s = '' or s !~ '\d' or s = '0' then anno := null; serie := null; return; end if;
  chiave := s;
end $$;

-- 2. Le letture possibili: «4727/05» è il 4727 del 2005 oppure il 4727 della serie 05. Decide la data.
create or replace function public.acquisti_numero_letture(p text)
returns table(chiave text, anno integer, serie text)
language plpgsql immutable set search_path = '' as $$
declare n record; coda text[];
begin
  select * into n from public.acquisti_numero_documento(p);
  if n.chiave is null then return; end if;
  chiave := n.chiave; anno := n.anno; serie := n.serie; return next;
  coda := regexp_match(upper(btrim(p)), '[/\-]\s*(\d{2})\s*$');
  if coda is not null and n.serie is null and n.anno = 2000 + coda[1]::integer then
    chiave := n.chiave; anno := null; serie := regexp_replace(coda[1], '^0+(?=.)', ''); return next;
  end if;
end $$;
revoke all on function public.acquisti_numero_letture(text) from public, anon;
grant execute on function public.acquisti_numero_letture(text) to authenticated, service_role;

-- 3. Stesso documento dello stesso fornitore? Anno: quello scritto o quello della data.
--    p_serie_esatta: la serie deve esserci da entrambe le parti o da nessuna (per i prezzi).
create or replace function public.acquisti_stesso_numero(a text, data_a date, b text, data_b date, p_serie_esatta boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select exists (
    select 1 from public.acquisti_numero_letture(a) x, public.acquisti_numero_letture(b) y
     where x.chiave = y.chiave
       and (case when p_serie_esatta then x.serie is not distinct from y.serie
                 else x.serie is null or y.serie is null or x.serie = y.serie end)
       and (coalesce(x.anno, extract(year from data_a)::integer) is null
            or coalesce(y.anno, extract(year from data_b)::integer) is null
            or coalesce(x.anno, extract(year from data_a)::integer) = coalesce(y.anno, extract(year from data_b)::integer)))
$$;
revoke all on function public.acquisti_stesso_numero(text, date, text, date, boolean) from public, anon;
grant execute on function public.acquisti_stesso_numero(text, date, text, date, boolean) to authenticated, service_role;

-- 4. Le bolle candidate usano le letture (prima: una lettura sola, «4727/05» = 2005).
create or replace function public.acquisti_ddt_candidati(p_company uuid, p_fornitore uuid, p_numero text, p_data date)
returns table(ddt_id uuid, numero text, data date, vicina boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.numero_ddt, d.data_ricezione,
         p_data is not null and d.data_ricezione is not null and abs(d.data_ricezione - p_data) <= 10
    from public.ddt_ricezione d
   where p_fornitore is not null
     and d.company_id = p_company and d.supplier_id = p_fornitore
     and (public.acquisti_numero_documento(d.numero_ddt)).chiave = (public.acquisti_numero_documento(p_numero)).chiave
     and public.acquisti_stesso_numero(p_numero, p_data, d.numero_ddt, d.data_ricezione)
$$;
revoke all on function public.acquisti_ddt_candidati(uuid, uuid, text, date) from public, anon, authenticated;
grant execute on function public.acquisti_ddt_candidati(uuid, uuid, text, date) to service_role;

-- 5. Prezzi dalla fattura alla bolla (private.ddt_piano_prezzi_riferimento), due ritocchi sul testo vivo:
--    a) il legame si riconosce con le letture, non con l'uguaglianza della prima;
--    b) una sola voce della fattura per quella bolla e una sola riga sulla bolla = la stessa merce,
--       anche se codice e descrizione sono scritti diversi («126 CLS RCK35 S4» / «cls c 28-35 s4»).
--       Unità e quantità restano controllate subito dopo, come per le altre righe.
do $migr$
declare
  -- Nei test senza il motore dei prezzi la funzione non c'è: niente da ritoccare.
  definizione text := pg_get_functiondef(to_regprocedure('private.ddt_piano_prezzi_riferimento(uuid,integer)'));
  legame_prima text := $t$      and (l.numero_ddt=rif.numero or
        public.acquisti_numero_documento(l.numero_ddt)=public.acquisti_numero_documento(rif.numero))
      and l.data_ddt=data_rif and abs(d.data_ricezione-data_rif)<=10
      and (public.acquisti_numero_documento(d.numero_ddt)).serie is not distinct from
          (public.acquisti_numero_documento(rif.numero)).serie$t$;
  legame_dopo text := $t$      and (l.numero_ddt=rif.numero or public.acquisti_stesso_numero(l.numero_ddt,l.data_ddt,rif.numero,data_rif))
      and l.data_ddt=data_rif and abs(d.data_ricezione-data_rif)<=10
      and public.acquisti_stesso_numero(d.numero_ddt,d.data_ricezione,rif.numero,data_rif,true)$t$;
  articolo_prima text := $t$    if coalesce(cardinality(candidati),0)<>1 or candidati[1]=any(righe_viste) then
      return private.ddt_prezzi_esito('articolo',id_ddt,voce.n);
    end if;$t$;
  articolo_dopo text := $t$    -- Voce unica della fattura per questa bolla e riga unica sulla bolla (20290510110000).
    if coalesce(cardinality(candidati),0)<>1
      and (select count(*) from jsonb_each(per_riga) e where e.value ? id_ddt::text)=1
      and per_riga->voce.n::text = jsonb_build_array(id_ddt)
      and (select count(*) from public.ddt_righe r where r.company_id=f.company_id and r.ddt_ricezione_id=id_ddt)=1 then
      select array_agg(r.id) into candidati from public.ddt_righe r
      where r.company_id=f.company_id and r.ddt_ricezione_id=id_ddt;
    end if;
    if coalesce(cardinality(candidati),0)<>1 or candidati[1]=any(righe_viste) then
      return private.ddt_prezzi_esito('articolo',id_ddt,voce.n);
    end if;$t$;
begin
  if definizione is null or position('20290510110000' in definizione) > 0 then return; end if;
  if position(legame_prima in definizione) = 0 then raise exception 'ddt_piano_prezzi_riferimento: legame non trovato'; end if;
  if position(articolo_prima in definizione) = 0 then raise exception 'ddt_piano_prezzi_riferimento: articolo non trovato'; end if;
  definizione := replace(definizione, legame_prima, legame_dopo);
  definizione := replace(definizione, articolo_prima, articolo_dopo);
  execute definizione;
end $migr$;

-- 6. Una persona collega bolla e fattura: il prezzo della fattura va sulla bolla subito, se la voce
--    è certa. Il collegamento è la conferma, anche con il collegamento automatico spento.
create or replace function public.ddt_prezzi_dal_collegamento(p_fattura uuid, p_ddt uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.ddt_ricezione%rowtype; f public.fatture_ricevute%rowtype;
  corpo xml; pos integer; esito jsonb; ultimo jsonb; applicate integer := 0;
begin
  select * into d from public.ddt_ricezione where id = p_ddt for update;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(d.company_id) or not coalesce(public.user_can_access_company(d.company_id), false)
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_manage_purchasing', d.company_id)
                     or public.e_super_admin_dentro(d.company_id), false) then
    raise exception 'Non puoi valorizzare questa bolla' using errcode = '42501';
  end if;
  select * into f from public.fatture_ricevute where id = p_fattura and company_id = d.company_id for update;
  if not found then raise exception 'Fattura non trovata' using errcode = '42501'; end if;
  if not exists (select 1 from public.fattura_ddt l where l.fattura_ricevuta_id = f.id and l.ddt_ricezione_id = d.id) then
    return jsonb_build_object('stato', 'da_verificare', 'motivo', 'ddt_da_collegare');
  end if;
  if nullif(f.xml_raw, '') is null then return jsonb_build_object('stato', 'da_verificare', 'motivo', 'xml'); end if;
  begin
    corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])[' || (coalesce(f.indice_corpo, 0) + 1) || ']',
      xmlparse(document f.xml_raw)))[1];
  exception when others then return jsonb_build_object('stato', 'da_verificare', 'motivo', 'xml');
  end;
  for pos in
    select x.posizione from xmltable('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiDDT"]' passing corpo
      columns posizione for ordinality, numero text path 'normalize-space(*[local-name()="NumeroDDT"])',
              data text path 'normalize-space(*[local-name()="DataDDT"])') x
     where exists (select 1 from public.acquisti_ddt_candidati(f.company_id, f.fornitore_id, x.numero,
                     public.acquisti_data_italiana(x.data)) c where c.ddt_id = d.id)
  loop
    esito := private.ddt_piano_prezzi_riferimento(f.id, pos);
    if esito->>'stato' = 'pronta' then
      perform private.ddt_valorizza_applica(d.id, f.id, esito->'righe', true);
      applicate := applicate + jsonb_array_length(esito->'righe');
      esito := private.ddt_piano_prezzi_riferimento(f.id, pos);
    end if;
    ultimo := esito;
  end loop;
  return coalesce(ultimo, jsonb_build_object('stato', 'da_verificare', 'motivo', 'riferimento_ddt'))
         || jsonb_build_object('righe_prezzate', applicate);
end $$;
revoke all on function public.ddt_prezzi_dal_collegamento(uuid, uuid) from public, anon;
grant execute on function public.ddt_prezzi_dal_collegamento(uuid, uuid) to authenticated, service_role;
