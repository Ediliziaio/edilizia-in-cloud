import { Image, Text, View } from "@react-pdf/renderer";
import { fondoPerTestoBianco } from "../../../supabase/functions/_shared/temaColori";
import { codiceRalDaEtichetta, RAL_COLORI } from "@/lib/serramenti/ralColori";
import { immaginiPerPdf, type ImmagineCatalogo } from "@/lib/listino/immaginiCatalogo";

export interface FinituraPreventivoPdf {
  posizioni: number[];
  interno: string | null;
  esterno: string | null;
  altre: Array<{ label: string; value: string }>;
}

/** Product photos are contained, never cropped like an ambient photograph. */
export function PresentazioneProdottoPdf({ immagine, dati, colore, altezzaImmagine = 235, immagini = [] }: {
  immagine: string | null;
  dati: Array<{ etichetta: string; valore: string }>;
  colore: string;
  altezzaImmagine?: number;
  immagini?: ImmagineCatalogo[];
}) {
  const evidenza = dati.filter(d => d.etichetta.length <= 48 && d.valore.length <= 80).slice(0, 3);
  const dettagli = dati.filter(d => !evidenza.includes(d));
  return <View style={{ marginBottom: 12 }}>
    {immagine && <View wrap={false}>
      <Image src={immagine} style={{ width: "100%", height: altezzaImmagine, objectFit: "contain" }} />
      {immagini.find(i => i.url === immagine)?.didascalia ? <Text style={{ fontSize: 9, color: "#334155", marginTop: 5 }}>{immagini.find(i => i.url === immagine)!.didascalia}</Text> : null}
      <Text style={{ fontSize: 7.5, color: "#64748B", marginTop: 6, marginBottom: 12, lineHeight: 1.35 }}>
        Immagine di catalogo. Configurazione e finiture effettive sono quelle dell'abaco e delle scelte riportate nell'offerta.
      </Text>
    </View>}
    {evidenza.length > 0 && <View wrap={false} style={{ flexDirection: "row", backgroundColor: fondoPerTestoBianco(colore), padding: 14, gap: 14 }}>
      {evidenza.map((dato, i) => <View key={i} style={{ flex: 1 }}>
        <Text style={{ fontSize: 8, color: "#FFFFFF", lineHeight: 1.3, marginBottom: 6 }}>{dato.etichetta}</Text>
        <Text style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.3 }}>{dato.valore}</Text>
      </View>)}
    </View>}
    {dettagli.map((dato, i) => <View key={i} wrap={dato.valore.length > 600 || dato.etichetta.length > 600} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", paddingVertical: 8 }}>
      <Text style={{ width: "45%", paddingRight: 10, fontSize: 9, color: "#64748B" }}>{dato.etichetta}</Text>
      <Text style={{ flex: 1, fontSize: 10, color: "#0F172A", lineHeight: 1.4 }}>{dato.valore}</Text>
    </View>)}
    {dati.some(d => `${d.etichetta} ${d.valore}`.toLowerCase().includes("uw")) && <Text style={{ fontSize: 8, lineHeight: 1.4, color: "#475569", marginTop: 8 }}>Uw descrive la trasmittanza del serramento completo: a parita di condizioni, un valore inferiore indica minore trasmissione di calore. Il dato deve riferirsi a dimensioni e configurazione pertinenti; da solo non quantifica il risparmio in bolletta.</Text>}
    {(() => {
      const altre = immaginiPerPdf(immagini).filter(i => i.url !== immagine);
      return Array.from({ length: Math.ceil(altre.length / 2) }, (_, r) => <View key={r} wrap={false} style={{ flexDirection: "row", gap: 14, marginTop: 14 }}>
        {altre.slice(r * 2, r * 2 + 2).map(i => <View key={i.id} style={{ flex: 1 }}>
          <Image src={i.url} style={{ width: "100%", height: 125, objectFit: "contain" }} />
          <Text style={{ fontSize: 8, color: "#475569", marginTop: 5, lineHeight: 1.35 }}>{i.didascalia || (i.ruolo === "sezione" ? "Sezione tecnica del produttore" : "Dettaglio del prodotto")}</Text>
        </View>)}
      </View>);
    })()}
  </View>;
}

function CampioneRal({ testo }: { testo: string }) {
  const ral = codiceRalDaEtichetta(testo);
  const colore = ral ? RAL_COLORI[ral] : null;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
    {colore && <View style={{ width: 26, height: 26, backgroundColor: colore.hex, borderWidth: 0.5, borderColor: "#CBD5E1" }} />}
    <Text style={{ flex: 1, fontSize: 11, lineHeight: 1.4, color: "#0F172A" }}>{testo}</Text>
  </View>;
}

export function FinitureSceltePdf({ finitura, colore }: { finitura: FinituraPreventivoPdf; colore: string }) {
  return <View style={{ marginBottom: 12 }}>
    <View wrap={false} style={{ borderTopWidth: 2, borderTopColor: colore, paddingTop: 10 }}>
      <Text style={{ fontSize: 10, fontWeight: 700, color: colore, marginBottom: 12 }}>
        {`Posizion${finitura.posizioni.length === 1 ? "e" : "i"} abaco: ${finitura.posizioni.join(", ")}`}
      </Text>
      <View style={{ flexDirection: "row", gap: 18 }}>
        {([['Lato interno', finitura.interno], ['Lato esterno', finitura.esterno]] as const).map(([label, value]) => value ? <View key={label} style={{ flex: 1 }}>
          <Text style={{ fontSize: 8, color: "#64748B", marginBottom: 6 }}>{label}</Text>
          <CampioneRal testo={value} />
        </View> : null)}
      </View>
    </View>
    {finitura.altre.map((voce, i) => <View key={i} wrap={false} style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
      <Text style={{ width: "30%", fontSize: 9, color: "#64748B" }}>{voce.label}</Text>
      <Text style={{ flex: 1, fontSize: 10, color: "#0F172A", lineHeight: 1.4 }}>{voce.value}</Text>
    </View>)}
  </View>;
}
