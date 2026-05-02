-- Area Campo: consente a operai/subappaltatori di caricare i propri documenti
-- personali solo nel tenant associato al profilo autenticato.
DROP POLICY IF EXISTS dd_insert_self ON public.documenti_dipendenti;

CREATE POLICY dd_insert_self
  ON public.documenti_dipendenti
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );

-- Backward compatible: l'area campo usa la stessa tabella anche per documenti
-- operativi/subappaltatore caricati dal portale campo.
ALTER TABLE public.documenti_dipendenti
  DROP CONSTRAINT IF EXISTS documenti_dipendenti_tipo_check;

ALTER TABLE public.documenti_dipendenti
  ADD CONSTRAINT documenti_dipendenti_tipo_check
  CHECK (tipo IN (
    'contratto_lavoro','formazione_sicurezza','dpi','inail',
    'certificazione','visita_medica','patente','altro',
    'contratto','documento_identita','durc','visura_camerale',
    'polizza_rc','attestazione_soa'
  ));
