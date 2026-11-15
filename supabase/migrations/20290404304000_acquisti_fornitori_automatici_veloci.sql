-- Fornitori automatici, più veloci (15/11/2026): il primo lotto storico impiegava ~4,6 s per fornitore.
--   - acquisti_tipo_fornitore_certo cercava il reverse charge aprendo le righe di TUTTE le fatture
--     dell'azienda; ora prima trova le fatture di quel cedente
--     ancora senza fornitore (indice: se il fornitore non c'è, sono tutte lì), poi guarda le loro righe;
--   - tre indici parziali sulle fatture senza fornitore, per chiave fiscale (quella di questa migrazione
--     e le due, P.IVA e CF, che usa fornitore_collega_sue_fatture);
--   - acquisti_crea_fornitore_da_cedente conta le fatture agganciate davvero: il trigger dei fornitori le
--     aggancia già alla nascita del fornitore, e il conteggio dell'UPDATE successivo restava a zero.
-- Indici su una tabella di ~20.000 righe: pochi secondi, lock_timeout per non bloccare chi scrive.

set local lock_timeout = '3s';

create index if not exists fatture_ricevute_senza_fornitore_chiave
  on public.fatture_ricevute (company_id, (coalesce(nullif(public.partner_tax_key(cedente_piva), ''), nullif(public.partner_tax_key(cedente_cf), ''))))
  where fornitore_id is null;
create index if not exists fatture_ricevute_senza_fornitore_piva
  on public.fatture_ricevute (company_id, (public.partner_tax_key(cedente_piva)))
  where fornitore_id is null;
create index if not exists fatture_ricevute_senza_fornitore_cf
  on public.fatture_ricevute (company_id, (public.partner_tax_key(cedente_cf)))
  where fornitore_id is null;

create or replace function public.acquisti_tipo_fornitore_certo(p_company uuid, p_chiave text, p_nome text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.subappaltatori sa where sa.company_id = p_company and public.partner_tax_key(sa.piva) = p_chiave) then
    return 'subappalto';
  end if;
  -- Prima le fatture di questo cedente (poche, con l'indice), poi le loro righe.
  if exists (select 1
               from (select f.righe from public.fatture_ricevute f
                      where f.company_id = p_company and f.fornitore_id is null
                        and coalesce(nullif(public.partner_tax_key(f.cedente_piva), ''), nullif(public.partner_tax_key(f.cedente_cf), '')) = p_chiave
                      limit 200) f,
                    jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) x
              where upper(replace(x ->> 'natura_iva', '.', '_')) in ('N6_3', 'N6_7')) then
    return 'subappalto';
  end if;
  return public.acquisti_tipo_fornitore_da_nome(p_nome);
end $$;
revoke all on function public.acquisti_tipo_fornitore_certo(uuid, text, text) from public, anon, authenticated;

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
  -- Il trigger dei fornitori di solito le ha già agganciate alla nascita: qui si prendono le rimaste.
  begin
    update public.fatture_ricevute fr set fornitore_id = v_id
     where fr.company_id = p_company and fr.fornitore_id is null
       and coalesce(nullif(public.partner_tax_key(fr.cedente_piva), ''), nullif(public.partner_tax_key(fr.cedente_cf), '')) = p_chiave
       and public.fornitore_unico_per_cedente(p_company, fr.cedente_piva, fr.cedente_cf) = v_id;
  exception when others then
    return jsonb_build_object('esito', case when v_creato then 'creato' else 'agganciato' end, 'id', v_id, 'tipo', v_tipo,
                              'fatture', (select count(*) from public.fatture_ricevute where fornitore_id = v_id),
                              'motivo', 'fornitore pronto, ma alcune fatture non si sono agganciate (controlli della fattura): riprova dalla pagina Fornitori');
  end;
  select count(*) into v_righe from public.fatture_ricevute where company_id = p_company and fornitore_id = v_id;
  return jsonb_build_object('esito', case when v_creato then 'creato' else 'agganciato' end, 'id', v_id, 'tipo', v_tipo, 'fatture', v_righe);
end $$;
revoke all on function public.acquisti_crea_fornitore_da_cedente(uuid, text) from public, anon, authenticated;
