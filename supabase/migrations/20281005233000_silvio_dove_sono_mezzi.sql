-- Silvio sa dove sono mezzi e attrezzi (05/10/2026).
--
-- Fino a oggi Silvio non sapeva niente del parco: a «dov'è il demolitore?»
-- non aveva strumenti per rispondere. Due strumenti nuovi, in sola lettura,
-- chiamati dalle edge function di Silvio col ruolo di servizio come tutti i
-- silvio_tool_*:
--
--   · silvio_tool_dove_sono_mezzi: cerca per nome, codice dell'etichetta
--     (ATT-0012), targa, marca o categoria; oppure cosa ha in carico una
--     persona; oppure un filtro (in officina, guasti, non si trovano, non
--     letti da un mese…). Senza niente: il riepilogo del parco.
--   · silvio_tool_mezzi_del_cantiere: cosa c'è su un cantiere (mezzi lasciati
--     lì, ponteggi montati, furgoni e attrezzi della squadra).
--
-- Per ogni mezzo «dove» è la risposta secca (su un cantiere, con una persona,
-- a bordo di un furgone, in magazzino, in officina, non si trova); accanto ci
-- sono l'ultima lettura del QR (chi l'ha avuto in mano e quando) e i problemi
-- aperti.
--
-- Permessi: l'area (can_view_mezzi) la controlla il motore di Silvio prima di
-- eseguire (dominio «mezzi» in silvioTools.ts). Le commesse compaiono sempre
-- dentro un elenco di oggetti con la chiave «commessa»: così a chi vede solo
-- le proprie commesse arriva il mezzo senza il cantiere degli altri
-- (applyStaffScope in silvioToolExecution.ts). Una commessa senza codice
-- risulta «senza codice» e a chi ha la visibilità ristretta non arriva.
--
-- In più: silvio_tool_guida_a sa dove stanno mezzi e attrezzature nell'app.

-- ── 1. Il riferimento a una commessa ───────────────────────────────────────
create or replace function public.silvio_mezzi_rif_commessa(p_order uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'commessa', coalesce(nullif(btrim(o.order_code), ''), 'senza codice'),
    'cliente', coalesce(nullif(btrim(o.client_company), ''), nullif(btrim(o.client_name), '')),
    'indirizzo', coalesce(nullif(btrim(o.indirizzo_lavori), ''), nullif(btrim(o.work_address), ''))))
    from public.orders o
   where o.id = p_order;
$$;

