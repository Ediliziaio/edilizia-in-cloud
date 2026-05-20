/**
 * ShipmentDDTPDF — template Documento di Trasporto (uscita) conforme DPR 472/96.
 *
 * Layout A4 verticale, palette coerente con OrdinePDF.tsx.
 * SENZA prezzi (DDT solo quantità — pattern standard per consegne cantiere /
 * trasferimenti / vendita con fatturazione differita).
 *
 * Blocchi (top → bottom):
 *  1. Header fisso: intestazione azienda mittente (ragione sociale, P.IVA, indirizzo)
 *  2. Titolo + numero + data (con dicitura DPR 472/96)
 *  3. 2 colonne: Destinatario | Indirizzo consegna (se diverso)
 *  4. Dettagli trasporto: causale, aspetto, colli, peso, porto, data/ora, mezzo
 *  5. Vettore: dati azienda (se trasporto interno) o subappaltatore
 *  6. Tabella righe articoli (cod, descrizione, UM, qty, lotto)
 *     - sotto righe serialized: lista seriali per garanzia/tracking
 *  7. Note
 *  8. Box firma digitale (se firmato elettronicamente)
 *  9. Riga firme cartacee destinatario + trasportatore
 * 10. Footer fisso: Pag X/Y + dicitura generato da piattaforma
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/* ── Palette (coerente OrdinePDF) ─────────────────────────────────────── */
const C = {
  navy: "#1E3A5F",
  orange: "#F97316",
  green: "#16a34a",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.gray900,
    backgroundColor: C.white,
    padding: 40,
    paddingBottom: 70,
  },

  // ── Header fisso (intestazione azienda) ─────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `2pt solid ${C.navy}`,
  },
  headerLeft: { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1 },
  logo: { width: 50, height: 50, objectFit: "contain" },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 2 },
  companyMeta: { fontSize: 8, color: C.gray700, lineHeight: 1.4 },
  headerRight: { alignItems: "flex-end" },

  // ── Document title block ─────────────────────────────────────────────
  docBlock: {
    backgroundColor: C.gray50,
    border: `0.5pt solid ${C.gray200}`,
    borderRadius: 4,
    padding: 12,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.navy },
  docNumber: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.orange },
  docMeta: { fontSize: 8, color: C.gray500, marginTop: 2 },
  docDisclaimer: { fontSize: 7, color: C.gray500, marginTop: 2, fontFamily: "Helvetica-Oblique" },

  // ── Two-column blocks ────────────────────────────────────────────────
  row2: { flexDirection: "row", gap: 10, marginBottom: 14 },
  col: { flex: 1 },
  sectionTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.gray500,
    textTransform: "uppercase" as const,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  infoBox: {
    backgroundColor: C.gray50,
    border: `0.5pt solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
    minHeight: 80,
  },
  infoName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.gray900, marginBottom: 4 },
  infoLine: { fontSize: 8, color: C.gray700, lineHeight: 1.4 },
  infoLabel: { fontSize: 7, color: C.gray500, marginTop: 4 },

  // ── Trasporto / Vettore blocks ───────────────────────────────────────
  trasportoBox: {
    backgroundColor: C.gray50,
    border: `0.5pt solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 12,
  },
  trasportoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  trasportoCell: { width: "32%", marginBottom: 4 },
  trasportoLabel: { fontSize: 7, color: C.gray500, textTransform: "uppercase" as const, marginBottom: 1 },
  trasportoValue: { fontSize: 9, color: C.gray900, fontFamily: "Helvetica-Bold" },
  vettoreBox: {
    backgroundColor: "#fff7ed",
    border: `0.5pt solid #fed7aa`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  vettoreType: { fontSize: 7, color: C.orange, textTransform: "uppercase" as const, marginBottom: 4, fontFamily: "Helvetica-Bold" },

  // ── Tabella righe ────────────────────────────────────────────────────
  table: {
    border: `0.5pt solid ${C.gray200}`,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.navy,
    padding: "6 8",
  },
  tableHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.white },
  tableRow: { flexDirection: "row", padding: "6 8", borderTop: `0.5pt solid ${C.gray200}` },
  tableRowAlt: {
    flexDirection: "row",
    padding: "6 8",
    borderTop: `0.5pt solid ${C.gray200}`,
    backgroundColor: C.gray50,
  },
  tableCell: { fontSize: 8, color: C.gray700 },
  cellNum: { width: "5%" },
  cellCode: { width: "15%", fontFamily: "Helvetica-Bold", color: C.gray900 },
  cellDesc: { width: "55%" },
  cellUm: { width: "10%", textAlign: "center" as const },
  cellQty: { width: "15%", textAlign: "right" as const, fontFamily: "Helvetica-Bold", color: C.gray900 },
  serialsRow: {
    padding: "4 8 6 8",
    backgroundColor: "#fafbff",
    borderTop: `0.25pt solid ${C.gray200}`,
  },
  serialsLabel: { fontSize: 6, color: C.gray500, textTransform: "uppercase" as const, marginBottom: 2, letterSpacing: 0.3 },
  serialsValue: { fontSize: 7, color: C.gray700, fontFamily: "Courier" },

  // ── Note ─────────────────────────────────────────────────────────────
  notesBox: {
    backgroundColor: C.gray50,
    border: `0.5pt solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  notesText: { fontSize: 8, color: C.gray700, lineHeight: 1.4 },

  // ── Firma digitale (opzionale) ───────────────────────────────────────
  digitalSignBox: {
    backgroundColor: "#ecfdf5",
    border: `0.5pt solid ${C.green}`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  digitalSignText: { fontSize: 8, color: C.green, fontFamily: "Helvetica-Bold" },
  digitalSignDetail: { fontSize: 7, color: C.gray700 },

  // ── Firme cartacee ──────────────────────────────────────────────────
  signRow: { flexDirection: "row", gap: 20, marginTop: 24 },
  signBox: { flex: 1, alignItems: "center" },
  signLine: {
    width: "100%",
    height: 0.5,
    backgroundColor: C.gray500,
    marginBottom: 4,
  },
  signLabel: { fontSize: 7, color: C.gray500, textTransform: "uppercase" as const, textAlign: "center" as const },
  signName: { fontSize: 8, color: C.gray700, textAlign: "center" as const, marginTop: 2 },

  // ── Footer fisso ─────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `0.5pt solid ${C.gray200}`,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: C.gray500 },
});

/* ── Tipi dati input ─────────────────────────────────────────────────── */

export interface DDTCompanyMittente {
  name: string;
  vat_number?: string | null;
  fiscal_code?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  phone?: string | null;
  email?: string | null;
  pec?: string | null;
  logo_url?: string | null;
}

export interface DDTDestinatario {
  ragione_sociale?: string | null;
  nome?: string | null;
  cognome?: string | null;
  vat_number?: string | null;
  fiscal_code?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  codice_destinatario_sdi?: string | null;
  pec?: string | null;
}

export interface DDTIndirizzoConsegna {
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  riferimento?: string | null; // es. "cantiere Via Roma 12 — Sig. Rossi"
}

export type DDTVettoreTipo = "azienda" | "subappaltatore" | "vettore_terzo";

export interface DDTVettore {
  tipo: DDTVettoreTipo;
  ragione_sociale?: string | null;
  vat_number?: string | null;
  address?: string | null;
  city?: string | null;
  conducente_nome?: string | null;
  conducente_telefono?: string | null;
  targa_mezzo?: string | null;
  patente?: string | null;
}

export interface DDTRiga {
  codice?: string | null;
  descrizione: string;
  unita_misura?: string | null;
  quantita: number;
  lotto?: string | null;
  seriali?: string[] | null; // se serialized, lista seriali (es. ["V02H10007653","..."])
}

export interface DDTFirmaDigitale {
  firmato: boolean;
  data?: string | null; // ISO timestamp
  firmatario_nome?: string | null;
  metodo?: string | null; // es. "FEA", "OTP", "PADES"
}

export interface ShipmentDDTPDFProps {
  numero: string;
  serie?: string | null;
  data_emissione: string;        // ISO date
  data_trasporto?: string | null; // ISO timestamp
  mittente: DDTCompanyMittente;
  destinatario: DDTDestinatario;
  indirizzo_consegna?: DDTIndirizzoConsegna | null;
  causale_trasporto?: string | null;
  aspetto_beni?: string | null;
  numero_colli?: number | null;
  peso?: string | null;
  porto?: "Franco" | "Assegnato" | null;
  mezzo_trasporto?: string | null;
  vettore: DDTVettore;
  righe: DDTRiga[];
  note?: string | null;
  firma_digitale?: DDTFirmaDigitale | null;
  platformName?: string; // default "Edilizia in Cloud"
}

/* ── Helpers di formattazione ────────────────────────────────────────── */

function fmtAddress(a: {
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
}): string[] {
  const lines: string[] = [];
  if (a.address) lines.push(a.address);
  const cityLine = [a.postal_code, a.city, a.province ? `(${a.province})` : null]
    .filter(Boolean)
    .join(" ");
  if (cityLine) lines.push(cityLine);
  return lines;
}

function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", { locale: it });
  } catch {
    return "—";
  }
}

function vettoreTitle(tipo: DDTVettoreTipo): string {
  switch (tipo) {
    case "azienda":
      return "Trasporto a cura del mittente";
    case "subappaltatore":
      return "Trasporto a cura del subappaltatore";
    case "vettore_terzo":
      return "Trasporto a cura del vettore";
  }
}

/* ── Componente PDF ──────────────────────────────────────────────────── */

export function ShipmentDDTPDF({
  numero,
  serie,
  data_emissione,
  data_trasporto,
  mittente,
  destinatario,
  indirizzo_consegna,
  causale_trasporto,
  aspetto_beni,
  numero_colli,
  peso,
  porto,
  mezzo_trasporto,
  vettore,
  righe,
  note,
  firma_digitale,
  platformName = "Edilizia in Cloud",
}: ShipmentDDTPDFProps) {
  const destinatarioName =
    destinatario.ragione_sociale ||
    [destinatario.nome, destinatario.cognome].filter(Boolean).join(" ") ||
    "—";

  const showIndirizzoConsegna = !!(
    indirizzo_consegna &&
    (indirizzo_consegna.address || indirizzo_consegna.city || indirizzo_consegna.riferimento)
  );

  const mittenteAddr = fmtAddress(mittente);

  return (
    <Document
      title={`DDT ${numero}`}
      author={mittente.name}
      subject={`Documento di Trasporto ${numero}`}
    >
      <Page size="A4" style={styles.page} wrap>
        {/* HEADER FISSO — intestazione azienda mittente */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {mittente.logo_url ? <Image src={mittente.logo_url} style={styles.logo} /> : null}
            <View>
              <Text style={styles.companyName}>{mittente.name}</Text>
              {mittenteAddr.map((l, i) => (
                <Text key={i} style={styles.companyMeta}>
                  {l}
                </Text>
              ))}
              <Text style={styles.companyMeta}>
                {[
                  mittente.vat_number ? `P.IVA ${mittente.vat_number}` : null,
                  mittente.fiscal_code && mittente.fiscal_code !== mittente.vat_number
                    ? `CF ${mittente.fiscal_code}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={styles.companyMeta}>
                {[
                  mittente.phone ? `Tel ${mittente.phone}` : null,
                  mittente.email,
                  mittente.pec ? `PEC ${mittente.pec}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </View>
        </View>

        {/* TITOLO DOCUMENTO */}
        <View style={styles.docBlock}>
          <View>
            <Text style={styles.docTitle}>Documento di Trasporto</Text>
            <Text style={styles.docDisclaimer}>D.P.R. 472/1996</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.docNumber}>
              N° {numero}
              {serie ? ` · Serie ${serie}` : ""}
            </Text>
            <Text style={styles.docMeta}>Data: {fmtDate(data_emissione)}</Text>
          </View>
        </View>

        {/* DUE COLONNE — Destinatario + Indirizzo consegna */}
        <View style={styles.row2}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Destinatario</Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoName}>{destinatarioName}</Text>
              {fmtAddress(destinatario).map((l, i) => (
                <Text key={i} style={styles.infoLine}>
                  {l}
                </Text>
              ))}
              {destinatario.vat_number ? (
                <Text style={styles.infoLine}>P.IVA {destinatario.vat_number}</Text>
              ) : null}
              {destinatario.fiscal_code && destinatario.fiscal_code !== destinatario.vat_number ? (
                <Text style={styles.infoLine}>CF {destinatario.fiscal_code}</Text>
              ) : null}
              {destinatario.codice_destinatario_sdi ? (
                <Text style={styles.infoLine}>
                  Cod. dest. SDI: {destinatario.codice_destinatario_sdi}
                </Text>
              ) : null}
              {destinatario.pec ? <Text style={styles.infoLine}>PEC: {destinatario.pec}</Text> : null}
            </View>
          </View>

          <View style={styles.col}>
            <Text style={styles.sectionTitle}>
              Indirizzo consegna {showIndirizzoConsegna ? "" : "(stesso destinatario)"}
            </Text>
            <View style={styles.infoBox}>
              {showIndirizzoConsegna ? (
                <>
                  {indirizzo_consegna!.riferimento ? (
                    <Text style={styles.infoName}>{indirizzo_consegna!.riferimento}</Text>
                  ) : null}
                  {fmtAddress(indirizzo_consegna!).map((l, i) => (
                    <Text key={i} style={styles.infoLine}>
                      {l}
                    </Text>
                  ))}
                </>
              ) : (
                <Text style={styles.infoLine}>
                  La merce è consegnata all'indirizzo del destinatario.
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* DETTAGLI TRASPORTO */}
        <Text style={styles.sectionTitle}>Dettagli trasporto</Text>
        <View style={styles.trasportoBox}>
          <View style={styles.trasportoGrid}>
            <View style={styles.trasportoCell}>
              <Text style={styles.trasportoLabel}>Causale</Text>
              <Text style={styles.trasportoValue}>{causale_trasporto || "Vendita"}</Text>
            </View>
            <View style={styles.trasportoCell}>
              <Text style={styles.trasportoLabel}>Aspetto beni</Text>
              <Text style={styles.trasportoValue}>{aspetto_beni || "—"}</Text>
            </View>
            <View style={styles.trasportoCell}>
              <Text style={styles.trasportoLabel}>N° colli</Text>
              <Text style={styles.trasportoValue}>{numero_colli != null ? String(numero_colli) : "—"}</Text>
            </View>
            <View style={styles.trasportoCell}>
              <Text style={styles.trasportoLabel}>Peso</Text>
              <Text style={styles.trasportoValue}>{peso || "—"}</Text>
            </View>
            <View style={styles.trasportoCell}>
              <Text style={styles.trasportoLabel}>Porto</Text>
              <Text style={styles.trasportoValue}>{porto || "Franco"}</Text>
            </View>
            <View style={styles.trasportoCell}>
              <Text style={styles.trasportoLabel}>Data/ora trasporto</Text>
              <Text style={styles.trasportoValue}>{fmtDate(data_trasporto, true)}</Text>
            </View>
            {mezzo_trasporto ? (
              <View style={[styles.trasportoCell, { width: "65%" }]}>
                <Text style={styles.trasportoLabel}>Mezzo / Targa</Text>
                <Text style={styles.trasportoValue}>{mezzo_trasporto}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* VETTORE */}
        <View style={styles.vettoreBox}>
          <Text style={styles.vettoreType}>{vettoreTitle(vettore.tipo)}</Text>
          {vettore.tipo === "azienda" ? (
            <View>
              <Text style={styles.infoName}>{mittente.name}</Text>
              {mittenteAddr.map((l, i) => (
                <Text key={i} style={styles.infoLine}>
                  {l}
                </Text>
              ))}
              {mittente.vat_number ? (
                <Text style={styles.infoLine}>P.IVA {mittente.vat_number}</Text>
              ) : null}
              {vettore.conducente_nome ? (
                <Text style={[styles.infoLine, { marginTop: 4 }]}>
                  Conducente: {vettore.conducente_nome}
                  {vettore.conducente_telefono ? ` · Tel ${vettore.conducente_telefono}` : ""}
                  {vettore.patente ? ` · Patente ${vettore.patente}` : ""}
                </Text>
              ) : null}
              {vettore.targa_mezzo ? (
                <Text style={styles.infoLine}>Mezzo: {vettore.targa_mezzo}</Text>
              ) : null}
            </View>
          ) : (
            <View>
              <Text style={styles.infoName}>{vettore.ragione_sociale || "—"}</Text>
              {vettore.address ? <Text style={styles.infoLine}>{vettore.address}</Text> : null}
              {vettore.city ? <Text style={styles.infoLine}>{vettore.city}</Text> : null}
              {vettore.vat_number ? (
                <Text style={styles.infoLine}>P.IVA {vettore.vat_number}</Text>
              ) : null}
              {vettore.conducente_nome ? (
                <Text style={[styles.infoLine, { marginTop: 4 }]}>
                  Conducente: {vettore.conducente_nome}
                  {vettore.conducente_telefono ? ` · Tel ${vettore.conducente_telefono}` : ""}
                  {vettore.patente ? ` · Patente ${vettore.patente}` : ""}
                </Text>
              ) : null}
              {vettore.targa_mezzo ? (
                <Text style={styles.infoLine}>Mezzo / Targa: {vettore.targa_mezzo}</Text>
              ) : null}
            </View>
          )}
        </View>

        {/* TABELLA RIGHE (SENZA prezzi) */}
        <Text style={styles.sectionTitle}>Articoli trasportati</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.cellNum]}>#</Text>
            <Text style={[styles.tableHeaderText, styles.cellCode]}>Codice</Text>
            <Text style={[styles.tableHeaderText, styles.cellDesc]}>Descrizione</Text>
            <Text style={[styles.tableHeaderText, styles.cellUm]}>U.M.</Text>
            <Text style={[styles.tableHeaderText, styles.cellQty]}>Q.tà</Text>
          </View>
          {righe.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: "100%", color: C.gray500, fontStyle: "italic" }]}>
                Nessuna riga
              </Text>
            </View>
          ) : (
            righe.map((r, idx) => (
              <React.Fragment key={`${r.codice ?? "row"}-${idx}`}>
                <View style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt} wrap={false}>
                  <Text style={[styles.tableCell, styles.cellNum]}>{idx + 1}</Text>
                  <Text style={[styles.tableCell, styles.cellCode]}>{r.codice || "—"}</Text>
                  <View style={styles.cellDesc}>
                    <Text style={styles.tableCell}>{r.descrizione}</Text>
                    {r.lotto ? (
                      <Text style={[styles.tableCell, { color: C.gray500, fontSize: 7 }]}>
                        Lotto: {r.lotto}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.tableCell, styles.cellUm]}>{r.unita_misura || "pz"}</Text>
                  <Text style={[styles.tableCell, styles.cellQty]}>{r.quantita}</Text>
                </View>
                {/* Seriali sotto la riga (per garanzia individuale) */}
                {r.seriali && r.seriali.length > 0 ? (
                  <View style={styles.serialsRow} wrap={false}>
                    <Text style={styles.serialsLabel}>Seriali ({r.seriali.length})</Text>
                    <Text style={styles.serialsValue}>{r.seriali.join("  ·  ")}</Text>
                  </View>
                ) : null}
              </React.Fragment>
            ))
          )}
        </View>

        {/* NOTE */}
        {note ? (
          <>
            <Text style={styles.sectionTitle}>Note</Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesText}>{note}</Text>
            </View>
          </>
        ) : null}

        {/* FIRMA DIGITALE (opzionale) */}
        {firma_digitale?.firmato ? (
          <View style={styles.digitalSignBox}>
            <View>
              <Text style={styles.digitalSignText}>
                Documento firmato elettronicamente
              </Text>
              <Text style={styles.digitalSignDetail}>
                {[
                  firma_digitale.firmatario_nome ? `da ${firma_digitale.firmatario_nome}` : null,
                  firma_digitale.data ? `il ${fmtDate(firma_digitale.data, true)}` : null,
                  firma_digitale.metodo ? `(${firma_digitale.metodo})` : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </Text>
            </View>
          </View>
        ) : null}

        {/* FIRME CARTACEE */}
        <View style={styles.signRow} wrap={false}>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Firma destinatario</Text>
            <Text style={styles.signName}>{destinatarioName}</Text>
          </View>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Firma trasportatore</Text>
            <Text style={styles.signName}>
              {vettore.conducente_nome || vettore.ragione_sociale || mittente.name}
            </Text>
          </View>
        </View>

        {/* FOOTER FISSO */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            DDT {numero} · {mittente.name}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`}
          />
          <Text style={styles.footerText}>Generato da {platformName}</Text>
        </View>
      </Page>
    </Document>
  );
}
