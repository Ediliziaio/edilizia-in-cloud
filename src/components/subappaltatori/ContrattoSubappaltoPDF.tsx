/**
 * Il PDF del contratto di subappalto che si manda in firma: stesso testo della
 * stampa (`articoliContratto`), testo vero e selezionabile, A4. Il PDF viene
 * congelato all'invio: chi firma vede esattamente questo, e il PDF firmato
 * (timbro su ogni pagina + certificato) si costruisce su questi byte.
 */
import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import {
  ARTICOLI_APPROVAZIONE_SPECIFICA, articoliContratto, dataContratto, elencoPerFase, euroContratto, quantitaContratto,
  totaleElencoLavori, type DatiContrattoSubappalto,
} from "@/lib/subappaltatori/contrattoSubappaltoHtml";

Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  pagina: { paddingTop: 42, paddingBottom: 48, paddingHorizontal: 46, fontSize: 9.5, fontFamily: "Helvetica", lineHeight: 1.45, color: "#111" },
  titolo: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center" },
  sotto: { textAlign: "center", color: "#555", marginTop: 3, marginBottom: 14 },
  parti: { flexDirection: "row", gap: 10, marginBottom: 10 },
  parte: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 4, padding: 7 },
  bold: { fontFamily: "Helvetica-Bold" },
  art: { fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 2, fontSize: 10 },
  para: { marginBottom: 3 },
  firme: { flexDirection: "row", gap: 30, marginTop: 34 },
  firma: { flex: 1, borderTopWidth: 1, borderTopColor: "#333", paddingTop: 4, textAlign: "center", fontSize: 9 },
  clausole: { marginTop: 18, fontSize: 8.5 },
  piedeSx: { position: "absolute", bottom: 22, left: 46, fontSize: 7.5, color: "#777" },
  // Allegato A: l'elenco dei lavori (31/10/2026).
  riga: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#999", paddingVertical: 2.5 },
  testa: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingVertical: 3, fontFamily: "Helvetica-Bold", backgroundColor: "#eee" },
  rigaFase: { flexDirection: "row", paddingVertical: 3, marginTop: 4, backgroundColor: "#f2f2f2", fontFamily: "Helvetica-Bold" },
  cDesc: { flex: 1, paddingHorizontal: 3 },
  cUm: { width: 34, paddingHorizontal: 3 },
  cNum: { width: 62, paddingHorizontal: 3, textAlign: "right" },
  cImp: { width: 72, paddingHorizontal: 3, textAlign: "right" },
});

export function ContrattoSubappaltoPDF({ d }: { d: DatiContrattoSubappalto }) {
  const articoli = articoliContratto(d);
  return (
    <Document title={`Contratto di subappalto ${d.numero ?? ""}`.trim()} author={d.committente.ragioneSociale} producer="Edilizia in Cloud">
      <Page size="A4" style={s.pagina}>
        <Text style={s.titolo}>CONTRATTO DI SUBAPPALTO</Text>
        <Text style={s.sotto}>{d.numero ? `N. ${d.numero} · ` : ""}stipulato il {dataContratto(d.dataStipula)}</Text>
        <View style={s.parti}>
          <View style={s.parte}>
            <Text style={s.bold}>Committente (impresa affidataria)</Text>
            <Text>{d.committente.ragioneSociale}</Text>
            <Text>P.IVA {d.committente.partitaIva || "—"}</Text>
            {!!d.committente.indirizzo && <Text>{d.committente.indirizzo}</Text>}
            {!!d.committente.rappresentante && <Text>rappresentata da {d.committente.rappresentante}</Text>}
          </View>
          <View style={s.parte}>
            <Text style={s.bold}>Subappaltatore</Text>
            <Text>{d.subappaltatore.ragioneSociale}</Text>
            <Text>P.IVA {d.subappaltatore.partitaIva || "—"}</Text>
            {!!d.subappaltatore.indirizzo && <Text>{d.subappaltatore.indirizzo}</Text>}
            {!!d.subappaltatore.pec && <Text>PEC {d.subappaltatore.pec}</Text>}
          </View>
        </View>
        <Text>Cliente finale dell'opera: {d.commessa.cliente || "—"}.</Text>
        {articoli.map((a, i) => (
          <View key={a.titolo} wrap>
            <Text style={s.art}>Art. {i + 1} – {a.titolo}</Text>
            {a.paragrafi.map((p, j) => <Text key={j} style={s.para}>{p}</Text>)}
          </View>
        ))}
        <View style={s.firme} wrap={false}>
          <Text style={s.firma}>Il Committente</Text>
          <Text style={s.firma}>Il Subappaltatore</Text>
        </View>
        <View wrap={false}>
          <Text style={s.clausole}>
            Ai sensi degli artt. 1341 e 1342 c.c. il Subappaltatore approva specificamente gli articoli: {ARTICOLI_APPROVAZIONE_SPECIFICA.join(", ")}.
          </Text>
          <View style={s.firme}>
            <Text style={{ flex: 1 }} />
            <Text style={s.firma}>Il Subappaltatore</Text>
          </View>
        </View>
        {!!d.elencoLavori?.length && (
          <View break>
            <Text style={s.titolo}>ALLEGATO A – ELENCO DEI LAVORI</Text>
            <Text style={s.sotto}>Commessa {d.commessa.codice} · {d.subappaltatore.ragioneSociale} · prezzi IVA esclusa</Text>
            <View style={s.testa} fixed>
              <Text style={s.cDesc}>Descrizione</Text><Text style={s.cUm}>U.M.</Text>
              <Text style={s.cNum}>Quantità</Text><Text style={s.cNum}>Prezzo</Text><Text style={s.cImp}>Importo</Text>
            </View>
            {elencoPerFase(d.elencoLavori).map((g) => (
              <View key={g.fase}>
                <View style={s.rigaFase} wrap={false}>
                  <Text style={s.cDesc}>{g.fase}</Text><Text style={s.cImp}>{euroContratto(g.totale)}</Text>
                </View>
                {g.righe.map((r, i) => (
                  <View key={i} style={s.riga} wrap={false}>
                    <Text style={s.cDesc}>{r.codice ? `${r.codice} · ` : ""}{r.descrizione}</Text>
                    <Text style={s.cUm}>{r.unita ?? ""}</Text>
                    <Text style={s.cNum}>{quantitaContratto(r.quantita)}</Text>
                    <Text style={s.cNum}>{euroContratto(r.prezzo)}</Text>
                    <Text style={s.cImp}>{euroContratto(r.importo)}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={[s.rigaFase, { marginTop: 6 }]} wrap={false}>
              <Text style={s.cDesc}>Totale lavori</Text><Text style={s.cImp}>{euroContratto(totaleElencoLavori(d.elencoLavori))}</Text>
            </View>
            <View style={s.firme} wrap={false}>
              <Text style={s.firma}>Il Committente</Text>
              <Text style={s.firma}>Il Subappaltatore, per accettazione</Text>
            </View>
          </View>
        )}
        {/* Piè di pagina su ogni pagina (la firma aggiunge poi il timbro su ognuna). */}
        <Text style={s.piedeSx} fixed>{`Contratto di subappalto${d.numero ? ` ${d.numero}` : ""} · ${d.commessa.codice}`}</Text>
      </Page>
    </Document>
  );
}

/** Il PDF come Blob, pronto da caricare. */
export async function generaPdfContrattoSubappalto(d: DatiContrattoSubappalto): Promise<Blob> {
  return pdf(<ContrattoSubappaltoPDF d={d} />).toBlob();
}
