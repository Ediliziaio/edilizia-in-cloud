// shared/render-window/catalog.ts — v8.3 (2026-05-14)
// CHANGELOG v8.3:
//   + Mazzetta colori PVC ESPANSA al listino reale (21 classici + 3 Touch)
//   + WIZARD_LEGNO espanso a 6 effetti legno con corrispondenza foto reale
//   + Ogni voce WIZARD_RAL / WIZARD_LEGNO / WIZARD_HANDLE_TYPES ha previewImageUrl
//   + Nuovo helper getReferenceImageUrl per costruire URL completo Supabase Storage
//   + La UI wizard ora mostra le FOTO REALI invece dei gradient CSS
//
// CHANGELOG v8.2:
//   + computeHandleSpec / regola universale numero maniglie (1 per F2A, 2 per F3A)
// CHANGELOG v8.1:
//   + WIZARD_NODO_OPTIONS (simmetrico | asimmetrico | maniglia_centrale)
// CHANGELOG v8:
//   + WIZARD_TRAVERSO_OPTIONS + WIZARD_CERNIERE_OPTIONS

// ─────────────────────────────────────────────────────────────────────────────
// Reference images: URL builder
// Le foto sono caricate su Supabase Storage bucket "render-references"
// Struttura: render-references/{colors|profiles|handles|accessories}/<filename>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * URL base per le 43 foto reference render AI (mazzette colori, maniglie, profili,
 * accessori, esempi). v8.3 — Servite direttamente da Cloudflare Pages CDN dalla
 * cartella `public/render-references/` invece che da Supabase Storage.
 *
 * Vantaggi servire da public/:
 *   - Zero dipendenze da SERVICE_ROLE_KEY per upload
 *   - CDN Cloudflare cache automatico (TTL lungo)
 *   - Deploy atomico con il frontend (no out-of-sync)
 *   - Stessa origin del sito → no CORS issues
 *
 * Sovrascrivibile via env `VITE_RENDER_REFERENCES_BASE_URL` (frontend) o
 * `RENDER_REFERENCES_BASE_URL` (edge functions) per supportare CDN alternativi
 * o Supabase Storage in setup multi-tenant futuri.
 */
// v8.6.18 — Type-safe cross-runtime detection. Sostituiti i 5 cast `as any`
// con type guards che soddisfano TypeScript strict E ESLint no-explicit-any.
type ViteImportMeta = { env?: { VITE_RENDER_REFERENCES_BASE_URL?: string } };
type DenoGlobal = { Deno?: { env: { get: (key: string) => string | undefined } } };

function getReferencesBaseUrl(): string {
  // Frontend (Vite)
  const meta = (typeof import.meta !== "undefined" ? import.meta : undefined) as
    | (ImportMeta & ViteImportMeta)
    | undefined;
  if (meta?.env?.VITE_RENDER_REFERENCES_BASE_URL) {
    return meta.env.VITE_RENDER_REFERENCES_BASE_URL;
  }
  // Edge function (Deno)
  const deno = (globalThis as unknown as DenoGlobal).Deno;
  if (deno) {
    const envUrl = deno.env.get("RENDER_REFERENCES_BASE_URL");
    if (envUrl) return envUrl;
    const siteUrl = deno.env.get("SITE_URL");
    if (siteUrl) return `${siteUrl.replace(/\/+$/, "")}/render-references`;
    // v8.5.2 FIX BUG CRITICO: il default era "app.ediliziaincloud.it" che
    // NON RISOLVE via DNS → fetch reference images falliva silenziosamente
    // → Gemini riceveva 0 reference photos → si comportava da "recolor"
    // invece di "replace". Default produzione: dominio Cloudflare Pages reale.
    return "https://edilizia-in-cloud.pages.dev/render-references";
  }
  // Default frontend: serve da Cloudflare Pages CDN (stessa origin del sito).
  return "/render-references";
}

