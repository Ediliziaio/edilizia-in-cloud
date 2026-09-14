/**
 * ElettricoPDF — documento PDF nativo A4 del preventivo Elettrico
 * (Task 21), generato lato client con @react-pdf/renderer.
 *
 * Struttura pagine (modellata su SerramentoPDF, scala verticale Elettrico):
 *   1. Cover — hero brandizzato (immagine + overlay), logo, titolo/sottotitolo,
 *              card cliente/cantiere, totale in evidenza.
 *   2. Presentazione impresa — "Chi siamo", esigenze, soluzione, USP, testimonianze.
 *   3. Foto e render — griglia con didascalie (prova visiva, PRIMA del prezzo).
 *   4+. Computo per capitoli — tabella (descrizione, UdM, qty, prezzo, importo) con
 *              subtotale per capitolo; margini per voce/capitolo SOLO se show_margine.
 *   N. Riepilogo economico — imponibile, sconto, IVA, totale, detrazione, margine.
 *   N. Cronoprogramma — fasi con durata (se show_cronoprogramma).
 *   N. Condizioni e contatti — pagamenti, validità, recapiti azienda.
 *
 * Colori: derivati dal template (`color_primary/secondary/accent/text`), con
 * normalizzazione hex + tinte. Font: Helvetica built-in (zero rete, zero
 * failure — stesso default sicuro di SerramentoPDF).
 *
 * Footer LEGALE: "Domus Group S.r.l." (solo footer). Brand pagine =
 * EdiliziaInCloud / nome azienda. NESSUN claim su server UE/Italia/Europa.
 */
