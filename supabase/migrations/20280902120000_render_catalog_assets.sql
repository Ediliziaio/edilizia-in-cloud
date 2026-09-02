-- Catalogo render per azienda: foto dei PRODOTTI dell'azienda (mobili bagno,
-- sanitari, piastrelle, porte, finestre...) da passare al modello immagine
-- come riferimenti etichettati, così il render mostra il prodotto che
-- l'azienda vende davvero e non un prodotto generico.
-- Idempotente: applicabile più volte senza effetti collaterali.

CREATE TABLE IF NOT EXISTS public.render_catalog_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  verticale     text NOT NULL,
  categoria     text NOT NULL,
  etichetta     text NOT NULL,
  descrizione   text,
  storage_path  text NOT NULL,
  larghezza     integer,
  altezza       integer,
  bytes         integer,
  attivo        boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT render_catalog_assets_etichetta_len CHECK (char_length(etichetta) BETWEEN 1 AND 120),
  CONSTRAINT render_catalog_assets_verticale_chk CHECK (verticale IN ('bagno','pavimento','porte','infissi','stanza','esterni'))
);

CREATE INDEX IF NOT EXISTS render_catalog_assets_company_vert_idx
  ON public.render_catalog_assets (company_id, verticale, categoria)
  WHERE attivo;

COMMENT ON TABLE public.render_catalog_assets IS
'Foto prodotto caricate dall''azienda e usate come immagini di riferimento nei render (max 4 per render).';

ALTER TABLE public.render_catalog_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_render_catalog_assets" ON public.render_catalog_assets;
CREATE POLICY "co_render_catalog_assets" ON public.render_catalog_assets
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP TRIGGER IF EXISTS render_catalog_assets_set_updated_at ON public.render_catalog_assets;
CREATE OR REPLACE FUNCTION public.render_catalog_assets_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER render_catalog_assets_set_updated_at
  BEFORE UPDATE ON public.render_catalog_assets
  FOR EACH ROW EXECUTE FUNCTION public.render_catalog_assets_touch_updated_at();

-- Bucket privato: percorso `<company_id>/<uuid>.<ext>`; l'accesso passa dalla
-- stessa funzione degli originali render (company letta dal primo folder).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('render-catalogo', 'render-catalogo', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "render_catalogo_insert" ON storage.objects;
CREATE POLICY "render_catalogo_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'render-catalogo' AND public.can_access_render_storage_object(name));

DROP POLICY IF EXISTS "render_catalogo_select" ON storage.objects;
CREATE POLICY "render_catalogo_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'render-catalogo' AND public.can_access_render_storage_object(name));

DROP POLICY IF EXISTS "render_catalogo_update" ON storage.objects;
CREATE POLICY "render_catalogo_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'render-catalogo' AND public.can_access_render_storage_object(name))
  WITH CHECK (bucket_id = 'render-catalogo' AND public.can_access_render_storage_object(name));

DROP POLICY IF EXISTS "render_catalogo_delete" ON storage.objects;
CREATE POLICY "render_catalogo_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'render-catalogo' AND public.can_access_render_storage_object(name));