-- ── 2. La scheda di un mezzo: dov'è, chi ce l'ha, ultima lettura, problemi ──
create or replace function public.silvio_mezzo_scheda(p_mezzo uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with m as (
    select mz.*,
           case when mz.gestione = 'quantita' then public.mezzi_quantita_in_uso(mz.id) end as in_uso,
           (select g.tipo from public.mezzi_segnalazioni g
             where g.mezzo_id = mz.id and g.stato <> 'chiusa' and g.tipo in ('smarrito', 'rubato')
             order by (g.tipo = 'rubato') desc, g.created_at desc
             limit 1) as manca
      from public.mezzi mz
     where mz.id = p_mezzo
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'nome', m.nome,
    'codice', m.codice,
    'genere', case when m.tipo = 'attrezzatura' then 'attrezzatura' else 'mezzo' end,
    'tipo', case m.tipo when 'furgone' then 'furgone' when 'autocarro' then 'autocarro'
                        when 'autovettura' then 'auto' when 'macchina_movimento_terra' then 'macchina movimento terra'
                        when 'sollevamento' then 'sollevamento' when 'rimorchio' then 'rimorchio'
                        when 'altro' then 'altro' end,
    'categoria', cat.nome,
    'targa', nullif(btrim(m.targa), ''),
    'marca_modello', nullif(concat_ws(' ', nullif(btrim(m.marca), ''), nullif(btrim(m.modello), '')), ''),
    'matricola', nullif(btrim(m.matricola), ''),
    'contatore', case when m.contatore is not null
                      then round(m.contatore)::bigint::text || ' ' || coalesce(m.contatore_unita, 'km') end,
    'stato', case m.stato when 'in_officina' then 'in officina' when 'fuori_servizio' then 'fuori servizio'
                          else 'in servizio' end,
    'dove', case
              when m.gestione = 'singola' and m.manca = 'rubato' then 'segnalato come rubato'
              when m.gestione = 'singola' and m.manca = 'smarrito' then 'segnalato: non si trova'
              when m.stato = 'in_officina' then 'in officina'
              when m.gestione = 'quantita' then
                case when coalesce(m.in_uso, 0) <= 0 then 'tutto in magazzino'
                     when m.in_uso >= m.quantita_totale then 'tutto montato sui cantieri'
                     else 'in parte montato sui cantieri, il resto in magazzino' end
              when m.su_mezzo_id is not null then 'a bordo di un mezzo'
              when m.assegnato_order_id is not null then 'su un cantiere'
              when m.assegnato_hr_profilo_id is not null then 'con una persona'
              else 'in magazzino (non assegnato a nessuno)'
            end,
    'in_carico_a', nullif(btrim(concat_ws(' ', hp.nome, hp.cognome)), '')
                   || case when hp.id is not null and not coalesce(hp.attivo, true) then ' (non più in azienda)' else '' end,
    'a_bordo_di', case when v.id is not null then jsonb_strip_nulls(jsonb_build_object(
                    'mezzo', v.nome,
                    'targa', nullif(btrim(v.targa), ''),
                    'guidato_da', nullif(btrim(concat_ws(' ', hv.nome, hv.cognome)), ''),
                    'sul_cantiere', case when v.assegnato_order_id is not null
                                         then jsonb_build_array(public.silvio_mezzi_rif_commessa(v.assegnato_order_id)) end)) end,
    'sul_cantiere', case when m.assegnato_order_id is not null
                         then jsonb_build_array(public.silvio_mezzi_rif_commessa(m.assegnato_order_id)) end,
    'quantita', case when m.gestione = 'quantita' then jsonb_build_object(
                  'totale', public._mezzi_fmt_quantita(m.quantita_totale, m.unita_misura),
                  'montata', public._mezzi_fmt_quantita(coalesce(m.in_uso, 0), m.unita_misura),
                  'in_magazzino', public._mezzi_fmt_quantita(greatest(m.quantita_totale - coalesce(m.in_uso, 0), 0), m.unita_misura)) end,
    'montato_su', (select jsonb_agg(
                     case when a.order_id is not null
                          then coalesce(public.silvio_mezzi_rif_commessa(a.order_id), '{}'::jsonb)
                          else jsonb_build_object('luogo', a.luogo) end
                     || jsonb_build_object('quantita', public._mezzi_fmt_quantita(a.quantita, m.unita_misura),
                                           'dal', to_char(a.dal, 'DD/MM/YYYY'))
                     order by a.dal)
                     from public.mezzi_allocazioni a
                    where a.mezzo_id = m.id
                      and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date)),
    'a_bordo', (select jsonb_agg(concat_ws(' ', b.nome, '(' || b.codice || ')') order by b.nome)
                  from public.mezzi b
                 where b.su_mezzo_id = m.id and b.deleted_at is null),
    'ultima_lettura_qr', (select jsonb_strip_nulls(jsonb_build_object(
                            'quando', to_char(s.created_at at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI'),
                            'giorni_fa', (now() at time zone 'Europe/Rome')::date - (s.created_at at time zone 'Europe/Rome')::date,
                            'chi', coalesce(nullif(btrim(concat_ws(' ', hs.nome, hs.cognome)), ''),
                                            nullif(btrim(concat_ws(' ', ps.first_name, ps.last_name)), '')),
                            'cosa', case s.azione
                                      when 'vista' then 'ha letto il QR'
                                      when 'prendo' then 'l''ha preso in carico'
                                      when 'cantiere' then 'l''ha lasciato in cantiere'
                                      when 'carico_su' then 'l''ha caricato su un furgone'
                                      when 'magazzino' then 'l''ha riportato in magazzino'
                                      when 'smarrito' then 'ha segnalato che non si trova'
                                      when 'monta' then 'l''ha montato'
                                      when 'rientra' then 'l''ha fatto rientrare'
                                      when 'inventario' then 'l''ha contato in inventario' end,
                            'sul_cantiere', case when s.order_id is not null
                                                 then jsonb_build_array(public.silvio_mezzi_rif_commessa(s.order_id)) end))
                            from public.mezzi_scansioni s
                            left join public.hr_profili hs on hs.id = s.hr_profilo_id
                            left join public.profiles ps on ps.id = s.user_id
                           where s.mezzo_id = m.id
                           order by s.created_at desc
                           limit 1),
    'problemi_aperti', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                          'tipo', case g.tipo when 'guasto' then 'guasto' when 'danno' then 'danno'
                                              when 'smarrito' then 'non si trova' when 'rubato' then 'furto'
                                              else 'altro' end,
                          'stato', case g.stato when 'in_lavorazione' then 'in lavorazione' else 'aperta' end,
                          'descrizione', left(nullif(btrim(g.descrizione), ''), 200),
                          'dal', to_char(g.created_at at time zone 'Europe/Rome', 'DD/MM/YYYY'),
                          'da', coalesce(nullif(btrim(concat_ws(' ', hg.nome, hg.cognome)), ''),
                                         nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''))))
                          order by g.created_at desc)
                          from public.mezzi_segnalazioni g
                          left join public.hr_profili hg on hg.id = g.hr_profilo_id
                          left join public.profiles pr on pr.id = g.created_by
                         where g.mezzo_id = m.id and g.stato <> 'chiusa' and g.tipo <> 'km'),
    'scheda', '/azienda/mezzi/' || m.id
  ))
  from m
  left join public.mezzi_categorie cat on cat.id = m.categoria_id
  left join public.hr_profili hp on hp.id = m.assegnato_hr_profilo_id
  left join public.mezzi v on v.id = m.su_mezzo_id
  left join public.hr_profili hv on hv.id = v.assegnato_hr_profilo_id;
