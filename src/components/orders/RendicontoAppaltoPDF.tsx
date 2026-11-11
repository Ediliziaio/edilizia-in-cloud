/**
 * RendicontoAppaltoPDF — il rendiconto che il committente riceve.
 * ────────────────────────────────────────────────────────────────────────────
 * È il documento su cui si discute: se non torna, si guarda questa carta. Per
 * questo il dettaglio è raggruppato **per cantiere** — la prima domanda di chi
 * ha più lavori aperti con te è «questa giornata su quale cantiere l'hai
 * fatta?» — e ogni riga porta la sua data, la quantità, il prezzo concordato e
 * l'importo. Il margine e i costi interni non ci sono: non sono affari suoi.
 *
 * Layout A4 verticale con lo stile unico dei documenti (10/11/2026, stileDocumenti.ts):
 * logo su bianco e titolo in testata, riquadri tenui, tabelle grigie, il netto nell'accento.
 *
 *  1. In fondo a ogni pagina: i dati societari
 *  2. Titolo: Rendiconto n. X, periodo, stato
 *  3. Due colonne: committente | contratto e riferimento
 *  4. Riepilogo: ore lavorate, giornate, totale, una riga per voce
 *  5. Un blocco per cantiere: righe + subtotale del cantiere
 *  5. Totali: totale, ritenuta, netto
 *  6. Note e riga firme (il committente lo firma per accettazione)
 *
 * Fase 5 del Modulo Appaltatori (28/10/2026) — vedi docs/piano-commessa-appalto.md.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { riepilogoRendiconto, type CantiereDelRendiconto } from "@/lib/appalto/fattura";
import type { CantiereAllegato } from "@/lib/appalto/giornaleAllegato";
import {
  Firme, PiedeDocumento, TestataDocumento, TitoloSezione, accentoPdf, colore, margineInferioreDocumento, pagina, riquadro, st, tabella,
} from "@/components/documenti/stileDocumentoPdf";

const styles = StyleSheet.create({
  page: st.pagina,

  row2: { flexDirection: "row", gap: 10, marginBottom: 4 },
  col: { flex: 1 },
  infoBox: { ...st.riquadro, minHeight: 70 },
  infoName: st.rNome,
  infoLine: { fontSize: pagina.nota + 0.5, color: colore.inchiostro, lineHeight: 1.4 },
  infoTenue: { fontSize: pagina.nota - 1, color: colore.testoTenue, lineHeight: 1.35 },

  thead: { ...st.tTesta },
  tr: { ...st.tRiga },
  gruppo: { ...st.tGruppo, justifyContent: "space-between", paddingHorizontal: tabella.paddingOrizzontale },
  th: { ...st.tTestaTesto, paddingHorizontal: 0 },
  td: { fontSize: tabella.corpo, color: colore.inchiostro },
  cData: { width: "11%", paddingLeft: tabella.paddingOrizzontale },
  cDesc: { width: "41%", paddingRight: 4 },
  cUm: { width: "12%" },
  cQta: { width: "10%", textAlign: "right" as const },
  cPrezzo: { width: "13%", textAlign: "right" as const },
  cImporto: { width: "13%", textAlign: "right" as const, paddingRight: tabella.paddingOrizzontale },
  rDesc: { width: "52%", paddingRight: 4, paddingLeft: tabella.paddingOrizzontale },

  subtotale: { ...st.tTotale, justifyContent: "flex-end", gap: 8, paddingHorizontal: tabella.paddingOrizzontale, marginBottom: 6 },

  numeri: { flexDirection: "row", gap: 8, marginBottom: 8 },
  numero: { ...st.riquadro, flex: 1, padding: 8 },
  numeroEtichetta: { ...st.rEtichetta, marginBottom: 2 },

  extra: { fontSize: 7, color: colore.avviso, fontFamily: "Helvetica-Bold" },

  /* Totali */
  totali: { marginTop: 6, alignSelf: "flex-end", width: "55%" },
  totaleRiga: { ...st.tRiga, justifyContent: "space-between", paddingHorizontal: tabella.paddingOrizzontale },
  totaleNetto: { ...st.tTotale, justifyContent: "space-between", paddingHorizontal: tabella.paddingOrizzontale, paddingVertical: 5 },
  totaleLabel: { fontSize: tabella.corpo, color: colore.inchiostro },
  totaleValore: { fontSize: tabella.corpo, fontFamily: "Helvetica-Bold", color: colore.inchiostro },
  nettoLabel: { fontSize: tabella.corpo + 1, fontFamily: "Helvetica-Bold", color: colore.inchiostro },

  note: { ...st.riquadro, marginTop: 14 },
  noteTesto: { fontSize: pagina.corpo - 1, color: colore.inchiostro, lineHeight: 1.4 },
  giornata: { ...st.riquadro, marginBottom: 6 },
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
  /** Il colore principale dell'azienda: l'accento del documento, se si legge su bianco. */
  colore?: string | null;
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
  /** Le pagine firmate del giornale: se non ce ne sono, nessun allegato. */
  giornale?: CantiereAllegato[];
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
  /** Ragione sociale, sede, P.IVA, REA, capitale: il piè di pagina. */
  societarie?: string[];
  companyId?: string | null;
}

