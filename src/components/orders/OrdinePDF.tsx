import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    padding: 40,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: "1.5pt solid #1E3A5F",
  },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#1E3A5F" },
  orderCode: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#F97316", textAlign: "right" },
  orderDate: { fontSize: 9, color: "#6b7280", textAlign: "right" },

  // Section
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1E3A5F", marginBottom: 8, marginTop: 16 },
  sectionLine: { height: 1, backgroundColor: "#e5e7eb", marginBottom: 10 },

  // Grid 2col
  row2: { flexDirection: "row", gap: 12, marginBottom: 12 },
  col: { flex: 1 },

  // Info box
  infoBox: { backgroundColor: "#f9fafb", borderRadius: 4, padding: 10, border: "0.5pt solid #e5e7eb" },
  label: { fontSize: 8, color: "#9ca3af", marginBottom: 2 },
  value: { fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" },
  valueNormal: { fontSize: 9, color: "#374151" },

  // Table
  table: { border: "0.5pt solid #e5e7eb", borderRadius: 4, overflow: "hidden" },
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", padding: "6 8" },
  tableRow: { flexDirection: "row", padding: "6 8", borderTop: "0.5pt solid #f0f0f0" },
  tableRowAlt: { flexDirection: "row", padding: "6 8", borderTop: "0.5pt solid #f0f0f0", backgroundColor: "#fafafa" },
  tableHeaderText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b7280" },
  tableCell: { fontSize: 9, color: "#374151" },

  // Badge
  badgeGreen: { backgroundColor: "#dcfce7", color: "#16a34a", fontSize: 7, padding: "2 5", borderRadius: 10 },
  badgeGray: { backgroundColor: "#f3f4f6", color: "#6b7280", fontSize: 7, padding: "2 5", borderRadius: 10 },

  // Financial
  financialBox: { backgroundColor: "#f9fafb", borderRadius: 6, padding: 12, border: "0.5pt solid #e5e7eb" },
  financialRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  financialLabel: { fontSize: 9, color: "#6b7280" },
  financialValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111827" },
  financialTotal: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#F97316" },
  financialTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1E3A5F" },

  // Footer
  footer: {
    position: "absolute", bottom: 30, left: 40, right: 40,
    flexDirection: "row", justifyContent: "space-between",
    borderTop: "0.5pt solid #e5e7eb", paddingTop: 8,
  },
  footerText: { fontSize: 7, color: "#9ca3af" },
});

const fmt = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "Non impostata";
  try { return format(new Date(d), "dd/MM/yyyy", { locale: it }); }
  catch { return d; }
};

export interface OrdinePDFProps {
  order: any;
  items?: any[];
  laborEmployees?: any[];
  laborTeams?: any[];
  salList?: any[];
  purchaseOrders?: any[];
  companyName?: string;
  statuses?: any[];
}

