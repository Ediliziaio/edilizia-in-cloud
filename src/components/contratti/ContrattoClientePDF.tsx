/**
 * Il contratto col committente, impostato come quello di subappalto (09/11/2026).
 *
 * Florin: «il contratto d'appalto è come quello del subappaltatore, con la tabella coi lavori da fare». Le due
 * parti, il cantiere, il riquadro economico, gli articoli, le firme, l'approvazione specifica e in Allegato A
 * l'elenco dei lavori. Serve a due strade: il contratto di una commessa e l'accordo col committente (col listino).
 */
import { Document, Page, Text, View, pdf } from "@react-pdf/renderer";
import { PieSocietario } from "@/components/preventivi/pdf/FoglioCondizioniPDF";
import { BLU, RigaEco, chiaro, stiliContratto as s } from "@/components/subappaltatori/ContrattoSubappaltoPDF";
import { elencoPerFase, euroContratto, quantitaContratto, totaleElencoLavori, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import type { ArticoloCliente, DatiContrattoCliente } from "@/lib/contratti/contrattoCliente";

function Articoli({ articoli, colore }: { articoli: ArticoloCliente[]; colore: string }) {
  let numero = 0;
  return (
    <>
      {articoli.map((a, i) => {
        if (a.fascia) return <Text key={i} style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5, color: colore, marginTop: 14, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.6 }} minPresenceAhead={60}>{a.titolo}</Text>;
        numero += 1;
        return (
          <View key={i} wrap>
            <View wrap={false}>
              <Text style={[s.art, { color: colore }]}>Art. {numero} – {a.titolo}</Text>
              {!!a.paragrafi[0] && <Text style={s.para}>{a.paragrafi[0]}</Text>}
            </View>
            {a.paragrafi.slice(1).map((p, j) => <Text key={j} style={s.para}>{p}</Text>)}
          </View>
        );
      })}
    </>
  );
}

function Elenco({ d, colore, tenue }: { d: DatiContrattoCliente; colore: string; tenue: string }) {
  const totale = totaleElencoLavori(d.elenco);
  return (
    <View break>
      <Text style={[s.allegatoTitolo, { color: colore }]}>{d.titoloElenco}</Text>
      <Text style={s.allegatoSotto}>{d.sottoElenco}</Text>
      <View style={[s.tTesta, { backgroundColor: colore }]} fixed>
        <Text style={s.cDesc}>Descrizione</Text><Text style={s.cUm}>U.M.</Text>
        {!d.soloPrezzi && <Text style={s.cNum}>Quantità</Text>}
        <Text style={s.cPrz}>Prezzo</Text>
        {!d.soloPrezzi && <Text style={s.cImp}>Importo</Text>}
      </View>
      {elencoPerFase(d.elenco).map((g) => (
        <View key={g.fase}>
          <View style={[s.tFase, { backgroundColor: tenue }]} wrap={false} minPresenceAhead={30}>
            <Text style={s.cDesc}>{g.fase}</Text>
            {!d.soloPrezzi && <Text style={s.cImp}>{euroContratto(g.totale)}</Text>}
          </View>
          {g.righe.map((r: RigaElencoLavori, i: number) => (
            <View key={i} style={s.tRiga} wrap={false}>
              <Text style={s.cDesc}>{r.descrizione}</Text>
              <Text style={s.cUm}>{r.unita ?? ""}</Text>
              {!d.soloPrezzi && <Text style={s.cNum}>{quantitaContratto(r.quantita)}</Text>}
              <Text style={s.cPrz}>{euroContratto(r.prezzo)}</Text>
              {!d.soloPrezzi && <Text style={s.cImp}>{euroContratto(r.importo)}</Text>}
            </View>
          ))}
        </View>
      ))}
      {!d.soloPrezzi && (
        <View style={[s.tFase, { backgroundColor: colore, marginTop: 8 }]} wrap={false}>
          <Text style={[s.cDesc, { color: "#fff" }]}>Totale lavori (imponibile)</Text>
          <Text style={[s.cImp, { color: "#fff" }]}>{euroContratto(totale)}</Text>
        </View>
      )}
      <View style={s.firme} wrap={false}>
        <Text style={s.firma}>{d.firme.sinistra}</Text>
        <Text style={s.firma}>{d.firme.destra}, per accettazione</Text>
      </View>
    </View>
  );
}

