-- Rendiconto: costo e margine non si leggono più dalla tabella
-- ────────────────────────────────────────────────────────────
-- 27/11/2026. Secondo pezzo della 20290629190000, tenuto a parte perché TOGLIE un permesso:
-- va applicato col via del titolare e dopo aver controllato che nessun altro lettore usi
-- quelle colonne dalla tabella grezza (verificato il 27/11: tutte le funzioni SQL che le
-- leggono sono SECURITY DEFINER, nessuna vista le espone, il browser passa già dalla vista
-- `appalto_rendiconto_righe_visibili`).
--
-- Provato in transazione annullata: come amministratore `select costo_interno` e
-- `select margine` sulla tabella vengono rifiutati, `select descrizione` passa, la vista dà
-- 256,00 € a chi ha «Costi», e anon è fuori da tutto.

-- ── 2. Costo e margine non si leggono più dalla tabella ─────────────────────────

-- Un `select("*")` dal browser sulla tabella grezza ora fallisce per tutti, amministratori
-- compresi: si passa dalla vista. Le scritture (INSERT/UPDATE/DELETE) non cambiano.
revoke select on public.appalto_rendiconto_righe from authenticated;
grant select (
  id, company_id, order_id, data, tariffa_id, descrizione, unita_misura, prezzo_unitario,
  quantita, maggiorazione_pct, importo, employee_id, fase_id, origine, rapportino_id,
  extra_contratto, stato, confermata_da, confermata_at, note, created_by, created_at,
  updated_at, sal_id, voce_libera_id, mezzo_id, rendiconto_giornaliero_id, categoria,
  listino_voce_id, prezzo_fonte, prezzo_a_mano, ordine, subappaltatore_id, da_rapportino_id,
  -- 28/11/2026: le due colonne nate dopo. `viaggio` lo legge l'editor del rendiconto
  -- (COLONNE_RIGHE), `voce_computo_id` la scelta «voce del computo o extra»: senza il GRANT un
  -- select con colonne esplicite fallirebbe e il rendiconto non si aprirebbe più.
  viaggio, voce_computo_id
) on public.appalto_rendiconto_righe to authenticated;
revoke all on public.appalto_rendiconto_righe from anon;
