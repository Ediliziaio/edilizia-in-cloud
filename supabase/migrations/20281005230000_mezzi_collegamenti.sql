-- Mezzi e attrezzature collegati al resto dell'app (05/10/2026).
--
-- Dopo l'arrivo delle attrezzature a quantità (ponteggi a m², transenne…) e
-- delle categorie nuove, alcuni punti non le vedevano:
--   1. commessa_mezzi_lavoro («Il cantiere» nella commessa): i ponteggi montati
--      sul cantiere mancavano → nuova chiave «montati».
--   2. manodopera_diario (il diario della giornata): niente montaggi e rientri;
--      «Non si trova» e «Furto» finivano in «Segnalazione», le manutenzioni
--      degli attrezzi in «Intervento».
--   3. manodopera_operaio (scheda dell'operaio): i mezzi in carico ora portano
--      il codice dell'etichetta e anche gli attrezzi a bordo del furgone che
--      guida (in carico a lui o a nessuno).
--   4. mezzi_scadenze: la prossima manutenzione di un attrezzo si chiama
--      «manutenzione», non «tagliando».
--   5. Registro delle attività degli utenti anche su montaggi, inventari e
--      categorie.
--
-- Le tre funzioni (1-3) sono di altri moduli: invece di riscriverle per intero
-- si prende la definizione che c'è nel database e si sostituisce solo il
-- pezzo indicato. Se il pezzo non c'è (la funzione è cambiata nel frattempo)
-- la migrazione si ferma, e va guardata a mano. Se la modifica c'è già, non
-- si rifà.

-- ── 1. commessa_mezzi_lavoro: i ponteggi montati ───────────────────────────
do $$
declare
  v text := pg_get_functiondef('public.commessa_mezzi_lavoro(uuid)'::regprocedure);
  v_vecchio_vuoto text := $q$return jsonb_build_object('sul_cantiere', '[]'::jsonb, 'con_le_persone', '[]'::jsonb);$q$;
  v_nuovo_vuoto text := $q$return jsonb_build_object('sul_cantiere', '[]'::jsonb, 'montati', '[]'::jsonb, 'con_le_persone', '[]'::jsonb);$q$;
  v_ancora text := $q$'con_le_persone', coalesce(($q$;
  v_montati text := $q$-- ponteggi e attrezzature a quantità montati qui (non ancora rientrati)
      'montati', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', a.id, 'mezzo_id', mq.id, 'nome', mq.nome, 'codice', mq.codice,
                 'quantita', a.quantita, 'unita', mq.unita_misura, 'dal', a.dal)
               order by mq.nome, a.dal)
          from public.mezzi_allocazioni a
          join public.mezzi mq on mq.id = a.mezzo_id and mq.deleted_at is null
         where a.order_id = p_order_id
           and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date)
      ), '[]'::jsonb),
      'con_le_persone', coalesce(($q$;
begin
  if position($q$'montati'$q$ in v) > 0 then
    return;
  end if;
  if (length(v) - length(replace(v, v_vecchio_vuoto, ''))) / length(v_vecchio_vuoto) <> 1
     or (length(v) - length(replace(v, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'commessa_mezzi_lavoro: i punti da cambiare non sono quelli attesi, guardarla a mano';
  end if;
  v := replace(replace(v, v_vecchio_vuoto, v_nuovo_vuoto), v_ancora, v_montati);
  execute v;
end $$;

-- ── 2. manodopera_diario: montaggi, rientri e nomi giusti ───────────────────
do $$
declare
  v text := pg_get_functiondef('public.manodopera_diario(uuid, date)'::regprocedure);
  v_segn_vecchio text := $q$when 'km' then 'Km aggiornati' else 'Segnalazione' end$q$;
  v_segn_nuovo text := $q$when 'km' then 'Km aggiornati' when 'smarrito' then 'Non si trova' when 'rubato' then 'Furto' else 'Segnalazione' end$q$;
  v_off_vecchio text := $q$when 'carrozzeria' then 'Carrozzeria' else 'Intervento' end$q$;
  v_off_nuovo text := $q$when 'carrozzeria' then 'Carrozzeria' when 'manutenzione_ordinaria' then 'Manutenzione' when 'sostituzione_parti' then 'Sostituzione di parti' when 'taratura' then 'Taratura' when 'verifica' then 'Verifica' else 'Intervento' end$q$;
  v_ancora text := $q$-- Interventi in officina$q$;
  v_quantita text := $q$-- Ponteggi e attrezzature a quantità: montati (la riga chiusa di un
      -- rientro parziale non è un montaggio nuovo)
      select case when (a.created_at at time zone 'Europe/Rome')::date = v_giorno then a.created_at end, 'mezzo',
             'Montato: ' || m.nome || ' · ' || public._mezzi_fmt_quantita(a.quantita, m.unita_misura),
             a.note,
             coalesce(nullif(trim(coalesce(hm.nome, '') || ' ' || coalesce(hm.cognome, '')), ''),
                      nullif(trim(coalesce(pm.first_name, '') || ' ' || coalesce(pm.last_name, '')), '')),
             a.order_id, public.manodopera_etichetta_commessa(a.order_id), m.id, m.nome
        from public.mezzi_allocazioni a
        join public.mezzi m on m.id = a.mezzo_id
        left join lateral (select h1.nome, h1.cognome from public.hr_profili h1
                            where h1.user_id = a.created_by and h1.company_id = a.company_id
                            order by h1.attivo desc nulls last limit 1) hm on true
        left join public.profiles pm on pm.id = a.created_by
       where a.company_id = p_company_id and a.dal = v_giorno
         and coalesce(a.note, '') <> 'Rientro parziale'
      union all
      -- … e rientrati in magazzino
      select null::timestamptz, 'mezzo',
             'Rientrato: ' || m.nome || ' · ' || public._mezzi_fmt_quantita(a.quantita, m.unita_misura),
             null, null,
             a.order_id, public.manodopera_etichetta_commessa(a.order_id), m.id, m.nome
        from public.mezzi_allocazioni a
        join public.mezzi m on m.id = a.mezzo_id
       where a.company_id = p_company_id and a.al = v_giorno
      union all
      -- Interventi in officina$q$;
begin
  if position('mezzi_allocazioni' in v) > 0 then
    return;
  end if;
  if (length(v) - length(replace(v, v_segn_vecchio, ''))) / length(v_segn_vecchio) <> 1
     or (length(v) - length(replace(v, v_off_vecchio, ''))) / length(v_off_vecchio) <> 1
     or (length(v) - length(replace(v, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'manodopera_diario: i punti da cambiare non sono quelli attesi, guardarla a mano';
  end if;
  v := replace(replace(replace(v, v_segn_vecchio, v_segn_nuovo), v_off_vecchio, v_off_nuovo), v_ancora, v_quantita);
  execute v;
end $$;

-- ── 3. manodopera_operaio: codice ed attrezzi a bordo ───────────────────────
do $$
declare
  v text := pg_get_functiondef('public.manodopera_operaio(uuid)'::regprocedure);
  v_ogg_vecchio text := $q$jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa)$q$;
  v_ogg_nuovo text := $q$jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa, 'codice', m.codice, 'su_mezzo', (select s.nome from public.mezzi s where s.id = m.su_mezzo_id))$q$;
  v_dove_vecchio text := $q$where m.assegnato_hr_profilo_id = v_h.id and m.deleted_at is null)$q$;
  v_dove_nuovo text := $q$where m.deleted_at is null and (m.assegnato_hr_profilo_id = v_h.id or m.su_mezzo_id in (select v2.id from public.mezzi v2 where v2.assegnato_hr_profilo_id = v_h.id and v2.deleted_at is null)))$q$;
begin
  if position($q$'su_mezzo'$q$ in v) > 0 then
    return;
  end if;
  if (length(v) - length(replace(v, v_ogg_vecchio, ''))) / length(v_ogg_vecchio) <> 1
     or (length(v) - length(replace(v, v_dove_vecchio, ''))) / length(v_dove_vecchio) <> 1 then
    raise exception 'manodopera_operaio: i punti da cambiare non sono quelli attesi, guardarla a mano';
  end if;
  v := replace(replace(v, v_ogg_vecchio, v_ogg_nuovo), v_dove_vecchio, v_dove_nuovo);
  execute v;
end $$;

-- ── 4. mezzi_scadenze: la manutenzione degli attrezzi ───────────────────────
do $$
declare
  v text := pg_get_viewdef('public.mezzi_scadenze'::regclass, true);
  v_vecchio text := $q$'tagliando'::text AS categoria$q$;
  v_nuovo text := $q$CASE WHEN m.tipo = 'attrezzatura'::text THEN 'manutenzione'::text ELSE 'tagliando'::text END AS categoria$q$;
begin
  if position($q$'manutenzione'::text$q$ in v) > 0 then
    return;
  end if;
  if (length(v) - length(replace(v, v_vecchio, ''))) / length(v_vecchio) <> 1 then
    raise exception 'mezzi_scadenze: il punto da cambiare non è quello atteso, guardarla a mano';
  end if;
  execute 'create or replace view public.mezzi_scadenze with (security_invoker = true) as ' || replace(v, v_vecchio, v_nuovo);
end $$;

-- ── 5. Registro delle attività ──────────────────────────────────────────────
drop trigger if exists trg_registra_azione_utente on public.mezzi_allocazioni;
create trigger trg_registra_azione_utente after insert or delete or update on public.mezzi_allocazioni
  for each row execute function public.registra_azione_utente();
drop trigger if exists trg_registra_azione_utente on public.mezzi_inventari;
create trigger trg_registra_azione_utente after insert or delete or update on public.mezzi_inventari
  for each row execute function public.registra_azione_utente();
drop trigger if exists trg_registra_azione_utente on public.mezzi_categorie;
create trigger trg_registra_azione_utente after insert or delete or update on public.mezzi_categorie
  for each row execute function public.registra_azione_utente();
