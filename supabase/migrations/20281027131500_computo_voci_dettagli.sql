-- I dettagli della voce del computo, uguali negli otto preventivatori edili.
--
-- Una voce oggi ha descrizione, unità, quantità, prezzo, sconto e costi. Mancava tutto quello che serve a
-- controllare il numero, leggere il preventivo per stanza, stimare i tempi e ordinare il materiale:
--   ambiente      dove si lavora (bagno, cucina…). Ristrutturazione ce l'ha già: qui gli altri sette.
--   misure        come si ricava la quantità: righe {descrizione, parti, lunghezza, larghezza, altezza}. La
--                 quantità resta salvata a parte, come numero: le misure servono a controllarla e correggerla.
--   ore_previste  ore-persona della voce scritte da chi conosce il lavoro; vincono sulla stima dal costo.
--   note_interne  una nota che vede solo l'impresa: non va mai nel PDF del cliente.
--   marca, modello  del materiale, per l'ordine al fornitore.
--   opzionale     voce proposta ma non inclusa nel totale (alternativa o extra a scelta del cliente).
--
-- Solo schema, additivo: colonne nulle (opzionale ha un default costante) e nessuna riga viene riscritta, quindi
-- l'ALTER è istantaneo. La RPC computo_salva_atomico mappa le colonne dalle chiavi delle righe: le nuove
-- viaggiano da sole. lock_timeout: meglio fallire che bloccare la produzione.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- bgn
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS ambiente text;
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS misure jsonb;
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS ore_previste numeric(8,2);
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS note_interne text;
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS modello text;
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS opzionale boolean NOT NULL DEFAULT false;

-- tet
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS ambiente text;
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS misure jsonb;
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS ore_previste numeric(8,2);
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS note_interne text;
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS modello text;
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS opzionale boolean NOT NULL DEFAULT false;

-- clm
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS ambiente text;
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS misure jsonb;
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS ore_previste numeric(8,2);
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS note_interne text;
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS modello text;
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS opzionale boolean NOT NULL DEFAULT false;

-- ele
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS ambiente text;
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS misure jsonb;
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS ore_previste numeric(8,2);
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS note_interne text;
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS modello text;
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS opzionale boolean NOT NULL DEFAULT false;

-- idr
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS ambiente text;
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS misure jsonb;
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS ore_previste numeric(8,2);
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS note_interne text;
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS modello text;
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS opzionale boolean NOT NULL DEFAULT false;

-- pav
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS ambiente text;
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS misure jsonb;
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS ore_previste numeric(8,2);
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS note_interne text;
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS modello text;
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS opzionale boolean NOT NULL DEFAULT false;

-- pis
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS ambiente text;
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS misure jsonb;
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS ore_previste numeric(8,2);
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS note_interne text;
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS modello text;
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS opzionale boolean NOT NULL DEFAULT false;

-- rst
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS misure jsonb;
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS ore_previste numeric(8,2);
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS note_interne text;
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS modello text;
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS opzionale boolean NOT NULL DEFAULT false;

-- Controlli sui valori, creati una sola volta (la migrazione si può rilanciare).
DO $$
DECLARE m text;
BEGIN
  FOREACH m IN ARRAY ARRAY['bgn','tet','clm','ele','idr','pav','pis','rst'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = m || '_computo_voci_ore_previste_chk') THEN
      EXECUTE format('ALTER TABLE public.%I_computo_voci ADD CONSTRAINT %I CHECK (ore_previste IS NULL OR (ore_previste >= 0 AND ore_previste <= 100000))', m, m || '_computo_voci_ore_previste_chk');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = m || '_computo_voci_misure_chk') THEN
      EXECUTE format('ALTER TABLE public.%I_computo_voci ADD CONSTRAINT %I CHECK (misure IS NULL OR (jsonb_typeof(misure) = ''array'' AND jsonb_array_length(misure) <= 60))', m, m || '_computo_voci_misure_chk');
    END IF;
  END LOOP;
END $$;
