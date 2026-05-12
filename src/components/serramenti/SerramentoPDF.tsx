/**
 * SerramentoPDF — Documento PDF nativo A4 generato lato client con
 * @react-pdf/renderer, design ispirato al benchmark "Solar Pro Italia"
 * ma adattato al brand Edilizia in Cloud / serramenti.
 *
 * Strutture pagina:
 *   1. Cover — sfondo scuro, hero personalizzabile, decoro SVG finestra,
 *               dati cliente in card con accent arancio
 *   2. Proposta intervento — anagrafica, sintesi, esigenze, soluzione, perché noi
 *   3. Investimento — prezzo big, modalità pagamento step-by-step, finanziamento,
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
import { Document, Page, Text, View, StyleSheet, Image, Svg, Path, Rect, Circle, G, Font } from "@react-pdf/renderer";
import type {
  SrProgettoDetail, SrSerramentoRow, SrPagamentoMilestone,
  SrPianoFinanziamento, SrEsigenza, SrSoluzioneItem, SrTestimonianza,
  SrTemplatePdfRow,
} from "@/types/serramenti";
import { SR_TIPOLOGIE_SERRAMENTO, SR_MATERIALI, SR_SCHEMI_PAGAMENTO, SR_PERCORSO_DEFAULT, normalizePdfPagesOrder, SR_GARANZIE_DEFAULT, SR_CONFRONTO_DEFAULT, SR_CERTIFICAZIONI_DEFAULT, SR_BONUS_DEFAULT, SR_FAQ_DEFAULT } from "@/types/serramenti";
import type {
  SrPercorsoCliente, SrPdfPageId, SrPdfPageOrderItem,
  SrGaranzia, SrConfrontoRiga, SrCertificazione, SrBonus, SrFaq,
} from "@/types/serramenti";
import { generateInterventoSintesi } from "@/lib/serramenti/sintesiIntervento";
import type {
  SerramentoPdfConsulente, SerramentoPdfFamilyData,
  SerramentoPdfMacroField, SerramentoPdfMacroPagina,
} from "@/hooks/useSerramentoPDF";

// Font: usiamo Helvetica built-in di react-pdf (zero rete, zero failure).
// Tentativi precedenti di registrare Inter via Google Fonts CDN avevano
// URL instabili che davano 404 e facevano fallire l'intera generazione
// PDF (react-pdf è strict: se un font registrato non scarica → throw).
// Helvetica è elegante per documenti business e supporta i 4 pesi che servono.
const FF = "Helvetica";

// Disabilita hyphenation built-in di react-pdf: tagliava parole italiane
// in modo brutto (es. "cal-do" invece di "caldo") sul titolo cover quando
// la riga era stretta. Restituendo `[word]` impediamo qualsiasi spezzamento
// → la parola intera va a capo se non c'entra.
Font.registerHyphenationCallback((word) => [word]);

// ─── Palette default (override dinamico da template.colore_primario) ──────
const DEFAULT_PRIMARY = "#2D7D5C";
const DEFAULT_ACCENT = "#F59E0B";
const COVER_BG = "#0F2A2E";

function makePalette(primary: string, accent = DEFAULT_ACCENT) {
  return {
    primary,
    accent,
    primaryLight: hexToTint(primary, 0.92),
    primaryBorder: hexToTint(primary, 0.65),
    coverBg: COVER_BG,
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
    accentLight: "#FEF3C7",
    accentText: "#92400E",
  };
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
      paddingBottom: 64,
      paddingHorizontal: 44,
      backgroundColor: C.white,
    },
    cover: {
      fontFamily: FF,
      color: C.white,
      paddingTop: 64,
      paddingBottom: 64,
      paddingHorizontal: 54,
      backgroundColor: C.coverBg,
      flexDirection: "column",
      // NB: NIENTE `justifyContent: space-between` qui.
      // react-pdf con space-between + Image absolute full-A4 calcola male
      // l'altezza della Page e splitta la cover in 2-3 pagine (bug riprodotto
      // più volte). Usiamo invece `marginTop: auto` sulla View del footer
      // per pushare il footer in basso → comportamento equivalente,
      // ZERO splitting.
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
    headerName: { fontSize: 11, fontWeight: 700, color: C.primary },
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
    coverLogoBox: { flexDirection: "row", alignItems: "center", marginBottom: 58 },
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
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 18,
      borderTop: `0.5pt solid rgba(255,255,255,0.18)`,
      fontSize: 9,
      color: "#9CA3AF",
      // marginTop: "auto" sostituisce il `justifyContent: space-between` del
      // parent cover. Pusha il footer in basso senza far calcolare male
      // l'altezza alla Page → niente split multi-pagina.
      marginTop: "auto",
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
      color: C.primary,
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

    sectionTitle: {
      fontSize: 10,
      fontWeight: 700,
      color: C.primary,
      textTransform: "uppercase" as const,
      letterSpacing: 0.7,
      marginTop: 20,
      marginBottom: 8,
      paddingBottom: 5,
      borderBottom: `1pt solid ${C.gray200}`,
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
    priceLabel: {
      fontSize: 9,
      color: C.primary,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: 0.9,
      marginBottom: 6,
    },
    priceValue: { fontSize: 28, fontWeight: 800, color: C.primary },
    priceSuffix: { fontSize: 11, color: C.primary, marginLeft: 8, fontWeight: 500 },

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
    payStepIdxText: { color: C.white, fontSize: 10, fontWeight: 700 },
    payStepBody: { flex: 1, paddingRight: 8 },
    payStepLabel: { fontSize: 10.5, fontWeight: 700, color: C.gray900 },
    payStepWhen: { fontSize: 9, color: C.gray500, marginTop: 2 },
    payStepRight: { width: 95, alignItems: "flex-end" },
    payStepPct: { fontSize: 13, fontWeight: 700, color: C.primary },
    payStepAmount: { fontSize: 8.5, color: C.gray500, marginTop: 2 },

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
    finCardValue: { fontSize: 20, fontWeight: 800, color: C.primary },
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
      objectFit: "cover" as const,
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
    chiSiamoHeroPh: {
      width: "100%", height: 180,
      borderRadius: 10,
      backgroundColor: C.gray100,
      alignItems: "center", justifyContent: "center",
      marginBottom: 14,
    },
    // Testo Chi siamo compatto: 10pt invece di 11pt, line-height 1.5 invece
    // di 1.65 → il testo lungo non occupa più 2 pagine intere.
    chiSiamoText: { fontSize: 10, color: C.gray700, lineHeight: 1.5 },

    // Percorso cliente — step cards
    percorsoBigNumber: {
      fontSize: 86, fontWeight: 800, color: C.primary,
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
      color: C.primary, letterSpacing: 1.2,
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
    percorsoFaseRomanText: { color: "#FFFFFF", fontSize: 10, fontWeight: 700 },
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
    percorsoStepIdxText: { color: "#FFFFFF", fontSize: 7.5, fontWeight: 700 },
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
      fontSize: 15, fontWeight: 700, color: C.white,
      textTransform: "uppercase" as const,
      letterSpacing: 0.6, marginBottom: 12,
    },
    ctaStep: { flexDirection: "row", alignItems: "flex-start", marginBottom: 9 },
    ctaCheck: {
      width: 18, height: 18, borderRadius: 9,
      backgroundColor: C.white, color: C.primary,
      fontSize: 11, fontWeight: 700, textAlign: "center" as const,
      paddingTop: 2, marginRight: 10,
    },
    ctaText: { flex: 1, fontSize: 10.5, color: C.white, lineHeight: 1.5 },

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
    urgenzaScadenza: { fontSize: 12, fontWeight: 700, color: C.primary },
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

function fmtEuro(v: number | null | undefined, decimals = 0): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return d; }
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
  /** Override macrocategoria per BOM manuali senza family_id */
  macrocategoria_override_id: string | null;
}> {
  const map = new Map<string, {
    key: string; tipologia: string; materiale: string; serie: string;
    vetro: string; ambiente: string; colore_interno: string; colore_esterno: string;
    larghezza: number | null; altezza: number | null;
    quantita: number; family_id: string | null;
    macrocategoria_override_id: string | null;
  }>();
  for (const s of serr) {
    const L = s.larghezza_mm ?? null;
    const H = s.altezza_mm ?? null;
    const ci = s.colore_interno ?? "";
    const ce = s.colore_esterno ?? "";
    const baseKey = s.family_id
      ? `fam-${s.family_id}__${s.tipologia}`
      : `oth-${s.tipologia}__${s.materiale ?? ""}__${s.serie ?? ""}__${s.vetro ?? ""}`;
    const key = `${baseKey}__${L ?? "-"}x${H ?? "-"}__${s.ambiente ?? ""}__${ci}__${ce}`;
    const existing = map.get(key);
    if (existing) existing.quantita += s.quantita ?? 1;
    else map.set(key, {
      key,
      tipologia: tipologiaLabel(s.tipologia),
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
      macrocategoria_override_id: s.macrocategoria_override_id ?? null,
    });
  }
  return Array.from(map.values());
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

// ─── SVG: Decoro cover (finestra stilizzata) ───────────────────────────────

function CoverDecorationSvg({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 180 180" style={{ width: 180, height: 180 } as never}>
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

  // Tick Y a multipli sensati
  const yTicks = [yMin, (yMin + yMax) / 2, yMax].filter((v, i, arr) => arr.indexOf(v) === i);

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
          <Text x={padL - 6} y={yOf(v) + 3} fill="#64748B" style={{ fontSize: 7, textAnchor: "end" } as never}>
            € {Math.round(v / 1000)}k
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
      {/* Label X (A1, A3, A5...) */}
      {years.map((y, i) => {
        const showLabel = i === 0 || i === years.length - 1 || (i + 1) % 2 === 0;
        if (!showLabel) return null;
        return (
          <Text
            key={`x-${i}`}
            x={xOf(i)} y={H - 8}
            fill="#64748B"
            style={{ fontSize: 7, textAnchor: "middle" } as never}
          >
            A{y.year}
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
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>
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

function PageFooter({ companyName, indirizzo, telefono, email, vat, website, styles }: {
  companyName: string;
  indirizzo?: string | null; telefono?: string | null; email?: string | null;
  vat?: string | null; website?: string | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  const line1 = [indirizzo, telefono, email].filter(Boolean).join(" · ");
  const line2 = [vat ? `P.IVA ${vat}` : null, website].filter(Boolean).join(" · ");
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerRow}>
        <Text style={styles.footerCompanyName}>{companyName}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
      {line1 && <View style={styles.footerRow}><Text>{line1}</Text><Text></Text></View>}
      {line2 && <View style={styles.footerRow}><Text>{line2}</Text><Text></Text></View>}
    </View>
  );
}

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
    website?: string | null;
  } | null;
  consulente: SerramentoPdfConsulente | null;
  familiesById: Record<string, SerramentoPdfFamilyData>;
  fieldsByMacro: Record<string, SerramentoPdfMacroField[]>;
  macroPagineDedicate: SerramentoPdfMacroPagina[];
  /** Mappa macrocategoria_id → immagine_url. Fallback per la composizione
   *  serramenti quando la famiglia non ha immagine propria. */
  macroImageById?: Record<string, string | null>;
  /** Mappa macrocategoria_id → nome. Renderizzato come breadcrumb
   *  "MACROCATEGORIA · Articolo" nella composizione serramenti del PDF. */
  macroNomeById?: Record<string, string>;
  /** Macro_id default per BOM senza family e senza override esplicito. */
  autoFallbackMacroId?: string | null;
}

// ─── Componente principale ─────────────────────────────────────────────────

export function SerramentoPDF({
  detail, template, company,
  consulente, familiesById, fieldsByMacro, macroPagineDedicate,
  macroImageById: _macroImageById = {},
  macroNomeById = {},
  autoFallbackMacroId = null,
}: SerramentoPDFProps) {
  const p = detail.progetto;
  const companyName = template?.ragione_sociale || company?.ragione_sociale || company?.name || "Azienda";
  const logoUrl = template?.logo_url || company?.logo_url || null;
  const primaryColor = template?.colore_primario || DEFAULT_PRIMARY;
  const C = makePalette(primaryColor);
  const styles = makeStyles(C);

  const clienteNome = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "Cliente";
  const sintesi = p.intervento_sintesi?.trim()
    || generateInterventoSintesi(detail.serramenti, detail.accessori, p.tipo_intervento)
    || "Intervento da definire";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tpl = (template ?? {}) as any;
  const coverHero = tpl.pdf_cover_hero || "La tua casa,\nfinalmente al caldo.";
  const coverSubhero = tpl.pdf_cover_subhero || sintesi;
  const coverEyebrow = tpl.pdf_cover_eyebrow || "LA TUA PROPOSTA PERSONALIZZATA";
  const coverImageUrl = tpl.pdf_cover_image_url || null;
  const coverOverlayOpacity = typeof tpl.pdf_cover_overlay_opacity === "number"
    ? Math.max(0, Math.min(100, tpl.pdf_cover_overlay_opacity)) / 100
    : 0.65;
  const coverBgColor = tpl.pdf_cover_bg_color || null; // null = usa C.coverBg default
  const coverEyebrowSize = typeof tpl.pdf_cover_eyebrow_size === "number" ? tpl.pdf_cover_eyebrow_size : 10;
  const coverTitleSize = typeof tpl.pdf_cover_title_size === "number" ? tpl.pdf_cover_title_size : 40;
  const coverSubtitleSize = typeof tpl.pdf_cover_subtitle_size === "number" ? tpl.pdf_cover_subtitle_size : 13;
  const coverTextColor = tpl.pdf_cover_text_color || "#FFFFFF";
  const coverShowDecoration = tpl.pdf_cover_show_decoration !== false;
  const coverShowClientCard = tpl.pdf_cover_show_client_card !== false;
  const coverTextAlign = (tpl.pdf_cover_text_align === "center" ? "center" : "left") as "left" | "center";
  const ctaTitle = tpl.pdf_cta_finale_titolo || "Cosa fare adesso";
  const ctaSteps = (Array.isArray(tpl.pdf_cta_finale_passi) && tpl.pdf_cta_finale_passi.length > 0)
    ? tpl.pdf_cta_finale_passi as string[]
    : [
        "Conferma l'appuntamento di consulenza tecnica",
        "Firma digitale del preventivo via link sicuro",
        "Versa l'acconto secondo lo schema concordato",
        "Diamo il via alla produzione e cantiere",
      ];

  // "Chi siamo" — pagina opzionale subito dopo la cover
  const chiSiamoAttivo = !!tpl.chi_siamo_attivo;
  const chiSiamoFotoUrl = tpl.chi_siamo_foto_url || null;
  const chiSiamoTitolo = tpl.chi_siamo_titolo || `Chi siamo · ${companyName}`;
  const chiSiamoTesto = tpl.chi_siamo_testo || null;

  // Recensioni — toggle
  const recensioniAttivo = tpl.recensioni_attivo !== false;

  // Render — disclaimer custom o default IT
  const renderDisclaimer = tpl.render_disclaimer ||
    "Render generato con intelligenza artificiale a scopo esclusivamente dimostrativo e illustrativo. L'immagine non rappresenta il risultato finale dell'intervento, che potrà variare in base a rilievi tecnici, materiali scelti, misure reali, condizioni dell'ambiente e fattibilità esecutiva.";

  // Descrizione consulente — testo generico mostrato sotto nome+contatti
  const consulenteDescrizione = tpl.consulente_descrizione_default ||
    "Ti accompagnerò personalmente dal primo sopralluogo fino al collaudo finale. Per qualunque domanda o necessità durante il preventivo, sono il tuo punto di riferimento.";

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
  const certificazioniRaw = (Array.isArray(tpl.certificazioni) ? tpl.certificazioni : []) as SrCertificazione[];
  const certificazioni: SrCertificazione[] = certificazioniRaw.length > 0 ? certificazioniRaw : SR_CERTIFICAZIONI_DEFAULT;
  const bonusRaw = (Array.isArray(tpl.bonus_aggiuntivi) ? tpl.bonus_aggiuntivi : []) as SrBonus[];
  const bonus: SrBonus[] = bonusRaw.length > 0 ? bonusRaw : SR_BONUS_DEFAULT;
  const faqItemsRaw = (Array.isArray(tpl.faq_items) ? tpl.faq_items : []) as SrFaq[];
  const faqItems: SrFaq[] = faqItemsRaw.length > 0 ? faqItemsRaw : SR_FAQ_DEFAULT;
  const brandFooterTesto = (tpl.brand_footer_testo as string | null) || null;
  const condizioniLegaliTesto = (tpl.condizioni_legali_testo as string | null) || null;

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

  const totaleMin = Number(p.totale_min ?? 0);
  const totaleMax = Number(p.totale_max ?? 0);
  const totaleMedia = (totaleMin + totaleMax) / 2;
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
  const hasPrimaDopo = primaUrls.length > 0 && renderUrls.length > 0;
  const serramentiGrouped = groupSerramentiAdvanced(detail.serramenti);

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

  const indirizzo = template?.indirizzo_completo || company?.indirizzo;
  const telefono = template?.telefono || company?.telefono;
  const email = template?.email || company?.email;
  const vat = template?.partita_iva || company?.partita_iva;
  const website = company?.website;

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
          FIX DEFINITIVO multi-page bug (PDF split su 3 pagine: bg image standalone
          + cover content + overflow rosso).

          CAUSA: il combo di 3 fattori = react-pdf calcola male l'altezza
          della Page e splitta:
            (a) Image absolute full-A4 (595×842pt) → react-pdf in alcune
                build conta verso l'altezza del flex parent.
            (b) styles.cover con `justifyContent: space-between` → forza il
                parent a "espandere" alla somma dei children.
            (c) wrap=true (default) → consente lo split.

          FIX: tutti e 3 fattori neutralizzati simultaneamente.
            (a) Image rimane absolute con dimensioni esplicite — OK
            (b) RIMOSSO space-between dal cover style; il footer va in basso
                via `marginTop: auto` sulla View del footer.
            (c) wrap={false} sulla Page — clip dell'eventuale overflow, NO split. */}
      <Page
        size="A4"
        wrap={false}
        style={[
          styles.cover,
          coverBgColor ? { backgroundColor: coverBgColor } : undefined,
          { color: coverTextColor },
        ]}
      >
        {/* Immagine di sfondo opzionale.
            Dimensioni in pt esplicite (A4 = 595×842pt) invece di "100%" perché
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
              height: 842,
              objectFit: "cover" as const,
            }}
          />
        )}
        {/* Overlay scuro sopra immagine per leggibilità */}
        {coverImageUrl && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 595,
              height: 842,
              backgroundColor: "#000000",
              opacity: coverOverlayOpacity,
            }}
          />
        )}
        {/* Decoro SVG finestra in alto a destra (toggle template).
            Usa il colore PRIMARIO (non l'accent) per coerenza con la preview
            visuale del template editor, che mostra appunto un blocco accent
            del colore primario in quella posizione. */}
        {coverShowDecoration && (
          <View style={styles.coverDecoSvg}>
            <CoverDecorationSvg color={primaryColor} />
          </View>
        )}

        <View style={{ alignItems: coverTextAlign === "center" ? "center" : "flex-start" }}>
          <View style={styles.coverLogoBox}>
            {logoUrl ? (
              <Image src={logoUrl} style={styles.coverLogoImage} />
            ) : (
              <View style={styles.coverLogoCircle}>
                <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: 700 }}>
                  {(companyName || "S").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View>
              <Text style={[styles.coverCompanyName, { color: coverTextColor }]}>{companyName}</Text>
              {company?.indirizzo && <Text style={styles.coverCompanyTag}>{company.indirizzo}</Text>}
            </View>
          </View>

          <Text style={[styles.coverEyebrow, { fontSize: coverEyebrowSize, textAlign: coverTextAlign }]}>{coverEyebrow}</Text>
          <Text style={[styles.coverTitle, { fontSize: coverTitleSize, color: coverTextColor, textAlign: coverTextAlign }]}>{coverHero}</Text>
          <Text style={[styles.coverSubtitle, { fontSize: coverSubtitleSize, textAlign: coverTextAlign }]}>{coverSubhero}</Text>

          {coverShowClientCard && (
            <View style={styles.coverCard}>
              <Text style={styles.coverLabel}>Preparato per</Text>
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

        <View style={styles.coverFooter}>
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
                ) : (
                  <View style={styles.chiSiamoHeroPh}>
                    <Text style={{ fontSize: 14, color: C.gray500, fontWeight: 700 }}>{companyName}</Text>
                  </View>
                )}
                {chiSiamoTesto && (
                  <View>
                    {chiSiamoTesto.split(/\n\n+/).map((para, i) => {
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
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
              </Page>
            )}
            </>
          ),
          proposta: (
            <>
            {/* ─── PAGINA 2 — PROPOSTA INTERVENTO ──────────────────────────────── */}
            <Page size="A4" style={styles.page}>
              <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

              <Text style={styles.pageEyebrow}>Pagina 2 · Proposta di intervento</Text>
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
                    {[p.cantiere_indirizzo, p.cantiere_citta, p.cantiere_piano ? `· piano ${p.cantiere_piano}` : null]
                      .filter(Boolean).join(", ")}
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

              {percheNoi.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Perché {companyName}</Text>
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

              <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
            </Page>
            </>
          ),
          allegato_tecnico: (
            <>
            {/* ─── PAGINA 3 — ALLEGATO TECNICO ────────────────────────────────── */}
            <Page size="A4" style={styles.page}>
              <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

              <Text style={styles.pageEyebrow}>Pagina 3 · Allegato tecnico</Text>
              <Text style={styles.pageTitle}>Cosa entra{"\n"}in cantiere.</Text>
              <Text style={styles.pageSubtitle}>Composizione dettagliata dei serramenti e degli accessori previsti.</Text>

              <Text style={styles.sectionTitle}>Composizione serramenti · {numSerr} pezzi</Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
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
                  // Titolo: nome reale della famiglia se disponibile, altrimenti tipologia generica
                  const titolo = family?.nome?.trim() || g.tipologia;
                  // Breadcrumb macrocategoria. Stampato in piccolo sopra il
                  // titolo della riga (es. "INFISSI WND > Articolo PVC 70").
                  const macroNomeRow = macroId ? (macroNomeById[macroId] || null) : null;
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
                          <Text style={{ fontSize: 7.5, fontWeight: 700, color: C.primary, letterSpacing: 0.8, marginBottom: 1 }}>
                            {macroNomeRow.toUpperCase()}
                          </Text>
                        )}
                        <Text style={styles.tableCellStrong}>
                          {titolo}
                          {g.ambiente ? <Text style={{ color: C.gray500, fontWeight: 400 }}> · {g.ambiente}</Text> : null}
                        </Text>
                        <Text style={[styles.tableCellMuted, { fontWeight: 700, color: C.gray700 }]}>
                          {[
                            dimensioni,
                            g.materiale !== "—" ? g.materiale : null,
                            g.serie,
                            g.vetro,
                          ].filter(Boolean).join(" · ")}
                        </Text>
                        {(g.colore_interno || g.colore_esterno) && (
                          <Text style={styles.tableCellMuted}>
                            Colore: {[
                              g.colore_interno ? `interno ${g.colore_interno}` : null,
                              g.colore_esterno ? `esterno ${g.colore_esterno}` : null,
                            ].filter(Boolean).join(" · ")}
                          </Text>
                        )}
                        {/* Descrizione tecnica dal listino prodotti */}
                        {techDesc && (
                          <Text style={styles.tableTechDesc}>{techDesc}</Text>
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
                      <View style={{ width: 90 }}><Text style={styles.tableHeaderText}>Misure</Text></View>
                      <View style={{ width: 50, alignItems: "flex-end" }}><Text style={styles.tableHeaderText}>Q.tà</Text></View>
                    </View>
                    {detail.accessori.map((a, i) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const ax = a as any;
                      const misure = ax.larghezza_mm && ax.altezza_mm
                        ? `${ax.larghezza_mm}×${ax.altezza_mm} mm`
                        : "—";
                      return (
                        <View key={i} style={styles.tableRow} wrap={false}>
                          <View style={{ flex: 1, paddingRight: 6 }}>
                            <Text style={styles.tableCellStrong}>{a.descrizione || a.tipo}</Text>
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

              {/* La tua consulenza — il consulente è SEMPRE l'utente che ha
                  fatto il preventivo (hook fa fallback a auth.user). Mai il
                  nome azienda nel campo nome consulente. */}
              <Text style={styles.sectionTitle}>La tua consulenza</Text>
              <View style={styles.consBox}>
                {consulente?.foto_url ? (
                  <Image src={consulente.foto_url} style={styles.consPhoto} />
                ) : (
                  <View style={styles.consPhotoPh}>
                    <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: 700 }}>
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
                  {consulenteDescrizione && (
                    <Text style={{ fontSize: 9.5, color: C.gray700, lineHeight: 1.5, marginTop: 5 }}>
                      {consulenteDescrizione}
                    </Text>
                  )}
                  <Text style={styles.consContact}>
                    {p.consulenza_at ? `Appuntamento: ${fmtDateTime(p.consulenza_at)}\n` : ""}
                    {[consulente?.telefono, consulente?.email].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>

              <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
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
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
              </Page>
            ))}
            </>
          ),
          investimento: (
            <>
            {/* ─── PAGINA — INVESTIMENTO (spostata DOPO i prodotti) ──────────────
                La pagina economica viene mostrata dopo l'allegato tecnico e le
                pagine dedicate macrocategoria: il cliente vede prima COSA gli
                stiamo proponendo (composizione + foto + descrizione macro), e
                solo dopo QUANTO costa. Flusso narrativo: prodotto → valore. */}
            <Page size="A4" style={styles.page}>
              <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />

              <Text style={styles.pageEyebrow}>Pagina 4 · L'investimento</Text>
              <Text style={styles.pageTitle}>Trasparenza{"\n"}totale.</Text>
              <Text style={styles.pageSubtitle}>
                Forbice indicativa basata sul primo contatto. Il prezzo definitivo si fissa con sopralluogo e scelta materiali.
              </Text>

              <View style={styles.priceBox}>
                <Text style={styles.priceLabel}>Il tuo investimento stimato</Text>
                <Text style={styles.priceValue}>
                  € {fmtEuro(totaleMin)} – € {fmtEuro(totaleMax)}
                  <Text style={styles.priceSuffix}>IVA inclusa</Text>
                </Text>
                <Text style={{ fontSize: 9, color: C.primary, marginTop: 4 }}>
                  Media: € {fmtEuro(totaleMedia)}
                </Text>
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
                    <Text style={[styles.urgenzaDesc, { color: C.primary, fontWeight: 700, marginTop: 6 }]}>
                      Sconto extra -{earlyBirdPct}% se firmi entro il {scadenzaEarlyBird}
                    </Text>
                  )}
                </View>
              )}

              {milestones.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Modalità di pagamento</Text>
                  <Text style={styles.paySchemaTag}>{schemaCfg?.label ?? "Personalizzato"}</Text>
                  {milestones.map((m, i) => {
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
                  })}
                </>
              )}

              {piani.length > 0 && schemaCfg?.hasFinanziamento && (
                <>
                  <Text style={styles.sectionTitle}>Simulazione finanziamento</Text>
                  <View style={styles.finBox}>
                    {piani.slice(0, 2).map((piano, i) => (
                      <View key={i} style={styles.finCard}>
                        <Text style={styles.finCardTitle}>{piano.nome} · {piano.mesi} mesi · TAN {piano.tasso}%</Text>
                        <Text style={styles.finCardValue}>€ {fmtEuro(piano.rata_mese)}</Text>
                        <Text style={styles.finCardSub}>/mese · finanziato € {fmtEuro(piano.finanziato)}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={{ fontSize: 7.5, color: C.gray500, marginTop: 6 }}>
                    Esempi a scopo informativo. Condizioni contrattuali definitive disponibili in sede.
                  </Text>
                </>
              )}

              {p.detrazione_aliquota && (p.detrazione_eur_totale ?? 0) > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Detrazione fiscale</Text>
                  {/* NOTE: niente flex:1 — usiamo View standalone con padding fisso
                      (lo style finCard ha flex:1 perché pensato per layout 2 colonne) */}
                  <View style={{
                    backgroundColor: C.successBg,
                    borderColor: "#86EFAC", borderWidth: 0.5, borderStyle: "solid",
                    borderRadius: 8, padding: 14, marginTop: 6,
                  }}>
                    <Text style={[styles.finCardTitle, { color: C.successText }]}>
                      Detrazione {p.detrazione_aliquota}% recuperabile in 10 quote annuali
                    </Text>
                    <Text style={[styles.finCardValue, { color: C.successText }]}>
                      € {fmtEuro(p.detrazione_eur_totale)}
                    </Text>
                    <Text style={[styles.finCardSub, { color: C.successText }]}>
                      circa € {fmtEuro(p.detrazione_eur_anno)} / anno per 10 anni
                    </Text>
                  </View>
                </>
              )}

              {cashflowYears.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Cashflow 10 anni — rientro dell'investimento</Text>
                  <CashflowSvg years={cashflowYears} primary={primaryColor} />
                  <Text style={{ fontSize: 8.5, color: C.gray500, marginTop: 4 }}>
                    Risparmio bolletta + detrazione fiscale cumulati anno dopo anno.
                    La linea tratteggiata indica l'anno in cui l'investimento è
                    completamente ripagato (break-even).
                  </Text>

                  {/* TABELLA RISPARMIO 10 ANNI — dettaglio anno-per-anno */}
                  <View style={{ marginTop: 12 }}>
                    <View style={styles.tableHeader}>
                      <View style={{ width: 38 }}><Text style={styles.tableHeaderText}>Anno</Text></View>
                      <View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.tableHeaderText}>Risparmio</Text></View>
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
                            paddingVertical: 5,
                            borderBottom: `0.5pt solid ${C.gray100}`,
                            backgroundColor: isBreakEven ? C.successBg : "transparent",
                          }}
                          wrap={false}
                        >
                          <View style={{ width: 38 }}>
                            <Text style={{ fontSize: 9, fontWeight: 700, color: C.gray900 }}>
                              A{y.year}{isBreakEven ? " *" : ""}
                            </Text>
                          </View>
                          <View style={{ flex: 1, alignItems: "flex-end" }}>
                            <Text style={{ fontSize: 9, color: C.gray700 }}>€ {fmtEuro(risp)}</Text>
                          </View>
                          <View style={{ flex: 1, alignItems: "flex-end" }}>
                            <Text style={{ fontSize: 9, color: C.gray700 }}>€ {fmtEuro(det)}</Text>
                          </View>
                          <View style={{ flex: 1, alignItems: "flex-end" }}>
                            <Text style={{ fontSize: 9, fontWeight: cumulato >= 0 ? 700 : 400, color: cumulato >= 0 ? C.successText : C.gray500 }}>
                              {cumulato >= 0 ? "+" : ""}€ {fmtEuro(Math.abs(cumulato))}
                            </Text>
                          </View>
                          <View style={{ width: 80, alignItems: "flex-end" }}>
                            <Text style={{ fontSize: 8, color: C.gray500 }}>{recupero.toFixed(0)}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 8, color: C.gray500, marginTop: 5, fontStyle: "italic" }}>
                    * Anno di break-even — l'investimento iniziale è completamente ripagato dal risparmio + detrazione.
                  </Text>
                </>
              )}

              {/* SE PAGHI A RATE — confronto rata vs risparmio mensile */}
              {schemaCfg?.hasFinanziamento && piani.length > 0 && Number(p.risparmio_eur_anno ?? 0) > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Se paghi a rate — bilancio mensile</Text>
                  {(() => {
                    const piano = piani[0];
                    const rataMese = Number(piano.rata_mese ?? 0);
                    const risparmioMese = Number(p.risparmio_eur_anno ?? 0) / 12;
                    const detrazioneMese = Number(p.detrazione_eur_anno ?? 0) / 12;
                    const beneficioMese = risparmioMese + detrazioneMese;
                    const costoNetto = rataMese - beneficioMese;
                    const positivo = costoNetto <= 0;
                    return (
                      <View style={{
                        flexDirection: "row",
                        gap: 10,
                        marginTop: 4,
                      }}>
                        <View style={styles.finCard}>
                          <Text style={styles.finCardTitle}>Rata mensile</Text>
                          <Text style={[styles.finCardValue, { color: C.gray900 }]}>€ {fmtEuro(rataMese)}</Text>
                          <Text style={styles.finCardSub}>{piano.mesi} mesi · TAN {piano.tasso}%</Text>
                        </View>
                        <View style={styles.finCard}>
                          <Text style={styles.finCardTitle}>Risparmio + detrazione</Text>
                          <Text style={[styles.finCardValue, { color: C.successText }]}>- € {fmtEuro(beneficioMese)}</Text>
                          <Text style={styles.finCardSub}>al mese (media 10 anni)</Text>
                        </View>
                        <View style={[styles.finCard, {
                          backgroundColor: positivo ? C.successBg : C.gray50,
                          borderColor: positivo ? "#86EFAC" : C.gray200,
                        }]}>
                          <Text style={[styles.finCardTitle, { color: positivo ? C.successText : C.gray500 }]}>
                            Costo netto / mese
                          </Text>
                          <Text style={[styles.finCardValue, { color: positivo ? C.successText : C.primary }]}>
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
                  <Text style={{ fontSize: 8, color: C.gray500, marginTop: 6, fontStyle: "italic" }}>
                    Bilancio indicativo: la rata viene pagata oggi, il risparmio si concretizza nei prossimi
                    10 anni. Le condizioni finanziarie definitive sono nel contratto.
                  </Text>
                </>
              )}

              {incluso.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Cosa è incluso</Text>
                  {incluso.slice(0, 6).map((it, i) => {
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

              {/* Bonus aggiuntivi (value stacking CRO): box verdi con valore €.
                  Il cliente percepisce un omaggio extra che non riceverebbe
                  altrove. */}
              {bonus.length > 0 && (
                <>
                  <Text style={[styles.sectionTitle, { color: C.successText }]}>
                    In più, in regalo
                  </Text>
                  {bonus.map((b, i) => (
                    <View key={i} style={styles.bonusBox} wrap={false}>
                      <Text style={styles.bonusTitolo}>{b.titolo}</Text>
                      {b.valore_eur && b.valore_eur > 0 && (
                        <Text style={styles.bonusValore}>
                          valore € {b.valore_eur}
                        </Text>
                      )}
                    </View>
                  ))}
                  {(() => {
                    const valoreTotale = bonus.reduce((acc, b) => acc + (Number(b.valore_eur) || 0), 0);
                    if (valoreTotale <= 0) return null;
                    return (
                      <Text style={{ fontSize: 9, color: C.successText, fontWeight: 700, marginTop: 4, textAlign: "right" as const }}>
                        Valore omaggi totale: € {valoreTotale}
                      </Text>
                    );
                  })()}
                </>
              )}

              <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
            </Page>
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
                    {percorso.titolo === SR_PERCORSO_DEFAULT.titolo
                      ? `passaggi curati nei minimi dettagli`
                      : percorso.titolo}
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

                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
              </Page>
            )}
            </>
          ),
          render: (
            <>
            {/* ─── PAGINA RENDER AI in LANDSCAPE (orizzontale) per dare massimo
                  risalto al PRIMA/DOPO.
                  Logica:
                  - "Prima" = foto reale dello stato attuale (media.kind = situazione)
                  - "Dopo"  = render AI generato (media.kind = render)
                  Si mostra solo se almeno uno dei due è presente. */}
            {(primaUrls.length > 0 || renderUrls.length > 0) && (
              <Page size="A4" orientation="landscape" style={{
                ...styles.page,
                paddingTop: 30, paddingBottom: 48,
                paddingHorizontal: 50,
              }}>
                <View style={styles.header} fixed>
                  <View style={styles.headerLeft}>
                    {logoUrl ? (
                      <Image src={logoUrl} style={styles.headerLogo} />
                    ) : (
                      <View style={[styles.headerLogo, { backgroundColor: primaryColor, alignItems: "center", justifyContent: "center" }]}>
                        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>
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

                <Text style={styles.pageEyebrow}>Anteprima visiva · Render AI</Text>
                <Text style={[styles.pageTitle, { fontSize: 22, marginBottom: 2 }]}>
                  Prima &amp; Dopo
                </Text>
                <Text style={[styles.pageSubtitle, { marginBottom: 10, fontSize: 10 }]}>
                  Visualizza il confronto tra come appare oggi e come sarà dopo l'intervento.
                </Text>

                {/* Layout landscape: usable height ~470pt dopo header+title+disclaimer.
                    CRITICO: label + immagini in singolo View con wrap={false} così
                    react-pdf NON le separa su pagine diverse (bug visto nei PDF prima). */}
                {hasPrimaDopo ? (
                  <View wrap={false}>
                    <View style={{ flexDirection: "row", marginBottom: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.renderPairLabel, { fontSize: 11, color: C.gray700 }]}>
                          Prima · foto attuale
                        </Text>
                      </View>
                      <View style={{ width: 14 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.renderPairLabel, { fontSize: 11, color: primaryColor }]}>
                          Dopo · render AI
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row" }}>
                      <View style={{
                        flex: 1, height: 360,
                        borderRadius: 10, overflow: "hidden",
                        backgroundColor: C.gray100,
                        borderWidth: 0.5, borderColor: C.gray200, borderStyle: "solid",
                      }}>
                        <Image src={primaUrls[0]} style={styles.renderImg} />
                      </View>
                      <View style={{ width: 14 }} />
                      <View style={{
                        flex: 1, height: 360,
                        borderRadius: 10, overflow: "hidden",
                        backgroundColor: C.gray100,
                        borderWidth: 0.5, borderColor: primaryColor, borderStyle: "solid",
                      }}>
                        <Image src={renderUrls[0]} style={styles.renderImg} />
                      </View>
                    </View>
                  </View>
                ) : renderUrls.length >= 2 ? (
                  // Fallback: nessuna foto situazione ma almeno 2 render → mostra due render
                  <View wrap={false}>
                    <View style={{ flexDirection: "row", marginBottom: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.renderPairLabel, { fontSize: 11 }]}>Render AI · vista 1</Text>
                      </View>
                      <View style={{ width: 14 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.renderPairLabel, { fontSize: 11 }]}>Render AI · vista 2</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row" }}>
                      <View style={{
                        flex: 1, height: 360,
                        borderRadius: 10, overflow: "hidden",
                        backgroundColor: C.gray100,
                      }}>
                        <Image src={renderUrls[0]} style={styles.renderImg} />
                      </View>
                      <View style={{ width: 14 }} />
                      <View style={{
                        flex: 1, height: 360,
                        borderRadius: 10, overflow: "hidden",
                        backgroundColor: C.gray100,
                      }}>
                        <Image src={renderUrls[1]} style={styles.renderImg} />
                      </View>
                    </View>
                  </View>
                ) : (
                  // Una sola immagine disponibile (render o situazione) — full width hero
                  <View wrap={false}>
                    <Text style={[styles.renderPairLabel, {
                      fontSize: 11,
                      marginBottom: 6,
                      color: renderUrls.length > 0 ? primaryColor : C.gray700,
                    }]}>
                      {renderUrls.length > 0 ? "Dopo · render AI" : "Foto attuale"}
                    </Text>
                    <View style={{
                      width: "100%", height: 380,
                      borderRadius: 10, overflow: "hidden", backgroundColor: C.gray100,
                      borderWidth: 0.5,
                      borderColor: renderUrls.length > 0 ? primaryColor : C.gray200,
                      borderStyle: "solid",
                    }}>
                      <Image
                        src={renderUrls[0] ?? primaUrls[0]}
                        style={styles.renderImg}
                       
                      />
                    </View>
                  </View>
                )}

                {/* Disclaimer legale OBBLIGATORIO sotto i render AI */}
                <View style={[styles.renderDisclaimerBox, { marginTop: 14 }]} wrap={false}>
                  <Text style={styles.renderDisclaimerLabel}>Disclaimer render AI</Text>
                  <Text style={styles.renderDisclaimerText}>{renderDisclaimer}</Text>
                </View>

                <View style={[styles.footer, { left: 50, right: 50 }]} fixed>
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
                Tutto quello che serve per trasformare il preventivo in cantiere.
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
                        <Text style={styles.testimonialAuthor}>
                          — {t.autore}{sub ? ` · ${sub}` : ""}
                        </Text>
                      </View>
                    );
                  })}
                </>
              )}

              {/* Brand legitimacy footer in CTA: dati legali in piccolo,
                  segnala professionalità + protezione legale. */}
              {brandFooterTesto && !condizioniLegaliTesto && (
                <Text style={styles.brandFooter}>{brandFooterTesto}</Text>
              )}

              <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
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
                <Text style={styles.pageTitle}>Zero rischi.{"\n"}Solo certezze.</Text>
                <Text style={styles.pageSubtitle}>
                  Ti diamo per iscritto le 5 garanzie più importanti del nostro lavoro.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                  {garanzie.slice(0, 6).map((g, i) => (
                    <View key={i} style={styles.garanziaCard} wrap={false}>
                      <View style={styles.garanziaIcon}>
                        <GaranziaIconSvg kind={g.icona} color="#FFFFFF" />
                      </View>
                      <Text style={styles.garanziaTitolo}>{g.titolo}</Text>
                      <Text style={styles.garanziaDesc}>{g.descrizione}</Text>
                    </View>
                  ))}
                </View>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
              </Page>
            )}
            </>
          ),
          // ─── PAGINA CONFRONTO PRIMA/DOPO NUMERICO ──────────────────────
          confronto: (
            <>
            {confrontoRighe.length > 0 && (
              <Page size="A4" style={styles.page}>
                <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} styles={styles} />
                <Text style={styles.pageEyebrow}>Confronto tecnico · Prima &amp; Dopo</Text>
                <Text style={styles.pageTitle}>{confrontoTitolo}</Text>
                <Text style={styles.pageSubtitle}>
                  Numeri reali a confronto: i tuoi serramenti attuali vs quelli che installeremo.
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
                    <Text style={[styles.tableHeaderText, { color: C.primary }]}>Nuovo</Text>
                  </View>
                  <View style={{ flex: 0.7, alignItems: "flex-end" }}>
                    <Text style={[styles.tableHeaderText, { color: C.successText }]}>Δ</Text>
                  </View>
                </View>
                {confrontoRighe.map((r, i) => (
                  <View key={i} style={styles.confrontoRow} wrap={false}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.confrontoCell}>{r.parametro}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={[styles.confrontoCell, { color: C.gray500 }]}>{r.prima}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={styles.confrontoCellStrong}>{r.dopo}</Text>
                    </View>
                    <View style={{ flex: 0.7, alignItems: "flex-end" }}>
                      {r.delta && <Text style={styles.confrontoCellDelta}>{r.delta}</Text>}
                    </View>
                  </View>
                ))}
                <Text style={{ fontSize: 8.5, color: C.gray500, marginTop: 14, fontStyle: "italic" }}>
                  Valori stimati confronto serramenti vecchi (anni 80-90 in PVC singolo vetro) vs nuovi standard moderni.
                  Bolletta gas: stima media nazionale Italia per appartamento 90 m² zona climatica E.
                </Text>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
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
                <Text style={styles.pageTitle}>Sai già{"\n"}cosa chiederci.</Text>
                <Text style={styles.pageSubtitle}>
                  Le risposte ai dubbi più comuni che ci fanno i nostri clienti.
                </Text>
                <View style={{ marginTop: 14 }}>
                  {faqItems.slice(0, 8).map((f, i) => (
                    <View key={i} style={styles.faqItem} wrap={false}>
                      <Text style={styles.faqDomanda}>{i + 1}. {f.domanda}</Text>
                      <Text style={styles.faqRisposta}>{f.risposta}</Text>
                    </View>
                  ))}
                </View>
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
              </Page>
            )}
            </>
          ),
          // ─── PAGINA CONDIZIONI LEGALI ──────────────────────────────────
          condizioni: (
            <>
            {condizioniLegaliTesto && (
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
                {brandFooterTesto && (
                  <Text style={styles.brandFooter}>{brandFooterTesto}</Text>
                )}
                <PageFooter companyName={companyName} indirizzo={indirizzo} telefono={telefono} email={email} vat={vat} website={website} styles={styles} />
              </Page>
            )}
            </>
          ),
        };
        return pdfPagesOrder
          .filter((pg) => pg.visible)
          .map((pg) => <React.Fragment key={pg.id}>{pageEls[pg.id]}</React.Fragment>);
      })()}

      {/* Render aggiuntivi (3°, 4°...) in pagine landscape successive se presenti */}
      {renderUrls.length >= 3 && renderUrls.slice(2, 6).reduce((acc: string[][], url, i) => {
        const idx = Math.floor(i / 2);
        if (!acc[idx]) acc[idx] = [];
        acc[idx].push(url);
        return acc;
      }, []).map((coppia, ci) => (
        <Page key={`render-extra-${ci}`} size="A4" orientation="landscape" style={{
          ...styles.page,
          paddingTop: 30, paddingBottom: 48,
          paddingHorizontal: 50,
        }}>
          <View style={styles.header} fixed>
            <View style={styles.headerLeft}>
              {logoUrl ? <Image src={logoUrl} style={styles.headerLogo} /> : null}
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
          <Text style={styles.pageEyebrow}>Render AI · vista aggiuntiva</Text>
          <Text style={[styles.pageTitle, { fontSize: 22, marginBottom: 10 }]}>
            Altre prospettive
          </Text>
          <View style={{ flexDirection: "row" }} wrap={false}>
            {coppia.map((url, i) => (
              <View key={i} style={{
                flex: 1, height: 380,
                borderRadius: 10, overflow: "hidden",
                backgroundColor: C.gray100,
                marginRight: i < coppia.length - 1 ? 14 : 0,
              }}>
                <Image src={url} style={styles.renderImg} />
              </View>
            ))}
          </View>
          <View style={[styles.renderDisclaimerBox, { marginTop: 14 }]} wrap={false}>
            <Text style={styles.renderDisclaimerLabel}>Disclaimer render AI</Text>
            <Text style={styles.renderDisclaimerText}>{renderDisclaimer}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
