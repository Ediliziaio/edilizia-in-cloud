-- Fornitori dalle fatture ricevute (docs/automazioni-acquisti.md §5, riga «Fornitore della fattura»).
--
-- Il 15/11/2026 12.515 fatture ricevute su 19.280 non avevano un fornitore: 3 per un fornitore in
-- rubrica non ancora agganciato, le altre perché il fornitore in rubrica NON C'È (1.242 cedenti in
-- 8 aziende). Agganciare non basta: bisogna crearli. Mai da soli e mai su un nome:
--   acquisti_fornitori_dalle_fatture_anteprima(azienda) — un cedente per riga (chiave = partner_tax_key
--     della P.IVA, o del codice fiscale se manca), con nome, fatture, totale, se l'identificativo è
--     valido, se in rubrica c'è già (e allora va solo agganciato), gli omonimi con altra P.IVA.
--     Non scrive niente.
--   acquisti_fornitori_dalle_fatture_crea(azienda, chiavi[]) — per le sole chiavi scelte da una persona:
--     crea il fornitore dai dati del cedente (fattura più recente) se non c'è, poi aggancia le sue
--     fatture senza fornitore. Identificativi non validi o esteri: saltati e detti, non inventati.
--     Lotti con lock_timeout; tetto di 200 chiavi per chiamata.

-- Il nome ridotto all'osso per trovare gli omonimi (indizio, mai un'unione): come nomeConfrontabile
-- in shared/acquisti/normalizza.ts, ma più semplice (senza accenti né lettere lette male dall'OCR).
create or replace function public.acquisti_nome_confrontabile(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')),
           '[.,''"()/\-]', ' ', 'g'),
           '\m(s\s*r\s*l\s*s|s\s*r\s*l|s\s*p\s*a|s\s*n\s*c|s\s*a\s*s|srls|srl|spa|snc|sas|sapa|scarl|coop|cooperativa|societa|società|soc|ditta|impresa|di|e|&)\M', ' ', 'g'),
           '[^a-z0-9à-ü ]', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;
revoke all on function public.acquisti_nome_confrontabile(text) from public, anon;
grant execute on function public.acquisti_nome_confrontabile(text) to authenticated;

create or replace function public.acquisti_fornitori_dalle_fatture_anteprima(p_company uuid, p_limite integer default 500)
returns table (chiave text, nome text, piva text, codice_fiscale text, paese text, fatture integer, totale numeric,
               ultima date, identificativo_valido boolean, gia_in_rubrica uuid, omonimi integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.acquisti_puo_collegare(p_company) then
    raise exception 'Non hai il permesso di gestire i fornitori dalle fatture.' using errcode = '42501';
  end if;
  return query
  with f as (
    select fr.*, coalesce(nullif(public.partner_tax_key(fr.cedente_piva), ''), nullif(public.partner_tax_key(fr.cedente_cf), '')) as k
      from public.fatture_ricevute fr
     where fr.company_id = p_company and fr.fornitore_id is null
  ), g as (
    select f.k,
           (array_agg(f.cedente_ragione_sociale order by f.data_fattura desc nulls last))[1] as nome,
           (array_agg(f.cedente_piva order by f.data_fattura desc nulls last))[1] as piva,
           (array_agg(f.cedente_cf order by f.data_fattura desc nulls last))[1] as cf,
           (array_agg(coalesce(f.cedente_paese, 'IT') order by f.data_fattura desc nulls last))[1] as paese,
           count(*)::integer as n, coalesce(sum(f.totale_documento), 0) as tot, max(f.data_fattura) as ultima
      from f where f.k is not null group by f.k
  )
  select g.k, g.nome, g.piva, g.cf, g.paese, g.n, g.tot, g.ultima,
         (g.paese = 'IT' and ((coalesce(g.piva, '') <> '' and public.piva_valida(g.piva))
                              or (coalesce(g.piva, '') = '' and coalesce(g.cf, '') <> '' and public.codice_fiscale_valido(g.cf)))),
         public.fornitore_unico_per_cedente(p_company, g.piva, g.cf),
         (select count(*)::integer from public.suppliers s
           where s.company_id = p_company
             and public.acquisti_nome_confrontabile(s.name) = public.acquisti_nome_confrontabile(g.nome)
             and public.acquisti_nome_confrontabile(g.nome) <> ''
             and public.partner_tax_key(s.vat_number) is distinct from public.partner_tax_key(g.piva))
    from g
   order by g.n desc, g.tot desc
   limit greatest(1, least(coalesce(p_limite, 500), 5000));
end $$;
revoke all on function public.acquisti_fornitori_dalle_fatture_anteprima(uuid, integer) from public, anon;
grant execute on function public.acquisti_fornitori_dalle_fatture_anteprima(uuid, integer) to authenticated;

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
        v_saltati := v_saltati || jsonb_build_object('chiave', c.chiave, 'nome', c.nome, 'motivo', sqlerrm);
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
