import { Image, Text, View } from "@react-pdf/renderer";
import type { SrPercorsoFase } from "@/types/serramenti";
import type { FotoPianoLavoriPdf } from "@/lib/serramenti/fotoPianoLavoriPdf";
import { altezzaTesto } from "@/components/preventivi/pdf/misuraTesto";
import { IconaPdf } from "@/components/preventivi/pdf/IconaPdf";
import { ALTEZZA_UTILE, UTILE_PAGINA } from "./impaginaSerramento";
import { fondoPerTestoBianco } from "../../../supabase/functions/_shared/temaColori";

const distanza = 18;
const colonna = (UTILE_PAGINA - distanza) / 2;
const dettagli = (f: SrPercorsoFase) => [
  ["COSA FAREMO", f.attivita_azienda],
  ["DA CONFERMARE INSIEME", f.conferma_cliente],
  ["TEMPI E CONDIZIONI", f.tempistiche],
] as const;

function altezzaFase(fase: SrPercorsoFase, foto: boolean) {
  const width = colonna - 20;
  return 50 + (foto ? 82 : 0) + altezzaTesto(fase.nome, width - 44, "Helvetica-Bold", 13, 1.2)
    + fase.step.reduce((sum, step) => sum + 4 + altezzaTesto(step, width - 10, "Helvetica", 9.5, 1.4), 0)
    + dettagli(fase).reduce((sum, [, text]) => sum + (text?.trim() ? 18 + altezzaTesto(text, width, "Helvetica", 8.8, 1.35) : 0), 0);
}

function icona(fase: SrPercorsoFase) {
  if (/riliev|misur|sopralluog/i.test(fase.nome)) return "misura";
  if (/consegn|collaud/i.test(fase.nome)) return "conformita";
  if (/posa|montagg|install/i.test(fase.nome)) return "installazione";
  if (/conferm|approv|ordine/i.test(fase.nome)) return "conformita";
  return "progettazione";
}

export function PianoLavoriEditorialePdf({ fasi, colore, foto }: { fasi: SrPercorsoFase[]; colore: string; foto?: FotoPianoLavoriPdf | null }) {
  const fondo = fondoPerTestoBianco(colore);
  const renderFase = (fase: SrPercorsoFase, i: number, width: number, spezzabile = false) => <View key={i} wrap={spezzabile} style={{ width }}>
    <View wrap={false}>
      {foto?.fasi[i] && <Image src={foto.fasi[i]!} style={{ width: "100%", height: 82, objectFit: "cover", marginBottom: 8 }} />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 4, backgroundColor: fondo, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF" }}>{String(i + 1).padStart(2, "0")}</Text>
        </View>
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 1.2, fontWeight: 700, color: colore }}>{fase.nome}</Text>
        <IconaPdf nome={icona(fase)} colore={colore} lato={20} />
      </View>
    </View>
    {fase.step.map((step, si) => <View key={si} wrap={step.length > 600} style={{ flexDirection: "row", gap: 7, marginBottom: 4 }}>
      <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colore, marginTop: 5 }} />
      <Text style={{ flex: 1, fontSize: 9.5, lineHeight: 1.4, color: "#334155" }}>{step}</Text>
    </View>)}
    {dettagli(fase).map(([label, value], ruolo) => value?.trim() ? <View key={label} wrap={value.length > 600} style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: "#DCE4E8" }}>
      <View style={{ flexDirection: "row", gap: 4, alignItems: "center", marginBottom: 3 }}>
        <IconaPdf nome={(["installazione", "contatto", "calendario"] as const)[ruolo]} colore={colore} lato={8} />
        <Text style={{ fontSize: 6.8, fontWeight: 700, color: colore }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 8.8, lineHeight: 1.35, color: "#475569" }}>{value}</Text>
    </View> : null)}
  </View>;
  return <View>
    {fasi.length > 0 && fasi.length <= 6 && fasi.every(f => f.nome.length < 45) && <View wrap={false} style={{ flexDirection: "row", position: "relative", marginBottom: 10 }}>
      <View style={{ position: "absolute", left: `${50 / fasi.length}%`, right: `${50 / fasi.length}%`, top: 15, height: 1.5, backgroundColor: "#CBD5E1" }} />
      {fasi.map((fase, i) => <View key={i} style={{ flex: 1, alignItems: "center" }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colore, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
          <IconaPdf nome={icona(fase)} colore={colore} lato={15} />
        </View>
        <Text style={{ fontSize: 7.5, lineHeight: 1.3, color: colore, marginTop: 5, textAlign: "center", paddingHorizontal: 3 }}>{`${String(i + 1).padStart(2, "0")} · ${fase.nome}`}</Text>
      </View>)}
    </View>}
    {foto?.personalizzata && <Image src={foto.personalizzata} style={{ width: "100%", height: 120, objectFit: "cover", marginBottom: 16 }} />}
    {Array.from({ length: Math.ceil(fasi.length / 2) }, (_, r) => {
      const gruppo = fasi.slice(r * 2, r * 2 + 2);
      const lunga = gruppo.some((fase, j) => altezzaFase(fase, Boolean(foto?.fasi[r * 2 + j])) > ALTEZZA_UTILE - 40);
      return lunga ? <View key={r}>{gruppo.map((fase, j) => <View key={j} style={{ marginBottom: 18 }}>{renderFase(fase, r * 2 + j, UTILE_PAGINA, true)}</View>)}</View>
        : <View key={r} wrap={false} style={{ flexDirection: "row", gap: distanza, marginBottom: 8, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: "#DCE4E8" }}>
          {gruppo.map((fase, j) => renderFase(fase, r * 2 + j, colonna))}
        </View>;
    })}
    {foto?.illustrativa && foto.fasi.some(Boolean) && <Text style={{ fontSize: 7, color: "#64748B", lineHeight: 1.3 }}>
      Immagini generate a scopo illustrativo: non rappresentano prodotti specifici o lavori realizzati dall'azienda.
    </Text>}
  </View>;
}
