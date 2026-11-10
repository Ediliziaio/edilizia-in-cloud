-- ============================================================================
-- Lotto 8 del piano subappalto (docs/piano-subappalto-computo-listino.md):
-- la variante di un contratto firmato, voce per voce.
--
-- `subappalto_variante_registra` (esistente) cambia solo l'importo, a corpo.
-- Qui la variante si scrive sulle voci affidate alla ditta:
--   - una voce già nel contratto: nuova quantità (e prezzo, se non è ancora
--     misurata). Mai sotto quanto già riconosciuto nelle misure; a 0 esce dal
--     contratto solo se non ha misure, e la quota torna in bozza;
--   - una quota in bozza della stessa ditta: entra nel contratto;
--   - la somma delle quote di una voce non supera mai la voce della commessa.
-- In un passaggio solo: quote aggiornate, importo del contratto (Σ delle
-- differenze riga per riga, al centesimo), nuova revisione del quadro lavori
-- con gli STESSI id di voce (le misure restano valide, l'importo segue),
-- riga nel registro delle varianti. Il contratto firmato non si riscrive:
-- l'elenco firmato resta la fotografia, la variante sta nel registro e nel quadro.
-- Serve il quadro lavori: senza, prima si imposta l'elenco lavori.
-- ============================================================================

set local lock_timeout = '3s';

create or replace function public.subappalto_variante_voci(p_company uuid, p_contratto uuid, p_righe jsonb, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratti_subappalto;
  q public.subappalto_quadri_lavori;
  a public.subappalto_affidamenti%rowtype;
  r jsonb;
  v_anag uuid;
  v_voci jsonb;
  v_idx int;
  v_qv jsonb;
  v_q numeric;
  v_p numeric;
  v_vecchio numeric;
  v_nuovo numeric;
  v_delta numeric := 0;
  v_ric numeric;
  v_tot numeric;
  v_altri numeric;
  v_desc text;
  v_unita text;
  v_fase uuid;
  v_base text;
  v_importo numeric;
  v_sal numeric;
  v_somma numeric;
  v_ids uuid[] := '{}';
  v_id uuid := gen_random_uuid();
begin
  perform public.subappalto_lavori_autorizza(p_company);
  if length(btrim(coalesce(p_motivo, ''))) not between 5 and 2000
     or p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Scegli le voci da variare e scrivi il motivo della variante.';
  end if;
  select * into c from public.contratti_subappalto where id = p_contratto and company_id = p_company for update;
  if c.id is null or not exists (select 1 from public.orders o where o.id = c.order_id and o.company_id = p_company and o.deleted_at is null) then
    raise exception using errcode = '42501', message = 'Contratto non disponibile.';
  end if;
  if c.firmato_il is null then
    raise exception using errcode = '23514', message = 'Il contratto non è ancora firmato: lavori e prezzi si cambiano da «Lavori e prezzi».';
  end if;
  select s.campo_subappaltatore_id into v_anag from public.subappaltatori_sicurezza s where s.id = c.subappaltatore_id;
  v_anag := coalesce(v_anag, c.subappaltatore_id);
  select * into q from public.subappalto_quadri_lavori where contratto_id = c.id order by revisione desc limit 1;
  if q.id is null then
    raise exception using errcode = '23514', message = 'Prima imposta l''elenco lavori del contratto (misure e SAL), poi la variante sulle voci.';
  end if;
  v_voci := q.voci;

  for r in select value from jsonb_array_elements(p_righe) loop
    select * into a from public.subappalto_affidamenti x where x.id = nullif(r->>'affidamento_id', '')::uuid for update;
    if a.id is null or a.order_id <> c.order_id or a.company_id <> p_company or a.subappaltatore_id is distinct from v_anag then
      raise exception using errcode = '23514', message = 'Una voce della variante non è affidata a questa ditta su questa commessa.';
    end if;
    if a.contratto_id is not null and a.contratto_id <> c.id then
      raise exception using errcode = '23514', message = 'Una voce della variante è in un altro contratto della ditta.';
    end if;
    if a.id = any(v_ids) then
      raise exception using errcode = '23514', message = 'La stessa voce compare due volte nella variante.';
    end if;
    v_ids := v_ids || a.id;
    v_q := nullif(r->>'quantita', '')::numeric;
    v_p := coalesce(nullif(r->>'prezzo', '')::numeric, a.prezzo_unitario);
    if v_q is null or v_q < 0 or v_q > 999999999 or v_q <> round(v_q, 4)
       or v_p is null or v_p < 0 or v_p > 999999999 or v_p <> round(v_p, 2) then
      raise exception using errcode = '22023', message = 'Quantità e prezzo della variante: numeri non negativi, il prezzo al centesimo.';
    end if;
    select v.quantita, v.descrizione, v.unita, v.phase_id into v_tot, v_desc, v_unita, v_fase
      from public.order_work_phase_voci v where v.id = a.voce_id for update;
    select coalesce(sum(x.quantita), 0) into v_altri from public.subappalto_affidamenti x where x.voce_id = a.voce_id and x.id <> a.id;
    if v_q > coalesce(v_tot, 0) - v_altri + 0.0005 then
      raise exception using errcode = '23514',
        message = format('«%s»: della voce restano %s, non %s (il resto è affidato ad altre ditte).',
                         left(coalesce(v_desc, ''), 80), public.quantita_testo(greatest(coalesce(v_tot, 0) - v_altri, 0)), public.quantita_testo(v_q));
    end if;

    v_idx := null;
    select (e.o - 1)::int into v_idx from jsonb_array_elements(v_voci) with ordinality e(x, o) where e.x->>'affidamento_id' = a.id::text limit 1;

    if a.contratto_id = c.id then
      if v_idx is null then
        raise exception using errcode = '23514',
          message = format('«%s» non è nel quadro lavori del contratto: rifai l''elenco lavori dal contratto.', left(coalesce(v_desc, ''), 80));
      end if;
      v_qv := v_voci->v_idx;
      v_vecchio := coalesce((v_qv->>'importo')::numeric, round((v_qv->>'quantita')::numeric * (v_qv->>'prezzo')::numeric, 2));
      select coalesce(sum(m.quantita_riconosciuta), 0) into v_ric from public.subappalto_misure m
       where m.contratto_id = c.id and m.voce_id = (v_qv->>'id')::uuid and m.stato = 'riconosciuta';
      if v_p is distinct from a.prezzo_unitario and exists (
           select 1 from public.subappalto_misure m where m.contratto_id = c.id and m.voce_id = (v_qv->>'id')::uuid and m.stato <> 'annullata') then
        raise exception using errcode = '23514',
          message = format('«%s» ha già misure: il prezzo non cambia, si varia solo la quantità.', left(coalesce(v_desc, ''), 80));
      end if;
      if v_q = 0 then
        if exists (select 1 from public.subappalto_misure m where m.contratto_id = c.id and m.voce_id = (v_qv->>'id')::uuid and m.stato <> 'annullata') then
          raise exception using errcode = '23514',
            message = format('«%s» ha già misure: non esce dal contratto.', left(coalesce(v_desc, ''), 80));
        end if;
        v_nuovo := 0;
        v_voci := v_voci - v_idx;
        update public.subappalto_affidamenti x set contratto_id = null, aggiornato_il = now() where x.id = a.id;
      else
        v_nuovo := round(v_q * v_p, 2);
        if v_qv->>'base' = 'corpo' then
          -- A corpo il quadro tiene una quota (1) col prezzo intero: varia il prezzo della quota.
          if v_ric > 0 and v_nuovo <> v_vecchio then
            raise exception using errcode = '23514',
              message = format('«%s» è a corpo e ha già misure: non si varia.', left(coalesce(v_desc, ''), 80));
          end if;
          v_voci := jsonb_set(v_voci, array[v_idx::text], v_qv || jsonb_build_object('prezzo', v_nuovo, 'importo', v_nuovo));
        else
          if v_q < v_ric - 0.0005 then
            raise exception using errcode = '23514',
              message = format('«%s»: già riconosciuti %s nelle misure, la quantità non scende sotto.', left(coalesce(v_desc, ''), 80), public.quantita_testo(v_ric));
          end if;
          v_voci := jsonb_set(v_voci, array[v_idx::text], v_qv || jsonb_build_object('quantita', v_q, 'prezzo', v_p, 'importo', v_nuovo));
        end if;
        update public.subappalto_affidamenti x set
          quantita = v_q, prezzo_unitario = v_p,
          origine_prezzo = case when x.prezzo_unitario is not distinct from v_p then x.origine_prezzo else 'manuale' end,
          variante_id = case when x.prezzo_unitario is not distinct from v_p then x.variante_id else null end,
          aggiornato_il = now()
         where x.id = a.id;
      end if;
    else
      -- Una quota in bozza della ditta entra nel contratto.
      if v_q = 0 then continue; end if;
      v_vecchio := 0;
      v_nuovo := round(v_q * v_p, 2);
      v_base := case when coalesce(v_unita, '') ~* 'corpo' then 'corpo' when lower(btrim(coalesce(v_unita, ''))) in ('h', 'ore', 'ora') then 'ore' else 'misura' end;
      v_voci := v_voci || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'fase_id', v_fase, 'descrizione', left(coalesce(nullif(btrim(v_desc), ''), 'Voce'), 2000), 'base', v_base,
        'unita', case v_base when 'corpo' then 'quota' when 'ore' then 'h' else left(coalesce(nullif(btrim(v_unita), ''), 'cad'), 15) end,
        'quantita', case when v_base = 'corpo' then 1 else v_q end,
        'prezzo', case when v_base = 'corpo' then v_nuovo else v_p end,
        'importo', v_nuovo, 'voce_commessa_id', a.voce_id, 'affidamento_id', a.id));
      update public.subappalto_affidamenti x set
        contratto_id = c.id, stato = 'a_contratto', quantita = v_q, prezzo_unitario = v_p,
        origine_prezzo = case when x.prezzo_unitario is not distinct from v_p then x.origine_prezzo else 'manuale' end,
        aggiornato_il = now()
       where x.id = a.id;
    end if;
    v_delta := v_delta + v_nuovo - v_vecchio;
  end loop;

  if v_voci = q.voci then
    raise exception using errcode = '22023', message = 'Niente da variare: quantità e prezzi sono quelli del contratto.';
  end if;
  if jsonb_array_length(v_voci) = 0 then
    raise exception using errcode = '23514', message = 'La variante toglierebbe tutte le voci: per chiudere il contratto segnalo come «Risolto».';
  end if;
  v_importo := round(c.importo_contrattuale + v_delta, 2);
  select coalesce(sum((e->>'importo')::numeric), 0) into v_somma from jsonb_array_elements(v_voci) e;
  if v_somma <> v_importo then
    raise exception using errcode = '23514',
      message = format('Il quadro lavori (%s) non torna con l''importo del contratto (%s): rifai l''elenco lavori prima della variante.', v_somma, v_importo);
  end if;
  select coalesce(sum(s.importo_lordo - coalesce(s.oneri_quota, 0)), 0) into v_sal
    from public.sal_subappaltatori s where s.contratto_id = c.id and s.stato <> 'contestato';
  if v_importo < v_sal then
    raise exception using errcode = '23514', message = format('Il nuovo importo (%s) è sotto i SAL già registrati (%s).', v_importo, v_sal);
  end if;

  perform set_config('app.subappalto_variante', '1', true);
  update public.contratti_subappalto set importo_contrattuale = v_importo where id = c.id;
  perform set_config('app.subappalto_variante', '', true);

  insert into public.subappalto_quadri_lavori (id, company_id, contratto_id, revisione, voci, maturazione, giorni_pagamento, importo_lavori, contratto_snapshot, motivo, richiesta, created_by)
  values (v_id, p_company, c.id, q.revisione + 1, v_voci, q.maturazione, q.giorni_pagamento, v_importo,
          jsonb_build_object('numero', c.numero_contratto, 'descrizione', c.descrizione_lavori, 'importo_lavori', v_importo, 'oneri_sicurezza', c.oneri_sicurezza,
                             'modalita_pagamento', c.modalita_pagamento, 'firmato_il', c.firmato_il),
          'Variante: ' || btrim(p_motivo), jsonb_build_object('variante_voci', true, 'id', v_id, 'righe', p_righe), auth.uid());
  insert into public.subappalto_varianti_contratto (company_id, contratto_id, importo_prima, importo_dopo, oneri_prima, oneri_dopo, motivo, created_by)
  values (p_company, c.id, c.importo_contrattuale, v_importo, c.oneri_sicurezza, c.oneri_sicurezza, btrim(p_motivo), auth.uid());

  return jsonb_build_object('importo_prima', c.importo_contrattuale, 'importo', v_importo, 'differenza', round(v_delta, 2), 'revisione', q.revisione + 1);
end;
$$;
revoke all on function public.subappalto_variante_voci(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.subappalto_variante_voci(uuid, uuid, jsonb, text) to authenticated, service_role;