import * as React from "react";
import { ChiusuraVendita } from "@/components/preventivi/ChiusuraVenditaPdf";
import { testoSopra } from "@/lib/pdf/contrastoColori";
import { testoValiditaCondizioni } from "@/lib/preventivi/validitaOfferta";
import {
  Document, Page, Text, View, StyleSheet, Image, Svg, Rect, Defs,
  LinearGradient, RadialGradient, Stop, Path, Circle, G, Font,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/formatters";
import type { ElePdfEnriched, ElePdfCapitolo, ElePdfTotali } from "@/hooks/useElettricoPDF";
import type { EleProgetto, EleTemplatePdf } from "@/types/elettrico";
import { htmlToRichBlocks, type EleRichRun } from "@/lib/elettrico/richTextPdf";
import { renderTemplateText, buildStandardReplacements } from "@/lib/pdf/renderTemplateText";
import { parseFinanziamentoPromo, calcolaRataMensile } from "@/lib/preventivi/finanziamentoLite";

// ─── Rich text → @react-pdf ──────────────────────────────────────────────────
// Impagina l'HTML prodotto dall'editor WYSIWYG (o il testo semplice "legacy") in
// paragrafi + elenchi puntati, con grassetto/corsivo inline. Logica pura e testata
// in `richTextPdf.ts`; qui solo il rendering in primitive @react-pdf.
function richRunStyle(r: EleRichRun): Record<string, unknown> {
  return { ...(r.bold ? { fontWeight: 700 } : {}), ...(r.italic ? { fontStyle: "italic" } : {}) };
}
function RichText({ html, style }: { html: string | null | undefined; style?: Record<string, unknown> }) {
  const blocks = htmlToRichBlocks(html);
  if (!blocks.length) return null;
  return (
    <View>
      {blocks.map((b, i) =>
        b.type === "bullet" ? (
          <View key={i} style={{ flexDirection: "row", marginBottom: 2, paddingRight: 4 }}>
            <Text style={[style ?? {}, { width: 11 }]}>•</Text>
            <Text style={[style ?? {}, { flex: 1 }]}>
              {b.runs.map((r, j) => (
                <Text key={j} style={richRunStyle(r)}>{r.text}</Text>
              ))}
            </Text>
          </View>
        ) : (
          <Text key={i} style={[style ?? {}, { marginBottom: 3 }]}>
            {b.runs.map((r, j) => (
              <Text key={j} style={richRunStyle(r)}>{r.text}</Text>
            ))}
          </Text>
        ),
      )}
    </View>
  );
}

// Helvetica built-in: nessuna registrazione di rete (no CORS/network failure).
const FF = "Helvetica";
// Disabilita hyphenation: spezzava parole italiane in modo brutto.
Font.registerHyphenationCallback((word) => [word]);

const DOMUS_LEGAL = "Domus Group S.r.l.";

// ─── Palette dinamica dai colori template ────────────────────────────────────
function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  const m3 = raw.match(/^#?([0-9a-fA-F]{3})$/);
  if (m3) {
    const [r, g, b] = m3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const m6 = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (m6) return `#${m6[1]}`.toUpperCase();
  return fallback;
}

// Variante che ritorna null se il valore non è un hex valido (per i campi cover
// opzionali tipo pdf_cover_bg_color: null ⇒ usa il default coverBg della palette).
function normalizeHexColorOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const m3 = raw.match(/^#?([0-9a-fA-F]{3})$/);
  if (m3) {
    const [r, g, b] = m3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const m6 = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (m6) return `#${m6[1]}`.toUpperCase();
  return null;
}

function hexToTint(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const mix = (ch: number) => Math.round(ch + (255 - ch) * alpha);
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function makePalette(t: EleTemplatePdf) {
  const primary = normalizeHexColor(t.color_primary, "#1E3A5F");
  const secondary = normalizeHexColor(t.color_secondary, "#F97316");
  const accent = normalizeHexColor(t.color_accent, "#16A34A");
  const text = normalizeHexColor(t.color_text, "#212529");
  return {
    primary,
    secondary,
    accent,
    text,
    primaryLight: hexToTint(primary, 0.9),
    primaryBorder: hexToTint(primary, 0.6),
    secondaryLight: hexToTint(secondary, 0.88),
    white: "#FFFFFF",
    // Testo sopra i riquadri pieni del colore aziendale: bianco se si legge,
    // scuro sui colori chiari (lime, giallo). Come nel PDF dei serramenti.
    suPrimario: testoSopra(primary),
    suSecondario: testoSopra(secondary),
    coverBg: "#0F1B2A",
    gray50: "#F8FAFC",
    gray100: "#F1F5F9",
    gray200: "#E2E8F0",
    gray300: "#CBD5E1",
    gray500: "#64748B",
    gray700: "#334155",
    gray900: "#0F172A",
  };
}

type Palette = ReturnType<typeof makePalette>;

// ─── Stili (factory con colori dinamici) ─────────────────────────────────────
function makeStyles(C: Palette) {
  return StyleSheet.create({
    page: {
      fontFamily: FF,
      fontSize: 9.5,
      color: C.text,
      paddingTop: 38,
      paddingBottom: 92,
      paddingHorizontal: 42,
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
    },
    // Header pagine interne
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
      paddingBottom: 8,
      borderBottom: `1.5pt solid ${C.primary}`,
    },
    headerLogo: { maxWidth: 130, height: 30, objectFit: "contain" as const },
    headerName: { fontSize: 12, fontWeight: 700, color: C.primary },
    headerRight: { fontSize: 8, color: C.gray500, textAlign: "right" as const },
    headerCode: { fontWeight: 700, color: C.gray900, fontSize: 9 },
    // Footer (legale Domus)
    footer: {
      position: "absolute",
      bottom: 24,
      left: 42,
      right: 42,
      paddingTop: 7,
      borderTop: `0.5pt solid ${C.gray200}`,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7.5,
      color: C.gray500,
      marginBottom: 1,
    },
    footerName: { fontWeight: 700, color: C.gray700 },
    // Sezioni
    sectionTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: C.primary,
      marginBottom: 8,
      marginTop: 4,
    },
    sectionSub: { fontSize: 8.5, color: C.gray500, marginBottom: 10 },
    // Cover
    coverDecoSvg: {
      position: "absolute",
      top: 50,
      right: 50,
      width: 180,
      height: 180,
      opacity: 0.8,
    },
    coverLogo: { maxWidth: 180, height: 52, objectFit: "contain" as const },
    coverLogoCircle: {
      width: 52, height: 52, borderRadius: 12,
      backgroundColor: C.secondary,
      alignItems: "center", justifyContent: "center",
    },
    coverEyebrow: {
      fontSize: 10,
      color: C.white,
      fontWeight: 700,
      letterSpacing: 1.4,
      textTransform: "uppercase" as const,
      marginBottom: 12,
    },
    coverTitle: { fontSize: 30, fontWeight: 700, color: C.white, lineHeight: 1.12 },
    coverSubtitle: { fontSize: 13, color: hexToTint(C.secondary, 0.2), marginTop: 8 },
    coverCard: {
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 10,
      padding: 14,
      borderLeft: `3pt solid ${C.secondary}`,
    },
    coverCardLabel: { fontSize: 7.5, color: C.gray300, textTransform: "uppercase" as const, letterSpacing: 0.5 },
    coverCardValue: { fontSize: 11, color: C.white, fontWeight: 700, marginTop: 2 },
    coverTotalBox: {
      marginTop: 16,
      backgroundColor: C.secondary,
      borderRadius: 10,
      padding: 14,
    },
    coverTotalLabel: { fontSize: 8, color: C.suSecondario, textTransform: "uppercase" as const, letterSpacing: 0.5 },
    coverTotalValue: { fontSize: 24, fontWeight: 700, color: C.suSecondario, marginTop: 2 },
    // Bullet list (esigenze/soluzione/usp)
    bullet: { flexDirection: "row", marginBottom: 7 },
    bulletDot: {
      width: 14, height: 14, borderRadius: 7,
      backgroundColor: C.primaryLight,
      alignItems: "center", justifyContent: "center",
      marginRight: 8, marginTop: 1,
    },
    bulletDotText: { fontSize: 8, fontWeight: 700, color: C.primary },
    bulletTitle: { fontSize: 9.5, fontWeight: 700, color: C.gray900 },
    bulletDesc: { fontSize: 8.5, color: C.gray700, marginTop: 1, lineHeight: 1.35 },
    // Testimonianze
    testimonial: {
      backgroundColor: C.gray50,
      borderRadius: 8,
      padding: 10,
      marginBottom: 8,
      borderLeft: `2.5pt solid ${C.accent}`,
    },
    testimonialText: { fontSize: 9, color: C.gray700, fontStyle: "italic" as const, lineHeight: 1.4 },
    testimonialAuthor: { fontSize: 8.5, fontWeight: 700, color: C.gray900, marginTop: 5 },
    testimonialRole: { fontSize: 7.5, color: C.gray500 },
    // Computo table
    capHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: C.primary,
      borderRadius: 5,
      paddingVertical: 5,
      paddingHorizontal: 8,
      marginTop: 10,
      marginBottom: 0,
    },
    capHeaderTitle: { fontSize: 10, fontWeight: 700, color: C.suPrimario },
    capHeaderSub: { fontSize: 8.5, fontWeight: 700, color: C.suPrimario },
    tableHead: {
      flexDirection: "row",
      backgroundColor: C.gray100,
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderBottom: `0.5pt solid ${C.gray300}`,
    },
    tableHeadCell: { fontSize: 7.5, fontWeight: 700, color: C.gray700, textTransform: "uppercase" as const },
    row: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderBottom: `0.5pt solid ${C.gray200}`,
    },
    cell: { fontSize: 8.5, color: C.gray900 },
    cellFonte: { fontSize: 7, color: C.gray500, fontStyle: "italic" as const, marginTop: 1 },
    cellNum: { fontSize: 8.5, color: C.gray900, textAlign: "right" as const },
    cellMargin: { fontSize: 7.5, color: C.accent, textAlign: "right" as const },
    capSubtotal: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingVertical: 4,
      paddingHorizontal: 6,
      backgroundColor: C.primaryLight,
    },
    capSubtotalText: { fontSize: 9, fontWeight: 700, color: C.primary },
    // Riepilogo economico
    totalsBox: {
      marginTop: 6,
      borderRadius: 8,
      border: `1pt solid ${C.gray200}`,
      overflow: "hidden",
    },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderBottom: `0.5pt solid ${C.gray100}`,
    },
    totalsLabel: { fontSize: 9.5, color: C.gray700 },
    totalsValue: { fontSize: 9.5, fontWeight: 700, color: C.gray900 },
    totalsGrand: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 9,
      paddingHorizontal: 12,
      backgroundColor: C.primary,
    },
    totalsGrandLabel: { fontSize: 11, fontWeight: 700, color: C.suPrimario },
    totalsGrandValue: { fontSize: 14, fontWeight: 700, color: C.suPrimario },
    detrazioneNote: {
      marginTop: 8,
      backgroundColor: hexToTint(C.accent, 0.85),
      borderRadius: 8,
      padding: 10,
    },
    detrazioneText: { fontSize: 8.5, color: C.gray700, lineHeight: 1.35 },
    marginBox: {
      marginTop: 10,
      backgroundColor: C.gray50,
      borderRadius: 8,
      padding: 10,
      border: `0.5pt dashed ${C.gray300}`,
    },
    marginBoxTitle: { fontSize: 8.5, color: C.gray700, fontWeight: 700 },
    marginBoxText: { fontSize: 8.5, color: C.gray700, marginTop: 3 },
    totalsValueNeg: { fontSize: 9.5, fontWeight: 700, color: C.secondary },
    // Foto griglia
    photoGrid: { flexDirection: "row", flexWrap: "wrap" as const, marginHorizontal: -4 },
    photoItem: { width: "50%", padding: 4 },
    photoImg: {
      width: "100%",
      height: 150,
      objectFit: "cover" as const,
      borderRadius: 6,
      border: `0.5pt solid ${C.gray200}`,
    },
    photoCaption: { fontSize: 8, color: C.gray500, marginTop: 3 },
    // Cronoprogramma
    cronoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    cronoStep: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: C.primary,
      alignItems: "center", justifyContent: "center",
      marginRight: 10,
    },
    cronoStepText: { fontSize: 9, fontWeight: 700, color: C.suPrimario },
    cronoFase: { fontSize: 10, fontWeight: 700, color: C.gray900 },
    cronoDurata: { fontSize: 8, color: C.secondary, fontWeight: 700 },
    cronoDesc: { fontSize: 8.5, color: C.gray700, marginTop: 1, lineHeight: 1.35 },
    // Condizioni
    condBlock: { marginBottom: 12 },
    condTitle: { fontSize: 10, fontWeight: 700, color: C.primary, marginBottom: 4 },
    condText: { fontSize: 9, color: C.gray700, lineHeight: 1.45 },
    contactsBox: {
      marginTop: 8,
      backgroundColor: C.gray50,
      borderRadius: 8,
      padding: 12,
    },
    contactRow: { flexDirection: "row", marginBottom: 3 },
    contactLabel: { fontSize: 8, color: C.gray500, width: 70 },
    contactValue: { fontSize: 9, color: C.gray900, fontWeight: 700 },
  });
}

