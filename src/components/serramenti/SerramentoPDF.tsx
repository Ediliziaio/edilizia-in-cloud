/**
 * SerramentoPDF — Documento PDF nativo A4 generato lato client con
 * @react-pdf/renderer, design ispirato al benchmark "Solar Pro Italia"
 * ma adattato al brand Edilizia in Cloud / serramenti.
 *
 * Strutture pagina:
 *   1. Cover — sfondo scuro, hero personalizzabile, decoro SVG finestra,
 *               dati cliente in card con accent arancio
 *   2. Proposta intervento — anagrafica, sintesi, esigenze, soluzione, perché noi
 *   3. Proposta economica — prezzo big, modalità pagamento step-by-step, finanziamento,
 *               detrazione ecobonus, cashflow SVG 10 anni
 *   4. Allegato tecnico — tabella serramenti con foto prodotto + scheda tecnica
 *               chip (show_in_pdf=true), accessori (con misure), cronoprogramma
 *               Gantt SVG, consulenza con foto consulente
 *   5+. Pagine dedicate macrocategoria (foto modello + descrizione_estesa)
 *   N. CTA finale "Cosa fare adesso" + testimonianze + render foto-realistici
 *
 * Font: tenta Inter via Google Fonts CDN (HTTPS, no auth). Se la registrazione
 * fallisce (CORS, network) il renderer fa fallback automatico a Helvetica.
 */
import * as React from "react";
import { Document, Page, Text, View, StyleSheet, Image, Link, Svg, Path, Rect, Circle, G, Font, Defs, LinearGradient, RadialGradient, Stop } from "@react-pdf/renderer";
import type {
  SrProgettoDetail, SrSerramentoRow, SrPagamentoMilestone,
  SrPianoFinanziamento, SrEsigenza, SrSoluzioneItem, SrTestimonianza,
  SrTemplatePdfRow,
} from "@/types/serramenti";
import { SR_TIPOLOGIE_SERRAMENTO, SR_MATERIALI, SR_SCHEMI_PAGAMENTO, SR_PERCORSO_DEFAULT, normalizePdfPagesOrder, SR_GARANZIE_DEFAULT, SR_CONFRONTO_DEFAULT, SR_FAQ_DEFAULT } from "@/types/serramenti";
import type {
  SrPercorsoCliente, SrPdfPageId, SrPdfPageOrderItem,
  SrGaranzia, SrConfrontoRiga, SrCertificazione, SrBonus, SrFaq,
} from "@/types/serramenti";
import { calcolaTotale } from "@/lib/serramenti/calcoli";
import { applicaMergeTagModulo } from "@/lib/mergeTagsModuli";
import { generateInterventoSintesi } from "@/lib/serramenti/sintesiIntervento";
import { testoScelta } from "@/lib/listino/scelteVariante";
import { schedaPosizione, titoloConLinea } from "@/lib/serramenti/schedaPosizione";
import { inchiostroSuBianco, testoSopra } from "@/lib/pdf/contrastoColori";
import { coloreDelDocumento, fondoPerTestoBianco, scurisci, testoSuChiaro, testoSuScuro } from "../../../supabase/functions/_shared/temaColori";
import { condizioniStandard } from "../../../supabase/functions/_shared/condizioniStandard";
import type {
  SerramentoPdfConsulente, SerramentoPdfFamilyData,
  SerramentoPdfMacroField, SerramentoPdfMacroPagina,
  SerramentoPdfSupplierLine, SerramentoPdfLineaPagina,
} from "@/hooks/useSerramentoPDF";

// Il PDF usa Helvetica, incluso in react-pdf: nessun font da scaricare.
const FF = "Helvetica";

// Disabilita hyphenation built-in di react-pdf: tagliava parole italiane
// in modo brutto (es. "cal-do" invece di "caldo") sul titolo cover quando
// la riga era stretta. Restituendo `[word]` impediamo qualsiasi spezzamento
// → la parola intera va a capo se non c'entra.
Font.registerHyphenationCallback((word) => [word]);

// ─── Palette default (override dinamico da template.colore_primario) ──────
const DEFAULT_PRIMARY = "#2D7D5C";
const DEFAULT_ACCENT = "#F59E0B";
/**
 * Il fondo della copertina quando l'azienda non ne ha scelto uno: il suo colore,
 * portato quasi al nero. Prima era un verde petrolio fisso (#0F2A2E), che con un
 * marchio rosso o azzurro non c'entrava niente.
 */
function fondoCopertinaDiSerie(primary: string): string {
  return scurisci(fondoPerTestoBianco(primary), 0.62);
}

function makePalette(primary: string, accent = DEFAULT_ACCENT) {
  const safePrimary = normalizeHexColor(primary, DEFAULT_PRIMARY) ?? DEFAULT_PRIMARY;
  const safeAccent = normalizeHexColor(accent, DEFAULT_ACCENT) ?? DEFAULT_ACCENT;
  return {
    primary: safePrimary,
    accent: safeAccent,
    primaryLight: hexToTint(safePrimary, 0.92),
    primaryBorder: hexToTint(safePrimary, 0.65),
    // Per scrivere sul bianco e sopra il colore: uguali a primary e al bianco
    // finché si leggono; con un colore chiaro (il lime di Renova) no.
    ink: inchiostroSuBianco(safePrimary),
    onPrimary: testoSopra(safePrimary),
    coverBg: fondoCopertinaDiSerie(safePrimary),
    white: "#FFFFFF",
    gray50: "#F8FAFC",
    gray100: "#F1F5F9",
    gray200: "#E2E8F0",
    gray300: "#CBD5E1",
    gray500: "#64748B",
    gray700: "#334155",
    gray900: "#0F172A",
    successBg: "#DCFCE7",
    successText: "#15803D",
    accentLight: hexToTint(safeAccent, 0.82),
    accentText: "#92400E",
  };
}

function normalizeHexColor(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  const match3 = raw.match(/^#?([0-9a-fA-F]{3})$/);
  if (match3) {
    const [r, g, b] = match3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const match6 = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (match6) return `#${match6[1]}`.toUpperCase();
  return fallback;
}

// Schiarisce un colore hex verso il bianco (alpha=1 → bianco puro).
function hexToTint(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const mix = (ch: number) => Math.round(ch + (255 - ch) * alpha);
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Style factory (colori dinamici) ───────────────────────────────────────
function makeStyles(C: ReturnType<typeof makePalette>) {
  return StyleSheet.create({
    page: {
      fontFamily: FF,
      fontSize: 9.5,
      color: C.gray900,
      paddingTop: 40,
      // Il footer fisso (position absolute, bottom 26) arriva a 4-5 righe
      // (~74-84pt dal fondo): 92 evita che il contenuto ci finisca sopra.
      paddingBottom: 92,
      paddingHorizontal: 44,
      backgroundColor: C.white,
    },
    cover: {
      fontFamily: FF,
      color: C.white,
      width: 595,
      height: 841,
      padding: 0,
      backgroundColor: C.coverBg,
      position: "relative",
      overflow: "hidden",
    },

    // Header
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
      paddingBottom: 12,
      borderBottom: `1pt solid ${C.gray200}`,
    },
    headerLogo: {
      maxWidth: 100, height: 34,
      objectFit: "contain" as const,
      marginRight: 10,
    },
    headerLeft: { flexDirection: "row", alignItems: "center" },
    headerName: { fontSize: 11, fontWeight: 700, color: C.ink },
    headerRight: { fontSize: 8, color: C.gray500, textAlign: "right" as const },
    headerStimaCode: { fontWeight: 700, color: C.gray900, fontSize: 9 },

    // Footer
    footer: {
      position: "absolute",
      bottom: 26,
      left: 44,
      right: 44,
      paddingTop: 8,
      borderTop: `0.5pt solid ${C.gray200}`,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7.5,
      color: C.gray500,
      marginBottom: 1,
    },
    footerCompanyName: { fontWeight: 700, color: C.gray700 },

    // Cover
    coverLogoBox: { flexDirection: "row", alignItems: "center" },
    coverLogoCircle: {
      width: 56, height: 56, borderRadius: 12,
      backgroundColor: C.primary,
      alignItems: "center", justifyContent: "center",
      marginRight: 14,
    },
    /** Logo container ampio: aspect-ratio flessibile (4:1 max) per loghi
     *  larghi/rettangolari tipo "KE Bei Serramenti". `objectFit: contain`
     *  evita di tagliare gli angoli del logo. */
    coverLogoImage: {
      maxWidth: 220, height: 70,
      objectFit: "contain" as const,
      marginRight: 16,
    },
    coverCompanyName: { fontSize: 18, fontWeight: 700 },
    coverCompanyTag: { fontSize: 9.5, color: "#9CA3AF", marginTop: 2 },

    coverEyebrow: {
      fontSize: 10,
      // Eyebrow usa il colore primario (allineato con la preview editor che
      // mostra "LA TUA PROPOSTA PERSONALIZZATA" nel colore primario del brand).
      color: C.primary,
      fontWeight: 700,
      letterSpacing: 1.6,
      textTransform: "uppercase" as const,
      marginBottom: 16,
    },
    coverTitle: {
      fontSize: 40,
      fontWeight: 800,
      lineHeight: 1.05,
      marginBottom: 18,
      letterSpacing: -0.3,
    },
    coverSubtitle: {
      fontSize: 13,
      lineHeight: 1.55,
      color: "#D1D5DB",
      maxWidth: 380,
    },
    coverCard: {
      backgroundColor: "rgba(255,255,255,0.07)",
      borderRadius: 10,
      padding: 22,
      marginTop: 34,
      borderLeft: `3pt solid ${C.accent}`,
    },
    coverLabel: {
      fontSize: 8.5,
      color: C.accent,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase" as const,
      marginBottom: 6,
    },
    coverClientName: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
    coverClientAddr: { fontSize: 10.5, color: "#9CA3AF" },

    coverFooter: {
      position: "absolute",
      left: 54,
      right: 54,
      bottom: 42,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 14,
      fontSize: 9,
      color: "#9CA3AF",
    },
    // Il filetto sopra il piè di copertina. Era un `borderTop` con colore rgba():
    // react-pdf nella forma abbreviata non lo legge e disegnava un filetto VERDE
    // su qualsiasi copertina. Un rettangolo bianco al 18% fa quello che si voleva.
    coverFooterRule: {
      position: "absolute", top: 0, left: 0, right: 0, height: 0.5,
      backgroundColor: "#FFFFFF", opacity: 0.18,
    },
    coverFooterStrong: { fontWeight: 700, color: C.white },
    coverDecoSvg: {
      position: "absolute",
      top: 50,
      right: 50,
      width: 180,
      height: 180,
      opacity: 0.8,
    },

    // Tipografia pagine
    pageEyebrow: {
      fontSize: 9,
      color: C.ink,
      fontWeight: 700,
      letterSpacing: 1.3,
      textTransform: "uppercase" as const,
      marginBottom: 6,
    },
    pageTitle: {
      fontSize: 34,
      fontWeight: 800,
      color: C.gray900,
      lineHeight: 1.05,
      marginBottom: 8,
      letterSpacing: -0.6,
    },
    pageSubtitle: { fontSize: 11, color: C.gray500, marginBottom: 22, lineHeight: 1.45 },
    investmentTitle: {
      fontSize: 28,
      fontWeight: 800,
      color: C.gray900,
      lineHeight: 1.03,
      marginBottom: 6,
      letterSpacing: -0.25,
    },
    investmentSubtitle: {
      fontSize: 10,
      color: C.gray500,
      marginBottom: 12,
      lineHeight: 1.38,
    },

    sectionTitle: {
      fontSize: 10,
      fontWeight: 700,
      color: C.ink,
      textTransform: "uppercase" as const,
      letterSpacing: 0.7,
      marginTop: 20,
      marginBottom: 8,
      paddingBottom: 5,
      borderBottom: `1pt solid ${C.gray200}`,
    },
    investmentSectionTitle: {
      fontSize: 8.8,
      fontWeight: 800,
      color: C.ink,
      textTransform: "uppercase" as const,
      letterSpacing: 0.6,
      marginTop: 10,
      marginBottom: 6,
      paddingBottom: 4,
      borderBottom: `0.75pt solid ${C.gray200}`,
    },
    investmentBlock: {
      marginTop: 8,
    },

    // K-V
    kvRow: { flexDirection: "row", marginBottom: 4 },
    kvKey: { width: 95, fontSize: 9, color: C.gray500 },
    kvValue: { flex: 1, fontSize: 10, fontWeight: 700, color: C.gray900 },

    // Bullet
    bulletItem: { flexDirection: "row", marginBottom: 10, alignItems: "flex-start" },
    bulletDot: {
      width: 5, height: 5, borderRadius: 2.5,
      backgroundColor: C.primary, marginTop: 6, marginRight: 9,
    },
    bulletContent: { flex: 1 },
    bulletTitle: { fontSize: 11, fontWeight: 700, color: C.gray900, marginBottom: 2 },
    bulletText: { fontSize: 10, color: C.gray700, lineHeight: 1.55 },

    // Sintesi paragraph
    sintesiBox: {
      fontSize: 10.5,
      color: C.gray700,
      lineHeight: 1.6,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: C.gray50,
      borderRadius: 6,
      borderLeft: `3pt solid ${C.primary}`,
    },

    // Prezzo big
    priceBox: {
      backgroundColor: C.primaryLight,
      borderRadius: 10,
      padding: 22,
      marginTop: 6,
      marginBottom: 18,
    },
    priceBoxCompact: {
      backgroundColor: C.primaryLight,
      borderRadius: 9,
      padding: 16,
      marginTop: 4,
      marginBottom: 10,
      borderLeft: `3pt solid ${C.primary}`,
    },
    priceLabel: {
      fontSize: 9,
      color: C.ink,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: 0.9,
      marginBottom: 6,
    },
    priceValue: { fontSize: 28, fontWeight: 800, color: C.ink },
    priceValueCompact: { fontSize: 24, fontWeight: 800, color: C.ink, lineHeight: 1.08 },
    priceSuffix: { fontSize: 11, color: C.ink, marginLeft: 8, fontWeight: 500 },
    priceFinePrint: { fontSize: 7.5, color: C.gray500, marginTop: 5, lineHeight: 1.35, fontStyle: "italic" as const },

    // Milestone 7: highlight rata mensile + netto post-fiscale dentro priceBox.
    // Riga divider sopra: serve a separare visivamente dal blocco numerico.
    priceExtraRow: {
      flexDirection: "row",
      marginTop: 12,
      paddingTop: 10,
      borderTop: `0.5pt solid ${C.primary}`,
      gap: 18,
    },
    priceExtraItem: { flex: 1 },
    priceExtraLabel: {
      fontSize: 8,
      color: C.ink,
      textTransform: "uppercase" as const,
      letterSpacing: 0.6,
      fontWeight: 700,
      marginBottom: 2,
    },
    priceExtraValue: { fontSize: 14, color: C.ink, fontWeight: 800 },
    priceExtraSub: { fontSize: 7.5, color: C.ink, marginTop: 1 },

    // Milestone 8: mini-tabella ecobonus 10 anni
    // Layout: 5 colonne × 2 righe. Ogni cella ha "Anno N" + quota + cumulato.
    ecobonusTable: {
      flexDirection: "row",
      flexWrap: "wrap" as const,
      marginTop: 8,
      gap: 4,
    },
    ecobonusCell: {
      width: "19%" as const,    // 5 colonne → 100/5 - gap visual ~ 19%
      backgroundColor: C.white,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 4,
      alignItems: "center",
      borderLeft: `2pt solid ${C.successText}`,
    },
    ecobonusCellYear: { fontSize: 7, color: C.gray500, fontWeight: 700, textTransform: "uppercase" as const },
    ecobonusCellAmount: { fontSize: 9, color: C.successText, fontWeight: 700, marginTop: 1 },
    ecobonusCellCum: { fontSize: 6.5, color: C.gray500, marginTop: 1 },
    ecobonusFootnote: { fontSize: 7.5, color: C.gray500, marginTop: 8, fontStyle: "italic" as const },

    // Pay schema tag
    paySchemaTag: {
      backgroundColor: C.accentLight,
      color: C.accentText,
      fontSize: 8.5,
      fontWeight: 700,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 4,
      alignSelf: "flex-start" as const,
      marginBottom: 10,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
    },
    payStep: {
      flexDirection: "row",
      paddingVertical: 10,
      borderBottom: `0.5pt solid ${C.gray100}`,
      alignItems: "flex-start",
    },
    payStepIdxBox: {
      width: 24, height: 24, borderRadius: 12,
      backgroundColor: C.primary,
      alignItems: "center", justifyContent: "center",
      marginRight: 12,
    },
    payStepIdxText: { color: C.onPrimary, fontSize: 10, fontWeight: 700 },
    payStepBody: { flex: 1, paddingRight: 8 },
    payStepLabel: { fontSize: 10.5, fontWeight: 700, color: C.gray900 },
    payStepWhen: { fontSize: 9, color: C.gray500, marginTop: 2 },
    payStepRight: { width: 95, alignItems: "flex-end" },
    payStepPct: { fontSize: 13, fontWeight: 700, color: C.ink },
    payStepAmount: { fontSize: 8.5, color: C.gray500, marginTop: 2 },

    // Milestone 6: timeline orizzontale schema pagamento.
    // Layout: row con N box equispaziate + connettore visual (border-bottom).
    payTimelineRow: {
      flexDirection: "row",
      marginTop: 8,
      gap: 6,
    },
    payTimelineStep: {
      flex: 1,
      alignItems: "center",
      paddingTop: 4,
      paddingBottom: 8,
      paddingHorizontal: 4,
      borderRadius: 6,
      backgroundColor: C.gray50,
      borderBottom: `2pt solid ${C.primary}`,
    },
    payTimelineIdx: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: C.primary,
      alignItems: "center", justifyContent: "center",
      marginBottom: 4,
    },
    payTimelineIdxText: { color: C.onPrimary, fontSize: 9, fontWeight: 700 },
    payTimelineLabel: { fontSize: 8.5, fontWeight: 700, color: C.gray900, textAlign: "center" as const, marginBottom: 2 },
    payTimelineWhen: { fontSize: 7, color: C.gray500, textAlign: "center" as const, marginBottom: 4 },
    payTimelinePct: { fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 2 },
    payTimelineAmount: { fontSize: 7.5, color: C.gray500, marginTop: 1 },

    // Finanziamento
    finBox: { flexDirection: "row", gap: 12, marginTop: 6 },
    finCard: {
      flex: 1,
      backgroundColor: C.gray50,
      borderRadius: 8,
      padding: 14,
      border: `0.5pt solid ${C.gray200}`,
    },
    finCardTitle: {
      fontSize: 8.5, color: C.gray500, fontWeight: 700,
      textTransform: "uppercase" as const, letterSpacing: 0.7, marginBottom: 6,
    },
    finCardValue: { fontSize: 20, fontWeight: 800, color: C.ink },
    finCardSub: { fontSize: 8.5, color: C.gray500, marginTop: 3 },

    // Tabella prodotti
    table: { marginTop: 8 },
    tableHeader: {
      flexDirection: "row",
      borderBottom: `1pt solid ${C.gray300}`,
      paddingBottom: 6,
      marginBottom: 5,
    },
    tableHeaderText: {
      fontSize: 7.5, color: C.gray500, fontWeight: 700,
      textTransform: "uppercase" as const, letterSpacing: 0.6,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 9,
      borderBottom: `0.5pt solid ${C.gray100}`,
      alignItems: "flex-start",
    },
    tableThumb: {
      width: 60, height: 60, borderRadius: 4,
      // contain: i disegni dei prodotti sono più alti che larghi e con "cover"
      // la portafinestra perdeva il telaio sopra e sotto.
      objectFit: "contain" as const,
      marginRight: 10,
      borderWidth: 0.5, borderColor: C.gray200, borderStyle: "solid",
    },
    tableThumbPh: {
      width: 60, height: 60, borderRadius: 4,
      backgroundColor: C.gray100, marginRight: 10,
      alignItems: "center", justifyContent: "center",
    },
    tableRowNumber: {
      width: 28,
      paddingTop: 6,
    },
    tableRowNumberText: {
      fontSize: 13,
      fontWeight: 700,
      color: C.gray900,
    },
    tableTechDesc: {
      fontSize: 8.5,
      color: C.gray700,
      marginTop: 3,
      lineHeight: 1.45,
    },
    tableCellStrong: { fontSize: 10, fontWeight: 700, color: C.gray900 },
    tableCellMuted: { fontSize: 9, color: C.gray500, marginTop: 2, lineHeight: 1.4 },
    tableCellNum: { fontSize: 10, fontWeight: 700, color: C.gray900, textAlign: "right" as const },

    // Scheda tecnica chips (box View, non Text inline → react-pdf-friendly)
    specChips: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
    specChip: {
      backgroundColor: C.gray100,
      paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: 3,
      marginRight: 4, marginBottom: 3,
    },
    specChipLabel: { color: C.gray500, fontWeight: 500 },
    specChipValue: { color: C.gray900, fontWeight: 700 },
    specChipUnit: { color: C.gray500, fontWeight: 400 },
    supplierLineText: {
      fontSize: 8.2,
      color: C.ink,
      fontWeight: 700,
      marginTop: 2,
      letterSpacing: 0.15,
    },

    // Consulenza
    consBox: {
      backgroundColor: C.primaryLight,
      borderRadius: 10,
      padding: 16,
      flexDirection: "row",
      gap: 14,
      alignItems: "center",
      marginTop: 8,
    },
    consPhoto: {
      width: 64, height: 64, borderRadius: 32,
      objectFit: "cover" as const,
      borderWidth: 2, borderColor: C.white, borderStyle: "solid",
    },
    consPhotoPh: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: C.primary,
      alignItems: "center", justifyContent: "center",
    },
    consName: { fontSize: 13, fontWeight: 700, color: C.gray900 },
    consRole: { fontSize: 9.5, color: C.gray500, marginTop: 2 },
    consContact: { fontSize: 9, color: C.gray700, marginTop: 6, lineHeight: 1.4 },

    // Macro pagina dedicata
    // Layout VERTICALE: immagine in alto (panoramica, contain → no crop),
    // descrizione sotto a piena larghezza. Così la descrizione può occupare
    // tutta la pagina senza essere troncata dall'altezza fissa della riga.
    macroPageHero: { flexDirection: "column", gap: 16, marginTop: 12 },
    macroPageImgWrap: {
      width: "100%",
      maxHeight: 280,
      borderRadius: 10,
      backgroundColor: C.gray100,
      overflow: "hidden",
      alignItems: "center", justifyContent: "center",
      borderWidth: 0.5, borderColor: C.gray200, borderStyle: "solid",
    },
    macroPageImg: {
      width: "100%",
      maxHeight: 280,
      objectFit: "contain" as const,
    },
    macroPageImgPh: {
      width: "100%", height: 200,
      borderRadius: 10,
      backgroundColor: C.gray100,
      alignItems: "center", justifyContent: "center",
    },
    macroPageContent: { fontSize: 11, color: C.gray700, lineHeight: 1.65 },

    // Milestone 9: pagina foto-tecnica dedicata per articolo
    // Layout: 2 colonne foto (situazione | render) in alto, scheda tecnica sotto.
    articoloPhotoRow: { flexDirection: "row" as const, gap: 12, marginTop: 14 },
    articoloPhotoCol: {
      flex: 1,
      borderRadius: 10,
      backgroundColor: C.gray100,
      overflow: "hidden" as const,
      borderWidth: 0.5,
      borderColor: C.gray200,
      borderStyle: "solid" as const,
      height: 220,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    articoloPhotoImg: { width: "100%" as const, height: 220, objectFit: "cover" as const },
    articoloPhotoLabel: {
      position: "absolute" as const,
      top: 8, left: 8,
      backgroundColor: C.white,
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 4,
      fontSize: 8,
      fontWeight: 700,
      color: C.gray900,
      letterSpacing: 0.5,
      textTransform: "uppercase" as const,
    },
    articoloPhotoLabelDopo: {
      position: "absolute" as const,
      top: 8, left: 8,
      backgroundColor: C.primary,
      color: C.onPrimary,
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 4,
      fontSize: 8,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: "uppercase" as const,
    },
    articoloPhotoCaption: {
      fontSize: 8,
      color: C.gray500,
      marginTop: 4,
      textAlign: "center" as const,
      fontStyle: "italic" as const,
    },
    articoloSpecsTable: {
      marginTop: 16,
      borderTop: `0.5pt solid ${C.gray200}`,
      borderBottom: `0.5pt solid ${C.gray200}`,
      paddingVertical: 6,
    },
    articoloSpecsRow: {
      flexDirection: "row" as const,
      paddingVertical: 5,
      borderBottom: `0.5pt solid ${C.gray100}`,
    },
    articoloSpecsKey: { width: 130, fontSize: 9, color: C.gray500, textTransform: "uppercase" as const, letterSpacing: 0.4 },
    articoloSpecsVal: { flex: 1, fontSize: 10, color: C.gray900, fontWeight: 500 },
    articoloNote: {
      marginTop: 10,
      padding: 10,
      backgroundColor: C.gray50,
      borderRadius: 6,
      borderLeft: `2pt solid ${C.primary}`,
    },
    articoloNoteLabel: { fontSize: 8, color: C.ink, fontWeight: 700, textTransform: "uppercase" as const, marginBottom: 3 },
    articoloNoteText: { fontSize: 9.5, color: C.gray700, lineHeight: 1.5 },

    // Milestone 10: "Perché noi" data-driven — riga di big-number cards.
    // Layout: row con 3-4 colonne equispaziate, ogni card ha icon + value + label.
    percheNoiMetricheRow: {
      flexDirection: "row" as const,
      gap: 8,
      marginTop: 4,
      marginBottom: 14,
    },
    percheNoiMetricaCard: {
      flex: 1,
      backgroundColor: C.primaryLight,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: "center" as const,
      borderTop: `2pt solid ${C.primary}`,
    },
    percheNoiMetricaIcon: { fontSize: 16, marginBottom: 4 },
    percheNoiMetricaValue: { fontSize: 20, fontWeight: 800, color: C.ink, textAlign: "center" as const },
    percheNoiMetricaSuffix: { fontSize: 11, fontWeight: 600, color: C.ink },
    percheNoiMetricaLabel: {
      fontSize: 8,
      color: C.ink,
      textAlign: "center" as const,
      marginTop: 3,
      textTransform: "uppercase" as const,
      letterSpacing: 0.4,
      fontWeight: 600,
    },

    // Chi siamo
    // L'immagine usa objectFit "contain" + height ESPLICITA. In react-pdf
    // `maxHeight` non funziona come in CSS (viene ignorata sull'<Image>),
    // serve un height fisso altrimenti l'immagine collassa a 0 e non
    // appare. 240pt = ~50% di pagina A4, ragionevole per chi siamo.
    chiSiamoHeroWrap: {
      width: "100%",
      height: 240,
      borderRadius: 10,
      backgroundColor: C.gray100,
      alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      marginBottom: 14,
    },
    chiSiamoHero: {
      width: "100%",
      height: 240,
      objectFit: "contain" as const,
    },
    // Testo Chi siamo compatto: 10pt invece di 11pt, line-height 1.5 invece
    // di 1.65 → il testo lungo non occupa più 2 pagine intere.
    chiSiamoText: { fontSize: 10, color: C.gray700, lineHeight: 1.5 },

    // Percorso cliente — step cards
    percorsoBigNumber: {
      fontSize: 86, fontWeight: 800, color: C.ink,
      textAlign: "center" as const, lineHeight: 1.0,
    },
    percorsoBadge: {
      backgroundColor: hexToTint(C.primary, 0.85),
      paddingHorizontal: 12, paddingVertical: 4,
      borderRadius: 999,
      alignSelf: "center" as const,
      marginBottom: 10,
    },
    percorsoBadgeText: {
      fontSize: 9, fontWeight: 700,
      color: C.ink, letterSpacing: 1.2,
      textTransform: "uppercase" as const,
    },
    percorsoFaseCard: {
      backgroundColor: "#0F172A",
      borderRadius: 10,
      padding: 10,
      minHeight: 130,
    },
    // Header card: layout VERTICALE (roman box sopra, label+nome sotto)
    // così il nome fase può usare tutta la larghezza della card senza overflow.
    percorsoFaseHeader: {
      flexDirection: "column", alignItems: "flex-start", gap: 6,
      marginBottom: 10, paddingBottom: 8,
      borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.12)", borderBottomStyle: "solid",
    },
    percorsoFaseRomanBox: {
      width: 24, height: 24, borderRadius: 4,
      backgroundColor: C.primary,
      alignItems: "center", justifyContent: "center",
    },
    percorsoFaseRomanText: { color: C.onPrimary, fontSize: 10, fontWeight: 700 },
    percorsoFaseLabel: {
      fontSize: 7.5, color: C.primary, fontWeight: 700,
      letterSpacing: 0.8, textTransform: "uppercase" as const,
    },
    // Nome fase: smaller, può andare a capo
    percorsoFaseName: { fontSize: 11, fontWeight: 700, color: "#FFFFFF", marginTop: 1, lineHeight: 1.15 },
    percorsoStepRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 5 },
    percorsoStepIdx: {
      width: 18, height: 18, borderRadius: 9,
      backgroundColor: C.primary,
      alignItems: "center", justifyContent: "center",
      marginTop: 1,
    },
    percorsoStepIdxText: { color: C.onPrimary, fontSize: 7.5, fontWeight: 700 },
    percorsoStepText: { fontSize: 8.5, color: "#CBD5E1", flex: 1, lineHeight: 1.35 },

    // Render disclaimer
    renderDisclaimerBox: {
      backgroundColor: C.accentLight,
      borderLeft: `3pt solid ${C.accent}`,
      padding: 10,
      borderRadius: 4,
      marginTop: 10,
    },
    renderDisclaimerLabel: {
      fontSize: 8.5, fontWeight: 700,
      color: C.accentText,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    renderDisclaimerText: {
      fontSize: 8.5, color: C.gray700, lineHeight: 1.5,
    },
    renderPair: {
      flexDirection: "row", gap: 10, marginTop: 10,
    },
    renderPairItem: {
      flex: 1,
      aspectRatio: 1.4,
      borderRadius: 8, overflow: "hidden",
      backgroundColor: C.gray100,
    },
    renderPairLabel: {
      fontSize: 9, fontWeight: 700,
      color: C.gray500,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      marginBottom: 4,
    },

    // CTA finale
    ctaBox: {
      backgroundColor: C.primary,
      borderRadius: 12,
      padding: 24,
      marginTop: 18,
    },
    ctaTitle: {
      fontSize: 15, fontWeight: 700, color: C.onPrimary,
      textTransform: "uppercase" as const,
      letterSpacing: 0.6, marginBottom: 12,
    },
    ctaStep: { flexDirection: "row", alignItems: "flex-start", marginBottom: 9 },
    ctaCheck: {
      width: 18, height: 18, borderRadius: 9,
      backgroundColor: C.white, color: C.ink,
      fontSize: 11, fontWeight: 700, textAlign: "center" as const,
      paddingTop: 2, marginRight: 10,
    },
    ctaText: { flex: 1, fontSize: 10.5, color: C.onPrimary, lineHeight: 1.5 },
    signatureBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginTop: 14,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.primaryBorder,
      backgroundColor: C.primaryLight,
    },
    signatureTitle: { fontSize: 13, fontWeight: 800, color: C.ink, marginBottom: 4 },
    signatureText: { fontSize: 9.5, lineHeight: 1.45, color: C.gray700 },
    signatureUrl: {
      fontSize: 7.5,
      color: C.gray500,
      marginTop: 6,
      lineHeight: 1.35,
    },

    // Render grid
    rendersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
    renderItem: {
      width: "48%",
      aspectRatio: 1.4,
      borderRadius: 8,
      overflow: "hidden",
      backgroundColor: C.gray100,
    },
    renderImg: { width: "100%", height: "100%", objectFit: "contain" as const },
    renderImgCover: { width: "100%", height: "100%", objectFit: "cover" as const },

    // Testimonianze
    testimonialBox: {
      marginBottom: 12,
      paddingLeft: 14,
      borderLeft: `2pt solid ${C.primary}`,
    },
    testimonialQuote: { fontSize: 10, fontStyle: "italic" as const, color: C.gray700, lineHeight: 1.55 },
    testimonialAuthor: { fontSize: 8.5, color: C.gray500, marginTop: 4 },

    // ─── Blocchi conversione (CRO) ──────────────────────────────────────
    // Garanzie: griglia 2 colonne con badge
    garanziaCard: {
      width: "48%",
      backgroundColor: C.primaryLight,
      borderLeft: `3pt solid ${C.primary}`,
      borderRadius: 6,
      padding: 12,
      marginBottom: 10,
    },
    garanziaIcon: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: C.primary,
      alignItems: "center" as const, justifyContent: "center" as const,
      marginBottom: 8,
    },
    garanziaTitolo: { fontSize: 11, fontWeight: 700, color: C.gray900, marginBottom: 4 },
    garanziaDesc: { fontSize: 9, color: C.gray700, lineHeight: 1.45 },

    // Urgenza box
    urgenzaBox: {
      backgroundColor: C.accentLight,
      borderWidth: 1, borderColor: C.accent, borderStyle: "solid" as const,
      borderRadius: 8, padding: 12, marginVertical: 10,
    },
    urgenzaLabel: {
      fontSize: 9, color: C.accentText, fontWeight: 700,
      letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 4,
    },
    urgenzaTitle: { fontSize: 14, fontWeight: 700, color: C.gray900, marginBottom: 3 },
    urgenzaScadenza: { fontSize: 12, fontWeight: 700, color: C.ink },
    urgenzaDesc: { fontSize: 9, color: C.gray700, marginTop: 4, lineHeight: 1.4 },

    // Confronto Prima/Dopo
    confrontoRow: {
      flexDirection: "row" as const,
      paddingVertical: 8,
      borderBottom: `0.5pt solid ${C.gray100}`,
    },
    confrontoCell: { fontSize: 10, color: C.gray700 },
    confrontoCellStrong: { fontSize: 10, fontWeight: 700, color: C.gray900 },
    confrontoCellDelta: { fontSize: 10, fontWeight: 700, color: C.successText },

    // Certificazioni strip
    certStrip: {
      flexDirection: "row" as const, flexWrap: "wrap" as const,
      gap: 8, marginTop: 12, paddingTop: 12,
      borderTop: `0.5pt solid ${C.gray100}`,
    },
    certBadge: {
      paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: 4,
      backgroundColor: C.gray100,
      borderWidth: 0.5, borderColor: C.gray200, borderStyle: "solid" as const,
    },
    certBadgeText: { fontSize: 8.5, fontWeight: 600, color: C.gray700 },

    // Bonus box (value stacking)
    bonusBox: {
      backgroundColor: C.successBg,
      borderLeft: `3pt solid ${C.successText}`,
      borderRadius: 6,
      padding: 10, marginBottom: 6,
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },
    bonusTitolo: { fontSize: 11, fontWeight: 700, color: C.successText, flex: 1 },
    bonusValore: { fontSize: 11, fontWeight: 700, color: C.successText },

    // FAQ
    faqItem: {
      marginBottom: 12,
      paddingBottom: 10,
      borderBottom: `0.5pt solid ${C.gray100}`,
    },
    faqDomanda: { fontSize: 11, fontWeight: 700, color: C.gray900, marginBottom: 4 },
    faqRisposta: { fontSize: 10, color: C.gray700, lineHeight: 1.5 },

    // Brand footer / Condizioni legali
    brandFooter: {
      fontSize: 8, color: C.gray500, lineHeight: 1.5,
      paddingTop: 8, marginTop: 12,
      borderTop: `0.5pt solid ${C.gray200}`,
      textAlign: "center" as const,
    },
    condizioniText: {
      fontSize: 9, color: C.gray700, lineHeight: 1.55,
      fontFamily: FF,
    },
  });
}

