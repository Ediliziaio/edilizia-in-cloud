/**
 * Le pagine che ogni preventivo ha, nello stile del documento racconto: chi
 * siamo con perché sceglierci e garanzie, cosa installiamo voce per voce, le
 * foto del preventivo, recensioni e lavori, condizioni, firma e recesso. Dati
 * dall'adattatore degli altri preventivi (`DatiRacconto.standard`): escono solo
 * con quello che l'azienda ha scritto nel suo modello.
 */
import type * as React from "react";
import { Circle, Defs, G, Image, LinearGradient, Page, Path, RadialGradient, Rect, Stop, Svg, Text, View } from "@react-pdf/renderer";
import { IconaPdf } from "@/components/preventivi/pdf/IconaPdf";
import type { NomeIcona } from "../../../../../supabase/functions/_shared/iconePreventivo";
import type { DocEdileCapitolo, DocEdileFoto } from "@/components/preventivi/pdf/documentoEdileTipi";
import type { TemaDocumento } from "@/components/preventivi/pdf/temaDocumento";
import { ParoleDeiClienti, SchedeGaranzie, VotiOnline } from "@/components/preventivi/pdf/provaSocialePdf";
import { perArticoli } from "@/components/preventivi/pdf/testoDocumento";
import { MODULO_RECESSO } from "../../../../../supabase/functions/_shared/condizioniStandard";
import { Foto, Intestazione, Kpi, Nota, Pagina, Spinta, TestoRicco, TitoletoSezione, type DatiRacconto } from "./baseRacconto";
import { BASE, H, LARGHEZZA, MARGINE, W, conEuro, dataLunga, soldi, soldiCent, type Palette, type Tono } from "./temaRacconto";

const ICONE_USP: NomeIcona[] = ["verifica", "documenti", "pratiche", "garanzia", "sopralluogo", "pagamento"];

/**
 * Chi siamo, perché sceglierci e le garanzie: prima del prezzo, come negli altri
 * preventivi. Esce solo con quello che l'azienda ha scritto nel suo modello.
 */
