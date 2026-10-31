-- Il costo previsto della ditta segue le voci della sua lavorazione (Dimora Torino, 31/10/2026).
--
-- Prima il previsto si scriveva una volta, all'assegnazione o col pulsante di «Ditte e contratti»: se dopo si
-- aggiungevano, cambiavano o toglievano voci, la ditta restava col numero vecchio. E chi aveva assegnato le
-- ditte prima che le voci esistessero (O-0001, 28/10) si trovava 13 ditte a 0 € con 38.600 € di voci sotto.
--
-- Regola. Quando cambiano le voci di una lavorazione, il previsto della ditta si ricalcola se:
--   · viene dalle voci (costo_origine = 'preventivo'): un previsto scritto a mano ('manuale', 'listino') non si
--     tocca, perché chi l'ha scritto ha deciso lui;
--   · sulla lavorazione c'è UNA ditta sola: con due, chi fa quali voci non si sa, e non lo si inventa.
-- Il costo è Σ quantità × prezzo: il prezzo della ditta sul listino (tariffa_costi_varianti) se c'è, altrimenti
-- il costo della voce. È lo stesso calcolo di costoFaseDitta() (src/lib/orders/ditteLavori.ts).
--
-- IVA. cost_preventivo si salva IVA compresa con l'aliquota della ditta, e chi lo legge la toglie
-- (economiaFasi, v_ordine_marginalita). Le ditte in reverse charge hanno IVA 0: il previsto è l'imponibile.
-- Una ditta che fattura con l'IVA ha il previsto × (1 + IVA), come scrive il pulsante «Assegna ditte e costi».
--
-- Una volta sola: le assegnazioni a 0 € su una lavorazione con voci e una ditta sola passano a 'preventivo' e
-- si riempiono. Il 31/10/2026 sono le 13 della O-0001 di Dimora; nessun'altra azienda ha casi.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.ditte_ricalcola_previsto(p_fasi uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  with sole as (
    select oet.id, oet.phase_id, oet.external_team_id, coalesce(oet.vat_rate, 0) as iva
      from public.order_external_teams oet
     where oet.phase_id = any(p_fasi)
       and oet.costo_origine = 'preventivo'
       and oet.external_team_id is not null
       and (select count(*) from public.order_external_teams x
             where x.phase_id = oet.phase_id and x.external_team_id is not null) = 1
  ), costo as (
    select s.id, s.iva,
           coalesce(sum(v.quantita * coalesce(
             (select tv.costo from public.tariffa_costi_varianti tv
               where tv.tariffa_id = v.tariffa_id and tv.external_team_id = s.external_team_id
                 and tv.attivo is not false and tv.costo is not null
               order by tv.is_default desc nulls last, tv.sort_order nulls last
               limit 1),
             v.costo_manodopera, 0)), 0) as netto
      from sole s
      left join public.order_work_phase_voci v on v.phase_id = s.phase_id
     group by s.id, s.iva
  )
  update public.order_external_teams oet
     set cost_preventivo = round(c.netto * (1 + c.iva / 100), 2)
    from costo c
   where oet.id = c.id
     and oet.cost_preventivo is distinct from round(c.netto * (1 + c.iva / 100), 2);
$$;
revoke all on function public.ditte_ricalcola_previsto(uuid[]) from public, anon, authenticated;

create or replace function public.voci_ricalcola_ditte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fasi uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct phase_id) into v_fasi from nuove;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct phase_id) into v_fasi from vecchie;
  else
    select array_agg(distinct phase_id) into v_fasi
      from (select phase_id from nuove union select phase_id from vecchie) x;
  end if;
  if v_fasi is not null then
    perform public.ditte_ricalcola_previsto(v_fasi);
  end if;
  return null;
end $$;
revoke all on function public.voci_ricalcola_ditte() from public, anon, authenticated;

-- Una volta per istruzione, non per riga: il computo che diventa commessa inserisce centinaia di voci insieme.
drop trigger if exists trg_voci_ricalcola_ditte_ins on public.order_work_phase_voci;
drop trigger if exists trg_voci_ricalcola_ditte_upd on public.order_work_phase_voci;
drop trigger if exists trg_voci_ricalcola_ditte_del on public.order_work_phase_voci;
create trigger trg_voci_ricalcola_ditte_ins after insert on public.order_work_phase_voci
  referencing new table as nuove for each statement execute function public.voci_ricalcola_ditte();
create trigger trg_voci_ricalcola_ditte_upd after update on public.order_work_phase_voci
  referencing new table as nuove old table as vecchie for each statement execute function public.voci_ricalcola_ditte();
create trigger trg_voci_ricalcola_ditte_del after delete on public.order_work_phase_voci
  referencing old table as vecchie for each statement execute function public.voci_ricalcola_ditte();

-- Le ditte a 0 € su lavorazioni con voci e una ditta sola: dal previsto non scritto a quello delle voci.
-- Due istruzioni: dentro una sola, il ricalcolo non vedrebbe ancora l'origine cambiata.
update public.order_external_teams oet
   set costo_origine = 'preventivo'
 where coalesce(oet.cost_preventivo, 0) = 0
   and oet.phase_id is not null and oet.external_team_id is not null
   and coalesce(oet.costo_origine, 'manuale') = 'manuale'
   and exists (select 1 from public.order_work_phase_voci v where v.phase_id = oet.phase_id)
   and (select count(*) from public.order_external_teams x
         where x.phase_id = oet.phase_id and x.external_team_id is not null) = 1;

select public.ditte_ricalcola_previsto(array(
  select distinct phase_id from public.order_external_teams where costo_origine = 'preventivo' and phase_id is not null));
