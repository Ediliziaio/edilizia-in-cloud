-- Opportunità chiuse al loro posto.
--
-- Solaria Edilizia (23/11/2026): dopo l'import dal vecchio gestionale le
-- opportunità perse stavano nelle colonne normali del kanban, mescolate alle
-- aperte, e le colonne «non tornavano più» (Mirco: «i numeri sono giusti ma
-- sfalsati nelle colonne»). Il vecchio gestionale mostra solo le aperte.
--
-- Non si può aprire la pagina su «solo aperte» e basta: 21 aziende hanno
-- colonne «Vinto» (2.551 schede) e 19 colonne «Perso» che si svuoterebbero.
-- Quindi, quando l'app non sceglie uno stato, manda «chiuse_al_loro_posto»:
-- aperte ovunque, chiuse solo nelle fasi di chiusura. Chi spunta uno stato
-- nel filtro vede quello stato in tutte le fasi, come prima.
--
-- Vale per kanban, lista, conteggi della striscia e «Seleziona tutti»: tutte
-- passano da opportunita_filtrate. Un'app vecchia non manda la chiave e
-- vede come prima. Solo CREATE OR REPLACE: i permessi restano quelli di
-- 20280914000013.

CREATE OR REPLACE FUNCTION public.opportunita_filtrate(p_pipeline uuid, p_filtri jsonb DEFAULT '{}'::jsonb)
 RETURNS SETOF marketing_opportunities
 LANGUAGE sql
 STABLE
AS $function$
  select o.*
    from public.marketing_opportunities o
   where o.pipeline_id = p_pipeline
     and o.deleted_at is null
     -- Ricerca: ogni parola scritta deve comparire in almeno un campo.
     and (coalesce(btrim(p_filtri->>'cerca'), '') = ''
          or not exists (
            select 1
              from unnest(string_to_array(lower(btrim(p_filtri->>'cerca')), ' ')) as parola
             where parola <> ''
               and strpos(lower(concat_ws(' ', o.name, o.source, o.company_name,
                     (select concat_ws(' ', c.first_name, c.last_name, c.email, c.phone, c.company_name)
                        from public.marketing_contacts c
                       where c.id = o.contact_id))), parola) = 0))
     and (coalesce(jsonb_array_length(p_filtri->'stati'), 0) = 0
          or o.status in (select jsonb_array_elements_text(p_filtri->'stati')))
     -- Senza stato scelto (chiave «chiuse_al_loro_posto», la manda l'app):
     -- le chiuse compaiono solo nelle fasi di chiusura (auto_status vinto,
     -- perso o abbandonato), non mescolate alle aperte nelle colonne normali.
     -- L'elenco delle fasi di chiusura si legge una volta per query.
     and (coalesce((p_filtri->>'chiuse_al_loro_posto')::boolean, false) = false
          or o.status = 'open'
          or o.stage_id = any (array(
               select s.id from public.marketing_pipeline_stages s
                where s.pipeline_id = p_pipeline
                  and s.auto_status in ('won', 'lost', 'abandoned'))))
     and (coalesce(p_filtri->>'venditore', '') = '' or o.assigned_to = (p_filtri->>'venditore')::uuid)
     and (coalesce(p_filtri->>'follower', '') = '' or o.follower_id = (p_filtri->>'follower')::uuid)
     and (coalesce(p_filtri->>'call_center', '') = '' or o.call_center_id = (p_filtri->>'call_center')::uuid)
     and (coalesce(p_filtri->>'fonte', '') = ''
          or strpos(lower(coalesce(o.source, '')), lower(p_filtri->>'fonte')) > 0)
     and (coalesce(p_filtri->>'valore_min', '') = '' or coalesce(o.value, 0) >= (p_filtri->>'valore_min')::numeric)
     and (coalesce(p_filtri->>'valore_max', '') = '' or coalesce(o.value, 0) <= (p_filtri->>'valore_max')::numeric)
     -- Le date del filtro sono giorni italiani, non UTC.
     and (coalesce(p_filtri->>'dal', '') = ''
          or o.created_at >= ((p_filtri->>'dal')::date::timestamp at time zone 'Europe/Rome'))
     and (coalesce(p_filtri->>'al', '') = ''
          or o.created_at < (((p_filtri->>'al')::date + 1)::timestamp at time zone 'Europe/Rome'))
     and (coalesce(jsonb_array_length(p_filtri->'tag'), 0) = 0
          or exists (select 1
                       from unnest(o.tags) as t
                      where lower(btrim(regexp_replace(t, '\s+', ' ', 'g')))
                            in (select jsonb_array_elements_text(p_filtri->'tag'))))
     -- «I miei deal» e «vede solo i propri»: venditore, call center o follower
     -- (stesso criterio delle regole del database, 20280914000010).
     and (coalesce(p_filtri->>'miei', '') = ''
          or (p_filtri->>'miei')::uuid in (o.assigned_to, o.call_center_id, o.follower_id))
     and (coalesce(p_filtri->>'visibili_a', '') = ''
          or (p_filtri->>'visibili_a')::uuid in (o.assigned_to, o.call_center_id, o.follower_id))
     -- I due filtri della striscia: «Da fare» (prossima azione scaduta) e
     -- «In stallo» (ferma nella fase oltre la soglia della fase, 14 giorni se
     -- non impostata). Le soglie si leggono UNA volta, come mappa fase→giorni:
     -- cercarle riga per riga faceva scattare le regole di visibilità delle
     -- fasi a ogni opportunità (mezzo secondo in più per un operatore).
     and (case p_filtri->>'striscia'
            when 'azioni_scadute' then
              o.status = 'open' and o.next_action_date < (now() at time zone 'Europe/Rome')::date
            when 'stallo' then
              o.status = 'open'
              and coalesce(o.stage_changed_at, o.updated_at, o.created_at)
                  < now() - make_interval(days => coalesce(
                      ((select jsonb_object_agg(s.id, nullif(s.stalled_threshold_days, 0))
                          from public.marketing_pipeline_stages s
                         where s.pipeline_id = p_pipeline) ->> o.stage_id::text)::int, 14))
            else true
          end)
$function$;