export function ChiSiamo({ d, c, tema }: { d: DatiRacconto; c: Palette; tema: TemaDocumento }) {
  const s = d.standard;
  if (!s) return null;
  const m = s.modello;
  const testo = m.mostraChiSiamo ? m.chiSiamoHtml : null;
  const usp = m.usp.slice(0, 6);
  const garanzie = m.mostraGaranzie ? m.garanzie.slice(0, 6) : [];
  if (!testo && !usp.length && !garanzie.length) return null;
  const colonne = usp.length % 3 === 0 ? 3 : 2;
  const colonneGaranzie: 2 | 3 = garanzie.length === 2 || garanzie.length === 4 ? 2 : 3;
  const tG = m.testate.garanzie;
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Chi siamo" titolo={"Chi c'è dietro\n"} evidenza="questa proposta." />
      {testo ? (
        <View style={{ flexDirection: "row", marginBottom: 14 }}>
          <View style={{ flex: 1, paddingRight: m.chiSiamoFotoUrl ? 16 : 40 }}>
            <TestoRicco html={testo} stile={{ fontSize: 9, lineHeight: 1.55, color: BASE.testo }} />
          </View>
          {m.chiSiamoFotoUrl ? <Image src={m.chiSiamoFotoUrl} style={{ width: 180, height: 200, objectFit: "cover", borderRadius: 8 }} /> : null}
        </View>
      ) : null}
      {usp.length ? (
        <View wrap={false} style={{ marginBottom: 6 }}>
          <TitoletoSezione>Perché sceglierci</TitoletoSezione>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {usp.map((u, i) => (
              <View key={u.titolo} style={{ width: (LARGHEZZA - 8 * (colonne - 1)) / colonne, marginRight: i % colonne === colonne - 1 ? 0 : 8, marginBottom: 8, backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, padding: 10 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: BASE.arancioTenue, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                  <IconaPdf nome={ICONE_USP[i] ?? "verifica"} colore={BASE.arancioScuro} lato={11} />
                </View>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: c.navy }}>{u.titolo}</Text>
                {u.descrizione ? <Text style={{ fontSize: 7.4, color: BASE.testo, marginTop: 3, lineHeight: 1.4 }}>{conEuro(u.descrizione)}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {garanzie.length ? (
        <View style={{ marginTop: 8 }}>
          <View wrap={false}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.4, color: BASE.arancio, marginBottom: 5 }}>{tG.occhiello.toUpperCase()}</Text>
            {tG.titolo ? <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 15, color: c.navy, marginBottom: tG.intro ? 4 : 10 }}>{tG.titolo.replace(/\*/g, "")}</Text> : null}
            {tG.intro ? <Text style={{ fontSize: 8.5, color: BASE.grigio, lineHeight: 1.45, marginBottom: 10 }}>{tG.intro}</Text> : null}
          </View>
          <SchedeGaranzie tema={tema} voci={garanzie} colonne={colonneGaranzie} larghezza={LARGHEZZA} />
        </View>
      ) : null}
    </Pagina>
  );
}

/** «a corpo», oppure la quantità con l'unità: «6 pz». */
function quantitaTesto(v: DocEdileCapitolo["voci"][number]): string {
  if (/corpo/i.test(v.unitaMisura ?? "")) return "a corpo";
  const q = Number.isInteger(v.quantita) ? String(v.quantita) : String(v.quantita).replace(".", ",");
  return `${q} ${v.unitaMisura ?? ""}`.trim();
}

export function CapitoloFornitura({ cap, indice, c, soloCapitolo, mostraQta, mostraPrezzi, mostraImporti, mostraSubtotale }: {
  cap: DocEdileCapitolo; indice: number; c: Palette;
  soloCapitolo: boolean; mostraQta: boolean; mostraPrezzi: boolean; mostraImporti: boolean; mostraSubtotale: boolean;
}) {
  const colonne = !soloCapitolo && (mostraQta || mostraPrezzi || mostraImporti);
  const testa = { fontFamily: "Helvetica-Bold", fontSize: 6, letterSpacing: 0.9, color: BASE.grigioChiaro } as const;
  const riga = (v: DocEdileCapitolo["voci"][number]) => (
    <View key={v.id} wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 6.5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: BASE.linea }}>
      <View style={{ marginRight: 7, marginTop: 1.5 }}><IconaPdf nome="verifica" colore={BASE.verde} lato={8.5} /></View>
      <Text style={{ flex: 1, fontSize: 8.2, lineHeight: 1.4, color: BASE.ink }}>{v.descrizione}</Text>
      {mostraQta ? <Text style={{ width: 58, fontSize: 8, color: BASE.grigio, textAlign: "right" }}>{quantitaTesto(v)}</Text> : null}
      {mostraPrezzi ? <Text style={{ width: 66, fontSize: 8, color: BASE.grigio, textAlign: "right" }}>{soldiCent(v.prezzoUnitario)}</Text> : null}
      {mostraImporti ? <Text style={{ width: 70, fontSize: 8.2, fontFamily: "Helvetica-Bold", color: BASE.ink, textAlign: "right" }}>{soldiCent(v.importo)}</Text> : null}
    </View>
  );
  return (
    <View style={{ marginBottom: 10, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
      {/* Il titolo del capitolo viaggia con la prima voce. */}
      <View wrap={false}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, backgroundColor: BASE.fondo, borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
          <View style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: c.navy, alignItems: "center", justifyContent: "center", marginRight: 8 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#FFFFFF" }}>{String(indice)}</Text>
          </View>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 10, color: c.navy }}>{cap.nome}</Text>
          {mostraSubtotale
            ? <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color: BASE.ink }}>{soldiCent(cap.subtotale)}</Text>
            : <Text style={{ fontSize: 7.5, color: BASE.grigio }}>{`${cap.voci.length} ${cap.voci.length === 1 ? "voce" : "voci"}`}</Text>}
        </View>
        {colonne ? (
          <View style={{ flexDirection: "row", paddingTop: 5, paddingBottom: 3, paddingHorizontal: 10 }}>
            <Text style={[testa, { flex: 1, paddingLeft: 15 }]}>DESCRIZIONE</Text>
            {mostraQta ? <Text style={[testa, { width: 58, textAlign: "right" }]}>QUANTITÀ</Text> : null}
            {mostraPrezzi ? <Text style={[testa, { width: 66, textAlign: "right" }]}>PREZZO</Text> : null}
            {mostraImporti ? <Text style={[testa, { width: 70, textAlign: "right" }]}>IMPORTO</Text> : null}
          </View>
        ) : null}
        {!soloCapitolo && cap.voci[0] ? riga(cap.voci[0]) : null}
      </View>
      {soloCapitolo ? null : cap.voci.slice(1).map(riga)}
    </View>
  );
}

/** Il riquadro in cima alla pagina «voce per voce»: il modello (o il sistema) proposto. */
export interface ModelloFornitura {
  /** «IL MODELLO PROPOSTO», «IL SISTEMA PROPOSTO». */
  etichetta: string;
  titolo: string;
  /** «al posto di: caldaia a gas del 2008». */
  sottotitolo?: string | null;
  foto?: string | null;
  scheda: { etichetta: string; valore: string }[];
}

/**
 * I prodotti installati, voce per voce: il modello con la sua foto, poi le voci
 * del preventivo per capitolo (fornitura, manodopera, pratica). Quanto mostrare
 * lo si sceglie nel passo PDF, come negli altri preventivi; col prezzo scritto a
 * mano le righe non hanno importi. `vociDiRiserva`: le anteprime senza computo.
 */
