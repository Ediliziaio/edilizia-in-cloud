-- Scadenzario: riepilogo e grafico dei mesi in una chiamata sola (23/11/2026).
--
-- Aprire lo Scadenzario costruiva lo stesso scadenzario QUATTRO volte:
--   1. l'elenco            → scadenzario_fonti
--   2. i numeri in alto    → scadenzario_riepilogo_fonti, che dentro richiama
--                            scadenzario_fonti
--   3. e 4. il grafico dei mesi, che scaricava tutte le righe dell'anno a
--           pagine da 500 (su Demo 2, 755 righe = due giri).
--
-- Misurato su Demo 2 con un utente vero (quindi con le regole di riga attive):
-- una esecuzione di scadenzario_fonti costa 958 ms e legge 72.000 pagine per
-- restituire 1.812 righe — di cui la pagina ne mostra 50, perché la funzione
-- non è filtrabile dall'esterno: PostgreSQL la esegue tutta (Function Scan) e
-- solo dopo applica where, order by e limit. Quattro esecuzioni fanno circa
-- 3,9 secondi di database a ogni apertura, e da lì i 5-6 secondi a schermo.
--
-- Qui i totali diventano una funzione sola: UNA esecuzione di
-- scadenzario_fonti produce sia il riepilogo (gli stessi campi e le stesse
-- formule di scadenzario_riepilogo_fonti, copiate parola per parola) sia i
-- dodici mesi dell'anno. Tre esecuzioni in meno.
--
-- L'elenco non cambia: continua a filtrare e impaginare come prima.
-- scadenzario_riepilogo_fonti resta dov'è, per chi la usa già.
--
-- I mesi: le stesse regole che il grafico applicava nel browser — niente
-- annullate, solo le righe con una data dentro l'anno, somma di `amount`
-- (non del residuo) divisa fra entrate e uscite. I filtri di data della
-- pagina NON valgono per il grafico, che è sempre l'anno intero: per questo
-- legge `tutte` e non `s`. Dodici elementi sempre, da gennaio a dicembre,
-- senza i nomi dei mesi, che restano scritti una volta sola nel browser.

create or replace function public.scadenzario_totali(
  p_company_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_includi_senza_data boolean default true,
  p_solo_senza_data boolean default false,
  p_anno integer default null
) returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with tutte as materialized (
    select * from public.scadenzario_fonti(p_company_id) where status <> 'annullata'
  ),
  s as (
    select * from tutte
     where (not p_solo_senza_data or due_date is null)
       and (
         (due_date is null and p_includi_senza_data)
         or (due_date is not null
             and (p_date_from is null or due_date >= p_date_from)
             and (p_date_to is null or due_date <= p_date_to))
       )
  )
  select jsonb_build_object(
    'riepilogo', (
      select jsonb_build_object(
        'senza_data_count',(select count(*) from tutte where due_date is null and status in ('da_pagare','parziale')),
        'tutte_count',count(*),'da_incassare_count',count(*) filter(where direction='entrata' and status in ('da_pagare','parziale')),
        'da_pagare_count',count(*) filter(where direction='uscita' and status in ('da_pagare','parziale')),
        'pagate_count',count(*) filter(where status='pagata'),
        'entrate_previste',coalesce(sum(amount-paid_amount) filter(where direction='entrata' and status in ('da_pagare','parziale')),0),
        'uscite_previste',coalesce(sum(amount-paid_amount) filter(where direction='uscita' and status in ('da_pagare','parziale')),0),
        'scadute_count',count(*) filter(where status in ('da_pagare','parziale') and due_date<current_date),
        'scadute_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and due_date<current_date),0),
        'scadute_entrata_count',count(*) filter(where direction='entrata' and status in ('da_pagare','parziale') and due_date<current_date),
        'scadute_entrata_amount',coalesce(sum(amount-paid_amount) filter(where direction='entrata' and status in ('da_pagare','parziale') and due_date<current_date),0),
        'scadute_uscita_count',count(*) filter(where direction='uscita' and status in ('da_pagare','parziale') and due_date<current_date),
        'scadute_uscita_amount',coalesce(sum(amount-paid_amount) filter(where direction='uscita' and status in ('da_pagare','parziale') and due_date<current_date),0),
        'questa_settimana_count',count(*) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+7),
        'questa_settimana_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+7),0),
        'prossimi_30gg_count',count(*) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+30),
        'prossimi_30gg_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+30),0),
        'questo_mese_count',count(*) filter(where status in ('da_pagare','parziale') and date_trunc('month',due_date)=date_trunc('month',current_date)),
        'questo_mese_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and date_trunc('month',due_date)=date_trunc('month',current_date)),0)
      ) from s
    ),
    'mesi', case when p_anno is null then null::jsonb else (
      select jsonb_agg(jsonb_build_object('entrate', m.entrate, 'uscite', m.uscite) order by m.mese)
        from (
          select g.mese,
                 coalesce(sum(t.amount) filter (where t.direction='entrata'), 0) as entrate,
                 coalesce(sum(t.amount) filter (where t.direction='uscita'), 0) as uscite
            from generate_series(1, 12) g(mese)
            left join tutte t
              on t.due_date is not null
             and extract(year from t.due_date) = p_anno
             and extract(month from t.due_date) = g.mese
           group by g.mese
        ) m
    ) end
  );
$function$;

comment on function public.scadenzario_totali(uuid, date, date, boolean, boolean, integer) is
  'Riepilogo e dodici mesi dello Scadenzario con UNA sola esecuzione di scadenzario_fonti (23/11/2026). I diritti sono quelli di scadenzario_fonti, che controlla azienda e permesso.';

-- Chiusa come la funzione da cui legge: nessun accesso anonimo.
revoke all on function public.scadenzario_totali(uuid, date, date, boolean, boolean, integer) from public, anon;
grant execute on function public.scadenzario_totali(uuid, date, date, boolean, boolean, integer) to authenticated, service_role;
