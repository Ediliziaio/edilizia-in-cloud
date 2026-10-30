-- Ditte e subappaltatori: IVA 0, reverse charge (31/10/2026).
--
-- Dimora Torino: «nei costi delle fasi mi conta anche l'IVA dei subappaltatori,
-- e non va bene». Nel subappalto edile la fattura è in reverse charge (art. 17,
-- c. 6, lett. a, DPR 633/72): l'impresa paga l'imponibile e basta. Le ditte
-- nascevano invece con IVA 22% e il previsto si scriveva «IVA inclusa»: il
-- listino e le voci del preventivo (senza IVA) venivano moltiplicati per 1,22,
-- e i numeri scritti a mano venivano divisi per 1,22 nei margini.
--
-- Cosa cambia.
--   · La ditta nasce con IVA 0 (reverse charge). Chi fattura con IVA (non è in
--     reverse charge) la cambia nella scheda della ditta.
--   · L'assegnazione prende l'IVA dalla sua ditta, se chi la scrive non la dice.
--   · Le 157 assegnazioni esistenti (3 aziende, tutte rimaste al 22 di default):
--     IVA 0; i previsti calcolati dal listino o dal preventivo (× 1,22) tornano
--     al netto. Quelli scritti a mano restano come scritti: era l'imponibile.
-- Tutte le letture dividono già per (1 + IVA/100): con IVA 0 l'importo vale così com'è.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.external_teams alter column vat_rate set default 0;
alter table public.order_external_teams alter column vat_rate drop default;

create or replace function public.oet_iva_dalla_ditta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vat_rate is null then
    select t.vat_rate into new.vat_rate from public.external_teams t where t.id = new.external_team_id;
    new.vat_rate := coalesce(new.vat_rate, 0);
  end if;
  return new;
end $$;
revoke all on function public.oet_iva_dalla_ditta() from public, anon, authenticated;

drop trigger if exists trg_oet_iva_dalla_ditta on public.order_external_teams;
create trigger trg_oet_iva_dalla_ditta
  before insert on public.order_external_teams
  for each row execute function public.oet_iva_dalla_ditta();

update public.order_external_teams
   set cost_preventivo = case
         when costo_origine in ('listino', 'preventivo') and cost_preventivo is not null
           then round(cost_preventivo / (1 + vat_rate / 100), 2)
         else cost_preventivo
       end,
       vat_rate = 0
 where vat_rate is distinct from 0;

update public.external_teams set vat_rate = 0 where vat_rate = 22;
