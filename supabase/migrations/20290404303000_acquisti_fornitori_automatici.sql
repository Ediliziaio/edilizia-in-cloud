-- Fornitori creati da soli dalle fatture ricevute (richiesta del titolare, 15/11/2026).
--
-- «Dalle fatture si creano i relativi fornitori se non presenti.» All'arrivo di una fattura ricevuta
-- senza fornitore, se in rubrica non c'è nessuno con quella P.IVA (o codice fiscale), il fornitore si
-- crea dai dati del cedente e la fattura (con le altre sue senza fornitore) gli si aggancia.
-- Niente doppioni: la chiave è la P.IVA (partner_tax_key), non il nome — lo stesso fornitore scritto in
-- due modi resta uno. Mai creato se:
--   - l'identificativo non è valido (piva_valida / codice_fiscale_valido) o il cedente è estero;
--   - è l'azienda stessa (autofatture, integrazioni);
--   - in rubrica c'è già un fornitore con quella chiave (anche se non unico: lo sistema una persona).
--
-- Il TIPO si assegna subito solo quando l'indizio è certo, come proponiTipo «certa» in
-- src/lib/fornitori/tipiFornitore.ts:
--   1. la P.IVA è nell'elenco dei subappaltatori                       → subappalto
--   2. una sua fattura ha righe in reverse charge edile (N6.3, N6.7)    → subappalto
--   3. il nome è di un gestore, banca, ente, noleggiatore, grande marchio → il suo tipo
-- Un «subappalto» entra da sé nell'elenco dei subappaltatori (trigger collega_fornitore_subappaltatore).
-- Gli altri restano senza tipo e la pagina «Tipi dei fornitori» propone il tipo probabile, da confermare.
-- Le regole del punto 3 sono copiate da DA_NOME (escluso «professionisti», che lì è solo probabile):
-- la parità la controlla src/test/logic/acquistiFornitoriAutomaticiSql.test.ts.
--
-- Storico: acquisti_fornitori_automatici_lotto(azienda, limite) — con lock_timeout, a lotti.

set local lock_timeout = '3s';

create or replace function public.acquisti_tipo_fornitore_da_nome(p_nome text) returns text
language sql immutable set search_path = '' as $$
  select r.tipo from (values
      (1, 'generali', '\y(tim|telecom|vodafone|wind ?tre|windtre|fastweb|iliad|tiscali|eolo|linkem|aruba|register\.it|ovh|google|microsoft|amazon web|meta platforms?|facebook|hp italy|apple|adobe|canva|zoom video|grenke)\y'),
      (2, 'generali', '\y(enel|eni plenitude|plenitude|a2a|hera|edison|iren|acea|sorgenia|engie|dolomiti energia|illumia|e\.on|eon energia|servizio elettrico|duferco|optima italia|energia)\y'),
      (3, 'generali', '\y(ryanair|easyjet|ita airways|alitalia|trenitalia|italo|booking\.com|airbnb|day ristoservice|edenred|pluxee|sodexo|up day)\y'),
      (4, 'finanza_enti', '\y(intesa sanpaolo|unicredit|banco bpm|bper|credem|mps|monte dei paschi|banca|bcc|credito cooperativo|poste italiane|nexi|satispay|sumup|american express|paypal|deutsche bank|fineco|mediolanum|ing bank|agos|findomestic|compass)\y'),
      (5, 'finanza_enti', '\y(assicurazion|generali italia|allianz|unipol|unipolsai|reale mutua|axa|zurich|cattolica|groupama|helvetia|vittoria|itas|sara assicurazioni|hdi)'),
      (6, 'finanza_enti', '\y(cassa edile|edilcassa|inps|inail|agenzia delle entrate|agenzia entrate|comune di|regione|camera di commercio|cciaa|equitalia|riscossione)\y'),
      (7, 'mezzi', '\y(arval|leasys|ayvens|ald automotive|leaseplan|alphabet|athlon|free2move|hertz|avis|europcar|sixt|locauto|enimoov|enjoy)\y'),
      (8, 'mezzi', '\y(q8|kuwait petroleum|esso|tamoil|ip italiana petroli|api ip|shell|eni station|enilive|total ?energies|erg|dkv|radius business|uta edenred|telepass|autostrade per l.italia|carburanti)\y'),
      (9, 'materiali', '\y(leroy merlin|bricoman|brico ?center|bricocenter|obi italia|bigmat|berner|hilti|mapei|knauf|saint.gobain|daikin|samsung electronics air|mitsubishi electric|rossato|ferexpert)\y|w(ue|ü|u)rth')
    ) as r(ordine, tipo, regola)
   where (' ' || lower(coalesce(p_nome, '')) || ' ') ~ r.regola
   order by r.ordine limit 1