type Styles = ReturnType<typeof makeStyles>;

// ─── SVG: Decoro cover (5 varianti, parità Serramenti) ─────────────────────────
// Renderizza una decorazione 180×180pt in alto a destra della cover. La variant
// 'square' è il default (finestra/quadro stilizzato a 4 settori); le altre sono
// accenti minimal per cover moderne. Usa il colore del TESTO cover (armonizza
// sempre col fondo, coerente con l'anteprima del template editor).
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
    return (
      <Svg {...svgProps}>
        <Circle cx={90} cy={90} r={80} stroke={color} strokeWidth={3} fill="none" opacity={0.7} />
        <Circle cx={90} cy={90} r={56} stroke={color} strokeWidth={1.5} fill="none" opacity={0.4} />
        <Circle cx={90} cy={90} r={32} stroke={color} strokeWidth={1} fill="none" opacity={0.25} />
      </Svg>
    );
  }

  if (variant === "line") {
    return (
      <Svg {...svgProps}>
        <Path d="M 90 10 L 90 170" stroke={color} strokeWidth={2.5} opacity={0.7} />
        <Path d="M 70 40 L 110 40" stroke={color} strokeWidth={1.5} opacity={0.5} />
        <Path d="M 70 140 L 110 140" stroke={color} strokeWidth={1.5} opacity={0.5} />
      </Svg>
    );
  }

  if (variant === "pattern") {
    const dots = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        dots.push(
          <Circle key={`${r}-${c}`} cx={30 + c * 30} cy={30 + r * 30} r={3} fill={color} opacity={0.45} />,
        );
      }
    }
    return <Svg {...svgProps}><G>{dots}</G></Svg>;
  }

  // variant === "square" (default — quadro/finestra stilizzata a 4 settori)
  return (
    <Svg {...svgProps}>
      <G opacity={0.7}>
        <Rect x={20} y={20} width={140} height={140} rx={6} stroke={color} strokeWidth={3} fill="none" />
        <Path d={`M 90 25 L 90 155`} stroke={color} strokeWidth={2} />
        <Path d={`M 25 90 L 155 90`} stroke={color} strokeWidth={2} />
        <Circle cx={84} cy={90} r={3} fill={color} />
        <Path d={`M 35 35 L 55 35 L 35 55 Z`} fill={color} opacity={0.25} />
        <Path d={`M 95 95 L 115 95 L 95 115 Z`} fill={color} opacity={0.25} />
      </G>
      <G opacity={0.3}>
        <Path d="M 0 90 L 18 90" stroke={color} strokeWidth={1.5} />
        <Path d="M 162 90 L 180 90" stroke={color} strokeWidth={1.5} />
        <Path d="M 90 0 L 90 18" stroke={color} strokeWidth={1.5} />
        <Path d="M 90 162 L 90 180" stroke={color} strokeWidth={1.5} />
      </G>
    </Svg>
  );
}

// ─── Helpers di formato ──────────────────────────────────────────────────────
const clienteNomeOf = (p: EleProgetto) =>
  [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ").trim() || "Gentile Cliente";

const cantiereOf = (p: EleProgetto) =>
  [p.cantiere_indirizzo, [p.cantiere_cap, p.cantiere_citta].filter(Boolean).join(" "), p.cantiere_provincia]
    .filter(Boolean).join(", ").trim();

const dateStr = () => new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Footer (legale Domus Group) ─────────────────────────────────────────────
// Anagrafica: preferisce i dati del template (builder) e ripiega su `company.*`.
// Toggle: `showVersion` gating la riga "Preventivo … · pagina" e `showLegal` la
// riga estesa con indirizzo/P.IVA (B2B). Tutti i campi sono nullable/difensivi.
function PageFooter({ styles, company, code, footerText, anagrafica, showVersion, showLegal }: {
  styles: Styles;
  company: ElePdfEnriched["company"];
  code: string | null;
  footerText: string | null;
  anagrafica: { name: string; indirizzo: string | null; telefono: string | null; email: string | null; partitaIva: string | null };
  showVersion: boolean;
  showLegal: boolean;
}) {
  const line1 = [anagrafica.indirizzo, anagrafica.telefono, anagrafica.email].filter(Boolean).join(" · ");
  const line2 = [anagrafica.partitaIva ? `P.IVA ${anagrafica.partitaIva}` : null, company?.website].filter(Boolean).join(" · ");
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerRow}>
        <Text style={styles.footerName}>{anagrafica.name || DOMUS_LEGAL}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
      {showLegal && Boolean(line1) && <View style={styles.footerRow}><Text>{line1}</Text><Text /></View>}
      {showLegal && Boolean(line2) && <View style={styles.footerRow}><Text>{line2}</Text><Text /></View>}
      {Boolean(footerText) && <View style={styles.footerRow}><Text>{footerText}</Text><Text /></View>}
      {showVersion && (
        <View style={styles.footerRow}>
          <Text>
            {`Preventivo ${code ?? ""} · ${dateStr()} · Documento emesso tramite EdiliziaInCloud · ${DOMUS_LEGAL}`}
          </Text>
          <Text />
        </View>
      )}
    </View>
  );
}

