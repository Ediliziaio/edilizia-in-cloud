import { Document, Page, Text, View } from "@react-pdf/renderer";
import { stiliContratto as s, RigaEco } from "./ContrattoSubappaltoPDF";
import { PiedeDocumento, TestataDocumento, accentoPdf, margineInferioreDocumento } from "@/components/documenti/stileDocumentoPdf";
import { elencoPerFase, euroContratto, quantitaContratto, testoComprende, totaleElencoLavori, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

export interface DatiComputoSubappalto {
  azienda: string;
  companyId: string;
  ditta: string;
  numero: string;
  commessa: string;
  revisione: number | null;
  bozza: boolean;
  righe: RigaElencoLavori[];
  oneri: number;
}

/** Documento operativo aggiornato, distinto dal PDF originale inviato in firma. */
export function ComputoSubappaltoPDF({ dati: d }: { dati: DatiComputoSubappalto }) {
  const lavori = totaleElencoLavori(d.righe);
  return <Document title={`Computo subappalto ${d.numero}`} author={d.azienda} producer="Edilizia in Cloud">
    <Page size="A4" style={[s.pagina, { paddingBottom: margineInferioreDocumento(null, 1) }]}>
      <PiedeDocumento righe={[d.azienda]} />
      <TestataDocumento ragioneSociale={d.azienda} companyId={d.companyId} accento={accentoPdf(d.companyId)} titolo="Computo del subappalto"
        sotto={[d.ditta, `Commessa ${d.commessa} · Contratto ${d.numero}`, d.revisione == null ? "Elenco del contratto" : `Quadro lavori · revisione ${d.revisione}`]} />
      <Text style={s.allegatoSotto}>{d.bozza ? "BOZZA · Costi proposti da confermare" : "Quadro corrente dei lavori affidati"} · Prezzi IVA esclusa.</Text>
      <View style={s.tTesta} fixed>
        <Text style={[s.th, s.cDesc]}>Lavorazione</Text><Text style={[s.th, s.cUm]}>U.M.</Text>
        <Text style={[s.th, s.cNum]}>Quantità</Text><Text style={[s.th, s.cPrz]}>Prezzo</Text><Text style={[s.th, s.cImp]}>Importo</Text>
      </View>
      {elencoPerFase(d.righe).map((g) => <View key={g.fase}>
        <View style={s.tFase} wrap={false} minPresenceAhead={30}>
          <Text style={[s.td, s.bold, s.cDesc]}>{g.fase}</Text><Text style={[s.td, s.bold, s.cImp]}>{euroContratto(g.totale)}</Text>
        </View>
        {g.righe.map((r, i) => <View key={r.affidamento_id ?? i} style={s.tRiga} wrap={false}>
          <Text style={[s.td, s.cDesc]}>{r.sottofase ? `${r.sottofase}\n` : ""}{r.descrizione}{r.comprende ? ` (${testoComprende(r.comprende)})` : ""}</Text>
          <Text style={[s.td, s.cUm]}>{r.unita ?? ""}</Text><Text style={[s.td, s.cNum]}>{quantitaContratto(r.quantita)}</Text>
          <Text style={[s.td, s.cPrz]}>{euroContratto(r.prezzo)}</Text><Text style={[s.td, s.cImp]}>{euroContratto(r.importo)}</Text>
        </View>)}
      </View>)}
      <View wrap={false} style={{ marginTop: 8 }}>
        <RigaEco label="Totale lavori" valore={euroContratto(lavori)} />
        {d.oneri > 0 && <RigaEco label="Oneri sicurezza" valore={euroContratto(d.oneri)} />}
        <RigaEco label="Totale IVA esclusa" valore={euroContratto(lavori + d.oneri)} forte />
        <Text style={s.ecoNota}>Riepilogo operativo del contratto e delle varianti registrate. Le condizioni concordate e i documenti firmati si consultano nel contratto.</Text>
      </View>
    </Page>
  </Document>;
}
