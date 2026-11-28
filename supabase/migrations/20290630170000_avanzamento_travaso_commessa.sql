-- Il travaso: dare un saldo di apertura alle lavorazioni che hanno già un avanzamento
-- ─────────────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, lotto 1 del modello (docs/modello-avanzamento-rendiconto-sal-20261128.md).
--
-- Il registro dei movimenti (20290630110000) è pronto ma spento: `a_movimenti` è false su tutte
-- le 6.585 sottofasi, quindi `avanzamento_ricalcola` esce subito e in app non è cambiato niente.
-- Accendere una lavorazione senza darle prima un movimento che spieghi l'avanzamento che ha
-- oggi vorrebbe dire azzerarla: il derivato partirebbe da una somma vuota.
--
-- Questa funzione fa il travaso di UNA commessa, e lo fa solo dove è dimostrabilmente neutro:
--
--  1. Guarda ogni lavorazione della commessa che ha un avanzamento (percentuale, quantità fatta
--     o la spunta) e non è ancora accesa.
--  2. Decide il modo dal valore che c'è, non da come vorremmo misurarla:
--     * `quantita` se ha una quantità fatta > 0 E una base di contratto
--       (`sottofase_quantita_totale`, che vale NULL quando le voci hanno unità diverse);
--     * `percentuale` in tutti gli altri casi — compresa la lavorazione a quantità senza base,
--       che non si accende a quantità per nessun motivo (20290630140000: senza base il derivato
--       non deriva niente, e la prima scrittura futura la troverebbe muta).
--  3. Calcola che cosa il registro direbbe DOPO il movimento di apertura e lo confronta con il
--     valore di adesso. Se i due numeri non coincidono — percentuale messa a mano che non
--     corrisponde alla quantità, quantità oltre la base, arrotondamenti — la lavorazione NON si
--     accende: finisce nell'elenco degli scostamenti, con i due numeri, e la decide una persona.
--  4. Dove coincidono: accende la lavorazione congelando base e unità, scrive il movimento di
--     apertura (`origine = 'apertura'`, `documento_id` = la lavorazione stessa, così un secondo
--     travaso sbatte sull'indice unico invece di raddoppiare), e RILEGGE la riga per verificare
--     che percentuale, quantità e spunta siano rimaste quelle di prima. Se una è cambiata, alza
--     un errore e l'intera chiamata si annulla.
--
-- Restituisce sempre un riepilogo in JSON: quante accese, quante saltate e perché, l'elenco degli
-- scostamenti, e il prima/dopo della percentuale di ogni fase toccata (la percentuale di fase la
-- ricalcola `trg_sottofasi_ricalcola` da sola, ed è quella che leggono cronoprogramma, automazioni
-- di fase, rate agganciate agli eventi, previsionale e misure dei subappaltatori: se non si muove
-- lei, non si muovono loro).
--
-- Con `p_prova => true` (il valore di partenza) non lascia niente: fa tutto dentro un blocco con
-- gestione dell'errore, che in plpgsql è un savepoint, e alla fine solleva di proposito per
-- annullarlo. Le variabili non vengono annullate, quindi il riepilogo torna comunque.
--
-- Solo service role. Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

create or replace function private.avanzamento_travaso_commessa(
  p_order uuid,
  p_prova boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_r record;
  v_base numeric;
  v_unita text;
  v_modo text;
  v_att_q numeric;
  v_att_pct numeric;
  v_mov_pct numeric;
  v_dopo record;
  v_accese int := 0;
  v_saltate int := 0;
  v_scost jsonb := '[]'::jsonb;
  v_salti jsonb := '[]'::jsonb;
  v_fasi_prima jsonb;
  v_fasi_dopo jsonb;
  v_esito jsonb;
begin
  if p_order is null then
    raise exception 'Serve la commessa.' using errcode = '22023';
  end if;

  -- La percentuale di ogni fase della commessa, prima di toccare qualunque cosa.
  select coalesce(jsonb_object_agg(f.id::text, jsonb_build_object(
           'nome', f.name, 'percentuale', f.percentuale, 'completata_il', f.completata_il)), '{}'::jsonb)
    into v_fasi_prima
    from public.order_work_phases f where f.order_id = p_order;

  -- Le lavorazioni che il travaso non guarda nemmeno: nessun avanzamento, o già accese.
  -- Contate PRIMA del ciclo, altrimenti quelle appena accese si conterebbero come «già accese».
  select coalesce(jsonb_agg(jsonb_build_object('motivo', t.motivo, 'quante', t.quante)), '[]'::jsonb)
    into v_salti
    from (
      select case when coalesce(s.a_movimenti, false) then 'già accesa'
                  else 'nessun avanzamento' end as motivo, count(*) as quante
        from public.order_work_subphases s
        join public.order_work_phases f on f.id = s.phase_id
       where f.order_id = p_order
         and (coalesce(s.a_movimenti, false)
              or (coalesce(s.percentuale, 0) = 0 and coalesce(s.quantita_fatta, 0) = 0 and not s.fatta))
       group by 1) t;

  begin
    for v_r in
      select s.id, s.name, s.phase_id, s.percentuale, s.quantita_fatta, s.fatta,
             s.fatta_il, s.updated_at, s.created_at
        from public.order_work_subphases s
        join public.order_work_phases f on f.id = s.phase_id
       where f.order_id = p_order
         and not coalesce(s.a_movimenti, false)
         and (coalesce(s.percentuale, 0) > 0 or coalesce(s.quantita_fatta, 0) > 0 or s.fatta)
       order by s.name
    loop
      v_base := public.sottofase_quantita_totale(v_r.id);
      select max(v.unita) into v_unita
        from public.order_work_phase_voci v where v.subphase_id = v_r.id;

      if coalesce(v_r.quantita_fatta, 0) > 0 and v_base is not null and v_base > 0 then
        v_modo := 'quantita';
      else
        v_modo := 'percentuale';
      end if;

      -- Che cosa direbbe il registro dopo il solo movimento di apertura.
      if v_modo = 'quantita' then
        v_att_q := round(least(greatest(v_r.quantita_fatta, 0), v_base), 3);
        v_att_pct := case when v_att_q <= 0 then 0
                          when v_att_q >= v_base then 100
                          else greatest(1, least(99, round(100 * v_att_q / v_base))) end;
      else
        v_mov_pct := least(greatest(coalesce(v_r.percentuale, case when v_r.fatta then 100 else 0 end), 0), 100);
        v_att_q := null;
        v_att_pct := round(v_mov_pct);
      end if;

      -- Il confronto numero per numero: se qualcosa si muoverebbe, non si accende. La quantità si
      -- guarda in tutti e due i modi: una lavorazione che a percentuale ha una quantità fatta se la
      -- vedrebbe azzerare, perché a percentuale il registro non tiene una quantità. Zero e «niente»
      -- contano per la stessa cosa, qui e nella verifica dopo la scrittura.
      if v_att_pct is distinct from v_r.percentuale
         or coalesce(v_att_q, 0) is distinct from coalesce(v_r.quantita_fatta, 0)
         or (v_att_pct >= 100) is distinct from coalesce(v_r.fatta, false) then
        v_saltate := v_saltate + 1;
        v_scost := v_scost || jsonb_build_object(
          'sottofase', v_r.id, 'lavorazione', v_r.name, 'modo', v_modo,
          'base', v_base,
          'adesso', jsonb_build_object('percentuale', v_r.percentuale,
                                       'quantita', v_r.quantita_fatta, 'fatta', v_r.fatta),
          'col_registro', jsonb_build_object('percentuale', v_att_pct,
                                             'quantita', v_att_q, 'fatta', v_att_pct >= 100));
        continue;
      end if;

      -- Accensione: base e unità congelate adesso, così una variante al computo non sposta più
      -- l'avanzamento di nascosto.
      update public.order_work_subphases s
         set a_movimenti = true,
             modo_avanzamento = v_modo,
             quantita_contratto = case when v_modo = 'quantita' then v_base end,
             unita_contratto = case when v_modo = 'quantita' then v_unita end
       where s.id = v_r.id;

      insert into public.avanzamento_movimenti
        (livello, fase_id, sottofase_id, data, modo, quantita, unita, percentuale,
         rettifica, origine, documento_id, nota, company_id, order_id)
      values
        ('sottofase', v_r.phase_id, v_r.id,
         coalesce(v_r.fatta_il::date, v_r.updated_at::date, v_r.created_at::date, current_date),
         v_modo,
         case when v_modo = 'quantita' then v_att_q end,
         case when v_modo = 'quantita' then v_unita end,
         case when v_modo = 'percentuale' then v_mov_pct end,
         false, 'apertura', v_r.id,
         'Saldo di apertura del registro dei movimenti',
         '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');

      -- La verifica vera: rileggo la riga dopo che il trigger ha ricalcolato.
      select s.percentuale, s.quantita_fatta, s.fatta
        into v_dopo from public.order_work_subphases s where s.id = v_r.id;

      if v_dopo.percentuale is distinct from v_r.percentuale
         or coalesce(v_dopo.quantita_fatta, 0) is distinct from coalesce(v_r.quantita_fatta, 0)
         or v_dopo.fatta is distinct from v_r.fatta then
        raise exception 'Il travaso ha spostato «%»: percentuale %→%, quantità %→%, spunta %→%.',
          v_r.name, v_r.percentuale, v_dopo.percentuale,
          v_r.quantita_fatta, v_dopo.quantita_fatta, v_r.fatta, v_dopo.fatta
          using errcode = '22000';
      end if;

      v_accese := v_accese + 1;
    end loop;

    select coalesce(jsonb_object_agg(f.id::text, jsonb_build_object(
             'nome', f.name, 'percentuale', f.percentuale, 'completata_il', f.completata_il)), '{}'::jsonb)
      into v_fasi_dopo
      from public.order_work_phases f where f.order_id = p_order;

    v_esito := jsonb_build_object(
      'commessa', p_order,
      'prova', coalesce(p_prova, true),
      'accese', v_accese,
      'non_accese_per_scostamento', v_saltate,
      'scostamenti', v_scost,
      'non_guardate', v_salti,
      'fasi_prima', v_fasi_prima,
      'fasi_dopo', v_fasi_dopo,
      'fasi_mosse', (select coalesce(jsonb_agg(jsonb_build_object(
                                'fase', k, 'prima', v_fasi_prima->k->'percentuale',
                                'dopo', v_fasi_dopo->k->'percentuale')), '[]'::jsonb)
                       from jsonb_object_keys(v_fasi_dopo) k
                      where v_fasi_prima->k->'percentuale' is distinct from v_fasi_dopo->k->'percentuale'));

    if coalesce(p_prova, true) then
      -- Annulla il savepoint di questo blocco: della prova non resta niente.
      raise exception 'TRAVASO_PROVA' using errcode = 'P0001';
    end if;
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'TRAVASO_PROVA' then raise; end if;
  end;

  return v_esito;
end;
$function$;

revoke all on function private.avanzamento_travaso_commessa(uuid, boolean) from public, anon, authenticated;

comment on function private.avanzamento_travaso_commessa(uuid, boolean) is
  'Saldo di apertura del registro dei movimenti per una commessa. Accende solo dove il registro ridà gli stessi numeri; il resto lo elenca come scostamento. p_prova = true non lascia niente.';
