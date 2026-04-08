-- Render AI Upgrade: render_infissi_presets + render_gallery enhancements
-- Sprint 1: DB schema parity con Edile Genius

-- ── render_infissi_presets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_infissi_presets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  prompt_fragment text NOT NULL,
  icon text,
  colore_ral text,
  colore_ncs text,
  finitura text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.render_infissi_presets ENABLE ROW LEVEL SECURITY;

-- Presets sono globali (leggibili da tutti gli autenticati)
CREATE POLICY "presets_select_all" ON public.render_infissi_presets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sa_presets_all" ON public.render_infissi_presets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_render_presets_category ON public.render_infissi_presets(category, sort_order);

-- ── render_gallery: aggiungi colonne mancanti ───────────────────────
ALTER TABLE public.render_gallery
  ADD COLUMN IF NOT EXISTS config_summary jsonb,
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

-- ── Seed data: render_infissi_presets ──────────────────────────────
INSERT INTO public.render_infissi_presets (category, name, value, prompt_fragment, icon, sort_order) VALUES
-- MATERIALE TELAIO
('materiale', 'PVC',           'pvc',              'PVC window frame — polymer vinyl profile, smooth matte surface, standard residential quality',                                    '🏠', 10),
('materiale', 'Alluminio',     'alluminio',         'Aluminium window frame — extruded aluminum profile with thermal break, slim sight lines, powder-coated surface',                   '✨', 20),
('materiale', 'Legno',         'legno',             'Timber window frame — solid wood profile, natural grain visible, traditional joinery at corners',                                   '🌳', 30),
('materiale', 'Legno-Alu',     'legno_alluminio',   'Timber-aluminium composite frame — wood interior, aluminium exterior cladding, premium hybrid construction',                        '🌿', 40),
('materiale', 'Acciaio Corten','acciaio_corten',    'Corten weathering steel frame — rust-orange patina, ultra-slim sight lines, industrial premium aesthetic',                          '🔴', 50),
('materiale', 'Acciaio Min.',  'acciaio_minimale',  'Minimal steel frame — ultra-thin sight lines 15-25mm, matte black powder-coat, nearly frameless appearance',                       '⬛', 60),

-- STILE PROFILO
('stile', 'Classico',          'classico_arrotondato',         'Classic rounded profile — traditional residential proportions, softly rounded edges radius 3-5mm, wider sight lines 55-70mm', '⬭', 10),
('stile', 'Europeo',           'europeo_classico',              'Classic European profile — traditional rebate, slight outer bevel, standard European joinery style',                           '◻',  20),
('stile', 'Minimal',           'minimal_squadrato',             'Minimal squared profile — ultra-thin sight lines 35-45mm, sharp 90° edges with no rounding, Bauhaus-inspired',               '□',  30),
('stile', 'Nodo Ridotto',      'nodo_ridotto',                  'Reduced-node (nodo ridotto) profile — sash nearly flush with outer frame, minimal step 3-5mm, maximizes glass area',         '▭',  40),
('stile', 'Nodo + Centrale',   'nodo_ridotto_maniglia_centrale','Nodo ridotto with center-placed handle — flush geometry, lever at exact vertical center of sash height',                     '┰',  50),
('stile', 'Arco',              'arco_sagomato',                 'Arched/shaped profile — frame following curved opening geometry, classical architectural style',                               '⌒', 60),

-- TIPO VETRO
('vetro', 'Doppio B.E.',       'doppio_basso_emissivo',         'Double-glazed low-emissivity (low-e) unit — 4mm/16mm argon/4mm configuration, thin soft-coat metallic low-e layer on inner pane inner face, slight blue-grey reflective tint, warm-edge spacer bar, Uw approximately 1.1 W/m²K',                                                         '🔵', 10),
('vetro', 'Triplo',            'triplo',                        'Triple-glazed insulating unit — 4mm/14mm argon/4mm/14mm argon/4mm configuration, two low-e coatings, barely-visible double spacer bar at perimeter, very slight reflective surface, Uw approximately 0.7 W/m²K',                                                                        '❄️', 20),
('vetro', 'Doppio Std',        'doppio_standard',               'Standard double-glazed unit — 4mm/12mm air/4mm configuration, clear float glass, standard aluminum spacer bar, slightly more reflective than low-e, Uw approximately 2.8 W/m²K',                                                                                                          '🪟', 30),
('vetro', 'Trasp. Satinato',   'trasparente_satinato',          'Satin-acid-etched glass — fully translucent but not transparent, frosted appearance from both sides, natural light transmitted with total privacy, no clear vision through glass, uniform bright white diffused appearance',                                                                '🌫️', 40),
('vetro', 'Riflettente',       'riflettente',                   'Solar-control reflective glass — metallic mirror-like exterior surface with strong specular reflection of sky and surroundings, dark interior (room interior completely hidden), reduces solar gain significantly, modern commercial aesthetic',                                            '🪞', 50),

-- CASSONETTO MATERIALE
('cassonetto_materiale', 'PVC Standard', 'pvc_tradizionale',   'traditional PVC roller shutter housing — rectangular box protruding 160-200mm, smooth matte PVC surface, shutter exit slot visible at bottom',                          '📦', 10),
('cassonetto_materiale', 'PVC Slim',     'pvc_slim',           'slim-profile PVC cassonetto — reduced 110-130mm height, contemporary proportions, minimal facade intrusion',                                                             '📦', 20),
('cassonetto_materiale', 'A Muro',       'pvc_integrato',      'wall-integrated cassonetto — fully recessed into masonry, only thin inspection strip visible, virtually invisible from exterior',                                        '🧱', 30),
('cassonetto_materiale', 'Alluminio',    'alluminio_coibentato','insulated aluminum cassonetto — aluminum face panels powder-coated, crisp machined edges, polyurethane foam fill, professional thermal appearance',                     '✨', 40),

-- TAPPARELLA MATERIALE
('tapparella_materiale', 'PVC Avvol.',   'pvc_avvolgibile',    'PVC roll-up shutter curtain — horizontal PVC slats 37-55mm, smooth matte surface, guide channels on sides, bottom end-rail with rubber seal',                          '🔽', 10),
('tapparella_materiale', 'Allum. Avv.',  'alluminio_avvolgibile','aluminum roll-up shutter curtain — foam-filled extruded aluminum slats, metallic sheen, crisp slat-to-slat joints, matching aluminum guides',                        '🔽', 20),
('tapparella_materiale', 'Microfor.',    'microforata',        'microperforated roll-up shutter — same profile with circular perforations 3-4mm at 6-8mm centers, privacy while allowing partial light',                                 '⣿', 30),
('tapparella_materiale', 'Persiana',     'persiana_alluminio', 'aluminum louvered shutter — S-curve slats 60-80mm, pivot pins at ends, traditional Mediterranean aesthetic',                                                            '🪟', 40),
('tapparella_materiale', 'Veneziana',    'veneziana_integrata','integral venetian blind between glazing — thin horizontal slats between panes, operated by external thumb-wheel, ultra-minimal appearance',                              '▦', 50)

ON CONFLICT DO NOTHING;