export function OrdinePDF({
  order,
  items = [],
  laborEmployees = [],
  laborTeams = [],
  salList = [],
  companyName,
  statuses = [],
}: OrdinePDFProps) {
  // Compute financials
  const imponibile = order?.total_amount ?? 0;
  const ivaRate = order?.vat_rate ?? 22;
  const iva = imponibile * (ivaRate / 100);
  const totaleIva = imponibile + iva;
  const depositAmount = order?.deposit_amount ?? 0;
  const deposit2Amount = order?.deposit_2_amount ?? 0;
  const balanceAmount = order?.balance_amount ?? 0;
  const financingAmount = order?.financing_amount ?? 0;

  const costoMateriali = items.reduce((s: number, i: any) => s + ((i.purchase_price ?? 0) * (i.quantity ?? 1)), 0);
  const costoEmployees = laborEmployees.reduce((s: number, e: any) => s + (e.total_cost ?? 0), 0);
  const costoTeams = laborTeams.reduce((s: number, t: any) => s + (t.total_cost ?? 0), 0);
  const costoManodopera = costoEmployees + costoTeams;
  const costoTotale = costoMateriali + costoManodopera;
  const margine = imponibile - costoTotale;
  const marginePerc = imponibile > 0 ? ((margine / imponibile) * 100).toFixed(1) : "0.0";

  const nomeCliente = order?.customer
    ? `${order.customer.first_name ?? ""} ${order.customer.last_name ?? ""}`.trim()
    : "—";
  const emailCliente = order?.customer?.email ?? null;
  const telCliente = order?.customer?.phone ?? null;
  const indirizzoCliente = order?.customer?.address ?? null;

  // Current status name
  const currentStatus = statuses.find((s: any) => s.id === order?.current_status_id);
  const currentStatusName = currentStatus?.name ?? "—";

  const orderCode = order?.order_code ?? "ORD";
  const printDate = format(new Date(), "dd/MM/yyyy HH:mm", { locale: it });

  return (
    <Document title={`Ordine ${orderCode}`} author={companyName ?? "Edilizia in Cloud"}>
      <Page size="A4" style={styles.page}>

        {/* ─── HEADER ─── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{companyName ?? "Edilizia in Cloud"}</Text>
            <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 4 }}>Scheda Ordine Dettagliata</Text>
          </View>
          <View>
            <Text style={styles.orderCode}>{orderCode}</Text>
            <Text style={styles.orderDate}>Creato il {fmtDate(order?.created_at)}</Text>
            <Text style={[styles.orderDate, { marginTop: 2 }]}>Stampato il {printDate}</Text>
          </View>
        </View>

        {/* ─── TITOLO ORDINE ─── */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: "#111827" }}>
            {order?.description ?? "Ordine senza descrizione"}
          </Text>
        </View>

        {/* ─── INFORMAZIONI GENERALI ─── */}
        <Text style={styles.sectionTitle}>Informazioni Generali</Text>
        <View style={styles.sectionLine} />
        <View style={styles.row2}>
          {/* Cliente */}
          <View style={[styles.infoBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 6 }]}>CLIENTE</Text>
            <Text style={[styles.value, { fontSize: 11, marginBottom: 4 }]}>{nomeCliente}</Text>
            {emailCliente ? <Text style={styles.valueNormal}>{emailCliente}</Text> : null}
            {telCliente ? <Text style={styles.valueNormal}>{telCliente}</Text> : null}
            {indirizzoCliente ? (
              <Text style={[styles.valueNormal, { marginTop: 4, color: "#6b7280" }]}>{indirizzoCliente}</Text>
            ) : null}
          </View>
          {/* Dettagli Ordine */}
          <View style={[styles.infoBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 6 }]}>DETTAGLI ORDINE</Text>
            <View style={styles.financialRow}>
              <Text style={styles.label}>Stato corrente</Text>
              <Text style={styles.value}>{currentStatusName}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.label}>Data posa prevista</Text>
              <Text style={styles.valueNormal}>{fmtDate(order?.expected_date)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.label}>Arrivo merce</Text>
              <Text style={styles.valueNormal}>{fmtDate(order?.warehouse_arrival_date)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.label}>Inizio lavori</Text>
              <Text style={styles.valueNormal}>{fmtDate(order?.work_start_date)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.label}>Fine lavori</Text>
              <Text style={styles.valueNormal}>{fmtDate(order?.work_end_date)}</Text>
            </View>
          </View>
        </View>

        {/* ─── ARTICOLI ─── */}
        {items.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Articoli dell'Ordine ({items.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 3 }]}>Descrizione</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Qty</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Costo Acq.</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Totale</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Stato</Text>
              </View>
              {items.map((item: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const qty = item.quantity ?? 1;
                const price = item.purchase_price ?? 0;
                const total = qty * price;
                const statusMap: Record<string, string> = {
                  da_ordinare: "Da ordinare",
                  ordinato: "Ordinato",
                  in_magazzino: "In magazzino",
                  installato: "Installato",
                };
                const statusLabel = statusMap[item.status] ?? item.status ?? "—";
                const isInstalled = item.status === "installato";
                return (
                  <View key={idx} style={rowStyle}>
                    <View style={{ flex: 3 }}>
                      <Text style={styles.tableCell}>{item.name ?? "—"}</Text>
                      {item.description ? (
                        <Text style={{ fontSize: 7, color: "#9ca3af" }}>{item.description}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>{qty}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{fmt(price)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                      {fmt(total)}
                    </Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={isInstalled ? styles.badgeGreen : styles.badgeGray}>{statusLabel}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ─── RIEPILOGO ECONOMICO ─── */}
        <Text style={styles.sectionTitle}>Riepilogo Economico</Text>
        <View style={styles.sectionLine} />
        <View style={styles.row2}>
          {/* Importi */}
          <View style={[styles.financialBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 8 }]}>DETTAGLIO IMPORTI</Text>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Imponibile</Text>
              <Text style={styles.financialValue}>{fmt(imponibile)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>IVA ({ivaRate}%)</Text>
              <Text style={styles.financialValue}>{fmt(iva)}</Text>
            </View>
            <View style={[styles.financialRow, { borderTop: "0.5pt solid #e5e7eb", paddingTop: 6, marginTop: 4 }]}>
              <Text style={styles.financialTotalLabel}>Totale con IVA</Text>
              <Text style={styles.financialTotal}>{fmt(totaleIva)}</Text>
            </View>
            {depositAmount > 0 ? (
              <View style={styles.financialRow}>
                <Text style={[styles.financialLabel, { color: "#16a34a" }]}>
                  Acconto{order?.deposit_paid ? " (pagato)" : ""}
                </Text>
                <Text style={[styles.financialValue, { color: "#16a34a" }]}>{fmt(depositAmount)}</Text>
              </View>
            ) : null}
            {deposit2Amount > 0 ? (
              <View style={styles.financialRow}>
                <Text style={[styles.financialLabel, { color: "#16a34a" }]}>
                  2° Acconto{order?.deposit_2_paid ? " (pagato)" : ""}
                </Text>
                <Text style={[styles.financialValue, { color: "#16a34a" }]}>{fmt(deposit2Amount)}</Text>
              </View>
            ) : null}
            {financingAmount > 0 ? (
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Finanziamento</Text>
                <Text style={styles.financialValue}>{fmt(financingAmount)}</Text>
              </View>
            ) : null}
            {balanceAmount > 0 ? (
              <View style={styles.financialRow}>
                <Text style={[styles.financialLabel, { fontFamily: "Helvetica-Bold" }]}>
                  Saldo{order?.balance_paid ? " (pagato)" : ""}
                </Text>
                <Text style={[styles.financialValue, { color: "#F97316" }]}>{fmt(balanceAmount)}</Text>
              </View>
            ) : null}
          </View>
          {/* Margine */}
          <View style={[styles.financialBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 8 }]}>ANALISI MARGINE</Text>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Costo materiali</Text>
              <Text style={styles.financialValue}>{fmt(costoMateriali)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Costo dipendenti</Text>
              <Text style={styles.financialValue}>{fmt(costoEmployees)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Costo squadre esterne</Text>
              <Text style={styles.financialValue}>{fmt(costoTeams)}</Text>
            </View>
            <View style={[styles.financialRow, { borderTop: "0.5pt solid #e5e7eb", paddingTop: 6, marginTop: 4 }]}>
              <Text style={styles.financialTotalLabel}>Margine lordo</Text>
              <Text style={[styles.financialTotal, { color: margine >= 0 ? "#16a34a" : "#dc2626" }]}>
                {fmt(margine)}
              </Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>% margine</Text>
              <Text style={[styles.financialValue, { color: margine >= 0 ? "#16a34a" : "#dc2626" }]}>
                {marginePerc}%
              </Text>
            </View>
          </View>
        </View>

        {/* ─── MANODOPERA DIPENDENTI ─── */}
        {laborEmployees.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Dipendenti Assegnati</Text>
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
                  <View key={idx} style={rowStyle}>
                    <Text style={[styles.tableCell, { flex: 3 }]}>{nome}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>{emp.hours_worked ?? 0}h</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right" }]}>{fmt(emp.hourly_rate)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                      {fmt(emp.total_cost)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ─── SQUADRE ESTERNE ─── */}
        {laborTeams.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Squadre Esterne</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 3 }]}>Squadra</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Stato Pag.</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Totale</Text>
              </View>
              {laborTeams.map((team: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const nome = team.external_team?.name ?? "—";
                return (
                  <View key={idx} style={rowStyle}>
                    <Text style={[styles.tableCell, { flex: 3 }]}>{nome}</Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={team.is_paid ? styles.badgeGreen : styles.badgeGray}>
                        {team.is_paid ? "Pagato" : "Da pagare"}
                      </Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                      {fmt(team.total_cost)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ─── SAL ─── */}
        {salList.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>SAL — Avanzamento Lavori ({salList.length})</Text>
            <View style={styles.sectionLine} />
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>N.</Text>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Data</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "center" }]}>Stato</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>Importo</Text>
              </View>
              {salList.map((sal: any, idx: number) => {
                const rowStyle = idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt;
                const statoLabel = sal.stato === "approvato" ? "Approvato" : sal.stato === "emesso" ? "Emesso" : "Bozza";
                return (
                  <View key={idx} style={rowStyle}>
                    <Text style={[styles.tableCell, { flex: 1 }]}>SAL #{sal.numero_sal ?? idx + 1}</Text>
                    <Text style={[styles.tableCell, { flex: 1 }]}>{fmtDate(sal.data_emissione)}</Text>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <Text style={sal.stato === "approvato" ? styles.badgeGreen : styles.badgeGray}>
                        {statoLabel}
                      </Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                      {fmt(sal.importo_totale)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ─── NOTE INTERNE ─── */}
        {order?.internal_notes ? (
          <>
            <Text style={styles.sectionTitle}>Note Interne</Text>
            <View style={styles.sectionLine} />
            <View style={[styles.infoBox, { backgroundColor: "#fffbeb" }]}>
              <Text style={{ fontSize: 9, color: "#374151", lineHeight: 1.5 }}>
                {order.internal_notes}
              </Text>
            </View>
          </>
        ) : null}

        {/* ─── FOOTER ─── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{companyName ?? "Edilizia in Cloud"} — Documento riservato</Text>
          <Text style={styles.footerText}>{orderCode} · Stampato il {format(new Date(), "dd/MM/yyyy", { locale: it })}</Text>
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
