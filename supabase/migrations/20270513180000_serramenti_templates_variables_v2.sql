-- ════════════════════════════════════════════════════════════════════════════
-- Variabili standard Serramenti v2 — valori reali da feedback cliente
-- ────────────────────────────────────────────────────────────────────────────
-- Ordine + label richiesti dal cliente:
--
--   1) Colore (sort_order 0)
--      • Bianco                 (DEFAULT — il colore più diffuso, base price)
--      • Colore Standard        (qualsiasi RAL nel catalogo standard fornitore)
--      • Colore Fuori Standard  (RAL custom / verniciatura speciale)
--
--   2) Tipologia Vetro (sort_order 1)
--      • Vetro Standard         (DEFAULT — vetrocamera doppia base)
--      • Vetro Antisonoro       (vetrocamera acustica)
--      • Vetro Antisfondamento  (vetro stratificato di sicurezza)
--
-- Zero maggiorazioni preimpostate: il commerciale aggiornerà i prezzi in
-- base ai propri fornitori (caso comune: +€/mq per fuori standard, +20-30%
-- per vetri tecnici).
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.article_family_templates
SET assi_default = '[
  {
    "nome": "Colore",
    "codice": "colore",
    "tipo": "discrete",
    "obbligatorio": true,
    "sort_order": 0,
    "values": [
      { "valore": "bianco",                "label": "Bianco",                "is_default": true,  "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "colore_standard",       "label": "Colore Standard",       "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "colore_fuori_standard", "label": "Colore Fuori Standard", "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 }
    ]
  },
  {
    "nome": "Tipologia Vetro",
    "codice": "tipologia_vetro",
    "tipo": "discrete",
    "obbligatorio": true,
    "sort_order": 1,
    "values": [
      { "valore": "standard",         "label": "Vetro Standard",         "is_default": true,  "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "antisonoro",       "label": "Vetro Antisonoro",       "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "antisfondamento",  "label": "Vetro Antisfondamento",  "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 }
    ]
  }
]'::jsonb
WHERE vertical_slug = 'serramenti';