/**
 * Cosa conta il totale (11/11/2026), scritto sotto i totali in 8 pt. Le righe vengono da
 * appalto_rendiconto_righe: manodopera e straordinari (appalto_rendiconto_crea_righe, con la
 * maggiorazione) e le voci extra del rapportino (rapportino_voce_applica). Materiali e mezzi
 * del rapportino non diventano righe. I lavori in economia sullo stesso periodo contano altro
 * (NOTA_TOTALE_ECONOMIA): finché il titolare non decide se unirli, ciascuno lo dice.
 */
export const NOTA_TOTALE_RENDICONTO =
  "Comprende manodopera, straordinari e voci extra dei rapportini; materiali e mezzi non sono compresi.";

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

/**
 * Le etichette che il database scrive nelle note per uso interno: al committente non dicono niente
 * («Voce del rapportino» sulle voci libere, 10/11/2026). Tutto il resto della nota (la persona) resta.
 */
const NOTE_INTERNE = new Set(["voce del rapportino", "voce libera del rapportino"]);

/** La nota di una riga come la legge il committente: null se è vuota o è un'etichetta interna. */
export function notaPerCommittente(nota: string | null | undefined): string | null {
  const t = String(nota ?? "").trim();
  if (!t || NOTE_INTERNE.has(t.toLowerCase())) return null;
  return t;
}

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

