/**
 * SimulazionePDF — documento PDF nativo (A4) SINTETICO di una simulazione
 * contratto, generato lato client con @react-pdf/renderer.
 *
 * Struttura (una/poche pagine, no cover/marketing — è un riepilogo interno/cliente):
 *   - Intestazione col nome simulazione + data.
 *   - Blocco KPI (costo, ricavo, margine valore+%, imponibile, IVA totale,
 *     prezzo cliente, durata, rata se presente).
 *   - Tabella voci (per fase se presenti) con totale.
 *   - Blocco scenari IVA (riepilogo per aliquota) + finanziamento (se configurato).
 *
 * Mirror di `src/components/ristrutturazione/RistrutturazionePDF.tsx` per stile e
 * registrazione font: Helvetica built-in (zero rete, zero failure), hyphenation
 * disabilitata, footer LEGALE "Domus Group S.r.l." (solo footer). Brand pagina =
 * EdiliziaInCloud. NESSUN claim su server UE/Italia/Europa.
 *
 * Il helper `scaricaSimulazionePDF` genera il Blob via `pdf(<Doc/>).toBlob()` e lo
 * scarica (lazy import della lib pesante, come `useOrdinePDF`).
 */
import * as React from "react";
import {
  Document, Page, Text, View, StyleSheet, Font,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/formatters";
import { calcolaVoce, calcolaFasi } from "@/lib/simulatore/calcoli";
import type { SimulazioneDoc, SimulazioneRisultato, VoceSim } from "@/lib/simulatore/tipi";

// Helvetica built-in: nessuna registrazione di rete (no CORS/network failure).
const FF = "Helvetica";
// Disabilita hyphenation: spezzava parole italiane in modo brutto.
Font.registerHyphenationCallback((word) => [word]);

const DOMUS_LEGAL = "Domus Group S.r.l.";

const C = {
  primary: "#1E3A5F",
  primaryLight: "#E7EBF1",
  text: "#212529",
  white: "#FFFFFF",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray500: "#64748B",
  gray700: "#334155",
  gray900: "#0F172A",
  accent: "#16A34A",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: FF,
    fontSize: 9.5,
    color: C.text,
    paddingTop: 38,
    paddingBottom: 56,
    paddingHorizontal: 42,
    backgroundColor: C.white,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
    paddingBottom: 8,
    borderBottom: `1.5pt solid ${C.primary}`,
  },
  headerName: { fontSize: 16, fontWeight: 700, color: C.primary },
  headerRight: { fontSize: 8, color: C.gray500, textAlign: "right" as const },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: C.primary,
    marginTop: 14,
    marginBottom: 8,
  },
  // KPI griglia
  kpiGrid: { flexDirection: "row", flexWrap: "wrap" as const, marginHorizontal: -4 },
  kpiCard: {
    width: "25%",
    padding: 4,
  },
  kpiCardInner: {
    backgroundColor: C.gray50,
    borderRadius: 6,
    border: `0.5pt solid ${C.gray200}`,
    padding: 8,
  },
  kpiLabel: { fontSize: 7, color: C.gray500, textTransform: "uppercase" as const, letterSpacing: 0.3 },
  kpiValue: { fontSize: 11, fontWeight: 700, color: C.gray900, marginTop: 3 },
  kpiValueAccent: { fontSize: 11, fontWeight: 700, color: C.accent, marginTop: 3 },
  // Tabella voci
  faseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.primary,
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  faseHeaderTitle: { fontSize: 10, fontWeight: 700, color: C.white },
  faseHeaderSub: { fontSize: 8.5, fontWeight: 700, color: C.white },
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
  subtotal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: C.primaryLight,
  },
  subtotalText: { fontSize: 9, fontWeight: 700, color: C.primary },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
    backgroundColor: C.primary,
    borderRadius: 5,
  },
  grandTotalLabel: { fontSize: 11, fontWeight: 700, color: C.white },
  grandTotalValue: { fontSize: 13, fontWeight: 700, color: C.white },
  // Riepilogo IVA / finanziamento
  twoCols: { flexDirection: "row", marginHorizontal: -6, marginTop: 4 },
  col: { flex: 1, paddingHorizontal: 6 },
  box: {
    borderRadius: 8,
    border: `1pt solid ${C.gray200}`,
    overflow: "hidden",
  },
  boxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottom: `0.5pt solid ${C.gray100}`,
  },
  boxLabel: { fontSize: 9, color: C.gray700 },
  boxValue: { fontSize: 9, fontWeight: 700, color: C.gray900 },
  boxFootRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: C.gray50,
  },
  boxFootLabel: { fontSize: 9.5, fontWeight: 700, color: C.gray900 },
  boxFootValue: { fontSize: 9.5, fontWeight: 700, color: C.primary },
  // Footer
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
  },
  footerName: { fontWeight: 700, color: C.gray700 },
});

const dateStr = () =>
  new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

