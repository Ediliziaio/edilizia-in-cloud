/**
 * Il contratto col committente, impostato come quello di subappalto (09/11/2026).
 *
 * Florin: «il contratto d'appalto è come quello del subappaltatore, con la tabella coi lavori da fare». Le due
 * parti, il cantiere, il riquadro economico, gli articoli, le firme, l'approvazione specifica e in Allegato A
 * l'elenco dei lavori. Serve a due strade: il contratto di una commessa e l'accordo col committente (col listino).
 * Dal 10/11/2026 con lo stile unico dei documenti: testata col logo, niente fasce colorate.
 */
import { Document, Page, Text, View, pdf } from "@react-pdf/renderer";
import { RigaEco, RigaEcoTotale, stiliContratto as s } from "@/components/subappaltatori/ContrattoSubappaltoPDF";
import { Firme, PiedeDocumento, TestataDocumento, TitoloSezione, accentoPdf, margineInferioreDocumento } from "@/components/documenti/stileDocumentoPdf";
import { elencoPerFase, euroContratto, quantitaContratto, totaleElencoLavori, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";
import type { ArticoloCliente, DatiContrattoCliente } from "@/lib/contratti/contrattoCliente";

function Articoli({ articoli, accento }: { articoli: ArticoloCliente[]; accento: string }) {
  let numero = 0;
  return (
    <>
      {articoli.map((a, i) => {
        if (a.fascia) return <TitoloSezione key={i} accento={accento}>{a.titolo}</TitoloSezione>;
        numero += 1;
        return (
          <View key={i} wrap>
            <View wrap={false}>
              <Text style={s.art}>Art. {numero} – {a.titolo}</Text>
              {!!a.paragrafi[0] && <Text style={s.para}>{a.paragrafi[0]}</Text>}
            </View>
            {a.paragrafi.slice(1).map((p, j) => <Text key={j} style={s.para}>{p}</Text>)}
          </View>
        );
      })}
    </>
  );
}

function Elenco({ d, accento }: { d: DatiContrattoCliente; accento: string }) {
  const totale = totaleElencoLavori(d.elenco);
  return (
    <View break>
      <Text style={s.allegatoTitolo}>{d.titoloElenco}</Text>
      <Text style={s.allegatoSotto}>{d.sottoElenco}</Text>
      <View style={s.tTesta} fixed>
        <Text style={[s.th, s.cDesc]}>Descrizione</Text><Text style={[s.th, s.cUm]}>U.M.</Text>
        {!d.soloPrezzi && <Text style={[s.th, s.cNum]}>Quantità</Text>}
        <Text style={[s.th, s.cPrz]}>Prezzo</Text>
        {!d.soloPrezzi && <Text style={[s.th, s.cImp]}>Importo</Text>}
      </View>
      {elencoPerFase(d.elenco).map((g) => (
        <View key={g.fase}>
          <View style={s.tFase} wrap={false} minPresenceAhead={30}>
            <Text style={[s.td, s.bold, s.cDesc]}>{g.fase}</Text>
            {!d.soloPrezzi && <Text style={[s.td, s.bold, s.cImp]}>{euroContratto(g.totale)}</Text>}
          </View>
          {g.righe.map((r: RigaElencoLavori, i: number) => (
            <View key={i} style={s.tRiga} wrap={false}>
              <Text style={[s.td, s.cDesc]}>{r.descrizione}</Text>
              <Text style={[s.td, s.cUm]}>{r.unita ?? ""}</Text>
              {!d.soloPrezzi && <Text style={[s.td, s.cNum]}>{quantitaContratto(r.quantita)}</Text>}
              <Text style={[s.td, s.cPrz]}>{euroContratto(r.prezzo)}</Text>
              {!d.soloPrezzi && <Text style={[s.td, s.cImp]}>{euroContratto(r.importo)}</Text>}
            </View>
          ))}
        </View>
      ))}
      {!d.soloPrezzi && (
        <View style={s.tTotale} wrap={false}>
          <Text style={[s.td, s.bold, s.cDesc]}>Totale lavori (imponibile)</Text>
          <Text style={[s.td, s.bold, s.cImp, { color: accento }]}>{euroContratto(totale)}</Text>
        </View>
      )}
      <Firme voci={[d.firme.sinistra, `${d.firme.destra}, per accettazione`]} />
    </View>
  );
}

export function ContrattoClientePDF({ d }: { d: DatiContrattoCliente }) {
  // Lo stile unico dei documenti (10/11/2026): testata col logo, riquadri tenui, accento dell'azienda.
  const accento = accentoPdf(d.companyId, d.coloreAzienda);
  const a = d.impresa;
  const b = d.committente;
  // Il riquadro economico: l'ultima riga forte è quella che conta (il totale o il netto) e va nell'accento.
  const righeEco = d.economico.righe;
  const ultimaForte = righeEco.map((r) => !!r.forte).lastIndexOf(true);
  return (
    <Document title={`${d.titolo} ${d.numero ?? ""}`.trim()} author={a.ragioneSociale} producer="Edilizia in Cloud">
      <Page size="A4" style={[s.pagina, { paddingBottom: margineInferioreDocumento(d.companyId, d.societarie.length) }]}>
        <PiedeDocumento righe={d.societarie} companyId={d.companyId} />
        <TestataDocumento logo={d.logoUrl} ragioneSociale={a.ragioneSociale} companyId={d.companyId} accento={accento}
          titolo={d.titolo} sotto={[d.sottotitolo]} />
        <View style={s.parti}>
          <View style={s.parte}>
            <Text style={s.etichetta}>{d.etichettaImpresa}</Text>
            <Text style={s.nome}>{a.ragioneSociale || "—"}</Text>
            <Text style={s.riga}>P.IVA {a.partitaIva || "—"}{a.codiceFiscale && a.codiceFiscale !== a.partitaIva ? ` · C.F. ${a.codiceFiscale}` : ""}</Text>
            {!!a.sede && <Text style={s.riga}>Sede: {a.sede}</Text>}
            {!!a.pec && <Text style={s.riga}>PEC {a.pec}</Text>}
          </View>
          <View style={s.parte}>
            <Text style={s.etichetta}>Committente</Text>
            <Text style={s.nome}>{b.nome || "—"}</Text>
            <Text style={s.riga}>{b.partitaIva ? `P.IVA ${b.partitaIva}` : b.codiceFiscale ? `C.F. ${b.codiceFiscale}` : "C.F. / P.IVA ________________"}{b.partitaIva && b.codiceFiscale && b.codiceFiscale !== b.partitaIva ? ` · C.F. ${b.codiceFiscale}` : ""}</Text>
            <Text style={s.riga}>Indirizzo: {b.indirizzo || "________________________________"}</Text>
            {!!b.rappresentante && <Text style={s.riga}>Rappresentata da {b.rappresentante}</Text>}
            {(!!b.email || !!b.telefono) && <Text style={s.riga}>{[b.email, b.telefono && `Tel. ${b.telefono}`].filter(Boolean).join(" · ")}</Text>}
          </View>
        </View>
        {d.cantiere.length > 0 && (
          <View style={s.cantiere}>
            {d.cantiere.map(([etichetta, valore]) => <Text key={etichetta} style={s.cella}><Text style={s.bold}>{etichetta} </Text>{valore}</Text>)}
          </View>
        )}
        <View style={s.economico} wrap={false}>
          <TitoloSezione accento={accento}>{[d.economico.titolo, d.economico.destra].filter(Boolean).join(" · ")}</TitoloSezione>
          {righeEco.map((r, i) => i === ultimaForte && i === righeEco.length - 1
            ? <RigaEcoTotale key={r.label} label={r.label} valore={r.valore} accento={accento} />
            : <RigaEco key={r.label} label={r.label} valore={r.valore} forte={r.forte} />)}
          {!!d.economico.nota && <Text style={s.ecoNota}>{d.economico.nota}</Text>}
        </View>
        <Articoli articoli={d.articoli} accento={accento} />
        <View wrap={false}>
          <Text style={s.luogo}>Luogo e data ______________________________</Text>
          <Firme voci={[d.firme.sinistra, d.firme.destra]} />
        </View>
        {d.daApprovare.length > 0 && (
          <View wrap={false}>
            <Text style={s.clausole}>
              Ai sensi degli artt. 1341 e 1342 c.c. {d.firme.destra.replace(/^Il /, "il ")} approva specificamente: {d.daApprovare.join("; ")}.
            </Text>
            <Firme voci={["", d.firme.destra]} />
          </View>
        )}
        {d.elenco.length > 0 && <Elenco d={d} accento={accento} />}
      </Page>
    </Document>
  );
}

/**
 * Il PDF come Blob. Logo e colore dell'impresa, se chi chiama non li ha passati, si leggono qui (vesteContratto):
 * così le tre strade (commessa, accordo, pagina del contratto) hanno la stessa testata. Se la lettura fallisce il
 * contratto esce col nome al posto del logo.
 */
export async function contrattoClienteBlob(d: DatiContrattoCliente): Promise<Blob> {
  let dati = d;
  if (d.companyId && d.logoUrl === undefined) {
    try {
      const { vesteContratto } = await import("@/lib/subappaltatori/vesteContratto");
      const veste: { logoUrl: string | null; colore: string | null } = await vesteContratto(d.companyId);
      dati = { ...d, logoUrl: veste.logoUrl, coloreAzienda: d.coloreAzienda ?? veste.colore };
    } catch { /* senza logo: la testata col nome */ }
  }
  return pdf(<ContrattoClientePDF d={dati} />).toBlob();
}
