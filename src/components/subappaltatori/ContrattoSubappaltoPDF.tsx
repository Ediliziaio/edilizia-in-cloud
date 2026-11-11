/**
 * Il PDF del contratto di subappalto che si manda in firma: stesso testo della
 * stampa (`articoliContratto`), testo vero e selezionabile, A4. Il PDF viene
 * congelato all'invio: chi firma vede esattamente questo, e il PDF firmato
 * (timbro su ogni pagina + certificato) si costruisce su questi byte.
 *
 * Impaginato del 31/10/2026 (Dimora Torino): logo dell'impresa in testata, le
 * due parti con tutti i dati, il cantiere, il riquadro economico
 * (IVA o reverse charge, ritenuta, netto ai SAL) prima degli articoli, e
 * l'elenco completo dei lavori (dall'11/11/2026 in apertura, prima del riquadro economico). Dal 10/11/2026 con lo
 * stile unico dei documenti (stileDocumentoPdf).
 */
import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import {
  articoliContratto, articoliDaApprovare, dataContratto, elencoPerFase, euroContratto, quantitaContratto,
  codiciElenco, elencoCantiereSenzaCifre, riepilogoEconomicoContratto, testoComprende, totaleElencoLavori, type DatiContrattoSubappalto,
} from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import {
  Firme, PiedeDocumento, TestataDocumento, TitoloSezione, accentoPdf, colore, margineInferioreDocumento, pagina, riquadro, st, tabella,
} from "@/components/documenti/stileDocumentoPdf";

Font.registerHyphenationCallback((word) => [word]);

/**
 * Lo stile unico dei documenti (10/11/2026, stileDocumenti.ts): logo su bianco a sinistra, titolo a destra, filetto
 * d'accento; parti e cantiere in riquadri tenui; il riquadro economico come tabella col netto nell'accento; l'elenco
 * dei lavori con l'intestazione grigia e le fasi su righe tenui. Prima: un blu uguale per tutti e fasce piene.
 */
export const stiliContratto = StyleSheet.create({
  pagina: { ...st.pagina, paddingTop: pagina.margineAlto },
  parti: { flexDirection: "row", gap: 10, marginBottom: 10 },
  parte: { ...st.riquadro, flex: 1 },
  etichetta: st.rEtichetta,
  nome: st.rNome,
  riga: st.rRiga,
  bold: st.bold,
  cantiere: { ...st.riquadro, marginBottom: 4, flexDirection: "row", flexWrap: "wrap" },
  cella: { width: "50%", fontSize: tabella.corpo, marginBottom: 2, paddingRight: 8, color: colore.inchiostro },
  economico: { marginBottom: 4 },
  ecoRiga: { ...st.tRiga, justifyContent: "space-between", paddingHorizontal: tabella.paddingOrizzontale },
  ecoTotale: { ...st.tTotale, justifyContent: "space-between", paddingHorizontal: tabella.paddingOrizzontale },
  ecoNota: { ...st.nota, paddingTop: 5 },
  art: { fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 2.5, fontSize: pagina.corpo, color: colore.inchiostro },
  para: { marginBottom: 3, textAlign: "justify" },
  luogo: { marginTop: 22, fontSize: pagina.nota, color: colore.testoTenue },
  clausole: { ...st.riquadro, marginTop: 16, fontSize: pagina.nota, lineHeight: 1.4 },
  // L'elenco dei lavori, in apertura.
  allegatoTitolo: { fontSize: 12, fontFamily: "Helvetica-Bold", color: colore.inchiostro, marginBottom: 2 },
  allegatoSotto: { ...st.nota, marginBottom: 8 },
  tRiga: { ...st.tRiga },
  tTesta: { ...st.tTesta },
  tFase: { ...st.tGruppo },
  tTotale: { ...st.tTotale, marginTop: 4 },
  cCod: { width: 46, paddingHorizontal: 4, fontSize: 7.5, color: colore.testoTenue },
  cDesc: { flex: 1, paddingHorizontal: tabella.paddingOrizzontale },
  cUm: { width: 40, paddingHorizontal: 2, textAlign: "center" },
  cNum: { width: 52, paddingHorizontal: 3, textAlign: "right" },
  cPrz: { width: 64, paddingHorizontal: 3, textAlign: "right" },
  cImp: { width: 72, paddingHorizontal: tabella.paddingOrizzontale, textAlign: "right" },
  th: { fontSize: tabella.intestazioneCorpo, fontFamily: "Helvetica-Bold", color: colore.testoTenue, textTransform: "uppercase" },
  td: { fontSize: tabella.corpo, color: colore.inchiostro },
});

const s = stiliContratto;

