-- Fornitori dalle fatture: niente doppioni quando la P.IVA è già in rubrica ma non su un fornitore solo,
-- e motivi in italiano al posto dei messaggi di Postgres (revisione del 15/11/2026).
-- Solo la funzione di creazione cambia; l'anteprima resta quella di 20290404280000.

create or replace function public.acquisti_fornitori_dalle_fatture_crea(p_company uuid, p_chiavi text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; v_id uuid; v_creati integer := 0; v_agganciati integer := 0; v_fatture integer := 0; v_righe integer;
        v_saltati jsonb := '[]'::jsonb; v_trovate text[] := '{}';
begin
  if not public.acquisti_puo_collegare(p_company) then
    raise exception 'Non hai il permesso di gestire i fornitori dalle fatture.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_chiavi, 1), 0) = 0 then return jsonb_build_object('creati', 0, 'agganciati', 0, 'fatture', 0, 'saltati', '[]'::jsonb); end if;
  if array_length(p_chiavi, 1) > 200 then raise exception 'Al massimo 200 fornitori per volta.' using errcode = '22023'; end if;
  perform set_config('lock_timeout', '3s', true);
  -- L'anteprima si calcola una volta: le chiavi scelte si prendono da lì.
  for c in select * from public.acquisti_fornitori_dalle_fatture_anteprima(p_company, 5000) a where a.chiave = any (p_chiavi) loop
    v_trovate := v_trovate || c.chiave;
    v_id := c.gia_in_rubrica;
    -- Già in rubrica ma non unico (due fornitori con la stessa P.IVA, o P.IVA uguale e CF diverso):
    -- crearne un altro farebbe un doppione inutile. Si dice, e lo sistema una persona.
    if v_id is null and exists (select 1 from public.suppliers s where s.company_id = p_company
                                  and (public.partner_tax_key(s.vat_number) = c.chiave or public.partner_tax_key(s.fiscal_code) = c.chiave)) then
      v_saltati := v_saltati || jsonb_build_object('chiave', c.chiave, 'nome', c.nome, 'motivo',
        'in rubrica ci sono già fornitori con questo identificativo ma non uno solo: uniscili o correggili prima');
      continue;
    end if;
    if v_id is null then
      if not c.identificativo_valido then
        v_saltati := v_saltati || jsonb_build_object('chiave', c.chiave, 'nome', c.nome, 'motivo',
          case when c.paese <> 'IT' then 'fornitore estero: va creato a mano' else 'P.IVA o codice fiscale non valido' end);
        continue;
      end if;
      begin
        insert into public.suppliers (company_id, name, vat_number, fiscal_code, address, city, postal_code, province, country, is_active)
        select p_company, coalesce(nullif(btrim(c.nome), ''), 'Fornitore ' || c.chiave), nullif(btrim(c.piva), ''), nullif(btrim(c.codice_fiscale), ''),
               fr.cedente_indirizzo, fr.cedente_comune, fr.cedente_cap, fr.cedente_provincia, coalesce(fr.cedente_paese, 'IT'), true
          from public.fatture_ricevute fr
         where fr.company_id = p_company and fr.fornitore_id is null
           and coalesce(nullif(public.partner_tax_key(fr.cedente_piva), ''), nullif(public.partner_tax_key(fr.cedente_cf), '')) = c.chiave
         order by fr.data_fattura desc nulls last limit 1
        returning id into v_id;
        v_creati := v_creati + 1;
      exception when others then
        v_saltati := v_saltati || jsonb_build_object('chiave', c.chiave, 'nome', c.nome, 'motivo',
          case when sqlstate = '23505' then 'esiste già un fornitore con questo nome: aggiungi la P.IVA a quello'
               when sqlstate = '23514' then 'P.IVA o codice fiscale non accettati dal controllo'
               else 'non creato: ' || sqlerrm end);
        continue;
      end;
    else
      v_agganciati := v_agganciati + 1;
    end if;
    -- Le sue fatture: solo quelle senza fornitore e solo se il fornitore è l'unico con questo identificativo.
    -- Un rifiuto dei controlli delle fatture (es. periodo IVA chiuso) ferma solo questo fornitore, e si dice.
    begin
      update public.fatture_ricevute fr set fornitore_id = v_id
       where fr.company_id = p_company and fr.fornitore_id is null
         and coalesce(nullif(public.partner_tax_key(fr.cedente_piva), ''), nullif(public.partner_tax_key(fr.cedente_cf), '')) = c.chiave
         and public.fornitore_unico_per_cedente(p_company, fr.cedente_piva, fr.cedente_cf) = v_id;
      get diagnostics v_righe = row_count;
      v_fatture := v_fatture + v_righe;
    exception when others then
      v_saltati := v_saltati || jsonb_build_object('chiave', c.chiave, 'nome', c.nome, 'motivo', 'fornitore pronto, fatture non agganciate: ' || sqlerrm);
    end;
  end loop;
  select v_saltati || coalesce(jsonb_agg(jsonb_build_object('chiave', x, 'motivo', 'nessuna fattura senza fornitore con questo identificativo')), '[]'::jsonb)
    into v_saltati from unnest(p_chiavi) x where not (x = any (v_trovate));
  return jsonb_build_object('creati', v_creati, 'agganciati', v_agganciati, 'fatture', v_fatture, 'saltati', v_saltati);
end $$;
revoke all on function public.acquisti_fornitori_dalle_fatture_crea(uuid, text[]) from public, anon;
grant execute on function public.acquisti_fornitori_dalle_fatture_crea(uuid, text[]) to authenticated;
