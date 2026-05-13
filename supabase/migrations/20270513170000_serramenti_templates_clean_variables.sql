-- ════════════════════════════════════════════════════════════════════════════
-- Pulizia template Serramenti — feedback cliente
-- ────────────────────────────────────────────────────────────────────────────
-- 1. Rimuovi `materiale` (pvc/alluminio) dai template — l'azienda imposta
--    questo dato manualmente, non vogliamo bias.
-- 2. Aggiorna `assi_default` con le 2 variabili standard concordate:
--      • Tipologia Vetro (codice: tipologia_vetro)
--      • Colore         (codice: colore)
--    Sostituisce il singolo asse "Vetro" del seed precedente.
--
-- IVA, modalità prezzo, unità di misura RESTANO come default
-- (22%, griglia, pz) perché sono sensible default che l'azienda
-- modifica caso-per-caso in Step 2 del wizard articolo.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Materiale NULL su TUTTI i template Serramenti
UPDATE public.article_family_templates
SET materiale = NULL
WHERE vertical_slug = 'serramenti';

-- 2) Assi standard: Tipologia Vetro + Colore
--    JSON minimal (no maggiorazioni: sarà l'azienda a definire i prezzi).
--    Default values lasciati flag is_default=true sul primo valore di ogni
--    asse, in modo che il wizard articolo abbia subito una variante base.
UPDATE public.article_family_templates
SET assi_default = '[
  {
    "nome": "Tipologia Vetro",
    "codice": "tipologia_vetro",
    "tipo": "discrete",
    "obbligatorio": true,
    "sort_order": 0,
    "values": [
      { "valore": "doppio", "label": "Vetrocamera doppia",  "is_default": true,  "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "triplo", "label": "Vetrocamera tripla",  "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 }
    ]
  },
  {
    "nome": "Colore",
    "codice": "colore",
    "tipo": "discrete",
    "obbligatorio": true,
    "sort_order": 1,
    "values": [
      { "valore": "bianco",        "label": "Bianco",        "is_default": true,  "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "antracite",     "label": "Antracite",     "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "marrone",       "label": "Marrone",       "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "grigio",        "label": "Grigio",        "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 },
      { "valore": "ral_custom",    "label": "Altro RAL",     "is_default": false, "maggiorazione_tipo": "none", "maggiorazione_valore": 0 }
    ]
  }
]'::jsonb
WHERE vertical_slug = 'serramenti';