$$;
revoke all on function public.acquisti_tipo_fornitore_da_nome(text) from public, anon;
grant execute on function public.acquisti_tipo_fornitore_da_nome(text) to authenticated;

-- Il tipo certo di un cedente dell'azienda, o null.
create or replace function public.acquisti_tipo_fornitore_certo(p_company uuid, p_chiave text, p_nome text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.subappaltatori sa where sa.company_id = p_company and public.partner_tax_key(sa.piva) = p_chiave)
      then 'subappalto'
    when exists (select 1 from public.fatture_ricevute f, jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) x
                  where f.company_id = p_company
                    and coalesce(nullif(public.partner_tax_key(f.cedente_piva), ''), nullif(public.partner_tax_key(f.cedente_cf), '')) = p_chiave
                    and upper(replace(x ->> 'natura_iva', '.', '_')) in ('N6_3', 'N6_7'))
      then 'subappalto'
    else public.acquisti_tipo_fornitore_da_nome(p_nome)
  end
$$;
revoke all on function public.acquisti_tipo_fornitore_certo(uuid, text, text) from public, anon, authenticated;

-- Crea (se serve e si può) il fornitore di un cedente e gli aggancia le fatture senza fornitore.
-- Senza controllo dei permessi: la chiamano solo il trigger, il lotto e la funzione «scelta» qui sotto.
create or replace function public.acquisti_crea_fornitore_da_cedente(p_company uuid, p_chiave text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; v_id uuid; v_tipo text; v_creato boolean := false; v_righe integer := 0; v_azienda text[];
begin
  if p_company is null or coalesce(p_chiave, '') = '' then return jsonb_build_object('esito', 'saltato', 'motivo', 'nessun identificativo'); end if;
  select array_remove(array[nullif(public.partner_tax_key(vat_number), ''), nullif(public.partner_tax_key(fiscal_code), '')], null)
    into v_azienda from public.companies where id = p_company;
  if p_chiave = any (coalesce(v_azienda, '{}')) then
    return jsonb_build_object('esito', 'saltato', 'motivo', 'è l''azienda stessa');
  end if;
  -- I dati del cedente dalla sua fattura più recente senza fornitore.
  select fr.cedente_ragione_sociale nome, fr.cedente_piva piva, fr.cedente_cf cf, coalesce(fr.cedente_paese, 'IT') paese,
         fr.cedente_indirizzo, fr.cedente_comune, fr.cedente_cap, fr.cedente_provincia
    into f from public.fatture_ricevute fr
   where fr.company_id = p_company and fr.fornitore_id is null
     and coalesce(nullif(public.partner_tax_key(fr.cedente_piva), ''), nullif(public.partner_tax_key(fr.cedente_cf), '')) = p_chiave
   order by fr.data_fattura desc nulls last limit 1;
  if not found then return jsonb_build_object('esito', 'saltato', 'motivo', 'nessuna fattura senza fornitore'); end if;

  v_id := public.fornitore_unico_per_cedente(p_company, f.piva, f.cf);
  if v_id is null then
    if exists (select 1 from public.suppliers s where s.company_id = p_company
                 and (public.partner_tax_key(s.vat_number) = p_chiave or public.partner_tax_key(s.fiscal_code) = p_chiave)) then
      return jsonb_build_object('esito', 'saltato', 'motivo', 'in rubrica ci sono già fornitori con questo identificativo ma non uno solo: uniscili o correggili');
    end if;
    if f.paese <> 'IT' then return jsonb_build_object('esito', 'saltato', 'motivo', 'fornitore estero: va creato a mano'); end if;
    if not ((coalesce(f.piva, '') <> '' and public.piva_valida(f.piva))
            or (coalesce(f.piva, '') = '' and coalesce(f.cf, '') <> '' and public.codice_fiscale_valido(f.cf))) then
      return jsonb_build_object('esito', 'saltato', 'motivo', 'P.IVA o codice fiscale non valido');
    end if;
    v_tipo := public.acquisti_tipo_fornitore_certo(p_company, p_chiave, f.nome);
    begin
      insert into public.suppliers (company_id, name, vat_number, fiscal_code, address, city, postal_code, province, country, is_active, tipo)
      values (p_company, coalesce(nullif(btrim(f.nome), ''), 'Fornitore ' || p_chiave), nullif(btrim(f.piva), ''), nullif(btrim(f.cf), ''),
              f.cedente_indirizzo, f.cedente_comune, f.cedente_cap, f.cedente_provincia, f.paese, true, v_tipo)
      returning id into v_id;
      v_creato := true;
    exception when unique_violation then
      return jsonb_build_object('esito', 'saltato', 'motivo', 'esiste già un fornitore con questo nome: aggiungi la P.IVA a quello');
    when check_violation then
      return jsonb_build_object('esito', 'saltato', 'motivo', 'P.IVA o codice fiscale non accettati dal controllo');
    end;
  end if;
  begin
    update public.fatture_ricevute fr set fornitore_id = v_id
     where fr.company_id = p_company and fr.fornitore_id is null
       and coalesce(nullif(public.partner_tax_key(fr.cedente_piva), ''), nullif(public.partner_tax_key(fr.cedente_cf), '')) = p_chiave
       and public.fornitore_unico_per_cedente(p_company, fr.cedente_piva, fr.cedente_cf) = v_id;
    get diagnostics v_righe = row_count;
  exception when others then
    return jsonb_build_object('esito', case when v_creato then 'creato' else 'agganciato' end, 'id', v_id, 'tipo', v_tipo, 'fatture', 0,
                              'motivo', 'fornitore pronto, ma le fatture non si sono agganciate (controlli della fattura): riprova dalla pagina Fornitori');
  end;
  return jsonb_build_object('esito', case when v_creato then 'creato' else 'agganciato' end, 'id', v_id, 'tipo', v_tipo, 'fatture', v_righe);
end $$;
revoke all on function public.acquisti_crea_fornitore_da_cedente(uuid, text) from public, anon, authenticated;

-- All'arrivo della fattura. Mai un errore che fermi il salvataggio.
create or replace function public.acquisti_fornitore_automatico_da_fattura()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fornitore_id is not null then return null; end if;
  begin
    perform public.acquisti_crea_fornitore_da_cedente(new.company_id,
      coalesce(nullif(public.partner_tax_key(new.cedente_piva), ''), nullif(public.partner_tax_key(new.cedente_cf), '')));
  exception when others then
    raise log 'acquisti_fornitore_automatico_da_fattura %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.acquisti_fornitore_automatico_da_fattura() from public, anon, authenticated;
drop trigger if exists acquisti_fornitore_automatico_da_fattura on public.fatture_ricevute;
create trigger acquisti_fornitore_automatico_da_fattura after insert on public.fatture_ricevute
  for each row execute function public.acquisti_fornitore_automatico_da_fattura();

-- La creazione scelta da una persona (pagina Fornitori) passa dalla stessa funzione: stesso tipo, stesse regole.
create or replace function public.acquisti_fornitori_dalle_fatture_crea(p_company uuid, p_chiavi text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; r jsonb; v_creati integer := 0; v_agganciati integer := 0; v_fatture integer := 0; v_saltati jsonb := '[]'::jsonb;
begin
  if not public.acquisti_puo_collegare(p_company) then
    raise exception 'Non hai il permesso di gestire i fornitori dalle fatture.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_chiavi, 1), 0) > 200 then raise exception 'Al massimo 200 fornitori per volta.' using errcode = '22023'; end if;
  perform set_config('lock_timeout', '3s', true);
  foreach k in array coalesce(p_chiavi, '{}') loop
    r := public.acquisti_crea_fornitore_da_cedente(p_company, k);
    if r ->> 'esito' = 'creato' then v_creati := v_creati + 1;
    elsif r ->> 'esito' = 'agganciato' then v_agganciati := v_agganciati + 1;
    else v_saltati := v_saltati || jsonb_build_object('chiave', k, 'motivo', r ->> 'motivo'); end if;
    v_fatture := v_fatture + coalesce((r ->> 'fatture')::integer, 0);
  end loop;
  return jsonb_build_object('creati', v_creati, 'agganciati', v_agganciati, 'fatture', v_fatture, 'saltati', v_saltati);
end $$;
revoke all on function public.acquisti_fornitori_dalle_fatture_crea(uuid, text[]) from public, anon;
grant execute on function public.acquisti_fornitori_dalle_fatture_crea(uuid, text[]) to authenticated;

-- Storico: un lotto di cedenti senza fornitore, i più usati prima. Lo lancia il servizio (o un super admin dentro).
create or replace function public.acquisti_fornitori_automatici_lotto(p_company uuid, p_limite integer default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; r jsonb; v jsonb := jsonb_build_object('creati', 0, 'agganciati', 0, 'saltati', 0, 'fatture', 0, 'tipi', '{}'::jsonb);
begin
  if not (coalesce(auth.jwt() ->> 'role', '') = 'service_role' or public.e_super_admin_dentro(p_company)) then
    raise exception 'Il lotto storico lo lancia il servizio.' using errcode = '42501';
  end if;
  perform set_config('lock_timeout', '3s', true);
  for k in
    select c.k from (
      select coalesce(nullif(public.partner_tax_key(cedente_piva), ''), nullif(public.partner_tax_key(cedente_cf), '')) k, count(*) n
        from public.fatture_ricevute where company_id = p_company and fornitore_id is null group by 1) c
     where c.k is not null
       and not exists (select 1 from public.suppliers s where s.company_id = p_company
                         and (public.partner_tax_key(s.vat_number) = c.k or public.partner_tax_key(s.fiscal_code) = c.k)
                         and public.fornitore_unico_per_cedente(p_company, s.vat_number, s.fiscal_code) is null)
     order by c.n desc
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
  loop
    r := public.acquisti_crea_fornitore_da_cedente(p_company, k);
    v := jsonb_set(v, array[case r ->> 'esito' when 'creato' then 'creati' when 'agganciato' then 'agganciati' else 'saltati' end],
                   to_jsonb((v ->> case r ->> 'esito' when 'creato' then 'creati' when 'agganciato' then 'agganciati' else 'saltati' end)::integer + 1));
    v := jsonb_set(v, '{fatture}', to_jsonb((v ->> 'fatture')::integer + coalesce((r ->> 'fatture')::integer, 0)));
    if r ->> 'esito' = 'creato' then
      v := jsonb_set(v, array['tipi', coalesce(r ->> 'tipo', 'senza_tipo')],
                     to_jsonb(coalesce((v -> 'tipi' ->> coalesce(r ->> 'tipo', 'senza_tipo'))::integer, 0) + 1));
    end if;
  end loop;
  return v;
end $$;
revoke all on function public.acquisti_fornitori_automatici_lotto(uuid, integer) from public, anon;
grant execute on function public.acquisti_fornitori_automatici_lotto(uuid, integer) to authenticated;