/** Un numero chiave: riquadro tenue, valore 14 pt; quello che conta di più nell'accento. */
function Numero({ etichetta, valore, accento }: { etichetta: string; valore: string; accento?: string }) {
  return (
    <View style={styles.numero}>
      <Text style={styles.numeroEtichetta}>{etichetta}</Text>
      <Text style={[st.rNumero, accento ? { color: accento } : {}]}>{valore}</Text>
    </View>
  );
}

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
  societarie = [],
  giornale = [],
  companyId,
}: RendicontoAppaltoPDFProps) {
  const righeTotali = cantieri.reduce((s, c) => s + c.righe.length, 0);
  const riepilogo = riepilogoRendiconto(cantieri);
  // Lo stile unico (10/11/2026): il logo su bianco a sinistra, senza ripetere il nome; senza logo il nome. La veste
  // propria (Vulcano) decide la misura del logo e il piè.
  const accento = accentoPdf(companyId, azienda.colore);
  const righePiede = societarie.length ? societarie : [azienda.name];
  const margineBasso = margineInferioreDocumento(companyId, righePiede.length);
  const sotto = [
    `N° ${numero} · dal ${giornoIT(periodoDal)} al ${giornoIT(periodoAl)}`,
    `${righeTotali} ${righeTotali === 1 ? "voce" : "voci"} su ${cantieri.length} ${cantieri.length === 1 ? "cantiere" : "cantieri"}`,
  ];

  return (
    <Document
      title={`Rendiconto ${numero} — ${committente.ragione_sociale}`}
      author={azienda.name}
      subject={`Rendiconto n. ${numero} dal ${giornoIT(periodoDal)} al ${giornoIT(periodoAl)}`}
    >
      <Page size="A4" style={[styles.page, { paddingBottom: margineBasso }]} wrap>
        {/* I dati dell'azienda sono in fondo, uguali a tutti i documenti (09/11/2026). Il piè sta per primo. */}
        <PiedeDocumento righe={righePiede} companyId={companyId} />

        {/* 1-2. Testata: chi manda il rendiconto, e che rendiconto è */}
        <TestataDocumento logo={azienda.logo_url} ragioneSociale={azienda.name} companyId={companyId} accento={accento}
          titolo="Rendiconto lavori in appalto" sotto={sotto} stato={statoEtichetta} />

        {/* 3. Committente e contratto */}
        <View style={styles.row2}>
          <View style={[styles.col, styles.infoBox]}>
            <Text style={st.rEtichetta}>Committente</Text>
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
          <View style={[styles.col, styles.infoBox]}>
            <Text style={st.rEtichetta}>Contratto e riferimenti</Text>
            {contrattoNome ? <Text style={styles.infoName}>{contrattoNome}</Text> : null}
            {riferimentoCommittente ? (
              <Text style={styles.infoLine}>Vs. riferimento: {riferimentoCommittente}</Text>
            ) : null}
            {ritenutaPct > 0 ? (
              <Text style={styles.infoLine}>
                Ritenuta a garanzia {quantita(ritenutaPct)}% come da contratto
              </Text>
            ) : null}
            <Text style={styles.infoTenue}>
              Prezzi come da listino concordato. Il dettaglio sotto è raggruppato per cantiere.
            </Text>
          </View>
        </View>

        {/* Quanto si è lavorato: la prima cosa che il committente controlla. */}
        <View wrap={false}>
          <TitoloSezione accento={accento}>Riepilogo del periodo</TitoloSezione>
          <View style={styles.numeri}>
            {riepilogo.ore > 0 ? <Numero etichetta="Ore lavorate" valore={quantita(riepilogo.ore)} /> : null}
            {riepilogo.giornate > 0 ? <Numero etichetta="Giornate" valore={quantita(riepilogo.giornate)} /> : null}
            <Numero etichetta={cantieri.length === 1 ? "Cantiere" : "Cantieri"} valore={String(cantieri.length)} />
            <Numero etichetta="Totale" valore={`€ ${soldi(totale)}`} accento={accento} />
          </View>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.rDesc]}>Voce</Text>
            <Text style={[styles.th, styles.cQta]}>Q.tà</Text>
            <Text style={[styles.th, styles.cUm, { textAlign: "right" }]}>U.m.</Text>
            <Text style={[styles.th, styles.cPrezzo]}>Prezzo</Text>
            <Text style={[styles.th, styles.cImporto]}>Importo</Text>
          </View>
          {riepilogo.voci.map((v, i) => (
            <View key={i} style={styles.tr}>
              <Text style={[styles.td, styles.rDesc]}>{v.descrizione}</Text>
              <Text style={[styles.td, styles.cQta]}>{quantita(v.quantita)}</Text>
              <Text style={[styles.td, styles.cUm, { textAlign: "right" }]}>{etichettaUnita(v.unita_misura)}</Text>
              <Text style={[styles.td, styles.cPrezzo]}>{soldi(v.prezzo_unitario)}{v.maggiorazione_pct !== 0 ? ` +${quantita(v.maggiorazione_pct)}%` : ""}</Text>
              <Text style={[styles.td, styles.cImporto]}>{soldi(v.importo)}</Text>
            </View>
          ))}
        </View>

        {/* 4. Il dettaglio: un raggruppamento per cantiere, riga tenue e non più fascia piena */}
        {cantieri.map((c, i) => (
          <View key={c.orderId} wrap style={i === 0 ? { marginTop: 14 } : undefined}>
            <View style={styles.thead} minPresenceAhead={40}>
              <Text style={[styles.th, styles.cData]}>Data</Text>
              <Text style={[styles.th, styles.cDesc]}>Descrizione</Text>
              <Text style={[styles.th, styles.cUm]}>U.m.</Text>
              <Text style={[styles.th, styles.cQta]}>Q.tà</Text>
              <Text style={[styles.th, styles.cPrezzo]}>Prezzo</Text>
              <Text style={[styles.th, styles.cImporto]}>Importo</Text>
            </View>
            <View style={styles.gruppo} wrap={false}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={st.tGruppoTesto}>{c.etichetta}</Text>
                {c.codice && c.descrizione ? <Text style={[styles.infoTenue, { paddingHorizontal: tabella.paddingOrizzontale }]}>{c.descrizione}</Text> : null}
              </View>
              <Text style={st.tGruppoTesto}>€ {soldi(c.totale)}</Text>
            </View>

            {c.righe.map((r) => (
              <View key={r.id} style={styles.tr} wrap={false}>
                <Text style={[styles.td, styles.cData]}>{giornoIT(r.data)}</Text>
                <View style={styles.cDesc}>
                  {/* La persona (la nota) una volta sola, sotto la voce: prima usciva anche in coda alla descrizione. */}
                  <Text style={styles.td}>{r.descrizione}</Text>
                  {r.extra_contratto ? <Text style={styles.extra}>Fuori contratto</Text> : null}
                  {notaPerCommittente(r.note) ? <Text style={styles.infoTenue}>{notaPerCommittente(r.note)}</Text> : null}
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

            <View style={styles.subtotale} wrap={false}>
              <Text style={styles.totaleValore}>Totale {c.etichetta}</Text>
              <Text style={styles.totaleValore}>€ {soldi(c.totale)}</Text>
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
            <Text style={[st.rNumero, { color: accento }]}>€ {soldi(netto)}</Text>
          </View>
          <Text style={[st.nota, { marginTop: 3 }]}>{NOTA_TOTALE_RENDICONTO}</Text>
        </View>

        {/* 6. Note e firme */}
        {note ? (
          <View style={styles.note} wrap={false}>
            <Text style={st.rEtichetta}>Note</Text>
            <Text style={styles.noteTesto}>{note}</Text>
          </View>
        ) : null}

        <Firme voci={[azienda.name, `${committente.ragione_sociale} — per accettazione`]} style={{ marginTop: 40 }} />
      </Page>

      {/* Allegato: le pagine firmate del giornale dei giorni rendicontati. Niente importi. */}
      {giornale.length > 0 ? (
        <Page size="A4" style={[styles.page, { paddingBottom: margineBasso }]} wrap>
          <PiedeDocumento righe={righePiede} companyId={companyId} />
          <TestataDocumento logo={azienda.logo_url} ragioneSociale={azienda.name} companyId={companyId} accento={accento}
            titolo="Allegato: giornale dei lavori" sotto={[`Rendiconto n. ${numero} · pagine firmate dei giorni rendicontati`]} />
          {giornale.map((c, i) => (
            <View key={c.orderId} style={{ marginBottom: 6 }}>
              <TitoloSezione accento={accento} primo={i === 0}>{c.nome}</TitoloSezione>
              {c.giornate.map((g) => (
                <View key={g.data} style={styles.giornata} wrap={false}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: riquadro.valoreCorpo - 1, color: colore.inchiostro, marginBottom: 2 }}>
                    {giornoIT(g.data)}{g.meteo ? ` · ${g.meteo}` : ""}{g.personale != null ? ` · ${g.personale} persone` : ""}
                  </Text>
                  <Text style={styles.noteTesto}>{g.lavorazioni}</Text>
                  {g.materiali ? <Text style={styles.noteTesto}>Materiali: {g.materiali}</Text> : null}
                  {g.firmatoDa ? <Text style={[styles.infoTenue, { marginTop: 2 }]}>Firmata da {g.firmatoDa}{g.firmatoIl ? ` il ${giornoIT(g.firmatoIl.slice(0, 10))}` : ""}</Text> : null}
                </View>
              ))}
              {c.senzaPagina.length > 0 ? (
                <Text style={st.nota}>Giorni senza pagina firmata: {c.senzaPagina.map(giornoIT).join(", ")}</Text>
              ) : null}
            </View>
          ))}
        </Page>
      ) : null}
    </Document>
  );
}

export default RendicontoAppaltoPDF;
