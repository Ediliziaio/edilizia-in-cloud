-- Con l'interruttore acceso, una proposta scritta quando era spento resta «proposto» anche dopo che
-- acquisti_collega_ddt ha messo la bolla sulla fattura (l'inserimento «collegato» trovava la stessa chiave
-- e non faceva niente). Ora la promuove a «collegato», esito «automatico»; la storia registra il passo.
-- Segnalato dalla revisione del 15/11/2026. Solo la funzione cambia: niente dati da sistemare (oggi
-- nessuna azienda ha l'interruttore acceso).

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
        -- Proposta scritta quando l'interruttore era spento: ora che la bolla si aggancia, la traccia lo dice.
        on conflict (company_id, chiave) do update
           set stato = 'collegato', esito = 'automatico', prove = excluded.prove, updated_at = now()
         where acquisti_collegamenti.stato = 'proposto';
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