export function RigaEco({ label, valore, forte, colore: tinta }: { label: string; valore: string; forte?: boolean; colore?: string }) {
  return (
    <View style={s.ecoRiga}>
      <Text style={[s.td, forte ? s.bold : {}]}>{label}</Text>
      <Text style={[s.td, forte ? s.bold : {}, tinta ? { color: tinta } : {}]}>{valore}</Text>
    </View>
  );
}

/** Il netto, il totale da pagare: riga di chiusura, il valore nell'accento. */
export function RigaEcoTotale({ label, valore, accento }: { label: string; valore: string; accento: string }) {
  return (
    <View style={s.ecoTotale}>
      <Text style={[s.td, s.bold]}>{label}</Text>
      <Text style={{ fontSize: riquadro.valoreCorpo + 1, fontFamily: "Helvetica-Bold", color: accento }}>{valore}</Text>
    </View>
  );
}

export function ContrattoSubappaltoPDF({ d }: { d: DatiContrattoSubappalto }) {
  const companyId = d.veste?.companyId ?? null;
  const accento = accentoPdf(companyId, d.veste?.colore);
  const articoli = articoliContratto(d);
  const eco = riepilogoEconomicoContratto(d);
  const a = d.committente;
  const sub = d.subappaltatore;
  const elenco = d.elencoLavori ?? [];
  const totaleElenco = totaleElencoLavori(elenco);
  const elencoDiverso = elenco.length > 0 && Math.abs(totaleElenco - eco.lavori) > 0.005;
  const codici = codiciElenco(elenco);
  // Il piè: i dati societari; senza, quelli dell'impresa che prima stavano in testata (09/11/2026 → 10/11/2026).
  const righePiede = d.societarie?.length ? d.societarie : [
    a.ragioneSociale,
    a.indirizzo,
    [a.partitaIva && `P.IVA ${a.partitaIva}`, a.telefono && `Tel. ${a.telefono}`, a.email].filter(Boolean).join(" · "),
  ].filter((r): r is string => !!r);
  const pieConVeste = d.societarie?.length ? companyId : null;
  // Senza dati societari il piè diceva anche di che contratto si tratta: resta, come riga di riferimento.
  const riferimento = d.societarie?.length ? null : `${a.ragioneSociale} · Contratto di subappalto${d.numero ? ` ${d.numero}` : ""} · ${d.commessa.codice}`;
  return (
    <Document title={`Contratto di subappalto ${d.numero ?? ""}`.trim()} author={a.ragioneSociale} producer="Edilizia in Cloud">
      <Page size="A4" style={[s.pagina, { paddingBottom: margineInferioreDocumento(pieConVeste, righePiede.length, !!riferimento) }]}>
        {/* Il piè sta per primo: dopo un contenuto su più fogli react-pdf lo disegnava fuori pagina. */}
        <PiedeDocumento righe={righePiede} companyId={pieConVeste} riferimento={riferimento} />
        {/* Testata su ogni foglio: logo (o nome) e il titolo. */}
        <TestataDocumento fixed logo={d.veste?.logoUrl} ragioneSociale={a.ragioneSociale} companyId={companyId} accento={accento}
          titolo="Contratto di subappalto"
          sotto={[[d.numero && `N. ${d.numero}`, `stipulato il ${dataContratto(d.dataStipula)}`].filter(Boolean).join(" · "), d.commessa.codice && `Commessa ${d.commessa.codice}`]} />

        <View style={s.parti}>
          <View style={s.parte}>
            <Text style={s.etichetta}>Impresa affidataria</Text>
            <Text style={s.nome}>{a.ragioneSociale || "—"}</Text>
            <Text style={s.riga}>P.IVA {a.partitaIva || "—"}{a.codiceFiscale && a.codiceFiscale !== a.partitaIva ? ` · C.F. ${a.codiceFiscale}` : ""}</Text>
            {!!a.indirizzo && <Text style={s.riga}>Sede: {a.indirizzo}</Text>}
            {!!a.rappresentante && <Text style={s.riga}>Rappresentata da {a.rappresentante}</Text>}
          </View>
          <View style={s.parte}>
            <Text style={s.etichetta}>Subappaltatore</Text>
            <Text style={s.nome}>{sub.ragioneSociale || "—"}</Text>
            <Text style={s.riga}>P.IVA {sub.partitaIva || "________________"}{sub.codiceFiscale ? ` · C.F. ${sub.codiceFiscale}` : ""}</Text>
            <Text style={s.riga}>Sede: {sub.indirizzo || "________________________________"}</Text>
            {(!!sub.pec || !!sub.email) && <Text style={s.riga}>{[sub.pec && `PEC ${sub.pec}`, sub.email && sub.email !== sub.pec && sub.email].filter(Boolean).join(" · ")}</Text>}
            {(!!sub.telefono || !!sub.responsabile) && <Text style={s.riga}>{[sub.responsabile && `Titolare ${sub.responsabile}`, sub.telefono && `Tel. ${sub.telefono}`].filter(Boolean).join(" · ")}</Text>}
            <Text style={s.riga}>Posizioni INAIL, INPS e Cassa Edile: come da DURC allegato</Text>
          </View>
        </View>

        <View style={s.cantiere}>
          <Text style={s.cella}><Text style={s.bold}>Commessa </Text>{d.commessa.codice || "—"}{d.commessa.descrizione ? ` · ${d.commessa.descrizione}` : ""}</Text>
          <Text style={s.cella}><Text style={s.bold}>Committente </Text>{d.commessa.cliente || "—"}</Text>
          <Text style={s.cella}><Text style={s.bold}>Cantiere </Text>{d.commessa.indirizzoCantiere || "—"}</Text>
          <Text style={s.cella}><Text style={s.bold}>Lavori </Text>dal {dataContratto(d.dataInizio)} al {dataContratto(d.dataFinePrevista)}</Text>
        </View>

        {/* L'elenco dei lavori in apertura, col totale e il reverse charge subito sotto (11/11/2026): prima stava
            in Allegato A in fondo, e chi leggeva il contratto vedeva la cifra senza sapere a cosa corrispondeva. */}
        {elenco.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <TitoloSezione accento={accento}>Elenco dei lavori · prezzi IVA esclusa</TitoloSezione>
            {!!codici.riferimento && <Text style={s.allegatoSotto}>Dal preventivo {codici.riferimento}</Text>}
            <View style={s.tTesta}>
              {codici.perRiga && <Text style={[s.th, s.cCod]}>Codice</Text>}<Text style={[s.th, s.cDesc]}>Descrizione</Text><Text style={[s.th, s.cUm]}>U.M.</Text>
              <Text style={[s.th, s.cNum]}>Quantità</Text><Text style={[s.th, s.cPrz]}>Prezzo</Text><Text style={[s.th, s.cImp]}>Importo</Text>
            </View>
            {elencoPerFase(elenco).map((g) => (
              <View key={g.fase}>
                <View style={s.tFase} wrap={false} minPresenceAhead={30}>
                  <Text style={[s.td, s.bold, s.cDesc]}>{g.fase}</Text><Text style={[s.td, s.bold, s.cImp]}>{euroContratto(g.totale)}</Text>
                </View>
                {g.righe.map((r, i) => (
                  <View key={i} style={s.tRiga} wrap={false}>
                    {codici.perRiga && <Text style={s.cCod}>{r.codice ?? ""}</Text>}
                    <Text style={[s.td, s.cDesc]}>{r.descrizione}{r.comprende ? ` (${testoComprende(r.comprende)})` : ""}</Text>
                    <Text style={[s.td, s.cUm]}>{r.unita ?? ""}</Text>
                    <Text style={[s.td, s.cNum]}>{quantitaContratto(r.quantita)}</Text>
                    <Text style={[s.td, s.cPrz]}>{euroContratto(r.prezzo)}</Text>
                    <Text style={[s.td, s.cImp]}>{euroContratto(r.importo)}</Text>
                  </View>
                ))}
              </View>
            ))}
            {elencoDiverso && (
              <Text style={[s.allegatoSotto, { marginTop: 6 }]}>
                Totale dell'elenco {euroContratto(totaleElenco)}; corrispettivo pattuito {euroContratto(eco.lavori)}. Si contabilizzano le quantità eseguite ai prezzi unitari dell'elenco.
              </Text>
            )}
          </View>
        )}

        {/* Riquadro economico: quanto vale, come si fattura, quanto si paga. */}
        <View style={s.economico} wrap={false}>
          {elenco.length === 0 && <TitoloSezione accento={accento}>Corrispettivo e pagamenti · importi in euro</TitoloSezione>}
          {/* Senza oneri lavori e imponibile sono la stessa cifra: una riga sola. */}
          <RigaEco label={`${elenco.length ? `Totale lavori (${elenco.length} ${elenco.length === 1 ? "voce" : "voci"})` : "Lavori"}${eco.oneri > 0 ? "" : " · imponibile"}`} valore={euroContratto(eco.lavori)} forte={eco.oneri <= 0} />
          {eco.oneri > 0 && <RigaEco label="Oneri della sicurezza (non soggetti a ribasso)" valore={euroContratto(eco.oneri)} />}
          {eco.oneri > 0 && <RigaEco label="Imponibile" valore={euroContratto(eco.imponibile)} forte />}
          <RigaEco
            label={eco.reverseCharge ? "IVA: inversione contabile (art. 17 c. 6 lett. a DPR 633/72)" : `IVA ${eco.ivaPct}%`}
            valore={eco.reverseCharge ? "reverse charge" : euroContratto(eco.iva)}
          />
          {!eco.reverseCharge && <RigaEco label="Totale fattura" valore={euroContratto(eco.totaleFattura)} forte />}
          {eco.ritenutaPct > 0 && <RigaEco label={`Ritenuta di garanzia ${eco.ritenutaPct}% (svincolo dopo ${d.durataGaranziaMesi} mesi)`} valore={`- ${euroContratto(eco.ritenuta)}`} colore={colore.avviso} />}
          <RigaEcoTotale label={eco.ritenutaPct > 0 ? "Da pagare ai SAL, al netto della ritenuta" : "Da pagare ai SAL"} valore={euroContratto(eco.nettoAiSal)} accento={accento} />
          <Text style={s.ecoNota}>
            <Text style={s.bold}>Modalità di pagamento: </Text>
            {d.modalitaPagamento?.trim() || "SAL dell'elenco pagamenti allegato; fattura pagata entro 7 giorni lavorativi dalla consegna nel cassetto fiscale dell'Affidataria."}
            {"  "}Pagamenti subordinati al DURC regolare.
          </Text>
        </View>

        {articoli.map((art, i) => (
          <View key={art.titolo} wrap>
            {/* Il titolo sta col suo primo paragrafo: mai da solo in fondo al foglio. */}
            <View wrap={false}>
              <Text style={s.art}>Art. {i + 1} – {art.titolo}</Text>
              <Text style={s.para}>{art.paragrafi[0]}</Text>
            </View>
            {art.paragrafi.slice(1).map((p, j) => <Text key={j} style={s.para}>{p}</Text>)}
          </View>
        ))}

        <View wrap={false}>
          <Text style={s.luogo}>Luogo e data ______________________________</Text>
          <Firme voci={[`L'Affidataria${a.rappresentante ? ` (${a.rappresentante})` : ""}`, "Il Subappaltatore"]} />
        </View>
        <View wrap={false}>
          <Text style={s.clausole}>
            Ai sensi degli artt. 1341 e 1342 c.c. il Subappaltatore approva specificamente: {articoliDaApprovare(articoli)}.
          </Text>
          <Firme voci={["", "Il Subappaltatore"]} />
        </View>


      </Page>
    </Document>
  );
}