$$;

-- ── 3. Cosa c'è su un cantiere ─────────────────────────────────────────────
-- Stesse regole di commessa_mezzi_lavoro («Il cantiere» nella commessa), che
-- però legge l'utente da auth.uid() e col ruolo di servizio torna vuota.
create or replace function public.silvio_mezzi_cantiere_scheda(p_order uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with persone as (
    -- componenti e responsabili delle squadre sulla commessa
    select h.id as hr_id
      from public.squadre_commesse sc
      join public.external_teams t on t.id = sc.squadra_id and t.is_active
      join public.hr_profili h
        on h.company_id = sc.company_id and coalesce(h.attivo, true)
       and (h.id = t.responsabile_hr_profilo_id
            or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
     where sc.order_id = p_order
    union
    -- persone messe sulle fasi (o su tutta la commessa)
    select h.id
      from public.order_employees oe
      join public.hr_profili h on h.employee_id = oe.employee_id and coalesce(h.attivo, true)
     where oe.order_id = p_order
  )
  select coalesce(public.silvio_mezzi_rif_commessa(o.id), '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'stato_commessa', o.status,
    'sul_cantiere', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                       'nome', m.nome,
                       'codice', m.codice,
                       'genere', case when m.tipo = 'attrezzatura' then 'attrezzatura' else 'mezzo' end,
                       'targa', nullif(btrim(m.targa), ''),
                       'stato', case m.stato when 'in_officina' then 'in officina'
                                             when 'fuori_servizio' then 'fuori servizio' end,
                       'in_carico_a', nullif(btrim(concat_ws(' ', h.nome, h.cognome)), ''),
                       'a_bordo', (select jsonb_agg(b.nome order by b.nome) from public.mezzi b
                                    where b.su_mezzo_id = m.id and b.deleted_at is null)))
                     order by m.nome)
                      from public.mezzi m
                      left join public.hr_profili h on h.id = m.assegnato_hr_profilo_id
                     where m.company_id = o.company_id and m.deleted_at is null
                       and m.assegnato_order_id = o.id and m.su_mezzo_id is null),
    -- ponteggi e attrezzature a quantità montati qui (non ancora rientrati)
    'montati', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                  'nome', mq.nome,
                  'codice', mq.codice,
                  'quantita', public._mezzi_fmt_quantita(a.quantita, mq.unita_misura),
                  'dal', to_char(a.dal, 'DD/MM/YYYY')))
                order by mq.nome, a.dal)
                 from public.mezzi_allocazioni a
                 join public.mezzi mq on mq.id = a.mezzo_id and mq.deleted_at is null
                where a.order_id = o.id
                  and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date)),
    -- furgoni e attrezzi in carico a chi lavora qui: un attrezzo lasciato su
    -- un altro cantiere non è con la persona; furgoni e auto seguono chi li guida
    'con_la_squadra', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                         'nome', m.nome,
                         'codice', m.codice,
                         'targa', nullif(btrim(m.targa), ''),
                         'persona', nullif(btrim(concat_ws(' ', h.nome, h.cognome)), ''),
                         'risulta_su_altro_cantiere', case when m.assegnato_order_id is not null
                                                           then jsonb_build_array(public.silvio_mezzi_rif_commessa(m.assegnato_order_id)) end,
                         'a_bordo', (select jsonb_agg(b.nome order by b.nome) from public.mezzi b
                                      where b.su_mezzo_id = m.id and b.deleted_at is null)))
                       order by h.cognome, h.nome, m.nome)
                        from public.mezzi m
                        join public.hr_profili h on h.id = m.assegnato_hr_profilo_id
                       where m.company_id = o.company_id and m.deleted_at is null
                         and m.assegnato_hr_profilo_id in (select p.hr_id from persone p)
                         and m.su_mezzo_id is null
                         and m.assegnato_order_id is distinct from o.id
                         and (m.assegnato_order_id is null or m.tipo in ('furgone', 'autocarro', 'autovettura')))
  ))
  from public.orders o
  where o.id = p_order;
