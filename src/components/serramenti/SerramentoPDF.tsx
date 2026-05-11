/**
 * SerramentoPDF — Documento PDF nativo (A4) generato lato client con
 * @react-pdf/renderer, ispirato allo stile del PDF FV "Solar Pro Italia".
 *
 * Caricamento lazy: l'import della libreria avviene solo dentro
 * useSerramentoPDF.downloadPDF() per evitare di trascinare ~740 KB
 * di vendor-pdf sul chunk principale.
 *
 * Pagine generate:
 *   1. Cover — sfondo scuro, titolo emotivo, dati cliente, prezzo evidenziato
 *   2. Proposta — anagrafica, sintesi intervento, esigenze, soluzione, perché noi
 *   3. Investimento — forbice prezzo, schema pagamento, finanziamento, ecobonus
 *   4. Tecnico — composizione serramenti, accessori, cronoprogramma, consulenza
 *   5+. (opzionale) Render foto-realistici se presenti nel progetto
 */
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type {
  SrProgettoDetail, SrSerramentoRow, SrAccessorioRow, SrPagamentoMilestone,
  SrPianoFinanziamento, SrEsigenza, SrSoluzioneItem, SrTestimonianza,
  SrTemplatePdfRow,
} from "@/types/serramenti";
import { SR_TIPOLOGIE_SERRAMENTO, SR_MATERIALI, SR_SCHEMI_PAGAMENTO } from "@/types/serramenti";
import { generateInterventoSintesi } from "@/lib/serramenti/sintesiIntervento";

// ─── Palette colori (allineata al template HTML SR + ispirata FV) ──────────
const C = {
  bgDark: "#0F2A2E",          // cover scura
  primary: "#2D7D5C",         // verde brand SR
  primaryLight: "#E8F3EE",
  accent: "#F59E0B",           // arancio per eyebrow/CTA
  accentLight: "#FEF3C7",
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
};

