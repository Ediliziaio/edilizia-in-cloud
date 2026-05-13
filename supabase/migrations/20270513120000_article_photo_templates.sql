-- ============================================================================
-- 20270513 — Article Photo Templates (galleria globale gestita da super_admin)
-- ============================================================================
--
-- BUSINESS CASE
-- Ogni azienda che apre il listino prodotti deve caricare foto degli articoli.
-- Risultato: foto di bassa qualità, ripetitive, da ricercare. Inoltre per
-- onboarding nuove aziende si ripete sempre lo stesso lavoro.
--
-- SOLUZIONE
-- Galleria GLOBALE di foto template, divise per vertical/categoria/tipologia,
-- gestita centralmente dal super_admin EdiliziaInCloud. Ogni azienda puo'
-- selezionare una foto template direttamente quando configura un articolo
-- del listino o una macrocategoria — niente piu' upload manuale per i casi
-- standard.
--
-- ARCHITETTURA
--  - Tabella `article_photo_templates` (no company_id, globale)
--  - Bucket storage `article-photo-templates` (read-public, write-super-admin)
--  - RLS: SELECT aperto a tutti authenticated, mutazioni solo super_admin
--  - Le aziende referenziano via URL (no FK strict) — possono sempre
--    sovrascrivere con upload proprio (immagine_url su family/macro resta
--    libero come ora)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.article_photo_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  descrizione     text,

  -- Tassonomia (slug snake_case, allineati con moduli-vendita/config.ts)
  vertical_slug   text NOT NULL,         -- serramenti / bagno / fotovoltaico / tetti / pompe_calore / cappotto
  categoria_slug  text,                  -- infissi / persiane / tapparelle / sanitari / pannelli ...
  tipologia       text,                  -- finestra_1anta / porta_blindata / pannello_400w ...
  materiale       text,                  -- alluminio / pvc / legno / ceramica ...

  -- Risorse
  image_url       text NOT NULL,         -- URL pubblico (CDN o supabase storage)
  thumbnail_url   text,                  -- versione 200x200 per griglia picker

  -- Discoverability
  tags            text[] NOT NULL DEFAULT '{}',  -- ricerca free-text

  -- Lifecycle
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.article_photo_templates IS
  'Galleria globale foto articoli, gestita solo da super_admin. Le aziende '
  'possono selezionare una foto template direttamente dal picker in FamilyEditor '
  'o nel manager macrocategorie, evitando l''upload manuale per i casi standard.';

-- Indici per filtri tipici del picker
CREATE INDEX IF NOT EXISTS idx_apt_vertical ON public.article_photo_templates(vertical_slug) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_apt_categoria ON public.article_photo_templates(vertical_slug, categoria_slug) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_apt_tipologia ON public.article_photo_templates(tipologia) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_apt_tags ON public.article_photo_templates USING GIN(tags) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_apt_sort ON public.article_photo_templates(sort_order, nome) WHERE is_active = true;

-- Trigger updated_at automatico
CREATE OR REPLACE FUNCTION public.tg_article_photo_templates_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_article_photo_templates_touch ON public.article_photo_templates;
CREATE TRIGGER trg_article_photo_templates_touch
  BEFORE UPDATE ON public.article_photo_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_article_photo_templates_touch();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.article_photo_templates ENABLE ROW LEVEL SECURITY;

-- READ: aperto a tutti gli utenti autenticati (galleria condivisa)
DROP POLICY IF EXISTS apt_select_authenticated ON public.article_photo_templates;
CREATE POLICY apt_select_authenticated ON public.article_photo_templates
  FOR SELECT TO authenticated
  USING (is_active = true);

-- WRITE: solo super_admin (controllo qualità totale)
DROP POLICY IF EXISTS apt_insert_super_admin ON public.article_photo_templates;
CREATE POLICY apt_insert_super_admin ON public.article_photo_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS apt_update_super_admin ON public.article_photo_templates;
CREATE POLICY apt_update_super_admin ON public.article_photo_templates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS apt_delete_super_admin ON public.article_photo_templates;
CREATE POLICY apt_delete_super_admin ON public.article_photo_templates
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- ─── Storage bucket ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-photo-templates', 'article-photo-templates', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: READ pubblico, WRITE solo super_admin
DROP POLICY IF EXISTS "apt_storage_read_public" ON storage.objects;
CREATE POLICY "apt_storage_read_public" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'article-photo-templates');

