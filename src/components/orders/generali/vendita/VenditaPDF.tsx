// src/components/orders/generali/vendita/VenditaPDF.tsx
// La carta da dare a chi compra: la scheda vendita dell'unità e il listino disponibilità
// dell'operazione. Stessa carta del rendiconto (DossierPDF): A4 verticale, Helvetica, blu e
// arancio, testata dell'azienda col logo e piede coi contatti. Le immagini arrivano già
// ridotte in JPEG (data URL): le planimetrie in PDF diventano la loro prima pagina.
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { giornoIt } from "@/lib/orders/generali/rendiconto";
import {
  NOMI_STATO_LISTINO, contattiAzienda, descrizioneUnita,
  type AziendaVendita, type DatiListino, type DatiSchedaVendita, type StatoListino,
} from "@/lib/orders/generali/vendita";

const C = {
  navy: "#1E3A5F",
  navyChiaro: "#dbe4ef",
  orange: "#F97316",
  gray50: "#f9fafb",
  gray200: "#e5e7eb",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",
  green: "#047857",
  greenChiaro: "#d1fae5",
  amber: "#b45309",
  amberChiaro: "#fef3c7",
  red: "#b91c1c",
  redChiaro: "#fee2e2",
  white: "#ffffff",
};

const TONO_STATO: Record<StatoListino, { fondo: string; testo: string }> = {
  libera: { fondo: C.greenChiaro, testo: C.green },
  prenotata: { fondo: C.amberChiaro, testo: C.amber },
  venduta: { fondo: C.redChiaro, testo: C.red },
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: C.gray900, padding: 40, paddingBottom: 64 },
  banda: { backgroundColor: C.navy, marginHorizontal: -40, marginTop: -40, paddingHorizontal: 40, paddingTop: 28, paddingBottom: 22, marginBottom: 18 },
  azienda: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 18 },
  logo: { width: 40, height: 40, objectFit: "contain", backgroundColor: C.white, borderRadius: 4 },
  aziendaNome: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.white },
  aziendaMeta: { fontSize: 7.5, color: C.navyChiaro, marginTop: 2 },
  // Senza spaziatura tra le lettere: il testo del PDF resta copiabile e cercabile.
  kicker: { fontSize: 9, color: C.orange, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  titolo: { fontSize: 24, fontFamily: "Helvetica-Bold", color: C.white, lineHeight: 1.2 },
  sotto: { fontSize: 10.5, color: C.navyChiaro, marginTop: 5 },
  dati: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  dato: { width: "23%", borderLeft: `2pt solid ${C.orange}`, paddingLeft: 7, paddingVertical: 2 },
  datoLabel: { fontSize: 7, color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5 },
  datoValore: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.gray900, marginTop: 2 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 6 },
  sezione: { marginBottom: 16 },
  planimetria: { width: "100%", maxHeight: 400, objectFit: "contain", border: `0.5pt solid ${C.gray200}` },
  foto: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fotoBox: { width: "48.6%", marginBottom: 2 },
  fotoImg: { width: "100%", height: 170, objectFit: "cover", borderRadius: 3 },
  voce: { flexDirection: "row", gap: 6, marginBottom: 3 },
  puntino: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.orange, marginTop: 4 },
  voceTesto: { flex: 1, fontSize: 9.5, color: C.gray700, lineHeight: 1.4 },
  contatti: { backgroundColor: C.gray50, border: `0.5pt solid ${C.gray200}`, borderRadius: 4, padding: 10 },
  contattiNome: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 3 },
  testo: { fontSize: 9, color: C.gray700, lineHeight: 1.5 },
  nota: { fontSize: 7.5, color: C.gray500, marginTop: 6, lineHeight: 1.4 },
  badge: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6, fontSize: 7.5, fontFamily: "Helvetica-Bold", alignSelf: "flex-start" },
  thead: { flexDirection: "row", backgroundColor: C.navy, paddingVertical: 4, paddingHorizontal: 6 },
  th: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: C.white, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottom: `0.25pt solid ${C.gray200}`, paddingVertical: 4, paddingHorizontal: 6, alignItems: "center" },
  td: { fontSize: 8.5 },
  destra: { textAlign: "right", paddingRight: 4 },
  conteggi: { flexDirection: "row", gap: 8, marginBottom: 12 },
  conteggio: { flex: 1, borderRadius: 4, padding: 7 },
  conteggioNumero: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  conteggioNome: { fontSize: 7.5, marginTop: 1 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTop: `0.5pt solid ${C.gray200}`, paddingTop: 6 },
  footerText: { fontSize: 7, color: C.gray500 },
});

