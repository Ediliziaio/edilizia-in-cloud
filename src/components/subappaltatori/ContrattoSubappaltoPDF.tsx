/**
 * Il PDF del contratto di subappalto che si manda in firma: stesso testo della
 * stampa (`articoliContratto`), testo vero e selezionabile, A4. Il PDF viene
 * congelato all'invio: chi firma vede esattamente questo, e il PDF firmato
 * (timbro su ogni pagina + certificato) si costruisce su questi byte.
 *
 * Impaginato del 31/10/2026 (Dimora Torino): logo dell'impresa in testata, un
 * blu uguale per tutti, le due parti con tutti i dati, il cantiere, il riquadro economico
 * (IVA o reverse charge, ritenuta, netto ai SAL) prima degli articoli, e
 * l'elenco completo dei lavori in Allegato A come nell'ordine.
 */
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import {
  articoliContratto, articoliDaApprovare, dataContratto, elencoPerFase, euroContratto, quantitaContratto,
  codiciElenco, elencoCantiereSenzaCifre, riepilogoEconomicoContratto, totaleElencoLavori, type DatiContrattoSubappalto,
} from "@/lib/subappaltatori/contrattoSubappaltoHtml";

Font.registerHyphenationCallback((word) => [word]);

/** Un blu uguale per tutte le aziende (31/10/2026): il colore del marchio non sempre si legge su un contratto. */
const BLU = "#2b6cb0";
/** Il colore mescolato col bianco: fondi chiari per righe e riquadri. */
function chiaro(hex: string, quanto: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * quanto));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const s = StyleSheet.create({
  pagina: { paddingTop: 92, paddingBottom: 54, paddingHorizontal: 44, fontSize: 9.2, fontFamily: "Helvetica", lineHeight: 1.45, color: "#1f2937" },
  testata: { position: "absolute", top: 24, left: 44, right: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottomWidth: 1.5 },
  logo: { maxHeight: 40, maxWidth: 150, objectFit: "contain" },
  nomeTestata: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  datiTestata: { fontSize: 7.5, color: "#4b5563", textAlign: "right", lineHeight: 1.35 },
  fascia: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 3, marginBottom: 12 },
  titolo: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#fff", letterSpacing: 3 },
  sottoTitolo: { fontSize: 8.5, color: "#fff", marginTop: 2 },
  parti: { flexDirection: "row", gap: 10, marginBottom: 10 },
  parte: { flex: 1, borderWidth: 0.75, borderColor: "#d1d5db", borderTopWidth: 3, borderRadius: 3, padding: 8 },
  etichetta: { fontSize: 7, letterSpacing: 1.2, color: "#6b7280", marginBottom: 3 },
  nome: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  riga: { fontSize: 8.5 },
  bold: { fontFamily: "Helvetica-Bold" },
  cantiere: { borderRadius: 3, padding: 8, marginBottom: 10, flexDirection: "row", flexWrap: "wrap" },
  cella: { width: "50%", fontSize: 8.5, marginBottom: 2 },
  economico: { borderWidth: 0.75, borderColor: "#d1d5db", borderRadius: 3, marginBottom: 12 },
  ecoRiga: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, paddingHorizontal: 9, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  ecoTotale: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, paddingHorizontal: 9 },
  ecoNota: { fontSize: 7.8, color: "#4b5563", paddingHorizontal: 9, paddingVertical: 5 },
  art: { fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 2.5, fontSize: 9.8 },
  para: { marginBottom: 3, textAlign: "justify" },
  firme: { flexDirection: "row", gap: 30, marginTop: 30 },
  firma: { flex: 1, borderTopWidth: 0.75, borderTopColor: "#374151", paddingTop: 4, textAlign: "center", fontSize: 8.5 },
  luogo: { marginTop: 22, fontSize: 8.5 },
  clausole: { marginTop: 16, fontSize: 8.2, padding: 8, borderRadius: 3 },
  piede: { position: "absolute", bottom: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.2, color: "#6b7280", borderTopWidth: 0.5, borderTopColor: "#d1d5db", paddingTop: 5 },
  // Allegato A: l'elenco dei lavori.
  allegatoTitolo: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  allegatoSotto: { fontSize: 8.5, color: "#4b5563", marginBottom: 8 },
  tRiga: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#e5e7eb", paddingVertical: 3 },
  tTesta: { flexDirection: "row", paddingVertical: 4, fontFamily: "Helvetica-Bold", color: "#fff", fontSize: 8 },
  tFase: { flexDirection: "row", paddingVertical: 3.5, marginTop: 5, fontFamily: "Helvetica-Bold" },
  cCod: { width: 46, paddingHorizontal: 4, fontSize: 7.5, color: "#4b5563" },
  cDesc: { flex: 1, paddingHorizontal: 4 },
  cUm: { width: 40, paddingHorizontal: 2, textAlign: "center" },
  cNum: { width: 52, paddingHorizontal: 3, textAlign: "right" },
  cPrz: { width: 64, paddingHorizontal: 3, textAlign: "right" },
  cImp: { width: 72, paddingHorizontal: 4, textAlign: "right" },
});