export function Fornitura({ d, c, modello, vociDiRiserva = [], sottotitolo }: {
  d: DatiRacconto; c: Palette; modello: ModelloFornitura;
  vociDiRiserva?: { descrizione: string; quantita?: number | null; unita?: string | null }[];
  sottotitolo?: string;
}) {
  const s = d.standard;
  const capitoli: DocEdileCapitolo[] = s?.capitoli.filter((k) => k.voci.length > 0).length
    ? s.capitoli.filter((k) => k.voci.length > 0)
    : [{
        nome: "La fornitura", subtotale: 0,
        voci: vociDiRiserva.map((v, i) => ({ id: `v${i}`, descrizione: v.descrizione, unitaMisura: v.unita ?? null, quantita: v.quantita ?? 1, prezzoUnitario: 0, importo: 0 })),
      }];
  if (!capitoli[0].voci.length) return null;
  const oc = s?.opzioniComputo;
  const livello = oc?.livello ?? "dettagliato";
  const manuale = s ? Boolean(s.totali.prezzoManuale) : true;
  const dettaglio = livello === "dettagliato";
  const scheda = modello.scheda.filter((x) => x.etichetta?.trim() && x.valore?.trim()).slice(0, 4);
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="La fornitura" titolo={"Cosa installiamo,\n"} evidenza="voce per voce." sottotitolo={sottotitolo ?? "Il modello proposto, i materiali e la manodopera compresi nel prezzo chiavi in mano."} />
      <View wrap={false} style={{ flexDirection: "row", marginBottom: 14, borderWidth: 1, borderColor: BASE.linea, borderRadius: 10, overflow: "hidden" }}>
        {modello.foto ? <Image src={modello.foto} style={{ width: 188, height: scheda.length > 2 ? 150 : 128, objectFit: "cover" }} /> : null}
        <View style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: BASE.fondo }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.arancio }}>{modello.etichetta.toUpperCase()}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12.5, lineHeight: 1.25, color: c.navy, marginTop: 4 }}>{modello.titolo}</Text>
          {modello.sottotitolo ? <Text style={{ fontSize: 7.5, color: BASE.grigio, marginTop: 2 }}>{modello.sottotitolo}</Text> : null}
          {scheda.map((x) => (
            <View key={x.etichetta} style={{ flexDirection: "row", marginTop: 4 }}>
              <Text style={{ flex: 1.2, fontSize: 7.3, color: BASE.grigio }}>{x.etichetta}</Text>
              <Text style={{ flex: 1, fontSize: 7.6, fontFamily: "Helvetica-Bold", color: BASE.ink, textAlign: "right" }}>{x.valore}</Text>
            </View>
          ))}
          {modello.foto ? <Text style={{ fontSize: 5.8, color: BASE.grigioChiaro, marginTop: 6 }}>Immagine illustrativa: il modello è quello indicato.</Text> : null}
        </View>
      </View>
      {capitoli.map((cap, i) => (
        <CapitoloFornitura
          key={`${cap.nome}-${i}`} cap={cap} indice={i + 1} c={c}
          soloCapitolo={livello === "sintetico"}
          mostraQta={dettaglio && oc?.mostraQta !== false}
          mostraPrezzi={dettaglio && oc?.mostraPrezzi !== false && !manuale}
          mostraImporti={dettaglio && !manuale}
          mostraSubtotale={livello !== "corpo" && oc?.mostraSubtotali !== false && !manuale}
        />
      ))}
      <View style={{ marginTop: 4 }}>
        <Nota tono="verde" icona="garanzia" titolo="Il prezzo è chiavi in mano." testo="Comprende quello che è elencato qui sopra. Lavori o materiali non elencati non sono compresi e si concordano prima." />
      </View>
    </Pagina>
  );
}

export function FotoConDidascalia({ f, altezza, larghezza, stile }: { f: DocEdileFoto; altezza: number; larghezza: number; stile?: Record<string, unknown> }) {
  const testo = [f.didascalia, f.luogo].filter(Boolean).join(" · ");
  return (
    <View wrap={false} style={{ width: larghezza, ...(stile ?? {}) }}>
      <Image src={f.url} style={{ width: "100%", height: altezza, objectFit: "cover", borderRadius: 8 }} />
      {testo ? <Text style={{ fontSize: 7, color: BASE.grigio, marginTop: 3, lineHeight: 1.35 }}>{testo}</Text> : null}
    </View>
  );
}

