import React from "react";
import { Image, Text, View } from "@react-pdf/renderer";
import type { DossierEconomico } from "@/lib/orders/dossierEconomico";
import { totaliFatture, type DatiRiepilogo } from "@/lib/orders/riepilogoCommessaDati";

/**
 * Sezioni del PDF «Riepilogo commessa» oltre a quelle storiche di OrdinePDF.
 * Sono funzioni chiamate direttamente, non componenti: restituiscono gli elementi
 * che OrdinePDF mette nella pagina. Stili e formati arrivano da lì in `kit`,
 * così i due file non si importano a vicenda.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface KitPdf {
  styles: any;
  C: Record<string, string>;
  fmt: (n: number | null | undefined) => string;
  fmtPerc: (n: number) => string;
  /** Data o «—». */
  data: (d: string | null | undefined) => string;
}

type Cella = string | number | null | undefined;
interface Colonna { titolo: string; flex: number; destra?: boolean; forte?: boolean }

/** Etichetta leggibile da un codice del database: «in_corso» → «In corso». */
export const etichetta = (v: unknown): string => {
  const t = String(v ?? "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "—";
};

const STATI: Record<string, string> = {
  pending: "In attesa", signed: "Firmato", expired: "Scaduto", cancelled: "Annullato", otp_verified: "Codice verificato",
  draft: "Bozza", completed: "Completato", reviewed: "Rivisto", archived: "Archiviato",
  da_fare: "Da fare", completata: "Completata", non_avviata: "Da iniziare",
};
const stato = (v: unknown) => STATI[String(v)] ?? etichetta(v);

function titolo(kit: KitPdf, testo: string) {
  return (
    <View minPresenceAhead={50}>
      <Text style={kit.styles.sectionTitle}>{testo}</Text>
      <View style={kit.styles.sectionLine} />
    </View>
  );
}

/** Una tabella corta non si spezza e resta col suo titolo; una lunga va a capo ripetendo l'intestazione. */
function tabella(kit: KitPdf, nome: string | null, colonne: Colonna[], righe: Cella[][], chiusura?: Cella[]) {
  const { styles } = kit;
  const cella = (c: Colonna) => ({ flex: c.flex, paddingRight: 6, textAlign: (c.destra ? "right" : "left") as "right" | "left" });
  return (
    <View wrap={righe.length > 12}>
      {nome && titolo(kit, nome)}
      <View style={styles.table}>
        <View style={styles.tableHeader} fixed>
          {colonne.map((c) => <Text key={c.titolo} style={[styles.tableHeaderText, cella(c)]}>{c.titolo}</Text>)}
        </View>
        {righe.map((riga, r) => (
          <View key={r} style={r % 2 === 0 ? styles.tableRow : styles.tableRowAlt} wrap={false}>
            {colonne.map((c, i) => (
              <Text key={c.titolo} style={[styles.tableCell, cella(c), { fontFamily: c.forte ? "Helvetica-Bold" : "Helvetica" }]}>{riga[i] == null || riga[i] === "" ? "—" : String(riga[i])}</Text>
            ))}
          </View>
        ))}
        {chiusura && (
          <View style={[styles.tableRow, { backgroundColor: kit.C.gray100, borderTop: `1pt solid ${kit.C.gray300}` }]} wrap={false}>
            {colonne.map((c, i) => <Text key={c.titolo} style={[styles.tableCell, cella(c), { fontFamily: "Helvetica-Bold" }]}>{chiusura[i] == null ? "" : String(chiusura[i])}</Text>)}
          </View>
        )}
      </View>
    </View>
  );
}

function barra(kit: KitPdf, percentuale: number, colore: string, altezza = 5) {
  const p = Math.max(0, Math.min(100, percentuale));
  return (
    <View style={{ height: altezza, backgroundColor: kit.C.gray200, borderRadius: 2 }}>
      <View style={{ height: altezza, width: `${p}%`, backgroundColor: colore, borderRadius: 2 }} />
    </View>
  );
}

/* ── Colpo d'occhio: cassa e conto per voce, disegnati ─────────────────── */
export function sezioneGrafici(kit: KitPdf, dossier: DossierEconomico, mostraMargini: boolean) {
  const { C, fmt, styles } = kit;
  const voci = dossier.conto.righe.filter((r) => (r.preventivo ?? 0) !== 0 || r.consuntivo !== 0);
  const massimo = Math.max(1, ...voci.flatMap((r) => [r.preventivo ?? 0, r.consuntivo]));
  const t = dossier.totaliQuadro;
  const incassi = t ? t.incassato + t.daIncassare : 0;
  const uscite = t ? t.pagato + t.daPagare : 0;
  return (
    <>
      {titolo(kit, "A colpo d'occhio")}
      <View style={styles.row2} wrap={false}>
        {t && (
          <View style={[styles.financialBox, styles.col]}>
            <Text style={[styles.label, { marginBottom: 6 }]}>INCASSI E PAGAMENTI (IVA INCLUSA)</Text>
            <View style={styles.financialRow}><Text style={styles.financialLabel}>Incassato</Text><Text style={styles.financialValue}>{`${fmt(t.incassato)} su ${fmt(incassi)}`}</Text></View>
            {barra(kit, incassi > 0 ? (t.incassato / incassi) * 100 : 0, C.green, 7)}
            <View style={[styles.financialRow, { marginTop: 8 }]}><Text style={styles.financialLabel}>Pagato</Text><Text style={styles.financialValue}>{`${fmt(t.pagato)} su ${fmt(uscite)}`}</Text></View>
            {barra(kit, uscite > 0 ? (t.pagato / uscite) * 100 : 0, C.navy, 7)}
            <View style={[styles.financialRow, { marginTop: 8 }]}>
              <Text style={styles.financialLabel}>In cassa dalla commessa</Text>
              <Text style={[styles.financialValue, { color: t.cassa >= 0 ? C.green : C.red }]}>{fmt(t.cassa)}</Text>
            </View>
            {t.incassoScaduto > 0 && <View style={styles.financialRow}><Text style={styles.financialLabel}>Incassi scaduti</Text><Text style={[styles.financialValue, { color: C.red }]}>{fmt(t.incassoScaduto)}</Text></View>}
            {t.pagamentoScaduto > 0 && <View style={styles.financialRow}><Text style={styles.financialLabel}>Pagamenti scaduti</Text><Text style={[styles.financialValue, { color: C.red }]}>{fmt(t.pagamentoScaduto)}</Text></View>}
          </View>
        )}
        <View style={[styles.financialBox, styles.col]}>
          <Text style={[styles.label, { marginBottom: 6 }]}>PREVENTIVO E CONSUNTIVO PER VOCE</Text>
          {voci.map((r) => (
            <View key={r.key} style={{ marginBottom: 5 }}>
              <View style={styles.financialRow}>
                <Text style={[styles.financialLabel, { fontSize: 7 }]}>{r.label}</Text>
                <Text style={[styles.financialValue, { fontSize: 7 }]}>{fmt(r.consuntivo)}</Text>
              </View>
              {r.preventivo != null && <View style={{ marginBottom: 1 }}>{barra(kit, (r.preventivo / massimo) * 100, C.gray300, 3)}</View>}
              {barra(kit, (r.consuntivo / massimo) * 100, r.preventivo != null && r.consuntivo > r.preventivo ? C.red : C.orange, 3)}
            </View>
          ))}
          <Text style={{ fontSize: 6, color: C.gray500 }}>Barra grigia: preventivo. Arancione: consuntivo (rossa se lo supera).</Text>
          {mostraMargini && (
            <View style={[styles.financialRow, { marginTop: 5 }]}>
              <Text style={styles.financialLabel}>Margine diretto</Text>
              <Text style={[styles.financialValue, { color: dossier.margineDiretto.importo >= 0 ? C.green : C.red }]}>{`${fmt(dossier.margineDiretto.importo)} (${kit.fmtPerc(dossier.margineDiretto.pct)})`}</Text>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

/* ── Programma lavori ──────────────────────────────────────────────────── */
export function sezioneProgramma(kit: KitPdf, dati: DatiRiepilogo, persone: Record<string, string[]>) {
  const { C, styles } = kit;
  if (dati.fasi.length === 0) return null;
  const media = dati.fasi.reduce((s, f) => s + Number(f.percentuale ?? 0), 0) / dati.fasi.length;
  return (
    <>
      <View wrap={dati.fasi.length > 12}>
      {titolo(kit, `Programma lavori (${dati.fasi.length} fasi · media ${Math.round(media)}%)`)}
      <View style={styles.table}>
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderText, { flex: 2.4 }]}>Fase</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Stato</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Inizio</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Fine</Text>
          <Text style={[styles.tableHeaderText, { flex: 1.6 }]}>Avanzamento</Text>
        </View>
        {dati.fasi.map((f, i) => {
          const p = Number(f.percentuale ?? 0);
          const chi = persone[f.id] ?? [];
          return (
            <View key={f.id ?? i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt} wrap={false}>
              <View style={{ flex: 2.4 }}>
                <Text style={[styles.tableCell, { fontFamily: "Helvetica-Bold" }]}>{f.name ?? "—"}</Text>
                {chi.length > 0 && <Text style={{ fontSize: 6.5, color: C.gray500, marginTop: 1 }}>{chi.join(", ")}</Text>}
                {f.notes ? <Text style={{ fontSize: 6.5, color: C.gray500, marginTop: 1 }}>{f.notes}</Text> : null}
              </View>
              <Text style={[styles.tableCell, { flex: 1 }]}>{stato(f.status)}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{kit.data(f.start_date)}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{kit.data(f.end_date)}</Text>
              <View style={{ flex: 1.6, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ flex: 1 }}>{barra(kit, p, p >= 100 ? C.green : C.orange)}</View>
                <Text style={{ fontSize: 7, color: C.gray700, width: 22, textAlign: "right" }}>{p}%</Text>
              </View>
            </View>
          );
        })}
      </View>
      </View>
    </>
  );
}

/* ── Fatture al cliente ────────────────────────────────────────────────── */
export function sezioneFatture(kit: KitPdf, dati: DatiRiepilogo) {
  const { fmt, data } = kit;
  if (dati.fatture.length === 0) return null;
  const t = totaliFatture(dati.fatture);
  return (
    <>
      {tabella(kit, `Fatture al cliente (${dati.fatture.length})`,
        [{ titolo: "Numero", flex: 1.8, forte: true }, { titolo: "Tipo", flex: 1 }, { titolo: "Data", flex: 0.9 }, { titolo: "Scadenza", flex: 0.9 }, { titolo: "Totale", flex: 1, destra: true }, { titolo: "Incassato", flex: 1, destra: true }, { titolo: "Stato", flex: 1 }],
        dati.fatture.map((f) => [f.numero, f.tipo === "nota_credito" ? "Nota di credito" : f.tipo === "proforma" ? "Proforma" : "Fattura", data(f.data), data(f.scadenza), fmt(f.totale), fmt(f.pagato), stato(f.stato)]),
        ["Totale emesso", "", "", "", fmt(t.emesso), fmt(t.incassato), t.residuo > 0.005 ? `Resta ${fmt(t.residuo)}` : ""],
      )}
      {dati.fattureAnnullate > 0 && <Text style={[kit.styles.tableCell, { fontSize: 7, color: kit.C.gray500, marginBottom: 6 }]}>Non elencate: {dati.fattureAnnullate} {dati.fattureAnnullate === 1 ? "fattura annullata" : "fatture annullate"}. Proforma e bozze non entrano nel totale.</Text>}
    </>
  );
}

/* ── Subappalti ────────────────────────────────────────────────────────── */
export function sezioneSubappalti(kit: KitPdf, dati: DatiRiepilogo) {
  const { fmt, data } = kit;
  return (
    <>
      {dati.contratti.length > 0 && (
        <>
          {tabella(kit, `Contratti di subappalto (${dati.contratti.length})`,
            [{ titolo: "Subappaltatore", flex: 2, forte: true }, { titolo: "Contratto", flex: 1.5 }, { titolo: "Lavori", flex: 2.2 }, { titolo: "Importo", flex: 1, destra: true }, { titolo: "Ritenuta", flex: 0.6, destra: true }, { titolo: "Periodo", flex: 1.5 }, { titolo: "Stato", flex: 0.9 }],
            dati.contratti.map((c) => [c.subappaltatore?.ragione_sociale, c.numero_contratto, c.descrizione_lavori, fmt(Number(c.importo_contrattuale ?? 0)), c.ritenuta_garanzia_pct == null ? null : `${c.ritenuta_garanzia_pct}%`, `${data(c.data_inizio)} - ${data(c.data_fine_prevista)}`, c.firmato_il ? `Firmato ${data(c.firmato_il)}` : stato(c.stato)]),
          )}
        </>
      )}
      {dati.salSub.length > 0 && (
        <>
          {tabella(kit, `SAL dei subappaltatori (${dati.salSub.length})`,
            [{ titolo: "Subappaltatore", flex: 2, forte: true }, { titolo: "N.", flex: 0.4 }, { titolo: "Data", flex: 0.9 }, { titolo: "Lordo", flex: 1, destra: true }, { titolo: "Ritenuta", flex: 0.9, destra: true }, { titolo: "Netto", flex: 1, destra: true }, { titolo: "Verbale accettato", flex: 1 }, { titolo: "Stato", flex: 1 }],
            dati.salSub.map((s) => [s.subappaltatore?.ragione_sociale, s.numero_sal, data(s.data_emissione), fmt(Number(s.importo_lordo ?? 0)), fmt(Number(s.ritenuta_importo ?? 0)), fmt(Number(s.importo_netto ?? 0)), data(s.accettato_il), s.data_pagamento ? `Pagato ${data(s.data_pagamento)}` : stato(s.stato)]),
          )}
        </>
      )}
    </>
  );
}

/* ── Cantiere: ore, mezzi, consegne, sicurezza ─────────────────────────── */
export function sezioneCantiere(kit: KitPdf, dati: DatiRiepilogo) {
  const { data, styles, C } = kit;
  const { ore } = dati;
  const descrizioni = dati.rapportini.filter((r) => r.stato !== "rifiutato" && r.descrizione_lavori).slice(0, 20);
  const documentiSicurezza = [
    ...dati.sicurezzaPos.map((p) => [etichetta(p.document_type ?? "POS"), p.revisione ?? p.version, stato(p.status), data(p.approvato_il ?? p.firmato_il), data(p.valid_until)]),
    ...dati.sicurezzaDuvri.map((d) => ["DUVRI", null, stato(d.status), data(d.firmato_committente_il ?? d.firmato_subappaltatore_il), null]),
  ];
  return (
    <>
      {ore.rapportini > 0 && (
        <>
          {titolo(kit, `Ore di cantiere (${ore.rapportini} rapportini)`)}
          <View style={styles.kpiRow} wrap={false}>
            {[[`${ore.ore} h`, "Ore registrate"], [String(ore.giornate), "Giornate"], [`${ore.straordinari} h`, "Straordinari"], [`${data(ore.primo)} - ${data(ore.ultimo)}`, "Periodo"]].map(([v, l]) => (
              <View key={l} style={[styles.kpiBox, { backgroundColor: C.gray50 }]}>
                <Text style={[styles.kpiValue, { fontSize: 10, color: C.navy }]}>{v}</Text>
                <Text style={styles.kpiLabel}>{l}</Text>
              </View>
            ))}
          </View>
          {tabella(kit, null, [{ titolo: "Persona", flex: 3, forte: true }, { titolo: "Giornate", flex: 1, destra: true }, { titolo: "Ore", flex: 1, destra: true }], ore.perPersona.map((p) => [p.nome, p.giornate, p.ore]))}
          {descrizioni.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: 8, marginBottom: 4 }]}>ULTIMI RAPPORTINI{ore.rapportini > descrizioni.length ? ` (${descrizioni.length} DI ${ore.rapportini})` : ""}</Text>
              {tabella(kit, null, [{ titolo: "Data", flex: 0.8 }, { titolo: "Lavori", flex: 4 }, { titolo: "Ore", flex: 0.5, destra: true }, { titolo: "Stato", flex: 0.8 }],
                descrizioni.map((r) => [data(r.data_lavoro), r.descrizione_lavori, Number(r.ore_lavorate ?? 0), stato(r.stato)]))}
            </>
          )}
        </>
      )}
      {dati.mezzi.length > 0 && (
        <>
          {tabella(kit, `Mezzi usati (${dati.mezzi.length})`, [{ titolo: "Mezzo", flex: 3, forte: true }, { titolo: "Giornate", flex: 1, destra: true }, { titolo: "Dal", flex: 1 }, { titolo: "Al", flex: 1 }], dati.mezzi.map((m) => [m.nome, m.giornate, data(m.primo), data(m.ultimo)]))}
        </>
      )}
      {(dati.ddt.length > 0 || dati.usciteMagazzino.length > 0) && (
        <>
          {tabella(kit, `Consegne e bolle (${dati.ddt.length + dati.usciteMagazzino.length})`, [{ titolo: "Documento", flex: 1.5, forte: true }, { titolo: "Tipo", flex: 1.2 }, { titolo: "Data", flex: 0.9 }, { titolo: "Fornitore / vettore", flex: 2 }, { titolo: "Note", flex: 1.6 }, { titolo: "Stato", flex: 0.9 }], [
            ...dati.ddt.map((d) => [d.numero_ddt, "Bolla ricevuta", data(d.data_ricezione), d.supplier?.name, d.has_damages ? "Con danni" : d.non_conformita ? "Non conforme" : etichetta(d.destinazione), stato(d.stato)]),
            ...dati.usciteMagazzino.map((u) => [u.numero, "Uscita magazzino", data(u.data), u.vettore, Array.isArray(u.righe) ? `${u.righe.length} righe` : null, stato(u.stato)]),
          ])}
        </>
      )}
      {(documentiSicurezza.length > 0 || dati.sicurezzaVerbali.length > 0) && (
        <>
          {titolo(kit, `Sicurezza (${documentiSicurezza.length + dati.sicurezzaVerbali.length})`)}
          {documentiSicurezza.length > 0 && tabella(kit, null, [{ titolo: "Documento", flex: 2, forte: true }, { titolo: "Revisione", flex: 0.7 }, { titolo: "Stato", flex: 1 }, { titolo: "Firmato / approvato", flex: 1.1 }, { titolo: "Valido fino al", flex: 1 }], documentiSicurezza)}
          {dati.sicurezzaVerbali.length > 0 && tabella(kit, null, [{ titolo: "Verbale", flex: 1.6, forte: true }, { titolo: "Data", flex: 0.8 }, { titolo: "Esito", flex: 0.9 }, { titolo: "Note", flex: 3 }], dati.sicurezzaVerbali.map((v) => [etichetta(v.tipo), data(v.data), etichetta(v.esito), v.note]))}
        </>
      )}
      {dati.segnalazioni.length > 0 && (
        <>
          {tabella(kit, `Segnalazioni di cantiere (${dati.segnalazioni.length})`, [{ titolo: "Data", flex: 0.8 }, { titolo: "Segnalazione", flex: 4 }, { titolo: "Urgenza", flex: 0.8 }, { titolo: "Stato", flex: 1 }], dati.segnalazioni.map((s) => [data(s.created_at), s.descrizione, etichetta(s.urgenza), s.resolved_at ? `Risolta ${data(s.resolved_at)}` : stato(s.stato)]))}
        </>
      )}
      {dati.errori.length > 0 && (
        <>
          {tabella(kit, `Errori e imprevisti (${dati.errori.length})`, [{ titolo: "Data", flex: 0.8 }, { titolo: "Tipo", flex: 1.2 }, { titolo: "Descrizione", flex: 3.2 }, { titolo: "Importo", flex: 0.9, destra: true }, { titolo: "Stato", flex: 0.9 }], dati.errori.map((e) => [data(e.error_date), etichetta(e.error_category ?? e.error_type), e.description, kit.fmt(Number(e.amount ?? 0)), etichetta(e.review_status)]))}
        </>
      )}
      {dati.noteCantiere.length > 0 && (
        <>
          {tabella(kit, `Note di cantiere (${dati.noteCantiere.length})`, [{ titolo: "Data", flex: 0.8 }, { titolo: "Nota", flex: 5 }], dati.noteCantiere.map((n) => [data(n.created_at), `${n.importante ? "IMPORTANTE - " : ""}${n.testo ?? ""}`]))}
        </>
      )}
    </>
  );
}

