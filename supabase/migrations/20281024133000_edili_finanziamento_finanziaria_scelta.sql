SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bgn_progetti', 'tet_progetti', 'clm_progetti', 'ele_progetti',
    'idr_progetti', 'pav_progetti', 'pis_progetti', 'rst_progetti'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS finanziamento_tabella_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS finanziamento_tan_pct numeric(7,4)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS finanziamento_rata numeric(12,2)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS finanziamento_importo numeric(12,2)', t);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_finanziamento_tabella_fk');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (finanziamento_tabella_id) REFERENCES public.eic_tabelle_finanziamento(id) ON DELETE SET NULL',
      t, t || '_finanziamento_tabella_fk'
    );
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_finanziamento_scelta_valida');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((finanziamento_tan_pct IS NULL OR finanziamento_tan_pct >= 0) AND (finanziamento_rata IS NULL OR finanziamento_rata >= 0) AND (finanziamento_importo IS NULL OR finanziamento_importo >= 0))',
      t, t || '_finanziamento_scelta_valida'
    );
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.finanziamento_tabella_id IS %L', t,
      'Tabella della finanziaria scelta per questo preventivo (rata nel PDF). NULL = vale la promo del modello (finanziamento_promo).'
    );
  END LOOP;
END $$;
