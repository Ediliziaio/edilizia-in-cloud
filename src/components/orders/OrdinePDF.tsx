import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/* ── Palette ─────────────────────────────────────────────── */
const C = {
  navy: "#1E3A5F",
  orange: "#F97316",
  green: "#16a34a",
  red: "#dc2626",
  cyan: "#0891b2",
  amber: "#d97706",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",
  white: "#ffffff",
  greenBg: "#dcfce7",
  redBg: "#fef2f2",
  amberBg: "#fffbeb",
  cyanBg: "#ecfeff",
  orangeBg: "#fff7ed",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.gray900,
    backgroundColor: C.white,
    padding: 40,
    paddingBottom: 60,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 14,
    borderBottom: `2pt solid ${C.navy}`,
  },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.navy },
  orderCode: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.orange, textAlign: "right" as const },
  orderDate: { fontSize: 8, color: C.gray500, textAlign: "right" as const },

  // Section
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 6,
    marginTop: 14,
  },
  sectionLine: { height: 1, backgroundColor: C.gray200, marginBottom: 8 },

  // Grid
  row2: { flexDirection: "row" as const, gap: 10, marginBottom: 10 },
  row3: { flexDirection: "row" as const, gap: 10, marginBottom: 10 },
  col: { flex: 1 },

  // Info box
  infoBox: {
    backgroundColor: C.gray50,
    borderRadius: 4,
    padding: 10,
    border: `0.5pt solid ${C.gray200}`,
  },
  label: { fontSize: 7, color: C.gray500, marginBottom: 2, textTransform: "uppercase" as const },
  value: { fontSize: 9, color: C.gray900, fontFamily: "Helvetica-Bold" },
  valueNormal: { fontSize: 9, color: C.gray700 },

  // Table
  table: {
    border: `0.5pt solid ${C.gray200}`,
    borderRadius: 4,
    overflow: "hidden" as const,
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: "row" as const,
    backgroundColor: C.navy,
    padding: "5 8",
  },
  tableHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.white },
  tableRow: { flexDirection: "row" as const, padding: "5 8", borderTop: `0.5pt solid ${C.gray200}` },
  tableRowAlt: {
    flexDirection: "row" as const,
    padding: "5 8",
    borderTop: `0.5pt solid ${C.gray200}`,
    backgroundColor: C.gray50,
  },
  tableCell: { fontSize: 8, color: C.gray700 },

  // Badges
  badgeGreen: { backgroundColor: C.greenBg, color: C.green, fontSize: 7, padding: "2 5", borderRadius: 8 },
  badgeGray: { backgroundColor: C.gray100, color: C.gray500, fontSize: 7, padding: "2 5", borderRadius: 8 },
  badgeOrange: { backgroundColor: C.orangeBg, color: C.orange, fontSize: 7, padding: "2 5", borderRadius: 8 },
  badgeCyan: { backgroundColor: C.cyanBg, color: C.cyan, fontSize: 7, padding: "2 5", borderRadius: 8 },
  badgeRed: { backgroundColor: C.redBg, color: C.red, fontSize: 7, padding: "2 5", borderRadius: 8 },

  // Financial
  financialBox: { backgroundColor: C.gray50, borderRadius: 6, padding: 10, border: `0.5pt solid ${C.gray200}` },
  financialRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 3 },
  financialLabel: { fontSize: 8, color: C.gray500 },
  financialValue: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.gray900 },
  financialTotal: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.orange },
  financialTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.navy },

  // Status strip
  statusStrip: {
    flexDirection: "row" as const,
    backgroundColor: C.gray50,
    borderRadius: 4,
    padding: 8,
    marginBottom: 14,
    border: `0.5pt solid ${C.gray200}`,
    gap: 4,
    flexWrap: "wrap" as const,
  },
  statusStep: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: { fontSize: 7, color: C.gray500 },

  // Footer
  footer: {
    position: "absolute" as const,
    bottom: 25,
    left: 40,
    right: 40,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    borderTop: `0.5pt solid ${C.gray200}`,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: C.gray500 },

  // KPI strip
  kpiRow: { flexDirection: "row" as const, gap: 8, marginBottom: 12 },
  kpiBox: {
    flex: 1,
    borderRadius: 4,
    padding: 8,
    alignItems: "center" as const,
  },
  kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  kpiLabel: { fontSize: 7, color: C.gray500, marginTop: 2 },
});

/* ── Helpers ─────────────────────────────────────────────── */
const fmt = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "Non impostata";
  try { return format(new Date(d), "dd/MM/yyyy", { locale: it }); }
  catch { return d; }
};

const fmtPerc = (n: number) => `${n.toFixed(1)}%`;

/* ── Status maps ─────────────────────────────────────────── */
const ITEM_STATUS_MAP: Record<string, { label: string; style: any }> = {
  da_ordinare: { label: "Da ordinare", style: { backgroundColor: C.gray100, color: C.gray500 } },
  ordinato: { label: "Ordinato", style: { backgroundColor: C.orangeBg, color: C.orange } },
  in_produzione: { label: "In Produzione", style: { backgroundColor: C.cyanBg, color: C.cyan } },
  in_arrivo: { label: "In Arrivo", style: { backgroundColor: C.amberBg, color: C.amber } },
  in_magazzino: { label: "In Magazzino", style: { backgroundColor: "#ede9fe", color: "#7c3aed" } },
  installato: { label: "Installato", style: { backgroundColor: C.greenBg, color: C.green } },
};