/** Categorizza il filename e restituisce l'URL completo Supabase Storage. */
export function getReferenceImageUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = getReferencesBaseUrl();
  if (filename.startsWith("Maniglia-")) return `${base}/handles/${filename}`;
  if (filename.startsWith("Profilo-")) return `${base}/profiles/${filename}`;
  if (filename.startsWith("Bottone-") || filename.startsWith("Cassonetto-")) {
    return `${base}/accessories/${filename}`;
  }
  if (
    filename.startsWith("Cucina-") ||
    filename.startsWith("Finestra-") ||
    filename.startsWith("Portafinestra-") ||
    filename.startsWith("Prima-Dopo-")
  ) {
    return `${base}/examples/${filename}`;
  }
  // Default: mazzette colori (file con codice prodotto o "Avorio-/Bianco-/...-massa")
  return `${base}/colors/${filename}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOLOGIE FINESTRA
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_TIPI = [
  { id: "F1A", label: "Finestra 1 anta", shortLabel: "F1A", desc: "Finestra battente a un'anta, vano standard." },
  { id: "F2A", label: "Finestra 2 ante", shortLabel: "F2A", desc: "Finestra battente a due ante, configurazione più comune." },
  { id: "F3A", label: "Finestra 3 ante", shortLabel: "F3A", desc: "Finestra a tre ante per aperture ampie." },
  { id: "PF1A", label: "Portafinestra 1 anta", shortLabel: "PF1A", desc: "Portafinestra a un'anta con soglia bassa." },
  { id: "PF2A", label: "Portafinestra 2 ante", shortLabel: "PF2A", desc: "Portafinestra a due ante per balconi e terrazzi." },
  { id: "PF3A", label: "Portafinestra 3 ante", shortLabel: "PF3A", desc: "Portafinestra a tre ante per vani molto ampi." },
  { id: "SCORR", label: "Scorrevole / Alzante", shortLabel: "SCORR", desc: "Scorrevole o alzante scorrevole con profilo dedicato." },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PROFILI MATERIALE
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_PROFILI = [
  { id: "pvc", label: "PVC", desc: "Profilo isolante classico 70-80 mm, adatto a sostituzione residenziale." },
  { id: "alluminio", label: "Alluminio", desc: "Estruso 55 mm, proporzioni più snelle, thermal break a vista." },
  { id: "minimal", label: "Alluminio Minimal", desc: "Profilo architettonico ultra-sottile 45 mm con sightline minimale (look premium)." },
  { id: "legno", label: "Legno", desc: "Resa calda e tradizionale con profilo 82 mm più materico." },
  { id: "legno_alluminio", label: "Legno-Alluminio", desc: "Legno interno 82 mm + protezione alluminio esterna." },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// NODO (configurazione ante centrali) — v8.1
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_NODO_OPTIONS = [
  {
    id: "simmetrico",
    label: "Nodo simmetrico (classico)",
    desc: "Ante uguali, doppio montante centrale (~110 mm). Soluzione standard residenziale.",
    icon: "◧◨",
    referenceImage: "Profilo-PVC-2ante-Nodo-Simmetrico-Effetto-Legno.jpeg",
  },
  {
    id: "asimmetrico",
    label: "Nodo asimmetrico (ridotto)",
    desc: "Anta principale + anta secondaria con palettone. Nodo centrale visibilmente più sottile (~70 mm). Più vetro.",
    icon: "▎▌",
    upsell: true,
    referenceImage: "Profilo-PVC-2ante-Nodo-Asimmetrico-Bianco.jpeg",
  },
  {
    id: "maniglia_centrale",
    label: "Maniglia centrale",
    desc: "Variante asimmetrica con UNA SOLA maniglia montata sul palettone al centro. Solo per finestre a 2 ante.",
    icon: "◯",
    upsell: true,
    referenceImage: "Profilo-PVC-2ante-Maniglia-Centrale-Bianco.jpeg",
  },
] as const;

export const PROFILI_NODO_ASIMMETRICO_COMPATIBILI = [
  "pvc",
  "alluminio",
  "minimal",
  "legno_alluminio",
] as const;

/** @deprecated v8.1 — usa PROFILI_NODO_ASIMMETRICO_COMPATIBILI. */
export const PROFILI_MANIGLIA_CENTRALE_COMPATIBILI = PROFILI_NODO_ASIMMETRICO_COMPATIBILI;

// ─────────────────────────────────────────────────────────────────────────────
// MAZZETTA COLORI PVC — v8.3
// Listino reale Vetrocom-style: 21 colori finitura classica + Touch
// Ogni voce ha previewImageUrl che linka allo swatch fotografico reale
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_RAL = [
  // ── Colori base massa ──
  { id: "bianco_massa", code: null, nome: "Bianco massa", hex: "#F7F5E8",
    family: "bianchi", referenceImage: "Bianco-massa-Colore-base-PVC.webp" },
  { id: "avorio_massa", code: null, nome: "Avorio massa", hex: "#F0E8D0",
    family: "bianchi", referenceImage: "Avorio-massa-Colore-base-PVC.webp" },
  { id: "508_crema_avorio", code: "508", nome: "Crema Avorio Pellicolato", hex: "#EFE4C8",
    family: "bianchi", referenceImage: "508-Crema-Avorio-Pellicolato-Finitura-classica-PVC.webp" },

  // ── Grigi ──
  { id: "20_grigio_argento", code: "20", nome: "Grigio Argento", hex: "#B8BBB8",
    family: "grigi", referenceImage: "20-Grigio-Argento-Finitura-classica-PVC.webp" },
  { id: "1009_grigio_ardesia", code: "1009", nome: "Grigio Ardesia", hex: "#54585A",
    family: "grigi", referenceImage: "1009-Grigio-Ardesia-Finitura-classica-PVC.webp" },
  // ── Marroni scuri pellicolati (no texture legno pronunciata) ──
  // v8.6.15 — Shogun AF/AD spostati definitivamente in WIZARD_LEGNO perché
  // sono PELLICOLATURE WOOD-EFFECT, non semplici colori marroni piatti.
  { id: "13_testa_di_moro", code: "13", nome: "Testa di Moro", hex: "#3E2A1A",
    family: "marroni", referenceImage: "13-Testa-di-Moro-Finitura-classica-PVC.webp" },
  { id: "130_marrone_nero", code: "130", nome: "Marrone Nero", hex: "#2A1810",
    family: "marroni", referenceImage: "130-Marrone-Nero-Finitura-classica-PVC.webp" },

  // ── Blu ──
  { id: "135_blu_cobalto", code: "135", nome: "Blu Cobalto", hex: "#1B3B6F",
    family: "blu", referenceImage: "135-Blu-Cobalto-Finitura-classica-PVC.webp" },
  { id: "220_blu_acciaio", code: "220", nome: "Blu Acciaio", hex: "#2E4A6B",
    family: "blu", referenceImage: "220-Blu-Acciaio-Finitura-classica-PVC.webp" },
  { id: "5010_blu_genziana", code: "5010", nome: "Blu Genziana (RAL 5010)", hex: "#0E294B",
    family: "blu", referenceImage: null },
  { id: "5003_blu_zaffiro", code: "5003", nome: "Blu Zaffiro (RAL 5003)", hex: "#1B2D44",
    family: "blu", referenceImage: null },
  { id: "5014_blu_colomba", code: "5014", nome: "Blu Colomba (RAL 5014)", hex: "#637D96",
    family: "blu", referenceImage: null },

  // ── Rossi ──
  { id: "136_rosso_rubino", code: "136", nome: "Rosso Rubino", hex: "#7A1F2C",
    family: "rossi", referenceImage: "136-Rosso-Rubino-Finitura-classica-PVC.webp" },
  { id: "137_rosso_vino", code: "137", nome: "Rosso Vino", hex: "#5E2028",
    family: "rossi", referenceImage: "137-Rosso-Vino-Finitura-classica-PVC.webp" },
  { id: "3003_rosso_rubino_ral", code: "3003", nome: "Rosso Rubino (RAL 3003)", hex: "#9B111E",
    family: "rossi", referenceImage: null },
  { id: "3005_rosso_vino_ral", code: "3005", nome: "Rosso Vino (RAL 3005)", hex: "#5E2129",
    family: "rossi", referenceImage: null },
  { id: "3011_rosso_marrone", code: "3011", nome: "Rosso Marrone (RAL 3011)", hex: "#781F19",
    family: "rossi", referenceImage: null },

  // ── Verdi ──
  { id: "6005_verde_muschio", code: "6005", nome: "Verde Muschio (RAL 6005)", hex: "#114232",
    family: "verdi", referenceImage: null },
  { id: "6009_verde_abete", code: "6009", nome: "Verde Abete (RAL 6009)", hex: "#27352A",
    family: "verdi", referenceImage: null },
  { id: "6021_verde_pallido", code: "6021", nome: "Verde Pallido (RAL 6021)", hex: "#89A86B",
    family: "verdi", referenceImage: null },
  { id: "6029_verde_menta", code: "6029", nome: "Verde Menta (RAL 6029)", hex: "#20603D",
    family: "verdi", referenceImage: null },

  // v8.6.14 — Espansione catalogo Serbaplast: colori finitura classica più richiesti.
  // Foto reference non ancora disponibili (referenceImage: null) — UI mostra swatch CSS.
  // ── Bianchi/Avori aggiuntivi ──
  { id: "21_bianco_pellicolato", code: "21", nome: "Bianco Pellicolato", hex: "#F5F2EB",
    family: "bianchi", referenceImage: null },
  { id: "1004_avorio", code: "1004", nome: "Avorio", hex: "#E8DCC0",
    family: "bianchi", referenceImage: null },
  { id: "131_bianco_papiro", code: "131", nome: "Bianco Papiro", hex: "#EFEAD8",
    family: "bianchi", referenceImage: null },
  // ── Grigi aggiuntivi (essenziali) ──
  { id: "86_grigio_antracite", code: "86", nome: "Grigio Antracite", hex: "#3C4248",
    family: "grigi", referenceImage: null },
  { id: "88_grigio_agata", code: "88", nome: "Grigio Agata", hex: "#828A8C",
    family: "grigi", referenceImage: null },
  { id: "133_grigio_luce", code: "133", nome: "Grigio Luce", hex: "#B5B8B5",
    family: "grigi", referenceImage: null },
  { id: "227_grigio_basalto", code: "227", nome: "Grigio Basalto", hex: "#4A4D52",
    family: "grigi", referenceImage: null },
  { id: "514_grigio_quarzo", code: "514", nome: "Grigio Quarzo", hex: "#7C7E7E",
    family: "grigi", referenceImage: null },
  // ── Marroni / Effetti legno classici aggiuntivi ──
  { id: "228_winchester", code: "228", nome: "Winchester", hex: "#5A3825",
    family: "marroni", referenceImage: null },
  { id: "221_siena_rosso", code: "221", nome: "Siena Rosso", hex: "#7A2A14",
    family: "marroni", referenceImage: null },
  { id: "226_siena_noce", code: "226", nome: "Siena Noce", hex: "#5C3B22",
    family: "marroni", referenceImage: null },
  // ── Blu aggiuntivo ──
  { id: "132_blu_brillante", code: "132", nome: "Blu Brillante", hex: "#1E4D7B",
    family: "blu", referenceImage: null },
  // ── Premium / Touch Feinstruktur goffrati (espansi) ──
  { id: "1300_feinstruktur_antracite", code: "1300", nome: "Feinstruktur Grigio Antracite (Touch goffrato)",
    hex: "#383E42", family: "premium", touch: "goffrato", upsell: true, referenceImage: null },
  { id: "1302_feinstruktur_ardesia", code: "1302", nome: "Feinstruktur Grigio Ardesia (Touch goffrato)",
    hex: "#5A5E63", family: "premium", touch: "goffrato", upsell: true, referenceImage: null },
  { id: "1307_feinstruktur_bianco", code: "1307", nome: "Feinstruktur Bianco (Touch goffrato)",
    hex: "#EFEDE5", family: "premium", touch: "goffrato", upsell: true, referenceImage: null },

  // ── Touch Premium (effetto goffrato / strutturato) ──
  { id: "1301_feinstruktur_nero", code: "1301", nome: "Feinstruktur Nero (Touch goffrato)", hex: "#1C1C1C",
    family: "premium", touch: "goffrato", upsell: true,
    referenceImage: "1301-Feinstruktur-Nero-Finitura-Touch-effetto-goffrato.webp" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// EFFETTI LEGNO — v8.3 ESPANSO
// Mix di finiture classica PVC pellicolato + Touch effetto spazzolato premium
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_LEGNO = [
  {
    id: "noce",
    code: "26",
    nome: "Noce",
    hex: "#6B4226",
    grad: "linear-gradient(135deg,#8B5E3C,#5C3317)",
    grain: "rgba(67,39,21,0.35)",
    accent: "rgba(181,132,87,0.22)",
    fragment: "walnut wood-effect laminate with dark brown tone and visible longitudinal grain",
    referenceImage: "26-Noce-Finitura-classica-PVC.webp",
  },
  {
    id: "mogano",
    code: "14",
    nome: "Mogano",
    hex: "#4A1F14",
    grad: "linear-gradient(135deg,#6B2818,#3A1810)",
    grain: "rgba(40,16,8,0.32)",
    accent: "rgba(150,60,40,0.18)",
    fragment: "mahogany wood-effect laminate with rich dark red-brown tone and fine grain",
    referenceImage: "14-Mogano-Finitura-classica-PVC.webp",
  },
  {
    id: "macore",
    code: "1006",
    nome: "Macore",
    hex: "#4A1612",
    grad: "linear-gradient(135deg,#6A1F18,#3A0E0A)",
    grain: "rgba(30,8,5,0.42)",
    accent: "rgba(150,50,35,0.20)",
    // v8.6.1 — Fragment rinforzato: macore reale e' un legno tropicale africano
    // DENSO e SCURO, tono mogano-sangue molto piu' profondo del ciliegio.
    // Il render precedente lo faceva troppo chiaro (sembrava noce medio).
    fragment:
      "MACORE wood-effect laminate (Italian PVC code 1006): DEEP DARK red-brown " +
      "mahogany-blood tone, MUCH DARKER than cherry or walnut. Color is intense " +
      "burgundy-mahogany with low brightness — closer to a dried-blood / wenge-red " +
      "than to a warm honey tone. Visible horizontal ribbon-grain bands with subtle " +
      "interlocked figure. Surface is matte satin. NOT a light brown, NOT a honey " +
      "color, NOT a ciliegio — this is a PREMIUM DARK exotic-wood finish.",
    referenceImage: "1006-Macore-Finitura-classica-PVC.webp",
  },
  {
    id: "quercia_scura",
    code: "16",
    nome: "Quercia Scura",
    hex: "#4A2E1A",
    grad: "linear-gradient(135deg,#6B432A,#3E2418)",
    grain: "rgba(40,24,12,0.34)",
    accent: "rgba(160,110,70,0.20)",
    fragment: "dark oak wood-effect laminate with strong dark-brown tone and pronounced rugged grain",
    referenceImage: "16-Quercia-Scura-Finitura-classica-PVC.webp",
  },
  {
    id: "ciliegio",
    code: "25",
    nome: "Ciliegio",
    hex: "#9B3D12",
    grad: "linear-gradient(135deg,#B5451C,#7A2E0A)",
    grain: "rgba(98,37,13,0.28)",
    accent: "rgba(205,102,56,0.2)",
    fragment: "cherry wood-effect laminate with reddish brown tone and fine straight grain",
    referenceImage: "25-Ciliegio-Finitura-classica-PVC.webp",
  },
  {
    id: "douglas",
    code: "18",
    nome: "Douglas",
    hex: "#C4956A",
    grad: "linear-gradient(135deg,#D4A574,#A07848)",
    grain: "rgba(122,84,42,0.24)",
    accent: "rgba(255,221,179,0.18)",
    fragment: "douglas fir wood-effect laminate with honey tone and clear growth-ring pattern",
    referenceImage: "18-Douglas-Finitura-classica-PVC.webp",
  },
  {
    id: "douglas_rosso",
    code: "27",
    nome: "Douglas Rosso",
    hex: "#A86438",
    grad: "linear-gradient(135deg,#B57046,#8A4A28)",
    grain: "rgba(100,52,20,0.28)",
    accent: "rgba(220,140,90,0.18)",
    fragment: "red douglas fir wood-effect laminate with warm orange-brown tone and visible grain",
    referenceImage: "27-Douglas-Rosso-Finitura-classica-PVC.webp",
  },
  {
    id: "oregon",
    code: "22",
    nome: "Oregon",
    hex: "#B88F5C",
    grad: "linear-gradient(135deg,#C8A270,#9C7548)",
    grain: "rgba(110,75,38,0.26)",
    accent: "rgba(230,190,140,0.18)",
    fragment: "oregon pine wood-effect laminate with golden-brown tone and elegant straight grain",
    referenceImage: "22-Oregon-Finitura-classica-PVC.webp",
  },
  // v8.6.15 — Shogun spostato da WIZARD_RAL marroni a WIZARD_LEGNO perché
  // sono pellicolature wood-effect (la foto reference mostra venature legno).
  {
    id: "shogun_af",
    code: "242",
    nome: "Shogun AF",
    hex: "#A86E3B",
    grad: "linear-gradient(135deg,#B97D45,#8A5828)",
    grain: "rgba(100,60,28,0.30)",
    accent: "rgba(210,150,90,0.18)",
    fragment: "Shogun AF wood-effect laminate: warm medium-brown tone with ribbon-grain pattern, premium Italian PVC pellicolato finish",
    referenceImage: "242-Shogun-AF-Finitura-classica-PVC.webp",
  },
  {
    id: "shogun_ad",
    code: "243",
    nome: "Shogun AD",
    hex: "#6B4226",
    grad: "linear-gradient(135deg,#825030,#4A2E1A)",
    grain: "rgba(60,35,16,0.36)",
    accent: "rgba(170,110,65,0.18)",
    fragment: "Shogun AD wood-effect laminate: deep dark brown tone with rich ribbon-grain, premium Italian PVC pellicolato finish",
    referenceImage: "243-Shogun-AD-Finitura-classica-PVC.webp",
  },
  // v8.6.14 — Estensioni effetti legno Serbaplast (referenceImage null = swatch CSS)
  {
    id: "quercia_chiara",
    code: "17",
    nome: "Quercia Chiara",
    hex: "#C4A47A",
    grad: "linear-gradient(135deg,#D4B58A,#A88560)",
    grain: "rgba(120,90,55,0.22)",
    accent: "rgba(240,210,170,0.18)",
    fragment: "light oak wood-effect laminate with honey-blond tone and visible straight grain, residential warm look",
    referenceImage: "17-Quercia-Chiara-Finitura-classica-PVC.webp",
  },
  {
    id: "quercia_rustica",
    code: "15",
    nome: "Quercia Rustica",
    hex: "#8B6840",
    grad: "linear-gradient(135deg,#A07D52,#6A4F30)",
    grain: "rgba(80,52,28,0.30)",
    accent: "rgba(180,130,80,0.18)",
    fragment: "rustic oak wood-effect laminate with rough knotted grain, warm brown tone, rustic mountain-house look",
    referenceImage: "15-Quercia-Rustica-Finitura-classica-PVC.webp",
  },
  {
    id: "abete_montano",
    code: "85",
    nome: "Abete Montano",
    hex: "#7A5A3A",
    grad: "linear-gradient(135deg,#8A6A48,#5C422A)",
    grain: "rgba(70,45,22,0.30)",
    accent: "rgba(170,125,80,0.18)",
    fragment: "mountain fir wood-effect laminate with deep grain pattern and warm brown tone, alpine residential style",
    referenceImage: "85-Abete-Montano-Finitura-classica-PVC.webp",
  },
  {
    id: "noce_spazzolato",
    code: "549",
    nome: "Noce Spazzolato (Touch)",
    hex: "#5C3A1F",
    grad: "linear-gradient(135deg,#7A4F2C,#3E2410)",
    grain: "rgba(50,28,12,0.36)",
    accent: "rgba(180,120,75,0.20)",
    fragment: "brushed walnut Touch finish: dark warm brown tone with strong embossed grain texture, premium architectural look",
    touch: "spazzolato",
    upsell: true,
    referenceImage: "549-Noce-Spazzolato-Finitura-Touch-effetto-spazzolato.webp",
  },
  {
    id: "rovere_medio",
    code: "544",
    nome: "Rovere Spazzolato Medio (Touch)",
    hex: "#A38458",
    grad: "linear-gradient(135deg,#B89868,#867050)",
    grain: "rgba(95,72,42,0.30)",
    accent: "rgba(220,180,130,0.20)",
    fragment: "medium brushed oak Touch finish: warm-medium brown tone with strong embossed straight grain, premium look",
    touch: "spazzolato",
    upsell: true,
    referenceImage: "544-Rovere-Spazzolato-Medio-Finitura-Touch-effetto-spazzolato.webp",
  },
  // ── Touch Premium (effetto spazzolato 3D) ──
  {
    id: "bianco_frassino",
    code: null,
    nome: "Bianco Frassino (Touch spazzolato)",
    hex: "#ECEAE2",
    grad: "linear-gradient(135deg,#F1EFE7,#DAD6CB)",
    grain: "rgba(165,158,148,0.28)",
    accent: "rgba(255,255,255,0.32)",
    fragment: "white ash wood-effect Touch finish (embossed/brushed): warm bright off-white tone close to RAL 9010, with vertical fine ash grain visible as soft pale-grey embossed lines. Subtle 3D textured surface.",
    touch: "spazzolato",
    upsell: true,
    referenceImage: "Bianco-Frassino-Finitura-Touch-effetto-spazzolato.webp",
  },
  {
    id: "rovere_sbiancato",
    code: "545",
    nome: "Rovere Spazzolato Sbiancato (Touch)",
    hex: "#D8C9A8",
    grad: "linear-gradient(135deg,#E2D5B8,#C0AE8A)",
    grain: "rgba(140,118,85,0.28)",
    accent: "rgba(255,240,200,0.22)",
    fragment: "bleached brushed oak Touch finish: pale cream-beige tone with strong embossed straight grain pattern, premium architectural look",
    touch: "spazzolato",
    upsell: true,
    referenceImage: "545-Rovere-Spazzolato-Sbiancato-Finitura-Touch-effetto-spazzolato.webp",
  },
  {
    id: "rovere_naturale",
    code: "546",
    nome: "Rovere Spazzolato Naturale (Touch)",
    hex: "#A0845C",
    grad: "linear-gradient(135deg,#B89A6B,#8A6D44)",
    grain: "rgba(114,88,52,0.26)",
    accent: "rgba(228,197,139,0.18)",
    fragment: "natural brushed oak Touch finish: warm golden-brown tone with pronounced embossed grain texture, premium architectural look",
    touch: "spazzolato",
    upsell: true,
    referenceImage: "546-Rovere-Spazzolato-Naturale-Finitura-Touch-effetto-spazzolato.webp",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// HARDWARE COLORS (finiture maniglie)
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_HW_COLORS = [
  { id: "cromo", nome: "Cromo lucido", hex: "#C0C0C0", hw_id: "cromo_lucido", finish: "polished chrome" },
  { id: "inox", nome: "Cromo satinato / inox", hex: "#A8A8A8", hw_id: "inox_spazzolato", finish: "brushed stainless steel" },
  { id: "nero_opaco", nome: "Nero Opaco", hex: "#2A2A2A", hw_id: "nero_opaco", finish: "matte black powder coat" },
  { id: "bronzo", nome: "Bronzo anticato", hex: "#8B6914", hw_id: "bronzo_anticato", finish: "antique bronze patina" },
  { id: "oro", nome: "Oro PVD", hex: "#D4A017", hw_id: "oro_pvd", finish: "polished gold PVD coating" },
  { id: "titanio", nome: "Titanio anodizzato", hex: "#6B7B8D", hw_id: "titanio", finish: "titanium anodized" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// MODELLI MANIGLIE — con foto reali
// ─────────────────────────────────────────────────────────────────────────────

// v8.6.14 — Catalogo maniglie aggiornato su richiesta cliente:
// RIMOSSE:  classica_dritta (Standard dritta) — design troppo generico,
//           con_rosetta (Con rosetta) — non comune nel mercato infissi,
//           pomolo (Pomolo / pull) — scelta atipica per finestre.
// AGGIUNTE: curva_morbida (alluminio satinato con curva tonda),
//           hoppe_ergo (Hoppe Atlanta ergonomic alluminio),
//           cremonese (cremonese verticale alta, nera opaca, anta-ribalta).
export const WIZARD_HANDLE_TYPES = [
  {
    id: "q_moderna",
    label: "Squadrata",
    desc: "Look tecnico e contemporaneo. Maniglia con sezione squadrata.",
    family: "squadrata",
    referenceImage: "Maniglia-Squadrata-Inox-Spazzolato-Hoppe.webp",
  },
  {
    id: "toulon",
    label: "Ergonomica Toulon",
    desc: "Curva morbida premium, confortevole, finitura inox spazzolata.",
    family: "curva",
    referenceImage: "Maniglia-Ergonomica-Inox-Spazzolato-Toulon.jpeg",
  },
  {
    id: "curva_morbida",
    label: "Curva morbida",
    desc: "Profilo curvo morbido con base ovale. Look classico-moderno alluminio satinato.",
    family: "curva",
    referenceImage: "Maniglia-Curva-Morbida-Alluminio-Satinato.webp",
  },
  {
    id: "hoppe_ergo",
    label: "Hoppe Ergonomica",
    desc: "Maniglia ergonomica scolpita Hoppe in alluminio satinato. Premium, presa naturale.",
    family: "curva",
    referenceImage: "Maniglia-Ergonomica-Hoppe-Atlanta-Inox.webp",
  },
  {
    id: "cremonese",
    label: "Cremonese verticale",
    desc: "Maniglia cremonese alta verticale, nera opaca. Per anta-ribalta e portefinestre.",
    family: "cremonese",
    referenceImage: "Maniglia-Cremonese-Alta-Verticale-Nero-Opaco.webp",
  },
  {
    id: "alzante",
    label: "Alzante scorrevole",
    desc: "Corpo maniglia dedicato agli scorrevoli.",
    family: "alzante",
    referenceImage: null,
  },
  {
    id: "dk_vasistas",
    label: "DK Vasistas",
    desc: "Maniglia cilindrica per finestre vasistas / anta-ribalta.",
    family: "cilindrica",
    referenceImage: "Maniglia-DK-Vasistas-Cromo-Lucido-Reguitti-Astra.jpg",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// CASSONETTI
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_CASS_MATERIALI = [
  {
    id: "stesso_colore",
    label: "Stesso colore infisso",
    desc: "Cassonetto coordinato al nuovo serramento.",
    icon: "🎨",
    referenceImage: "Cassonetto-PVC-effetto-legno-coordinato.jpg",
  },
  {
    id: "pvc_bianco",
    label: "PVC Bianco",
    desc: "Cassonetto PVC bianco standard.",
    icon: "⬜",
    referenceImage: "Cucina-Portafinestra-Finestra-PVC-Bianco-Cassonetti-Bianchi.webp",
  },
  {
    id: "alluminio",
    label: "Alluminio coibentato",
    desc: "Cassonetto coibentato in alluminio.",
    icon: "🔲",
    referenceImage: null,  // mancante
  },
  {
    id: "colore_custom",
    label: "Altro RAL",
    desc: "Cassonetto con colore dedicato.",
    icon: "🎯",
    referenceImage: null,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// TAPPARELLE
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_TAPP_OPTIONS = [
  { id: "no", label: "Mantieni attuali", desc: "Lascia invariato il sistema oscurante esistente.", icon: "—", referenceImage: null },
  {
    id: "motorizzate",
    label: "Motorizzata",
    desc: "Nuova tapparella motorizzata. Rimuovo la cinghia manuale e installo il bottone elettrico al suo posto.",
    icon: "⚡",
    referenceImage: "Bottone-Tapparella-Elettrica-Bianco-Vimar-80x80.webp",
  },
  { id: "nuove", label: "Nuove + colore", desc: "Sostituisci la tapparella con nuovo colore/finitura.", icon: "🎨", referenceImage: null },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// MAZZETTA COLORI TAPPARELLE — v8.3.2
// Palette dedicata al selettore tapparella: copre i colori più comuni nel
// listino italiano (bianco/grigio/marrone) + verdi, rossi, blu su richiesta.
// Ogni id corrisponde a un colore: può sovrapporsi con WIZARD_RAL (per fast
// lookup) ma sono presenti anche RAL specifici per tapparelle (RAL 8017
// marrone cioccolato, RAL 7016 antracite, RAL 6005 verde muschio, ecc).
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_TAPP_COLORS = [
  // ── Bianchi/Crema ──
  { id: "tapp_9010_bianco", code: "9010", nome: "Bianco Puro (RAL 9010)", hex: "#F7F7F4", family: "bianchi" as const },
  { id: "tapp_9001_crema", code: "9001", nome: "Bianco Crema (RAL 9001)", hex: "#EAE6CA", family: "bianchi" as const },
  { id: "tapp_1013_avorio", code: "1013", nome: "Bianco Avorio (RAL 1013)", hex: "#E3D9C6", family: "bianchi" as const },
  // ── Grigi ──
  { id: "tapp_7035_grigio_chiaro", code: "7035", nome: "Grigio Chiaro (RAL 7035)", hex: "#C7CAC9", family: "grigi" as const },
  { id: "tapp_7016_antracite", code: "7016", nome: "Grigio Antracite (RAL 7016)", hex: "#383E42", family: "grigi" as const },
  { id: "tapp_9006_argento", code: "9006", nome: "Argento Metallizzato (RAL 9006)", hex: "#A5A5A5", family: "grigi" as const },
  // ── Marroni ──
  { id: "tapp_8017_cioccolato", code: "8017", nome: "Marrone Cioccolato (RAL 8017)", hex: "#45322E", family: "marroni" as const },
  { id: "tapp_8014_seppia", code: "8014", nome: "Marrone Seppia (RAL 8014)", hex: "#4A3328", family: "marroni" as const },
  { id: "tapp_8003_argilla", code: "8003", nome: "Marrone Argilla (RAL 8003)", hex: "#7E4B26", family: "marroni" as const },
  // ── Verdi ──
  { id: "tapp_6005_muschio", code: "6005", nome: "Verde Muschio (RAL 6005)", hex: "#114232", family: "verdi" as const },
  { id: "tapp_6009_abete", code: "6009", nome: "Verde Abete (RAL 6009)", hex: "#27352A", family: "verdi" as const },
  { id: "tapp_6021_pallido", code: "6021", nome: "Verde Pallido (RAL 6021)", hex: "#89A86B", family: "verdi" as const },
  // ── Rossi ──
  { id: "tapp_3003_rubino", code: "3003", nome: "Rosso Rubino (RAL 3003)", hex: "#9B111E", family: "rossi" as const },
  { id: "tapp_3005_vino", code: "3005", nome: "Rosso Vino (RAL 3005)", hex: "#5E2129", family: "rossi" as const },
  { id: "tapp_3011_marrone", code: "3011", nome: "Rosso Marrone (RAL 3011)", hex: "#781F19", family: "rossi" as const },
  // ── Blu ──
  { id: "tapp_5010_genziana", code: "5010", nome: "Blu Genziana (RAL 5010)", hex: "#0E294B", family: "blu" as const },
  { id: "tapp_5003_zaffiro", code: "5003", nome: "Blu Zaffiro (RAL 5003)", hex: "#1B2D44", family: "blu" as const },
  { id: "tapp_5014_colomba", code: "5014", nome: "Blu Colomba (RAL 5014)", hex: "#637D96", family: "blu" as const },
  // ── Nero ──
  { id: "tapp_9005_nero", code: "9005", nome: "Nero Intenso (RAL 9005)", hex: "#0A0A0A", family: "premium" as const },
] as const;

export type WizardTappColor = (typeof WIZARD_TAPP_COLORS)[number]["id"];

export function findWizardTappColor(id: string) {
  return WIZARD_TAPP_COLORS.find((c) => c.id === id) ?? null;
}

export function getTappColorsByFamily(family: RalFamily): typeof WIZARD_TAPP_COLORS[number][] {
  return WIZARD_TAPP_COLORS.filter((c) => c.family === family);
}

// ─────────────────────────────────────────────────────────────────────────────
// TRAVERSO PORTAFINESTRA — v8
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_TRAVERSO_OPTIONS = [
  {
    id: "auto",
    label: "Automatico",
    desc: "Se nella foto c'è un traverso, lo mantengo. Altrimenti, anta intera vetrata.",
    icon: "✨",
    referenceImage: null,
  },
  {
    id: "mantieni",
    label: "Mantieni traverso",
    desc: "Mantengo il montante orizzontale a metà altezza.",
    icon: "═",
    referenceImage: "Cucina-Portafinestra-Finestra-PVC-Bianco-Cassonetti-Bianchi.webp",
  },
  {
    id: "rimuovi",
    label: "Rimuovi traverso",
    desc: "Anta intera completamente vetrata. Look contemporaneo.",
    icon: "▭",
    referenceImage: "Prima-Dopo-Portafinestra-Traverso-Rimosso.jpg",
  },
  {
    id: "aggiungi",
    label: "Aggiungi traverso",
    desc: "Aggiungo un traverso orizzontale a metà altezza (look classico).",
    icon: "╋",
    referenceImage: null,
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// CERNIERE — v8
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_CERNIERE_OPTIONS = [
  {
    id: "visibili",
    label: "Cerniere a vista",
    desc: "Cerniere classiche visibili sul lato dell'anta. Soluzione standard.",
    icon: "◖",
    referenceImage: "Portafinestra-2ante-Legno-Chiaro-Installata-Cantiere.jpg",
  },
  {
    id: "scomparsa",
    label: "Cerniere a scomparsa",
    desc: "Cerniere completamente nascoste nel telaio. L'anta sembra fluttuare. Look premium architettonico.",
    icon: "▢",
    upsell: true,
    referenceImage: "Finestra-2ante-Cerniere-Scomparsa-Anta-Aperta-Praga.jpg",
  },
] as const;

export const PROFILI_CERNIERE_NASCOSTE_COMPATIBILI = [
  "alluminio",
  "minimal",
  "legno_alluminio",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────────────────────

export type WizardTipo = (typeof WIZARD_TIPI)[number]["id"];
export type WizardProfilo = (typeof WIZARD_PROFILI)[number]["id"];
export type WizardHw = (typeof WIZARD_HW_COLORS)[number]["id"];
export type WizardHandleType = (typeof WIZARD_HANDLE_TYPES)[number]["id"];
export type WizardCassMat = (typeof WIZARD_CASS_MATERIALI)[number]["id"];
export type WizardTapp = (typeof WIZARD_TAPP_OPTIONS)[number]["id"];
export type WizardTraverso = (typeof WIZARD_TRAVERSO_OPTIONS)[number]["id"];
export type WizardCerniere = (typeof WIZARD_CERNIERE_OPTIONS)[number]["id"];
export type WizardNodo = (typeof WIZARD_NODO_OPTIONS)[number]["id"];

export interface WizardState {
  tipo: WizardTipo | "";
  profilo: WizardProfilo | "";
  /** @deprecated v8.1 — usa `nodo: "maniglia_centrale"`. */
  manigliaCentrale: boolean;
  coloreInfisso: string;
  tipoManiglia: WizardHandleType;
  coloreHw: WizardHw;
  cass: boolean;
  cassMat: WizardCassMat;
  cassCol: string;
  tapp: WizardTapp;
  tappCol: string;
  traverso: WizardTraverso;
  cerniere: WizardCerniere;
  nodo: WizardNodo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function findWizardRal(id: string) {
  return WIZARD_RAL.find((item) => item.id === id) ?? null;
}

export function findWizardWood(id: string) {
  return WIZARD_LEGNO.find((item) => item.id === id) ?? null;
}

export function getWizardColorById(id: string) {
  return findWizardRal(id) ?? findWizardWood(id) ?? findWizardTappColor(id) ?? null;
}

/** Restituisce la preview URL Supabase Storage del colore selezionato.
 *  Usata dalla UI wizard per mostrare la foto reale invece del gradient CSS. */
export function getWizardColorPreviewUrl(id: string): string | null {
  const color = getWizardColorById(id);
  if (!color || !("referenceImage" in color) || !color.referenceImage) return null;
  return getReferenceImageUrl(color.referenceImage);
}

export function getWizardTipoMeta(tipo: WizardTipo | "") {
  return WIZARD_TIPI.find((item) => item.id === tipo) ?? null;
}

export function getWizardProfiloMeta(profilo: WizardProfilo | "") {
  return WIZARD_PROFILI.find((item) => item.id === profilo) ?? null;
}

export function getWizardHardwareMeta(hw: WizardHw) {
  return WIZARD_HW_COLORS.find((item) => item.id === hw) ?? WIZARD_HW_COLORS[0];
}

export function getWizardHandleTypeMeta(handleType: WizardHandleType) {
  return WIZARD_HANDLE_TYPES.find((item) => item.id === handleType) ?? WIZARD_HANDLE_TYPES[0];
}

export function getWizardCassonettoMeta(cass: WizardCassMat) {
  return WIZARD_CASS_MATERIALI.find((item) => item.id === cass) ?? WIZARD_CASS_MATERIALI[0];
}

export function getWizardTapparellaMeta(tapp: WizardTapp) {
  return WIZARD_TAPP_OPTIONS.find((item) => item.id === tapp) ?? WIZARD_TAPP_OPTIONS[0];
}

export function getWizardTraversoMeta(traverso: WizardTraverso) {
  return WIZARD_TRAVERSO_OPTIONS.find((item) => item.id === traverso) ?? WIZARD_TRAVERSO_OPTIONS[0];
}

export function getWizardCerniereMeta(cerniere: WizardCerniere) {
  return WIZARD_CERNIERE_OPTIONS.find((item) => item.id === cerniere) ?? WIZARD_CERNIERE_OPTIONS[0];
}

export function getWizardNodoMeta(nodo: WizardNodo) {
  return WIZARD_NODO_OPTIONS.find((item) => item.id === nodo) ?? WIZARD_NODO_OPTIONS[0];
}

export function profileSupportsHiddenHinges(profilo: WizardProfilo | ""): boolean {
  return PROFILI_CERNIERE_NASCOSTE_COMPATIBILI.includes(profilo as never);
}

export function profileSupportsAsymmetricNode(profilo: WizardProfilo | ""): boolean {
  return PROFILI_NODO_ASIMMETRICO_COMPATIBILI.includes(profilo as never);
}

// ─────────────────────────────────────────────────────────────────────────────
// Famiglie colori per raggruppamento UI (in tab/sezioni nel wizard)
// ─────────────────────────────────────────────────────────────────────────────

export type RalFamily = "bianchi" | "grigi" | "marroni" | "blu" | "rossi" | "verdi" | "premium";

export function getRalsByFamily(family: RalFamily): typeof WIZARD_RAL[number][] {
  return WIZARD_RAL.filter((c) => c.family === family);
}

export const RAL_FAMILY_LABELS: Record<RalFamily, string> = {
  bianchi: "Bianchi e crema",
  grigi: "Grigi e antraciti",
  marroni: "Marroni",
  blu: "Blu",
  rossi: "Rossi",
  verdi: "Verdi",
  premium: "Touch premium",
};