$$;

-- ── 4. Strumento: dove sono mezzi e attrezzi ───────────────────────────────
create or replace function public.silvio_tool_dove_sono_mezzi(
  p_company_id uuid,
  p_user_id uuid default null,
  p_cerca text default null,
  p_persona text default null,
  p_classe text default null,
  p_filtro text default null,
  p_limite integer default 15
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  c_accenti constant text := 'àáâäèéêëìíîïòóôöùúûü';
  c_senza constant text := 'aaaaeeeeiiiioooouuuu';
  -- parole che non dicono quale mezzo: «dove sono i nostri mezzi» = tutto il parco
  c_vuote constant text[] := array[
    'il','lo','la','li','gli','le','un','uno','una','di','del','dello','della','dei','degli','delle',
    'da','dal','dalla','dai','in','nel','nella','su','sul','sulla','con','per','tra','fra','ed','al',
    'alla','ai','dove','sta','stanno','si','trova','trovano','trovo','sono','mio','mia','miei','mie',
    'nostro','nostra','nostri','nostre','quel','quello','quella','questo','questa','abbiamo','ho','ha',
    'chi','cosa','che','mezzo','mezzi','tutti','tutte','adesso','ora'];
  c_io constant text[] := array['io','me','a me','mio','mia','miei','mie','me stesso'];
  v_limite int := least(greatest(coalesce(p_limite, 15), 1), 40);
  v_cerca text := nullif(btrim(coalesce(p_cerca, '')), '');
  v_persona text := nullif(btrim(coalesce(p_persona, '')), '');
  v_classe text := lower(nullif(btrim(coalesce(p_classe, '')), ''));
  v_filtro text := lower(replace(nullif(btrim(coalesce(p_filtro, '')), ''), ' ', '_'));
  v_codice text[];
  v_targa text;
  v_parole text[] := '{}';
  v_pparole text[];
  v_persone uuid[];
  v_nomi_persone jsonb;
  v_modi text[];
  v_modo text;
  v_ids uuid[];
  v_trovati int := 0;
  v_riepilogo jsonb;
  v_risultati jsonb;
  v_note text[] := '{}';
begin
  perform public.assert_company_access(p_company_id);

  if not exists (select 1 from public.mezzi where company_id = p_company_id and deleted_at is null) then
    return jsonb_build_object('ok', true, 'trovati', 0, 'risultati', '[]'::jsonb,
      'nota', 'L''azienda non ha ancora registrato mezzi né attrezzature: si aggiungono da Manodopera e Mezzi → Mezzi e attrezzature.');
  end if;

  if v_classe in ('mezzi', 'mezzo', 'veicoli', 'veicolo') then
    v_classe := 'mezzi';
  elsif v_classe in ('attrezzature', 'attrezzatura', 'attrezzi', 'attrezzo') then
    v_classe := 'attrezzature';
  else
    v_classe := null; -- «tutti» o un valore sconosciuto: nessun limite
  end if;

  if v_filtro in ('tutti', 'nessuno') then
    v_filtro := null;
  end if;
  if v_filtro is not null and v_filtro not in ('in_magazzino', 'sui_cantieri', 'con_persone', 'sui_furgoni', 'in_officina',
                                                'fuori_servizio', 'con_problemi', 'non_si_trovano', 'non_visti_da_30_giorni') then
    return jsonb_build_object('ok', false, 'error',
      'Filtro non riconosciuto. Valori ammessi: in_magazzino, sui_cantieri, con_persone, sui_furgoni, in_officina, fuori_servizio, con_problemi, non_si_trovano, non_visti_da_30_giorni.');
  end if;

  -- Chi: «io» è chi sta chiedendo, altrimenti nome e/o cognome.
  if v_persona is not null then
    if lower(v_persona) = any (c_io) then
      select array_agg(h.id), jsonb_agg(nullif(btrim(concat_ws(' ', h.nome, h.cognome)), ''))
        into v_persone, v_nomi_persone
        from public.hr_profili h
       where p_user_id is not null and h.company_id = p_company_id and h.user_id = p_user_id;
    else
      v_pparole := array(select w from regexp_split_to_table(translate(lower(v_persona), c_accenti, c_senza), '[^a-z0-9]+') w
                          where length(w) >= 2);
      select array_agg(x.id), jsonb_agg(x.nome_completo)
        into v_persone, v_nomi_persone
        from (select h.id,
                     nullif(btrim(concat_ws(' ', h.nome, h.cognome)), '')
                       || case when coalesce(h.attivo, true) then '' else ' (non più in azienda)' end as nome_completo
                from public.hr_profili h
               where h.company_id = p_company_id
                 and cardinality(v_pparole) > 0
                 and not exists (select 1 from unnest(v_pparole) w
                                  where translate(lower(concat_ws(' ', h.nome, h.cognome)), c_accenti, c_senza)
                                        not like '%' || w || '%')
               order by coalesce(h.attivo, true) desc, h.cognome, h.nome
               limit 6) x;
    end if;
    if v_persone is null then
      return jsonb_build_object('ok', true, 'trovati', 0, 'risultati', '[]'::jsonb,
        'nota', case when lower(v_persona) = any (c_io)
                     then 'Chi sta chiedendo non ha una scheda tra i dipendenti: non risultano mezzi in carico a lui.'
                     else format('Nessuno in azienda si chiama «%s»: chiedi nome e cognome.', v_persona) end);
    end if;
  end if;

  -- Cosa: il codice dell'etichetta (ATT-12, mz 3), la targa, oppure parole.
  if v_cerca is not null then
    v_codice := regexp_match(v_cerca, '^\s*(att|mz)[\s.-]*0*([0-9]+)\s*$', 'i');
    if v_codice is null then
      v_targa := upper(regexp_replace(v_cerca, '[^[:alnum:]]', '', 'g'));
      if not (v_targa ~ '[A-Z]' and v_targa ~ '[0-9]' and length(v_targa) between 5 and 10) then
        v_targa := null;
      end if;
      -- radice grezza: «demolitori» e «demolitore» → «demolitor»
      v_parole := array(
        select distinct case when length(w) >= 5 and w ~ '[aeiou]$' then left(w, -1) else w end
          from regexp_split_to_table(translate(lower(v_cerca), c_accenti, c_senza), '[^a-z0-9]+') w
         where length(w) >= 2 and w <> all (c_vuote));
    end if;
  end if;

  -- Prima tutte le parole; se niente, almeno una; se niente, il nome più
  -- simile (errori di battitura e di dettatura).
  v_modi := case when v_codice is null and cardinality(v_parole) > 1 then array['tutte', 'qualcuna', 'simile']
                 when v_codice is null and cardinality(v_parole) = 1 then array['tutte', 'simile']
                 else array['tutte'] end;

  foreach v_modo in array v_modi loop
    with base as (
      select m.id, m.nome, m.codice, m.tipo, m.gestione, m.stato, m.quantita_totale,
             m.assegnato_order_id, m.assegnato_hr_profilo_id, m.su_mezzo_id,
             case when m.gestione = 'quantita' then public.mezzi_quantita_in_uso(m.id) else 0 end as in_uso,
             exists (select 1 from public.mezzi_segnalazioni g
                      where g.mezzo_id = m.id and g.stato <> 'chiusa' and g.tipo in ('smarrito', 'rubato')) as manca,
             upper(regexp_replace(coalesce(m.targa, ''), '[^[:alnum:]]', '', 'g')) as targa_norm,
             translate(lower(concat_ws(' ', m.nome, m.codice, m.targa, m.marca, m.modello, m.matricola, c.nome,
               case m.tipo
                 when 'furgone' then 'furgone furgoni'
                 when 'autocarro' then 'autocarro camion'
                 when 'autovettura' then 'auto autovettura macchina'
                 when 'macchina_movimento_terra' then 'macchina movimento terra escavatore miniescavatore ruspa pala'
                 when 'sollevamento' then 'sollevamento gru piattaforma sollevatore'
                 when 'rimorchio' then 'rimorchio carrello'
                 when 'attrezzatura' then 'attrezzatura attrezzo'
               end)), c_accenti, c_senza) as testo
        from public.mezzi m
        left join public.mezzi_categorie c on c.id = m.categoria_id
       where m.company_id = p_company_id and m.deleted_at is null
    ),
    scelti as (
      select b.id, b.nome,
             case
               when v_codice is not null or v_targa is not null and b.targa_norm = v_targa then 2
               when v_modo = 'qualcuna' then (select count(*) from unnest(v_parole) w where b.testo like '%' || w || '%')::numeric
               when v_modo = 'simile' then word_similarity(array_to_string(v_parole, ' '), b.testo)::numeric
               else 1
             end as punti
        from base b
       where (v_classe is null
              or (v_classe = 'mezzi' and b.tipo <> 'attrezzatura')
              or (v_classe = 'attrezzature' and b.tipo = 'attrezzatura'))
         and (v_persone is null
              or b.assegnato_hr_profilo_id = any (v_persone)
              or b.su_mezzo_id in (select v.id from public.mezzi v
                                    where v.company_id = p_company_id and v.deleted_at is null
                                      and v.assegnato_hr_profilo_id = any (v_persone)))
         and (v_filtro is null
              or (v_filtro = 'in_magazzino'
                  and ((b.gestione = 'quantita' and b.quantita_totale > b.in_uso)
                       or (b.gestione = 'singola' and b.su_mezzo_id is null and b.assegnato_order_id is null
                           and b.assegnato_hr_profilo_id is null and b.stato <> 'in_officina' and not b.manca)))
              or (v_filtro = 'sui_cantieri' and (b.assegnato_order_id is not null or b.in_uso > 0))
              or (v_filtro = 'con_persone' and b.assegnato_hr_profilo_id is not null)
              or (v_filtro = 'sui_furgoni' and b.su_mezzo_id is not null)
              or (v_filtro = 'in_officina' and b.stato = 'in_officina')
              or (v_filtro = 'fuori_servizio' and b.stato = 'fuori_servizio')
              or (v_filtro = 'con_problemi'
                  and exists (select 1 from public.mezzi_segnalazioni g
                               where g.mezzo_id = b.id and g.stato <> 'chiusa' and g.tipo <> 'km'))
              or (v_filtro = 'non_si_trovano' and b.manca)
              or (v_filtro = 'non_visti_da_30_giorni'
                  and not exists (select 1 from public.mezzi_scansioni s
                                   where s.mezzo_id = b.id and s.created_at > now() - interval '30 days')))
         and (case
                when v_codice is not null then b.codice ~* ('^' || v_codice[1] || '-0*' || v_codice[2] || '$')
                when cardinality(v_parole) = 0 and v_targa is null then true
                when v_targa is not null and b.targa_norm = v_targa then true
                when v_modo = 'tutte' then cardinality(v_parole) > 0
                                           and not exists (select 1 from unnest(v_parole) w where b.testo not like '%' || w || '%')
                when v_modo = 'qualcuna' then exists (select 1 from unnest(v_parole) w where b.testo like '%' || w || '%')
                else word_similarity(array_to_string(v_parole, ' '), b.testo) >= 0.5
              end)
    )
    select array_agg(s.id order by s.punti desc, s.nome), count(*)
      into v_ids, v_trovati
      from scelti s;

    exit when v_trovati > 0;
  end loop;

  if v_trovati > 0 then
    select jsonb_agg(public.silvio_mezzo_scheda(t.id) order by t.ord)
      into v_risultati
      from unnest(v_ids[1:v_limite]) with ordinality as t(id, ord);
  end if;

  -- Senza domanda precisa: il quadro del parco. «dove» conta ogni mezzo una
  -- volta sola, con le stesse precedenze della scheda (non si trova, officina,
  -- furgone, cantiere, persona, magazzino); quelli a quantità stanno a parte.
  if v_codice is null and v_targa is null and cardinality(v_parole) = 0 and v_persona is null and v_filtro is null then
    select jsonb_strip_nulls(jsonb_build_object(
             'mezzi', count(*) filter (where r.tipo <> 'attrezzatura'),
             'attrezzature', count(*) filter (where r.tipo = 'attrezzatura'),
             'dove', jsonb_build_object(
                       'sui_cantieri', count(*) filter (where r.dove = 'cantiere'),
                       'con_persone', count(*) filter (where r.dove = 'persona'),
                       'a_bordo_dei_furgoni', count(*) filter (where r.dove = 'mezzo'),
                       'in_magazzino', count(*) filter (where r.dove = 'magazzino'),
                       'in_officina', count(*) filter (where r.dove = 'officina'),
                       'non_si_trovano', count(*) filter (where r.dove = 'manca')),
             'fuori_servizio', count(*) filter (where r.stato = 'fuori_servizio'),
             'con_problemi_aperti', count(*) filter (where r.problemi),
             'a_quantita', jsonb_agg(jsonb_build_object(
                             'nome', r.nome,
                             'totale', public._mezzi_fmt_quantita(r.quantita_totale, r.unita_misura),
                             'montata', public._mezzi_fmt_quantita(r.in_uso, r.unita_misura),
                             'in_magazzino', public._mezzi_fmt_quantita(greatest(r.quantita_totale - r.in_uso, 0), r.unita_misura))
                           order by r.nome) filter (where r.gestione = 'quantita')))
      into v_riepilogo
      from (select m.nome, m.tipo, m.stato, m.gestione, m.quantita_totale, m.unita_misura,
                   case when m.gestione = 'quantita' then public.mezzi_quantita_in_uso(m.id) end as in_uso,
                   case
                     when m.gestione = 'quantita' then 'quantita'
                     when exists (select 1 from public.mezzi_segnalazioni g
                                   where g.mezzo_id = m.id and g.stato <> 'chiusa' and g.tipo in ('smarrito', 'rubato')) then 'manca'
                     when m.stato = 'in_officina' then 'officina'
                     when m.su_mezzo_id is not null then 'mezzo'
                     when m.assegnato_order_id is not null then 'cantiere'
                     when m.assegnato_hr_profilo_id is not null then 'persona'
                     else 'magazzino'
                   end as dove,
                   exists (select 1 from public.mezzi_segnalazioni g
                            where g.mezzo_id = m.id and g.stato <> 'chiusa' and g.tipo <> 'km') as problemi
              from public.mezzi m
             where m.company_id = p_company_id and m.deleted_at is null
               and (v_classe is null
                    or (v_classe = 'mezzi' and m.tipo <> 'attrezzatura')
                    or (v_classe = 'attrezzature' and m.tipo = 'attrezzatura'))) r;
  end if;

  if v_trovati = 0 then
    v_note := v_note || case when v_codice is not null or v_targa is not null or cardinality(v_parole) > 0
      then 'Nessun mezzo o attrezzo corrisponde. Prova con un''altra parola, il codice dell''etichetta (es. ATT-0012) o la targa.'
      when v_persone is not null and v_filtro is null and v_classe is null
      then 'Non risultano mezzi né attrezzi in carico a questa persona, né a bordo dei furgoni che guida.'
      else 'Nessun mezzo o attrezzo in questa situazione.' end;
  elsif v_modo = 'qualcuna' then
    v_note := v_note || 'Nessuno corrisponde a tutte le parole: questi ne contengono almeno una.'::text;
  elsif v_modo = 'simile' then
    v_note := v_note || 'Nessun nome corrisponde: questi sono i più simili, chiedi conferma.'::text;
  end if;
  if v_trovati > v_limite then
    v_note := v_note || format('Sono %s: ne mostro %s. Per gli altri restringi per nome, categoria, persona o filtro.', v_trovati, v_limite);
  end if;
  if v_filtro = 'non_visti_da_30_giorni'
     and not exists (select 1 from public.mezzi_scansioni s where s.company_id = p_company_id) then
    v_note := v_note || 'In questa azienda nessuno ha mai letto un''etichetta QR: le etichette si stampano da Mezzi e attrezzature → Etichette QR.'::text;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'trovati', v_trovati,
    'mostrati', least(v_trovati, v_limite),
    'persone', v_nomi_persone,
    'riepilogo', v_riepilogo,
    'risultati', coalesce(v_risultati, '[]'::jsonb),
    'nota', nullif(array_to_string(v_note, ' '), '')
  ));