const COMMISSION_TYPE: Record<string, string> = {
  fixed: "Fisso",
  percentage_sold: "% Venduto",
  percentage_collected: "% Incassato",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  ordine_creato: "Commessa creata",
  ordine_aggiornato: "Commessa aggiornata",
  ordine_duplicato: "Commessa duplicata",
  stato_cambiato: "Stato cambiato",
  articolo_aggiunto: "Articolo aggiunto",
  articolo_aggiornato: "Articolo aggiornato",
  articolo_stato_cambiato: "Stato articolo cambiato",
  articolo_eliminato: "Articolo eliminato",
  acconto_ricevuto: "Acconto ricevuto",
  acconto_2_ricevuto: "2° Acconto ricevuto",
  saldo_ricevuto: "Saldo ricevuto",
  pagamento_fornitore: "Pagamento fornitore",
  fattura_creata: "Fattura creata",
  fattura_inviata_sdi: "Fattura inviata SDI",
  fattura_pagata: "Fattura pagata",
  allegato_caricato: "Allegato caricato",
  appuntamento_creato: "Appuntamento creato",
  appuntamento_confermato: "Appuntamento confermato",
  appuntamento_completato: "Appuntamento completato",
  ordine_fornitore_creato: "OdA creato",
  merce_arrivata: "Merce arrivata",
  contratto_firmato: "Contratto firmato",
  preventivo_accettato: "Preventivo accettato",
  giornale_lavori_inserito: "Giornale lavori",
  nota_interna: "Nota interna",
};

// Solo testo ASCII/WinAnsi: le emoji non esistono in Helvetica e diventano
// caratteri spazzatura nel PDF.
const METEO_LABELS: Record<string, string> = {
  sereno: "Sereno",
  nuvoloso: "Nuvoloso",
  pioggia: "Pioggia",
  neve: "Neve",
  vento: "Vento",
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  nota_interna: "Nota Interna",
};

/* ── Props ───────────────────────────────────────────────── */
export interface OrdinePDFProps {
  order: any;
  items?: any[];
  laborEmployees?: any[];
  laborTeams?: any[];
  salList?: any[];
  purchaseOrders?: any[];
  salespeople?: any[];
  campoAssignments?: any[];
  installments?: any[];
  giornaleLavori?: any[];
  varianti?: any[];
  diaryEvents?: any[];
  diaryMessages?: any[];
  companyName?: string;
  statuses?: any[];
  /** Visibilità finanziaria del generatore. Se false, il PDF omette
   *  rispettivamente i costi (materiali/manodopera/subappalto/ODA) e la
   *  sezione margine + provvigioni. Default true = retrocompatibile. */
  showCosts?: boolean;
  showMargins?: boolean;
}