// ─── Helpers formatting ────────────────────────────────────────────────────

/**
 * Importo all'italiana, con il punto delle migliaia anche sotto le 10.000:
 * toLocaleString("it-IT") raggruppa solo da cinque cifre e stampava «8699,11».
 */
function fmtEuro(v: number | null | undefined, decimals = 0): string {
  const n = Number(v ?? 0);
  const valore = Number.isFinite(n) ? n : 0;
  const [intero, decimali] = Math.abs(valore).toFixed(decimals).split(".");
  const conPunti = intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const segno = valore < 0 && Number(Math.abs(valore).toFixed(decimals)) !== 0 ? "-" : "";
  return `${segno}${conPunti}${decimali ? `,${decimali}` : ""}`;
}

/** Il meno tipografico «−» non esiste in Helvetica e nel PDF sparisce: si stampa quello della tastiera. */
const senzaMenoTipografico = (testo: string | null | undefined) => (testo ?? "").replace(/−/g, "-");
function roundMoney(v: number | null | undefined): number {
  const n = Number(v ?? 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return d; }
}
/**
 * «Via della Prova 1, Brescia · 2° piano». Prima usciva «Brescia, · piano 2° piano»:
 * virgola davanti al punto e la parola «piano» ripetuta quando la si scrive a mano.
 */
function rigaCantiere(p: {
  cantiere_indirizzo?: string | null;
  cantiere_citta?: string | null;
  cantiere_piano?: string | null;
}): string {
  const piano = (p.cantiere_piano ?? "").trim();
  return [
    [p.cantiere_indirizzo, p.cantiere_citta].filter(Boolean).join(", "),
    piano ? (/piano/i.test(piano) ? piano : `piano ${piano}`) : "",
  ].filter(Boolean).join(" · ");
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });
  } catch { return d; }
}
function tipologiaLabel(t: string): string {
  return SR_TIPOLOGIE_SERRAMENTO.find((x) => x.value === t)?.label ?? t;
}
function materialeLabel(m: string | null | undefined): string {
  if (!m) return "—";
  return SR_MATERIALI.find((x) => x.value === m)?.label ?? m;
}

/**
 * Risolve il materiale "vero" da mostrare nel PDF a partire dalla scheda
 * tecnica del listino (`family.custom_field_values.materiale_profilo`).
 * Mappa i valori interni (es. "pvc") all'etichetta umana ("PVC").
 * Ritorna null se la family non ha questa info → il chiamante usa il
 * fallback legacy `s.materiale`.
 */
function materialeFromFamily(
  family: { custom_field_values?: Record<string, unknown> | null } | null | undefined,
): string | null {
  if (!family?.custom_field_values) return null;
  const raw = family.custom_field_values["materiale_profilo"];
  if (typeof raw !== "string" || raw.trim() === "") return null;
  // Stessa mappa usata in StepBom.SerramentoRow per coerenza UI ↔ PDF.
  const map: Record<string, string> = {
    pvc: "PVC",
    alluminio: "Alluminio",
    legno: "Legno",
    legno_alluminio: "Legno-alluminio",
  };
  return map[raw] ?? raw;
}

