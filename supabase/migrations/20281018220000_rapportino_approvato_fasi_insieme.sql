-- Approvare un rapportino e far avanzare le fasi che dichiara: una sola operazione.
-- Prima l'app approvava il rapportino e POI, con scritture separate dal browser, aggiornava le fasi:
-- se la seconda parte falliva (rete, fase cambiata nel frattempo) il rapportino restava approvato e le
-- fasi ferme, con un avviso che si perdeva. Ora lo fa il trigger, nella stessa transazione
-- dell'approvazione: o tutto o niente. Regola invariata: percentuale = la più alta tra quella attuale e
-- quella dichiarata; 100 = completata (con il giorno di chiusura), più di 0 = in corso. Solo fasi della
-- stessa commessa e azienda (i riferimenti estranei li blocca già il controllo prima dell'approvazione).
-- Senza fasi dichiarate resta la proposta generica di avanzamento della commessa, come prima.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.campo_rapportino_avanzamento_approvato()
returns trigger language plpgsql security definer set search_path = public
as $$
declare d record;
begin
  if not (new.stato = 'approvato' and old.stato is distinct from 'approvato') then
    return new;
  end if;
  if coalesce(new.fasi_lavorate, '[]'::jsonb) <> '[]'::jsonb and jsonb_typeof(new.fasi_lavorate) = 'array' then
    for d in
      select f.id, f.status, coalesce(f.percentuale, 0) as attuale,
             least(100, greatest(0, coalesce((x->>'percentuale')::numeric, 0))) as dichiarata
        from jsonb_array_elements(new.fasi_lavorate) x
        join public.order_work_phases f
          on f.id = nullif(x->>'phase_id', '')::uuid
         and f.order_id = new.order_id and f.company_id = new.company_id
    loop
      if d.dichiarata > d.attuale or (d.dichiarata >= 100 and d.status <> 'completata')
         or (d.dichiarata > 0 and d.status not in ('in_corso', 'completata')) then
        update public.order_work_phases
           set percentuale = greatest(d.attuale, d.dichiarata),
               status = case when greatest(d.attuale, d.dichiarata) >= 100 then 'completata'
                             when greatest(d.attuale, d.dichiarata) > 0 and status <> 'completata' then 'in_corso'
                             else status end,
               completata_il = case when greatest(d.attuale, d.dichiarata) >= 100 and completata_il is null then now() else completata_il end,
               completata_da = case when greatest(d.attuale, d.dichiarata) >= 100 and completata_da is null then new.user_id else completata_da end,
               updated_at = now()
         where id = d.id;
      end if;
    end loop;
  elsif not coalesce(new.lavoro_completato, false) and nullif(btrim(new.firma_cliente_url), '') is null then
    update public.orders set percentuale_avanzamento = greatest(coalesce(percentuale_avanzamento, 0), coalesce(new.percentuale_avanzamento, 0))
      where id = new.order_id and company_id = new.company_id;
  end if;
  return new;
end $$;
revoke all on function public.campo_rapportino_avanzamento_approvato() from public, anon, authenticated;
