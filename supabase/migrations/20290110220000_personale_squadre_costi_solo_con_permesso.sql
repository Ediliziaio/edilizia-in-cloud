-- Costi di personale e ditte: la lettura diretta solo a chi ha il permesso (08/11/2026).
--
-- Va applicata DOPO il client che legge le viste `*_senza_prezzi` (commit e134300be).
-- Stessa regola delle righe commessa. `magazzino_prezzo_acquisto_riga` restituiva il prezzo a
-- chiunque la chiamasse, senza guardare l'azienda: ora chi la chiama direttamente deve vedere i
-- costi di quell'azienda; il trigger del magazzino continua a usarla.
--
-- Nessuna riga viene scritta. CREATE POLICY blocca auth finché la transazione è aperta: va breve.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $migrazione$
declare
  vecchio text := $o$and public.unita_confrontabile(poi.unit_of_measure) = 'pz'$o$;
  nuovo text := $n$and public.unita_confrontabile(poi.unit_of_measure) = 'pz'
       -- Chiamata diretta dal browser: solo chi vede i costi, e nella sua azienda. Il trigger del magazzino passa.
       and (current_setting('request.path', true) is distinct from '/rpc/magazzino_prezzo_acquisto_riga'
            or poi.company_id = any (public.aziende_area(array['can_view_costs','can_manage_purchasing'])::uuid[]))$n$;
  def text := pg_get_functiondef('public.magazzino_prezzo_acquisto_riga(uuid,numeric)'::regprocedure);
begin
  if position('Chiamata diretta dal browser' in def) > 0 then
    return;
  end if;
  if position(vecchio in def) = 0 then
    raise exception 'Pezzo non trovato in magazzino_prezzo_acquisto_riga';
  end if;
  execute replace(def, vecchio, nuovo);
end
$migrazione$;

lock table public.order_employees, public.order_external_teams in access exclusive mode;

drop policy if exists costi_solo_con_permesso on public.order_employees;
create policy costi_solo_con_permesso on public.order_employees as restrictive for select to authenticated
  using (coalesce((select public.acquisti_lettura_non_diretta()), false) or not coalesce((select public.utente_senza_costi_ufficio()), false));

drop policy if exists costi_solo_con_permesso on public.order_external_teams;
create policy costi_solo_con_permesso on public.order_external_teams as restrictive for select to authenticated
  using (coalesce((select public.acquisti_lettura_non_diretta()), false) or not coalesce((select public.utente_senza_costi_ufficio()), false));