function RigaEco({ label, valore, forte, colore }: { label: string; valore: string; forte?: boolean; colore?: string }) {
  return (
    <View style={s.ecoRiga}>
      <Text style={forte ? s.bold : {}}>{label}</Text>
      <Text style={[forte ? s.bold : {}, colore ? { color: colore } : {}]}>{valore}</Text>
    </View>
  );
}

export function ContrattoSubappaltoPDF({ d }: { d: DatiContrattoSubappalto }) {
  const articoli = articoliContratto(d);
  const eco = riepilogoEconomicoContratto(d);
  const c = BLU;
  const tenue = chiaro(c, 0.9);
  const a = d.committente;
  const sub = d.subappaltatore;
  const elenco = d.elencoLavori ?? [];
  const totaleElenco = totaleElencoLavori(elenco);
  const elencoDiverso = elenco.length > 0 && Math.abs(totaleElenco - eco.lavori) > 0.005;
  const codici = codiciElenco(elenco);
  return (
    <Document title={`Contratto di subappalto ${d.numero ?? ""}`.trim()} author={a.ragioneSociale} producer="Edilizia in Cloud">
      <Page size="A4" style={s.pagina}>
        {/* Testata su ogni pagina: logo (o nome) e dati dell'impresa. */}
        <View style={[s.testata, { borderBottomColor: c }]} fixed>
          {d.veste?.logoUrl ? <Image src={d.veste.logoUrl} style={s.logo} /> : <Text style={[s.nomeTestata, { color: c }]}>{a.ragioneSociale}</Text>}
          <View>
            <Text style={[s.datiTestata, s.bold]}>{a.ragioneSociale}</Text>
            {!!a.indirizzo && <Text style={s.datiTestata}>{a.indirizzo}</Text>}
            <Text style={s.datiTestata}>{[a.partitaIva && `P.IVA ${a.partitaIva}`, a.telefono && `Tel. ${a.telefono}`].filter(Boolean).join(" · ")}</Text>
            {!!a.email && <Text style={s.datiTestata}>{a.email}</Text>}
          </View>
        </View>

        <View style={[s.fascia, { backgroundColor: c }]}>
          <Text style={s.titolo}>CONTRATTO DI SUBAPPALTO</Text>
          <Text style={s.sottoTitolo}>
            {[d.numero && `N. ${d.numero}`, `stipulato il ${dataContratto(d.dataStipula)}`, d.commessa.codice && `commessa ${d.commessa.codice}`].filter(Boolean).join("  ·  ")}
          </Text>
        </View>

        <View style={s.parti}>
          <View style={[s.parte, { borderTopColor: c }]}>
            <Text style={s.etichetta}>IMPRESA AFFIDATARIA</Text>
            <Text style={s.nome}>{a.ragioneSociale || "—"}</Text>
            <Text style={s.riga}>P.IVA {a.partitaIva || "—"}{a.codiceFiscale && a.codiceFiscale !== a.partitaIva ? ` · C.F. ${a.codiceFiscale}` : ""}</Text>
            {!!a.indirizzo && <Text style={s.riga}>Sede: {a.indirizzo}</Text>}
            {!!a.rappresentante && <Text style={s.riga}>Rappresentata da {a.rappresentante}</Text>}
          </View>
          <View style={[s.parte, { borderTopColor: c }]}>
            <Text style={s.etichetta}>SUBAPPALTATORE</Text>
            <Text style={s.nome}>{sub.ragioneSociale || "—"}</Text>
            <Text style={s.riga}>P.IVA {sub.partitaIva || "________________"}{sub.codiceFiscale ? ` · C.F. ${sub.codiceFiscale}` : ""}</Text>
            <Text style={s.riga}>Sede: {sub.indirizzo || "________________________________"}</Text>
            {(!!sub.pec || !!sub.email) && <Text style={s.riga}>{[sub.pec && `PEC ${sub.pec}`, sub.email && sub.email !== sub.pec && sub.email].filter(Boolean).join(" · ")}</Text>}
            {(!!sub.telefono || !!sub.responsabile) && <Text style={s.riga}>{[sub.responsabile && `Titolare ${sub.responsabile}`, sub.telefono && `Tel. ${sub.telefono}`].filter(Boolean).join(" · ")}</Text>}
            <Text style={s.riga}>Posizioni INAIL, INPS e Cassa Edile: come da DURC allegato</Text>
          </View>
        </View>

        <View style={[s.cantiere, { backgroundColor: tenue }]}>
          <Text style={s.cella}><Text style={s.bold}>Commessa </Text>{d.commessa.codice || "—"}{d.commessa.descrizione ? ` · ${d.commessa.descrizione}` : ""}</Text>
          <Text style={s.cella}><Text style={s.bold}>Committente </Text>{d.commessa.cliente || "—"}</Text>
          <Text style={s.cella}><Text style={s.bold}>Cantiere </Text>{d.commessa.indirizzoCantiere || "—"}</Text>
          <Text style={s.cella}><Text style={s.bold}>Lavori </Text>dal {dataContratto(d.dataInizio)} al {dataContratto(d.dataFinePrevista)}</Text>
        </View>

        {/* Riquadro economico: quanto vale, come si fattura, quanto si paga. */}
        <View style={s.economico} wrap={false}>
          <View style={[s.ecoTotale, { backgroundColor: c }]}>
            <Text style={[s.bold, { color: "#fff" }]}>Corrispettivo e pagamenti</Text>
            <Text style={{ color: "#fff", fontSize: 8 }}>importi in euro</Text>
          </View>
          <RigaEco label={elenco.length ? `Lavori (Allegato A, ${elenco.length} voci${elencoDiverso ? `, a listino ${euroContratto(totaleElenco)}` : ""})` : "Lavori"} valore={euroContratto(eco.lavori)} />
          {eco.oneri > 0 && <RigaEco label="Oneri della sicurezza (non soggetti a ribasso)" valore={euroContratto(eco.oneri)} />}
          <RigaEco label="Imponibile" valore={euroContratto(eco.imponibile)} forte />
          <RigaEco
            label={eco.reverseCharge ? "IVA: inversione contabile (art. 17 c. 6 lett. a DPR 633/72)" : `IVA ${eco.ivaPct}%`}
            valore={eco.reverseCharge ? "reverse charge" : euroContratto(eco.iva)}
          />
          {!eco.reverseCharge && <RigaEco label="Totale fattura" valore={euroContratto(eco.totaleFattura)} forte />}
          {eco.ritenutaPct > 0 && <RigaEco label={`Ritenuta di garanzia ${eco.ritenutaPct}% (svincolo dopo ${d.durataGaranziaMesi} mesi)`} valore={`- ${euroContratto(eco.ritenuta)}`} colore="#b91c1c" />}
          <View style={[s.ecoTotale, { backgroundColor: tenue }]}>
            <Text style={s.bold}>{eco.ritenutaPct > 0 ? "Da pagare ai SAL, al netto della ritenuta" : "Da pagare ai SAL"}</Text>
            <Text style={s.bold}>{euroContratto(eco.nettoAiSal)}</Text>
          </View>
          <Text style={s.ecoNota}>
            <Text style={s.bold}>Modalità di pagamento: </Text>
            {d.modalitaPagamento?.trim() || "SAL dell'elenco pagamenti allegato; fattura pagata entro 7 giorni lavorativi dalla consegna nel cassetto fiscale dell'Affidataria."}
            {"  "}Pagamenti subordinati al DURC regolare.
          </Text>
        </View>

        {articoli.map((art, i) => (
          <View key={art.titolo} wrap>
            <Text style={[s.art, { color: c }]} minPresenceAhead={40}>Art. {i + 1} – {art.titolo}</Text>
            {art.paragrafi.map((p, j) => <Text key={j} style={s.para}>{p}</Text>)}
          </View>
        ))}

        <View wrap={false}>
          <Text style={s.luogo}>Luogo e data ______________________________</Text>
          <View style={s.firme}>
            <Text style={s.firma}>L'Affidataria{a.rappresentante ? ` (${a.rappresentante})` : ""}</Text>
            <Text style={s.firma}>Il Subappaltatore</Text>
          </View>
        </View>
        <View wrap={false}>
          <Text style={[s.clausole, { backgroundColor: tenue }]}>
            Ai sensi degli artt. 1341 e 1342 c.c. il Subappaltatore approva specificamente: {articoliDaApprovare(articoli)}.
          </Text>
          <View style={s.firme}>
            <Text style={{ flex: 1 }} />
            <Text style={s.firma}>Il Subappaltatore</Text>
          </View>
        </View>

        {elenco.length > 0 && (
          <View break>
            <Text style={[s.allegatoTitolo, { color: c }]}>ALLEGATO A – ELENCO DEI LAVORI</Text>
            <Text style={s.allegatoSotto}>
              Commessa {d.commessa.codice}{codici.riferimento ? ` · dal preventivo ${codici.riferimento}` : ""} · {sub.ragioneSociale} · {elenco.length} voci · prezzi IVA esclusa{eco.reverseCharge ? ", fatturazione in reverse charge" : ""}
            </Text>
            <View style={[s.tTesta, { backgroundColor: c }]} fixed>
              {codici.perRiga && <Text style={s.cCod}>Codice</Text>}<Text style={s.cDesc}>Descrizione</Text><Text style={s.cUm}>U.M.</Text>
              <Text style={s.cNum}>Quantità</Text><Text style={s.cPrz}>Prezzo</Text><Text style={s.cImp}>Importo</Text>
            </View>
            {elencoPerFase(elenco).map((g) => (
              <View key={g.fase}>
                <View style={[s.tFase, { backgroundColor: tenue }]} wrap={false} minPresenceAhead={30}>
                  <Text style={s.cDesc}>{g.fase}</Text><Text style={s.cImp}>{euroContratto(g.totale)}</Text>
                </View>
                {g.righe.map((r, i) => (
                  <View key={i} style={s.tRiga} wrap={false}>
                    {codici.perRiga && <Text style={s.cCod}>{r.codice ?? ""}</Text>}
                    <Text style={s.cDesc}>{r.descrizione}</Text>
                    <Text style={s.cUm}>{r.unita ?? ""}</Text>
                    <Text style={s.cNum}>{quantitaContratto(r.quantita)}</Text>
                    <Text style={s.cPrz}>{euroContratto(r.prezzo)}</Text>
                    <Text style={s.cImp}>{euroContratto(r.importo)}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={[s.tFase, { backgroundColor: c, marginTop: 8 }]} wrap={false}>
              <Text style={[s.cDesc, { color: "#fff" }]}>Totale lavori (imponibile)</Text>
              <Text style={[s.cImp, { color: "#fff" }]}>{euroContratto(totaleElenco)}</Text>
            </View>
            {elencoDiverso && (
              <Text style={[s.allegatoSotto, { marginTop: 6 }]}>
                Corrispettivo pattuito nel contratto: {euroContratto(eco.lavori)}. Si contabilizzano le quantità eseguite ai prezzi unitari di questo elenco.
              </Text>
            )}
            <View style={s.firme} wrap={false}>
              <Text style={s.firma}>L'Affidataria</Text>
              <Text style={s.firma}>Il Subappaltatore, per accettazione</Text>
            </View>
          </View>
        )}

        {/* Piè di pagina su ogni pagina (la firma aggiunge poi il timbro su ognuna). */}
        <View style={s.piede} fixed>
          <Text>{`${a.ragioneSociale} · Contratto di subappalto${d.numero ? ` ${d.numero}` : ""} · ${d.commessa.codice}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Il PDF come Blob, pronto da caricare. */
export async function generaPdfContrattoSubappalto(d: DatiContrattoSubappalto): Promise<Blob> {
  return pdf(<ContrattoSubappaltoPDF d={d} />).toBlob();
}

const sCantiere = StyleSheet.create({
  pagina: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  titolo: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#2b6cb0", marginBottom: 4 },
  sotto: { fontSize: 9, color: "#555", marginBottom: 14 },
  fase: { backgroundColor: "#f0f0f0", padding: 4, fontFamily: "Helvetica-Bold", marginTop: 8 },
  riga: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#bbb", paddingVertical: 3 },
  desc: { flex: 1, paddingRight: 8 },
  um: { width: 50 },
  qta: { width: 60, textAlign: "right" },
});

/** Elenco dei lavori senza cifre, da lasciare in cantiere. */
export async function generaPdfElencoCantiere(d: DatiContrattoSubappalto): Promise<Blob> {
  const gruppi = elencoCantiereSenzaCifre(d);
  return pdf(
    <Document title={`Elenco lavori ${d.commessa.codice}`} author={d.committente.ragioneSociale} producer="Edilizia in Cloud">
      <Page size="A4" style={sCantiere.pagina}>
        <Text style={sCantiere.titolo}>ELENCO LAVORI</Text>
        <Text style={sCantiere.sotto}>
          {[d.committente.ragioneSociale, `ditta ${d.subappaltatore.ragioneSociale}`, `commessa ${d.commessa.codice}`, d.commessa.indirizzoCantiere && `cantiere ${d.commessa.indirizzoCantiere}`].filter(Boolean).join(" · ")}
        </Text>
        {gruppi.map((g) => (
          <View key={g.fase}>
            <Text style={sCantiere.fase}>{g.fase}</Text>
            {g.righe.map((r, i) => (
              <View key={i} style={sCantiere.riga} wrap={false}>
                <Text style={sCantiere.desc}>{r.descrizione}</Text>
                <Text style={sCantiere.um}>{r.unita}</Text>
                <Text style={sCantiere.qta}>{r.quantita}</Text>
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>,
  ).toBlob();
}
