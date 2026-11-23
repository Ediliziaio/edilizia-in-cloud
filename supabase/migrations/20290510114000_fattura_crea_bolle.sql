-- 23/11/2026 — Le bolle che la fattura cita ma nessuno ha mai caricato, registrate dalla fattura.
-- Un'impresa aveva 458 bolle citate nelle fatture e 2 caricate: senza bolle la commessa non sa cosa le è
-- arrivato e la fattura si divide a occhio. L'XML della fattura ha già numero, data, righe e prezzi di
-- ogni bolla (DatiDDT + RiferimentoNumeroLinea): manca solo la commessa, che sceglie una persona
-- («A quale commessa va?» → bolla per bolla). Qui:
--   · solo bolle che la fattura cita con le sue righe, ancora senza bolla collegata;
--   · mai una seconda bolla se lo stesso fornitore ne ha già una con quel numero (si collega quella);
--   · merce in cantiere sulla commessa scelta, prezzi dalla fattura, nota «originale da allegare»;
--   · la riga della fattura prende la bolla nuova.
-- Le consegne (materiali in commessa) restano da confermare sulla bolla, come per ogni bolla nuova.
create or replace function public.fattura_crea_bolle(p_fattura uuid, p_bolle jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f public.fatture_ricevute%rowtype; corpo xml; b jsonb; rif record; legame public.fattura_ddt%rowtype;
  nuova uuid; commessa uuid; esistente uuid; quante integer := 0; saltate jsonb := '[]'::jsonb;
begin
  select * into f from public.fatture_ricevute where id = p_fattura;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(f.company_id) or not coalesce(public.user_can_access_company(f.company_id), false)
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_manage_purchasing', f.company_id)
                     or public.e_super_admin_dentro(f.company_id), false) then
    raise exception 'Non puoi registrare bolle per questa azienda' using errcode = '42501';
  end if;
  if f.fornitore_id is null then raise exception 'Associa prima il fornitore alla fattura' using errcode = '22023'; end if;
  if jsonb_typeof(p_bolle) is distinct from 'array' or jsonb_array_length(p_bolle) not between 1 and 200 then
    raise exception 'Scegli da una a duecento bolle' using errcode = '22023';
  end if;
  begin
    corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])[' || (coalesce(f.indice_corpo, 0) + 1) || ']',
      xmlparse(document f.xml_raw)))[1];
  exception when others then corpo := null;
  end;
  if corpo is null then raise exception 'La fattura non ha un XML leggibile' using errcode = '22023'; end if;

  for b in select * from jsonb_array_elements(p_bolle) loop
    commessa := nullif(b->>'order_id', '')::uuid;
    if commessa is null or not exists (select 1 from public.orders o where o.id = commessa and o.company_id = f.company_id and o.deleted_at is null) then
      saltate := saltate || jsonb_build_object('numero', b->>'numero', 'motivo', 'commessa');
      continue;
    end if;
    -- Il riferimento nell'XML, con le sue righe.
    select x.posizione, x.numero, public.acquisti_data_italiana(x.data) data,
           array(select (btrim(n::text))::integer from unnest(xpath('/*/*[local-name()="RiferimentoNumeroLinea"]/text()', x.rif)) n
                 where btrim(n::text) ~ '^[0-9]{1,8}$') linee
      into rif
      from xmltable('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiDDT"]' passing corpo
        columns posizione for ordinality, numero text path 'normalize-space(*[local-name()="NumeroDDT"])',
                data text path 'normalize-space(*[local-name()="DataDDT"])', rif xml path '.') x
     where x.numero = b->>'numero' and (b->>'data' is null or public.acquisti_data_italiana(x.data) = (b->>'data')::date)
     limit 1;
    if rif.numero is null or cardinality(rif.linee) = 0 or rif.data is null then
      saltate := saltate || jsonb_build_object('numero', b->>'numero', 'motivo', 'senza_righe');
      continue;
    end if;
    select * into legame from public.fattura_ddt l
     where l.fattura_ricevuta_id = f.id and l.company_id = f.company_id and l.numero_ddt = rif.numero
       and l.data_ddt is not distinct from rif.data
     limit 1;
    if legame.id is not null and legame.ddt_ricezione_id is not null then
      saltate := saltate || jsonb_build_object('numero', rif.numero, 'motivo', 'gia_collegata');
      continue;
    end if;
    -- Una bolla dello stesso fornitore con quel numero c'è già: si collega quella, non se ne fa un'altra.
    select c.ddt_id into esistente from public.acquisti_ddt_candidati(f.company_id, f.fornitore_id, rif.numero, rif.data) c limit 1;
    if esistente is not null then
      saltate := saltate || jsonb_build_object('numero', rif.numero, 'motivo', 'esiste_gia', 'ddt_id', esistente);
      continue;
    end if;

    insert into public.ddt_ricezione (company_id, supplier_id, numero_ddt, data_ricezione, destinazione, order_id, source, stato, note, created_by)
    values (f.company_id, f.fornitore_id, rif.numero, rif.data, 'cantiere', commessa, 'manual', 'ricevuto',
            'Registrata dalla fattura n. ' || coalesce(f.numero_fattura, '—') || ': l''originale della bolla è da allegare.', auth.uid())
    returning id into nuova;
    insert into public.ddt_righe (company_id, ddt_ricezione_id, posizione, codice_articolo, descrizione, unita_misura, quantita,
                                  prezzo_unitario, origine, testo_grezzo, created_by)
    select f.company_id, nuova, row_number() over (order by v.n), nullif(btrim(v.codice), ''),
           coalesce(nullif(btrim(v.descr), ''), 'Voce ' || v.n), lower(nullif(btrim(v.um), '')),
           public.fattura_numero(v.q),
           case when public.fattura_numero(v.q) > 0 and public.fattura_numero(v.tot) is not null
                then round(public.fattura_numero(v.tot) / public.fattura_numero(v.q), 4) end,
           'manuale', 'Dalla fattura ' || coalesce(f.numero_fattura, '') || ', riga ' || v.n, auth.uid()
      from xmltable('/*/*[local-name()="DatiBeniServizi"]/*[local-name()="DettaglioLinee"]' passing corpo
        columns n integer path '*[local-name()="NumeroLinea"]', descr text path '*[local-name()="Descrizione"]',
                q text path '*[local-name()="Quantita"]', um text path '*[local-name()="UnitaMisura"]',
                tot text path '*[local-name()="PrezzoTotale"]',
                codice text path '*[local-name()="CodiceArticolo"][1]/*[local-name()="CodiceValore"]') v
     where v.n = any(rif.linee);
    if legame.id is not null then
      update public.fattura_ddt set ddt_ricezione_id = nuova
       where id = legame.id and (ddt_ricezione_id is null or ddt_ricezione_id = nuova);
    else
      insert into public.fattura_ddt (company_id, fattura_ricevuta_id, ddt_ricezione_id, numero_ddt, data_ddt, origine, created_by)
      values (f.company_id, f.id, nuova, rif.numero, rif.data, 'manuale', auth.uid())
      on conflict do nothing;
    end if;
    -- Con il collegamento automatico spento l'inserimento della bolla lascia una proposta: è già confermata.
    update public.acquisti_collegamenti set stato = 'collegato', esito = 'manuale', updated_at = now()
     where company_id = f.company_id and da_tipo = 'fattura_ricevuta' and da_id = f.id and a_tipo = 'ddt' and a_id = nuova and stato = 'proposto';
    quante := quante + 1;
  end loop;
  return jsonb_build_object('create', quante, 'saltate', saltate);
end $$;
revoke all on function public.fattura_crea_bolle(uuid, jsonb) from public, anon;
grant execute on function public.fattura_crea_bolle(uuid, jsonb) to authenticated, service_role;