end;
$$;

-- ── 5. Strumento: cosa c'è su un cantiere ──────────────────────────────────
create or replace function public.silvio_tool_mezzi_del_cantiere(p_company_id uuid, p_cantiere text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  c_accenti constant text := 'àáâäèéêëìíîïòóôöùúûü';
  c_senza constant text := 'aaaaeeeeiiiioooouuuu';
  v_testo text := nullif(btrim(coalesce(p_cantiere, '')), '');
  v_parole text[];
  v_ordini uuid[];
  v_trovati int := 0;
begin
  perform public.assert_company_access(p_company_id);
  if v_testo is null then
    return jsonb_build_object('ok', false, 'error',
      'Indica il cantiere: il codice della commessa (es. ORD-2026-001) oppure il cliente o l''indirizzo.');
  end if;

  -- Il codice esatto, poi le parole su codice, cliente e indirizzo.
  select array_agg(o.id), count(*)
    into v_ordini, v_trovati
    from public.orders o
   where o.company_id = p_company_id and o.deleted_at is null
     and upper(btrim(o.order_code)) = upper(v_testo);

  if v_ordini is null then
    v_parole := array(select w from regexp_split_to_table(translate(lower(v_testo), c_accenti, c_senza), '[^a-z0-9]+') w
                       where length(w) >= 2
                         and w not in ('cantiere', 'cantieri', 'commessa', 'commesse', 'lavoro', 'lavori', 'il', 'lo', 'la',
                                       'di', 'del', 'della', 'dei', 'da', 'in', 'al', 'ed', 'sig', 'signor', 'signora'));
    if cardinality(v_parole) = 0 then
      return jsonb_build_object('ok', false, 'error',
        'Indica il cantiere: il codice della commessa (es. ORD-2026-001) oppure il cliente o l''indirizzo.');
    end if;
    -- Più commesse con lo stesso cliente o nella stessa via: prima quelle con
    -- qualcosa sopra, poi le aperte, poi le più recenti.
    select array_agg(x.id order by x.ord), max(x.n)
      into v_ordini, v_trovati
      from (select o.id,
                   count(*) over () as n,
                   row_number() over (
                     order by (exists (select 1 from public.mezzi m
                                        where m.assegnato_order_id = o.id and m.deleted_at is null)
                               or exists (select 1 from public.mezzi_allocazioni a
                                           where a.order_id = o.id
                                             and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date))) desc,
                              (o.status = 'completato'), o.created_at desc) as ord
              from public.orders o
             where o.company_id = p_company_id and o.deleted_at is null
               and not exists (select 1 from unnest(v_parole) w
                                where translate(lower(concat_ws(' ', o.order_code, o.client_name, o.client_company,
                                                                o.indirizzo_lavori, o.work_address)), c_accenti, c_senza)
                                      not like '%' || w || '%')) x
     where x.ord <= 3;
  end if;

  if v_ordini is null then
    return jsonb_build_object('ok', false, 'error',
      format('Nessun cantiere trovato per «%s»: serve il codice della commessa, il cliente o l''indirizzo.', v_testo));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'cantieri', (select jsonb_agg(public.silvio_mezzi_cantiere_scheda(t.id) order by t.ord)
                   from unnest(v_ordini) with ordinality as t(id, ord)),
    'nota', case when v_trovati > 3
                 then format('Corrispondono %s commesse: ne mostro 3, prima quelle con mezzi sopra. Per le altre serve il codice.', v_trovati) end
  ));