const s = StyleSheet.create({
  // Pagine
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: C.gray900,
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    backgroundColor: C.white,
  },
  cover: {
    fontFamily: "Helvetica",
    color: C.white,
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 50,
    backgroundColor: C.bgDark,
    flexDirection: "column",
    justifyContent: "space-between",
    height: "100%",
  },
  // Header standard pagine 2+
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: `1pt solid ${C.gray200}`,
  },
  headerLogo: { width: 32, height: 32, marginRight: 10 },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.primary },
  headerRight: { fontSize: 8.5, color: C.gray500, textAlign: "right" as const },
  headerStimaCode: { fontFamily: "Helvetica-Bold", color: C.gray900 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTop: `0.5pt solid ${C.gray200}`,
    fontSize: 8,
    color: C.gray500,
  },
  footerLeft: { flex: 1 },
  footerCompanyName: { fontFamily: "Helvetica-Bold", color: C.gray700, marginBottom: 1 },

  // Cover content
  coverEyebrow: {
    fontSize: 10,
    color: C.accent,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    marginBottom: 14,
  },
  coverTitle: {
    fontSize: 44,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.05,
    marginBottom: 18,
  },
  coverSubtitle: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "rgba(255,255,255,0.85)",
    maxWidth: 380,
  },
  coverCard: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    padding: 22,
    marginTop: 30,
    borderLeft: `3pt solid ${C.accent}`,
  },
  coverLabel: {
    fontSize: 8.5,
    color: C.accent,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    marginBottom: 6,
  },
  coverClientName: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  coverClientAddr: { fontSize: 10.5, color: "rgba(255,255,255,0.7)" },
  coverFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 18,
    borderTop: `0.5pt solid rgba(255,255,255,0.2)`,
    fontSize: 9,
    color: "rgba(255,255,255,0.6)",
  },
  coverFooterStrong: { fontFamily: "Helvetica-Bold", color: C.white },
  coverLogoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 50,
  },
  coverLogoCircle: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  coverLogoImage: { width: 56, height: 56, borderRadius: 12, objectFit: "cover" as const },
  coverCompanyName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  coverCompanyTag: { fontSize: 9, color: "rgba(255,255,255,0.7)", marginTop: 2 },

  // Tipografia generale
  pageEyebrow: {
    fontSize: 8.5,
    color: C.primary,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: C.gray900,
    lineHeight: 1.1,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  pageSubtitle: { fontSize: 10, color: C.gray500, marginBottom: 18 },

  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.primary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: `1pt solid ${C.gray200}`,
  },

  // Anagrafica righe key-value
  kvRow: { flexDirection: "row", marginBottom: 3 },
  kvKey: { width: 95, fontSize: 9, color: C.gray500 },
  kvValue: { flex: 1, fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.gray900 },

  // Investimento highlight
  priceBox: {
    backgroundColor: C.primaryLight,
    borderRadius: 8,
    padding: 18,
    marginTop: 8,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 8.5,
    color: C.primary,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.primary,
  },
  priceSuffix: { fontSize: 10, color: C.primary, marginLeft: 6 },

  // Bullet list (esigenze/soluzione/perché noi)
  bulletItem: { flexDirection: "row", marginBottom: 8, alignItems: "flex-start" },
  bulletDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.primary, marginTop: 5, marginRight: 8 },
  bulletContent: { flex: 1 },
  bulletTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.gray900, marginBottom: 2 },
  bulletText: { fontSize: 9.5, color: C.gray700, lineHeight: 1.5 },

  // Tabella tipologie/accessori
  table: { marginTop: 6 },
  tableHeader: {
    flexDirection: "row",
    borderBottom: `1pt solid ${C.gray300}`,
    paddingBottom: 5,
    marginBottom: 4,
  },
  tableCol: { flex: 1, paddingRight: 6 },
  tableColNum: { width: 50, textAlign: "right" as const },
  tableHeaderText: {
    fontSize: 7.5,
    color: C.gray500,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottom: `0.5pt solid ${C.gray100}`,
    alignItems: "flex-start",
  },
  tableCell: { fontSize: 9.5, color: C.gray900 },
  tableCellStrong: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.gray900 },
  tableCellMuted: { fontSize: 9, color: C.gray500, marginTop: 1 },

  // Modalità pagamento
  paySchemaTag: {
    backgroundColor: C.accentLight,
    color: "#92400E",
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    alignSelf: "flex-start" as const,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  payStep: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottom: `0.5pt solid ${C.gray100}`,
    alignItems: "center",
  },
  payStepIdx: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.primary,
    color: C.white,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center" as const,
    paddingTop: 5,
    marginRight: 10,
  },
  payStepLabel: { flex: 1, fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.gray900 },
  payStepWhen: { fontSize: 8.5, color: C.gray500, marginTop: 1 },
  payStepPct: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.primary, width: 60, textAlign: "right" as const },
  payStepAmount: { fontSize: 8.5, color: C.gray500, textAlign: "right" as const, marginTop: 1 },

  // Finanziamento box
  finBox: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  finCard: {
    flex: 1,
    backgroundColor: C.gray50,
    borderRadius: 6,
    padding: 12,
    border: `0.5pt solid ${C.gray200}`,
  },
  finCardTitle: {
    fontSize: 8,
    color: C.gray500,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  finCardValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.primary },
  finCardSub: { fontSize: 8, color: C.gray500, marginTop: 2 },

  // Crono mini-bar
  cronoFase: { flexDirection: "row", marginBottom: 6, alignItems: "center" },
  cronoEmoji: { width: 18, fontSize: 11 },
  cronoLabel: { flex: 1, fontSize: 9.5, color: C.gray900 },
  cronoGiorni: { fontSize: 8.5, color: C.gray500 },

  // Renders grid
  rendersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  renderItem: {
    width: "48%",
    aspectRatio: 1.4,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: C.gray100,
  },
  renderImg: { width: "100%", height: "100%", objectFit: "cover" as const },
});

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtEuro(v: number | null | undefined, decimals = 0): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}
function tipologiaLabel(t: string): string {
  return SR_TIPOLOGIE_SERRAMENTO.find((x) => x.value === t)?.label ?? t;
}
function materialeLabel(m: string | null | undefined): string {
  if (!m) return "—";
  return SR_MATERIALI.find((x) => x.value === m)?.label ?? m;
}