/** Una foto grande, le altre a coppie. */
export function Galleria({ foto, altezzaPrima }: { foto: DocEdileFoto[]; altezzaPrima: number }) {
  const [prima, ...altre] = foto;
  if (!prima) return null;
  const mezza = (LARGHEZZA - 10) / 2;
  return (
    <View>
      <FotoConDidascalia f={prima} altezza={altezzaPrima} larghezza={LARGHEZZA} stile={{ marginBottom: 10 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {altre.map((f, i) => <FotoConDidascalia key={f.id} f={f} altezza={150} larghezza={mezza} stile={{ marginRight: i % 2 === 0 ? 10 : 0, marginBottom: 10 }} />)}
      </View>
    </View>
  );
}

/** Le foto caricate nel preventivo (passo Foto): il sopralluogo, i render. */
export function FotoProgetto({ d, c }: { d: DatiRacconto; c: Palette }) {
  const foto = d.standard?.fotoProgetto ?? [];
  if (!foto.length) return null;
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Foto e render" titolo={"Il tuo impianto,\n"} evidenza="da vedere." sottotitolo="Lo stato di oggi, dal sopralluogo, e come diventerà." />
      <Galleria foto={foto} altezzaPrima={foto.length > 1 ? 250 : 420} />
    </Pagina>
  );
}

/** Recensioni e lavori già fatti, se l'azienda li ha nel suo modello. */
export function Referenze({ d, c, tema }: { d: DatiRacconto; c: Palette; tema: TemaDocumento }) {
  const s = d.standard;
  if (!s) return null;
  const voti = s.azienda.votiOnline;
  const parole = s.modello.testimonianze;
  const lavori = s.modello.galleriaLavori;
  if (!voti.length && !parole.length && !lavori.length) return null;
  const tR = s.modello.testate.recensioni;
  const tL = s.modello.testate.lavori;
  return (
    <Pagina d={d} c={c}>
      {voti.length || parole.length ? (
        <ParoleDeiClienti tema={tema} voci={parole} larghezza={LARGHEZZA} testa={<>
          <Intestazione c={c} occhiello={tR.occhiello} titolo={tR.titolo || "Le parole di chi *ci ha scelto*."} sottotitolo={tR.intro} />
          {voti.length ? <View style={{ marginBottom: 14 }}><VotiOnline tema={tema} voti={voti} larghezza={LARGHEZZA} /></View> : null}
        </>} />
      ) : null}
      {lavori.length ? (
        <View style={{ marginTop: voti.length || parole.length ? 10 : 0 }}>
          <Intestazione c={c} occhiello={tL.occhiello} titolo={tL.titolo || "Lavori *già fatti*."} sottotitolo={tL.intro} />
          <Galleria foto={lavori.slice(0, 7)} altezzaPrima={lavori.length > 1 ? 230 : 360} />
        </View>
      ) : null}
    </Pagina>
  );
}

/** Le condizioni generali, articolo per articolo: le stesse degli altri preventivi. */
export function Condizioni({ d, c }: { d: DatiRacconto; c: Palette }) {
  const m = d.standard?.modello;
  if (!m?.condizioniLegali.length) return null;
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Allegato" titolo="Condizioni " evidenza="contrattuali." />
      {perArticoli(m.condizioniLegali, { senzaClausoleDaFirmare: m.clausoleDaApprovare.length > 0 }).map((gruppo, g) => (
        <View key={g} wrap={gruppo.length > 14} minPresenceAhead={36}>
          {gruppo.map((r, i) =>
            r.tipo === "h1" ? <Text key={i} style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5, color: c.navy, marginTop: g === 0 ? 0 : 12, marginBottom: 5 }}>{r.testo}</Text>
            : r.tipo === "h2" ? <Text key={i} style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: BASE.ink, marginTop: g === 0 ? 0 : 9, marginBottom: 3 }}>{r.testo}</Text>
            : r.tipo === "li" ? <Text key={i} style={{ fontSize: 8.2, color: BASE.testo, lineHeight: 1.5, marginLeft: 10, marginBottom: 2 }}>{`- ${conEuro(r.testo)}`}</Text>
            : <Text key={i} style={{ fontSize: 8.2, color: BASE.testo, lineHeight: 1.5, marginBottom: 5 }}>{conEuro(r.testo)}</Text>,
          )}
        </View>
      ))}
    </Pagina>
  );
}

