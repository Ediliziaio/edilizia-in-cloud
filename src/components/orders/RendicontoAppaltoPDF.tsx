/**
 * RendicontoAppaltoPDF — il rendiconto che il committente riceve.
 * ────────────────────────────────────────────────────────────────────────────
 * È il documento su cui si discute: se non torna, si guarda questa carta. Per
 * questo il dettaglio è raggruppato **per cantiere** — la prima domanda di chi
 * ha più lavori aperti con te è «questa giornata su quale cantiere l'hai
 * fatta?» — e ogni riga porta la sua data, la quantità, il prezzo concordato e
 * l'importo. Il margine e i costi interni non ci sono: non sono affari suoi.
 *
 * Layout A4 verticale, palette coerente con OrdinePDF e ShipmentDDTPDF.
 *
 *  1. Header fisso: intestazione azienda
 *  2. Titolo: Rendiconto n. X, periodo, stato
 *  3. Due colonne: committente | contratto e riferimento
 *  4. Un blocco per cantiere: righe + subtotale del cantiere
 *  5. Totali: totale, ritenuta, netto
 *  6. Note e riga firme (il committente lo firma per accettazione)
 *  7. Footer fisso: Pag X/Y
 *
 * Fase 5 del Modulo Appaltatori (28/10/2026) — vedi docs/piano-commessa-appalto.md.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { CantiereDelRendiconto } from "@/lib/appalto/fattura";

const C = {
  navy: "#1E3A5F",
  orange: "#F97316",
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
    minHeight: 70,
  },
  infoName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.gray900, marginBottom: 4 },
  infoLine: { fontSize: 8, color: C.gray700, lineHeight: 1.4 },

  /* Un cantiere */
  cantiere: { marginBottom: 12 },
  cantiereHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.navy,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  cantiereNome: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.white },
  cantiereDesc: { fontSize: 7, color: "#cbd5e1" },

  thead: {
    flexDirection: "row",
    backgroundColor: C.gray100,
    borderBottom: `0.5pt solid ${C.gray200}`,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tr: {
    flexDirection: "row",
    borderBottom: `0.25pt solid ${C.gray200}`,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.gray500, textTransform: "uppercase" as const },
  td: { fontSize: 8, color: C.gray900 },
  cData: { width: "11%" },
  cDesc: { width: "41%", paddingRight: 4 },
  cUm: { width: "12%" },
  cQta: { width: "10%", textAlign: "right" as const },
  cPrezzo: { width: "13%", textAlign: "right" as const },
  cImporto: { width: "13%", textAlign: "right" as const },

  subtotale: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: C.gray50,
  },
  subtotaleLabel: { fontSize: 8, color: C.gray500 },
  subtotaleValore: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.gray900 },

  extra: { fontSize: 7, color: C.orange, fontFamily: "Helvetica-Bold" },

  /* Totali */
  totali: {
    marginTop: 6,
    alignSelf: "flex-end",
    width: "55%",
    border: `0.5pt solid ${C.gray200}`,
    borderRadius: 4,
    overflow: "hidden",
  },
  totaleRiga: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottom: `0.25pt solid ${C.gray200}`,
  },
  totaleNetto: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: C.navy,
  },
  totaleLabel: { fontSize: 9, color: C.gray700 },
  totaleValore: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.gray900 },
  nettoLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.white },
  nettoValore: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.white },

  note: {
    marginTop: 14,
    backgroundColor: C.gray50,
    border: `0.5pt solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
  },
  noteTesto: { fontSize: 8, color: C.gray700, lineHeight: 1.4 },

  firme: { flexDirection: "row", gap: 24, marginTop: 24 },
  firma: { flex: 1 },
  firmaLinea: { borderTop: `0.5pt solid ${C.gray500}`, marginTop: 28, paddingTop: 3 },
  firmaLabel: { fontSize: 7, color: C.gray500 },

  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `0.5pt solid ${C.gray200}`,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: C.gray500 },
});

/* ── Props ──────────────────────────────────────────────────────────── */

export interface RendicontoAzienda {
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

export interface RendicontoCommittente {
  ragione_sociale: string;
  vat_number?: string | null;
  fiscal_code?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
}

export interface RendicontoAppaltoPDFProps {
  numero: number;
  periodoDal: string;
  periodoAl: string;
  statoEtichetta: string;
  azienda: RendicontoAzienda;
  committente: RendicontoCommittente;
  contrattoNome?: string | null;
  riferimentoCommittente?: string | null;
  cantieri: ReadonlyArray<CantiereDelRendiconto>;
  totale: number;
  ritenutaPct: number;
  ritenuta: number;
  netto: number;
  note?: string | null;
  platformName?: string;
}

/* ── Formattazione ──────────────────────────────────────────────────── */

/**
 * L'unita' di misura come si legge, non come sta nel database.
 *
 * Sulla carta che riceve il committente usciva «uomo_giorno» e «corpo»: le
 * sigle della tabella. In tutto il resto dell'app sono «uomo/giorno» e «a
 * corpo».
 */
const etichettaUnita = (v: string): string => ({
  ora: "ora", giornata: "giornata", uomo_giorno: "uomo/giorno", viaggio: "viaggio",
  km: "km", mq: "m²", ml: "m", mc: "m³", kg: "kg", cad: "cad", corpo: "a corpo",
}[v] ?? v);

const giornoIT = (iso: string): string => {
  const [a, m, g] = iso.split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

/**
 * `useGrouping: "always"` non e' un vezzo: senza, in questo ambiente il
 * separatore delle migliaia non viene scritto e sul documento del committente
 * compare «€ 5885,00». Lo stesso accorgimento sta in `euro()`.
 */
const soldi = (n: number): string =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always" as unknown as boolean,
  }).format(Number.isFinite(Number(n)) ? Number(n) : 0);

/** Le quantità non sono soldi: 3 giornate si scrivono «3», non «3,00». */
const quantita = (n: number): string =>
  new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: "always" as unknown as boolean,
  }).format(Number.isFinite(Number(n)) ? Number(n) : 0);

const indirizzo = (a: {
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
}): string[] => {
  const lines: string[] = [];
  if (a.address) lines.push(a.address);
  const r = [a.postal_code, a.city, a.province ? `(${a.province})` : null].filter(Boolean).join(" ");
  if (r) lines.push(r);
  return lines;
};

/* ── Il documento ───────────────────────────────────────────────────── */

export function RendicontoAppaltoPDF({
  numero,
  periodoDal,
  periodoAl,
  statoEtichetta,
  azienda,
  committente,
  contrattoNome,
  riferimentoCommittente,
  cantieri,
  totale,
  ritenutaPct,
  ritenuta,
  netto,
  note,
  platformName = "Edilizia in Cloud",
}: RendicontoAppaltoPDFProps) {
  const righeTotali = cantieri.reduce((s, c) => s + c.righe.length, 0);

  return (
    <Document
      title={`Rendiconto ${numero} — ${committente.ragione_sociale}`}
      author={azienda.name}
      subject={`Rendiconto n. ${numero} dal ${giornoIT(periodoDal)} al ${giornoIT(periodoAl)}`}
    >
      <Page size="A4" style={styles.page} wrap>
        {/* 1. Intestazione azienda */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {azienda.logo_url ? <Image src={azienda.logo_url} style={styles.logo} /> : null}
            <View>
              <Text style={styles.companyName}>{azienda.name}</Text>
              {indirizzo(azienda).map((l, i) => (
                <Text key={i} style={styles.companyMeta}>
                  {l}
                </Text>
              ))}
              <Text style={styles.companyMeta}>
                {[
                  azienda.vat_number ? `P.IVA ${azienda.vat_number}` : null,
                  azienda.fiscal_code && azienda.fiscal_code !== azienda.vat_number
                    ? `CF ${azienda.fiscal_code}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={styles.companyMeta}>
                {[azienda.phone ? `Tel ${azienda.phone}` : null, azienda.email, azienda.pec ? `PEC ${azienda.pec}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Titolo */}
        <View style={styles.docBlock}>
          <View>
            <Text style={styles.docTitle}>Rendiconto lavori in appalto</Text>
            <Text style={styles.docMeta}>
              Periodo dal {giornoIT(periodoDal)} al {giornoIT(periodoAl)} · {righeTotali}{" "}
              {righeTotali === 1 ? "voce" : "voci"} su {cantieri.length}{" "}
              {cantieri.length === 1 ? "cantiere" : "cantieri"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.docNumber}>N° {numero}</Text>
            <Text style={styles.docMeta}>{statoEtichetta}</Text>
          </View>
        </View>

        {/* 3. Committente e contratto */}
        <View style={styles.row2}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Committente</Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoName}>{committente.ragione_sociale}</Text>
              {indirizzo(committente).map((l, i) => (
                <Text key={i} style={styles.infoLine}>
                  {l}
                </Text>
              ))}
              <Text style={styles.infoLine}>
                {[
                  committente.vat_number ? `P.IVA ${committente.vat_number}` : null,
                  committente.fiscal_code && committente.fiscal_code !== committente.vat_number
                    ? `CF ${committente.fiscal_code}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Contratto e riferimenti</Text>
            <View style={styles.infoBox}>
              {contrattoNome ? <Text style={styles.infoName}>{contrattoNome}</Text> : null}
              {riferimentoCommittente ? (
                <Text style={styles.infoLine}>Vs. riferimento: {riferimentoCommittente}</Text>
              ) : null}
              {ritenutaPct > 0 ? (
                <Text style={styles.infoLine}>
                  Ritenuta a garanzia {quantita(ritenutaPct)}% come da contratto
                </Text>
              ) : null}
              <Text style={styles.infoLine}>
                Prezzi come da listino concordato. Il dettaglio sotto è raggruppato per cantiere.
              </Text>
            </View>
          </View>
        </View>

        {/* 4. Un blocco per cantiere */}
        {cantieri.map((c) => (
          <View key={c.orderId} style={styles.cantiere} wrap>
            <View style={styles.cantiereHead}>
              <View>
                <Text style={styles.cantiereNome}>{c.etichetta}</Text>
                {c.codice && c.descrizione ? <Text style={styles.cantiereDesc}>{c.descrizione}</Text> : null}
              </View>
              <Text style={styles.cantiereNome}>€ {soldi(c.totale)}</Text>
            </View>

            <View style={styles.thead} fixed={false}>
              <Text style={[styles.th, styles.cData]}>Data</Text>
              <Text style={[styles.th, styles.cDesc]}>Descrizione</Text>
              <Text style={[styles.th, styles.cUm]}>U.m.</Text>
              <Text style={[styles.th, styles.cQta]}>Q.tà</Text>
              <Text style={[styles.th, styles.cPrezzo]}>Prezzo</Text>
              <Text style={[styles.th, styles.cImporto]}>Importo</Text>
            </View>

            {c.righe.map((r) => (
              <View key={r.id} style={styles.tr} wrap={false}>
                <Text style={[styles.td, styles.cData]}>{giornoIT(r.data)}</Text>
                <View style={styles.cDesc}>
                  <Text style={styles.td}>{r.descrizione}</Text>
                  {r.extra_contratto ? <Text style={styles.extra}>Fuori contratto</Text> : null}
                  {r.note ? <Text style={[styles.infoLine, { fontSize: 7 }]}>{r.note}</Text> : null}
                </View>
                <Text style={[styles.td, styles.cUm]}>{etichettaUnita(r.unita_misura)}</Text>
                <Text style={[styles.td, styles.cQta]}>{quantita(r.quantita)}</Text>
                <Text style={[styles.td, styles.cPrezzo]}>
                  {soldi(r.prezzo_unitario)}
                  {Number(r.maggiorazione_pct) !== 0 ? ` +${quantita(r.maggiorazione_pct)}%` : ""}
                </Text>
                <Text style={[styles.td, styles.cImporto]}>{soldi(r.importo)}</Text>
              </View>
            ))}

            <View style={styles.subtotale}>
              <Text style={styles.subtotaleLabel}>Totale {c.etichetta}</Text>
              <Text style={styles.subtotaleValore}>€ {soldi(c.totale)}</Text>
            </View>
          </View>
        ))}

        {/* 5. Totali */}
        <View style={styles.totali} wrap={false}>
          <View style={styles.totaleRiga}>
            <Text style={styles.totaleLabel}>Totale del periodo</Text>
            <Text style={styles.totaleValore}>€ {soldi(totale)}</Text>
          </View>
          {ritenutaPct > 0 ? (
            <View style={styles.totaleRiga}>
              <Text style={styles.totaleLabel}>Ritenuta a garanzia {quantita(ritenutaPct)}%</Text>
              <Text style={styles.totaleValore}>− € {soldi(ritenuta)}</Text>
            </View>
          ) : null}
          <View style={styles.totaleNetto}>
            <Text style={styles.nettoLabel}>Netto da fatturare</Text>
            <Text style={styles.nettoValore}>€ {soldi(netto)}</Text>
          </View>
        </View>

        {/* 6. Note e firme */}
        {note ? (
          <View style={styles.note} wrap={false}>
            <Text style={styles.sectionTitle}>Note</Text>
            <Text style={styles.noteTesto}>{note}</Text>
          </View>
        ) : null}

        <View style={styles.firme} wrap={false}>
          <View style={styles.firma}>
            <View style={styles.firmaLinea}>
              <Text style={styles.firmaLabel}>{azienda.name}</Text>
            </View>
          </View>
          <View style={styles.firma}>
            <View style={styles.firmaLinea}>
              <Text style={styles.firmaLabel}>
                {committente.ragione_sociale} — per accettazione
              </Text>
            </View>
          </View>
        </View>

        {/* 7. Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Rendiconto n. {numero} · {azienda.name}
          </Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
          <Text style={styles.footerText}>Generato da {platformName}</Text>
        </View>
      </Page>
    </Document>
  );
}

export default RendicontoAppaltoPDF;