// Raggruppa serramenti per (tipologia, materiale, serie, vetro) per tabella riassuntiva
function groupSerramenti(serr: SrSerramentoRow[]): Array<{
  tipologia: string; materiale: string; serie: string; vetro: string; quantita: number;
}> {
  const map = new Map<string, { tipologia: string; materiale: string; serie: string; vetro: string; quantita: number }>();
  for (const s of serr) {
    const key = `${s.tipologia}__${s.materiale ?? ""}__${s.serie ?? ""}__${s.vetro ?? ""}`;
    const existing = map.get(key);
    if (existing) existing.quantita += s.quantita ?? 1;
    else map.set(key, {
      tipologia: tipologiaLabel(s.tipologia),
      materiale: materialeLabel(s.materiale),
      serie: s.serie ?? "",
      vetro: s.vetro ?? "",
      quantita: s.quantita ?? 1,
    });
  }
  return Array.from(map.values());
}

// ─── Subcomponenti ──────────────────────────────────────────────────────────

function PageHeader({ code, clienteNome, companyName, logoUrl, primaryColor }: {
  code: string; clienteNome: string; companyName: string; logoUrl?: string | null; primaryColor: string;
}) {
  return (
    <View style={s.header} fixed>
      <View style={s.headerLeft}>
        {logoUrl ? (
          <Image src={logoUrl} style={s.headerLogo} />
        ) : (
          <View style={[s.headerLogo, { backgroundColor: primaryColor, alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: C.white, fontSize: 14, fontFamily: "Helvetica-Bold" }}>
              {(companyName || "S").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View>
          <Text style={s.headerName}>{companyName}</Text>
          <Text style={{ fontSize: 7.5, color: C.gray500 }}>{clienteNome}</Text>
        </View>
      </View>
      <View style={s.headerRight}>
        <Text>STIMA N.</Text>
        <Text style={s.headerStimaCode}>{code}</Text>
      </View>
    </View>
  );
}

function PageFooter({ companyName, indirizzo, telefono, email, vat }: {
  companyName: string; indirizzo?: string | null; telefono?: string | null; email?: string | null; vat?: string | null;
}) {
  const right = [indirizzo, telefono ? `· ${telefono}` : null, email ? `· ${email}` : null].filter(Boolean).join(" ");
  return (
    <View style={s.footer} fixed>
      <View style={s.footerLeft}>
        <Text style={s.footerCompanyName}>{companyName}</Text>
        <Text>{right}{vat ? ` · P.IVA ${vat}` : ""}</Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
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
  } | null;
}

// ─── Componente principale ─────────────────────────────────────────────────

export function SerramentoPDF({ detail, template, company }: SerramentoPDFProps) {
  const p = detail.progetto;
  const companyName = template?.ragione_sociale || company?.ragione_sociale || company?.name || "Azienda";
  const logoUrl = template?.logo_url || company?.logo_url || null;
  const primaryColor = template?.colore_primario || C.primary;
  const clienteNome = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "Cliente";
  const cantiereLine = [p.cantiere_citta || p.cliente_citta, `${detail.serramenti.length} serramenti`, p.tipo_intervento].filter(Boolean).join(" · ");

  // Sintesi auto-fallback
  const sintesi = p.intervento_sintesi?.trim()
    || generateInterventoSintesi(detail.serramenti, detail.accessori)
    || "Intervento da definire";

  const totaleMin = Number(p.totale_min ?? 0);
  const totaleMax = Number(p.totale_max ?? 0);
  const totaleMedia = (totaleMin + totaleMax) / 2;
  const esigenze = (Array.isArray(p.esigenze) ? p.esigenze : []) as SrEsigenza[];
  const soluzione = (Array.isArray(p.soluzione) ? p.soluzione : []) as SrSoluzioneItem[];
  const percheNoi = (Array.isArray(p.perche_noi) ? p.perche_noi : []) as Array<string | { titolo: string; descrizione?: string }>;
  const incluso = (Array.isArray(p.incluso_investimento) ? p.incluso_investimento : []) as Array<string | { titolo: string; descrizione?: string }>;
  const testimonianze = (Array.isArray(p.testimonianze) ? p.testimonianze : []) as SrTestimonianza[];
  const milestones = (Array.isArray(p.pagamento_milestones) ? p.pagamento_milestones : []) as SrPagamentoMilestone[];
  const piani = (Array.isArray(p.fin_piani) ? p.fin_piani : []) as SrPianoFinanziamento[];
  const schemaPagamento = p.schema_pagamento ?? "tre_step";
  const schemaCfg = SR_SCHEMI_PAGAMENTO[schemaPagamento as keyof typeof SR_SCHEMI_PAGAMENTO];
  const serramentiGrouped = groupSerramenti(detail.serramenti);
  const renderUrls = detail.media.filter((m) => m.kind === "render" && m.url).map((m) => m.url!);

  return (
    <Document
      title={`Stima ${p.code} - ${clienteNome}`}
      author={companyName}
      subject={`Preventivo serramenti per ${clienteNome}`}
    >
      {/* ─── PAGINA 1 — COVER ────────────────────────────────────────────── */}
      <Page size="A4" style={s.cover}>
        <View>
          <View style={s.coverLogoBox}>
            {logoUrl ? (
              <Image src={logoUrl} style={s.coverLogoImage} />
            ) : (
              <View style={s.coverLogoCircle}>
                <Text style={{ color: C.white, fontSize: 28, fontFamily: "Helvetica-Bold" }}>
                  {(companyName || "S").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View>
              <Text style={s.coverCompanyName}>{companyName}</Text>
              {company?.indirizzo && <Text style={s.coverCompanyTag}>{company.indirizzo}</Text>}
            </View>
          </View>

          <Text style={s.coverEyebrow}>★ La tua proposta personalizzata</Text>
          <Text style={s.coverTitle}>
            Il tuo nuovo{"\n"}cantiere parte{"\n"}da qui.
          </Text>
          <Text style={s.coverSubtitle}>
            {sintesi}
          </Text>

          <View style={s.coverCard}>
            <Text style={s.coverLabel}>Preparato per</Text>
            <Text style={s.coverClientName}>{clienteNome}</Text>
            <Text style={s.coverClientAddr}>
              {[p.cliente_indirizzo, p.cantiere_citta || p.cliente_citta].filter(Boolean).join(", ")}
            </Text>
          </View>
        </View>

        <View style={s.coverFooter}>
          <View>
            <Text>Preventivo <Text style={s.coverFooterStrong}>{p.code}</Text></Text>
            <Text>{fmtDate(p.created_at)} · valido {p.valido_fino_giorni ?? 15} giorni</Text>
          </View>
          <View style={{ textAlign: "right" as const }}>
            <Text>A cura di</Text>
            <Text style={s.coverFooterStrong}>{template?.ragione_sociale || companyName}</Text>
          </View>
        </View>
      </Page>

      {/* ─── PAGINA 2 — PROPOSTA DI INTERVENTO ───────────────────────────── */}
      <Page size="A4" style={s.page}>
        <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} />

        <Text style={s.pageEyebrow}>Pagina 2 · Proposta di intervento</Text>
        <Text style={s.pageTitle}>Per {p.cliente_nome ?? clienteNome}</Text>
        <Text style={s.pageSubtitle}>{cantiereLine}</Text>

        <Text style={s.sectionTitle}>Anagrafica cliente</Text>
        <View style={s.kvRow}><Text style={s.kvKey}>Intestatario</Text><Text style={s.kvValue}>{clienteNome}</Text></View>
        {p.cliente_indirizzo && <View style={s.kvRow}><Text style={s.kvKey}>Indirizzo</Text><Text style={s.kvValue}>{p.cliente_indirizzo}</Text></View>}
        {p.cliente_telefono && <View style={s.kvRow}><Text style={s.kvKey}>Telefono</Text><Text style={s.kvValue}>{p.cliente_telefono}</Text></View>}
        {p.cliente_email && <View style={s.kvRow}><Text style={s.kvKey}>Email</Text><Text style={s.kvValue}>{p.cliente_email}</Text></View>}

        <Text style={s.sectionTitle}>L'intervento in sintesi</Text>
        <Text style={{ fontSize: 10, lineHeight: 1.55, color: C.gray700 }}>{sintesi}</Text>

        {esigenze.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Le tue esigenze</Text>
            {esigenze.slice(0, 3).map((e, i) => (
              <View key={i} style={s.bulletItem}>
                <View style={s.bulletDot} />
                <View style={s.bulletContent}>
                  <Text style={s.bulletTitle}>{e.titolo}</Text>
                  {e.descrizione && <Text style={s.bulletText}>{e.descrizione}</Text>}
                </View>
              </View>
            ))}
          </>
        )}

        {soluzione.length > 0 && (
          <>
            <Text style={s.sectionTitle}>La soluzione per te</Text>
            {soluzione.slice(0, 4).map((sol, i) => (
              <View key={i} style={s.bulletItem}>
                <View style={s.bulletDot} />
                <View style={s.bulletContent}>
                  <Text style={s.bulletTitle}>{sol.titolo}</Text>
                  {sol.descrizione && <Text style={s.bulletText}>{sol.descrizione}</Text>}
                </View>
              </View>
            ))}
          </>
        )}

        {percheNoi.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Perché {companyName}</Text>
            {percheNoi.slice(0, 5).map((it, i) => {
              const titolo = typeof it === "string" ? it : it.titolo;
              const descrizione = typeof it === "string" ? null : it.descrizione;
              return (
                <View key={i} style={s.bulletItem}>
                  <View style={s.bulletDot} />
                  <View style={s.bulletContent}>
                    <Text style={s.bulletTitle}>{titolo}</Text>
                    {descrizione && <Text style={s.bulletText}>{descrizione}</Text>}
                  </View>
                </View>
              );
            })}
          </>
        )}

        <PageFooter
          companyName={companyName}
          indirizzo={template?.indirizzo_completo || company?.indirizzo}
          telefono={template?.telefono || company?.telefono}
          email={template?.email || company?.email}
          vat={template?.partita_iva || company?.partita_iva}
        />
      </Page>

      {/* ─── PAGINA 3 — INVESTIMENTO ─────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} />

        <Text style={s.pageEyebrow}>Pagina 3 · L'investimento</Text>
        <Text style={s.pageTitle}>Trasparenza{"\n"}totale.</Text>
        <Text style={s.pageSubtitle}>Forbice indicativa basata sul primo contatto. Il prezzo definitivo si fissa con sopralluogo e scelta materiali.</Text>

        {/* Prezzo big */}
        <View style={s.priceBox}>
          <View>
            <Text style={s.priceLabel}>Il tuo investimento stimato</Text>
            <Text style={s.priceValue}>
              € {fmtEuro(totaleMin)} – € {fmtEuro(totaleMax)}
              <Text style={s.priceSuffix}>IVA inclusa</Text>
            </Text>
            <Text style={{ fontSize: 8.5, color: C.primary, marginTop: 4 }}>
              Media: € {fmtEuro(totaleMedia)}
            </Text>
          </View>
        </View>

        {/* Schema pagamento */}
        {milestones.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Modalità di pagamento</Text>
            <Text style={s.paySchemaTag}>{schemaCfg?.label ?? "Personalizzato"}</Text>
            <View>
              {milestones.map((m, i) => {
                const amount = (totaleMedia * (Number(m.percentuale) || 0)) / 100;
                return (
                  <View key={i} style={s.payStep}>
                    <Text style={s.payStepIdx}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.payStepLabel}>{m.label}</Text>
                      {m.when && <Text style={s.payStepWhen}>{m.when}</Text>}
                    </View>
                    <View style={{ width: 80, alignItems: "flex-end" }}>
                      <Text style={s.payStepPct}>{m.percentuale}%</Text>
                      <Text style={s.payStepAmount}>≈ € {fmtEuro(amount)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Finanziamento */}
        {piani.length > 0 && schemaCfg?.hasFinanziamento && (
          <>
            <Text style={s.sectionTitle}>Simulazione finanziamento</Text>
            <View style={s.finBox}>
              {piani.slice(0, 2).map((piano, i) => (
                <View key={i} style={s.finCard}>
                  <Text style={s.finCardTitle}>{piano.nome} · {piano.mesi} mesi · TAN {piano.tasso}%</Text>
                  <Text style={s.finCardValue}>€ {fmtEuro(piano.rata_mese)}</Text>
                  <Text style={s.finCardSub}>/mese · finanziato € {fmtEuro(piano.finanziato)}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 7.5, color: C.gray500, marginTop: 6 }}>
              Esempi a scopo informativo. Condizioni contrattuali definitive disponibili in sede.
            </Text>
          </>
        )}

        {/* Detrazione */}
        {p.detrazione_aliquota && (p.detrazione_eur_totale ?? 0) > 0 && (
          <>
            <Text style={s.sectionTitle}>Detrazione fiscale</Text>
            <View style={[s.finCard, { backgroundColor: C.successBg, borderColor: "#86EFAC" }]}>
              <Text style={[s.finCardTitle, { color: C.successText }]}>
                Detrazione {p.detrazione_aliquota}% recuperabile in 10 quote annuali
              </Text>
              <Text style={[s.finCardValue, { color: C.successText }]}>
                € {fmtEuro(p.detrazione_eur_totale)}
              </Text>
              <Text style={[s.finCardSub, { color: C.successText }]}>
                ≈ € {fmtEuro(p.detrazione_eur_anno)} / anno per 10 anni
              </Text>
            </View>
          </>
        )}

        {/* Cosa è incluso */}
        {incluso.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Cosa è incluso nell'investimento</Text>
            {incluso.slice(0, 6).map((it, i) => {
              const titolo = typeof it === "string" ? it : it.titolo;
              const descrizione = typeof it === "string" ? null : it.descrizione;
              return (
                <View key={i} style={s.bulletItem}>
                  <View style={s.bulletDot} />
                  <View style={s.bulletContent}>
                    <Text style={s.bulletTitle}>{titolo}</Text>
                    {descrizione && <Text style={s.bulletText}>{descrizione}</Text>}
                  </View>
                </View>
              );
            })}
          </>
        )}

        <PageFooter
          companyName={companyName}
          indirizzo={template?.indirizzo_completo || company?.indirizzo}
          telefono={template?.telefono || company?.telefono}
          email={template?.email || company?.email}
          vat={template?.partita_iva || company?.partita_iva}
        />
      </Page>

      {/* ─── PAGINA 4 — TECNICO ──────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} />

        <Text style={s.pageEyebrow}>Pagina 4 · Allegato tecnico</Text>
        <Text style={s.pageTitle}>Cosa entra{"\n"}in cantiere.</Text>
        <Text style={s.pageSubtitle}>Composizione dettagliata dei serramenti e degli accessori previsti.</Text>

        {/* Serramenti */}
        <Text style={s.sectionTitle}>Composizione serramenti · {detail.serramenti.reduce((a, x) => a + (x.quantita ?? 1), 0)} pezzi</Text>
        <View style={s.table}>
          <View style={s.tableHeader}>
            <View style={s.tableCol}><Text style={s.tableHeaderText}>Tipologia</Text></View>
            <View style={s.tableCol}><Text style={s.tableHeaderText}>Materiale · Vetro</Text></View>
            <View style={[s.tableCol, s.tableColNum]}><Text style={s.tableHeaderText}>Q.tà</Text></View>
          </View>
          {serramentiGrouped.map((g, i) => (
            <View key={i} style={s.tableRow}>
              <View style={s.tableCol}><Text style={s.tableCellStrong}>{g.tipologia}</Text></View>
              <View style={s.tableCol}>
                <Text style={s.tableCell}>
                  {[g.materiale, g.serie].filter(Boolean).join(" · ")}
                </Text>
                {g.vetro && <Text style={s.tableCellMuted}>{g.vetro}</Text>}
              </View>
              <View style={[s.tableCol, s.tableColNum]}>
                <Text style={s.tableCellStrong}>{g.quantita}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Accessori */}
        {detail.accessori.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Accessori e complementi</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <View style={s.tableCol}><Text style={s.tableHeaderText}>Voce</Text></View>
                <View style={[s.tableCol, s.tableColNum]}><Text style={s.tableHeaderText}>Q.tà</Text></View>
              </View>
              {detail.accessori.map((a, i) => (
                <View key={i} style={s.tableRow}>
                  <View style={s.tableCol}>
                    <Text style={s.tableCellStrong}>{a.descrizione || a.tipo}</Text>
                  </View>
                  <View style={[s.tableCol, s.tableColNum]}>
                    <Text style={s.tableCellStrong}>{a.quantita ?? 1}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Cronoprogramma */}
        <Text style={s.sectionTitle}>Cronoprogramma indicativo</Text>
        <View style={s.cronoFase}>
          <Text style={s.cronoEmoji}>📝</Text>
          <Text style={s.cronoLabel}>Conferma ordine + acconto</Text>
          <Text style={s.cronoGiorni}>Giorno 1</Text>
        </View>
        <View style={s.cronoFase}>
          <Text style={s.cronoEmoji}>🏭</Text>
          <Text style={s.cronoLabel}>Produzione in stabilimento</Text>
          <Text style={s.cronoGiorni}>≈{p.crono_giorni_produzione ?? 90} giorni</Text>
        </View>
        <View style={s.cronoFase}>
          <Text style={s.cronoEmoji}>🔧</Text>
          <Text style={s.cronoLabel}>Posa qualificata in cantiere</Text>
          <Text style={s.cronoGiorni}>{p.crono_giorni_posa ?? Math.max(1, Math.ceil(detail.serramenti.length * 0.8))} giorni</Text>
        </View>
        <View style={s.cronoFase}>
          <Text style={s.cronoEmoji}>✅</Text>
          <Text style={s.cronoLabel}>Collaudo finale</Text>
          <Text style={s.cronoGiorni}>{p.crono_giorni_collaudo ?? 1} {(p.crono_giorni_collaudo ?? 1) === 1 ? "giorno" : "giorni"}</Text>
        </View>

        {/* Consulenza appuntamento */}
        {p.consulenza_at && (
          <>
            <Text style={s.sectionTitle}>La tua consulenza</Text>
            <View style={{ backgroundColor: C.primaryLight, padding: 12, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: C.primary }}>
                {new Date(p.consulenza_at).toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" })}
              </Text>
              {p.consulenza_luogo && (
                <Text style={{ fontSize: 9.5, color: C.gray700, marginTop: 2 }}>{p.consulenza_luogo}</Text>
              )}
            </View>
          </>
        )}

        <PageFooter
          companyName={companyName}
          indirizzo={template?.indirizzo_completo || company?.indirizzo}
          telefono={template?.telefono || company?.telefono}
          email={template?.email || company?.email}
          vat={template?.partita_iva || company?.partita_iva}
        />
      </Page>

      {/* ─── PAGINA 5 (opzionale) — RENDER FOTO-REALISTICI ──────────────── */}
      {renderUrls.length > 0 && (
        <Page size="A4" style={s.page}>
          <PageHeader code={p.code} clienteNome={clienteNome} companyName={companyName} logoUrl={logoUrl} primaryColor={primaryColor} />

          <Text style={s.pageEyebrow}>Pagina 5 · Anteprima visiva</Text>
          <Text style={s.pageTitle}>La tua casa,{"\n"}rinnovata.</Text>
          <Text style={s.pageSubtitle}>Rendering foto-realistici di come saranno i nuovi serramenti.</Text>

          <View style={s.rendersGrid}>
            {renderUrls.slice(0, 4).map((url, i) => (
              <View key={i} style={s.renderItem}>
                <Image src={url} style={s.renderImg} />
              </View>
            ))}
          </View>

          {testimonianze.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Cosa dicono i nostri clienti</Text>
              {testimonianze.slice(0, 3).map((t, i) => (
                <View key={i} style={{ marginBottom: 10, paddingLeft: 12, borderLeft: `2pt solid ${C.primary}` }}>
                  <Text style={{ fontSize: 9.5, fontStyle: "italic" as const, color: C.gray700, lineHeight: 1.5 }}>
                    "{t.testo}"
                  </Text>
                  <Text style={{ fontSize: 8.5, color: C.gray500, marginTop: 2 }}>
                    — {t.cliente_nome}{t.dettaglio ? ` · ${t.dettaglio}` : ""}
                  </Text>
                </View>
              ))}
            </>
          )}

          <PageFooter
            companyName={companyName}
            indirizzo={template?.indirizzo_completo || company?.indirizzo}
            telefono={template?.telefono || company?.telefono}
            email={template?.email || company?.email}
            vat={template?.partita_iva || company?.partita_iva}
          />
        </Page>
      )}
    </Document>
  );
}