/** Il modulo di recesso, quando l'azienda lo accende nel modello (spento di serie). */
export function Recesso({ d, c }: { d: DatiRacconto; c: Palette }) {
  const s = d.standard;
  if (!s?.modello.condizioniLegali.length || !s.modello.conRecesso) return null;
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Allegato" titolo="Modulo di " evidenza="recesso." />
      <Text style={{ fontSize: 8.5, color: BASE.testo, lineHeight: 1.55 }}>{MODULO_RECESSO.istruzioni}</Text>
      <View style={{ marginTop: 14, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, padding: 16 }}>
        <Text style={{ fontSize: 8.5, color: BASE.ink, lineHeight: 1.6 }}>
          {"Destinatario: "}<Text style={{ fontFamily: "Helvetica-Bold" }}>{s.azienda.nome}</Text>
          {s.azienda.indirizzo ? `, ${s.azienda.indirizzo}` : ""}{s.azienda.email ? ` - ${s.azienda.email}` : ""}
        </Text>
        <Text style={{ fontSize: 8.5, color: BASE.ink, lineHeight: 1.6, marginTop: 10 }}>{MODULO_RECESSO.dichiarazione(s.codice)}</Text>
        <View style={{ marginTop: 14 }}>
          {MODULO_RECESSO.campi.map((e) => (
            <View key={e} style={{ marginBottom: 16 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 0.8, color: BASE.grigio, marginBottom: 14 }}>{e.toUpperCase()}</Text>
              <View style={{ borderTopWidth: 1, borderTopColor: BASE.grigioChiaro }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", marginTop: 6 }}>
          {MODULO_RECESSO.firme.map((t, i) => (
            <View key={t} style={{ flex: i === 0 ? 0.6 : 1, marginRight: i === 0 ? 14 : 0, borderTopWidth: 1, borderTopColor: BASE.grigioChiaro, paddingTop: 5, marginTop: 28 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 0.8, color: BASE.grigio }}>{t.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pagina>
  );
}

export function LineaFirma({ testo, flex = 1, ultima = false, alto = 34 }: { testo: string; flex?: number; ultima?: boolean; alto?: number }) {
  return (
    <View style={{ flex, marginRight: ultima ? 0 : 14, borderTopWidth: 1, borderTopColor: BASE.grigioChiaro, paddingTop: 5, marginTop: alto }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 0.8, color: BASE.grigio }}>{testo.toUpperCase()}</Text>
    </View>
  );
}

/**
 * La firma: il preventivo firmato è il contratto. Riepilogo, modalità di
 * pagamento, dichiarazione, firme e — quando le condizioni le elencano —
 * l'approvazione specifica delle clausole (artt. 1341 e 1342 c.c.) con una
 * seconda firma, come negli altri preventivi.
 */
export function Firma({ d, c, oggetto, importo, righeExtra = [], cosaSiAccetta, avvertenza }: {
  d: DatiRacconto; c: Palette;
  oggetto: string;
  /** «12.870 € IVA 10% inclusa». */
  importo: string;
  righeExtra?: [string, string][];
  /** Cosa accetta il committente, oltre alle condizioni: «l'impianto», «l'importo»… */
  cosaSiAccetta: string[];
  /** In chiusura della dichiarazione: le stime che il cliente deve sapere. */
  avvertenza?: string;
}) {
  const m = d.standard?.modello;
  const conCondizioni = Boolean(m?.condizioniLegali.length);
  const clausole = m?.clausoleDaApprovare ?? [];
  const righe: [string, string][] = [
    ["Impresa", [d.azienda.nome, d.azienda.piva ? `P.IVA ${d.azienda.piva}` : null].filter(Boolean).join(" · ")],
    ["Committente", d.cliente.nome],
    ["Oggetto", oggetto],
    ...(d.cliente.indirizzo ? [["Luogo dei lavori", d.cliente.indirizzo] as [string, string]] : []),
    ["Documento", `Preventivo ${d.preventivo.codice} del ${dataLunga(d.preventivo.dataIso)}`],
    ["Importo", importo],
    ...righeExtra,
    ["Validità", `${d.preventivo.validitaGiorni} giorni dalla data del documento`],
  ];
  // «a, b e c»: con le condizioni sono l'ultima voce dell'elenco.
  const voci = conCondizioni ? [...cosaSiAccetta, "le condizioni generali di contratto che lo accompagnano"] : cosaSiAccetta;
  const elenco = voci.length > 1 ? `${voci.slice(0, -1).join(", ")} e ${voci[voci.length - 1]}` : voci.join("");
  const dichiarazione = `Il committente dichiara di aver ricevuto, letto e accettato il presente documento in ogni sua parte: ${elenco}${conCondizioni ? ", e ne sottoscrive il contenuto" : ""}.${avvertenza ? ` ${avvertenza}` : ""}`;
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Per accettazione" titolo={conCondizioni ? "Firma del\n" : "Firma della\n"} evidenza={conCondizioni ? "contratto." : "proposta."} />
      <View style={{ borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 }}>
        {righe.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: "row", paddingVertical: 6.5, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BASE.linea }}>
            <Text style={{ width: 110, fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 0.9, color: BASE.grigio, marginTop: 1 }}>{k.toUpperCase()}</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: BASE.ink, fontFamily: k === "Importo" ? "Helvetica-Bold" : "Helvetica" }}>{v}</Text>
          </View>
        ))}
      </View>
      {m?.pagamentoHtml ? (
        <View wrap={false} style={{ marginTop: 12 }}>
          <TitoletoSezione>Modalità di pagamento</TitoletoSezione>
          <TestoRicco html={m.pagamentoHtml} stile={{ fontSize: 8.2, lineHeight: 1.45, color: BASE.testo }} />
        </View>
      ) : null}
      <View wrap={false} style={{ marginTop: 12, borderWidth: 1.2, borderColor: c.navy, borderStyle: "dashed", borderRadius: 10, padding: 16 }}>
        <Text style={{ fontSize: 8, color: BASE.testo, lineHeight: 1.45 }}>{dichiarazione}</Text>
        <View style={{ flexDirection: "row" }}>
          <LineaFirma testo="Luogo e data" flex={0.7} />
          <LineaFirma testo={`Per l'impresa · ${d.azienda.nome}`} />
          <LineaFirma testo={`Firma del committente · ${d.cliente.nome}`} ultima />
        </View>
      </View>
      {clausole.length ? (
        <View wrap={false} style={{ marginTop: 14, borderWidth: 1, borderColor: BASE.ink, borderRadius: 8, padding: 14 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.8, letterSpacing: 1.1, color: BASE.ink, marginBottom: 6 }}>APPROVAZIONE SPECIFICA (ARTT. 1341 E 1342 C.C.)</Text>
          <Text style={{ fontSize: 8, color: BASE.testo, lineHeight: 1.45, marginBottom: 5 }}>Il committente, dopo averle rilette, approva specificamente le clausole seguenti:</Text>
          {clausole.map((x, i) => (
            <Text key={i} style={{ fontSize: 8, color: BASE.ink, lineHeight: 1.45, marginBottom: 2 }}>{`- ${x}`}</Text>
          ))}
          <View style={{ flexDirection: "row" }}>
            <LineaFirma testo="Luogo e data" flex={0.7} alto={28} />
            <LineaFirma testo="Seconda firma del committente" ultima alto={28} />
          </View>
        </View>
      ) : null}
    </Pagina>
  );
}

// ─── Le pagine del racconto con le parole di ogni documento ─────────────────
/**
 * La copertina: la foto in alto che sfuma nel colore dell'azienda, il titolo e
 * due riquadri (cosa si propone, per chi). Nessun prezzo: i numeri vengono dopo.
 */