end;
$$;

-- ── 6. Chi può chiamarle: solo il ruolo di servizio (le edge function) ─────
revoke all on function public.silvio_mezzi_rif_commessa(uuid) from public, anon, authenticated;
revoke all on function public.silvio_mezzo_scheda(uuid) from public, anon, authenticated;
revoke all on function public.silvio_mezzi_cantiere_scheda(uuid) from public, anon, authenticated;
revoke all on function public.silvio_tool_dove_sono_mezzi(uuid, uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.silvio_tool_mezzi_del_cantiere(uuid, text) from public, anon, authenticated;
grant execute on function public.silvio_mezzi_rif_commessa(uuid) to service_role;
grant execute on function public.silvio_mezzo_scheda(uuid) to service_role;
grant execute on function public.silvio_mezzi_cantiere_scheda(uuid) to service_role;
grant execute on function public.silvio_tool_dove_sono_mezzi(uuid, uuid, text, text, text, text, integer) to service_role;
grant execute on function public.silvio_tool_mezzi_del_cantiere(uuid, text) to service_role;

-- ── 7. guida_a: dove stanno mezzi e attrezzature nell'app ──────────────────
-- La funzione è del copilota dell'app: si aggiunge un ramo prima di quello
-- degli ordini a fornitore («acquisto di un furgone» è una domanda sui mezzi).
do $$
declare
  v text := pg_get_functiondef('public.silvio_tool_guida_a(uuid, text, boolean, uuid)'::regprocedure);
  v_ancora text := $q$  ELSIF v_op ~ 'ordine.*fornitore|acquist|riordin' THEN$q$;
  v_nuovo text := $q$  ELSIF v_op ~ '\m(mezz[oi]\M|automezz|attrezz|furgon|ponteg|transenn|escavator)' THEN
    v_spiegazione := 'Mezzi e attrezzature: menu Manodopera e Mezzi, scheda «Mezzi e attrezzature». In alto scegli Mezzi oppure Attrezzature (attrezzi, ponteggi a m², transenne). Dalla scheda di ognuno lo assegni a una persona, a un cantiere o a un furgone, monti i ponteggi su un cantiere, segni guasti e manutenzioni e vedi chi ha letto il suo QR. «Etichette QR» stampa le etichette, «Inventario» conta tutto con lo scanner. Per sapere dove si trova adesso un mezzo o un attrezzo non serve aprire niente: basta chiederlo.';
    v_route := '/azienda/manodopera'; v_params := jsonb_build_object('tab', 'mezzi');
    IF v_op ~ 'attrezz|ponteg|transenn' THEN v_params := v_params || jsonb_build_object('vista', 'attrezzature'); END IF;
    IF v_op ~ 'inventari' THEN v_route := '/azienda/mezzi/inventario'; v_params := '{}'::jsonb; END IF;
    IF p_precompila AND p_entita_id IS NOT NULL THEN v_route := '/azienda/mezzi/' || p_entita_id; v_params := '{}'::jsonb; END IF;
  ELSIF v_op ~ 'ordine.*fornitore|acquist|riordin' THEN$q$;
begin
  if position('/azienda/manodopera' in v) > 0 then
    return;
  end if;
  if (length(v) - length(replace(v, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'silvio_tool_guida_a: il punto da cambiare non è quello atteso, guardarla a mano';
  end if;
  execute replace(v, v_ancora, v_nuovo);
end $$;
