-- ════════════════════════════════════════════════════════════════════════════
-- Il prezzo del preventivo scritto a mano
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ
-- C'è chi usa il preventivatore serramenti per avere un bel documento — finestre,
-- foto, descrizioni — ma non carica i prezzi del listino: le voci restano a 0 € e
-- il prezzo lo decide alla fine. Oggi l'unico modo era un prezzo voce per voce, o
-- una riga «a corpo» finta in Composizione offerta.
--
-- Ora, se l'azienda lo accende, nella fase Economia si scrive il prezzo pieno IVA
-- esclusa: prende il posto della somma delle voci, e sopra lavorano sconto e IVA
-- come sempre, così nell'offerta si vedono prezzo, sconto e totale. Il totale
-- salvato sul preventivo (totale_min/max) lo segue, quindi lo vedono anche
-- l'elenco, le opportunità, la pagina del cliente e la commessa che nasce dal
-- preventivo (sr_converti_in_ordine prende totale_max).
--
-- COSA FA
-- 1. sr_progetti.prezzo_manuale: il prezzo scritto. Null = somma delle voci.
-- 2. preventivo_impostazioni.prezzo_finale_a_mano: l'interruttore per azienda,
--    spento per tutti (Impostazioni → Margini → «Prezzo del preventivo»).
-- 3. preventivo_imposta_prezzo_finale_a_mano(): lo accende o lo spegne senza
--    toccare il resto. L'upsert della pagina Margini riscrive tutte le opzioni
--    coi valori mostrati, e una riga creata coi valori predefiniti della tabella
--    avrebbe cambiato il preventivo generico: per chi non ha mai salvato quelle
--    impostazioni i lettori usano altri valori (posa automatica spenta, spese
--    generali a 0, sconti nel PDF secondo generate-quote-pdf…). Una riga nuova
--    nasce quindi coi campi vuoti, che per ogni lettore valgono come «nessuna
--    riga».
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1. Il prezzo scritto sul preventivo
ALTER TABLE public.sr_progetti
  ADD COLUMN IF NOT EXISTS prezzo_manuale numeric;

COMMENT ON COLUMN public.sr_progetti.prezzo_manuale IS
  'Prezzo pieno del preventivo scritto a mano, IVA esclusa: sostituisce la somma delle voci; sconto e IVA si calcolano sopra. Null = somma delle voci.';

ALTER TABLE public.sr_progetti
  DROP CONSTRAINT IF EXISTS sr_progetti_prezzo_manuale_positivo;
ALTER TABLE public.sr_progetti
  ADD CONSTRAINT sr_progetti_prezzo_manuale_positivo
  CHECK (prezzo_manuale IS NULL OR prezzo_manuale > 0);

-- 2. L'interruttore per azienda
ALTER TABLE public.preventivo_impostazioni
  ADD COLUMN IF NOT EXISTS prezzo_finale_a_mano boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.preventivo_impostazioni.prezzo_finale_a_mano IS
  'Se true, nella fase Economia dei preventivatori si può scrivere a mano il prezzo pieno del preventivo (oggi: serramenti).';

-- 3. Accenderlo o spegnerlo senza toccare il resto
CREATE OR REPLACE FUNCTION public.preventivo_imposta_prezzo_finale_a_mano(
  p_company_id uuid,
  p_attivo boolean
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER          -- valgono le regole della tabella: la propria azienda, o il super admin
SET search_path = public
AS $$
  INSERT INTO public.preventivo_impostazioni (
    company_id, prezzo_finale_a_mano,
    visibilita_margini, soglia_margine_visibile, margini_target_categorie,
    margine_target_default, margine_minimo_percentuale, overhead_percentuale,
    aggiungi_posa_automatica, chiedi_piano_installazione, chiedi_smaltimento, chiedi_trasporto,
    pdf_mostra_prezzi_per_riga, pdf_mostra_solo_totale, pdf_mostra_sconti,
    pdf_mostra_immagini, pdf_includi_schede_tecniche,
    firma_digitale_abilitata, firma_richiede_nome,
    numero_prefisso, numero_formato, pdf_watermark_text, pdf_copia_destinatario
  ) VALUES (
    p_company_id, coalesce(p_attivo, false),
    NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, NULL, NULL, NULL
  )
  ON CONFLICT (company_id) DO UPDATE
    SET prezzo_finale_a_mano = excluded.prezzo_finale_a_mano;
$$;

REVOKE ALL ON FUNCTION public.preventivo_imposta_prezzo_finale_a_mano(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preventivo_imposta_prezzo_finale_a_mano(uuid, boolean) TO authenticated;