// ─── Header pagine interne ───────────────────────────────────────────────────
function PageHeader({ styles, companyName, logoUrl, code }: {
  styles: Styles; companyName: string; logoUrl: string | null; code: string | null;
}) {
  return (
    <View style={styles.header} fixed>
      {logoUrl ? (
        <Image src={logoUrl} style={styles.headerLogo} />
      ) : (
        <Text style={styles.headerName}>{companyName}</Text>
      )}
      <View>
        <Text style={styles.headerRight}>Preventivo elettrico</Text>
        {code ? <Text style={styles.headerCode}>{code}</Text> : null}
      </View>
    </View>
  );
}

// ─── Bullet list ─────────────────────────────────────────────────────────────
function BulletList({ styles, items }: {
  styles: Styles;
  items: Array<{ titolo: string; descrizione?: string | null }>;
}) {
  const valid = items.filter((i) => (i.titolo ?? "").trim());
  if (valid.length === 0) return null;
  return (
    <View>
      {valid.map((it, i) => (
        <View key={i} style={styles.bullet} wrap={false}>
          <View style={styles.bulletDot}><Text style={styles.bulletDotText}>{i + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bulletTitle}>{it.titolo}</Text>
            {it.descrizione ? <Text style={styles.bulletDesc}>{it.descrizione}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Tabella computo per capitolo ────────────────────────────────────────────
function CapitoloTable({ styles, cap, showMargine, mostraPrezzi, mostraQta, mostraSubtotali }: {
  styles: Styles; cap: ElePdfCapitolo; showMargine: boolean;
  mostraPrezzi: boolean; mostraQta: boolean; mostraSubtotali: boolean;
}) {
  return (
    <View>
      <View style={styles.capHeader} minPresenceAhead={40}>
        <Text style={styles.capHeaderTitle}>{cap.nome}</Text>
        <Text style={styles.capHeaderSub}>{formatCurrency(cap.subtotale)}</Text>
      </View>
      <View style={styles.tableHead}>
        <Text style={[styles.tableHeadCell, { flex: 1 }]}>Descrizione</Text>
        {mostraQta && <Text style={[styles.tableHeadCell, { width: 34, textAlign: "center" }]}>UdM</Text>}
        {mostraQta && <Text style={[styles.tableHeadCell, { width: 40, textAlign: "right" }]}>Q.tà</Text>}
        {mostraPrezzi && <Text style={[styles.tableHeadCell, { width: 58, textAlign: "right" }]}>Prezzo</Text>}
        <Text style={[styles.tableHeadCell, { width: 62, textAlign: "right" }]}>Importo</Text>
        {showMargine && <Text style={[styles.tableHeadCell, { width: 50, textAlign: "right" }]}>Margine</Text>}
      </View>
      {cap.voci.map((v) => {
        const margineEur = (Number(v.importo) || 0) -
          ((Number(v.costo_materiali) || 0) + (Number(v.costo_manodopera) || 0)) * (Number(v.quantita) || 0);
        return (
          <View key={v.id} style={styles.row} wrap={false}>
            <View style={{ flex: 1, paddingRight: 4 }}>
              <Text style={styles.cell}>{v.descrizione || "—"}</Text>
              {/* Citazione fonte (base d'asta) — discreta, solo se valorizzata. */}
              {v.fonte ? <Text style={styles.cellFonte}>Fonte: {v.fonte}</Text> : null}
            </View>
            {mostraQta && <Text style={[styles.cell, { width: 34, textAlign: "center" }]}>{v.unita_misura}</Text>}
            {mostraQta && <Text style={[styles.cellNum, { width: 40 }]}>{formatQty(v.quantita)}</Text>}
            {mostraPrezzi && <Text style={[styles.cellNum, { width: 58 }]}>{formatCurrency(v.prezzo_unitario)}</Text>}
            <Text style={[styles.cellNum, { width: 62, fontWeight: 700 }]}>{formatCurrency(v.importo)}</Text>
            {showMargine && <Text style={[styles.cellMargin, { width: 50 }]}>{formatCurrency(margineEur)}</Text>}
          </View>
        );
      })}
      {mostraSubtotali && (
        <View style={styles.capSubtotal}>
          <Text style={styles.capSubtotalText}>Subtotale {cap.nome}: {formatCurrency(cap.subtotale)}</Text>
        </View>
      )}
    </View>
  );
}

function formatQty(q: number): string {
  const n = Number(q) || 0;
  return Number.isInteger(n) ? String(n) : n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

// ─── Riepilogo economico ─────────────────────────────────────────────────────
function TotalsBlock({ styles, totali, detrazioneText, showMargine, promo, pc }: {
  styles: Styles; totali: ElePdfTotali; detrazioneText: string | null; showMargine: boolean;
  promo: ReturnType<typeof parseFinanziamentoPromo>;
  pc: { primary: string; secondary: string; border: string; text: string };
}) {
  return (
    <View>
      <View style={styles.totalsBox}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Imponibile lavori</Text>
          <Text style={styles.totalsValue}>{formatCurrency(totali.imponibileLordo)}</Text>
        </View>
        {totali.scontoPct > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Sconto {formatPct(totali.scontoPct)}</Text>
            <Text style={styles.totalsValueNeg}>- {formatCurrency(totali.scontoEur)}</Text>
          </View>
        )}
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Imponibile netto</Text>
          <Text style={styles.totalsValue}>{formatCurrency(totali.imponibile)}</Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>IVA {formatPct(totali.ivaPct)}</Text>
          <Text style={styles.totalsValue}>{formatCurrency(totali.iva)}</Text>
        </View>
        <View style={styles.totalsGrand}>
          <Text style={styles.totalsGrandLabel}>Totale IVA inclusa</Text>
          <Text style={styles.totalsGrandValue}>{formatCurrency(totali.totale)}</Text>
        </View>
      </View>

      {/* Finanziamento promo (template-driven): "da €X/mese" — leva di chiusura.
          Simulazione indicativa, non offerta vincolante (footnote). */}
      {promo && (() => {
        const rata = calcolaRataMensile(totali.totale, promo.rate, promo.tan_pct);
        if (rata <= 0) return null;
        return (
          <View style={{ marginTop: 8, borderWidth: 1, borderColor: pc.border, borderRadius: 6, padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 10.5, fontWeight: 700, color: pc.primary }}>Possibilità di finanziamento</Text>
              <Text style={{ fontSize: 7.5, color: pc.text, opacity: 0.7, marginTop: 2 }}>
                Simulazione indicativa in {promo.rate} rate mensili{promo.tan_pct > 0 ? ` (TAN ${promo.tan_pct}%)` : " a tasso zero"} — soggetta ad approvazione della finanziaria.
              </Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: 700, color: pc.secondary }}>da {formatCurrency(rata)}/mese</Text>
          </View>
        );
      })()}

      {totali.detrazionePct > 0 && (
        <View style={styles.detrazioneNote}>
          <Text style={styles.detrazioneText}>
            {detrazioneText
              || `Con la detrazione fiscale del ${formatPct(totali.detrazionePct)} potresti recuperare fino a ${formatCurrency(totali.detrazioneEur)} sull'imponibile, ripartiti come da normativa vigente. Importo indicativo: l'effettiva detraibilità dipende dai requisiti del tuo intervento e va verificata con il tuo consulente fiscale.`}
          </Text>
        </View>
      )}

      {showMargine && (
        <View style={styles.marginBox}>
          <Text style={styles.marginBoxTitle}>
            Marginalità (riservato — non visibile al cliente)
          </Text>
          <Text style={styles.marginBoxText}>
            Costo totale: {formatCurrency(totali.costoTot)} · Margine: {formatCurrency(totali.margineEur)} ({formatPct(totali.marginePct)})
          </Text>
        </View>
      )}
    </View>
  );
}

function formatPct(v: number): string {
  const n = Number(v) || 0;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

// ─── Documento ───────────────────────────────────────────────────────────────
export function ElettricoPDF(props: ElePdfEnriched) {
  const { progetto: p, template: t, company, capitoli, totali, media, computoOptions } = props;
  // Opzioni computo scelte nel preventivatore (default difensivi se assenti).
  const co = computoOptions ?? { livello: "dettagliato" as const, mostraPrezzi: true, mostraQta: true, mostraSubtotali: true };
  const computoLivello = co.livello ?? "dettagliato";
  const mostraPrezzi = co.mostraPrezzi !== false;
  const mostraQta = co.mostraQta !== false;
  const mostraSubtotali = co.mostraSubtotali !== false;
  const importoLordoComputo = capitoli.reduce((s, c) => s + (Number(c.subtotale) || 0), 0);
  const C = makePalette(t);
  // Promo finanziamento + colori per TotalsBlock: calcolati QUI perche'
  // generics/cast dentro gli attributi JSX rompono il parse esbuild.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finanziamentoPromo = (p as unknown as { mostra_finanziamento?: boolean | null }).mostra_finanziamento === false
    ? null
    : parseFinanziamentoPromo((t as any).finanziamento_promo);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalsPc = { primary: C.primary, secondary: C.secondary, border: (C as any).primaryBorder ?? C.primary, text: C.text };
  const styles = makeStyles(C);

  // Anagrafica risolta: template (builder) → company (profilo) → fallback.
  const companyName =
    (t.ragione_sociale ?? "").trim() || company?.ragione_sociale || company?.name || "EdiliziaInCloud";
  const anagrafica = {
    name: companyName,
    indirizzo: (t.indirizzo_completo ?? "").trim() || company?.indirizzo || null,
    telefono: (t.telefono ?? "").trim() || company?.telefono || null,
    email: (t.email ?? "").trim() || company?.email || null,
    partitaIva: (t.partita_iva ?? "").trim() || company?.partita_iva || null,
  };
  const showFooterVersion = t.show_footer_version !== false;
  const showFooterLegal = t.show_footer_legal === true;
  const logoUrl = t.logo_url ?? company?.logo_url ?? null;
  const coverLogoUrl = t.cover_logo_url ?? logoUrl;
  const cliente = clienteNomeOf(p);
  const cantiere = cantiereOf(p);
  // ─── Cover preset-aware (parità Serramenti) ───────────────────────────────
  // I campi pdf_cover_* (migration `ele_template_pdf`) NON sono nel tipo
  // `EleTemplatePdf`/tipi generati: li leggiamo via cast. Fallback ai vecchi
  // campi flat cover_* per retrocompatibilità (template salvati prima del porting).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tpl = (t ?? {}) as any;
  // Placeholder {cliente_nome} ecc. (PlaceholderChips): senza l'espansione
  // uscivano LETTERALI nel PDF del cliente. superficie_mq è il chip extra
  // offerto dall'editor Elettrico.
  const coverRepl = buildStandardReplacements(p, {
    superficie_mq: p.immobile_superficie_mq != null ? String(p.immobile_superficie_mq) : "—",
  });
  const coverTitle = renderTemplateText(
    (typeof tpl.pdf_cover_hero === "string" && tpl.pdf_cover_hero.trim()) ||
    (t.cover_title ?? "").trim() || "Preventivo di elettrico", coverRepl);
  const coverSubtitle = renderTemplateText(
    (typeof tpl.pdf_cover_subhero === "string" && tpl.pdf_cover_subhero.trim()) ||
    (t.cover_subtitle ?? "").trim() || "La tua casa, rinnovata chiavi in mano", coverRepl);
  const coverEyebrow = renderTemplateText(
    (typeof tpl.pdf_cover_eyebrow === "string" && tpl.pdf_cover_eyebrow.trim()) ||
    "LA TUA PROPOSTA PERSONALIZZATA", coverRepl);
  // Immagine sfondo: campo nuovo → legacy flat.
  const coverImageUrl: string | null = tpl.pdf_cover_image_url || t.cover_image_url || null;
  // Colore di sfondo cover (null = default palette C.coverBg).
  const coverBgColor = normalizeHexColorOrNull(tpl.pdf_cover_bg_color) ?? C.coverBg;
  // Opacità overlay: pdf_cover_overlay_opacity è 0..100; legacy flat è 0..1.
  const coverOverlayOpacity =
    typeof tpl.pdf_cover_overlay_opacity === "number"
      ? Math.max(0, Math.min(100, tpl.pdf_cover_overlay_opacity)) / 100
      : typeof t.cover_overlay_opacity === "number"
        ? Math.max(0, Math.min(1, t.cover_overlay_opacity))
        : 0.55;
  // Stile overlay (flat | gradient | gradient_diag | vignette).
  const coverOverlayStyle: "flat" | "gradient" | "gradient_diag" | "vignette" =
    (["flat", "gradient", "gradient_diag", "vignette"] as const).includes(tpl.pdf_cover_overlay_style)
      ? tpl.pdf_cover_overlay_style
      : "flat";
  // Posizione logo cover.
  const coverLogoPosition: "top_left" | "top_right" | "top_center" | "hidden" =
    (["top_left", "top_right", "top_center", "hidden"] as const).includes(tpl.pdf_cover_logo_position)
      ? tpl.pdf_cover_logo_position
      : (t.cover_logo_position ?? "top_left");
  // Allineamento verticale blocco testo (top | center | bottom).
  const coverTextVertical: "top" | "center" | "bottom" =
    (["top", "center", "bottom"] as const).includes(tpl.pdf_cover_text_vertical)
      ? tpl.pdf_cover_text_vertical
      : "bottom";
  // Variante decorazione (square | circle | line | pattern | none).
  const coverDecorationStyle: "square" | "circle" | "line" | "pattern" | "none" =
    (["square", "circle", "line", "pattern", "none"] as const).includes(tpl.pdf_cover_decoration_style)
      ? tpl.pdf_cover_decoration_style
      : "square";
  const coverEyebrowSize =
    typeof tpl.pdf_cover_eyebrow_size === "number"
      ? Math.max(8, Math.min(14, tpl.pdf_cover_eyebrow_size))
      : 10;
  const coverTitleSize =
    typeof tpl.pdf_cover_title_size === "number"
      ? Math.max(20, Math.min(64, tpl.pdf_cover_title_size))
      : (typeof t.cover_title_size === "number" ? t.cover_title_size : 30);
  const coverSubtitleSize =
    typeof tpl.pdf_cover_subtitle_size === "number"
      ? Math.max(9, Math.min(22, tpl.pdf_cover_subtitle_size))
      : 13;
  const coverTextColor =
    normalizeHexColorOrNull(tpl.pdf_cover_text_color) ??
    normalizeHexColorOrNull(t.cover_text_color) ?? "#FFFFFF";
  const coverShowDecoration = tpl.pdf_cover_show_decoration !== false;
  const coverShowClientCard = tpl.pdf_cover_show_client_card !== false;
  // Allineamento orizzontale: pdf_cover_text_align → legacy cover_text_align.
  const coverTextAlign: "left" | "center" =
    tpl.pdf_cover_text_align === "center" || t.cover_text_align === "center" ? "center" : "left";
  // Scala logo cover: % (60–160) → fattore moltiplicativo.
  const coverLogoScale =
    typeof tpl.pdf_cover_logo_size === "number"
      ? Math.max(60, Math.min(160, tpl.pdf_cover_logo_size)) / 100
      : 1;
  // Top del blocco testo in base alla posizione verticale (e se il logo è visibile).
  const coverContentTop = coverTextVertical === "top"
    ? (coverLogoPosition === "hidden" ? 96 : 150)
    : coverTextVertical === "center"
      ? 250
      : 300;
  const coverLogoJustify =
    coverLogoPosition === "top_right" ? "flex-end" :
    coverLogoPosition === "top_center" ? "center" : "flex-start";

  const esigenze = t.esigenze ?? [];
  const soluzione = t.soluzione ?? [];
  const usp = t.usp ?? [];
  const testimonianze = (t.testimonianze ?? []).filter((x) => (x.testo ?? "").trim());
  const galleryLavori = (t.gallery_lavori ?? []) as Array<{ id: string; url: string; didascalia?: string | null; luogo?: string | null }>;
  const crono = (t.cronoprogramma ?? []).filter((x) => (x.fase ?? "").trim());
  const percorso = (t.percorso ?? []).filter((x) => (x.titolo ?? "").trim());
  const garanzie = (t.garanzie ?? []).filter((x) => (x.titolo ?? "").trim());
  const faq = (t.faq ?? []).filter((x) => (x.domanda ?? "").trim());
  const showChiSiamo = t.show_chi_siamo !== false;
  const showCrono = t.show_cronoprogramma !== false && crono.length > 0;
  const showPercorso = t.show_percorso !== false && percorso.length > 0;
  const showGaranzie = t.show_garanzie !== false && (garanzie.length > 0 || faq.length > 0);
  const showMargine = t.show_margine === true;

  const hasPresentazione = (showChiSiamo && Boolean((t.chi_siamo ?? "").trim()))
    || esigenze.some((e) => (e.titolo ?? "").trim())
    || soluzione.some((s) => (s.titolo ?? "").trim())
    || usp.some((u) => (u.titolo ?? "").trim())
    || showPercorso
    || testimonianze.length > 0;

  const footer = (
    <PageFooter
      styles={styles}
      company={company}
      code={p.code}
      footerText={t.footer_text ?? null}
      anagrafica={anagrafica}
      showVersion={showFooterVersion}
      showLegal={showFooterLegal}
    />
  );
  const header = (
    <PageHeader styles={styles} companyName={companyName} logoUrl={logoUrl} code={p.code} />
  );

  return (
    <Document
      title={`Preventivo ${p.code ?? ""} - ${cliente}`}
      author={companyName}
      subject={`Preventivo elettrico per ${cliente}`}
    >
      {/* ─── PAGINA 1 — COVER ─────────────────────────────────────────────── */}
      {/* Bg color cover override (pdf_cover_bg_color) → altrimenti C.coverBg. */}
      <Page size="A4" style={[styles.cover, { backgroundColor: coverBgColor }]}>
        {coverImageUrl && (
          <Image
            src={coverImageUrl}
            style={{ position: "absolute", top: 0, left: 0, width: 595, height: 841, objectFit: "cover" }}
          />
        )}
        {/* Overlay sopra immagine. 4 stili (parità Serramenti):
            - flat: View nera piatta con opacity
            - gradient: SVG LinearGradient verticale
            - gradient_diag: SVG LinearGradient diagonale
            - vignette: SVG RadialGradient (centro chiaro, angoli scuri) */}
        {coverImageUrl && coverOverlayStyle === "flat" && (
          <View style={{ position: "absolute", top: 0, left: 0, width: 595, height: 841, backgroundColor: "#000000", opacity: coverOverlayOpacity }} />
        )}
        {coverImageUrl && coverOverlayStyle !== "flat" && (
          <View style={{ position: "absolute", top: 0, left: 0, width: 595, height: 841 }}>
            <Svg width={595} height={841} viewBox="0 0 595 841">
              <Defs>
                {coverOverlayStyle === "gradient" && (
                  <LinearGradient id="ele-cover-overlay" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.15} />
                    <Stop offset="0.55" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.55} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={coverOverlayOpacity} />
                  </LinearGradient>
                )}
                {coverOverlayStyle === "gradient_diag" && (
                  <LinearGradient id="ele-cover-overlay" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.2} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={coverOverlayOpacity} />
                  </LinearGradient>
                )}
                {coverOverlayStyle === "vignette" && (
                  <RadialGradient id="ele-cover-overlay" cx="0.5" cy="0.5" rx="0.7" ry="0.85" fx="0.5" fy="0.5">
                    <Stop offset="0" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.1} />
                    <Stop offset="0.7" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.5} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={coverOverlayOpacity * 0.95} />
                  </RadialGradient>
                )}
              </Defs>
              <Rect x={0} y={0} width={595} height={841} fill="url(#ele-cover-overlay)" />
            </Svg>
          </View>
        )}
        {/* Senza immagine: gradiente sottile sul colore di sfondo per dare
            profondità (alto chiaro → basso scuro). */}
        {!coverImageUrl && (
          <View style={{ position: "absolute", top: 0, left: 0, width: 595, height: 841 }}>
            <Svg width={595} height={841} viewBox="0 0 595 841">
              <Defs>
                <LinearGradient id="ele-cover-grad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={coverBgColor} stopOpacity={1} />
                  <Stop offset="0.72" stopColor={coverBgColor} stopOpacity={1} />
                  <Stop offset="1" stopColor="#000000" stopOpacity={0.32} />
                </LinearGradient>
                {/* Glow del secondario dietro il titolo: profondità senza foto. */}
                <RadialGradient id="ele-cover-grad-glow" cx="0.24" cy="0.74" r="0.55" fx="0.24" fy="0.74">
                  <Stop offset="0" stopColor={C.secondary} stopOpacity={0.22} />
                  <Stop offset="1" stopColor={C.secondary} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width={595} height={841} fill="url(#ele-cover-grad)" />
              <Rect x={0} y={0} width={595} height={841} fill="url(#ele-cover-grad-glow)" />
            </Svg>
          </View>
        )}

        {/* Decoro SVG in alto a destra (toggle template). Colore = TESTO cover. */}
        {coverShowDecoration && (
          <View style={styles.coverDecoSvg}>
            <CoverDecorationSvg color={coverTextColor} variant={coverDecorationStyle} />
          </View>
        )}

        {coverLogoPosition !== "hidden" && (
          <View style={{ position: "absolute", top: 48, left: 44, right: 44 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: coverLogoJustify }}>
              {coverLogoUrl ? (
                <Image src={coverLogoUrl} style={[styles.coverLogo, { maxWidth: 180 * coverLogoScale, height: 52 * coverLogoScale }]} />
              ) : (
                <View>
                  {/* Wordmark: il cerchio con la sola iniziale era anonimo come
                      prima impressione — meglio il nome azienda per esteso. */}
                  <Text style={{ color: coverTextColor, fontSize: 15, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
                    {companyName}
                  </Text>
                  <View style={{ marginTop: 4, width: 34, height: 3, backgroundColor: C.secondary, borderRadius: 2 }} />
                </View>
              )}
            </View>
          </View>
        )}

        {/* Blocco testo: posizione verticale (top/center/bottom) + allineamento
            orizzontale (left/center) configurabili. Card cliente opzionale. */}
        <View style={{
          position: "absolute",
          top: coverContentTop,
          left: 44,
          right: 44,
          alignItems: coverTextAlign === "center" ? "center" : "flex-start",
        }}>
          <Text style={[styles.coverEyebrow, { color: coverTextColor, fontSize: coverEyebrowSize, textAlign: coverTextAlign }]}>{coverEyebrow}</Text>
          <Text style={[styles.coverTitle, { color: coverTextColor, fontSize: coverTitleSize, textAlign: coverTextAlign }]}>{coverTitle}</Text>
          <Text style={[styles.coverSubtitle, { color: coverTextColor, fontSize: coverSubtitleSize, textAlign: coverTextAlign }]}>{coverSubtitle}</Text>
        </View>

        <View style={{ position: "absolute", bottom: 70, left: 44, right: 44 }}>
          {coverShowClientCard && (
            <View style={{ flexDirection: "row", marginHorizontal: -6 }}>
              <View style={{ flex: 1, paddingHorizontal: 6 }}>
                <View style={styles.coverCard}>
                  <Text style={styles.coverCardLabel}>Preparato per</Text>
                  <Text style={styles.coverCardValue}>{cliente}</Text>
                  {cantiere ? <Text style={[styles.coverCardLabel, { marginTop: 6 }]}>{cantiere}</Text> : null}
                </View>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 6 }}>
                <View style={styles.coverCard}>
                  <Text style={styles.coverCardLabel}>Riferimento</Text>
                  <Text style={styles.coverCardValue}>{p.code ?? "—"}</Text>
                  <Text style={[styles.coverCardLabel, { marginTop: 6 }]}>Data: {dateStr()}</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      </Page>

      {/* ─── PAGINA 2 — PRESENTAZIONE IMPRESA ─────────────────────────────── */}
      {hasPresentazione && (
        <Page size="A4" style={styles.page}>
          {header}
          {showChiSiamo && (t.chi_siamo ?? "").trim() ? (
            <View>
              <Text style={styles.sectionTitle}>Chi siamo</Text>
              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: t.chi_siamo_foto_url ? 1.6 : 1 }}>
                  <RichText html={t.chi_siamo} style={styles.condText} />
                </View>
                {t.chi_siamo_foto_url ? (
                  <View style={{ flex: 1, paddingLeft: 12 }}>
                    <Image
                      src={t.chi_siamo_foto_url}
                      style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 6 }}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {showPercorso && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>Come lavoriamo</Text>
              <BulletList styles={styles} items={percorso} />
            </View>
          )}

          {/* Esigenze ↔ Soluzione affiancate: sono una coppia concettuale e la
              colonna doppia spezza la monotonia della pagina di presentazione. */}
          {(esigenze.some((e) => (e.titolo ?? "").trim()) || soluzione.some((s) => (s.titolo ?? "").trim())) && (
            <View style={{ marginTop: 14, flexDirection: "row", gap: 16 }}>
              {esigenze.some((e) => (e.titolo ?? "").trim()) && (
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Le tue esigenze</Text>
                  <BulletList styles={styles} items={esigenze} />
                </View>
              )}
              {soluzione.some((s) => (s.titolo ?? "").trim()) && (
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>La nostra soluzione</Text>
                  <BulletList styles={styles} items={soluzione} />
                </View>
              )}
            </View>
          )}

          {usp.some((u) => (u.titolo ?? "").trim()) && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>Perché sceglierci</Text>
              <BulletList styles={styles} items={usp} />
            </View>
          )}

          {testimonianze.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>Cosa dicono i nostri clienti</Text>
              {testimonianze.map((tt, i) => (
                <View key={i} style={styles.testimonial} wrap={false}>
                  <Text style={styles.testimonialText}>“{tt.testo}”</Text>
                  <Text style={styles.testimonialAuthor}>{tt.autore || "Cliente"}</Text>
                  {tt.ruolo ? <Text style={styles.testimonialRole}>{tt.ruolo}</Text> : null}
                </View>
              ))}
            </View>
          )}
          {footer}
        </Page>
      )}

      {/* ─── GALLERY LAVORI ──────────────────────────────────────────────── */}
      {galleryLavori.length > 0 && (
        <Page size="A4" style={styles.page}>
          {header}
          <Text style={styles.sectionTitle}>I nostri lavori</Text>
          <Text style={styles.sectionSub}>Alcuni esempi di interventi realizzati dalla nostra azienda.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {galleryLavori.map((item, i) => (
              <View key={i} style={{ width: "47%", marginBottom: 8 }} wrap={false}>
                <Image src={item.url} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 4 }} />
                {item.didascalia ? <Text style={{ fontSize: 8, marginTop: 3, color: "#374151" }}>{item.didascalia}</Text> : null}
                {item.luogo ? <Text style={{ fontSize: 7, color: "#9CA3AF" }}>{item.luogo}</Text> : null}
              </View>
            ))}
          </View>
          {footer}
        </Page>
      )}

      {/* ─── FOTO E RENDER (prima del prezzo: la prova visiva precede il costo) ─ */}
      {media.length > 0 && (
        <Page size="A4" style={styles.page}>
          {header}
          <Text style={styles.sectionTitle}>Foto e render del progetto</Text>
          <Text style={styles.sectionSub}>Stato attuale, lavori simili e rendering dell'intervento.</Text>
          <View style={styles.photoGrid}>
            {media.map((m) => (
              <View key={m.id} style={styles.photoItem} wrap={false}>
                <Image src={m.url} style={styles.photoImg} />
                {m.caption ? <Text style={styles.photoCaption}>{m.caption}</Text> : null}
              </View>
            ))}
          </View>
          {footer}
        </Page>
      )}

      {/* ─── COMPUTO PER CAPITOLI + RIEPILOGO (dopo la prova visiva) ───── */}
      <Page size="A4" style={styles.page}>
        {header}
        <Text style={styles.sectionTitle}>Computo metrico estimativo</Text>
        <Text style={styles.sectionSub}>
          Dettaglio delle lavorazioni previste, suddivise per capitolo.
        </Text>
        {computoLivello === "corpo" ? (
          // A corpo: nessuna voce/capitolo, solo l'importo complessivo delle lavorazioni.
          <View style={styles.capHeader}>
            <Text style={styles.capHeaderTitle}>Lavorazioni a corpo</Text>
            <Text style={styles.capHeaderSub}>{formatCurrency(importoLordoComputo)}</Text>
          </View>
        ) : computoLivello === "sintetico" ? (
          // Sintetico: solo i capitoli con il loro totale, senza le singole voci.
          capitoli.map((cap) => (
            <View key={cap.nome} style={styles.capHeader}>
              <Text style={styles.capHeaderTitle}>{cap.nome}</Text>
              <Text style={styles.capHeaderSub}>{formatCurrency(cap.subtotale)}</Text>
            </View>
          ))
        ) : (
          // Dettagliato: tabella completa per capitolo (con toggle colonne/subtotali).
          capitoli.map((cap) => (
            <CapitoloTable
              key={cap.nome}
              styles={styles}
              cap={cap}
              showMargine={showMargine}
              mostraPrezzi={mostraPrezzi}
              mostraQta={mostraQta}
              mostraSubtotali={mostraSubtotali}
            />
          ))
        )}

        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={styles.sectionTitle}>Riepilogo economico</Text>
          <TotalsBlock
            promo={finanziamentoPromo}
            pc={totalsPc}
            styles={styles}
            totali={totali}
            detrazioneText={null}
            showMargine={showMargine}
          />
        </View>
        {footer}
      </Page>

      {/* ─── CRONOPROGRAMMA + CONDIZIONI + CONTATTI ───────────────────────── */}
      <Page size="A4" style={styles.page}>
        {header}
        {showCrono && (
          <View>
            <Text style={styles.sectionTitle}>Cronoprogramma dei lavori</Text>
            <Text style={styles.sectionSub}>Le fasi previste per il tuo cantiere.</Text>
            {crono.map((f, i) => (
              <View key={i} style={styles.cronoRow} wrap={false}>
                <View style={styles.cronoStep}><Text style={styles.cronoStepText}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.cronoFase}>{f.fase}</Text>
                    {f.durata ? <Text style={styles.cronoDurata}>{f.durata}</Text> : null}
                  </View>
                  {f.descrizione ? <Text style={styles.cronoDesc}>{f.descrizione}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: showCrono ? 16 : 0 }}>
          <Text style={styles.sectionTitle}>Condizioni</Text>
          {(t.payment_terms_text ?? "").trim() ? (
            <View style={styles.condBlock}>
              <Text style={styles.condTitle}>Modalità di pagamento</Text>
              <RichText html={t.payment_terms_text} style={styles.condText} />
            </View>
          ) : null}
          <View style={styles.condBlock}>
            <Text style={styles.condTitle}>Validità dell'offerta</Text>
            <Text style={styles.condText}>
              {testoValiditaCondizioni(t.validity_text, t.default_validita_giorni)}
            </Text>
          </View>
        </View>

        {showGaranzie && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>Garanzie & FAQ</Text>
            {garanzie.length > 0 && (
              <View style={styles.condBlock}>
                <Text style={styles.condTitle}>Le nostre garanzie</Text>
                <BulletList styles={styles} items={garanzie} />
              </View>
            )}
            {faq.length > 0 && (
              <View style={styles.condBlock}>
                <Text style={styles.condTitle}>Domande frequenti</Text>
                {faq.map((q, i) => (
                  <View key={i} style={{ marginBottom: 7 }} wrap={false}>
                    <Text style={styles.bulletTitle}>{q.domanda}</Text>
                    {(q.risposta ?? "").trim()
                      ? <Text style={[styles.condText, { marginTop: 1 }]}>{q.risposta}</Text>
                      : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.contactsBox} wrap={false}>
          <Text style={styles.condTitle}>I tuoi contatti</Text>
          <View style={styles.contactRow}>
            <Text style={styles.contactLabel}>Azienda</Text>
            <Text style={styles.contactValue}>{companyName}</Text>
          </View>
          {anagrafica.telefono ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>Telefono</Text>
              <Text style={styles.contactValue}>{anagrafica.telefono}</Text>
            </View>
          ) : null}
          {anagrafica.email ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>{anagrafica.email}</Text>
            </View>
          ) : null}
          {anagrafica.indirizzo ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>Sede</Text>
              <Text style={styles.contactValue}>{anagrafica.indirizzo}</Text>
            </View>
          ) : null}
        </View>
        {/* Le garanzie dell'azienda sono già in «Garanzie & FAQ» qui sopra: la chiusura non le ripete. */}
        <ChiusuraVendita
          c={C}
          companyName={companyName}
          validityText={t.validity_text}
          validitaGiorni={t.default_validita_giorni}
        />
        {footer}
      </Page>
    </Document>
  );
}

export default ElettricoPDF;