export function CopertinaRacconto({ d, c, foto, sottoNome, occhiello, titolo, sottotitolo, schede }: {
  d: DatiRacconto; c: Palette; foto?: string | null;
  /** Sotto il nome dell'azienda: «Riscaldamento con il Conto Termico 3.0». */
  sottoNome: string;
  occhiello: string;
  titolo: string;
  sottotitolo: string;
  schede: { etichetta: string; titolo: string; nota?: string | null; flex?: number }[];
}) {
  const FASCIA = 395;
  return (
    // Niente wrap={false}: con gli elementi posizionati a mano il PDF bloccava
    // l'anteprima di macOS (Anteprima, Quick Look). Lo sfondo è alto un punto
    // meno della pagina, così non la fa andare a capo.
    <Page size="A4" style={{ fontFamily: "Helvetica", backgroundColor: c.navyScuro }}>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0, width: W, height: H - 1 }}>
        <Defs>
          <LinearGradient id="ct-fondo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.navyScuro} />
            <Stop offset="1" stopColor={c.navyChiaro} />
          </LinearGradient>
          <RadialGradient id="ct-calore" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={BASE.arancio} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={BASE.arancio} stopOpacity={0.14} />
            <Stop offset="1" stopColor={BASE.arancio} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {foto ? <Rect x={0} y={0} width={W} height={H} fill={c.navyScuro} /> : <Rect x={0} y={0} width={W} height={H} fill="url(#ct-fondo)" />}
        {foto ? null : (
          <G>
            <Circle cx={455} cy={190} r={190} fill="url(#ct-calore)" />
            {[46, 74, 102, 130].map((raggio, i) => (
              <Circle key={raggio} cx={455} cy={190} r={raggio} stroke={BASE.ambra} strokeOpacity={0.34 - i * 0.07} strokeWidth={1} fill="none" />
            ))}
            <Circle cx={455} cy={190} r={22} fill={BASE.arancio} fillOpacity={0.9} />
          </G>
        )}
      </Svg>
      {foto ? (
        <View style={{ position: "absolute", top: 0, left: 0, width: W, height: FASCIA }}>
          <Image src={foto} style={{ width: W, height: FASCIA, objectFit: "cover" }} />
          {/* Il velo sta nello stesso disegno che lo usa: nel PDF ogni disegno
              ha le sue sfumature, e da un altro non si vedono. Le fasce sono
              rettangoli pieni sovrapposti, che scuriscono verso il basso. */}
          <Svg viewBox={`0 0 ${W} ${FASCIA}`} style={{ position: "absolute", top: 0, left: 0, width: W, height: FASCIA }}>
            {Array.from({ length: 10 }, (_, i) => (
              <Rect key={`alto-${i}`} x={0} y={i * 11} width={W} height={11.6} fill={c.navyScuro} fillOpacity={0.5 * (1 - i / 10) ** 1.5} />
            ))}
            {Array.from({ length: 16 }, (_, i) => (
              <Rect key={i} x={0} y={FASCIA * 0.5 + (i * FASCIA * 0.5) / 16} width={W} height={FASCIA * 0.5 / 16 + 0.6} fill={c.navyScuro} fillOpacity={Math.min(1, ((i + 1) / 16) ** 1.6)} />
            ))}
          </Svg>
        </View>
      ) : null}

      <View style={{ position: "absolute", top: 46, left: MARGINE, right: MARGINE, flexDirection: "row", alignItems: "center" }}>
        {d.azienda.logoUrl ? (
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 6, paddingVertical: 5, paddingHorizontal: 7, marginRight: 9 }}>
            <Image src={d.azienda.logoUrl} style={{ height: 22, maxWidth: 110, objectFit: "contain" }} />
          </View>
        ) : (
          <View style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: BASE.arancio, alignItems: "center", justifyContent: "center", marginRight: 9 }}>
            <IconaPdf nome="temperatura" colore="#FFFFFF" lato={16} />
          </View>
        )}
        <View>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12, color: "#FFFFFF" }}>{d.azienda.nome}</Text>
          <Text style={{ fontSize: 7.5, color: "#FFFFFF", opacity: 0.7, marginTop: 1 }}>{sottoNome}</Text>
        </View>
      </View>

      <View style={{ position: "absolute", top: foto ? FASCIA - 28 : 330, left: MARGINE, right: MARGINE }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 1.8, color: BASE.ambra, marginBottom: 10 }}>{occhiello.toUpperCase()}</Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: foto ? 33 : 38, lineHeight: 1.06, letterSpacing: -1.2, color: "#FFFFFF" }}>{titolo}</Text>
        <Text style={{ fontSize: 10.5, lineHeight: 1.45, color: "#FFFFFF", opacity: 0.82, marginTop: 12, maxWidth: 420 }}>{sottotitolo}</Text>

        <View style={{ flexDirection: "row", marginTop: foto ? 18 : 26 }}>
          {schede.map((x, i) => (
            <View key={x.etichetta} style={{ flex: x.flex ?? 1, backgroundColor: c.vetro, borderWidth: 1, borderColor: c.vetroBordo, borderRadius: 10, padding: foto ? 12 : 14, marginRight: i < schede.length - 1 ? 10 : 0 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.ambra }}>{x.etichetta.toUpperCase()}</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, lineHeight: 1.25, color: "#FFFFFF", marginTop: 5 }}>{x.titolo}</Text>
              {x.nota ? <Text style={{ fontSize: 8, color: "#FFFFFF", opacity: 0.72, marginTop: 3 }}>{x.nota}</Text> : null}
            </View>
          ))}
        </View>
      </View>

      <View style={{ position: "absolute", bottom: 40, left: MARGINE, right: MARGINE, borderTopWidth: 1, borderTopColor: c.vetroBordo, paddingTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 7.5, color: "#FFFFFF" }}>{"Preventivo "}<Text style={{ fontFamily: "Helvetica-Bold", color: BASE.ambra }}>{d.preventivo.codice}</Text></Text>
          <Text style={{ fontSize: 7.5, color: "#FFFFFF", opacity: 0.72, marginTop: 2 }}>{`${dataLunga(d.preventivo.dataIso)} · valido ${d.preventivo.validitaGiorni} giorni`}</Text>
        </View>
        {d.preventivo.consulente ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 7.5, color: "#FFFFFF", opacity: 0.72 }}>A cura di</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#FFFFFF", marginTop: 2 }}>{d.preventivo.consulente}</Text>
          </View>
        ) : null}
      </View>
    </Page>
  );
}

