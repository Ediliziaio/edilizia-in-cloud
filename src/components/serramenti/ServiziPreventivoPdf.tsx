import { Text, View } from "@react-pdf/renderer";
import type { SrServizioRow } from "@/types/serramenti";
import { calcolaTotale } from "@/lib/serramenti/calcoli";

export function ServiziPreventivoPdf({ servizi, mostraImporti }: { servizi: SrServizioRow[]; mostraImporti: boolean }) {
  if (!servizi.length) return null;
  return <View style={{ marginTop: 12, marginBottom: 12 }}>
    <Text style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Servizi inclusi nel preventivo</Text>
    {mostraImporti && <Text style={{ fontSize: 8, marginBottom: 6 }}>Importi prima dello sconto globale e dell’IVA</Text>}
    {servizi.map(s => <View key={s.id} wrap={false} style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 10 }}>{s.descrizione || "Servizio"}</Text>
      <Text style={{ fontSize: 9 }}>
        Quantità {Number(s.quantita ?? 1).toLocaleString("it-IT")} {s.unita ?? ""}
        {mostraImporti ? ` · € ${calcolaTotale([], [], { iva_percentuale: 0 }, [s]).imponibile_servizi.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
      </Text>
    </View>)}
  </View>;
}
