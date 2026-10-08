-- Peso nella media dell'avanzamento della commessa (07/10/2026).
--
-- Dipende da 20281007140000 (company_fasi_settings) e da 20281007143000 (fasi_impostazioni_salva).
--
-- recompute_order_progress (20260710035300) fa la media SEMPLICE delle fasi:
-- una demolizione da 800 € pesa come un impianto da 18.000 €. Ora l'azienda
-- sceglie come pesarle (company_fasi_settings.peso_media):
--   · 'uguale'  — la media di oggi (default, e quando non c'è la riga);
--   · 'durata'  — giorni tra inizio e fine previsti (estremi compresi);
--   · 'venduto' — importo_venduto della fase.
-- Durata e venduto valgono solo se li hanno TUTTE le fasi della commessa: se
-- ne manca uno si ricade sulla media di oggi (una scelta che non si può
-- applicare non inventa numeri). Una fase completata vale 100 anche con la
-- percentuale a 0, come sempre. Con 'uguale' il risultato è IDENTICO a quello
-- di prima: provato sulle commesse vere nella prova SQL.
--
-- Lo specchio TypeScript è src/lib/orders/avanzamentoCommessa.ts: stessi casi.
-- La funzione tiene i privilegi di oggi (create or replace li conserva).
--
-- Il rollup (trg_order_work_phases_progress) scattava solo cambiando
-- percentuale e stato: con un peso per durata o per venduto la media dipende
-- anche da date e importo, quindi ora scatta pure cambiando start_date,
-- end_date e importo_venduto. Con 'uguale' il numero non cambia: la funzione
-- scrive solo se il valore è diverso. È l'unico ritocco a order_work_phases di
-- questo piano: un DROP/CREATE TRIGGER su una tabella piccola, con lock_timeout.

set local lock_timeout = '3s';

alter table public.company_fasi_settings
  add column if not exists peso_media text not null default 'uguale'
  check (peso_media in ('uguale', 'durata', 'venduto'));

create or replace function public.recompute_order_progress(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pct integer;
  v_peso text;
begin
  select coalesce(s.peso_media, 'uguale') into v_peso
    from public.orders o
    left join public.company_fasi_settings s on s.company_id = o.company_id
   where o.id = p_order_id;

  with f as (
    select case when status = 'completata' then 100
                else least(100, greatest(coalesce(percentuale, 0), 0)) end as pct,
           case when start_date is not null and end_date is not null and end_date >= start_date
                then (end_date - start_date + 1) end as giorni,
           case when coalesce(importo_venduto, 0) > 0 then importo_venduto end as venduto
      from public.order_work_phases
     where order_id = p_order_id
  ), n as (
    select count(*) as tot, count(giorni) as con_giorni, count(venduto) as con_venduto from f
  )
  select case
           when v_peso = 'durata' and n.con_giorni = n.tot
             then round(sum(f.pct::numeric * f.giorni) / nullif(sum(f.giorni), 0))
           when v_peso = 'venduto' and n.con_venduto = n.tot
             then round(sum(f.pct::numeric * f.venduto) / nullif(sum(f.venduto), 0))
           else round(avg(f.pct))
         end::integer
    into v_pct
    from f cross join n
   group by n.tot, n.con_giorni, n.con_venduto;

  -- Senza fasi non c'è niente da scrivere (come prima).
  if v_pct is null then
    return;
  end if;

  update public.orders
     set percentuale_avanzamento = v_pct
   where id = p_order_id
     and coalesce(percentuale_avanzamento, -1) <> v_pct;
end;
$$;

-- Il rollup scatta anche cambiando date e venduto, non solo percentuale e stato.
drop trigger if exists trg_order_work_phases_progress on public.order_work_phases;
create trigger trg_order_work_phases_progress
  after insert or delete or update of percentuale, status, start_date, end_date, importo_venduto
  on public.order_work_phases
  for each row execute function public.trg_owp_recompute_order_progress();

-- Stessa firma di 20281007143000 (chi_spunta): ora accetta anche { peso_media }.
create or replace function public.fasi_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;

  if p_valori ? 'chi_spunta' then
    if (p_valori->>'chi_spunta') not in ('tutti', 'chi_la_fa', 'capi') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set chi_spunta = p_valori->>'chi_spunta', updated_at = now()
     where company_id = p_company_id;
  end if;

  if p_valori ? 'peso_media' then
    if (p_valori->>'peso_media') not in ('uguale', 'durata', 'venduto') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set peso_media = p_valori->>'peso_media', updated_at = now()
     where company_id = p_company_id;
    -- Le commesse dell'azienda si riallineano subito: il numero che si vede
    -- deve essere quello della scelta.
    perform public.recompute_order_progress(o.order_id)
      from (select distinct order_id from public.order_work_phases where company_id = p_company_id) o;
  end if;
end;
$$;

revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;