/** Oggi e domani, affiancati: cosa si lascia e cosa si installa. */
export function OggiDomani({ oggi, domani }: {
  oggi: { foto?: string | null; titolo: string; testo: string };
  domani: { foto?: string | null; etichetta: string; titolo: string; testo: string };
}) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "stretch" }}>
        <View style={{ flex: 1, backgroundColor: BASE.rossoTenue, borderWidth: 1, borderColor: BASE.rossoBordo, borderRadius: 10, padding: 12 }}>
          {oggi.foto ? <Image src={oggi.foto} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 6, marginBottom: 10 }} /> : null}
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.rosso }}>OGGI</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, color: BASE.ink, marginTop: 6, lineHeight: 1.25 }}>{oggi.titolo}</Text>
          <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 5, lineHeight: 1.4 }}>{oggi.testo}</Text>
        </View>
        <View style={{ width: 34, alignItems: "center", justifyContent: "center" }}>
          <Svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
            <Path d="M4 12 L19 12 M13 6 L19 12 L13 18" stroke={BASE.arancio} strokeWidth={2.4} fill="none" />
          </Svg>
        </View>
        <View style={{ flex: 1, backgroundColor: BASE.verdeTenue, borderWidth: 1, borderColor: BASE.verdeBordo, borderRadius: 10, padding: 12 }}>
          {domani.foto ? <Image src={domani.foto} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 6, marginBottom: 10 }} /> : null}
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.verdeScuro }}>{domani.etichetta.toUpperCase()}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, color: BASE.ink, marginTop: 6, lineHeight: 1.25 }}>{domani.titolo}</Text>
          <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 5, lineHeight: 1.4 }}>{domani.testo}</Text>
        </View>
      </View>
      {oggi.foto || domani.foto ? <Text style={{ fontSize: 6, color: BASE.grigioChiaro, marginTop: 4 }}>Immagini illustrative.</Text> : null}
    </View>
  );
}

/** I dati della casa dal preventivo (immobile, anno, generatore): l'intervento è già nel titolo. */
export function CasaInBreve({ d }: { d: DatiRacconto }) {
  const casa = (d.standard?.scheda ?? []).filter((x) => x.etichetta !== "Intervento").slice(0, 4);
  if (!casa.length) return null;
  return (
    <View style={{ marginTop: 16 }}>
      <TitoletoSezione>La tua casa</TitoletoSezione>
      <View style={{ flexDirection: "row" }}>
        {casa.map((x, i) => (
          <View key={x.etichetta} style={{ flex: 1, marginRight: i < casa.length - 1 ? 8 : 0, backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.3, letterSpacing: 0.9, color: BASE.grigio }}>{x.etichetta.toUpperCase()}</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color: BASE.ink, marginTop: 4 }}>{x.valore}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** I passaggi in ordine, con le foto accanto e i documenti da conservare. */
export function PassaggiRacconto({ d, c, titolo, evidenza, sottotitolo, passaggi, icone, documenti, fotoAlta, fotoBassa, nota }: {
  d: DatiRacconto; c: Palette; titolo: string; evidenza: string; sottotitolo: string;
  passaggi: { titolo: string; testo: string }[];
  icone: NomeIcona[];
  documenti: readonly string[];
  fotoAlta?: string | null; fotoBassa?: string | null;
  nota: { titolo: string; testo: string };
}) {
  const elenco = passaggi.slice(0, 6);
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="I passaggi" titolo={titolo} evidenza={evidenza} sottotitolo={sottotitolo} />
      <View style={{ flexDirection: "row" }}>
      <View style={{ flex: 1.25 }}>
        {elenco.map((p, i) => (
          <View key={p.titolo} style={{ flexDirection: "row" }}>
            <View style={{ width: 30, alignItems: "center" }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i === elenco.length - 1 ? BASE.verde : c.navy, alignItems: "center", justifyContent: "center" }}>
                <IconaPdf nome={icone[i] ?? "verifica"} colore="#FFFFFF" lato={11} />
              </View>
              {i < elenco.length - 1 ? <View style={{ width: 1.5, flexGrow: 1, minHeight: 16, backgroundColor: BASE.linea, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingLeft: 8, paddingBottom: 14 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.1, color: BASE.arancio }}>{`PASSO ${i + 1}`}</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: c.navy, marginTop: 2 }}>{p.titolo}</Text>
              <Text style={{ fontSize: 8, color: BASE.testo, marginTop: 2, lineHeight: 1.4 }}>{conEuro(p.testo)}</Text>
            </View>
          </View>
        ))}
      </View>
      {fotoAlta || fotoBassa ? (
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Foto src={fotoAlta} altezza={fotoBassa ? 130 : 230} larghezza="100%" didascalia={false} />
          {fotoBassa ? <Foto src={fotoBassa} altezza={120} larghezza="100%" didascalia={false} stile={{ marginTop: 8 }} /> : null}
          <Text style={{ fontSize: 6, color: BASE.grigioChiaro, marginTop: 3 }}>Immagini illustrative.</Text>
        </View>
      ) : null}
      </View>
      <View style={{ marginTop: 6 }}>
        <TitoletoSezione>I documenti da conservare</TitoletoSezione>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {documenti.map((doc, i) => (
            <View key={doc} style={{ width: (LARGHEZZA - 16) / 3, marginRight: i % 3 === 2 ? 0 : 8, marginBottom: 8, flexDirection: "row", alignItems: "center", backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 7, paddingVertical: 8, paddingHorizontal: 9 }}>
              <View style={{ marginRight: 6 }}><IconaPdf nome="documenti" colore={BASE.arancioScuro} lato={10} /></View>
              <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: BASE.ink }}>{doc}</Text>
            </View>
          ))}
        </View>
      </View>
      <Spinta />
      <Nota tono="blu" icona="garanzia" titolo={nota.titolo} testo={nota.testo} />
    </Pagina>
  );
}

