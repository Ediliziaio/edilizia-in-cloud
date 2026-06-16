/**
 * RistrutturazionePDF — documento PDF nativo A4 del preventivo Ristrutturazione
 * (Task 21), generato lato client con @react-pdf/renderer.
 *
 * Struttura pagine (modellata su SerramentoPDF, scala verticale Ristrutturazione):
 *   1. Cover — hero brandizzato (immagine + overlay), logo, titolo/sottotitolo,
 *              card cliente/cantiere, totale in evidenza.
 *   2. Presentazione impresa — "Chi siamo", esigenze, soluzione, USP, testimonianze.
 *   3+. Computo per capitoli — tabella (descrizione, UdM, qty, prezzo, importo) con
 *              subtotale per capitolo; margini per voce/capitolo SOLO se show_margine.
 *   N. Riepilogo economico — imponibile, sconto, IVA, totale, detrazione, margine.
 *   N. Foto e render — griglia con didascalie.
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
import {
  Document, Page, Text, View, StyleSheet, Image, Svg, Rect, Defs,
  LinearGradient, Stop, Font,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/formatters";
import type { RstPdfEnriched, RstPdfCapitolo, RstPdfTotali } from "@/hooks/useRistrutturazionePDF";
import type { RstProgetto, RstTemplatePdf } from "@/types/ristrutturazione";

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

function hexToTint(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const mix = (ch: number) => Math.round(ch + (255 - ch) * alpha);
  return `#${[mix(r), mix(g), mix(b)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function makePalette(t: RstTemplatePdf) {
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
      paddingBottom: 56,
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
    coverLogo: { maxWidth: 180, height: 52, objectFit: "contain" as const },
    coverLogoCircle: {
      width: 52, height: 52, borderRadius: 12,
      backgroundColor: C.secondary,
      alignItems: "center", justifyContent: "center",
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
    coverTotalLabel: { fontSize: 8, color: C.white, textTransform: "uppercase" as const, letterSpacing: 0.5 },
    coverTotalValue: { fontSize: 24, fontWeight: 700, color: C.white, marginTop: 2 },
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
    capHeaderTitle: { fontSize: 10, fontWeight: 700, color: C.white },
    capHeaderSub: { fontSize: 8.5, fontWeight: 700, color: C.white },
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
    totalsGrandLabel: { fontSize: 11, fontWeight: 700, color: C.white },
    totalsGrandValue: { fontSize: 14, fontWeight: 700, color: C.white },
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
    cronoStepText: { fontSize: 9, fontWeight: 700, color: C.white },
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

// ─── Helpers di formato ──────────────────────────────────────────────────────
const clienteNomeOf = (p: RstProgetto) =>
  [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ").trim() || "Gentile Cliente";

const cantiereOf = (p: RstProgetto) =>
  [p.cantiere_indirizzo, [p.cantiere_cap, p.cantiere_citta].filter(Boolean).join(" "), p.cantiere_provincia]
    .filter(Boolean).join(", ").trim();

const dateStr = () => new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Footer (legale Domus Group) ─────────────────────────────────────────────
function PageFooter({ styles, company, code, footerText }: {
  styles: Styles;
  company: RstPdfEnriched["company"];
  code: string | null;
  footerText: string | null;
}) {
  const line1 = [company?.indirizzo, company?.telefono, company?.email].filter(Boolean).join(" · ");
  const line2 = [company?.partita_iva ? `P.IVA ${company.partita_iva}` : null, company?.website].filter(Boolean).join(" · ");
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerRow}>
        <Text style={styles.footerName}>{company?.ragione_sociale || company?.name || DOMUS_LEGAL}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
      {Boolean(line1) && <View style={styles.footerRow}><Text>{line1}</Text><Text /></View>}
      {Boolean(line2) && <View style={styles.footerRow}><Text>{line2}</Text><Text /></View>}
      {Boolean(footerText) && <View style={styles.footerRow}><Text>{footerText}</Text><Text /></View>}
      <View style={styles.footerRow}>
        <Text>
          {`Preventivo ${code ?? ""} · ${dateStr()} · Documento emesso tramite EdiliziaInCloud · ${DOMUS_LEGAL}`}
        </Text>
        <Text />
      </View>
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
        <Text style={styles.headerRight}>Preventivo ristrutturazione</Text>
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
function CapitoloTable({ styles, cap, showMargine }: {
  styles: Styles; cap: RstPdfCapitolo; showMargine: boolean;
}) {
  return (
    <View wrap={false}>
      <View style={styles.capHeader}>
        <Text style={styles.capHeaderTitle}>{cap.nome}</Text>
        <Text style={styles.capHeaderSub}>{formatCurrency(cap.subtotale)}</Text>
      </View>
      <View style={styles.tableHead}>
        <Text style={[styles.tableHeadCell, { flex: 1 }]}>Descrizione</Text>
        <Text style={[styles.tableHeadCell, { width: 34, textAlign: "center" }]}>UdM</Text>
        <Text style={[styles.tableHeadCell, { width: 40, textAlign: "right" }]}>Q.tà</Text>
        <Text style={[styles.tableHeadCell, { width: 58, textAlign: "right" }]}>Prezzo</Text>
        <Text style={[styles.tableHeadCell, { width: 62, textAlign: "right" }]}>Importo</Text>
        {showMargine && <Text style={[styles.tableHeadCell, { width: 50, textAlign: "right" }]}>Margine</Text>}
      </View>
      {cap.voci.map((v) => {
        const margineEur = (Number(v.importo) || 0) -
          ((Number(v.costo_materiali) || 0) + (Number(v.costo_manodopera) || 0)) * (Number(v.quantita) || 0);
        return (
          <View key={v.id} style={styles.row} wrap={false}>
            <Text style={[styles.cell, { flex: 1 }]}>{v.descrizione || "—"}</Text>
            <Text style={[styles.cell, { width: 34, textAlign: "center" }]}>{v.unita_misura}</Text>
            <Text style={[styles.cellNum, { width: 40 }]}>{formatQty(v.quantita)}</Text>
            <Text style={[styles.cellNum, { width: 58 }]}>{formatCurrency(v.prezzo_unitario)}</Text>
            <Text style={[styles.cellNum, { width: 62, fontWeight: 700 }]}>{formatCurrency(v.importo)}</Text>
            {showMargine && <Text style={[styles.cellMargin, { width: 50 }]}>{formatCurrency(margineEur)}</Text>}
          </View>
        );
      })}
      <View style={styles.capSubtotal}>
        <Text style={styles.capSubtotalText}>Subtotale {cap.nome}: {formatCurrency(cap.subtotale)}</Text>
      </View>
    </View>
  );
}

function formatQty(q: number): string {
  const n = Number(q) || 0;
  return Number.isInteger(n) ? String(n) : n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

// ─── Riepilogo economico ─────────────────────────────────────────────────────
function TotalsBlock({ styles, totali, detrazioneText, showMargine }: {
  styles: Styles; totali: RstPdfTotali; detrazioneText: string | null; showMargine: boolean;
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
            <Text style={styles.totalsValueNeg}>− {formatCurrency(totali.scontoEur)}</Text>
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
export function RistrutturazionePDF(props: RstPdfEnriched) {
  const { progetto: p, template: t, company, capitoli, totali, media } = props;
  const C = makePalette(t);
  const styles = makeStyles(C);

  const companyName = company?.ragione_sociale || company?.name || "EdiliziaInCloud";
  const logoUrl = t.logo_url ?? company?.logo_url ?? null;
  const cliente = clienteNomeOf(p);
  const cantiere = cantiereOf(p);
  const coverTitle = (t.cover_title ?? "").trim() || "Preventivo di ristrutturazione";
  const coverSubtitle = (t.cover_subtitle ?? "").trim() || "La tua casa, rinnovata chiavi in mano";

  const esigenze = t.esigenze ?? [];
  const soluzione = t.soluzione ?? [];
  const usp = t.usp ?? [];
  const testimonianze = (t.testimonianze ?? []).filter((x) => (x.testo ?? "").trim());
  const crono = (t.cronoprogramma ?? []).filter((x) => (x.fase ?? "").trim());
  const showChiSiamo = t.show_chi_siamo !== false;
  const showCrono = t.show_cronoprogramma !== false && crono.length > 0;
  const showMargine = t.show_margine === true;

  const hasPresentazione = (showChiSiamo && Boolean((t.chi_siamo ?? "").trim()))
    || esigenze.some((e) => (e.titolo ?? "").trim())
    || soluzione.some((s) => (s.titolo ?? "").trim())
    || usp.some((u) => (u.titolo ?? "").trim())
    || testimonianze.length > 0;

  const footer = (
    <PageFooter styles={styles} company={company} code={p.code} footerText={t.footer_text ?? null} />
  );
  const header = (
    <PageHeader styles={styles} companyName={companyName} logoUrl={logoUrl} code={p.code} />
  );

  return (
    <Document
      title={`Preventivo ${p.code ?? ""} - ${cliente}`}
      author={companyName}
      subject={`Preventivo ristrutturazione per ${cliente}`}
    >
      {/* ─── PAGINA 1 — COVER ─────────────────────────────────────────────── */}
      <Page size="A4" style={styles.cover}>
        {t.cover_image_url && (
          <Image
            src={t.cover_image_url}
            style={{ position: "absolute", top: 0, left: 0, width: 595, height: 841, objectFit: "cover" }}
          />
        )}
        {/* Overlay scuro per leggibilità (gradiente verticale) */}
        <View style={{ position: "absolute", top: 0, left: 0, width: 595, height: 841 }}>
          <Svg width={595} height={841} viewBox="0 0 595 841">
            <Defs>
              <LinearGradient id="rst-cover-grad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={C.coverBg} stopOpacity={t.cover_image_url ? 0.55 : 1} />
                <Stop offset="0.6" stopColor={C.coverBg} stopOpacity={t.cover_image_url ? 0.72 : 1} />
                <Stop offset="1" stopColor={C.coverBg} stopOpacity={t.cover_image_url ? 0.92 : 1} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={595} height={841} fill="url(#rst-cover-grad)" />
          </Svg>
        </View>

        <View style={{ position: "absolute", top: 48, left: 44, right: 44 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {logoUrl ? (
              <Image src={logoUrl} style={styles.coverLogo} />
            ) : (
              <View style={styles.coverLogoCircle}>
                <Text style={{ color: C.white, fontSize: 24, fontWeight: 700 }}>
                  {companyName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ position: "absolute", top: 300, left: 44, right: 44 }}>
          <Text style={styles.coverTitle}>{coverTitle}</Text>
          <Text style={styles.coverSubtitle}>{coverSubtitle}</Text>
        </View>

        <View style={{ position: "absolute", bottom: 70, left: 44, right: 44 }}>
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
          <View style={styles.coverTotalBox}>
            <Text style={styles.coverTotalLabel}>Investimento totale (IVA inclusa)</Text>
            <Text style={styles.coverTotalValue}>{formatCurrency(totali.totale)}</Text>
          </View>
        </View>
      </Page>

      {/* ─── PAGINA 2 — PRESENTAZIONE IMPRESA ─────────────────────────────── */}
      {hasPresentazione && (
        <Page size="A4" style={styles.page}>
          {header}
          {showChiSiamo && (t.chi_siamo ?? "").trim() ? (
            <View wrap={false}>
              <Text style={styles.sectionTitle}>Chi siamo</Text>
              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: t.chi_siamo_foto_url ? 1.6 : 1 }}>
                  <Text style={styles.condText}>{t.chi_siamo}</Text>
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

          {esigenze.some((e) => (e.titolo ?? "").trim()) && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>Le tue esigenze</Text>
              <BulletList styles={styles} items={esigenze} />
            </View>
          )}

          {soluzione.some((s) => (s.titolo ?? "").trim()) && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>La nostra soluzione</Text>
              <BulletList styles={styles} items={soluzione} />
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

      {/* ─── COMPUTO PER CAPITOLI + RIEPILOGO ─────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        {header}
        <Text style={styles.sectionTitle}>Computo metrico estimativo</Text>
        <Text style={styles.sectionSub}>
          Dettaglio delle lavorazioni previste, suddivise per capitolo.
        </Text>
        {capitoli.map((cap) => (
          <CapitoloTable key={cap.nome} styles={styles} cap={cap} showMargine={showMargine} />
        ))}

        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={styles.sectionTitle}>Riepilogo economico</Text>
          <TotalsBlock
            styles={styles}
            totali={totali}
            detrazioneText={null}
            showMargine={showMargine}
          />
        </View>
        {footer}
      </Page>

      {/* ─── FOTO E RENDER ────────────────────────────────────────────────── */}
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
              <Text style={styles.condText}>{t.payment_terms_text}</Text>
            </View>
          ) : null}
          <View style={styles.condBlock}>
            <Text style={styles.condTitle}>Validità dell'offerta</Text>
            <Text style={styles.condText}>
              {(t.validity_text ?? "").trim() || "Preventivo valido 30 giorni dalla data di emissione, salvo diversa indicazione scritta."}
            </Text>
          </View>
        </View>

        <View style={styles.contactsBox} wrap={false}>
          <Text style={styles.condTitle}>I tuoi contatti</Text>
          <View style={styles.contactRow}>
            <Text style={styles.contactLabel}>Azienda</Text>
            <Text style={styles.contactValue}>{companyName}</Text>
          </View>
          {company?.telefono ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>Telefono</Text>
              <Text style={styles.contactValue}>{company.telefono}</Text>
            </View>
          ) : null}
          {company?.email ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>{company.email}</Text>
            </View>
          ) : null}
          {company?.indirizzo ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>Sede</Text>
              <Text style={styles.contactValue}>{company.indirizzo}</Text>
            </View>
          ) : null}
        </View>
        {footer}
      </Page>
    </Document>
  );
}

export default RistrutturazionePDF;