export function ContrattoClientePDF({ d }: { d: DatiContrattoCliente }) {
  const c = BLU;
  const tenue = chiaro(c, 0.9);
  const a = d.impresa;
  const b = d.committente;
  return (
    <Document title={`${d.titolo} ${d.numero ?? ""}`.trim()} author={a.ragioneSociale} producer="Edilizia in Cloud">
      <Page size="A4" style={[s.pagina, { paddingTop: 44 }]}>
        <PieSocietario righe={d.societarie} margine={44} />
        <View style={[s.fascia, { backgroundColor: c }]}>
          <Text style={s.titolo}>{d.titolo.toUpperCase()}</Text>
          <Text style={s.sottoTitolo}>{d.sottotitolo}</Text>
        </View>
        <View style={s.parti}>
          <View style={[s.parte, { borderTopColor: c }]}>
            <Text style={s.etichetta}>{d.etichettaImpresa}</Text>
            <Text style={s.nome}>{a.ragioneSociale || "—"}</Text>
            <Text style={s.riga}>P.IVA {a.partitaIva || "—"}{a.codiceFiscale && a.codiceFiscale !== a.partitaIva ? ` · C.F. ${a.codiceFiscale}` : ""}</Text>
            {!!a.sede && <Text style={s.riga}>Sede: {a.sede}</Text>}
            {!!a.pec && <Text style={s.riga}>PEC {a.pec}</Text>}
          </View>
          <View style={[s.parte, { borderTopColor: c }]}>
            <Text style={s.etichetta}>COMMITTENTE</Text>
            <Text style={s.nome}>{b.nome || "—"}</Text>
            <Text style={s.riga}>{b.partitaIva ? `P.IVA ${b.partitaIva}` : b.codiceFiscale ? `C.F. ${b.codiceFiscale}` : "C.F. / P.IVA ________________"}{b.partitaIva && b.codiceFiscale && b.codiceFiscale !== b.partitaIva ? ` · C.F. ${b.codiceFiscale}` : ""}</Text>
            <Text style={s.riga}>Indirizzo: {b.indirizzo || "________________________________"}</Text>
            {(!!b.email || !!b.telefono) && <Text style={s.riga}>{[b.email, b.telefono && `Tel. ${b.telefono}`].filter(Boolean).join(" · ")}</Text>}
          </View>
        </View>
        {d.cantiere.length > 0 && (
          <View style={[s.cantiere, { backgroundColor: tenue }]}>
            {d.cantiere.map(([etichetta, valore]) => <Text key={etichetta} style={s.cella}><Text style={s.bold}>{etichetta} </Text>{valore}</Text>)}
          </View>
        )}
        <View style={s.economico} wrap={false}>
          <View style={[s.ecoTotale, { backgroundColor: c }]}>
            <Text style={[s.bold, { color: "#fff" }]}>{d.economico.titolo}</Text>
            <Text style={{ color: "#fff", fontSize: 8 }}>{d.economico.destra ?? ""}</Text>
          </View>
          {d.economico.righe.map((r) => <RigaEco key={r.label} label={r.label} valore={r.valore} forte={r.forte} />)}
          {!!d.economico.nota && <Text style={s.ecoNota}>{d.economico.nota}</Text>}
        </View>
        <Articoli articoli={d.articoli} colore={c} />
        <View wrap={false}>
          <Text style={s.luogo}>Luogo e data ______________________________</Text>
          <View style={s.firme}>
            <Text style={s.firma}>{d.firme.sinistra}</Text>
            <Text style={s.firma}>{d.firme.destra}</Text>
          </View>
        </View>
        {d.daApprovare.length > 0 && (
          <View wrap={false}>
            <Text style={[s.clausole, { backgroundColor: tenue }]}>
              Ai sensi degli artt. 1341 e 1342 c.c. {d.firme.destra.replace(/^Il /, "il ")} approva specificamente: {d.daApprovare.join("; ")}.
            </Text>
            <View style={s.firme}>
              <Text style={{ flex: 1 }} />
              <Text style={s.firma}>{d.firme.destra}</Text>
            </View>
          </View>
        )}
        {d.elenco.length > 0 && <Elenco d={d} colore={c} tenue={tenue} />}
      </Page>
    </Document>
  );
}

export async function contrattoClienteBlob(d: DatiContrattoCliente): Promise<Blob> {
  return pdf(<ContrattoClientePDF d={d} />).toBlob();
}
