import { Image, Text, View } from "@react-pdf/renderer";
import { avvisoIpotesi, beneficioMateriale, confrontoUw, LAVORAZIONI_POSA, OBIETTIVI_INFISSI, PROBLEMI_INFISSI, SCENARI_ESISTENTI, type AnalisiIntervento } from "@/lib/serramenti/analisiIntervento";

const testo = { fontSize: 10, lineHeight: 1.5, color: "#334155" };
const titolo = { fontSize: 15, fontWeight: 700 as const, marginBottom: 8, color: "#0F172A" };
export function SintesiAnalisiPdf({ analisi: a, materiale, colore }: { analisi: AnalisiIntervento; materiale?: string | null; colore: string }) {
  const s = SCENARI_ESISTENTI[a.esistente];
  return <View style={{ borderLeftWidth: 3, borderLeftColor: colore, paddingLeft: 12, marginVertical: 14 }}>
    <Text style={titolo} minPresenceAhead={60}>La scelta, per la tua casa</Text>
    <Text style={testo}>Punto di partenza: {s.nome}{a.vetro !== "da_rilevare" ? `, vetro ${a.vetro}` : ", vetro da rilevare"}.</Text>
    {a.problemi.length > 0 && <Text style={[testo, { marginTop: 6 }]}>Esigenze segnalate: {a.problemi.map(p => PROBLEMI_INFISSI[p]).join("; ")}.</Text>}
    <Text style={[testo, { marginTop: 6 }]}>{a.motivo.trim() || beneficioMateriale(materiale)}</Text>
  </View>;
}
export function ConfrontoInterventoPdf({ analisi: a, materiale, fotoPrima, fotoDopo, prodotto, colore }: {
  analisi: AnalisiIntervento; materiale?: string | null; fotoPrima?: string | null; fotoDopo?: string | null; prodotto?: string; colore: string;
}) {
  const s = SCENARI_ESISTENTI[a.esistente]; const uw = confrontoUw(a);
  const dettaglio = { ...testo, fontSize: 8.5, lineHeight: 1.45 };
  const etichetta = { fontSize: 8, fontWeight: 700 as const, color: colore };
  return <View>
    <View minPresenceAhead={300} style={{ marginBottom: 10 }}>
      <Text style={{ ...etichetta, marginBottom: 10 }}>PRIMA E DOPO · LA TUA SCELTA</Text>
      <Text style={{ ...titolo, fontSize: 22, lineHeight: 1.15, marginBottom: 10 }}>{s.titolo}</Text>
      <View style={{ width: 40, height: 3, backgroundColor: colore }} />
    </View>
    <View wrap={false} style={{ flexDirection: "row", gap: 18 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ borderTopWidth: 1, borderTopColor: "#CBD5E1", paddingTop: 9, marginBottom: 9 }}>
          <Text style={{ ...etichetta, color: "#64748B" }}>01 / IL PUNTO DI PARTENZA</Text>
          <Text style={{ ...titolo, marginTop: 4, marginBottom: 0 }}>Oggi</Text>
        </View>
        <View style={{ height: 114, backgroundColor: "#F6F6F4", padding: 8, justifyContent: "center", alignItems: "center" }}>
          {fotoPrima ? <Image src={fotoPrima} style={{ width: "100%", height: 98, objectFit: "contain" }} />
            : <Text style={{ ...dettaglio, color: "#64748B", textAlign: "center", padding: 12 }}>Il punto di partenza verra documentato durante il rilievo.</Text>}
        </View>
        <Text style={{ ...titolo, fontSize: 11, marginTop: 10, marginBottom: 6 }}>{s.nome}</Text>
        <Text style={dettaglio}>{s.descrizione}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ borderTopWidth: 2, borderTopColor: colore, paddingTop: 8, marginBottom: 9 }}>
          <Text style={etichetta}>02 / IL SISTEMA SCELTO</Text>
          <Text style={{ ...titolo, marginTop: 4, marginBottom: 0, color: colore }}>La proposta</Text>
        </View>
        <View style={{ height: 114, backgroundColor: "#F6F6F4", padding: 8, justifyContent: "center", alignItems: "center" }}>
          {fotoDopo ? <Image src={fotoDopo} style={{ width: "100%", height: 98, objectFit: "contain" }} />
            : <Text style={{ ...dettaglio, color: "#64748B", textAlign: "center", padding: 12 }}>Modelli, aperture e finiture sono riportati nell'abaco della tua offerta.</Text>}
        </View>
        <Text style={{ ...titolo, fontSize: 11, marginTop: 10, marginBottom: 6 }}>{prodotto || "Configurazione indicata nell'abaco"}</Text>
        <Text style={dettaglio}>{beneficioMateriale(materiale)}</Text>
      </View>
    </View>
    {Boolean(fotoPrima || fotoDopo) && <View wrap={false} style={{ flexDirection: "row", gap: 18, marginTop: 8 }}>
      <Text style={{ ...dettaglio, flex: 1, color: "#64748B", fontSize: 7 }}>{fotoPrima ? "Immagine illustrativa generata con AI, non foto del tuo infisso." : ""}</Text>
      <Text style={{ ...dettaglio, flex: 1, color: "#64748B", fontSize: 7 }}>{fotoDopo ? "Immagine del catalogo selezionato. Finiture e misure: vedi abaco." : ""}</Text>
    </View>}
    {a.problemi.length > 0 && <View style={{ marginTop: 10 }}>
      <Text style={{ ...titolo, fontSize: 12, marginBottom: 8 }} minPresenceAhead={55}>Cosa vogliamo migliorare</Text>
      {a.problemi.map((p, i) => <View key={p} wrap={false} style={{ flexDirection: "row", borderTopWidth: 0.5, borderTopColor: "#E2E8F0", paddingVertical: 6 }}>
        <Text style={{ ...etichetta, width: 25 }}>{String(i + 1).padStart(2, "0")}</Text>
        <Text style={{ ...dettaglio, flex: 1 }}>{OBIETTIVI_INFISSI[p]}</Text>
      </View>)}
    </View>}
    {Boolean(a.noteRilievo.trim()) && <View style={{ marginTop: 10, borderLeftWidth: 2, borderLeftColor: colore, paddingLeft: 10 }}>
      <Text style={{ ...titolo, fontSize: 11, marginBottom: 5 }} minPresenceAhead={35}>Dal rilievo</Text><Text style={dettaglio}>{a.noteRilievo}</Text>
    </View>}
    <View wrap={false} style={{ marginTop: 10 }}>
    {uw ? <View style={{ padding: 9, backgroundColor: "#F6F6F4" }}>
      <View wrap={false}>
        <Text style={{ ...titolo, fontSize: 11, marginBottom: 6 }}>Trasmittanza del serramento completo (Uw)</Text>
        <View style={{ flexDirection: "row", gap: 20 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={{ ...etichetta, color: "#64748B" }}>OGGI</Text><Text style={{ ...titolo, fontSize: 20, marginBottom: 0 }}>{uw.prima.toLocaleString("it-IT")} <Text style={{ fontSize: 9 }}>W/m²K</Text></Text></View>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={etichetta}>LA PROPOSTA</Text><Text style={{ ...titolo, fontSize: 20, color: colore, marginBottom: 0 }}>{uw.dopo.toLocaleString("it-IT")} <Text style={{ fontSize: 9 }}>W/m²K</Text></Text></View>
        </View>
        <Text style={{ ...dettaglio, fontWeight: 700, marginTop: 5 }}>{uw.riduzione > 0 ? `Uw inferiore del ${uw.riduzione}%.` : "I dati inseriti non dimostrano una riduzione della trasmittanza."}</Text>
      </View>
      <Text style={{ ...dettaglio, fontSize: 7.5, marginTop: 6 }}>Fonti: attuale: {a.fontePrima}; proposto: {a.fonteDopo}. Confronto della trasmissione a parita di superficie e temperatura, non percentuale di risparmio sulla bolletta.</Text>
    </View> : <View style={{ paddingTop: 10, borderTopWidth: 0.5, borderTopColor: "#CBD5E1" }}>
      <Text style={{ ...etichetta, marginBottom: 4 }}>CONFRONTO QUALITATIVO</Text>
      <Text style={{ ...dettaglio, fontSize: 7.5 }}>Confronto qualitativo. Uw e prestazioni acustiche non sono deducibili dal solo materiale. I valori numerici richiedono dati e fonti riferiti ai serramenti confrontati.</Text>
    </View>}
    <Text style={{ ...dettaglio, color: "#64748B", fontSize: 7.5, marginTop: 8 }}>Spifferi, rumore e condensa dipendono anche da posa, parete e utilizzo. Nessuna eliminazione automatica e' garantita da questo schema.</Text>
    </View>
  </View>;
}
export function PosaInterventoPdf({ analisi: a, soloFornitura = [] }: { analisi: AnalisiIntervento; soloFornitura?: number[] }) {
  return <View wrap={false} style={{ marginVertical: 10 }}><Text style={{ ...titolo, fontSize: 13 }}>La posa prevista nella tua offerta</Text>
    {soloFornitura.length > 0 && <Text style={{ ...testo, fontSize: 8, marginBottom: 8 }}>Posizioni in sola fornitura: {soloFornitura.join(", ")}. Le lavorazioni sotto si riferiscono alle sole posizioni che prevedono posa; non estendono la fornitura delle altre.</Text>}
    {Object.entries(LAVORAZIONI_POSA).map(([k, label]) => <View key={k} wrap={false} style={{ flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#CBD5E1" }}>
      <Text style={{ ...testo, fontSize: 9, flex: 1, paddingRight: 12 }}>{label}</Text><Text style={{ ...testo, fontSize: 9, width: 95, textAlign: "right", fontWeight: 700 }}>{({ inclusa: "Inclusa", esclusa: "Esclusa", da_definire: "Da definire" })[a.posa[k as keyof typeof a.posa]]}</Text>
    </View>)}
    <Text style={{ ...testo, fontSize: 8, marginTop: 8 }}>Le voci da definire richiedono accordo prima dell'ordine. Le esclusioni non diventano incluse per effetto delle immagini o del materiale scelto. Restano valide le quantita e le condizioni dell'offerta.</Text>
  </View>;
}
export function IpotesiRisparmioPdf({ analisi, superficie }: { analisi: AnalisiIntervento | null; superficie?: number }) {
  const r = analisi?.risparmio;
  const avviso = avvisoIpotesi(analisi, superficie);
  return <View style={{ marginTop: 10 }}><Text style={titolo} minPresenceAhead={55}>Da dove arriva la stima</Text>
    {avviso && <Text style={{ ...testo, fontSize: 9, fontWeight: 700, marginBottom: 6 }}>{avviso}</Text>}
    <Text style={{ ...testo, fontSize: 8 }}>{r ? `Uw esistente ${r.uwAttuale ?? "n.d."}, Uw proposto ${r.uwNuovo ?? "n.d."} W/m²K; superficie serramenti ${r.superficie.toLocaleString("it-IT")} m²; zona climatica ${r.zona}; spesa annua riscaldamento ${r.bolletta.toLocaleString("it-IT")} euro (${r.fonteBolletta === "cliente" ? "indicata dal cliente" : "stimata"}).` : "Le ipotesi originarie di questa stima non sono registrate: richiedere al consulente i dati di partenza prima di utilizzarla per una decisione."}</Text>
    <Text style={{ ...testo, fontSize: 8, marginTop: 5 }}>Modello semplificato per trasmissione: differenza Uw × superficie × gradi-giorno × 24 / 1000. Ipotesi del calcolatore: rendimento 85%, energia termica 0,10 euro/kWh. Non simula apporti solari, ventilazione, raffrescamento o abitudini. Non e' una diagnosi energetica ne un risparmio garantito. Gli eventuali benefici fiscali sono distinti dal risparmio energetico.</Text>
  </View>;
}