// «always»: in italiano Intl non mette il punto nelle cifre a quattro (3000 invece di 3.000).
const EURO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });
const soldi = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : `€ ${EURO.format(n)}`);
const metri = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m²`);

function Testata({ azienda, kicker, titolo, sotto }: { azienda: AziendaVendita; kicker: string; titolo: string; sotto?: string }) {
  return (
    <View style={s.banda}>
      <View style={s.azienda}>
        {azienda.logo ? <Image src={azienda.logo} style={s.logo} /> : null}
        <View>
          <Text style={s.aziendaNome}>{azienda.nome}</Text>
          {azienda.indirizzo ? <Text style={s.aziendaMeta}>{azienda.indirizzo}</Text> : null}
        </View>
      </View>
      <Text style={s.kicker}>{kicker}</Text>
      <Text style={s.titolo}>{titolo}</Text>
      {sotto ? <Text style={s.sotto}>{sotto}</Text> : null}
    </View>
  );
}

function Piede({ azienda, sinistra }: { azienda: AziendaVendita; sinistra: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{sinistra}</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
      <Text style={s.footerText}>{azienda.telefono ? `Tel. ${azienda.telefono}` : azienda.email ?? azienda.nome}</Text>
    </View>
  );
}

function Contatti({ azienda }: { azienda: AziendaVendita }) {
  const riga = contattiAzienda(azienda);
  return (
    <View style={s.contatti} wrap={false}>
      <Text style={s.contattiNome}>Per informazioni e visite: {azienda.nome}</Text>
      {riga ? <Text style={s.testo}>{riga}</Text> : null}
      {azienda.partitaIva ? <Text style={s.nota}>P.IVA {azienda.partitaIva}</Text> : null}
    </View>
  );
}

function Badge({ stato }: { stato: StatoListino }) {
  return (
    <Text style={[s.badge, { backgroundColor: TONO_STATO[stato].fondo, color: TONO_STATO[stato].testo }]}>
      {NOMI_STATO_LISTINO[stato]}
    </Text>
  );
}

export function SchedaVenditaPDF({ d }: { d: DatiSchedaVendita }) {
  const u = d.unita;
  const descrizione = descrizioneUnita(u);
  const dati: [string, string][] = [
    ["Tipologia", u.tipologia ?? "—"],
    ["Piano", [u.edificio, u.piano].filter(Boolean).join(" · ") || "—"],
    ["Superficie", metri(u.mq)],
    ...(d.prezzo !== null ? [["Prezzo", soldi(d.prezzo)] as [string, string]] : []),
  ];
  return (
    <Document title={`Scheda ${u.sigla} · ${d.operazione}`} author={d.azienda.nome} subject={`Scheda vendita ${u.sigla}`}>
      <Page size="A4" style={s.page}>
        <Testata azienda={d.azienda} kicker={d.operazione} titolo={`Unità ${u.sigla}`} sotto={descrizione || undefined} />
        <View style={s.dati}>
          {dati.map(([k, v]) => (
            <View key={k} style={s.dato}>
              <Text style={s.datoLabel}>{k}</Text>
              <Text style={s.datoValore}>{v}</Text>
            </View>
          ))}
        </View>
        {u.stato !== "libera" ? <View style={{ marginBottom: 12 }}><Badge stato={u.stato} /></View> : null}
        {d.planimetria ? (
          <View style={s.sezione}>
            <Text style={s.h2}>Planimetria</Text>
            <Image src={d.planimetria} style={s.planimetria} />
          </View>
        ) : null}
        {d.foto.length > 0 ? (
          <View style={s.sezione}>
            <View wrap={false}>
              <Text style={s.h2}>Foto e render</Text>
              <View style={s.foto}>
                {d.foto.slice(0, 2).map((f, i) => <View key={i} style={s.fotoBox}><Image src={f} style={s.fotoImg} /></View>)}
              </View>
            </View>
            {d.foto.length > 2 ? (
              <View style={[s.foto, { marginTop: 8 }]}>
                {d.foto.slice(2).map((f, i) => <View key={i} style={s.fotoBox} wrap={false}><Image src={f} style={s.fotoImg} /></View>)}
              </View>
            ) : null}
          </View>
        ) : null}
        {d.capitolato.length > 0 ? (
          <View style={s.sezione}>
            <View wrap={false}>
              <Text style={s.h2}>Capitolato in breve</Text>
              <View style={s.voce}><View style={s.puntino} /><Text style={s.voceTesto}>{d.capitolato[0]}</Text></View>
            </View>
            {d.capitolato.slice(1).map((r, i) => (
              <View key={i} style={s.voce} wrap={false}><View style={s.puntino} /><Text style={s.voceTesto}>{r}</Text></View>
            ))}
          </View>
        ) : null}
        <Contatti azienda={d.azienda} />
        <Text style={s.nota}>
          Scheda informativa del {giornoIt(d.data)}: non è un'offerta. Superfici, finiture e immagini sono indicative
          {d.prezzo !== null ? "; prezzo e disponibilità si confermano alla prenotazione" : ""}.
        </Text>
        <Piede azienda={d.azienda} sinistra={`${d.azienda.nome} · ${d.operazione} · ${u.sigla}`} />
      </Page>
    </Document>
  );
}

export function ListinoPDF({ d }: { d: DatiListino }) {
  const col: { titolo: string; w: string; destra?: boolean }[] = [
    ...(d.conEdifici ? [{ titolo: "Edificio", w: "14%" }] : []),
    { titolo: "Piano", w: d.conEdifici ? "14%" : "18%" },
    { titolo: "Unità", w: "11%" },
    // La tipologia prende lo spazio che resta.
    { titolo: "Tipologia", w: `${100 - (d.conEdifici ? 28 : 18) - 11 - 11 - (d.conPrezzi ? 15 : 0) - 16}%` },
    { titolo: "m²", w: "11%", destra: true },
    ...(d.conPrezzi ? [{ titolo: "Prezzo", w: "15%", destra: true }] : []),
    { titolo: "Stato", w: "16%" },
  ];
  const riga = (r: DatiListino["righe"][number]) => [
    ...(d.conEdifici ? [r.edificio ?? "—"] : []),
    r.piano ?? "—",
    r.sigla,
    r.tipologia ?? "—",
    metri(r.mq).replace(" m²", ""),
    ...(d.conPrezzi ? [r.stato === "libera" ? soldi(r.prezzo) : "—"] : []),
  ];
  return (
    <Document title={`Listino ${d.operazione} ${d.data}`} author={d.azienda.nome} subject="Listino disponibilità">
      <Page size="A4" style={s.page}>
        <Testata azienda={d.azienda} kicker="Listino disponibilità" titolo={d.operazione} sotto={`Aggiornato al ${giornoIt(d.data)}`} />
        <View style={s.conteggi}>
          {(["libera", "prenotata", "venduta"] as const).map((st) => (
            <View key={st} style={[s.conteggio, { backgroundColor: TONO_STATO[st].fondo }]}>
              <Text style={[s.conteggioNumero, { color: TONO_STATO[st].testo }]}>{String(d.conteggi[st])}</Text>
              <Text style={[s.conteggioNome, { color: TONO_STATO[st].testo }]}>
                {st === "libera" ? (d.conteggi[st] === 1 ? "Libera" : "Libere") : st === "prenotata" ? (d.conteggi[st] === 1 ? "Prenotata" : "Prenotate") : (d.conteggi[st] === 1 ? "Venduta" : "Vendute")}
              </Text>
            </View>
          ))}
        </View>
        <View>
          <View style={s.thead}>
            {col.map((c, i) => <Text key={i} style={[s.th, { width: c.w }, c.destra ? s.destra : {}]}>{c.titolo}</Text>)}
          </View>
          {d.righe.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              {riga(r).map((v, j) => <Text key={j} style={[s.td, { width: col[j].w }, col[j].destra ? s.destra : {}, col[j].titolo === "Unità" ? { fontFamily: "Helvetica-Bold" } : {}]}>{v}</Text>)}
              <View style={{ width: col[col.length - 1].w }}><Badge stato={r.stato} /></View>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 16 }}>
          <Contatti azienda={d.azienda} />
          <Text style={s.nota}>
            Il listino non è un'offerta: disponibilità{d.conPrezzi ? " e prezzi" : ""} si confermano alla prenotazione.
            {d.conPrezzi ? " Il prezzo è indicato solo per le unità libere." : ""}
          </Text>
        </View>
        <Piede azienda={d.azienda} sinistra={`${d.azienda.nome} · ${d.operazione}`} />
      </Page>
    </Document>
  );
}