DROP POLICY IF EXISTS "apt_storage_insert_super_admin" ON storage.objects;
CREATE POLICY "apt_storage_insert_super_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'article-photo-templates'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "apt_storage_update_super_admin" ON storage.objects;
CREATE POLICY "apt_storage_update_super_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'article-photo-templates'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "apt_storage_delete_super_admin" ON storage.objects;
CREATE POLICY "apt_storage_delete_super_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'article-photo-templates'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- ─── Seed iniziale: foto placeholder per i 4 verticali principali ────────────
-- URL placeholder (svgrepo / iconify) usati come fallback prima del seed reale.
-- Il super_admin sostituira' con foto reali dal pannello admin.
INSERT INTO public.article_photo_templates (
  nome, descrizione, vertical_slug, categoria_slug, tipologia, materiale,
  image_url, thumbnail_url, tags, sort_order
) VALUES
  -- ─── SERRAMENTI ────────────────────────────────────────────────────────
  ('Finestra 1 anta battente PVC bianca', 'Finestra a 1 anta con apertura a battente, PVC bianco',
   'serramenti', 'infissi', 'finestra_1anta', 'pvc',
   'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800',
   'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=200',
   ARRAY['finestra','battente','bianca','pvc','1anta'], 10),

  ('Finestra 2 ante anta-ribalta', 'Finestra a 2 ante simmetriche con anta-ribalta',
   'serramenti', 'infissi', 'finestra_2ante', 'pvc',
   'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=800',
   'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=200',
   ARRAY['finestra','anta-ribalta','2ante','pvc'], 20),

  ('Porta-finestra 2 ante alluminio', 'Porta-finestra a 2 ante in alluminio antracite',
   'serramenti', 'infissi', 'porta_finestra_2ante', 'alluminio',
   'https://images.unsplash.com/photo-1556909114-44e3e9399a2e?w=800',
   'https://images.unsplash.com/photo-1556909114-44e3e9399a2e?w=200',
   ARRAY['portafinestra','alluminio','antracite'], 30),

  ('Scorrevole alzante 3 ante', 'Sistema scorrevole alzante a 3 ante grande luce',
   'serramenti', 'infissi', 'scorrevole_alzante_3ante', 'alluminio',
   'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=800',
   'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=200',
   ARRAY['scorrevole','alzante','vetrata','alluminio'], 40),

  ('Porta blindata classe 4', 'Porta blindata di sicurezza classe 4 con pannello rovere',
   'serramenti', 'porte_blindate', 'porta_blindata_1anta', 'acciaio',
   'https://images.unsplash.com/photo-1558637845-c8b7ead71a3e?w=800',
   'https://images.unsplash.com/photo-1558637845-c8b7ead71a3e?w=200',
   ARRAY['blindata','sicurezza','classe4','rovere'], 50),

  ('Persiana battente legno', 'Persiana a battente in legno verniciato',
   'serramenti', 'persiane', 'persiana_battente', 'legno',
   'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800',
   'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=200',
   ARRAY['persiana','battente','legno'], 60),

  ('Tapparella avvolgibile motorizzata', 'Tapparella in alluminio coibentato con motore tubolare',
   'serramenti', 'tapparelle', 'tapparella_avvolgibile', 'alluminio',
   'https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=800',
   'https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=200',
   ARRAY['tapparella','motorizzata','alluminio'], 70),

  ('Zanzariera arrotolabile', 'Zanzariera verticale a rullo con telaio bianco',
   'serramenti', 'zanzariere', 'zanzariera_arrotolabile', 'fibra',
   'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=800',
   'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=200',
   ARRAY['zanzariera','rullo'], 80),

  -- ─── BAGNO ─────────────────────────────────────────────────────────────
  ('WC sospeso ceramica bianca', 'Vaso WC sospeso in ceramica con scarico nascosto',
   'bagno', 'sanitari', 'wc_sospeso', 'ceramica',
   'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800',
   'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=200',
   ARRAY['wc','sospeso','ceramica'], 110),

  ('Lavabo design 60 cm', 'Lavabo da appoggio in ceramica bianca matt',
   'bagno', 'sanitari', 'lavabo_appoggio', 'ceramica',
   'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=800',
   'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=200',
   ARRAY['lavabo','appoggio','design'], 120),

  ('Box doccia angolare 80x80', 'Box doccia angolare con vetro temperato 8mm',
   'bagno', 'box_doccia', 'box_doccia_angolare', 'vetro',
   'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800',
   'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=200',
   ARRAY['doccia','box','angolare','vetro'], 130),

  -- ─── FOTOVOLTAICO ──────────────────────────────────────────────────────
  ('Pannello monocristallino 400W', 'Pannello solare monocristallino half-cut 400Wp',
   'fotovoltaico', 'pannelli', 'pannello_400w', 'silicio',
   'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800',
   'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=200',
   ARRAY['pannello','400w','monocristallino'], 210),

  ('Inverter ibrido 6kW', 'Inverter ibrido trifase 6kW con predisposizione accumulo',
   'fotovoltaico', 'inverter', 'inverter_ibrido_6kw', 'elettronica',
   'https://images.unsplash.com/photo-1497440001374-f26997328c1b?w=800',
   'https://images.unsplash.com/photo-1497440001374-f26997328c1b?w=200',
   ARRAY['inverter','ibrido','6kw','trifase'], 220),

  ('Accumulo agli ioni di litio 10kWh', 'Batteria di accumulo Li-ion 10kWh modulare',
   'fotovoltaico', 'accumuli', 'accumulo_10kwh', 'litio',
   'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800',
   'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=200',
   ARRAY['batteria','accumulo','10kwh'], 230),

  ('Wallbox 7kW monofase', 'Stazione di ricarica per auto elettrica 7kW',
   'fotovoltaico', 'wallbox', 'wallbox_7kw', 'elettronica',
   'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800',
   'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=200',
   ARRAY['wallbox','7kw','ricarica','ev'], 240),

  -- ─── TETTI ─────────────────────────────────────────────────────────────
  ('Tegola portoghese terracotta', 'Tegola portoghese in laterizio cotto terracotta',
   'tetti', 'tegole', 'tegola_portoghese', 'laterizio',
   'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=800',
   'https://images.unsplash.com/photo-1601628828688-632f38a5a7d0?w=200',
   ARRAY['tegola','portoghese','laterizio'], 310),

  ('Membrana EPDM nera 1.2mm', 'Membrana impermeabilizzante EPDM nera 1.2mm',
   'tetti', 'membrane', 'membrana_epdm', 'gomma',
   'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800',
   'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=200',
   ARRAY['membrana','epdm','impermeabile'], 320),

  ('Coibentazione lana di roccia 10cm', 'Pannello in lana di roccia spessore 10cm',
   'tetti', 'coibentazione', 'lana_roccia_10cm', 'lana_roccia',
   'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=800',
   'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=200',
   ARRAY['coibentazione','lana','roccia','10cm'], 330)
ON CONFLICT DO NOTHING;