/* ── Attività, agenda, assistenza, firme, allegati, storia ─────────────── */
export function sezioneAgenda(kit: KitPdf, dati: DatiRiepilogo) {
  const { data } = kit;
  const aperte = dati.attivita.filter((t) => t.status !== "completata").length;
  const pesoKb = (b: unknown) => {
    const n = Number(b ?? 0);
    return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1024))} KB` : null;
  };
  const nomeTicket = (t: Record<string, any>) => t.titolo || t.subject;
  return (
    <>
      {dati.attivita.length > 0 && (
        <>
          {tabella(kit, `Attività (${dati.attivita.length}, ${aperte} aperte)`, [{ titolo: "Attività", flex: 3.4, forte: true }, { titolo: "Assegnata a", flex: 1.5 }, { titolo: "Scadenza", flex: 0.9 }, { titolo: "Stato", flex: 0.9 }],
            dati.attivita.map((t) => [t.title, `${t.assegnata?.first_name ?? ""} ${t.assegnata?.last_name ?? ""}`.trim(), data(t.due_date), t.completed_at ? `Fatta ${data(t.completed_at)}` : stato(t.status)]))}
        </>
      )}
      {dati.appuntamenti.length > 0 && (
        <>
          {tabella(kit, `Appuntamenti (${dati.appuntamenti.length})`, [{ titolo: "Data", flex: 1 }, { titolo: "Appuntamento", flex: 3, forte: true }, { titolo: "Tipo", flex: 1.2 }, { titolo: "Stato", flex: 1 }],
            dati.appuntamenti.map((a) => [`${data(a.appointment_date)}${a.appointment_time ? ` ${String(a.appointment_time).slice(0, 5)}` : ""}`, a.title, etichetta(a.appointment_type), a.is_completed ? "Completato" : stato(a.status)]))}
        </>
      )}
      {dati.sopralluoghi.length > 0 && (
        <>
          {tabella(kit, `Sopralluoghi (${dati.sopralluoghi.length})`, [{ titolo: "Codice", flex: 1, forte: true }, { titolo: "Indirizzo", flex: 3 }, { titolo: "Previsto", flex: 0.9 }, { titolo: "Fatto", flex: 0.9 }, { titolo: "Stato", flex: 0.9 }],
            dati.sopralluoghi.map((s) => [s.code, [s.address, s.city].filter(Boolean).join(", "), data(s.scheduled_at), data(s.completed_at), stato(s.status)]))}
        </>
      )}
      {dati.ticket.length > 0 && (
        <>
          {tabella(kit, `Assistenza (${dati.ticket.length})`, [{ titolo: "Aperto il", flex: 0.9 }, { titolo: "Richiesta", flex: 3.4, forte: true }, { titolo: "Intervento", flex: 0.9 }, { titolo: "Stato", flex: 0.9 }],
            dati.ticket.map((t) => [data(t.created_at), nomeTicket(t), data(t.data_intervento_effettiva ?? t.data_intervento_prevista), etichetta(t.status)]))}
        </>
      )}
      {dati.firme.length > 0 && (
        <>
          {tabella(kit, `Documenti alla firma (${dati.firme.length})`, [{ titolo: "Documento", flex: 2.2, forte: true }, { titolo: "Firmatario", flex: 2 }, { titolo: "Inviato", flex: 0.9 }, { titolo: "Firmato", flex: 0.9 }, { titolo: "Stato", flex: 1 }],
            dati.firme.map((f) => [etichetta(f.tipo_documento ?? f.categoria), f.signer_name, data(f.created_at), data(f.signed_at), stato(f.status)]))}
        </>
      )}
      {dati.allegati.length > 0 && (
        <>
          {tabella(kit, `Allegati della commessa (${dati.allegati.length})`, [{ titolo: "File", flex: 4.2, forte: true }, { titolo: "Peso", flex: 0.7, destra: true }, { titolo: "Caricato il", flex: 0.9 }], dati.allegati.map((a) => [a.file_name, pesoKb(a.file_size), data(a.created_at)]))}
        </>
      )}
      {dati.storicoStati.length > 0 && (
        <>
          {tabella(kit, "Storia della commessa", [{ titolo: "Data", flex: 1 }, { titolo: "Passata allo stato", flex: 4, forte: true }], dati.storicoStati.map((s) => [data(s.changed_at), s.stato?.name]))}
        </>
      )}
    </>
  );
}

/* ── Foto ──────────────────────────────────────────────────────────────── */
export function sezioneFoto(kit: KitPdf, dati: DatiRiepilogo) {
  const { C, data } = kit;
  if (dati.foto.length === 0) return null;
  return (
    <>
      {titolo(kit, dati.fotoTotali > dati.foto.length ? `Foto di cantiere (le ultime ${dati.foto.length} di ${dati.fotoTotali})` : `Foto di cantiere (${dati.foto.length})`)}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {dati.foto.map((f, i) => (
          <View key={i} style={{ width: "31.5%" }} wrap={false}>
            <Image src={f.src} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 3 }} />
            <Text style={{ fontSize: 6.5, color: C.gray500, marginTop: 2 }}>{data(f.data)}{f.descrizione ? ` - ${f.descrizione}` : ""}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

/* ── Cosa c'è nel documento, cosa manca e perché ───────────────────────── */
export function sezioneIndice(kit: KitPdf, sezioni: Array<{ nome: string; n: number }>) {
  const { C, styles } = kit;
  const piene = sezioni.filter((s) => s.n > 0);
  if (piene.length === 0) return null;
  return (
    <View style={[styles.infoBox, { marginBottom: 12 }]} wrap={false}>
      <Text style={[styles.label, { marginBottom: 4 }]}>IN QUESTO DOCUMENTO</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {piene.map((s) => (
          <Text key={s.nome} style={{ fontSize: 7, color: C.gray700, backgroundColor: C.white, border: `0.5pt solid ${C.gray200}`, borderRadius: 3, padding: "2 4" }}>{s.nome} {s.n}</Text>
        ))}
      </View>
    </View>
  );
}

export function sezioneCompletezza(kit: KitPdf, sezioni: Array<{ nome: string; n: number }>, nonLette: string[]) {
  const { C } = kit;
  const vuote = sezioni.filter((s) => s.n === 0 && !nonLette.includes(s.nome)).map((s) => s.nome);
  if (vuote.length === 0 && nonLette.length === 0) return null;
  return (
    <View style={{ marginTop: 14, paddingTop: 6, borderTop: `0.5pt solid ${C.gray200}` }} wrap={false}>
      {nonLette.length > 0 && (
        <Text style={{ fontSize: 8, color: C.red, marginBottom: 3, fontFamily: "Helvetica-Bold" }}>
          Non è stato possibile leggere: {nonLette.join(", ")}. Queste parti potrebbero contenere dati: riscarica il documento.
        </Text>
      )}
      {vuote.length > 0 && <Text style={{ fontSize: 7, color: C.gray500 }}>Senza dati registrati a oggi: {vuote.join(", ")}.</Text>}
    </View>
  );
}