/* ── Component ───────────────────────────────────────────── */
export function OrdinePDF({
  order,
  items = [],
  laborEmployees = [],
  laborTeams = [],
  salList = [],
  purchaseOrders = [],
  salespeople = [],
  campoAssignments = [],
  installments = [],
  giornaleLavori = [],
  varianti = [],
  diaryEvents = [],
  diaryMessages = [],
  companyName,
  statuses = [],
  showCosts = true,
  showMargins = true,
}: OrdinePDFProps) {
  // ── Financials ──
  const imponibile = order?.total_amount ?? 0;
  const ivaRate = order?.vat_rate ?? 22;
  const iva = imponibile * (ivaRate / 100);
  const totaleIva = imponibile + iva;

  const costoMateriali = items.reduce((s: number, i: any) => s + ((i.purchase_price ?? 0) * (i.quantity ?? 1)), 0);
  const costoEmployees = laborEmployees.reduce((s: number, e: any) => s + (e.total_cost ?? 0), 0);
  const costoTeams = laborTeams.reduce((s: number, t: any) => s + (t.total_cost ?? 0), 0);
  const costoManodopera = costoEmployees + costoTeams;
  const costoTotale = costoMateriali + costoManodopera;
  const margine = imponibile - costoTotale;
  const marginePerc = imponibile > 0 ? (margine / imponibile) * 100 : 0;

  // Vendita totale per articoli (prezzo vendita)
  const totaleVendita = items.reduce((s: number, i: any) => {
    const unitPrice = i.unit_price ?? 0;
    const qty = i.quantity ?? 1;
    const disc = i.discount_percent ?? 0;
    return s + (unitPrice * qty * (1 - disc / 100));
  }, 0);

  // Provvigioni
  const totaleProvvigioni = salespeople.reduce((sum: number, sp: any) => {
    const gross = sp.commission_type === "fixed"
      ? sp.commission_value
      : (sp.commission_type === "percentage_sold"
        ? imponibile * (sp.commission_value / 100)
        : (order?.collected_amount ?? 0) * (sp.commission_value / 100));
    return sum + (gross - (sp.deduction_amount || 0));
  }, 0);

  // Installments
  const installmentsPaid = installments.filter((inst: any) => inst.is_paid);
  const installmentsTotal = installments.reduce((s: number, inst: any) => s + (inst.amount ?? 0), 0);
  const incassato = installmentsPaid.reduce((s: number, inst: any) => s + (inst.amount ?? 0), 0);

  // Customer
  const nomeCliente = order?.customer
    ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim()
    : "—";
  const emailCliente = order?.customer?.email ?? null;
  const telCliente = order?.customer?.phone ?? null;
  const indirizzoCliente = order?.customer?.address ?? null;

  // Status
  const currentStatus = statuses.find((s: any) => s.id === order?.current_status_id);
  const currentStatusName = currentStatus?.name ?? "—";
  const currentStatusPos = currentStatus?.position ?? 0;

  const orderCode = order?.order_code ?? "ORD";
  const printDate = format(new Date(), "dd/MM/yyyy HH:mm", { locale: it });

  // Campo assignments
  const capocantiere = campoAssignments.find((ca: any) => ca.is_capocantiere);
  const operaiCampo = campoAssignments.filter((ca: any) => !ca.is_capocantiere);

  // Items stats
  const itemsInstallati = items.filter((i: any) => i.status === "installato").length;
  const itemsPagati = items.filter((i: any) => i.is_paid).length;

  return (
    <Document title={`Commessa ${orderCode}`} author={companyName ?? "Edilizia in Cloud"}>
      <Page size="A4" style={styles.page} wrap>

        {/* ─── HEADER ─── */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.companyName}>{companyName ?? "Edilizia in Cloud"}</Text>
            <Text style={{ fontSize: 8, color: C.gray500, marginTop: 3 }}>Scheda Commessa Completa</Text>
          </View>
          <View>
            <Text style={styles.orderCode}>{orderCode}</Text>
            <Text style={styles.orderDate}>Creato il {fmtDate(order?.created_at)}</Text>
            <Text style={[styles.orderDate, { marginTop: 1 }]}>Stampato il {printDate}</Text>
          </View>
        </View>

        {/* ─── TITOLO ─── */}
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: C.gray900 }}>
            {order?.description ?? "Commessa senza descrizione"}
          </Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" }}>
            <View style={{ backgroundColor: C.orange, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.white }}>{currentStatusName}</Text>
            </View>
          </View>
        </View>

        {/* ─── KPI STRIP ─── */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiBox, { backgroundColor: C.orangeBg }]}>
            <Text style={[styles.kpiValue, { color: C.orange }]}>{fmt(totaleIva)}</Text>
            <Text style={styles.kpiLabel}>Totale Commessa (IVA incl.)</Text>
          </View>
          {showMargins && (
          <View style={[styles.kpiBox, { backgroundColor: margine >= 0 ? C.greenBg : C.redBg }]}>
            <Text style={[styles.kpiValue, { color: margine >= 0 ? C.green : C.red }]}>{fmtPerc(marginePerc)}</Text>
            <Text style={styles.kpiLabel}>Margine</Text>
          </View>
          )}
          <View style={[styles.kpiBox, { backgroundColor: C.cyanBg }]}>
            <Text style={[styles.kpiValue, { color: C.cyan }]}>{itemsInstallati}/{items.length}</Text>
            <Text style={styles.kpiLabel}>Articoli Installati</Text>
          </View>
          <View style={[styles.kpiBox, { backgroundColor: incassato >= installmentsTotal && installmentsTotal > 0 ? C.greenBg : C.amberBg }]}>
            <Text style={[styles.kpiValue, { color: incassato >= installmentsTotal && installmentsTotal > 0 ? C.green : C.amber }]}>{fmt(incassato)}</Text>
            <Text style={styles.kpiLabel}>Incassato</Text>
          </View>
        </View>

        {/* ─── STATUS PROGRESS ─── */}
        {statuses.length > 0 && (
          <View style={styles.statusStrip}>
            {statuses.sort((a: any, b: any) => a.position - b.position).map((s: any, idx: number) => {
              const isPast = s.position <= currentStatusPos;
              const isCurrent = s.id === order?.current_status_id;
              return (
                <View key={idx} style={styles.statusStep}>
                  <View style={[styles.statusDot, {
                    backgroundColor: isCurrent ? C.orange : isPast ? C.green : C.gray300,
                  }]} />
                  <Text style={[styles.statusText, {
                    color: isCurrent ? C.orange : isPast ? C.green : C.gray500,
                    fontFamily: isCurrent ? "Helvetica-Bold" : "Helvetica",
                  }]}>{s.name}</Text>
                  {idx < statuses.length - 1 && <Text style={{ fontSize: 7, color: C.gray300 }}>{"->"}</Text>}
                </View>
              );
            })}
          </View>
        )}

        {/* ─── INFORMAZIONI GENERALI ─── */}
        <Text style={styles.sectionTitle}>Informazioni Generali</Text>
        <View style={styles.sectionLine} />
        <View style={styles.row2}>
          {/* Cliente */}
          <View style={[styles.infoBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 4 }]}>CLIENTE</Text>
            <Text style={[styles.value, { fontSize: 10, marginBottom: 3 }]}>{nomeCliente}</Text>
            {emailCliente && <Text style={styles.valueNormal}>{emailCliente}</Text>}
            {telCliente && <Text style={styles.valueNormal}>{telCliente}</Text>}
            {indirizzoCliente && <Text style={[styles.valueNormal, { marginTop: 3, color: C.gray500, fontSize: 8 }]}>{indirizzoCliente}</Text>}
          </View>
          {/* Tempistiche */}
          <View style={[styles.infoBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 4 }]}>TEMPISTICHE</Text>
            {[
              ["Data posa prevista", order?.expected_date],
              ["Arrivo merce", order?.warehouse_arrival_date],
              ["Inizio lavori", order?.work_start_date],
              ["Fine lavori", order?.work_end_date],
            ].map(([lbl, val]: any, idx: number) => (
              <View key={idx} style={styles.financialRow}>
                <Text style={[styles.financialLabel, { fontSize: 7 }]}>{lbl}</Text>
                <Text style={[styles.valueNormal, { fontSize: 8 }]}>{fmtDate(val)}</Text>
              </View>
            ))}
          </View>
          {/* Capocantiere / Campo */}
          <View style={[styles.infoBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 4 }]}>CANTIERE</Text>
            <View style={styles.financialRow}>
              <Text style={[styles.financialLabel, { fontSize: 7 }]}>Capocantiere</Text>
              <Text style={[styles.value, { fontSize: 8 }]}>
                {capocantiere
                  ? `${capocantiere.user?.first_name ?? capocantiere.subappaltatore?.nome ?? ""} ${capocantiere.user?.last_name ?? ""}`.trim()
                  : "Non assegnato"}
              </Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={[styles.financialLabel, { fontSize: 7 }]}>Operai in campo</Text>
              <Text style={[styles.valueNormal, { fontSize: 8 }]}>{operaiCampo.length}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={[styles.financialLabel, { fontSize: 7 }]}>Bonus edilizio</Text>
              <Text style={[styles.valueNormal, { fontSize: 8 }]}>{order?.has_building_bonus ? "Sì" : "No"}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={[styles.financialLabel, { fontSize: 7 }]}>Pagamento</Text>
              <Text style={[styles.valueNormal, { fontSize: 8 }]}>
                {order?.payment_type === "unica_soluzione" ? "Unica sol." : order?.payment_type === "rate" ? "Rate" : order?.payment_type ?? "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* ─── ARTICOLI ─── */}
        {items.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Articoli della Commessa ({items.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              {/* fixed: l'header colonne si ripete sulle pagine successive SOLO
                  finché questa tabella continua (react-pdf lo propaga insieme al
                  frammento della View tabella, non alle altre sezioni). */}
              <View style={styles.tableHeader} fixed>
                <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>Articolo</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Fornitore</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.5, textAlign: "center" }]}>Qty</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Prezzo Unit.</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.5, textAlign: "center" }]}>Sc.%</Text>
                {showCosts && <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Costo Acq.</Text>}
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Tot. Vendita</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.8, textAlign: "center" }]}>Stato</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.6, textAlign: "center" }]}>Pag.</Text>
              </View>
              {items.map((item: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const qty = item.quantity ?? 1;
                const unitPrice = item.unit_price ?? 0;
                const discount = item.discount_percent ?? 0;
                const purchasePrice = item.purchase_price ?? 0;
                const totalVendita = unitPrice * qty * (1 - discount / 100);
                const statusInfo = ITEM_STATUS_MAP[item.status] ?? ITEM_STATUS_MAP.da_ordinare;
                const supplier = item.supplier?.name ?? item.supplier_name ?? "—";
                return (
                  <View key={idx} style={rowStyle} wrap={false}>
                    <View style={{ flex: 2.5 }}>
                      <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>{item.name ?? "—"}</Text>
                      {item.description ? (
                        <Text style={{ fontSize: 6, color: C.gray500, marginTop: 1, maxLines: 1, textOverflow: "ellipsis" }}>{item.description}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.tableCell, { flex: 1.5, fontSize: 7 }]}>{supplier}</Text>
                    <Text style={[styles.tableCell, { flex: 0.5, textAlign: "center" }]}>{qty}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{fmt(unitPrice)}</Text>
                    <Text style={[styles.tableCell, { flex: 0.5, textAlign: "center" }]}>{discount > 0 ? `${discount}%` : "—"}</Text>
                    {showCosts && <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{fmt(purchasePrice)}</Text>}
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{fmt(totalVendita)}</Text>
                    <View style={{ flex: 0.8, alignItems: "center" }}>
                      <Text style={[{ fontSize: 6, padding: "1 4", borderRadius: 6 }, statusInfo.style]}>{statusInfo.label}</Text>
                    </View>
                    <View style={{ flex: 0.6, alignItems: "center" }}>
                      <Text style={[{ fontSize: 6, padding: "1 4", borderRadius: 6 }, item.is_paid ? { backgroundColor: C.greenBg, color: C.green } : { backgroundColor: C.redBg, color: C.red }]}>
                        {item.is_paid ? "Sì" : "No"}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {/* Totals row */}
              <View style={[styles.tableRow, { backgroundColor: C.gray100, borderTop: `1pt solid ${C.gray300}` }]}>
                <Text style={[styles.tableCell, { flex: 2.5, fontFamily: "Helvetica-Bold" }]}>TOTALE</Text>
                <Text style={{ flex: 1.5 }} />
                <Text style={[styles.tableCell, { flex: 0.5, textAlign: "center", fontFamily: "Helvetica-Bold" }]}>
                  {items.reduce((s: number, i: any) => s + (i.quantity ?? 1), 0)}
                </Text>
                <Text style={{ flex: 1 }} />
                <Text style={{ flex: 0.5 }} />
                {showCosts && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{fmt(costoMateriali)}</Text>}
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold", color: C.navy }]}>{fmt(totaleVendita)}</Text>
                <Text style={[styles.tableCell, { flex: 0.8, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 7 }]}>
                  {itemsInstallati}/{items.length}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.6, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 7 }]}>
                  {itemsPagati}/{items.length}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ─── RIEPILOGO ECONOMICO ─── */}
        <Text style={styles.sectionTitle}>Riepilogo Economico</Text>
        <View style={styles.sectionLine} />
        <View style={styles.row2}>
          {/* Importi e pagamenti */}
          <View style={[styles.financialBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 6 }]}>IMPORTI E PAGAMENTI</Text>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Imponibile</Text>
              <Text style={styles.financialValue}>{fmt(imponibile)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>IVA ({ivaRate}%)</Text>
              <Text style={styles.financialValue}>{fmt(iva)}</Text>
            </View>
            <View style={[styles.financialRow, { borderTop: `0.5pt solid ${C.gray200}`, paddingTop: 4, marginTop: 2 }]}>
              <Text style={styles.financialTotalLabel}>Totale con IVA</Text>
              <Text style={styles.financialTotal}>{fmt(totaleIva)}</Text>
            </View>

            {/* Installments */}
            {installments.length > 0 && (
              <View style={{ marginTop: 6, borderTop: `0.5pt solid ${C.gray200}`, paddingTop: 4 }}>
                <Text style={[styles.label, { marginBottom: 3 }]}>SCADENZIARIO</Text>
                {installments.map((inst: any, idx: number) => (
                  <View key={idx} style={[styles.financialRow, { marginBottom: 2 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <View style={{
                        width: 6, height: 6, borderRadius: 3,
                        backgroundColor: inst.is_paid ? C.green : C.red,
                      }} />
                      <Text style={[styles.financialLabel, { fontSize: 7 }]}>
                        {inst.label ?? `Rata ${idx + 1}`} — {fmtDate(inst.due_date ?? inst.expected_date)}
                      </Text>
                    </View>
                    <Text style={[styles.financialValue, { fontSize: 8, color: inst.is_paid ? C.green : C.gray900 }]}>
                      {fmt(inst.amount)}
                    </Text>
                  </View>
                ))}
                <View style={[styles.financialRow, { marginTop: 3, borderTop: `0.5pt solid ${C.gray200}`, paddingTop: 3 }]}>
                  <Text style={[styles.financialLabel, { fontFamily: "Helvetica-Bold", color: C.green }]}>Incassato</Text>
                  <Text style={[styles.financialValue, { color: C.green }]}>{fmt(incassato)}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Analisi Margine — solo per chi può vedere i margini */}
          {showMargins && (
          <View style={[styles.financialBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 6 }]}>ANALISI MARGINE</Text>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Ricavo vendita (netto)</Text>
              <Text style={styles.financialValue}>{fmt(imponibile)}</Text>
            </View>
            <View style={[styles.financialRow, { backgroundColor: C.redBg, padding: 3, borderRadius: 3, marginTop: 2 }]}>
              <Text style={[styles.financialLabel, { color: C.red }]}>Costo materiali</Text>
              <Text style={[styles.financialValue, { color: C.red }]}>- {fmt(costoMateriali)}</Text>
            </View>
            <View style={[styles.financialRow, { backgroundColor: C.redBg, padding: 3, borderRadius: 3, marginTop: 2 }]}>
              <Text style={[styles.financialLabel, { color: C.red }]}>Costo dipendenti</Text>
              <Text style={[styles.financialValue, { color: C.red }]}>- {fmt(costoEmployees)}</Text>
            </View>
            <View style={[styles.financialRow, { backgroundColor: C.redBg, padding: 3, borderRadius: 3, marginTop: 2 }]}>
              <Text style={[styles.financialLabel, { color: C.red }]}>Costo subappaltatori</Text>
              <Text style={[styles.financialValue, { color: C.red }]}>- {fmt(costoTeams)}</Text>
            </View>
            {totaleProvvigioni > 0 && (
              <View style={[styles.financialRow, { backgroundColor: C.redBg, padding: 3, borderRadius: 3, marginTop: 2 }]}>
                <Text style={[styles.financialLabel, { color: C.red }]}>Provvigioni</Text>
                <Text style={[styles.financialValue, { color: C.red }]}>- {fmt(totaleProvvigioni)}</Text>
              </View>
            )}
            <View style={[styles.financialRow, { borderTop: `1pt solid ${C.gray300}`, paddingTop: 6, marginTop: 4 }]}>
              <Text style={styles.financialTotalLabel}>Margine Lordo</Text>
              <Text style={[styles.financialTotal, { color: margine >= 0 ? C.green : C.red }]}>
                {fmt(margine - totaleProvvigioni)}
              </Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>% margine</Text>
              <Text style={[styles.financialValue, { color: margine >= 0 ? C.green : C.red }]}>
                {imponibile > 0 ? fmtPerc(((margine - totaleProvvigioni) / imponibile) * 100) : "0.0%"}
              </Text>
            </View>
          </View>
          )}
        </View>

        {/* ─── MANODOPERA DIPENDENTI ─── */}
        {showCosts && laborEmployees.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Dipendenti Assegnati ({laborEmployees.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 3 }]}>Dipendente</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Ore</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Costo/h</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Totale</Text>
              </View>
              {laborEmployees.map((emp: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const nome = emp.employee
                  ? `${emp.employee.first_name ?? ""} ${emp.employee.last_name ?? ""}`.trim()
                  : "—";
                return (
                  <View key={idx} style={rowStyle} wrap={false}>
                    <Text style={[styles.tableCell, { flex: 3, fontFamily: "Helvetica-Bold" }]}>{nome}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>{emp.hours_worked ?? 0}h</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{fmt(emp.hourly_rate)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                      {fmt(emp.total_cost)}
                    </Text>
                  </View>
                );
              })}
              <View style={[styles.tableRow, { backgroundColor: C.gray100, borderTop: `1pt solid ${C.gray300}` }]}>
                <Text style={[styles.tableCell, { flex: 3, fontFamily: "Helvetica-Bold" }]}>TOTALE DIPENDENTI</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: "center", fontFamily: "Helvetica-Bold" }]}>
                  {laborEmployees.reduce((s: number, e: any) => s + (e.hours_worked ?? 0), 0)}h
                </Text>
                <Text style={{ flex: 1 }} />
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold", color: C.navy }]}>
                  {fmt(costoEmployees)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ─── SUBAPPALTATORI ─── */}
        {showCosts && laborTeams.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Subappaltatori ({laborTeams.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 3 }]}>Subappaltatore</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Stato Pag.</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Totale</Text>
              </View>
              {laborTeams.map((team: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const nome = team.external_team?.name ?? "—";
                return (
                  <View key={idx} style={rowStyle} wrap={false}>
                    <Text style={[styles.tableCell, { flex: 3, fontFamily: "Helvetica-Bold" }]}>{nome}</Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={team.is_paid ? styles.badgeGreen : styles.badgeRed}>
                        {team.is_paid ? "Pagato" : "Da pagare"}
                      </Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                      {fmt(team.total_cost)}
                    </Text>
                  </View>
                );
              })}
              <View style={[styles.tableRow, { backgroundColor: C.gray100, borderTop: `1pt solid ${C.gray300}` }]}>
                <Text style={[styles.tableCell, { flex: 3, fontFamily: "Helvetica-Bold" }]}>TOTALE SUBAPPALTATORI</Text>
                <Text style={{ flex: 1 }} />
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold", color: C.navy }]}>
                  {fmt(costoTeams)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ─── PROVVIGIONI VENDITORI ─── */}
        {showMargins && salespeople.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Provvigioni Venditori ({salespeople.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>Commerciale</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Tipo</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Valore</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Importo</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Stato</Text>
              </View>
              {salespeople.map((sp: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const nome = sp.salesperson
                  ? `${sp.salesperson.first_name ?? ""} ${sp.salesperson.last_name ?? ""}`.trim()
                  : "—";
                const gross = sp.commission_type === "fixed"
                  ? sp.commission_value
                  : (sp.commission_type === "percentage_sold"
                    ? imponibile * (sp.commission_value / 100)
                    : (order?.collected_amount ?? 0) * (sp.commission_value / 100));
                const net = gross - (sp.deduction_amount ?? 0);
                return (
                  <View key={idx} style={rowStyle} wrap={false}>
                    <Text style={[styles.tableCell, { flex: 2.5, fontFamily: "Helvetica-Bold" }]}>{nome}</Text>
                    <Text style={[styles.tableCell, { flex: 1.5, fontSize: 7 }]}>{COMMISSION_TYPE[sp.commission_type] ?? sp.commission_type}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>
                      {sp.commission_type === "fixed" ? fmt(sp.commission_value) : `${sp.commission_value}%`}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{fmt(net)}</Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={sp.is_paid ? styles.badgeGreen : styles.badgeRed}>
                        {sp.is_paid ? `Pagata ${sp.paid_date ? fmtDate(sp.paid_date) : ""}` : "Da pagare"}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <View style={[styles.tableRow, { backgroundColor: C.gray100, borderTop: `1pt solid ${C.gray300}` }]}>
                <Text style={[styles.tableCell, { flex: 2.5, fontFamily: "Helvetica-Bold" }]}>TOTALE PROVVIGIONI</Text>
                <Text style={{ flex: 1.5 }} />
                <Text style={{ flex: 1 }} />
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold", color: C.navy }]}>{fmt(totaleProvvigioni)}</Text>
                <Text style={{ flex: 1 }} />
              </View>
            </View>
          </>
        )}

        {/* ─── ORDINI DI ACQUISTO ─── */}
        {showCosts && purchaseOrders.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Ordini di Acquisto ({purchaseOrders.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>N. OdA</Text>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>Fornitore</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Stato</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Totale</Text>
              </View>
              {purchaseOrders.map((po: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const statusBadge = po.status === "completed" ? styles.badgeGreen
                  : po.status === "sent" ? styles.badgeCyan
                  : po.status === "confirmed" ? styles.badgeOrange
                  : styles.badgeGray;
                const statusLabel = po.status === "completed" ? "Completato"
                  : po.status === "sent" ? "Inviato"
                  : po.status === "confirmed" ? "Confermato"
                  : po.status === "draft" ? "Bozza" : po.status ?? "—";
                return (
                  <View key={idx} style={rowStyle} wrap={false}>
                    <Text style={[styles.tableCell, { flex: 1.5, fontFamily: "Helvetica-Bold" }]}>{po.oda_number ?? "—"}</Text>
                    <Text style={[styles.tableCell, { flex: 2 }]}>{po.suppliers?.name ?? po.supplier_name ?? "—"}</Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={statusBadge}>{statusLabel}</Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{fmt(po.total)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ─── SAL ─── */}
        {salList.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>SAL — Avanzamento Lavori ({salList.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>N.</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Data</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Stato</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Avanzamento</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Importo</Text>
              </View>
              {salList.map((sal: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const statoLabel = sal.stato === "approvato" ? "Approvato" : sal.stato === "emesso" ? "Emesso" : "Bozza";
                const statoBadge = sal.stato === "approvato" ? styles.badgeGreen : sal.stato === "emesso" ? styles.badgeCyan : styles.badgeGray;
                return (
                  <View key={idx} style={rowStyle} wrap={false}>
                    <Text style={[styles.tableCell, { flex: 1, fontFamily: "Helvetica-Bold" }]}>SAL #{sal.numero_sal ?? idx + 1}</Text>
                    <Text style={[styles.tableCell, { flex: 1.5 }]}>{fmtDate(sal.data_emissione)}</Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={statoBadge}>{statoLabel}</Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>
                      {sal.percentuale_avanzamento != null ? `${sal.percentuale_avanzamento}%` : "—"}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                      {fmt(sal.importo_totale)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ─── PERSONALE CANTIERE ─── */}
        {campoAssignments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Personale Cantiere ({campoAssignments.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>Nome</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Ruolo</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Periodo</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Capocantiere</Text>
              </View>
              {campoAssignments.map((ca: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const nome = ca.user
                  ? `${ca.user.first_name ?? ""} ${ca.user.last_name ?? ""}`.trim()
                  : ca.subappaltatore?.nome ?? "—";
                const periodo = ca.data_inizio && ca.data_fine
                  ? `${fmtDate(ca.data_inizio)} - ${fmtDate(ca.data_fine)}`
                  : ca.data_inizio ? `Dal ${fmtDate(ca.data_inizio)}` : "—";
                return (
                  <View key={idx} style={rowStyle} wrap={false}>
                    <Text style={[styles.tableCell, { flex: 2.5, fontFamily: ca.is_capocantiere ? "Helvetica-Bold" : "Helvetica" }]}>{nome}</Text>
                    <Text style={[styles.tableCell, { flex: 1, fontSize: 7 }]}>{ca.ruolo ?? "Operaio"}</Text>
                    <Text style={[styles.tableCell, { flex: 1.5, fontSize: 7 }]}>{periodo}</Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      {ca.is_capocantiere ? (
                        <Text style={styles.badgeOrange}>Sì</Text>
                      ) : (
                        <Text style={styles.badgeGray}>No</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ─── GIORNALE LAVORI ─── */}
        {giornaleLavori.length > 0 && (
          <>
            <Text style={styles.sectionTitle} break>Giornale Lavori ({giornaleLavori.length} giornate)</Text>
            <View style={styles.sectionLine} />
            {giornaleLavori.map((g: any, idx: number) => (
              <View key={idx} style={[styles.infoBox, { marginBottom: 6 }]} wrap={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={[styles.value, { fontSize: 9 }]}>{fmtDate(g.data_lavori)}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {g.condizioni_meteo && (
                      <Text style={{ fontSize: 7, color: C.gray500 }}>{METEO_LABELS[g.condizioni_meteo] ?? g.condizioni_meteo}</Text>
                    )}
                    {g.temperatura != null && (
                      <Text style={{ fontSize: 7, color: C.gray500 }}>{g.temperatura}°C</Text>
                    )}
                    {g.personale_presente != null && (
                      <Text style={{ fontSize: 7, color: C.gray500 }}>{g.personale_presente} operai</Text>
                    )}
                    {g.avanzamento_percentuale != null && (
                      <View style={[styles.badgeOrange, { flexDirection: "row" }]}>
                        <Text style={{ fontSize: 7, color: C.orange }}>{g.avanzamento_percentuale}%</Text>
                      </View>
                    )}
                  </View>
                </View>
                {g.lavorazioni_eseguite && (
                  <Text style={{ fontSize: 8, color: C.gray700, lineHeight: 1.4 }}>{g.lavorazioni_eseguite}</Text>
                )}
                {g.giornale_foto && g.giornale_foto.length > 0 && (
                  <Text style={{ fontSize: 7, color: C.gray500, marginTop: 3 }}>
                    {g.giornale_foto.length} foto allegate
                  </Text>
                )}
                {g.firmato_da && (
                  <Text style={{ fontSize: 7, color: C.green, marginTop: 2 }}>
                    Firmato da {g.firmato_da} il {fmtDate(g.firmato_il)}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* ─── VARIANTI / ORDINI DI VARIAZIONE ─── */}
        {varianti.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Varianti ({varianti.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>Titolo</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Stato</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Impatto €</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Giorni</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Data</Text>
              </View>
              {varianti.map((v: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const statoStyle = v.status === "approvato" || v.stato === "approvata"
                  ? styles.badgeGreen
                  : v.status === "rifiutato" || v.stato === "rifiutata"
                    ? styles.badgeRed
                    : styles.badgeGray;
                const statoLabel = v.status === "approvato" || v.stato === "approvata" ? "Approvata"
                  : v.status === "rifiutato" || v.stato === "rifiutata" ? "Rifiutata"
                  : v.status === "in_attesa" || v.stato === "proposta" ? "In attesa" : v.status ?? v.stato ?? "—";
                return (
                  <View key={idx} style={rowStyle} wrap={false}>
                    <View style={{ flex: 2.5 }}>
                      <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>{v.titolo ?? v.numero_odv ?? "—"}</Text>
                      {v.descrizione && <Text style={{ fontSize: 6, color: C.gray500, maxLines: 2, textOverflow: "ellipsis" }}>{v.descrizione}</Text>}
                    </View>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={statoStyle}>{statoLabel}</Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold", color: (v.impatto_economico ?? v.importo ?? 0) >= 0 ? C.green : C.red }]}>
                      {fmt(v.impatto_economico ?? v.importo ?? 0)}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>
                      {v.impatto_giorni != null ? `${v.impatto_giorni > 0 ? "+" : ""}${v.impatto_giorni}gg` : "—"}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1, fontSize: 7 }]}>{fmtDate(v.richiesto_il ?? v.created_at)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ─── DIARIO COMMESSA (Eventi + Comunicazioni) ─── */}
        {(diaryEvents.length > 0 || diaryMessages.length > 0) && (
          <>
            <Text style={styles.sectionTitle} break>
              Diario Commessa ({diaryEvents.length + diaryMessages.length} registrazioni)
            </Text>
            <View style={styles.sectionLine} />

            {/* Merge events + messages, sort by date desc */}
            {(() => {
              const merged = [
                ...diaryEvents.map((e: any) => ({ type: "event" as const, date: e.created_at, data: e })),
                ...diaryMessages.map((m: any) => ({ type: "message" as const, date: m.created_at, data: m })),
              ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

              // Limit to last 50 entries for PDF size
              const limited = merged.slice(0, 50);

              return limited.map((entry, idx) => {
                if (entry.type === "event") {
                  const e = entry.data;
                  const label = EVENT_TYPE_LABELS[e.event_type] ?? e.event_type;
                  // Extract meaningful info from payload
                  let detail = "";
                  if (e.payload) {
                    if (e.event_type === "stato_cambiato" && e.payload.to_name) {
                      detail = `-> ${e.payload.to_name}`;
                    } else if (e.event_type === "articolo_aggiunto" && e.payload.name) {
                      detail = e.payload.name as string;
                    } else if (e.event_type === "acconto_ricevuto" && e.payload.amount) {
                      detail = fmt(e.payload.amount as number);
                    } else if (e.payload.description) {
                      detail = (e.payload.description as string).substring(0, 80);
                    }
                  }
                  return (
                    <View key={`e-${idx}`} style={{ flexDirection: "row", paddingVertical: 3, borderBottom: `0.5pt solid ${C.gray200}`, gap: 6 }} wrap={false}>
                      <Text style={{ fontSize: 7, color: C.gray500, width: 60 }}>{fmtDate(e.created_at)}</Text>
                      <View style={[styles.badgeCyan, { minWidth: 70 }]}>
                        <Text style={{ fontSize: 6, color: C.cyan, textAlign: "center" }}>{label}</Text>
                      </View>
                      <Text style={{ fontSize: 7, color: C.gray700, flex: 1 }}>{detail}</Text>
                      <Text style={{ fontSize: 7, color: C.gray500, width: 60, textAlign: "right" }}>{e.actor_name ?? "Sistema"}</Text>
                    </View>
                  );
                } else {
                  const m = entry.data;
                  const channelLabel = CHANNEL_LABELS[m.channel] ?? m.channel;
                  const dirIcon = m.direction === "out" ? "->" : "<-";
                  const statusColor = m.status === "delivered" || m.status === "read" ? C.green
                    : m.status === "failed" ? C.red : C.gray500;
                  return (
                    <View key={`m-${idx}`} style={{ flexDirection: "row", paddingVertical: 3, borderBottom: `0.5pt solid ${C.gray200}`, gap: 6 }} wrap={false}>
                      <Text style={{ fontSize: 7, color: C.gray500, width: 60 }}>{fmtDate(m.created_at)}</Text>
                      <View style={[styles.badgeOrange, { minWidth: 70 }]}>
                        <Text style={{ fontSize: 6, color: C.orange, textAlign: "center" }}>{dirIcon} {channelLabel}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        {m.subject && <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: C.gray900 }}>{m.subject}</Text>}
                        <Text style={{ fontSize: 7, color: C.gray700, maxLines: 2, textOverflow: "ellipsis" }}>{(m.body ?? "").substring(0, 120)}</Text>
                      </View>
                      <Text style={{ fontSize: 7, color: statusColor, width: 50, textAlign: "right" }}>
                        {m.status === "read" ? "Letto" : m.status === "delivered" ? "Consegnato" : m.status === "sent" ? "Inviato" : m.status === "failed" ? "Fallito" : "In attesa"}
                      </Text>
                    </View>
                  );
                }
              });
            })()}

            {diaryEvents.length + diaryMessages.length > 50 && (
              <Text style={{ fontSize: 7, color: C.gray500, marginTop: 4, textAlign: "center" }}>
                Mostrate le ultime 50 di {diaryEvents.length + diaryMessages.length} registrazioni
              </Text>
            )}
          </>
        )}

        {/* ─── NOTE INTERNE ─── */}
        {order?.internal_notes ? (
          <>
            <Text style={styles.sectionTitle}>Note Interne</Text>
            <View style={styles.sectionLine} />
            <View style={[styles.infoBox, { backgroundColor: C.amberBg }]}>
              <Text style={{ fontSize: 8, color: C.gray700, lineHeight: 1.5 }}>
                {order.internal_notes}
              </Text>
            </View>
          </>
        ) : null}

        {/* ─── FOOTER ─── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{companyName ?? "Edilizia in Cloud"} — Documento riservato</Text>
          <Text style={styles.footerText}>{orderCode} · {format(new Date(), "dd/MM/yyyy", { locale: it })}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `Pag. ${pageNumber} / ${totalPages}`
            }
          />
        </View>

      </Page>
    </Document>
  );
}