/** Il PDF come Blob, pronto da caricare. */
export async function generaPdfContrattoSubappalto(d: DatiContrattoSubappalto): Promise<Blob> {
  return pdf(<ContrattoSubappaltoPDF d={d} />).toBlob();
}

/** Elenco dei lavori senza cifre, da lasciare in cantiere: stessa testata e stessa tabella dei documenti. */
export async function generaPdfElencoCantiere(d: DatiContrattoSubappalto): Promise<Blob> {
  const gruppi = elencoCantiereSenzaCifre(d);
  const companyId = d.veste?.companyId ?? null;
  const accento = accentoPdf(companyId, d.veste?.colore);
  const righePiede = [d.committente.ragioneSociale].filter(Boolean);
  return pdf(
    <Document title={`Elenco lavori ${d.commessa.codice}`} author={d.committente.ragioneSociale} producer="Edilizia in Cloud">
      <Page size="A4" style={[s.pagina, { paddingBottom: margineInferioreDocumento(null, righePiede.length) }]}>
        <PiedeDocumento righe={righePiede} />
        <TestataDocumento logo={d.veste?.logoUrl} ragioneSociale={d.committente.ragioneSociale} companyId={companyId} accento={accento}
          titolo="Elenco lavori"
          sotto={[[`ditta ${d.subappaltatore.ragioneSociale}`, `commessa ${d.commessa.codice}`].join(" · "), d.commessa.indirizzoCantiere && `cantiere ${d.commessa.indirizzoCantiere}`]} />
        <View style={s.tTesta} fixed>
          <Text style={[s.th, s.cDesc]}>Descrizione</Text><Text style={[s.th, { width: 50 }]}>U.M.</Text><Text style={[s.th, { width: 60, textAlign: "right", paddingRight: 6 }]}>Quantità</Text>
        </View>
        {gruppi.map((g) => (
          <View key={g.fase}>
            <View style={s.tFase} wrap={false} minPresenceAhead={30}><Text style={[s.td, s.bold, s.cDesc]}>{g.fase}</Text></View>
            {g.righe.map((r, i) => (
              <View key={i} style={s.tRiga} wrap={false}>
                <Text style={[s.td, s.cDesc]}>{r.descrizione}</Text>
                <Text style={[s.td, { width: 50 }]}>{r.unita}</Text>
                <Text style={[s.td, { width: 60, textAlign: "right", paddingRight: 6 }]}>{r.quantita}</Text>
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>,
  ).toBlob();
}