function fmtPct(v: number): string {
  const n = Number(v) || 0;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

function fmtQty(q: number): string {
  const n = Number(q) || 0;
  return Number.isInteger(n) ? String(n) : n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

// ─── Blocco KPI ───────────────────────────────────────────────────────────────
function KpiBlock({ r }: { r: SimulazioneRisultato }) {
  const cards: { label: string; value: string; accent?: boolean }[] = [
    { label: "Costo totale", value: formatCurrency(r.costo_totale) },
    { label: "Ricavo imponibile", value: formatCurrency(r.ricavo_imponibile) },
    { label: "Margine", value: `${formatCurrency(r.margine_valore)} · ${fmtPct(r.margine_pct)}`, accent: true },
    { label: "Prezzo cliente", value: formatCurrency(r.prezzo_cliente) },
    { label: "IVA totale", value: formatCurrency(r.iva_totale) },
    { label: "Durata", value: r.durata_settimane > 0 ? `${fmtQty(r.durata_settimane)} sett.` : "—" },
    { label: "Rata mensile", value: r.rata_mensile != null ? formatCurrency(r.rata_mensile) : "—" },
  ];
  return (
    <View style={styles.kpiGrid}>
      {cards.map((c, i) => (
        <View key={i} style={styles.kpiCard}>
          <View style={styles.kpiCardInner}>
            <Text style={styles.kpiLabel}>{c.label}</Text>
            <Text style={c.accent ? styles.kpiValueAccent : styles.kpiValue}>{c.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Tabella voci (per fase) ──────────────────────────────────────────────────
function VociTable({ doc }: { doc: SimulazioneDoc }) {
  const fasiOrdinate = [...doc.fasi].sort((a, b) => a.ordine - b.ordine);
  const sezioni: { titolo: string | null; voci: VoceSim[] }[] = [];
  for (const fase of fasiOrdinate) {
    const vociFase = doc.voci.filter((v) => v.fase_id === fase.id);
    if (vociFase.length > 0) sezioni.push({ titolo: fase.nome, voci: vociFase });
  }
  const fasiIds = new Set(doc.fasi.map((f) => f.id));
  const senzaFase = doc.voci.filter((v) => !v.fase_id || !fasiIds.has(v.fase_id));
  if (senzaFase.length > 0) {
    sezioni.push({ titolo: sezioni.length > 0 ? "Senza fase" : null, voci: senzaFase });
  }

  let totale = 0;

  return (
    <View>
      {sezioni.map((sez, si) => {
        let totSez = 0;
        return (
          <View key={si}>
            {sez.titolo ? (
              <View style={styles.faseHeader} wrap={false}>
                <Text style={styles.faseHeaderTitle}>{sez.titolo}</Text>
              </View>
            ) : null}
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, { flex: 1 }]}>Descrizione</Text>
              <Text style={[styles.tableHeadCell, { width: 36, textAlign: "right" }]}>Q.tà</Text>
              <Text style={[styles.tableHeadCell, { width: 30, textAlign: "center" }]}>UM</Text>
              <Text style={[styles.tableHeadCell, { width: 58, textAlign: "right" }]}>Prezzo</Text>
              <Text style={[styles.tableHeadCell, { width: 34, textAlign: "right" }]}>IVA</Text>
              <Text style={[styles.tableHeadCell, { width: 62, textAlign: "right" }]}>Totale</Text>
            </View>
            {sez.voci.map((v) => {
              const { imponibile_ricavo } = calcolaVoce(v);
              totSez += imponibile_ricavo;
              totale += imponibile_ricavo;
              return (
                <View key={v.id} style={styles.row} wrap={false}>
                  <Text style={[styles.cell, { flex: 1, paddingRight: 4 }]}>{v.descrizione || "—"}</Text>
                  <Text style={[styles.cellNum, { width: 36 }]}>{fmtQty(v.quantita)}</Text>
                  <Text style={[styles.cell, { width: 30, textAlign: "center" }]}>{v.unita || "—"}</Text>
                  <Text style={[styles.cellNum, { width: 58 }]}>{formatCurrency(v.prezzo_unitario)}</Text>
                  <Text style={[styles.cellNum, { width: 34 }]}>{fmtPct(v.vat_rate)}</Text>
                  <Text style={[styles.cellNum, { width: 62, fontWeight: 700 }]}>{formatCurrency(imponibile_ricavo)}</Text>
                </View>
              );
            })}
            {sez.titolo ? (
              <View style={styles.subtotal}>
                <Text style={styles.subtotalText}>Subtotale {sez.titolo}: {formatCurrency(totSez)}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={styles.grandTotal} wrap={false}>
        <Text style={styles.grandTotalLabel}>Totale imponibile</Text>
        <Text style={styles.grandTotalValue}>{formatCurrency(totale)}</Text>
      </View>
    </View>
  );
}

// ─── Scenari IVA + finanziamento ──────────────────────────────────────────────
function ScenariBlock({ doc, r }: { doc: SimulazioneDoc; r: SimulazioneRisultato }) {
  const fin = doc.scenari.finanziamento;
  return (
    <View style={styles.twoCols} wrap={false}>
      {/* Riepilogo IVA */}
      <View style={styles.col}>
        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Riepilogo IVA</Text>
        <View style={styles.box}>
          {r.riepilogo_iva.map((riga, i) => (
            <View key={i} style={styles.boxRow}>
              <Text style={styles.boxLabel}>
                Imponibile al {fmtPct(riga.aliquota)} ({formatCurrency(riga.imponibile)})
              </Text>
              <Text style={styles.boxValue}>{formatCurrency(riga.imposta)}</Text>
            </View>
          ))}
          <View style={styles.boxFootRow}>
            <Text style={styles.boxFootLabel}>IVA totale</Text>
            <Text style={styles.boxFootValue}>{formatCurrency(r.iva_totale)}</Text>
          </View>
        </View>
      </View>

      {/* Finanziamento (se configurato) */}
      <View style={styles.col}>
        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Finanziamento</Text>
        {fin ? (
          <View style={styles.box}>
            <View style={styles.boxRow}>
              <Text style={styles.boxLabel}>Importo finanziato</Text>
              <Text style={styles.boxValue}>{formatCurrency(fin.importo_finanziato)}</Text>
            </View>
            {fin.anticipo > 0 ? (
              <View style={styles.boxRow}>
                <Text style={styles.boxLabel}>Anticipo</Text>
                <Text style={styles.boxValue}>{formatCurrency(fin.anticipo)}</Text>
              </View>
            ) : null}
            <View style={styles.boxRow}>
              <Text style={styles.boxLabel}>Numero rate</Text>
              <Text style={styles.boxValue}>{fin.numero_rate}</Text>
            </View>
            <View style={styles.boxFootRow}>
              <Text style={styles.boxFootLabel}>Rata mensile</Text>
              <Text style={styles.boxFootValue}>
                {r.rata_mensile != null ? formatCurrency(r.rata_mensile) : "—"}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.box}>
            <View style={styles.boxRow}>
              <Text style={styles.boxLabel}>Nessun finanziamento configurato</Text>
              <Text style={styles.boxValue}>—</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Documento ────────────────────────────────────────────────────────────────
export interface SimulazionePDFProps {
  doc: SimulazioneDoc;
  risultato: SimulazioneRisultato;
  nome: string;
}

export function SimulazionePDF({ doc, risultato, nome }: SimulazionePDFProps) {
  // `durata_settimane` può non essere ricalcolato nel risultato passato: lo
  // deriviamo difensivamente dalle fasi (coerente con calcolaSimulazione).
  const { durata_settimane } = calcolaFasi(doc.fasi, doc.voci);
  const r: SimulazioneRisultato = { ...risultato, durata_settimane };
  const titolo = (nome || "").trim() || "Simulazione contratto";

  return (
    <Document title={titolo} author="EdiliziaInCloud" subject="Simulazione contratto">
      <Page size="A4" style={styles.page}>
        {/* Intestazione */}
        <View style={styles.header}>
          <Text style={styles.headerName}>{titolo}</Text>
          <View>
            <Text style={styles.headerRight}>Simulazione contratto</Text>
            <Text style={styles.headerRight}>{dateStr()}</Text>
          </View>
        </View>

        {/* KPI */}
        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Riepilogo economico</Text>
        <KpiBlock r={r} />

        {/* Voci */}
        <Text style={styles.sectionTitle}>Dettaglio voci</Text>
        <VociTable doc={doc} />

        {/* Scenari IVA + finanziamento */}
        <View style={{ marginTop: 14 }}>
          <ScenariBlock doc={doc} r={r} />
        </View>

        {/* Footer legale */}
        <View style={styles.footer} fixed>
          <View style={styles.footerRow}>
            <Text style={styles.footerName}>{DOMUS_LEGAL}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
          <View style={styles.footerRow}>
            <Text>{`Documento emesso tramite EdiliziaInCloud · ${dateStr()}`}</Text>
            <Text />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export default SimulazionePDF;

// ─── Helper download ──────────────────────────────────────────────────────────
function safeFileName(nome: string): string {
  const base = (nome || "simulazione").trim().replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80);
  return `${base || "simulazione"}.pdf`;
}

/**
 * scaricaSimulazionePDF — genera il Blob del PDF e lo scarica.
 *
 * Lazy import di `pdf` (la lib pesante è caricata on-demand, come `useOrdinePDF`)
 * e download via Blob + anchor.
 */
export async function scaricaSimulazionePDF(
  doc: SimulazioneDoc,
  risultato: SimulazioneRisultato,
  nome: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const element = React.createElement(SimulazionePDF, { doc, risultato, nome });
  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(nome);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