// Raggruppa serramenti per (family_id, tipologia, materiale, serie, vetro,
// L, H, ambiente, colore_int, colore_est). Serramenti completamente identici
// si sommano; qualunque differenza (anche solo il colore) → riga separata.
// Importante per il documento tecnico: l'installatore deve vedere ogni "lotto"
// in modo distinto.
function groupSerramentiAdvanced(serr: SrSerramentoRow[]): Array<{
  key: string;
  tipologia: string;
  materiale: string;
  serie: string;
  vetro: string;
  ambiente: string;
  colore_interno: string;
  colore_esterno: string;
  larghezza: number | null;
  altezza: number | null;
  quantita: number;
  family_id: string | null;
  supplier_catalog_id: string | null;
  supplier_product_line_id: string | null;
  /** Override macrocategoria per BOM manuali senza family_id */
  macrocategoria_override_id: string | null;
  /** Note libere salvate sulla riga BOM (es. "🎁 OMAGGIO · Condizioni: ...",
   *  oppure descrizione di una voce off-listino). */
  note: string | null;
  /** Snapshot scelte assi (Variabili Prodotto) della family. Usato dal PDF
   *  per stampare la VERA configurazione scelta dal commerciale (es.
   *  "Profilo: Square +8%") invece dei default della scheda tecnica family. */
  valori_assi: Record<string, string>;
  /** La voce scelta dentro ogni valore: il colore vero di «Colore Standard». */
  scelte_assi: Record<string, string>;
  prezzo_totale: number;
  /** True se la riga e' un omaggio commerciale (prezzo=0 + nota OMAGGIO). */
  is_omaggio: boolean;
  /** True se la posa e' stata esclusa dal commerciale (solo fornitura). */
  posa_esclusa: boolean;
  /** IDs dei serramenti aggregati nel gruppo. Usato da M9 per linkare le
   *  foto sopralluogo/render via sr_progetti_media.serramento_id. */
  serramento_ids: string[];
}> {
  const map = new Map<string, {
    key: string; tipologia: string; materiale: string; serie: string;
    vetro: string; ambiente: string; colore_interno: string; colore_esterno: string;
    larghezza: number | null; altezza: number | null;
    quantita: number; family_id: string | null;
    supplier_catalog_id: string | null;
    supplier_product_line_id: string | null;
    macrocategoria_override_id: string | null;
    note: string | null;
    valori_assi: Record<string, string>;
    scelte_assi: Record<string, string>;
    prezzo_totale: number;
    is_omaggio: boolean;
    posa_esclusa: boolean;
    serramento_ids: string[];
  }>();
  for (const s of serr) {
    const L = s.larghezza_mm ?? null;
    const H = s.altezza_mm ?? null;
    const ci = s.colore_interno ?? "";
    const ce = s.colore_esterno ?? "";
    const noteVal = s.note ?? null;
    const isOmaggio = (s.prezzo_totale ?? 0) === 0 && /\bOMAGGIO\b/i.test(noteVal ?? "");
    const assi = (s.valori_assi ?? {}) as Record<string, string>;
    // KEY include anche valori_assi (snapshot scelte commerciale) e note
    // (per non aggregare 2 righe identiche con condizioni diverse).
    // Senza, due "PORTA BALCONE" con Profilo "Square" vs "Etrum" verrebbero
    // mostrate come UNA riga ×2 con scheda tecnica ambigua nel PDF.
    const assiKey = Object.entries(assi).sort().map(([k, v]) => `${k}=${v}`).join(";");
    // Anche la voce dentro il valore: due finestre «Colore Standard», una grigio
    // antracite e una effetto noce, non sono la stessa riga ×2.
    const scelte = (s.scelte_assi ?? {}) as Record<string, string>;
    const scelteKey = Object.entries(scelte).sort().map(([k, v]) => `${k}=${v}`).join(";");
    const manualLabelKey = (s.tipologia_label ?? s.tipologia ?? "").trim();
    const baseKey = s.family_id
      ? `fam-${s.family_id}__${s.tipologia}`
      : `oth-${s.tipologia}__${manualLabelKey}__${s.materiale ?? ""}__${s.serie ?? ""}__${s.vetro ?? ""}`;
    // posa_esclusa fa parte della key: 2 righe identiche ma una "con posa" e
    // una "senza posa" devono restare separate (prezzo unitario diverso).
    const posaKey = s.posa_esclusa ? "noposa" : "posa";
    const supplierKey = `sup-${s.supplier_catalog_id ?? "-"}__line-${s.supplier_product_line_id ?? "-"}`;
    const key = `${baseKey}__${supplierKey}__${L ?? "-"}x${H ?? "-"}__${s.ambiente ?? ""}__${ci}__${ce}__${assiKey}__${scelteKey}__${noteVal ?? ""}__${posaKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantita += s.quantita ?? 1;
      existing.prezzo_totale += Number(s.prezzo_totale ?? 0);
      existing.serramento_ids.push(s.id);
    }
    else map.set(key, {
      key,
      tipologia: s.family_id ? tipologiaLabel(s.tipologia) : (s.tipologia_label || tipologiaLabel(s.tipologia)),
      materiale: materialeLabel(s.materiale),
      serie: s.serie ?? "",
      vetro: s.vetro ?? "",
      ambiente: s.ambiente ?? "",
      colore_interno: ci,
      colore_esterno: ce,
      larghezza: L,
      altezza: H,
      quantita: s.quantita ?? 1,
      family_id: s.family_id ?? null,
      supplier_catalog_id: s.supplier_catalog_id ?? null,
      supplier_product_line_id: s.supplier_product_line_id ?? null,
      macrocategoria_override_id: s.macrocategoria_override_id ?? null,
      note: noteVal,
      valori_assi: assi,
      scelte_assi: scelte,
      prezzo_totale: Number(s.prezzo_totale ?? 0),
      is_omaggio: isOmaggio,
      posa_esclusa: s.posa_esclusa ?? false,
      serramento_ids: [s.id],
    });
  }
  return Array.from(map.values());
}

/** Etichette di variante e valore per il PDF, con descrizione e valore di serie dell'asse. */
type EtichettaVariantePdf = {
  axisLabel: string;
  valueLabel: string;
  valueDescrizione?: string | null;
  axisDefaultLabel?: string | null;
  valueConElenco?: boolean;
};

/**
 * Le varianti scelte su un gruppo di righe, lette come le descrive il titolare:
 * linea nel titolo, colore interno ed esterno, vetro e telaio su una riga
 * ciascuno, i dati tecnici dei valori scelti (schedaPosizione).
 */
function schedaDelGruppo(
  g: {
    family_id: string | null;
    valori_assi: Record<string, string>;
    scelte_assi: Record<string, string>;
    colore_interno: string;
    colore_esterno: string;
    vetro: string;
  },
  etichette: Record<string, EtichettaVariantePdf>,
) {
  return schedaPosizione(
    Object.entries(g.valori_assi ?? {}).flatMap(([codice, valueId]) => {
      const etichetta = g.family_id ? etichette[`${g.family_id}|${codice}|${valueId}`] : undefined;
      return etichetta
        ? [
            {
              codice,
              nomeAsse: etichetta.axisLabel,
              valore: etichetta.valueLabel,
              voce: g.scelte_assi?.[codice] ?? null,
              descrizione: etichetta.valueDescrizione ?? null,
              diSerie: etichetta.axisDefaultLabel ?? null,
              conElenco: etichetta.valueConElenco ?? false,
            },
          ]
        : [];
    }),
    { coloreInterno: g.colore_interno, coloreEsterno: g.colore_esterno, vetro: g.vetro },
  );
}

// Format display value di un custom_field per il PDF (select → label, etc).
function formatFieldDisplay(field: SerramentoPdfMacroField, raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (field.field_type === "select" && typeof raw === "string") {
    const opt = field.field_options?.find((o) => o.value === raw);
    return opt?.label ?? raw;
  }
  if (field.field_type === "multiselect" && Array.isArray(raw)) {
    return (raw as string[])
      .map((v) => field.field_options?.find((o) => o.value === v)?.label ?? v)
      .join(", ");
  }
  if (field.field_type === "boolean") return raw ? "Sì" : "No";
  return String(raw);
}

// ─── SVG: Decoro cover (5 varianti M19) ────────────────────────────────────
// Renderizza una decorazione 180×180pt in alto a destra della cover.
// La variant 'square' è il default storico = finestra stilizzata (4 ante).
// Le altre varianti sono accenti più minimal per cover modern.

function CoverDecorationSvg({
  color,
  variant = "square",
}: {
  color: string;
  variant?: "square" | "circle" | "line" | "pattern" | "none";
}) {
  if (variant === "none") return null;

  const svgProps = { viewBox: "0 0 180 180", style: { width: 180, height: 180 } as never };

  if (variant === "circle") {
    // Cerchio outline + accent ring concentrico. Tono pulito.
    return (
      <Svg {...svgProps}>
        <Circle cx={90} cy={90} r={80} stroke={color} strokeWidth={3} fill="none" opacity={0.7} />
        <Circle cx={90} cy={90} r={56} stroke={color} strokeWidth={1.5} fill="none" opacity={0.4} />
        <Circle cx={90} cy={90} r={32} stroke={color} strokeWidth={1} fill="none" opacity={0.25} />
      </Svg>
    );
  }

  if (variant === "line") {
    // Linea verticale + 2 tick orizzontali. Tono editorial sobrio.
    return (
      <Svg {...svgProps}>
        <Path d="M 90 10 L 90 170" stroke={color} strokeWidth={2.5} opacity={0.7} />
        <Path d="M 70 40 L 110 40" stroke={color} strokeWidth={1.5} opacity={0.5} />
        <Path d="M 70 140 L 110 140" stroke={color} strokeWidth={1.5} opacity={0.5} />
      </Svg>
    );
  }

  if (variant === "pattern") {
    // Pattern 5×5 di dots. Tono tech/architectural.
    const dots = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        dots.push(
          <Circle
            key={`${r}-${c}`}
            cx={30 + c * 30}
            cy={30 + r * 30}
            r={3}
            fill={color}
            opacity={0.45}
          />,
        );
      }
    }
    return <Svg {...svgProps}><G>{dots}</G></Svg>;
  }

  // variant === "square" (default storico — finestra stilizzata)
  return (
    <Svg {...svgProps}>
      {/* Finestra a 4 ante stilizzata */}
      <G opacity={0.7}>
        <Rect x={20} y={20} width={140} height={140} rx={6} stroke={color} strokeWidth={3} fill="none" />
        <Path d={`M 90 25 L 90 155`} stroke={color} strokeWidth={2} />
        <Path d={`M 25 90 L 155 90`} stroke={color} strokeWidth={2} />
        {/* Maniglia */}
        <Circle cx={84} cy={90} r={3} fill={color} />
        {/* Riflessi sui vetri */}
        <Path d={`M 35 35 L 55 35 L 35 55 Z`} fill={color} opacity={0.25} />
        <Path d={`M 95 95 L 115 95 L 95 115 Z`} fill={color} opacity={0.25} />
      </G>
      {/* Raggi/decoro intorno */}
      <G opacity={0.3}>
        <Path d="M 0 90 L 18 90" stroke={color} strokeWidth={1.5} />
        <Path d="M 162 90 L 180 90" stroke={color} strokeWidth={1.5} />
        <Path d="M 90 0 L 90 18" stroke={color} strokeWidth={1.5} />
        <Path d="M 90 162 L 90 180" stroke={color} strokeWidth={1.5} />
      </G>
    </Svg>
  );
}

// GanttSvg (cronoprogramma) rimosso: la timeline è stata sostituita dalla
// pagina "Il tuo percorso" configurabile dal template editor.

// ─── SVG: Icone garanzie ───────────────────────────────────────────────────
// Helvetica non rende emoji unicode, quindi disegniamo a mano gli SVG per
// le 8 icone supportate. 18×18 viewbox, stroke-style minimal.

function GaranziaIconSvg({ kind, color }: { kind: string; color: string }) {
  const svgProps = { viewBox: "0 0 24 24", style: { width: 16, height: 16 } as never };
  switch (kind) {
    case "shield":
      return (
        <Svg {...svgProps}>
          <Path d="M 12 2 L 4 6 L 4 12 C 4 16 7 20 12 22 C 17 20 20 16 20 12 L 20 6 Z" stroke={color} strokeWidth={2} fill="none" />
          <Path d="M 9 12 L 11 14 L 15 10" stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
    case "tools":
      return (
        <Svg {...svgProps}>
          <Path d="M 14 6 L 18 2 L 22 6 L 18 10 Z" stroke={color} strokeWidth={2} fill="none" />
          <Path d="M 17 7 L 7 17 L 4 20 L 2 18 L 5 15 L 15 5" stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
    case "money":
      return (
        <Svg {...svgProps}>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M 12 7 L 12 17 M 9 10 L 12 8 L 15 10 M 9 14 L 12 16 L 15 14" stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
    case "drop":
      return (
        <Svg {...svgProps}>
          <Path d="M 12 2 C 8 8 5 12 5 16 C 5 19 8 22 12 22 C 16 22 19 19 19 16 C 19 12 16 8 12 2 Z" stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
    case "refresh":
      return (
        <Svg {...svgProps}>
          <Path d="M 4 12 A 8 8 0 0 1 20 12 M 20 7 L 20 12 L 15 12 M 20 12 A 8 8 0 0 1 4 12 M 4 17 L 4 12 L 9 12" stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
    case "clock":
      return (
        <Svg {...svgProps}>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M 12 7 L 12 12 L 16 14" stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
    case "award":
      return (
        <Svg {...svgProps}>
          <Circle cx={12} cy={9} r={6} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M 8 14 L 6 22 L 12 19 L 18 22 L 16 14" stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
    default:
      return (
        <Svg {...svgProps}>
          <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={2} fill="none" />
          <Path d="M 12 2 L 12 6 M 12 18 L 12 22 M 2 12 L 6 12 M 18 12 L 22 12" stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      );
  }
}

// ─── SVG: Cashflow 10 anni ─────────────────────────────────────────────────

function CashflowSvg({ years, primary, breakEvenColor = "#15803D" }: {
  years: Array<{ year: number; cumulato: number }>;
  primary: string;
  breakEvenColor?: string;
}) {
  if (years.length === 0) return null;
  const W = 520;
  const H = 180;
  const padL = 50;   // più spazio a sx per label Y
  const padR = 16;
  const padT = 18;
  const padB = 28;   // spazio per label X (A1..A10)
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Asse Y: scala simmetrica intorno a zero, basata sul min e max reali
  const cumulati = years.map((y) => y.cumulato);
  const yMin = Math.min(0, ...cumulati);
  const yMax = Math.max(0, ...cumulati);
  const range = Math.max(yMax - yMin, 1);
  const yOf = (v: number) => padT + chartH - ((v - yMin) / range) * chartH;
  const xStep = chartW / Math.max(years.length - 1, 1);
  const xOf = (i: number) => padL + i * xStep;

  const points = years.map((y, i) => `${xOf(i)},${yOf(y.cumulato)}`).join(" ");
  const zeroY = yOf(0);

  // Break-even: anno in cui cumulato passa da negativo a positivo (interpolato).
  let breakX: number | null = null;
  let breakYear: number | null = null;
  for (let i = 1; i < years.length; i++) {
    const a = years[i - 1].cumulato;
    const b = years[i].cumulato;
    if (a < 0 && b >= 0) {
      const t = a === b ? 0 : -a / (b - a);
      breakX = xOf(i - 1) + t * xStep;
      // Stima dell'anno con 1 decimale
      breakYear = years[i - 1].year + t * (years[i].year - years[i - 1].year);
      break;
    }
  }
  if (breakX === null && years[0]?.cumulato >= 0) {
    breakX = xOf(0);
    breakYear = years[0].year;
  }

  // Tick Y a multipli sensati. Quelli attaccati alla linea dello zero non si
  // scrivono: la linea ha già la sua etichetta «0» e le due si sovrapponevano.
  const yTicks = [yMin, (yMin + yMax) / 2, yMax]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .filter((v) => Math.abs(yOf(v) - zeroY) >= 8);

  // Area: chiude sotto la linea zero (per evidenziare la perdita iniziale)
  // e sopra quando recupera.
  const areaPath =
    `M ${xOf(0)},${zeroY} ` +
    years.map((y, i) => `L ${xOf(i)},${yOf(y.cumulato)}`).join(" ") +
    ` L ${xOf(years.length - 1)},${zeroY} Z`;

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H } as never}>
      {/* Linea zero (orizzontale) */}
      <Path d={`M ${padL} ${zeroY} L ${W - padR} ${zeroY}`} stroke="#94A3B8" strokeWidth={0.5} />
      {/* Label "0" sulla linea zero */}
      <Text x={padL - 6} y={zeroY + 3} fill="#64748B" style={{ fontSize: 7, textAnchor: "end" } as never}>0</Text>
      {/* Tick Y min/max */}
      {yTicks.map((v, i) => (
        <G key={`yt-${i}`}>
          <Path d={`M ${padL - 3} ${yOf(v)} L ${padL} ${yOf(v)}`} stroke="#94A3B8" strokeWidth={0.5} />
          {/* Stringa UNICA: il Text dentro <Svg> con children misti
              (stringa+numero) renderizzava glifi rotti ("€ θ k") */}
          <Text x={padL - 6} y={yOf(v) + 3} fill="#64748B" style={{ fontSize: 7, textAnchor: "end" } as never}>
            {`${Math.round(v / 1000) < 0 ? "-" : ""}€ ${Math.abs(Math.round(v / 1000))}k`}
          </Text>
        </G>
      ))}
      {/* Area sotto curva (rosso/area negativa, verde dopo break-even) */}
      <Path d={areaPath} fill={primary} opacity={0.12} />
      {/* Curva principale */}
      <Path d={`M ${points}`} stroke={primary} strokeWidth={1.8} fill="none" />
      {/* Punti */}
      {years.map((y, i) => (
        <Circle key={`p-${i}`} cx={xOf(i)} cy={yOf(y.cumulato)} r={2.2} fill={primary} />
      ))}
      {/* Label X: tutti gli anni fino a 12 (uscivano A1, A2, A4, A6…), oltre uno sì e uno no */}
      {years.map((y, i) => {
        const showLabel = years.length <= 12 || i % 2 === 0;
        if (!showLabel) return null;
        return (
          <Text
            key={`x-${i}`}
            x={xOf(i)} y={H - 8}
            fill="#64748B"
            style={{ fontSize: 7, textAnchor: "middle" } as never}
          >
            {/* Stringa unica, come per l'asse Y: «A{y.year}» usciva spaziato («A 1») */}
            {`A${y.year}`}
          </Text>
        );
      })}
      {/* Linea break-even verticale */}
      {breakX !== null && breakYear !== null && (
        <G>
          <Path
            d={`M ${breakX} ${padT} L ${breakX} ${padT + chartH}`}
            stroke={breakEvenColor} strokeWidth={1} strokeDasharray="3 2"
          />
          <Rect
            x={Math.max(padL, breakX - 38)} y={padT + 2}
            width={76} height={14} rx={3}
            fill={breakEvenColor}
          />
          <Text
            x={Math.max(padL + 38, breakX)} y={padT + 12}
            fill="#FFFFFF"
            style={{ fontSize: 8, fontWeight: 700, textAnchor: "middle" } as never}
          >
            Break-even A{breakYear.toFixed(1)}
          </Text>
        </G>
      )}
    </Svg>
  );
}

// ─── Subcomponenti ─────────────────────────────────────────────────────────

function PageHeader({ code, clienteNome, companyName, logoUrl, primaryColor, styles }: {
  code: string; clienteNome: string; companyName: string;
  logoUrl?: string | null; primaryColor: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        {logoUrl ? (
          <Image src={logoUrl} style={styles.headerLogo} />
        ) : (
          <View style={[styles.headerLogo, { backgroundColor: primaryColor, alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: testoSopra(primaryColor), fontSize: 14, fontWeight: 700 }}>
              {(companyName || "S").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View>
          <Text style={styles.headerName}>{companyName}</Text>
          <Text style={{ fontSize: 7.5, color: "#64748B" }}>{clienteNome}</Text>
        </View>
      </View>
      <View style={styles.headerRight}>
        <Text>STIMA N.</Text>
        <Text style={styles.headerStimaCode}>{code}</Text>
      </View>
    </View>
  );
}

function PageFooter({
  companyName, indirizzo, telefono, email, vat, website, styles,
  quoteCode, revisionNumber, showRevisionFooter,
  capitaleSociale, numeroRea, pec, showLegalFooter,
}: {
  companyName: string;
  indirizzo?: string | null; telefono?: string | null; email?: string | null;
  vat?: string | null; website?: string | null;
  styles: ReturnType<typeof makeStyles>;
  /** Codice preventivo (es. "SR-2026-001") — usato dal footer versioning. */
  quoteCode?: string | null;
  /** Numero revisione (1 = originale). Mostrato come "v1/v2/v3" nel footer. */
  revisionNumber?: number;
  /** Toggle dal template azienda (pdf_show_revision_footer). Default true. */
  showRevisionFooter?: boolean;
  /** Milestone 3 white-label legal footer */
  capitaleSociale?: string | null;
  numeroRea?: string | null;
  pec?: string | null;
  showLegalFooter?: boolean;
}) {
  const line1 = [indirizzo, telefono, email].filter(Boolean).join(" · ");
  const line2 = [vat ? `P.IVA ${vat}` : null, website].filter(Boolean).join(" · ");
  // Milestone 3 · footer legale esteso (REA + capitale + PEC) — opt-in.
  const legalLine = showLegalFooter
    ? [
        capitaleSociale ? `Cap. Soc. ${capitaleSociale}` : null,
        numeroRea ? `REA ${numeroRea}` : null,
        pec ? `PEC: ${pec}` : null,
      ].filter(Boolean).join(" · ")
    : "";
  // Milestone 2: footer versione preventivo. Visibile se toggle ON (default).
  // Format: "Preventivo SR-001 · v2 · pagina 3/8 · 13/05/2026"
  const showRevFooter = showRevisionFooter !== false && !!quoteCode;
  const dateStr = new Date().toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerRow}>
        <Text style={styles.footerCompanyName}>{companyName}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
      {Boolean(line1) && <View style={styles.footerRow}><Text>{line1}</Text><Text></Text></View>}
      {Boolean(line2) && <View style={styles.footerRow}><Text>{line2}</Text><Text></Text></View>}
      {Boolean(legalLine) && <View style={styles.footerRow}><Text>{legalLine}</Text><Text></Text></View>}
      {showRevFooter && (
        <View style={styles.footerRow}>
          {/* Il numero di pagina sta già nella prima riga del piè di pagina. */}
          <Text>{`Preventivo ${quoteCode} · v${revisionNumber ?? 1} · ${dateStr}`}</Text>
          <Text></Text>
        </View>
      )}
    </View>
  );
}

// ─── Milestone 4 · Subhero template renderer ──────────────────────────────
// Espande placeholders del tipo {variabile} usando i dati del progetto.
// Placeholder unknown vengono lasciati testuali (es. "{foo}" → "{foo}") per
// debug visibility; in produzione l'azienda non vedrà mai stringhe rotte
// perché il template editor mostra la preview live.
function renderSubheroTemplate(template: string, detail: SrProgettoDetail): string {
  const p = detail.progetto;
  const nomeCompleto = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ").trim();
  const numSerramenti = detail.serramenti.reduce(
    (acc, s) => acc + (s.quantita ?? 1),
    0,
  );
  const dataConsegna = (() => {
    if (p.valido_fino_data) {
      // Se c'è una validità, la usiamo come "consegna stimata" indicativa.
      return new Date(p.valido_fino_data).toLocaleDateString("it-IT", {
        day: "numeric", month: "long",
      });
    }
    if (p.valido_fino_giorni) {
      const d = new Date(Date.now() + p.valido_fino_giorni * 24 * 60 * 60 * 1000);
      return d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
    }
    return "data da definire";
  })();
  const replacements: Record<string, string> = {
    cliente_nome: p.cliente_nome ?? "",
    cliente_cognome: p.cliente_cognome ?? "",
    cliente_nome_completo: nomeCompleto || "cliente",
    cantiere_citta: p.cantiere_citta ?? p.cliente_citta ?? "—",
    cantiere_provincia: p.cantiere_provincia ?? p.cliente_provincia ?? "",
    num_serramenti: String(numSerramenti || 0),
    data_consegna_stimata: dataConsegna,
    tipo_intervento: p.tipo_intervento ?? "intervento",
    anno: String(new Date().getFullYear()),
  };
  return template.replace(/\{([a-z_]+)\}/gi, (full, key) => {
    const k = String(key).toLowerCase();
    return replacements[k] !== undefined ? replacements[k] : full;
  });
}

// ─── Mini-renderer HTML (output rich-text TipTap) → nodi react-pdf ──────────
// @react-pdf NON interpreta l'HTML: senza questo i tag <p>/<strong>/<span> escono
// LETTERALI nel PDF. Parser regex bounded (no DOM) che supporta i tag prodotti
// dall'editor: <p>, <h1-6>, <ul>/<ol>/<li>, <br>, <strong>/<b>, <em>/<i>, <u>,
// <s>/<strike>, <span style="font-size:Npx">. Per il testo semplice (senza tag)
// il chiamante usa il rendering classico (split paragrafi/bullet).
function isLikelyHtml(s: string): boolean {
  return /<\/?(p|br|strong|b|em|i|u|s|span|ul|ol|li|h[1-6]|div)\b[^>]*>/i.test(s);
}
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, "’")
    .replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à").replace(/&ograve;/g, "ò").replace(/&ugrave;/g, "ù");
}
/* eslint-disable @typescript-eslint/no-explicit-any */
function parseInlineHtml(frag: string, kp: string): any[] {
  const out: any[] = [];
  const re = /<(strong|b|em|i|u|s|strike|span)([^>]*)>([\s\S]*?)<\/\1>|<br\s*\/?>/gi;
  let last = 0, k = 0, m: RegExpExecArray | null;
  const pushText = (raw: string) => {
    const t = decodeEntities(raw.replace(/<[^>]+>/g, ""));
    if (t) out.push(<Text key={`${kp}t${k++}`}>{t}</Text>);
  };
  while ((m = re.exec(frag))) {
    if (m.index > last) pushText(frag.slice(last, m.index));
    if (/^<br/i.test(m[0])) {
      out.push(<Text key={`${kp}br${k++}`}>{"\n"}</Text>);
    } else {
      const tag = m[1].toLowerCase();
      const st: any = {};
      if (tag === "strong" || tag === "b") st.fontWeight = 700;
      else if (tag === "em" || tag === "i") st.fontStyle = "italic";
      else if (tag === "u") st.textDecoration = "underline";
      else if (tag === "s" || tag === "strike") st.textDecoration = "line-through";
      else if (tag === "span") {
        const fs = (m[2] || "").match(/font-size:\s*(\d+(?:\.\d+)?)/i);
        if (fs) st.fontSize = Math.max(7, Math.min(28, Math.round(Number(fs[1]))));
      }
      out.push(<Text key={`${kp}s${k++}`} style={st}>{parseInlineHtml(m[3], `${kp}${k}-`)}</Text>);
    }
    last = re.lastIndex;
  }
  if (last < frag.length) pushText(frag.slice(last));
  return out.length ? out : [<Text key={`${kp}e`}>{decodeEntities(frag.replace(/<[^>]+>/g, ""))}</Text>];
}
function htmlToPdfNodes(html: string, baseStyle: any, keyPrefix: string): any[] {
  const nodes: any[] = [];
  const blockRe = /<(p|h[1-6]|ul|ol)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let mb: RegExpExecArray | null, bi = 0, matched = false;
  while ((mb = blockRe.exec(html))) {
    matched = true;
    const tag = mb[1].toLowerCase();
    if (tag === "ul" || tag === "ol") {
      const items = [...mb[3].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      nodes.push(
        <View key={`${keyPrefix}L${bi++}`} style={{ marginBottom: 6 }}>
          {items.map((it, li) => (
            <View key={li} style={{ flexDirection: "row", marginBottom: 2 }}>
              <Text style={[baseStyle, { marginRight: 4 }]}>{"•"}</Text>
              <Text style={baseStyle}>{parseInlineHtml(it[1], `${keyPrefix}L${bi}-${li}-`)}</Text>
            </View>
          ))}
        </View>
      );
    } else {
      const isH = tag.startsWith("h");
      nodes.push(
        <Text key={`${keyPrefix}P${bi++}`} style={[baseStyle, { marginBottom: 6 }, isH ? { fontWeight: 700 } : {}]}>
          {parseInlineHtml(mb[3], `${keyPrefix}P${bi}-`)}
        </Text>
      );
    }
  }
  if (!matched) {
    nodes.push(
      <Text key={`${keyPrefix}P0`} style={[baseStyle, { marginBottom: 6 }]}>
        {parseInlineHtml(html, `${keyPrefix}0-`)}
      </Text>
    );
  }
  return nodes;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Tipo input ────────────────────────────────────────────────────────────

export interface SerramentoPDFProps {
  detail: SrProgettoDetail;
  template?: SrTemplatePdfRow | null;
  company?: {
    name?: string | null;
    ragione_sociale?: string | null;
    indirizzo?: string | null;
    telefono?: string | null;
    email?: string | null;
    partita_iva?: string | null;
    logo_url?: string | null;
    /** Versione chiara del logo (Brand & Azienda) per la copertina su sfondo scuro. */
    brand_logo_dark_url?: string | null;
    /** Colore del marchio (Brand & Azienda): vale finché il modello resta al verde di fabbrica. */
    brand_primary_color?: string | null;
    website?: string | null;
  } | null;
  consulente: SerramentoPdfConsulente | null;
  familiesById: Record<string, SerramentoPdfFamilyData>;
  fieldsByMacro: Record<string, SerramentoPdfMacroField[]>;
  macroPagineDedicate: SerramentoPdfMacroPagina[];
  /** Mappa macrocategoria_id → nome. Renderizzato come breadcrumb
   *  "MACROCATEGORIA · Articolo" nella composizione serramenti del PDF. */
  macroNomeById?: Record<string, string>;
  /** Lookup label Variabili Prodotto: key="family_id|axis_codice|value_id".
   *  Permette di stampare le SCELTE del commerciale (es. "Profilo: Square")
   *  al posto del default scheda tecnica. */
  axisLabelByKey?: Record<string, EtichettaVariantePdf>;
  /** Lookup linea fornitore, usato nel BOM PDF per distinguere cataloghi e linee. */
  supplierLineById?: Record<string, SerramentoPdfSupplierLine>;
  /** Link pubblico della pagina firma da inserire nel PDF cliente. */
  publicUrl?: string | null;
  /** Macro_id default per BOM senza family e senza override esplicito. */
  autoFallbackMacroId?: string | null;
  /** Pagine «Il sistema scelto»: le schede delle linee usate nel preventivo. */
  lineeDedicate?: SerramentoPdfLineaPagina[];
}

/** Un testo scritto nel listino: una riga vuota fa un paragrafo, le righe con «- » un elenco. */
function TestoListinoPdf({
  testo, styles, C,
}: {
  testo: string;
  styles: ReturnType<typeof makeStyles>;
  C: ReturnType<typeof makePalette>;
}) {
  // Riga per riga: «Di serie:» resta testo e i «- …» sotto diventano punti dello
  // stesso paragrafo (con la regola «paragrafo tutto a punti» uscivano come testo).
  return (
    <>
      {testo.split(/\n\n+/).map((paragrafo, i) => (
        <View key={i} style={{ marginBottom: 8 }}>
          {paragrafo
            .split("\n")
            .map((r) => r.trim())
            .filter(Boolean)
            .map((riga, ri) =>
              /^[-•]\s/.test(riga) ? (
                <View key={ri} style={styles.bulletItem}>
                  <View style={styles.bulletDot} />
                  <Text style={{ flex: 1, fontSize: 10.5, color: C.gray700, lineHeight: 1.55 }}>
                    {riga.replace(/^[-•]\s*/, "")}
                  </Text>
                </View>
              ) : (
                <Text key={ri} style={{ fontSize: 11, color: C.gray700, lineHeight: 1.65 }}>
                  {riga}
                </Text>
              ),
            )}
        </View>
      ))}
    </>
  );
}

// ─── Componente principale ─────────────────────────────────────────────────

export function SerramentoPDF({
  detail, template, company,
  consulente, familiesById, fieldsByMacro, macroPagineDedicate,
  macroNomeById = {},
  axisLabelByKey = {},
  supplierLineById = {},
  publicUrl = null,
  autoFallbackMacroId = null,
  lineeDedicate = [],
}: SerramentoPDFProps) {
  const p = detail.progetto;
  const companyName = template?.ragione_sociale || company?.ragione_sociale || company?.name || "Azienda";
  const logoUrl = template?.logo_url || company?.logo_url || null;
  const coverLogoUrl = template?.pdf_cover_logo_url ?? company?.brand_logo_dark_url ?? logoUrl;
  const primaryColor = coloreDelDocumento(template?.colore_primario, company?.brand_primary_color, DEFAULT_PRIMARY) ?? DEFAULT_PRIMARY;
  const C = makePalette(primaryColor);
  const styles = makeStyles(C);

  const clienteNome = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "Cliente";
  const sintesi = p.intervento_sintesi?.trim()
    || generateInterventoSintesi(detail.serramenti, detail.accessori, p.tipo_intervento)
    || "Intervento da definire";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tpl = (template ?? {}) as any;

  // Sostituzione campi personalizzati {placeholder} su QUALSIASI testo/titolo del
  // template (non più solo il subhero cover). No-op sui testi senza placeholder, quindi
  // sicura anche sui valori di default. Variabili: cliente_nome, cliente_cognome,
  // cliente_nome_completo, cantiere_citta, cantiere_provincia, num_serramenti,
  // data_consegna_stimata, tipo_intervento, anno.
  const ph = (s: string | null | undefined): string =>
    typeof s === "string" && s ? renderSubheroTemplate(s, detail) : "";

  const coverHero = ph(tpl.pdf_cover_hero) || "La tua casa,\nfinalmente al caldo.";

  // ─── Milestone 4 · Cover subhero dinamico con placeholders ────────────
  // Priorità: pdf_cover_subhero_template (con placeholders) → pdf_cover_subhero
  // (statico) → sintesi auto-generata da BOM.
  const coverSubhero = (() => {
    const tmpl = tpl.pdf_cover_subhero_template as string | null | undefined;
    if (!tmpl?.trim()) return ph(tpl.pdf_cover_subhero) || sintesi;
    return renderSubheroTemplate(tmpl, detail);
  })();
  const coverEyebrow = ph(tpl.pdf_cover_eyebrow) || "LA TUA PROPOSTA PERSONALIZZATA";
  const coverImageUrl = tpl.pdf_cover_image_url || null;
  const coverOverlayOpacity = typeof tpl.pdf_cover_overlay_opacity === "number"
    ? Math.max(0, Math.min(100, tpl.pdf_cover_overlay_opacity)) / 100
    : 0.65;
  // M13 · stile overlay (flat | gradient | gradient_diag | vignette)
  const coverOverlayStyle: "flat" | "gradient" | "gradient_diag" | "vignette" =
    (["flat", "gradient", "gradient_diag", "vignette"] as const).includes(
      tpl.pdf_cover_overlay_style as "flat" | "gradient" | "gradient_diag" | "vignette"
    )
      ? (tpl.pdf_cover_overlay_style as "flat" | "gradient" | "gradient_diag" | "vignette")
      : "flat";
  // M17 · posizione logo cover (top_left | top_right | top_center | hidden)
  const coverLogoPosition: "top_left" | "top_right" | "top_center" | "hidden" =
    (["top_left", "top_right", "top_center", "hidden"] as const).includes(
      tpl.pdf_cover_logo_position as "top_left" | "top_right" | "top_center" | "hidden"
    )
      ? (tpl.pdf_cover_logo_position as "top_left" | "top_right" | "top_center" | "hidden")
      : "top_left";
  // M18 · allineamento verticale blocco testo cover (top | center | bottom)
  const coverTextVertical: "top" | "center" | "bottom" =
    (["top", "center", "bottom"] as const).includes(
      tpl.pdf_cover_text_vertical as "top" | "center" | "bottom"
    )
      ? (tpl.pdf_cover_text_vertical as "top" | "center" | "bottom")
      : "bottom";
  // M19 · variante decorazione cover (square | circle | line | pattern | none)
  const coverDecorationStyle: "square" | "circle" | "line" | "pattern" | "none" =
    (["square", "circle", "line", "pattern", "none"] as const).includes(
      tpl.pdf_cover_decoration_style as "square" | "circle" | "line" | "pattern" | "none"
    )
      ? (tpl.pdf_cover_decoration_style as "square" | "circle" | "line" | "pattern" | "none")
      : "square";
  const coverBgColor = normalizeHexColor(tpl.pdf_cover_bg_color, null); // null = usa C.coverBg default
  const coverEyebrowSize = typeof tpl.pdf_cover_eyebrow_size === "number"
    ? Math.max(8, Math.min(12, tpl.pdf_cover_eyebrow_size))
    : 10;
  const coverTitleSize = typeof tpl.pdf_cover_title_size === "number"
    ? Math.max(28, Math.min(54, tpl.pdf_cover_title_size))
    : 40;
  const coverSubtitleSize = typeof tpl.pdf_cover_subtitle_size === "number"
    ? Math.max(10, Math.min(15, tpl.pdf_cover_subtitle_size))
    : 13;
  const coverTextColor = normalizeHexColor(tpl.pdf_cover_text_color, "#FFFFFF") ?? "#FFFFFF";
  // L'occhiello senza un colore scelto prendeva il primario così com'è: con un
  // marchio nero (Ser Style) usciva nero sul fondo scuro, cioè non usciva. Ora il
  // primario si schiarisce finché si legge sul fondo della copertina.
  // Con la foto il testo sta sopra il velo scuro; senza, sopra il fondo scelto,
  // che può anche essere chiaro: lì il colore si scurisce invece di schiarirsi.
  const fondoSottoIlTesto = coverImageUrl ? "#1F2937" : (coverBgColor ?? C.coverBg);
  const coverEyebrowColor = normalizeHexColor(tpl.pdf_cover_eyebrow_color, null)
    ?? (testoSopra(fondoSottoIlTesto) === "#FFFFFF"
      ? testoSuScuro(C.primary, fondoSottoIlTesto, 4.5)
      : testoSuChiaro(C.primary, fondoSottoIlTesto, 4.5));
  // Il cartellino «Preparato per» riprende l'occhiello: un accento solo in
  // copertina, quello dell'azienda. Prima, senza un colore scelto, era ambra.
  const coverAccento = coverEyebrowColor;
  const coverTitleColor = normalizeHexColor(tpl.pdf_cover_title_color, coverTextColor) ?? coverTextColor;
  const coverSubtitleColor = normalizeHexColor(tpl.pdf_cover_subtitle_color, "#D1D5DB") ?? "#D1D5DB";
  const coverShowDecoration = tpl.pdf_cover_show_decoration !== false;
  const coverShowClientCard = tpl.pdf_cover_show_client_card !== false;
  const coverTextAlign = (tpl.pdf_cover_text_align === "center" ? "center" : "left") as "left" | "center";
  const coverContentTop = coverTextVertical === "top"
    ? (coverLogoPosition === "hidden" ? 96 : 166)
    : coverTextVertical === "center"
      ? 248
      : 322;
  const coverLogoPositionStyle = coverLogoPosition === "top_right"
    ? { position: "absolute" as const, top: 54, right: 54, alignItems: "flex-end" as const }
    : coverLogoPosition === "top_center"
      ? { position: "absolute" as const, top: 54, left: 54, right: 54, alignItems: "center" as const }
      : { position: "absolute" as const, top: 54, left: 54, alignItems: coverTextAlign === "center" ? "center" as const : "flex-start" as const };
  // Scala dimensione logo cover: % (60–160) → fattore moltiplicativo su maxWidth/height base.
  const coverLogoScale = typeof tpl.pdf_cover_logo_size === "number"
    ? Math.max(60, Math.min(160, tpl.pdf_cover_logo_size)) / 100
    : 1;
  const coverTextBlockStyle = {
    position: "absolute" as const,
    top: coverContentTop,
    left: 54,
    right: 54,
    alignItems: coverTextAlign === "center" ? "center" as const : "flex-start" as const,
  };

  // ─── Milestone 7 · Box prezzo arricchito (rata + recupero fiscale) ────
  // Toggle attivi solo se i dati sottostanti sono presenti sul preventivo.
  const mostraRataMensile = tpl.pdf_mostra_rata_mensile === true;
  const mostraRecuperoFiscale = tpl.pdf_mostra_recupero_fiscale !== false; // default true
  const mostraTabellaEcobonus = tpl.pdf_mostra_tabella_ecobonus === true; // default false
  const paginaArticoloDedicata = tpl.pdf_pagine_articolo_dedicate === true; // default false

  // Cast unico a `any` su company per accedere ai campi non ancora nel
  // type ufficiale (numero_rea, capitale_sociale, pec, anno_fondazione).
  // Le migrations 20270514020000 e 20270514070000 li aggiungono al DB ma
  // il tipo `company` qui è ancora il vecchio shape ereditato dal context.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyAny = (company ?? {}) as any;

  // ─── Milestone 10 · "Perché noi" data-driven ─────────────────────────
  // Le metriche sono memorizzate sul template come array di {label, value,
  // suffix?, icon?, auto_kind?}. Se auto_kind = "auto_anni_fondazione",
  // sostituiamo il value con (annoCorrente - company.anno_fondazione).
  // Se anno_fondazione mancante, scartiamo la metrica auto invece di
  // mostrare "—" o numeri spuri.
  const annoFondazione = Number(companyAny?.anno_fondazione ?? 0) || null;
  const annoCorrente = new Date().getFullYear();
  const percheNoiMetricheRaw = (Array.isArray(tpl.pdf_perche_noi_metriche)
    ? tpl.pdf_perche_noi_metriche
    : []) as Array<{ value: string; label: string; suffix?: string | null; icon?: string | null; auto_kind?: string | null }>;
  const percheNoiMetriche = percheNoiMetricheRaw
    .map((m) => {
      if (m.auto_kind === "auto_anni_fondazione") {
        if (!annoFondazione || annoFondazione > annoCorrente) return null;
        const anni = annoCorrente - annoFondazione;
        return { ...m, value: String(anni) };
      }
      return m;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .slice(0, 4); // max 4 per riga A4


  const ctaTitle = ph(tpl.pdf_cta_finale_titolo) || "Cosa fare adesso";
  const ctaSteps = (Array.isArray(tpl.pdf_cta_finale_passi) && tpl.pdf_cta_finale_passi.length > 0)
    ? (tpl.pdf_cta_finale_passi as string[]).map((s) => ph(s))
	    : [
	        "Chiarisci eventuali dubbi tecnici o commerciali",
	        "Conferma misure, finiture e condizioni definitive",
	        "Firma il preventivo e versa l'acconto concordato",
	        "Avviamo ordine, produzione e pianificazione della posa",
	      ];

  // "Chi siamo" — pagina opzionale subito dopo la cover
  const chiSiamoAttivo = !!tpl.chi_siamo_attivo;
  const chiSiamoFotoUrl = tpl.chi_siamo_foto_url || null;
  const chiSiamoTitolo = ph(tpl.chi_siamo_titolo) || `Chi siamo · ${companyName}`;
  const chiSiamoTesto = tpl.chi_siamo_testo ? ph(tpl.chi_siamo_testo) : null;

  // Recensioni — toggle
  const recensioniAttivo = tpl.recensioni_attivo !== false;

  // Render — disclaimer custom o default IT
  const renderDisclaimer = tpl.render_disclaimer ||
    "Il render AI è una simulazione indicativa pensata per aiutarti a immaginare il risultato estetico. L'immagine non sostituisce il progetto definitivo: il risultato finale dipende da rilievi tecnici, misure reali, materiali scelti, condizioni dell'ambiente e fattibilità esecutiva.";

  // Descrizione consulente — testo generico mostrato sotto nome+contatti
  const consulenteDescrizione = tpl.consulente_descrizione_default ||
    "Ti seguirò personalmente dal primo sopralluogo fino al collaudo finale. Per qualsiasi domanda o necessità durante il percorso, sarò il tuo punto di riferimento.";

  // Percorso cliente — pagina dedicata con fasi/step (default sensato se nullo)
  const percorso: SrPercorsoCliente = (tpl.percorso_cliente as SrPercorsoCliente | null) ?? SR_PERCORSO_DEFAULT;
  const percorsoAttivo = percorso.attivo;

  // ─── Blocchi conversione (CRO playbook) ──────────────────────────────────
  // Pattern: se l'utente ha attivato la pagina in "Ordine pagine" ma non ha
  // popolato i dati, usiamo i DEFAULT pronti all'uso. Così le pagine nuove
  // appaiono SUBITO nel PDF appena attivate, senza richiedere configurazione
  // manuale di ogni voce. L'admin può poi personalizzare nel tab Conversione.
  const garanzieRaw = (Array.isArray(tpl.garanzie) ? tpl.garanzie : []) as SrGaranzia[];
  const garanzie: SrGaranzia[] = garanzieRaw.length > 0 ? garanzieRaw : SR_GARANZIE_DEFAULT;
  const urgenzaAttiva = !!tpl.urgenza_attiva;
  const urgenzaTitolo = (tpl.urgenza_titolo as string | null) || "Offerta valida fino a";
  const urgenzaDescrizione = (tpl.urgenza_descrizione as string | null) || null;
  const earlyBirdAttivo = !!tpl.early_bird_attivo;
  const earlyBirdPct = Number(tpl.early_bird_pct ?? 0);
  const earlyBirdGiorni = Number(tpl.early_bird_giorni ?? 0);
  const confrontoTitolo = (tpl.confronto_titolo as string | null) || "Il salto di qualità che otterrai";
  const confrontoRigheRaw = (Array.isArray(tpl.confronto_righe) ? tpl.confronto_righe : []) as SrConfrontoRiga[];
  const confrontoRighe: SrConfrontoRiga[] = confrontoRigheRaw.length > 0 ? confrontoRigheRaw : SR_CONFRONTO_DEFAULT;
  // Le certificazioni solo se l'azienda le ha scritte: quelle di serie (ISO 9001,
  // UNI 11673…) finivano nel PDF di chi non le ha, come una dichiarazione.
  const certificazioni = (Array.isArray(tpl.certificazioni) ? tpl.certificazioni : []) as SrCertificazione[];
  // Omaggi: solo quelli che l'azienda ha scritto nel modello (es. d'estate «zanzariere
  // in omaggio»). Niente omaggi predefiniti: uscivano per tutte, con valori mai decisi.
  const bonus: SrBonus[] = ((Array.isArray(tpl.bonus_aggiuntivi) ? tpl.bonus_aggiuntivi : []) as SrBonus[])
    .filter((b) => Boolean(b?.titolo?.trim()));
  const faqItemsRaw = (Array.isArray(tpl.faq_items) ? tpl.faq_items : []) as SrFaq[];
  const faqItems: SrFaq[] = faqItemsRaw.length > 0 ? faqItemsRaw : SR_FAQ_DEFAULT;
  const brandFooterTesto = (tpl.brand_footer_testo as string | null) || null;
  // Merge tag dei blocchi importati dalla libreria ({{cliente.nome_completo}}, {{azienda.ragione_sociale}}…)
  // Senza condizioni scritte dall'azienda valgono quelle di base del settore.
  const condizioniLegaliTesto = applicaMergeTagModulo(
    String(tpl.condizioni_legali_testo ?? "").trim() || condizioniStandard("serramenti"),
    {
    companyName,
    companyVat: tpl.partita_iva ?? company?.vat_number ?? null,
    companyAddress: tpl.indirizzo_completo ?? null,
    companyEmail: tpl.email ?? company?.email ?? null,
    companyPhone: tpl.telefono ?? company?.phone ?? null,
    clienteNome: p.cliente_nome, clienteCognome: p.cliente_cognome,
    clienteEmail: p.cliente_email, clienteTelefono: p.cliente_telefono, clienteIndirizzo: p.cliente_indirizzo,
    cantiereCitta: p.cantiere_citta ?? p.cliente_citta ?? null,
      numero: p.code, dataDocumento: p.created_at ?? null,
      totale: null,
    },
  ) || null;
  // Fix integrazione · Toggle "attivo" devono essere rispettati anche dal PDF.
  // Prima il PDF ignorava i toggle e mostrava il footer/pagina se il testo
  // era valorizzato, anche se l'utente aveva disattivato il toggle nell'editor.
  // Adesso: il toggle è SOURCE OF TRUTH. Se attivo=false, NON renderizziamo
  // la pagina/footer anche se il testo è popolato (così l'utente può
  // disattivare temporaneamente senza perdere il contenuto).
  // I campi sono booleani con default `true` lato DB → undefined si tratta
  // come true (retrocompat).
  const brandFooterAttivo = tpl.brand_footer_attivo !== false;
  const condizioniLegaliAttivo = tpl.condizioni_legali_attivo !== false;
  const confrontoAttivo = tpl.confronto_attivo !== false;

  // Validità con countdown calcolato (per box urgenza)
  const validoGiorni = p.valido_fino_giorni ?? 15;
  const scadenzaPreventivo = (() => {
    const start = p.created_at ? new Date(p.created_at) : new Date();
    const end = new Date(start.getTime() + validoGiorni * 86400000);
    return end.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  })();
  const scadenzaEarlyBird = earlyBirdAttivo && earlyBirdGiorni > 0 ? (() => {
    const start = p.created_at ? new Date(p.created_at) : new Date();
    const end = new Date(start.getTime() + earlyBirdGiorni * 86400000);
    return end.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  })() : null;
  const percorsoTotaleStep = percorso.fasi.reduce((acc, f) => acc + f.step.length, 0);

  const totaleCalcolato = calcolaTotale(
    detail.serramenti,
    detail.accessori,
    {
      iva_percentuale: p.iva_percentuale ?? 10,
      sconto_percentuale: p.sconto_percentuale ?? 0,
      sconto_importo: p.sconto_importo ?? 0,
    },
    detail.servizi ?? [],
  );
  const totaleFallback = Number(p.totale_max || p.totale_min || 0);
  const ivaPctFallback = p.iva_percentuale === -1 ? 10 : Number(p.iva_percentuale ?? 0);
  const imponibileFallback = p.iva_inclusa && ivaPctFallback > 0
    ? totaleFallback / (1 + ivaPctFallback / 100)
    : totaleFallback;
  const totaleDocumento = roundMoney(totaleCalcolato.totale_iva_inclusa || totaleFallback);
  const totaleImponibile = roundMoney(totaleCalcolato.imponibile_netto || imponibileFallback);
  const totaleIva = roundMoney(totaleCalcolato.iva_importo || Math.max(0, totaleDocumento - totaleImponibile));
  const totaleMedia = totaleDocumento;
  const esigenze = (Array.isArray(p.esigenze) ? p.esigenze : []) as SrEsigenza[];
  const soluzione = (Array.isArray(p.soluzione) ? p.soluzione : []) as SrSoluzioneItem[];
  const percheNoi = (Array.isArray(p.perche_noi) ? p.perche_noi : []) as Array<string | { titolo: string; descrizione?: string }>;
  const incluso = (Array.isArray(p.incluso_investimento) ? p.incluso_investimento : []) as Array<string | { titolo: string; descrizione?: string }>;
  // Testimonianze: prima quelle del preventivo (override custom per cliente),
  // altrimenti fallback ai default del template (testimonianze_default). Così
  // l'azienda definisce una libreria di recensioni una volta in template e
  // queste appaiono in tutti i preventivi.
  const testimonianzeProgetto = (Array.isArray(p.testimonianze) ? p.testimonianze : []) as SrTestimonianza[];
  const testimonianzeTemplate = (Array.isArray(tpl.testimonianze_default) ? tpl.testimonianze_default : []) as SrTestimonianza[];
  const testimonianze: SrTestimonianza[] = testimonianzeProgetto.length > 0
    ? testimonianzeProgetto
    : testimonianzeTemplate;
  const milestones = (Array.isArray(p.pagamento_milestones) ? p.pagamento_milestones : []) as SrPagamentoMilestone[];
  const piani = (Array.isArray(p.fin_piani) ? p.fin_piani : []) as SrPianoFinanziamento[];
  const schemaPagamento = p.schema_pagamento ?? "tre_step";
  const schemaCfg = SR_SCHEMI_PAGAMENTO[schemaPagamento as keyof typeof SR_SCHEMI_PAGAMENTO];
  // Prima & Dopo: situazione (foto attuale del cliente) vs render (AI)
  const primaUrls = detail.media.filter((m) => m.kind === "situazione" && m.url).map((m) => m.url!);
  const renderUrls = detail.media.filter((m) => m.kind === "render" && m.url).map((m) => m.url!);
  // ─── Milestone 11 · Before/After con pairing esplicito ────────────────
  // Per ogni render con pair_situazione_id, troviamo la situazione "prima"
  // accoppiata. Se mancante (legacy), fallback al parsing session-id da
  // storage_path. Max 4 coppie sulla pagina A4 landscape (grid 2×2).
  const renderRows = detail.media.filter((m) => m.kind === "render" && m.url);
  const situazioneRows = detail.media.filter((m) => m.kind === "situazione" && m.url);
  const beforeAfterPairs = renderRows
    .map((r) => {
      // 1. Pairing esplicito via pair_situazione_id (M11)
      if (r.pair_situazione_id) {
        const sit = situazioneRows.find((s) => s.id === r.pair_situazione_id);
        if (sit) return { situazione: sit, render: r };
      }
      // 2. Fallback legacy: session-id parsing da storage_path
      const sessionId = r.storage_path?.split(":")[1];
      if (sessionId) {
        const sit = situazioneRows.find((s) => s.storage_path?.startsWith(`render-session:${sessionId}:`));
        if (sit) return { situazione: sit, render: r };
      }
      return null;
    })
    .filter((p): p is { situazione: typeof situazioneRows[number]; render: typeof renderRows[number] } => p !== null)
    .slice(0, 4); // max 4 coppie per layout 2×2
  const serramentiGrouped = groupSerramentiAdvanced(detail.serramenti);

  // ─── Milestone 9 · Pagine foto-tecniche per articolo ──────────────────
  // Per ogni gruppo serramento, raccogliamo le foto sopralluogo + render AI
  // legate via sr_progetti_media.serramento_id. La pagina dedicata è
  // generata solo per gruppi con almeno una foto presente — evitiamo pagine
  // vuote se l'utente non ha ancora fatto upload. Il toggle del template
  // (pdf_pagine_articolo_dedicate) gate l'intera sezione.
  const articoliConFoto = paginaArticoloDedicata
    ? serramentiGrouped
        .map((g) => {
          const idSet = new Set(g.serramento_ids);
          const sit = detail.media.find(
            (m) => m.kind === "situazione" && m.url && m.serramento_id && idSet.has(m.serramento_id)
          );
          const ren = detail.media.find(
            (m) => m.kind === "render" && m.url && m.serramento_id && idSet.has(m.serramento_id)
          );
          return { group: g, situazione: sit ?? null, render: ren ?? null };
        })
        .filter((x) => x.situazione || x.render)
    : [];

  // Cronoprogramma fasi
  const numSerr = detail.serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);
  // Cronoprogramma rimosso: i campi crono_giorni_* del progetto restano nel DB
  // per compatibilità (alcune anagrafiche storiche li usano) ma non sono più
  // renderizzati nel PDF. La narrazione passa per la pagina "Il tuo percorso".

  // Cashflow 10 anni
  const cashflowYears: Array<{ year: number; cumulato: number }> = [];
  if ((Number(p.risparmio_eur_anno) > 0) || (Number(p.detrazione_eur_anno) > 0)) {
    let cum = -totaleMedia;
    for (let y = 1; y <= 10; y++) {
      cum += Number(p.risparmio_eur_anno ?? 0);
      cum += Number(p.detrazione_eur_anno ?? 0);
      cashflowYears.push({ year: y, cumulato: cum });
    }
  }
  // Senza il calcolo del risparmio la colonna «Risparmio» era tutta a € 0, e le
  // didascalie parlavano di un anno di pareggio anche quando in dieci anni la
  // spesa non si ripaga.
  const haRisparmioBolletta = Number(p.risparmio_eur_anno ?? 0) > 0;
  const iPareggio = cashflowYears.findIndex((y, i) => y.cumulato >= 0 && (i === 0 || cashflowYears[i - 1].cumulato < 0));
  const annoPareggio = iPareggio === -1 ? null : cashflowYears[iPareggio].year;
  const hasMonthlyRateBalance = Boolean(
    schemaCfg?.hasFinanziamento && piani.length > 0 && Number(p.risparmio_eur_anno ?? 0) > 0
  );
  const hasTaxDeduction = Boolean(p.detrazione_aliquota && (p.detrazione_eur_totale ?? 0) > 0);
  const hasInvestmentDetails = Boolean(
    hasTaxDeduction || cashflowYears.length > 0 || hasMonthlyRateBalance || incluso.length > 0 || bonus.length > 0
  );

  // Una foto che non si è potuta firmare arriva senza url: si salta.
  const galleryLavori = ((tpl.gallery_lavori ?? []) as Array<{ id: string; url: string; didascalia?: string | null; luogo?: string | null }>)
    .filter((item) => Boolean(item?.url));

  const indirizzo = template?.indirizzo_completo || company?.indirizzo;
  const telefono = template?.telefono || company?.telefono;
  const email = template?.email || company?.email;
  const vat = template?.partita_iva || company?.partita_iva;
  const website = company?.website;
  // Milestone 3 · White-label legal footer extras: usa il companyAny cast
  // già dichiarato sopra (consolidato per evitare duplicazioni M10/M3).
  const capitaleSociale: string | null = companyAny.capitale_sociale != null
    ? `€ ${Number(companyAny.capitale_sociale).toLocaleString("it-IT")}`
    : null;
  const numeroRea: string | null = companyAny.numero_rea ?? null;
  const pec: string | null = companyAny.pec ?? null;
  const showLegalFooter = tpl.pdf_show_legal_footer === true;

  // Ordine pagine PDF configurato dall'admin nel template editor.
  // normalizePdfPagesOrder garantisce robustezza: aggiunge pagine nuove
  // mancanti, rimuove ID legacy, forza visible=true sulle obbligatorie.
  const pdfPagesOrder = normalizePdfPagesOrder(
    (tpl.pdf_pages_order ?? null) as SrPdfPageOrderItem[] | null,
  );

  return (
    <Document
      title={`Stima ${p.code} - ${clienteNome}`}
      author={companyName}
      subject={`Preventivo serramenti per ${clienteNome}`}
    >
      {/* ─── PAGINA 1 — COVER ───────────────────────────────────────────────
          La cover usa layer assoluti dentro un canvas A4 fisso. In react-pdf
          le immagini full-page alte 842pt superano di poco l'A4 reale
          (841.89pt) e react-pdf le spezza. Usiamo 841pt + layer assoluti:
          sfondo, contenuto e footer restano dentro una sola pagina. */}
      <Page
        size="A4"
        style={[
          styles.cover,
          coverBgColor ? { backgroundColor: coverBgColor } : undefined,
          { color: coverTextColor },
        ]}
      >
        {/* Immagine di sfondo opzionale.
            Dimensioni in pt esplicite (A4 safe = 595×841pt) invece di "100%" perché
            react-pdf ha un bug noto: width/height "100%" su Image absolute-positioned
            genera una pagina vuota extra ALL'INIZIO del documento. */}
        {coverImageUrl && (
          <Image
            src={coverImageUrl}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 595,
              height: 841,
              objectFit: "cover" as const,
            }}
          />
        )}
        {/* Overlay scuro sopra immagine per leggibilità */}
        {/* M13 · Overlay sopra l'immagine cover. 4 stili:
            - flat: View nero piatto con opacity (retrocompat, render veloce)
            - gradient: SVG <LinearGradient> verticale alto→basso
            - gradient_diag: gradient diagonale top-left→bottom-right
            - vignette: SVG <RadialGradient> con centro chiaro + bordi scuri
            L'intensità è sempre controllata da coverOverlayOpacity. */}
        {coverImageUrl && coverOverlayStyle === "flat" && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 595,
              height: 841,
              backgroundColor: "#000000",
              opacity: coverOverlayOpacity,
            }}
          />
        )}
        {coverImageUrl && coverOverlayStyle !== "flat" && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 595,
              height: 841,
            }}
          >
            <Svg width={595} height={841} viewBox="0 0 595 841">
              <Defs>
                {coverOverlayStyle === "gradient" && (
                  <LinearGradient id="cover-overlay-grad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.15} />
                    <Stop offset="0.55" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.55} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={coverOverlayOpacity} />
                  </LinearGradient>
                )}
                {coverOverlayStyle === "gradient_diag" && (
                  <LinearGradient id="cover-overlay-grad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.2} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={coverOverlayOpacity} />
                  </LinearGradient>
                )}
                {coverOverlayStyle === "vignette" && (
                  <RadialGradient id="cover-overlay-grad" cx="0.5" cy="0.5" rx="0.7" ry="0.85" fx="0.5" fy="0.5">
                    <Stop offset="0" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.1} />
                    <Stop offset="0.7" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.5} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.95} />
                  </RadialGradient>
                )}
              </Defs>
              <Rect x={0} y={0} width={595} height={841} fill="url(#cover-overlay-grad)" />
            </Svg>
          </View>
        )}
        {/* Decoro SVG in alto a destra (toggle template). Usa il colore del
            TESTO cover (non il brand): armonizza sempre col fondo della cover e
            resta coerente con l'anteprima del template editor. */}
        {coverShowDecoration && (
          <View style={styles.coverDecoSvg}>
            <CoverDecorationSvg color={coverTextColor} variant={coverDecorationStyle} />
          </View>
        )}

        {coverLogoPosition !== "hidden" && (
          <View wrap={false} style={coverLogoPositionStyle}>
            <View style={styles.coverLogoBox}>
            {coverLogoUrl ? (
              <Image src={coverLogoUrl} style={[styles.coverLogoImage, { maxWidth: 220 * coverLogoScale, height: 70 * coverLogoScale }]} />
            ) : (
              <View style={styles.coverLogoCircle}>
                <Text style={{ color: C.onPrimary, fontSize: 28, fontWeight: 700 }}>
                  {(companyName || "S").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View>
              <Text style={[styles.coverCompanyName, { color: coverTextColor }]}>{companyName}</Text>
              {/* Come nel piè di pagina: prima l'indirizzo del modello, poi quello dell'azienda. */}
              {template?.indirizzo_completo || company?.indirizzo ? (
                <Text style={styles.coverCompanyTag}>{template?.indirizzo_completo || company?.indirizzo}</Text>
              ) : null}
            </View>
            </View>
          </View>
        )}

        <View wrap={false} style={coverTextBlockStyle}>
          <Text style={[styles.coverEyebrow, { fontSize: coverEyebrowSize, color: coverEyebrowColor, textAlign: coverTextAlign }]}>{coverEyebrow}</Text>
          <Text style={[styles.coverTitle, { fontSize: coverTitleSize, color: coverTitleColor, textAlign: coverTextAlign }]}>{coverHero}</Text>
          <Text style={[styles.coverSubtitle, { fontSize: coverSubtitleSize, color: coverSubtitleColor, textAlign: coverTextAlign }]}>{coverSubhero}</Text>

          {coverShowClientCard && (
            <View style={[styles.coverCard, { borderLeft: `3pt solid ${coverAccento}` }]}>
              <Text style={[styles.coverLabel, { color: coverAccento }]}>Preparato per</Text>
              <Text style={[styles.coverClientName, { color: coverTextColor }]}>{clienteNome}</Text>
              <Text style={styles.coverClientAddr}>
                {[p.cliente_indirizzo, p.cantiere_citta || p.cliente_citta].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}
          {/* Urgenza/scadenza in cover (se attiva nel template) — innesca
              scarsità subito sulla prima impressione del cliente. */}
          {urgenzaAttiva && (
            <View style={[styles.urgenzaBox, {
              backgroundColor: "rgba(255,255,255,0.1)",
              borderColor: C.accent,
              marginTop: 18,
            }]}>
              <Text style={[styles.urgenzaLabel, { color: C.accent }]}>
                  Offerta valida fino al
              </Text>
              <Text style={[styles.urgenzaScadenza, { color: coverTextColor, fontSize: 16 }]}>
                {scadenzaPreventivo}
              </Text>
              {earlyBirdAttivo && scadenzaEarlyBird && (
                <Text style={[styles.urgenzaDesc, { color: coverTextColor, opacity: 0.85 }]}>
                  Sconto -{earlyBirdPct}% extra se firmi entro il {scadenzaEarlyBird}
                </Text>
              )}
            </View>
          )}
        </View>

        <View wrap={false} style={styles.coverFooter}>
          <View style={styles.coverFooterRule} />
          <View>
            <Text>Preventivo <Text style={styles.coverFooterStrong}>{p.code}</Text></Text>
            <Text>{fmtDate(p.created_at)} · valido {p.valido_fino_giorni ?? 15} giorni</Text>
          </View>
          {consulente && (
            <View style={{ textAlign: "right" as const }}>
              <Text>A cura di</Text>
              <Text style={styles.coverFooterStrong}>{consulente.nome}</Text>
            </View>
          )}
        </View>
      </Page>

      {/* ───────────────────────────────────────────────────────────────────
          Pagine PDF in ordine configurato dal template.
          L'admin può riordinare e mostrare/nascondere singole pagine dal
          template editor (tab "Ordine pagine"). normalizePdfPagesOrder
          garantisce che eventuali ID legacy o nuovi siano gestiti senza
          rompere PDF già esistenti.
          ─────────────────────────────────────────────────────────────────── */}
      {(() => {
        const pageEls: Record<SrPdfPageId, React.ReactElement> = {
          chi_siamo: (
            <>
            {/* ─── PAGINA "CHI SIAMO" (opzionale, opt-in via template) ─────────── */}
            {chiSiamoAttivo && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.pageEyebrow}>Chi siamo</Text>
                {/* Titolo compatto rispetto a pageTitle (che è 28pt+): chi-siamo
                    spesso ha titoli lunghi tipo "Da oltre 20 Anni al fianco delle
                    Famiglie Italiane", a 28pt occuperebbero 3 righe. */}
                <Text style={[styles.pageTitle, { fontSize: 22, marginBottom: 12 }]}>{chiSiamoTitolo}</Text>
                {chiSiamoFotoUrl ? (
                  <View style={styles.chiSiamoHeroWrap}>
                    <Image
                      src={chiSiamoFotoUrl}
                      style={styles.chiSiamoHero}
                     
                    />
                  </View>
                ) : null}
                {chiSiamoTesto && (
                  <View>
                    {isLikelyHtml(chiSiamoTesto)
                      // Testo dal rich-text editor (HTML): rende grassetto/corsivo/
                      // sottolineato/dimensioni/liste via mini-renderer.
                      ? htmlToPdfNodes(chiSiamoTesto, styles.chiSiamoText, "cs-")
                      // Testo semplice (legacy): split paragrafi + bullet "- ".
                      : chiSiamoTesto.split(/\n\n+/).map((para, i) => {
                          const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
                          const allBullets = lines.length > 0 && lines.every((l) => l.startsWith("- ") || l.startsWith("• "));
                          if (allBullets) {
                            return (
                              <View key={i} style={{ marginBottom: 8 }}>
                                {lines.map((l, li) => (
                                  <View key={li} style={styles.bulletItem} wrap={false}>
                                    <View style={styles.bulletDot} />
                                    <Text style={[styles.bulletText, { fontSize: 10 }]}>{l.replace(/^[-•]\s*/, "")}</Text>
                                  </View>
                                ))}
                              </View>
                            );
                          }
                          return <Text key={i} style={[styles.chiSiamoText, { marginBottom: 8 }]}>{para}</Text>;
                        })}
                  </View>
                )}
                {/* Strip certificazioni: 5-6 badge qualità in fondo a chi siamo
                    per autorità + trust senza occupare pagina dedicata. */}
                {certificazioni.length > 0 && (
                  <View style={styles.certStrip} wrap={false}>
                    {certificazioni.slice(0, 6).map((c, i) => (
                      <View key={i} style={styles.certBadge}>
                        <Text style={styles.certBadgeText}>{c.nome}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            )}
            </>
          ),
          proposta: (
            <>
            {/* ─── PAGINA 2 — PROPOSTA INTERVENTO ──────────────────────────────── */}
            <Page size="A4" style={styles.page}>
              <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

              <Text style={styles.pageEyebrow}>Proposta di intervento</Text>
              <Text style={styles.pageTitle}>Per {p.cliente_nome ?? clienteNome}</Text>
              <Text style={styles.pageSubtitle}>
                {[p.cantiere_citta || p.cliente_citta, `${numSerr} serramenti`, p.tipo_intervento].filter(Boolean).join(" · ")}
              </Text>

              <Text style={styles.sectionTitle}>Anagrafica cliente</Text>
              <View style={styles.kvRow}><Text style={styles.kvKey}>Intestatario</Text><Text style={styles.kvValue}>{clienteNome}</Text></View>
              {p.cliente_indirizzo && (
                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Indirizzo</Text>
                  <Text style={styles.kvValue}>{p.cliente_indirizzo}</Text>
                </View>
              )}
              {(p.cliente_citta || p.cliente_cap || p.cliente_provincia) && (
                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Città</Text>
                  <Text style={styles.kvValue}>
                    {[p.cliente_cap, p.cliente_citta, p.cliente_provincia ? `(${p.cliente_provincia})` : null]
                      .filter(Boolean).join(" ")}
                  </Text>
                </View>
              )}
              {p.cliente_telefono && <View style={styles.kvRow}><Text style={styles.kvKey}>Telefono</Text><Text style={styles.kvValue}>{p.cliente_telefono}</Text></View>}
              {p.cliente_email && <View style={styles.kvRow}><Text style={styles.kvKey}>Email</Text><Text style={styles.kvValue}>{p.cliente_email}</Text></View>}
              {/* Cantiere se diverso dal cliente */}
              {p.cantiere_indirizzo && p.cantiere_indirizzo !== p.cliente_indirizzo && (
                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Cantiere</Text>
                  <Text style={styles.kvValue}>
                    {rigaCantiere(p)}
                  </Text>
                </View>
              )}

              <Text style={styles.sectionTitle}>L'intervento in sintesi</Text>
              <Text style={styles.sintesiBox}>{sintesi}</Text>

              {esigenze.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Le tue esigenze</Text>
                  {esigenze.slice(0, 3).map((e, i) => (
                    <View key={i} style={styles.bulletItem} wrap={false}>
                      <View style={styles.bulletDot} />
                      <View style={styles.bulletContent}>
                        <Text style={styles.bulletTitle}>{e.titolo}</Text>
                        {e.descrizione && <Text style={styles.bulletText}>{e.descrizione}</Text>}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {soluzione.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>La soluzione per te</Text>
                  {soluzione.slice(0, 4).map((sol, i) => (
                    <View key={i} style={styles.bulletItem} wrap={false}>
                      <View style={styles.bulletDot} />
                      <View style={styles.bulletContent}>
                        <Text style={styles.bulletTitle}>{sol.titolo}</Text>
                        {sol.descrizione && <Text style={styles.bulletText}>{sol.descrizione}</Text>}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {(percheNoi.length > 0 || percheNoiMetriche.length > 0) && (
                <>
                  <Text style={styles.sectionTitle}>Perché {companyName}</Text>

                  {/* Milestone 10: row di big-number metriche sopra la lista USP.
                      Mostrate solo se almeno una è configurata. */}
                  {percheNoiMetriche.length > 0 && (
                    <View style={styles.percheNoiMetricheRow}>
                      {percheNoiMetriche.map((m, i) => (
                        <View key={i} style={styles.percheNoiMetricaCard} wrap={false}>
                          {/* Solo ASCII stampabile: emoji/simboli non-WinAnsi diventano glifi rotti in Helvetica. */}
                          {m.icon && /^[\x20-\x7E]+$/.test(m.icon) && <Text style={styles.percheNoiMetricaIcon}>{m.icon}</Text>}
                          <Text style={styles.percheNoiMetricaValue}>
                            {m.value}
                            {m.suffix && <Text style={styles.percheNoiMetricaSuffix}>{m.suffix}</Text>}
                          </Text>
                          <Text style={styles.percheNoiMetricaLabel}>{m.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {percheNoi.slice(0, 5).map((it, i) => {
                    const titolo = typeof it === "string" ? it : it.titolo;
                    const descrizione = typeof it === "string" ? null : it.descrizione;
                    return (
                      <View key={i} style={styles.bulletItem} wrap={false}>
                        <View style={styles.bulletDot} />
                        <View style={styles.bulletContent}>
                          <Text style={styles.bulletTitle}>{titolo}</Text>
                          {descrizione && <Text style={styles.bulletText}>{descrizione}</Text>}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              {/* La tua consulenza, nella pagina 2 dal 14/09/2026 (deciso con il
                  titolare): chi seguirà il cliente e l'appuntamento vengono prima
                  delle foto dei prodotti. Il consulente è SEMPRE l'utente che ha
                  fatto il preventivo (hook fa fallback a auth.user), mai il nome
                  dell'azienda. Titolo e riquadro restano insieme. */}
              <View wrap={false}>
              <Text style={styles.sectionTitle}>La tua consulenza</Text>
              <View style={styles.consBox}>
                {consulente?.foto_url ? (
                  <Image src={consulente.foto_url} style={styles.consPhoto} />
                ) : (
                  <View style={styles.consPhotoPh}>
                    <Text style={{ color: C.onPrimary, fontSize: 22, fontWeight: 700 }}>
                      {(() => {
                        const name = consulente?.nome ?? "Consulente tecnico";
                        const parts = name.trim().split(/\s+/);
                        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
                        return name.slice(0, 2).toUpperCase();
                      })()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.consName}>{consulente?.nome ?? "Consulente tecnico"}</Text>
                  <Text style={styles.consRole}>{consulente?.ruolo ?? "Consulente tecnico"}</Text>
                  {/* Dall'editor arriva HTML: si stampano i paragrafi, non i tag. */}
                  {consulenteDescrizione ? (
                    <View style={{ marginTop: 5 }}>
                      {htmlToPdfNodes(consulenteDescrizione, { fontSize: 9.5, color: C.gray700, lineHeight: 1.5 }, "cons-")}
                    </View>
                  ) : null}
                  <Text style={styles.consContact}>
                    {p.consulenza_at ? `Appuntamento: ${fmtDateTime(p.consulenza_at)}\n` : ""}
                    {[consulente?.telefono, consulente?.email].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
              </View>

              <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
            </Page>
            </>
          ),
          allegato_tecnico: (
            <>
            {/* ─── PAGINA 3 — ALLEGATO TECNICO ────────────────────────────────── */}
            <Page size="A4" style={styles.page}>
              <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

              <Text style={styles.pageEyebrow}>Allegato tecnico</Text>
              <Text style={styles.pageTitle}>Cosa installeremo{"\n"}in cantiere.</Text>
              <Text style={styles.pageSubtitle}>Composizione dettagliata di serramenti, accessori e scelte tecniche previste.</Text>

              <Text style={styles.sectionTitle}>Composizione serramenti · {numSerr} pezzi</Text>
              <View style={styles.table}>
                {/* fixed: l'header colonne si ripete sulle pagine successive SOLO
                    finché la tabella composizione continua (react-pdf lo propaga
                    col frammento della View tabella, non su Accessori/Consulenza). */}
                <View style={styles.tableHeader} fixed>
                  <View style={{ width: 28 }}><Text style={styles.tableHeaderText}>#</Text></View>
                  <View style={{ width: 70 }}><Text style={styles.tableHeaderText}>Foto</Text></View>
                  <View style={{ flex: 1, paddingRight: 6 }}><Text style={styles.tableHeaderText}>Descrizione &amp; Specifiche tecniche</Text></View>
                  <View style={{ width: 50, alignItems: "flex-end" }}><Text style={styles.tableHeaderText}>Q.tà</Text></View>
                </View>
                {serramentiGrouped.map((g, idx) => {
                  const family = g.family_id ? familiesById[g.family_id] : null;
                  // macroId con fallback: prima la macro della family (se BOM da listino),
                  // poi l'override manuale (se il consulente ha selezionato la macro).
                  // macroId con fallback gerarchico:
                  //   1. family.categoria.macrocategoria_id (BOM da listino)
                  //   2. macrocategoria_override_id (BOM manuale con scelta esplicita)
                  //   3. autoFallbackMacroId (default azienda: macro con pagina dedicata,
                  //      o prima macro attiva) → permette al PDF di mostrare foto +
                  //      pagina macrocategoria anche se l'admin non ha cliccato
                  //      manualmente su ogni serramento.
                  const macroId =
                    family?.macrocategoria_id
                    ?? g.macrocategoria_override_id
                    ?? autoFallbackMacroId
                    ?? null;
                  const fields = macroId ? (fieldsByMacro[macroId] ?? []) : [];
                  const specs: Array<{ label: string; value: string; unit: string | null }> = [];
                  if (family && fields.length > 0) {
                    for (const f of fields) {
                      const raw = family.custom_field_values[f.field_key];
                      const display = formatFieldDisplay(f, raw);
                      if (display) specs.push({ label: f.field_label, value: display, unit: f.field_unit });
                    }
                  }
                  // Le Variabili Prodotto scelte dal commerciale (snapshot
                  // valori_assi salvato sulla riga BOM): il PDF stampa la VERA
                  // configurazione, non i default della scheda tecnica. Lette come
                  // le descrive il titolare: «Finestra 2 Ante — PVC Salamander 76,
                  // colore interno Bianco, colore esterno Noce, doppio vetro, telaio
                  // a L, Uw ≤ 1,3». Le varianti senza una riga loro restano chip.
                  const scheda = schedaDelGruppo(g, axisLabelByKey);
                  const assi = scheda.altre;
                  const rigaTecnica = [scheda.vetro, scheda.telaio, ...scheda.datiTecnici].filter(Boolean).join(" · ");
                  // Estrai condizioni regalo dalle note (formato:
                  // "🎁 OMAGGIO · Condizioni: <...> · <descrizione>" oppure
                  // "🎁 OMAGGIO · <descrizione>"). Ripulisce per il display.
                  let noteCleaned: string | null = null;
                  if (g.note) {
                    if (g.is_omaggio) {
                      // Rimuove prefisso "🎁 OMAGGIO · " per non duplicare il badge.
                      noteCleaned = g.note.replace(/^(?:🎁\s*)?OMAGGIO\s*·?\s*/i, "").trim() || null;
                    } else {
                      noteCleaned = g.note;
                    }
                  }
                  // Titolo: nome reale della famiglia se disponibile, altrimenti tipologia generica
                  const titolo = family?.nome?.trim() || g.tipologia;
                  // Breadcrumb macrocategoria. Stampato in piccolo sopra il
                  // titolo della riga (es. "INFISSI WND > Articolo PVC 70").
                  const macroNomeRow = macroId ? (macroNomeById[macroId] || null) : null;
                  const supplierLine = g.supplier_product_line_id
                    ? supplierLineById[g.supplier_product_line_id]
                    : null;
                  const supplierLabel = supplierLine
                    ? [supplierLine.supplier_nome, supplierLine.nome].filter(Boolean).join(" · ")
                    : null;
                  // Dimensioni nella prima riga muted
                  const dimensioni = g.larghezza && g.altezza
                    ? `${g.larghezza} × ${g.altezza} mm`
                    : g.larghezza ? `L ${g.larghezza} mm`
                    : g.altezza ? `H ${g.altezza} mm`
                    : null;
                  // Descrizione tecnica del listino
                  const techDesc = family?.descrizione?.trim() || null;
                  // Immagine prodotto nel BOM: SOLO foto specifica della
                  // famiglia. Niente fallback macro (la foto della macro va
                  // sulla pagina dedicata macrocategoria, NON nella listing
                  // prodotti — feedback utente esplicito). Se famiglia non
                  // ha foto → placeholder SVG.
                  const prodottoImageUrl = family?.immagine_url || null;
                  return (
                    <View key={g.key} style={styles.tableRow} wrap={false}>
                      {/* Numero progressivo */}
                      <View style={styles.tableRowNumber}>
                        <Text style={styles.tableRowNumberText}>{idx + 1}</Text>
                      </View>
                      {/* Foto reale */}
                      <View style={{ width: 70 }}>
                        {prodottoImageUrl ? (
                          <Image src={prodottoImageUrl} style={styles.tableThumb} />
                        ) : (
                          <View style={styles.tableThumbPh}>
                            <Svg viewBox="0 0 24 24" style={{ width: 24, height: 24 } as never}>
                              <Rect x={3} y={3} width={18} height={18} rx={1.5} stroke={C.gray500} strokeWidth={1.5} fill="none" />
                              <Path d="M 12 4 L 12 20" stroke={C.gray500} strokeWidth={1} />
                              <Path d="M 4 12 L 20 12" stroke={C.gray500} strokeWidth={1} />
                            </Svg>
                          </View>
                        )}
                      </View>
                      {/* Descrizione + dimensioni + descrizione tecnica + specs */}
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        {/* Breadcrumb macrocategoria sopra al nome articolo:
                            "INFISSI WND". Stampato uppercase mini-caps in
                            primary color per separare visivamente categoria
                            e articolo specifico. */}
                        {macroNomeRow && (
                          <Text style={{ fontSize: 7.5, fontWeight: 700, color: C.ink, letterSpacing: 0.8, marginBottom: 1 }}>
                            {macroNomeRow.toUpperCase()}
                          </Text>
                        )}
                        <Text style={styles.tableCellStrong}>
                          {titoloConLinea(titolo, scheda.linea)}
                          {g.ambiente ? <Text style={{ color: C.gray500, fontWeight: 400 }}> · {g.ambiente}</Text> : null}
                          {/* Badge OMAGGIO INLINE: chip verde subito accanto al
                              nome cosi' il cliente vede a colpo d'occhio che e'
                              gratis. Stampato come <Text> inline in
                              tableCellStrong per allineamento naturale. */}
                          {g.is_omaggio && (
                            <Text style={{
                              fontSize: 8.5, fontWeight: 700, color: "#065F46",
                              backgroundColor: "#D1FAE5", paddingHorizontal: 4,
                              paddingVertical: 1, marginLeft: 6, borderRadius: 3,
                            }}>
                              {" "}IN OMAGGIO{" "}
                            </Text>
                          )}
                          {/* Badge SOLO FORNITURA: ambra accanto al titolo se la
                              posa e' stata esclusa dal commerciale. Cliente
                              capisce subito che dovra' occuparsi della posa. */}
                          {g.posa_esclusa && (
                            <Text style={{
                              fontSize: 8.5, fontWeight: 700, color: "#92400E",
                              backgroundColor: "#FEF3C7", paddingHorizontal: 4,
                              paddingVertical: 1, marginLeft: 6, borderRadius: 3,
                            }}>
                              {" "}SOLO FORNITURA{" "}
                            </Text>
                          )}
                        </Text>
                        <Text style={[styles.tableCellMuted, { fontWeight: 700, color: C.gray700 }]}>
                          {[
                            dimensioni,
                            // Preferiamo il materiale dalla SCHEDA TECNICA del listino
                            // (family.custom_field_values.materiale_profilo) — fonte
                            // di verità autorevole quando l'articolo viene dal
                            // listino. Solo se non disponibile cadiamo sul campo
                            // legacy s.materiale (g.materiale) che spesso è il
                            // default macrocategoria e può non riflettere il vero
                            // materiale del prodotto. BUG FIX: prima il PDF
                            // mostrava "Alluminio" per articoli PVC del listino.
                            materialeFromFamily(family) ?? (g.materiale !== "—" ? g.materiale : null),
                            g.serie,
                            // Il vetro ha la sua riga qui sotto (anche quello scritto a mano).
                          ].filter(Boolean).join(" · ")}
                        </Text>
                        {supplierLabel && (
                          <Text style={styles.supplierLineText}>
                            Linea fornitore: {supplierLabel}
                          </Text>
                        )}
                        {/* Come la legge il cliente: i colori dei due lati (dai campi
                            della riga o dalla variante Colore) su una riga; vetro,
                            telaio e dati tecnici sull'altra. Due righe e non cinque,
                            così la posizione resta intera sulla pagina. Ternari e non
                            &&: una stringa vuota fuori da <Text> rompe react-pdf. */}
                        {scheda.coloreInterno || scheda.coloreEsterno ? (
                          <Text style={styles.tableCellMuted}>
                            {scheda.coloreInterno ? <Text style={{ fontWeight: 700, color: C.gray700 }}>Colore interno: </Text> : null}
                            {scheda.coloreInterno ?? null}
                            {scheda.coloreInterno && scheda.coloreEsterno ? "  ·  " : null}
                            {scheda.coloreEsterno ? <Text style={{ fontWeight: 700, color: C.gray700 }}>Colore esterno: </Text> : null}
                            {scheda.coloreEsterno ?? null}
                          </Text>
                        ) : null}
                        {rigaTecnica ? <Text style={styles.tableCellMuted}>{rigaTecnica}</Text> : null}
                        {/* Descrizione tecnica dal listino prodotti */}
                        {techDesc && (
                          <Text style={styles.tableTechDesc}>{techDesc}</Text>
                        )}
                        {/* Note esplicativa "solo fornitura": il cliente sa
                            chiaramente che dovra' provvedere alla posa per
                            questa specifica riga del preventivo. */}
                        {g.posa_esclusa && (
                          <Text style={{
                            fontSize: 8.5, color: "#92400E", marginTop: 3,
                            fontStyle: "italic",
                          }}>
                            Nota: vendita in sola fornitura. Manodopera e posa non sono incluse per questo articolo.
                          </Text>
                        )}
                        {specs.length > 0 && (
                          <View style={styles.specChips}>
                            {specs.slice(0, 8).map((sp, si) => (
                              <View key={si} style={styles.specChip}>
                                <Text style={{ fontSize: 8.5 }}>
                                  <Text style={styles.specChipLabel}>{sp.label}: </Text>
                                  <Text style={styles.specChipValue}>{sp.value}</Text>
                                  {sp.unit ? <Text style={styles.specChipUnit}> {sp.unit}</Text> : null}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {/* Variabili Prodotto scelte dal commerciale (es.
                            "Profilo: Square", "Soglia: Ribassata"). Renderizzate
                            come chip dello stesso stile delle specs ma con
                            sfumatura primary -> indica "scelta personalizzata"
                            vs scheda tecnica statica. */}
                        {assi.length > 0 && (
                          <View style={[styles.specChips, { marginTop: 2 }]}>
                            {assi.map((a, si) => (
                              <View key={`asse-${si}`} style={[styles.specChip, { backgroundColor: C.primaryLight }]}>
                                <Text style={{ fontSize: 8.5 }}>
                                  <Text style={[styles.specChipLabel, { color: C.ink }]}>{a.label}: </Text>
                                  <Text style={[styles.specChipValue, { color: C.ink, fontWeight: 700 }]}>{a.value}</Text>
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {/* Note libere salvate sulla riga BOM:
                            - per omaggio: "Condizioni: ..." dopo il prefisso "🎁 OMAGGIO"
                            - per voci off-listino custom: descrizione libera
                            Stampato in italic muted sotto specs/assi. */}
                        {noteCleaned && (
                          <Text style={[styles.tableCellMuted, { fontStyle: "italic", marginTop: 2 }]}>
                            {noteCleaned}
                          </Text>
                        )}
                      </View>
                      {/* Quantità */}
                      <View style={{ width: 50, alignItems: "flex-end", paddingTop: 6 }}>
                        <Text style={styles.tableCellNum}>{g.quantita}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {detail.accessori.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Accessori e complementi</Text>
                  <View style={styles.table}>
                    <View style={styles.tableHeader}>
                      <View style={{ flex: 1, paddingRight: 6 }}><Text style={styles.tableHeaderText}>Voce</Text></View>
                      <View style={{ width: 110 }}><Text style={styles.tableHeaderText}>Misure</Text></View>
                      <View style={{ width: 50, alignItems: "flex-end" }}><Text style={styles.tableHeaderText}>Q.tà</Text></View>
                    </View>
                    {detail.accessori.map((a, i) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const ax = a as any;
                      // Il cassonetto ha anche la profondità: larghezza × altezza × profondità.
                      const misure = ax.larghezza_mm && ax.altezza_mm
                        ? `${ax.larghezza_mm}×${ax.altezza_mm}${a.profondita_mm ? `×${a.profondita_mm}` : ""} mm`
                        : "—";
                      // Le scelte dell'accessorio (colore, motore, rete), come
                      // quelle dei serramenti: il prezzo le conta, il cliente le legge.
                      const scelte = a.family_id
                        ? Object.entries(a.valori_assi ?? {}).flatMap(([codice, valueId]) => {
                            const l = axisLabelByKey[`${a.family_id}|${codice}|${valueId}`];
                            return l ? [`${l.axisLabel}: ${testoScelta(l.valueLabel, (a.scelte_assi ?? {})[codice])}`] : [];
                          })
                        : [];
                      return (
                        <View key={i} style={styles.tableRow} wrap={false}>
                          <View style={{ flex: 1, paddingRight: 6 }}>
                            <Text style={styles.tableCellStrong}>{a.descrizione || a.tipo}</Text>
                            {scelte.length > 0 && (
                              <Text style={styles.tableCellMuted}>{scelte.join(" · ")}</Text>
                            )}
                          </View>
                          <View style={{ width: 90 }}>
                            <Text style={styles.tableCellMuted}>{misure}</Text>
                          </View>
                          <View style={{ width: 50, alignItems: "flex-end" }}>
                            <Text style={styles.tableCellNum}>{a.quantita ?? 1}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Cronoprogramma rimosso — sostituito dalla pagina dedicata "Il tuo percorso" */}

              <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
            </Page>
            </>
          ),
          macro_dedicate: (
            <>
            {/* ─── PAGINE DEDICATE MACROCATEGORIA (opzionali) ─────────────────── */}
            {macroPagineDedicate.map((mp, mi) => (
              <Page key={mp.macro_id} size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.pageEyebrow}>
                  Linea prodotto · {mi + 1} di {macroPagineDedicate.length}
                </Text>
                <Text style={styles.pageTitle}>{mp.nome}</Text>
                <View style={styles.macroPageHero}>
                  {mp.immagine_url ? (
                    <View style={styles.macroPageImgWrap}>
                      <Image src={mp.immagine_url} style={styles.macroPageImg} />
                    </View>
                  ) : (
                    <View style={styles.macroPageImgPh}>
                      <Text style={{ fontSize: 12, color: C.gray500 }}>{mp.nome}</Text>
                    </View>
                  )}
                  <View style={styles.macroPageContent}>
                    {mp.descrizione_estesa.split(/\n\n+/).map((para, i) => {
                      const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
                      const allBullets = lines.length > 0 && lines.every((l) => l.startsWith("- ") || l.startsWith("• "));
                      if (allBullets) {
                        return (
                          <View key={i} style={{ marginBottom: 8 }}>
                            {lines.map((l, li) => (
                              <View key={li} style={styles.bulletItem}>
                                <View style={styles.bulletDot} />
                                <Text style={{ flex: 1, fontSize: 10.5, color: C.gray700, lineHeight: 1.55 }}>
                                  {l.replace(/^[-•]\s*/, "")}
                                </Text>
                              </View>
                            ))}
                          </View>
                        );
                      }
                      return (
                        <Text key={i} style={{ marginBottom: 8, fontSize: 11, color: C.gray700, lineHeight: 1.65 }}>
                          {para}
                        </Text>
                      );
                    })}
                  </View>
                </View>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            ))}
            </>
          ),
          linee_dedicate: (
            <>
            {/* ─── IL SISTEMA SCELTO: una pagina per ogni linea usata ──────────
                La scheda della linea scritta nel listino (PVC Salamander 76):
                foto del profilo, dati tecnici, descrizione e link alla scheda
                del produttore. */}
            {lineeDedicate.map((linea, li) => (
              <Page key={linea.id} size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.pageEyebrow}>
                  Il sistema scelto · {li + 1} di {lineeDedicate.length}
                </Text>
                <Text style={styles.pageTitle}>{linea.nome}</Text>
                {linea.prodotti ? (
                  <Text style={styles.pageSubtitle}>
                    {linea.tipologia ? `${linea.tipologia} · ` : ""}Per {linea.prodotti}
                  </Text>
                ) : null}
                <View style={styles.macroPageHero}>
                  {linea.immagine_url ? (
                    <View style={styles.macroPageImgWrap}>
                      <Image src={linea.immagine_url} style={styles.macroPageImg} />
                    </View>
                  ) : null}
                  {linea.dati.length > 0 ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {linea.dati.map((d) => (
                        <View
                          key={d.etichetta}
                          style={{
                            flexGrow: 1, flexBasis: 110,
                            borderWidth: 0.5, borderColor: C.gray200, borderStyle: "solid", borderRadius: 8,
                            paddingVertical: 8, paddingHorizontal: 10,
                          }}
                        >
                          <Text style={{ fontSize: 8, color: C.gray500, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
                            {d.etichetta}
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: 700, color: C.gray900 }}>{d.valore}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {linea.descrizione ? (
                    <View style={styles.macroPageContent}>
                      <TestoListinoPdf testo={linea.descrizione} styles={styles} C={C} />
                    </View>
                  ) : null}
                  {linea.scheda_tecnica_url ? (
                    <Link src={linea.scheda_tecnica_url} style={{ fontSize: 10, color: C.ink, textDecoration: "underline" }}>
                      Scheda tecnica del produttore{linea.scheda_tecnica_nome ? `: ${linea.scheda_tecnica_nome}` : ""}
                    </Link>
                  ) : null}
                </View>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            ))}
            </>
          ),
          articoli_dedicati: (
            <>
            {/* ─── M9 · PAGINE FOTO-TECNICHE PER ARTICOLO ──────────────────────
                Una pagina A4 per ogni gruppo serramento con almeno una foto
                sopralluogo o render AI. Layout: 2 colonne foto sopra, scheda
                tecnica + dimensioni + note sotto. Toggle controllato da
                pdf_pagine_articolo_dedicate. */}
            {articoliConFoto.map((art, ai) => {
              const g = art.group;
              const dims = g.larghezza && g.altezza ? `${g.larghezza} × ${g.altezza} mm` : null;
              const macroIdResolved = (g.family_id && familiesById[g.family_id]?.macrocategoria_id) || g.macrocategoria_override_id || autoFallbackMacroId || null;
              const macroNome = (macroIdResolved && macroNomeById[macroIdResolved]) || "Articolo";
              const familyNome = g.family_id ? (familiesById[g.family_id]?.nome ?? null) : null;
              // Stessa lettura della composizione: linea, colori, vetro, telaio e dati tecnici.
              const scheda = schedaDelGruppo(g, axisLabelByKey);
              const specs: Array<[string, string]> = [];
              if (g.ambiente) specs.push(["Ambiente", g.ambiente]);
              if (familyNome) specs.push(["Modello", titoloConLinea(familyNome, scheda.linea)]);
              if (g.materiale) specs.push(["Materiale", g.materiale]);
              if (g.serie) specs.push(["Serie", g.serie]);
              if (scheda.vetro) specs.push(["Vetro", scheda.vetro]);
              if (scheda.telaio) specs.push(["Telaio", scheda.telaio]);
              if (dims) specs.push(["Dimensioni", dims]);
              if (scheda.coloreInterno) specs.push(["Colore interno", scheda.coloreInterno]);
              if (scheda.coloreEsterno) specs.push(["Colore esterno", scheda.coloreEsterno]);
              if (scheda.datiTecnici.length > 0) specs.push(["Dati tecnici", scheda.datiTecnici.join(" · ")]);
              specs.push(["Quantità", `${g.quantita} pz`]);
              return (
                <Page key={`art-${ai}-${g.key}`} size="A4" style={styles.page}>
                  <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                  <Text style={styles.pageEyebrow}>
                    Foto-tecnica · {ai + 1} di {articoliConFoto.length} · {macroNome}
                  </Text>
                  <Text style={styles.pageTitle}>{g.tipologia}{g.ambiente ? `\n${g.ambiente}` : ""}</Text>

                  <View style={styles.articoloPhotoRow}>
                    <View style={styles.articoloPhotoCol}>
                      {art.situazione?.url ? (
                        <>
                          <Image src={art.situazione.url} style={styles.articoloPhotoImg} />
                          <Text style={styles.articoloPhotoLabel}>Prima</Text>
                        </>
                      ) : (
                        <Text style={{ fontSize: 9, color: C.gray500 }}>Foto sopralluogo non disponibile</Text>
                      )}
                    </View>
                    <View style={styles.articoloPhotoCol}>
                      {art.render?.url ? (
                        <>
                          <Image src={art.render.url} style={styles.articoloPhotoImg} />
                          <Text style={styles.articoloPhotoLabelDopo}>Dopo · simulazione AI</Text>
                        </>
                      ) : (
                        <Text style={{ fontSize: 9, color: C.gray500 }}>Simulazione AI non disponibile</Text>
                      )}
                    </View>
                  </View>
                  {(art.situazione?.caption || art.render?.caption) && (
                    <Text style={styles.articoloPhotoCaption}>
                      {[art.situazione?.caption, art.render?.caption].filter(Boolean).join(" · ")}
                    </Text>
                  )}

                  <View style={styles.articoloSpecsTable}>
                    {specs.map(([k, v], si) => (
                      <View key={si} style={styles.articoloSpecsRow}>
                        <Text style={styles.articoloSpecsKey}>{k}</Text>
                        <Text style={styles.articoloSpecsVal}>{v}</Text>
                      </View>
                    ))}
                  </View>

                  {g.note?.trim() && !g.note.startsWith("🎁 OMAGGIO") && (
                    <View style={styles.articoloNote}>
                      <Text style={styles.articoloNoteLabel}>Note tecniche</Text>
                      <Text style={styles.articoloNoteText}>{g.note}</Text>
                    </View>
                  )}

                  <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
                </Page>
              );
            })}
            </>
          ),
          investimento: (
            <>
            {/* ─── PAGINA — ECONOMICA (spostata DOPO i prodotti) ─────────────────
                La pagina economica viene mostrata dopo l'allegato tecnico e le
                pagine dedicate macrocategoria: il cliente vede prima COSA gli
                stiamo proponendo (composizione + foto + descrizione macro), e
                solo dopo QUANTO costa. Flusso narrativo: prodotto → valore. */}
            <Page size="A4" style={styles.page}>
              <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

              <Text style={styles.pageEyebrow}>Proposta economica</Text>
              <Text style={styles.investmentTitle}>Importo chiaro.{"\n"}Senza sorprese.</Text>
              <Text style={styles.investmentSubtitle}>
                Il totale è calcolato sulla composizione dell'offerta, sugli sconti applicati e sull'IVA selezionata. Eventuali varianti future saranno indicate in una nuova revisione.
              </Text>

              <View style={styles.priceBoxCompact} wrap={false}>
                <Text style={styles.priceLabel}>Totale preventivo</Text>
                <Text style={styles.priceValueCompact}>
                  € {fmtEuro(totaleDocumento, 2)}
                  {/* Spazio esplicito: i Text annidati in react-pdf vengono
                      concatenati senza separatore → usciva "€1554,19IVA inclusa" */}
                  {/* 18/09/2026: qui c'era `p.iva_inclusa ? "IVA inclusa" : "IVA esclusa"`,
                      ma `iva_inclusa` dice se i PREZZI inseriti comprendono l'IVA, non se
                      la comprende il totale stampato: `totaleDocumento` è sempre il totale
                      con l'IVA. Un preventivo da 12.590 + 10% usciva «€ 13.849,00 IVA
                      esclusa»: il cliente poteva aspettarsi un'altra fattura. */}
                  <Text style={styles.priceSuffix}>{"  "}{totaleIva > 0 ? "IVA inclusa" : "IVA non applicata"}</Text>
                </Text>
                <Text style={{ fontSize: 9, color: C.ink, marginTop: 4 }}>
                  Imponibile € {fmtEuro(totaleImponibile, 2)} · IVA € {fmtEuro(totaleIva, 2)}
                </Text>
                {/* Nota IVA: spiega l'aliquota applicata. Per IVA mista
                    richiama esplicitamente la normativa (art. 7 c.1 L.488/99
                    + DM 29.12.99 Beni Significativi). Trasparenza fiscale
                    al cliente — riduce contestazioni in fase di firma. */}
                <Text style={styles.priceFinePrint}>
                  {p.iva_percentuale === -1
                    ? "IVA calcolata sulle righe del preventivo secondo la regola dei Beni Significativi (DM 29.12.99): quota agevolata al 10% nei limiti previsti ed eventuale eccedenza al 22%."
                    : p.iva_percentuale === 4
                      ? "IVA applicata: 4% agevolata (Legge 104 — interventi per persone con disabilità)."
                      : p.iva_percentuale === 10
                        ? "IVA applicata: 10% agevolata per interventi di ristrutturazione edilizia (art. 7 c.1 L. 488/99)."
                        : p.iva_percentuale === 0
                          ? "Operazione esente / non imponibile IVA."
                          : `IVA applicata: ${p.iva_percentuale}% ordinaria.`}
                </Text>

                {/* Milestone 7: rata mensile + netto dopo recupero fiscale.
                    Mostrati solo se il toggle è ON E i dati sono presenti sul
                    preventivo (piani finanziamento / detrazione aliquota). */}
                {((mostraRataMensile && piani.length > 0) ||
                  (mostraRecuperoFiscale && Number(p.detrazione_aliquota) > 0 && Number(p.detrazione_eur_totale ?? 0) > 0)) && (
                  <View style={[styles.priceExtraRow, { marginTop: 8, paddingTop: 8, gap: 12 }]}>
                    {mostraRataMensile && piani.length > 0 && (() => {
                      // Prendiamo il piano con rata più bassa per l'anchor "da € X/mese".
                      const piano = piani.reduce((min, cur) =>
                        Number(cur.rata_mese ?? Infinity) < Number(min.rata_mese ?? Infinity) ? cur : min
                      , piani[0]);
                      return (
                        <View style={styles.priceExtraItem}>
                          <Text style={styles.priceExtraLabel}>oppure a rate</Text>
                          <Text style={styles.priceExtraValue}>~ da € {fmtEuro(piano.rata_mese)}/mese</Text>
                          <Text style={styles.priceExtraSub}>in {piano.mesi} mesi · TAN {piano.tasso}%</Text>
                        </View>
                      );
                    })()}
                    {mostraRecuperoFiscale && Number(p.detrazione_aliquota) > 0 && Number(p.detrazione_eur_totale ?? 0) > 0 && (() => {
                      const netto = Math.max(0, totaleMedia - Number(p.detrazione_eur_totale ?? 0));
                      return (
                        <View style={styles.priceExtraItem}>
                          <Text style={styles.priceExtraLabel}>Netto dopo recupero fiscale</Text>
                          <Text style={styles.priceExtraValue}>€ {fmtEuro(netto)}</Text>
                          <Text style={styles.priceExtraSub}>Ecobonus {p.detrazione_aliquota}% in 10 quote</Text>
                        </View>
                      );
                    })()}
                  </View>
                )}
              </View>

              {/* Box urgenza/scadenza prezzo + early bird (CRO) */}
              {urgenzaAttiva && (
                <View style={styles.urgenzaBox} wrap={false}>
                  <Text style={styles.urgenzaLabel}>  {urgenzaTitolo}</Text>
                  <Text style={styles.urgenzaScadenza}>
                    {scadenzaPreventivo}
                  </Text>
                  {urgenzaDescrizione && (
                    <Text style={styles.urgenzaDesc}>{urgenzaDescrizione}</Text>
                  )}
                  {earlyBirdAttivo && scadenzaEarlyBird && (
                    <Text style={[styles.urgenzaDesc, { color: C.ink, fontWeight: 700, marginTop: 6 }]}>
                      Sconto extra -{earlyBirdPct}% se firmi entro il {scadenzaEarlyBird}
                    </Text>
                  )}
                </View>
              )}

              {milestones.length > 0 && (
                <View style={styles.investmentBlock} wrap={false}>
                  <Text style={styles.investmentSectionTitle}>Modalità di pagamento</Text>
                  <Text style={styles.paySchemaTag}>{schemaCfg?.label ?? "Personalizzato"}</Text>
                  {milestones.length <= 4 ? (
                    /* Milestone 6: timeline orizzontale (≤4 step entrano in
                       larghezza A4 senza schiacciare i numeri). */
                    <View style={styles.payTimelineRow}>
                      {milestones.map((m, i) => {
                        const amount = (totaleMedia * (Number(m.percentuale) || 0)) / 100;
                        return (
                          <View key={i} style={styles.payTimelineStep} wrap={false}>
                            <View style={styles.payTimelineIdx}>
                              <Text style={styles.payTimelineIdxText}>{i + 1}</Text>
                            </View>
                            <Text style={styles.payTimelineLabel}>{m.label}</Text>
                            {m.when ? <Text style={styles.payTimelineWhen}>{m.when}</Text> : null}
                            <Text style={styles.payTimelinePct}>{m.percentuale}%</Text>
                            <Text style={styles.payTimelineAmount}>€ {fmtEuro(amount)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    /* Fallback verticale per 5+ milestones (raro, schema custom). */
                    milestones.map((m, i) => {
                      const amount = (totaleMedia * (Number(m.percentuale) || 0)) / 100;
                      return (
                        <View key={i} style={styles.payStep} wrap={false}>
                          <View style={styles.payStepIdxBox}>
                            <Text style={styles.payStepIdxText}>{i + 1}</Text>
                          </View>
                          <View style={styles.payStepBody}>
                            <Text style={styles.payStepLabel}>{m.label}</Text>
                            {m.when ? <Text style={styles.payStepWhen}>{m.when}</Text> : null}
                          </View>
                          <View style={styles.payStepRight}>
                            <Text style={styles.payStepPct}>{m.percentuale}%</Text>
                            <Text style={styles.payStepAmount}>circa € {fmtEuro(amount)}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {piani.length > 0 && schemaCfg?.hasFinanziamento && (
                <View style={styles.investmentBlock} wrap={false}>
                  <Text style={styles.investmentSectionTitle}>Simulazione finanziamento</Text>
                  <View style={styles.finBox}>
                    {piani.slice(0, 2).map((piano, i) => (
                      <View key={i} style={[styles.finCard, { padding: 11 }]}>
                        <Text style={styles.finCardTitle}>{piano.nome} · {piano.mesi} mesi · TAN {piano.tasso}%</Text>
                        <Text style={[styles.finCardValue, { fontSize: 17 }]}>€ {fmtEuro(piano.rata_mese)}</Text>
                        <Text style={styles.finCardSub}>/mese · finanziato € {fmtEuro(piano.finanziato)}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 7.5, color: C.gray500, marginTop: 6 }}>
                    Esempi a scopo informativo. Condizioni contrattuali definitive disponibili in sede.
                  </Text>
                </View>
              )}

              <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
            </Page>

            {hasInvestmentDetails && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

                <Text style={styles.pageEyebrow}>Dettagli economici</Text>
                {(() => {
                  // Titolo e sottotitolo dicono solo quello che la pagina contiene: con la
                  // sola detrazione promettevano «inclusioni» e «ciò che è compreso».
                  const voci = [
                    hasTaxDeduction ? "la detrazione fiscale" : null,
                    cashflowYears.length > 0 ? "il recupero negli anni" : null,
                    hasMonthlyRateBalance ? "la rata del finanziamento" : null,
                    incluso.length > 0 ? "cosa è compreso" : null,
                    bonus.length > 0 ? "gli omaggi" : null,
                  ].filter(Boolean) as string[];
                  const elenco = voci.length > 1 ? `${voci.slice(0, -1).join(", ")} e ${voci[voci.length - 1]}` : voci[0] ?? "";
                  const haRecuperi = hasTaxDeduction || cashflowYears.length > 0 || hasMonthlyRateBalance;
                  const haInclusioni = incluso.length > 0 || bonus.length > 0;
                  const titolo = haRecuperi && haInclusioni ? "Valore, recuperi e inclusioni." : haRecuperi ? "Valore e recuperi." : "Valore e inclusioni.";
                  return (
                    <>
                      <Text style={[styles.pageTitle, { fontSize: 24, marginBottom: 6 }]}>{titolo}</Text>
                      <Text style={[styles.pageSubtitle, { fontSize: 10, marginBottom: 12 }]}>
                        {`Un riepilogo ordinato per leggere con chiarezza ${elenco}.`}
                      </Text>
                    </>
                  );
                })()}

                {hasTaxDeduction && (
                  <View style={styles.investmentBlock} wrap={false}>
                    <Text style={styles.investmentSectionTitle}>Detrazione fiscale</Text>
                    <View style={{
                      backgroundColor: C.successBg,
                      borderColor: "#86EFAC", borderWidth: 0.5, borderStyle: "solid",
                      borderRadius: 8, padding: 10, marginTop: 4,
                    }}>
                      <Text style={[styles.finCardTitle, { color: C.successText }]}>
                        Detrazione {p.detrazione_aliquota}% recuperabile in 10 quote annuali
                      </Text>
                      <Text style={[styles.finCardValue, { color: C.successText, fontSize: 18 }]}>
                        € {fmtEuro(p.detrazione_eur_totale)}
                      </Text>
                      <Text style={[styles.finCardSub, { color: C.successText }]}>
                        circa € {fmtEuro(p.detrazione_eur_anno)} / anno per 10 anni
                      </Text>

                      {mostraTabellaEcobonus && Number(p.detrazione_eur_anno ?? 0) > 0 && (
                        <>
                          <View style={styles.ecobonusTable}>
                            {Array.from({ length: 10 }, (_, i) => {
                              const annoIdx = i + 1;
                              const quota = Number(p.detrazione_eur_anno ?? 0);
                              const cumulato = annoIdx === 10
                                ? Number(p.detrazione_eur_totale ?? quota * 10)
                                : quota * annoIdx;
                              return (
                                <View key={annoIdx} style={styles.ecobonusCell}>
                                  <Text style={styles.ecobonusCellYear}>Anno {annoIdx}</Text>
                                  <Text style={styles.ecobonusCellAmount}>€ {fmtEuro(quota)}</Text>
                                  <Text style={styles.ecobonusCellCum}>cum. € {fmtEuro(cumulato)}</Text>
                                </View>
                              );
                            })}
                          </View>
                          <Text style={styles.ecobonusFootnote}>
                            La detrazione viene recuperata in 10 quote annuali di pari importo,
                            a partire dall'anno di pagamento. Importi indicativi salvo verifica
                            del commercialista.
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                )}

                {cashflowYears.length > 0 && (
                  <View wrap={false}>
                    <Text style={styles.investmentSectionTitle}>Recupero economico · 10 anni</Text>
                    <CashflowSvg years={cashflowYears} primary={primaryColor} />
                    <Text style={{ fontSize: 8.2, color: C.gray500, marginTop: 4, lineHeight: 1.35 }}>
                      {haRisparmioBolletta
                        ? "Risparmio in bolletta e detrazione fiscale, cumulati anno dopo anno, meno la spesa iniziale."
                        : "Detrazione fiscale cumulata anno dopo anno, meno la spesa iniziale."}
                      {annoPareggio !== null ? " La linea tratteggiata segna l'anno in cui la spesa iniziale è ripagata." : ""}
                    </Text>

                    <View style={{ marginTop: 9 }}>
                      <View style={styles.tableHeader}>
                        <View style={{ width: 38 }}><Text style={styles.tableHeaderText}>Anno</Text></View>
                        {haRisparmioBolletta && (
                          <View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.tableHeaderText}>Risparmio</Text></View>
                        )}
                        <View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.tableHeaderText}>Detrazione</Text></View>
                        <View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.tableHeaderText}>Cumulato</Text></View>
                        <View style={{ width: 80, alignItems: "flex-end" }}><Text style={styles.tableHeaderText}>Recupero</Text></View>
                      </View>
                      {cashflowYears.map((y, i) => {
                        const risp = Number(p.risparmio_eur_anno ?? 0);
                        const det = Number(p.detrazione_eur_anno ?? 0);
                        const cumulato = y.cumulato;
                        const recupero = totaleMedia > 0
                          ? Math.min(100, Math.max(0, ((cumulato + totaleMedia) / totaleMedia) * 100))
                          : 0;
                        const isBreakEven = cumulato >= 0 && (i === 0 || cashflowYears[i - 1].cumulato < 0);
                        return (
                          <View
                            key={i}
                            style={{
                              flexDirection: "row",
                              paddingVertical: 4,
                              borderBottom: `0.5pt solid ${C.gray100}`,
                              backgroundColor: isBreakEven ? C.successBg : "transparent",
                            }}
                            wrap={false}
                          >
                            <View style={{ width: 38 }}>
                              <Text style={{ fontSize: 8.6, fontWeight: 700, color: C.gray900 }}>
                                A{y.year}{isBreakEven ? " *" : ""}
                              </Text>
                            </View>
                            {haRisparmioBolletta && (
                              <View style={{ flex: 1, alignItems: "flex-end" }}>
                                <Text style={{ fontSize: 8.6, color: C.gray700 }}>€ {fmtEuro(risp)}</Text>
                              </View>
                            )}
                            <View style={{ flex: 1, alignItems: "flex-end" }}>
                              <Text style={{ fontSize: 8.6, color: C.gray700 }}>€ {fmtEuro(det)}</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: "flex-end" }}>
                              <Text style={{ fontSize: 8.6, fontWeight: cumulato >= 0 ? 700 : 400, color: cumulato >= 0 ? C.successText : C.gray500 }}>
                                {/* Il meno serve: senza, «€ 8.264» ancora da recuperare sembrava un guadagno. */}
                                {cumulato >= 0 ? "+" : "-"}€ {fmtEuro(Math.abs(cumulato))}
                              </Text>
                            </View>
                            <View style={{ width: 80, alignItems: "flex-end" }}>
                              <Text style={{ fontSize: 7.8, color: C.gray500 }}>{recupero.toFixed(0)}%</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                    {annoPareggio !== null && (
                      <Text style={{ fontSize: 7.7, color: C.gray500, marginTop: 5, fontStyle: "italic" }}>
                        {haRisparmioBolletta
                          ? "* Anno di pareggio: la spesa iniziale è ripagata da risparmio e detrazione."
                          : "* Anno di pareggio: la spesa iniziale è ripagata dalla detrazione."}
                      </Text>
                    )}
                  </View>
                )}

                {hasMonthlyRateBalance && (
                  <View style={styles.investmentBlock} wrap={false}>
                    <Text style={styles.investmentSectionTitle}>Se paghi a rate — bilancio mensile</Text>
                    {(() => {
                      const piano = piani[0];
                      const rataMese = Number(piano.rata_mese ?? 0);
                      const risparmioMese = Number(p.risparmio_eur_anno ?? 0) / 12;
                      const detrazioneMese = Number(p.detrazione_eur_anno ?? 0) / 12;
                      const beneficioMese = risparmioMese + detrazioneMese;
                      const costoNetto = rataMese - beneficioMese;
                      const positivo = costoNetto <= 0;
                      return (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                          <View style={[styles.finCard, { padding: 10 }]}>
                            <Text style={styles.finCardTitle}>Rata mensile</Text>
                            <Text style={[styles.finCardValue, { color: C.gray900, fontSize: 17 }]}>€ {fmtEuro(rataMese)}</Text>
                            <Text style={styles.finCardSub}>{piano.mesi} mesi · TAN {piano.tasso}%</Text>
                          </View>
                          <View style={[styles.finCard, { padding: 10 }]}>
                            <Text style={styles.finCardTitle}>Risparmio + detrazione</Text>
                            <Text style={[styles.finCardValue, { color: C.successText, fontSize: 17 }]}>- € {fmtEuro(beneficioMese)}</Text>
                            <Text style={styles.finCardSub}>al mese (media 10 anni)</Text>
                          </View>
                          <View style={[styles.finCard, {
                            padding: 10,
                            backgroundColor: positivo ? C.successBg : C.gray50,
                            borderColor: positivo ? "#86EFAC" : C.gray200,
                          }]}>
                            <Text style={[styles.finCardTitle, { color: positivo ? C.successText : C.gray500 }]}>
                              Costo netto / mese
                            </Text>
                            <Text style={[styles.finCardValue, { color: positivo ? C.successText : C.ink, fontSize: 17 }]}>
                              {positivo ? "Gratis o positivo" : `€ ${fmtEuro(costoNetto)}`}
                            </Text>
                            <Text style={[styles.finCardSub, { color: positivo ? C.successText : C.gray500 }]}>
                              {positivo
                                ? "Il risparmio copre la rata"
                                : `Solo € ${fmtEuro(costoNetto)} reali di esborso`}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}
                    <Text style={{ fontSize: 7.7, color: C.gray500, marginTop: 5, fontStyle: "italic" }}>
                      Bilancio indicativo: la rata viene pagata oggi, il risparmio si concretizza nei prossimi
                      10 anni. Le condizioni finanziarie definitive sono nel contratto.
                    </Text>
                  </View>
                )}

                {incluso.length > 0 && (
                  <View style={styles.investmentBlock}>
                    <Text style={styles.investmentSectionTitle}>Cosa è incluso</Text>
                    {incluso.slice(0, 6).map((it, i) => {
                      const titolo = typeof it === "string" ? it : it.titolo;
                      const descrizione = typeof it === "string" ? null : it.descrizione;
                      return (
                        <View key={i} style={[styles.bulletItem, { marginBottom: 6 }]} wrap={false}>
                          <View style={styles.bulletDot} />
                          <View style={styles.bulletContent}>
                            <Text style={[styles.bulletTitle, { fontSize: 10.2 }]}>{titolo}</Text>
                            {descrizione && <Text style={[styles.bulletText, { fontSize: 9.2, lineHeight: 1.4 }]}>{descrizione}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {bonus.length > 0 && (
                  <View style={styles.investmentBlock}>
                    <Text style={[styles.investmentSectionTitle, { color: C.successText }]}>
                      In più, in regalo
                    </Text>
                    {bonus.map((b, i) => (
                      <View key={i} style={[styles.bonusBox, { padding: 8, marginBottom: 5 }]} wrap={false}>
                        <Text style={[styles.bonusTitolo, { fontSize: 10 }]}>{b.titolo}</Text>
                        {Number(b.valore_eur) > 0 && (
                          <Text style={[styles.bonusValore, { fontSize: 10 }]}>
                            valore € {fmtEuro(Number(b.valore_eur))}
                          </Text>
                        )}
                      </View>
                    ))}
                    {(() => {
                      const valoreTotale = bonus.reduce((acc, b) => acc + (Number(b.valore_eur) || 0), 0);
                      // Il totale serve solo con almeno due omaggi che hanno un valore.
                      if (bonus.filter((b) => Number(b.valore_eur) > 0).length < 2) return null;
                      return (
                        <Text style={{ fontSize: 8.5, color: C.successText, fontWeight: 700, marginTop: 3, textAlign: "right" as const }}>
                          Valore omaggi totale: € {fmtEuro(valoreTotale)}
                        </Text>
                      );
                    })()}
                  </View>
                )}

                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            )}
            </>
          ),
          percorso: (
            <>
            {/* ─── PAGINA "IL TUO PERCORSO" — fasi + step in cards verticali ─────
                Posizionata RIGHT BEFORE la CTA "Pronti per partire" come anteprima
                del workflow. Layout: hero con numero step totali + grid di card
                scure (1 per fase) con elenco passaggi numerati. Editabile dal
                template editor. */}
            {percorsoAttivo && percorso.fasi.length > 0 && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

                {/* Hero centrato */}
                <View style={{ alignItems: "center", marginBottom: 16, marginTop: 6 }}>
                  <View style={styles.percorsoBadge}>
                    <Text style={styles.percorsoBadgeText}>Il tuo percorso</Text>
                  </View>
                  <Text style={styles.percorsoBigNumber}>{percorsoTotaleStep}</Text>
                  <Text style={{
                    fontSize: 18, fontWeight: 700, color: C.gray900,
                    textAlign: "center" as const, marginTop: 4, letterSpacing: -0.3,
                  }}>
	                    {percorso.titolo}
                  </Text>
                  <Text style={{
                    fontSize: 10, color: C.gray500, textAlign: "center" as const,
                    marginTop: 6, maxWidth: 380,
                  }}>
                    {percorso.sottotitolo}
                  </Text>
                </View>

                {/* Grid responsive: 1 fase → 100%, 2 → 49%, 3 → 32%, 4+ → 23.5%
                    Layout intelligente che evita overflow del nome fase. */}
                {(() => {
                  const cardWidth =
                    percorso.fasi.length === 1 ? "100%"
                    : percorso.fasi.length === 2 ? "49%"
                    : percorso.fasi.length === 3 ? "32%"
                    : percorso.fasi.length === 4 ? "23.5%"
                    : "48%"; // 5+ fasi → 2 per riga
                  return (
                <View style={{
                  flexDirection: "row", flexWrap: "wrap",
                  gap: 8,
                  marginTop: 8,
                }}>
                  {percorso.fasi.map((fase, fi) => {
                    const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][fi] ?? `${fi + 1}`;
                    return (
                      <View
                        key={fi}
                        style={[styles.percorsoFaseCard, { width: cardWidth }]}
                        wrap={false}
                      >
                        <View style={styles.percorsoFaseHeader}>
                          <View style={styles.percorsoFaseRomanBox}>
                            <Text style={styles.percorsoFaseRomanText}>{roman}</Text>
                          </View>
                          <View>
                            <Text style={styles.percorsoFaseLabel}>Fase {fi + 1}</Text>
                            <Text style={styles.percorsoFaseName}>{fase.nome.toUpperCase()}</Text>
                          </View>
                        </View>
                        {/* Numerazione globale step dentro la fase */}
                        {(() => {
                          const stepBefore = percorso.fasi.slice(0, fi).reduce((acc, f) => acc + f.step.length, 0);
                          return fase.step.map((step, si) => {
                            const globalIdx = stepBefore + si + 1;
                            return (
                              <View key={si} style={styles.percorsoStepRow}>
                                <View style={styles.percorsoStepIdx}>
                                  <Text style={styles.percorsoStepIdxText}>
                                    {String(globalIdx).padStart(2, "0")}
                                  </Text>
                                </View>
                                <Text style={styles.percorsoStepText}>{step}</Text>
                              </View>
                            );
                          });
                        })()}
                      </View>
                    );
                  })}
                </View>
                  );
                })()}

                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            )}
            </>
          ),
          render: (
            <>
            {/* ─── PAGINA RENDER AI in A4 verticale.
                  Logica:
                  - "Prima" = foto reale dello stato attuale (media.kind = situazione)
                  - "Dopo"  = render AI generato (media.kind = render)
                  Layout: confronto verticale, una coppia principale per evitare
                  pagine spezzate o render troppo grandi.
                  Si mostra solo se almeno uno dei due è presente. */}
            {(primaUrls.length > 0 || renderUrls.length > 0) && (
              <Page size="A4" style={{
                ...styles.page,
                paddingTop: 34, paddingBottom: 56,
                paddingHorizontal: 46,
              }}>
                <View style={styles.header} fixed>
                  <View style={styles.headerLeft}>
                    {logoUrl ? (
                      <Image src={logoUrl} style={styles.headerLogo} />
                    ) : (
                      <View style={[styles.headerLogo, { backgroundColor: primaryColor, alignItems: "center", justifyContent: "center" }]}>
                        <Text style={{ color: C.onPrimary, fontSize: 14, fontWeight: 700 }}>
                          {(companyName || "S").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View>
                      <Text style={styles.headerName}>{companyName}</Text>
                      <Text style={{ fontSize: 7.5, color: C.gray500 }}>{clienteNome}</Text>
                    </View>
                  </View>
                  <View style={styles.headerRight}>
                    <Text>STIMA N.</Text>
                    <Text style={styles.headerStimaCode}>{p.code}</Text>
                  </View>
                </View>

                <View wrap={false}>
                  <View style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    paddingBottom: 9,
                    borderBottomWidth: 0.7,
                    borderBottomColor: C.gray100,
                    borderBottomStyle: "solid",
                  }}>
                    <View>
                      <Text style={styles.pageEyebrow}>Anteprima visiva · Render AI</Text>
                      <Text style={[styles.pageTitle, { fontSize: 21, marginBottom: 1 }]}>
                        Prima &amp; Dopo
                      </Text>
                      <Text style={[styles.pageSubtitle, { marginBottom: 0, fontSize: 9.5 }]}>
                        Simulazione indicativa: foto reale a confronto con il possibile risultato estetico.
                      </Text>
                    </View>
                    <View style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: C.primaryLight,
                      borderWidth: 0.5,
                      borderColor: C.primaryBorder,
                      borderStyle: "solid",
                    }}>
                      <Text style={{ fontSize: 8, fontWeight: 800, color: C.ink, textTransform: "uppercase", letterSpacing: 0.6 }}>
                        Preview cliente
                      </Text>
                    </View>
                  </View>

                {/* Layout verticale: una coppia principale, Prima sopra e Dopo sotto.
                    CRITICO: tutto in un blocco wrap={false} per evitare che react-pdf
                    separi immagini e disclaimer su pagine diverse. */}
                {(() => {
                  const mainPair = beforeAfterPairs[0];
                  const beforeUrl = mainPair?.situazione.url ?? primaUrls[0] ?? null;
                  const afterUrl = mainPair?.render.url ?? renderUrls[0] ?? null;
                  const secondRenderUrl = !beforeUrl && renderUrls.length >= 2 ? renderUrls[1] : null;
                  const firstUrl = beforeUrl ?? renderUrls[0] ?? primaUrls[0];
                  const secondUrl = beforeUrl ? afterUrl : secondRenderUrl;
                  const firstLabel = beforeUrl
                    ? `Prima${mainPair?.situazione.caption ? ` · ${mainPair.situazione.caption}` : " · foto attuale"}`
                    : renderUrls.length > 0
                      ? "Simulazione AI · vista 1"
                      : "Foto attuale";
                  const secondLabel = beforeUrl && afterUrl
                    ? "Dopo · simulazione AI"
                    : secondRenderUrl
                      ? "Simulazione AI · vista 2"
                      : null;

                  return (
                    <View wrap={false}>
                      <View style={{
                        borderRadius: 12,
                        borderWidth: 0.7,
                        borderColor: C.gray200,
                        borderStyle: "solid",
                        backgroundColor: C.gray50,
                        padding: 10,
                      }}>
                        <Text style={[styles.renderPairLabel, {
                          fontSize: 9.5,
                          color: beforeUrl ? C.gray700 : primaryColor,
                          marginBottom: 5,
                        }]}>
                          {firstLabel}
                        </Text>
                        <View style={{
                          width: "100%",
                          height: secondUrl ? 218 : 455,
                          borderRadius: 10,
                          overflow: "hidden",
                          backgroundColor: C.white,
                          borderWidth: 0.5,
                          borderColor: beforeUrl ? C.gray200 : primaryColor,
                          borderStyle: "solid",
                        }}>
                          <Image src={firstUrl} style={styles.renderImg} />
                        </View>
                      </View>

                      {secondUrl && (
                        <View style={{
                          marginTop: 10,
                          borderRadius: 12,
                          borderWidth: 0.7,
                          borderColor: C.primaryBorder,
                          borderStyle: "solid",
                          backgroundColor: C.primaryLight,
                          padding: 10,
                        }}>
                          <Text style={[styles.renderPairLabel, {
                            fontSize: 9.5,
                            color: C.ink,
                            marginBottom: 5,
                          }]}>
                            {secondLabel}
                          </Text>
                          <View style={{
                            width: "100%",
                            height: 218,
                            borderRadius: 10,
                            overflow: "hidden",
                            backgroundColor: C.white,
                            borderWidth: 0.5,
                            borderColor: primaryColor,
                            borderStyle: "solid",
                          }}>
                            <Image src={secondUrl} style={styles.renderImg} />
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* Disclaimer legale obbligatorio, compatto e nello stesso foglio */}
                <View style={[styles.renderDisclaimerBox, { marginTop: 9, padding: 8 }]} wrap={false}>
                  <Text style={styles.renderDisclaimerLabel}>Nota sul render AI</Text>
                  {htmlToPdfNodes(renderDisclaimer, { ...styles.renderDisclaimerText, fontSize: 8, lineHeight: 1.35 }, "disc-")}
                </View>
                </View>

                <View style={[styles.footer, { left: 46, right: 46 }]} fixed>
                  <View style={styles.footerRow}>
                    <Text style={styles.footerCompanyName}>{companyName}</Text>
                    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                  </View>
                </View>
              </Page>
            )}
            </>
          ),
          cta: (
            <>
            {/* ─── PAGINA FINALE — CTA + RENDER + TESTIMONIANZE ───────────────── */}
            <Page size="A4" style={styles.page}>
              <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

              <Text style={styles.pageEyebrow}>Il prossimo passo</Text>
              <Text style={styles.pageTitle}>Pronti{"\n"}per partire.</Text>
              <Text style={styles.pageSubtitle}>
                Tutto quello che serve per trasformare il preventivo in un intervento programmato.
              </Text>

              {/* CTA box */}
              <View style={styles.ctaBox}>
                <Text style={styles.ctaTitle}>{ctaTitle}</Text>
                {ctaSteps.slice(0, 5).map((step, i) => (
                  <View key={i} style={styles.ctaStep} wrap={false}>
                    <Text style={styles.ctaCheck}>{i + 1}</Text>
                    <Text style={styles.ctaText}>{step}</Text>
                  </View>
                ))}
              </View>

              {publicUrl && tpl.pdf_mostra_firma_online === true && (
                <View style={styles.signatureBox} wrap={false}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.signatureTitle}>Firma e conferma online</Text>
                    <Text style={styles.signatureText}>
                      Usa il link per consultare la pagina pubblica del preventivo e confermare
                      digitalmente, senza stampare il documento.
                    </Text>
                    <Text style={styles.signatureUrl}>{publicUrl}</Text>
                  </View>
                </View>
              )}

              {/* Note del consulente al cliente (migration 20270513240000):
                  condizioni speciali, tempi consegna concordati, scelte di
                  stile. Visibili nel PDF SOLO se il commerciale ha compilato
                  il campo note_cliente in StepConsulenza. */}
              {p.note_cliente && p.note_cliente.trim().length > 0 && (
                <View
                  style={{
                    marginTop: 16,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: C.gray200,
                    borderRadius: 6,
                    backgroundColor: C.gray50,
                  }}
                  wrap
                >
                  <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>Note del consulente</Text>
                  {p.note_cliente.split(/\n\n+/).map((para, i) => (
                    <Text key={i} style={[styles.condizioniText, { marginBottom: 4 }]}>
                      {para}
                    </Text>
                  ))}
                </View>
              )}

              {/* Testimonianze rapide nella stessa CTA page se attive.
                  Field map: SrTestimonianza = { quote, autore, citta?, intervento? }.
                  Prima il codice usava `testo/cliente_nome/dettaglio` che non esistono
                  sul type → nessuna recensione veniva mai mostrata. */}
              {recensioniAttivo && testimonianze.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Cosa dicono i nostri clienti</Text>
                  {testimonianze.slice(0, 3).map((t, i) => {
                    const sub = [t.citta, t.intervento].filter(Boolean).join(" · ");
                    return (
                      <View key={i} style={styles.testimonialBox} wrap={false}>
                        <Text style={styles.testimonialQuote}>&ldquo;{t.quote}&rdquo;</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                          {t.foto_url ? (
                            <Image src={t.foto_url} style={{ width: 22, height: 22, borderRadius: 11, marginRight: 6, objectFit: "cover" }} />
                          ) : null}
                          <Text style={styles.testimonialAuthor}>
                            — {t.autore}{sub ? ` · ${sub}` : ""}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              {/* Brand legitimacy footer in CTA: dati legali in piccolo,
                  segnala professionalità + protezione legale. */}
              {brandFooterAttivo && brandFooterTesto && !condizioniLegaliTesto && (
                <Text style={styles.brandFooter}>{brandFooterTesto}</Text>
              )}

              <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
            </Page>
            </>
          ),
          // ─── PAGINA GARANZIE (CRO) ─────────────────────────────────────
          garanzie: (
            <>
            {garanzie.length > 0 && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.pageEyebrow}>Le nostre garanzie</Text>
                <Text style={styles.pageTitle}>Più controllo.{"\n"}Meno dubbi.</Text>
                <Text style={styles.pageSubtitle}>
                  Le garanzie che rendono il progetto più chiaro prima della conferma.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                  {garanzie.slice(0, 6).map((g, i) => (
                    <View key={i} style={styles.garanziaCard} wrap={false}>
                      <View style={styles.garanziaIcon}>
                        <GaranziaIconSvg kind={g.icona} color={C.onPrimary} />
                      </View>
                      <Text style={styles.garanziaTitolo}>{g.titolo}</Text>
                      <Text style={styles.garanziaDesc}>{g.descrizione}</Text>
                    </View>
                  ))}
                </View>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            )}
            </>
          ),
          // ─── PAGINA CONFRONTO PRIMA/DOPO NUMERICO ──────────────────────
          // Gate sul toggle confronto_attivo (default true): rispettato anche
          // se ci sono righe valorizzate. Se l'utente lo disattiva nell'editor,
          // la pagina non viene generata.
          confronto: (
            <>
            {confrontoAttivo && confrontoRighe.length > 0 && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.pageEyebrow}>Confronto tecnico · Prima &amp; Dopo</Text>
                <Text style={styles.pageTitle}>{confrontoTitolo}</Text>
                <Text style={styles.pageSubtitle}>
                  Un confronto semplice tra la situazione attuale e la soluzione proposta.
                </Text>
                {/* Header tabella */}
                <View style={{ flexDirection: "row", paddingVertical: 8, borderBottom: `1pt solid ${C.gray300}`, marginTop: 16 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableHeaderText}>Parametro</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={[styles.tableHeaderText, { color: C.gray500 }]}>Attuale</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={[styles.tableHeaderText, { color: C.ink }]}>Nuovo</Text>
                  </View>
                  <View style={{ flex: 0.7, alignItems: "flex-end" }}>
                    {/* "Δ" non esiste in Helvetica WinAnsi (usciva «"») */}
                    <Text style={[styles.tableHeaderText, { color: C.successText }]}>Miglioria</Text>
                  </View>
                </View>
                {confrontoRighe.map((r, i) => (
                  <View key={i} style={styles.confrontoRow} wrap={false}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.confrontoCell}>{senzaMenoTipografico(r.parametro)}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={[styles.confrontoCell, { color: C.gray500 }]}>{senzaMenoTipografico(r.prima)}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={styles.confrontoCellStrong}>{senzaMenoTipografico(r.dopo)}</Text>
                    </View>
                    <View style={{ flex: 0.7, alignItems: "flex-end" }}>
                      {r.delta && <Text style={styles.confrontoCellDelta}>{senzaMenoTipografico(r.delta)}</Text>}
                    </View>
                  </View>
                ))}
                <Text style={{ fontSize: 8.5, color: C.gray500, marginTop: 14, fontStyle: "italic" }}>
                  Valori indicativi, da confermare con rilievo tecnico e schede prodotto definitive.
                  Quando non personalizzati nel template, i dati rappresentano benchmark medi di settore.
                </Text>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            )}
            </>
          ),
          // ─── PAGINA FAQ ────────────────────────────────────────────────
          faq: (
            <>
            {faqItems.length > 0 && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.pageEyebrow}>Domande frequenti</Text>
                <Text style={styles.pageTitle}>Le risposte{"\n"}prima della conferma.</Text>
                <Text style={styles.pageSubtitle}>
                  I dubbi più comuni spiegati in modo semplice, prima di decidere.
                </Text>
                <View style={{ marginTop: 14 }}>
                  {faqItems.slice(0, 8).map((f, i) => (
                    <View key={i} style={styles.faqItem} wrap={false}>
                      <Text style={styles.faqDomanda}>{i + 1}. {f.domanda}</Text>
                      <Text style={styles.faqRisposta}>{f.risposta}</Text>
                    </View>
                  ))}
                </View>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            )}
            </>
          ),
          // ─── PAGINA CONDIZIONI LEGALI ──────────────────────────────────
          // Gate sul toggle condizioni_legali_attivo (default true): la pagina
          // viene generata SOLO se attivo. Permette di nascondere temporanea-
          // mente senza dover svuotare il testo dal DB.
          condizioni: (
            <>
            {condizioniLegaliAttivo && condizioniLegaliTesto && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.pageEyebrow}>Appendice legale</Text>
                <Text style={[styles.pageTitle, { fontSize: 22 }]}>Condizioni e disclaimer</Text>
                <Text style={styles.pageSubtitle}>
                  Termini contrattuali e disclaimer applicabili a questo preventivo.
                </Text>
                <View style={{ marginTop: 14 }}>
                  {condizioniLegaliTesto.split(/\n\n+/).map((para, i) => (
                    <Text key={i} style={[styles.condizioniText, { marginBottom: 8 }]}>
                      {para}
                    </Text>
                  ))}
                </View>
                {brandFooterAttivo && brandFooterTesto && (
                  <Text style={styles.brandFooter}>{brandFooterTesto}</Text>
                )}
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            )}
            </>
          ),
          // ─── PAGINA I NOSTRI LAVORI (gallery foto realizzazioni) ───────
          gallery_lavori: (
            <>
            {galleryLavori.length > 0 && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.sectionTitle}>I nostri lavori</Text>
                <Text style={{ fontSize: 8.5, color: "#6B7280", marginBottom: 10 }}>Alcuni esempi di interventi realizzati dalla nostra azienda.</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {galleryLavori.map((item, i) => (
                    <View key={i} style={{ width: "47%", marginBottom: 8 }} wrap={false}>
                      <Image src={item.url} style={{ width: "100%", height: 110, borderRadius: 4 }} />
                      {item.didascalia ? <Text style={{ fontSize: 8, marginTop: 3, color: "#374151" }}>{item.didascalia}</Text> : null}
                      {item.luogo ? <Text style={{ fontSize: 7, color: "#9CA3AF" }}>{item.luogo}</Text> : null}
                    </View>
                  ))}
                </View>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} quoteCode={p.code} revisionNumber={p.revision_number} showRevisionFooter={tpl.pdf_show_revision_footer !== false} capitaleSociale={capitaleSociale} numeroRea={numeroRea} pec={pec} showLegalFooter={showLegalFooter} />
              </Page>
            )}
            </>
          ),
        };
        return pdfPagesOrder
          .filter((pg) => pg.visible)
          .map((pg) => <React.Fragment key={pg.id}>{pageEls[pg.id]}</React.Fragment>);
      })()}

    </Document>
  );
}
