-- Schede tecniche / documenti PDF MULTIPLI per articolo del catalogo
-- fotovoltaico (articoli_native), accanto alla colonna singola
-- scheda_tecnica_url (che resta valida). Ogni documento ha un flag «autorizzata»:
-- se true, viene accodato come PAGINE INTERE nel PDF del preventivo dei prodotti
-- che lo usano. RLS a specchio di articoli_native: azienda efficace, mai clienti
-- esterni, scrittura ai ruoli che editano il listino (o super_admin). Riusa il
-- bucket pubblico article-pdfs (già delle schede article_families).
-- Tutto additivo: nessuna riga esistente cambia.
CREATE TABLE IF NOT EXISTS public.articoli_native_documenti (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  articolo_id  uuid NOT NULL REFERENCES public.articoli_native(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  url          text NOT NULL,
  tipo         text NOT NULL DEFAULT 'scheda_tecnica',  -- scheda_tecnica | certificazione | garanzia | altro
  autorizzata  boolean NOT NULL DEFAULT true,           -- true = accodata al PDF del preventivo
  ordine       integer NOT NULL DEFAULT 0,
  file_size    integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_and_articolo ON public.articoli_native_documenti(articolo_id);
CREATE INDEX IF NOT EXISTS idx_and_company  ON public.articoli_native_documenti(company_id);

ALTER TABLE public.articoli_native_documenti ENABLE ROW LEVEL SECURITY;

-- Lettura: come articoli_native (azienda efficace, no clienti esterni).
DROP POLICY IF EXISTS and_lettura ON public.articoli_native_documenti;
CREATE POLICY and_lettura ON public.articoli_native_documenti
  FOR SELECT USING (
    company_id = (SELECT public.get_effective_company_id())
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );

-- Scrittura: come articoli_native_scrittura (ruoli listino o super_admin).
DROP POLICY IF EXISTS and_scrittura ON public.articoli_native_documenti;
CREATE POLICY and_scrittura ON public.articoli_native_documenti
  FOR ALL USING (
    company_id = (SELECT public.get_effective_company_id())
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND (
      company_id IN (SELECT unnest(public.aziende_con_uno_dei_permessi(ARRAY['can_edit_settings_pricing', 'can_view_billing', 'can_edit_marketing_opportunities'])))
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
    )
  ) WITH CHECK (
    company_id = (SELECT public.get_effective_company_id())
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND (
      company_id IN (SELECT unnest(public.aziende_con_uno_dei_permessi(ARRAY['can_edit_settings_pricing', 'can_view_billing', 'can_edit_marketing_opportunities'])))
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::app_role))
    )
  );

-- Utente bloccato: nessuna operazione (come articoli_native).
DROP POLICY IF EXISTS and_blocco_utente_bloccato ON public.articoli_native_documenti;
CREATE POLICY and_blocco_utente_bloccato ON public.articoli_native_documenti
  FOR ALL USING (NOT (SELECT public.utente_bloccato()))
  WITH CHECK (NOT (SELECT public.utente_bloccato()));