/** Le domande prima di scegliere. */
export function DomandeRacconto({ d, c, faq, foto }: { d: DatiRacconto; c: Palette; faq: { domanda: string; risposta: string }[]; foto?: string | null }) {
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Le tue domande" titolo={"Prima di scegliere,\n"} evidenza="le risposte." />
      {faq.slice(0, 8).map((q, i) => (
        <View key={q.domanda} wrap={false} style={{ paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BASE.linea }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: c.navy }}>{q.domanda}</Text>
          <Text style={{ fontSize: 8, color: BASE.testo, marginTop: 3, lineHeight: 1.45 }}>{conEuro(q.risposta)}</Text>
        </View>
      ))}
      <Spinta />
      <Foto src={foto} altezza={118} />
    </Pagina>
  );
}

/** La decisione: il riepilogo dell'offerta, cosa porta a casa, come si accetta. */
export function DecisioneRacconto({ d, c, offerta, kpi, foto, passi }: {
  d: DatiRacconto; c: Palette;
  offerta: { titolo: string; prezzo: number; riga: string; evidenza: [string, string] };
  kpi: { etichetta: string; valore: string; tono: Tono }[];
  foto?: string | null;
  passi: string[];
}) {
  const contatti = [["Telefono", d.azienda.telefono], ["Email", d.azienda.email], ["Sito", d.azienda.sito]].filter(([, v]) => v) as [string, string][];
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="La tua decisione" titolo={"Pronto a\n"} evidenza="cambiare?" />
      <View style={{ borderRadius: 12, overflow: "hidden" }}>
        <Svg viewBox="0 0 503 190" style={{ position: "absolute", top: 0, left: 0, width: LARGHEZZA, height: 190 }}>
          <Defs>
            <LinearGradient id="ct-offerta" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.navyScuro} />
              <Stop offset="1" stopColor={c.navy} />
            </LinearGradient>
            <RadialGradient id="ct-offerta-calore" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={BASE.arancio} stopOpacity={0.45} />
              <Stop offset="1" stopColor={BASE.arancio} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={503} height={190} fill="url(#ct-offerta)" />
          <Circle cx={440} cy={60} r={110} fill="url(#ct-offerta-calore)" />
        </Svg>
        <View style={{ height: 190, padding: 18 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.3, color: BASE.ambra }}>{`RIEPILOGO OFFERTA · VALIDA ${d.preventivo.validitaGiorni} GIORNI`}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, color: "#FFFFFF", marginTop: 8, maxWidth: 380, lineHeight: 1.25 }}>{offerta.titolo}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 30, letterSpacing: -1, color: BASE.ambra, marginTop: 10 }}>{soldi(offerta.prezzo)}</Text>
          <Text style={{ fontSize: 8, color: "#FFFFFF", opacity: 0.8, marginTop: 4 }}>{offerta.riga}</Text>
          <Text style={{ fontSize: 8, color: "#FFFFFF", marginTop: 3 }}>{offerta.evidenza[0]}<Text style={{ fontFamily: "Helvetica-Bold", color: BASE.ambra }}>{offerta.evidenza[1]}</Text></Text>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <TitoletoSezione>Cosa ti porta a casa</TitoletoSezione>
        <View style={{ flexDirection: "row" }}>
          {kpi.map((k, i) => <Kpi key={k.etichetta} etichetta={k.etichetta} valore={k.valore} tono={k.tono} ultimo={i === kpi.length - 1} />)}
        </View>
      </View>

      <Foto src={foto} altezza={128} stile={{ marginTop: 16 }} />
      <View style={{ flexDirection: "row", marginTop: 14 }}>
        <View style={{ flex: 1, marginRight: 18 }}>
          <TitoletoSezione>Per accettare la proposta</TitoletoSezione>
          {passi.map((t, i) => (
            <Text key={t} style={{ fontSize: 8, color: BASE.testo, lineHeight: 1.45, marginBottom: 3 }}>{`${i + 1}. ${t}`}</Text>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <TitoletoSezione>Per parlarne ancora</TitoletoSezione>
          {contatti.map(([etichetta, valore]) => (
            <View key={etichetta} style={{ flexDirection: "row", marginBottom: 4 }}>
              <Text style={{ width: 52, fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 0.8, color: BASE.grigio, marginTop: 1 }}>{etichetta.toUpperCase()}</Text>
              <Text style={{ flex: 1, fontSize: 8, color: BASE.ink }}>{valore}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pagina>
  );
}
