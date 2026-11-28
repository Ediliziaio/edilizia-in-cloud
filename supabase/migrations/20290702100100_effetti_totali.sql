-- scadenzario_totali: aggiunge `coperto_effetti` e toglie dallo «scaduto» le quote
-- coperte da effetti in attesa la cui data non è ancora arrivata.
-- Le chiavi esistenti non cambiano (definizione di 20290525100000 riscritta intera).
-- Va applicata DOPO 20290702100000_effetti_pagamento.
SET LOCAL lock_timeout = '3s';

create or replace function public.scadenzario_totali(p_company_id uuid, p_date_from date default null,
  p_date_to date default null, p_includi_senza_data boolean default true,
  p_solo_senza_data boolean default false, p_anno integer default null)
returns jsonb language sql stable set search_path to 'public', 'pg_temp' as $function$
  with tutte as materialized (
    select * from public.scadenzario_fonti(p_company_id) where status <> 'annullata'
  ),
  eff as materialized (
    -- NB: coperto_effetti NON segue il periodo (date da/a): conta tutti gli effetti in attesa non scaduti.
    -- Oggi la pagina passa date nulle. effetti in attesa non ancora scaduti (la scadenza dell'effetto è oggi o dopo)
    select e.riga_scadenzario_id, e.direzione, e.importo
      from public.effetti_elenco(p_company_id, '{in_attesa}') e
     where e.data_scadenza >= current_date
  ),
  cop as materialized (
    select riga_scadenzario_id as rid, sum(importo) as coperto from eff
     where riga_scadenzario_id is not null group by 1
  ),
  s as (
    select t.*, least(coalesce(c.coperto,0), greatest(t.amount - t.paid_amount, 0)) as q_coperta
      from tutte t left join cop c on c.rid = t.id
     where (not p_solo_senza_data or t.due_date is null)
       and (
         (t.due_date is null and p_includi_senza_data)
         or (t.due_date is not null
             and (p_date_from is null or t.due_date >= p_date_from)
             and (p_date_to is null or t.due_date <= p_date_to))
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
        'scadute_count',count(*) filter(where status in ('da_pagare','parziale') and due_date<current_date and amount-paid_amount-q_coperta>0.005),
        'scadute_amount',coalesce(sum(amount-paid_amount-q_coperta) filter(where status in ('da_pagare','parziale') and due_date<current_date),0),
        'scadute_entrata_count',count(*) filter(where direction='entrata' and status in ('da_pagare','parziale') and due_date<current_date and amount-paid_amount-q_coperta>0.005),
        'scadute_entrata_amount',coalesce(sum(amount-paid_amount-q_coperta) filter(where direction='entrata' and status in ('da_pagare','parziale') and due_date<current_date),0),
        'scadute_uscita_count',count(*) filter(where direction='uscita' and status in ('da_pagare','parziale') and due_date<current_date and amount-paid_amount-q_coperta>0.005),
        'scadute_uscita_amount',coalesce(sum(amount-paid_amount-q_coperta) filter(where direction='uscita' and status in ('da_pagare','parziale') and due_date<current_date),0),
        'questa_settimana_count',count(*) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+7),
        'questa_settimana_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+7),0),
        'prossimi_30gg_count',count(*) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+30),
        'prossimi_30gg_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and due_date between current_date and current_date+30),0),
        'questo_mese_count',count(*) filter(where status in ('da_pagare','parziale') and date_trunc('month',due_date)=date_trunc('month',current_date)),
        'questo_mese_amount',coalesce(sum(amount-paid_amount) filter(where status in ('da_pagare','parziale') and date_trunc('month',due_date)=date_trunc('month',current_date)),0)
      ) from s
    ),
    'coperto_effetti', jsonb_build_object(
      'entrata', jsonb_build_object('n', (select count(*) from eff where direzione='ricevuto'),
                                    'importo', (select coalesce(sum(importo),0) from eff where direzione='ricevuto')),
      'uscita',  jsonb_build_object('n', (select count(*) from eff where direzione='emesso'),
                                    'importo', (select coalesce(sum(importo),0) from eff where direzione='emesso'))
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
