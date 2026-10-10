-- Permessi delle Impostazioni nel database — il cliente del portale non crea righe nelle tabelle interne (1/3: render e rst)
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- Una policy RESTRICTIVE di sola INSERT (blocco_cliente_esterno_inserimento) vieta la creazione di righe al cliente del portale
-- (utente_e_cliente_esterno()) nelle tabelle interne. Le funzioni SECURITY DEFINER e il service role non passano dalla RLS.
-- Il portale clienti non scrive in queste tabelle (il test di contratto lo controlla).

set local lock_timeout = '3s';

do $b$
declare t text;
begin
  foreach t in array array[
    'render_facciata_sessions', 'render_gallery', 'render_pavimento_sessions', 'render_pergole_sessions',
    'render_persiane_sessions', 'render_piscine_sessions', 'render_sessions', 'render_stanza_sessions',
    'render_technical_sessions', 'render_tetto_sessions', 'rst_progetti', 'rst_listino_voci'
  ] loop
    execute format('drop policy if exists blocco_cliente_esterno_inserimento on public.%I', t);
    execute format('create policy blocco_cliente_esterno_inserimento on public.%I as restrictive for insert to authenticated with check (not (select public.utente_e_cliente_esterno()))', t);
  end loop;
end
$b$;
