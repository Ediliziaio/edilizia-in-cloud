/**
 * Il preventivo Casa Full Electric: la casa che lascia il gas. Il racconto del
 * fotovoltaico — energia mese per mese, bollette prima e dopo, beneficio negli
 * anni, ambiente — con le pagine del preventivo di ristrutturazione: chi siamo,
 * il sistema pezzo per pezzo, voce per voce, passaggi, condizioni e firma.
 *
 * È un PDF vero (react-pdf): si scarica, si allega e si firma online come gli
 * altri preventivi. Solo i caratteri incorporati (Helvetica). I numeri arrivano
 * tutti da calcolaFullElectric: una pagina non può dire una cifra e la
 * successiva un'altra.
 */
import { Document, G, Image, Line, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { IconaPdf } from "@/components/preventivi/pdf/IconaPdf";
import type { NomeIcona } from "../../../../supabase/functions/_shared/iconePreventivo";
import { anniTesto } from "@/lib/contoTermico/calcoli";
import type { DomandaRisposta, Passaggio } from "@/lib/contoTermico/testi";
import { calcolaFullElectric, co2Testo, intero, kwh, type FullElectricEconomia, type FullElectricRisultato } from "@/lib/fullElectric/calcoli";
import { FULL_ELECTRIC, type ComponenteFullElectric } from "@/lib/fullElectric/regole";
import type { PezzoFullElectric } from "@/lib/fullElectric/dati";
import { DOCUMENTI_FULL_ELECTRIC, FAQ_FULL_ELECTRIC, PASSAGGI_FULL_ELECTRIC, PEZZI_FULL_ELECTRIC } from "@/lib/fullElectric/testi";
import { creaTema } from "@/components/preventivi/pdf/temaDocumento";
// I pezzi comuni ai documenti «racconto»: caricarli prepara anche Buffer e toglie la sillabazione inglese.
import {
  Foto, GraficoCumulato, GraficoSpesa, Intestazione, Kpi, Legenda, Nota, Pagina, Scheda, Spinta, Spunta, TitoletoSezione,
  type DatiRacconto,
} from "@/components/preventivi/pdf/racconto/baseRacconto";
import { BASE, LARGHEZZA, conEuro, palette, soldi, soldiCent, type Palette } from "@/components/preventivi/pdf/racconto/temaRacconto";
import {
  CasaInBreve, ChiSiamo, Condizioni, CopertinaRacconto, DecisioneRacconto, DomandeRacconto, Firma, FotoProgetto, Fornitura,
  OggiDomani, PassaggiRacconto, Recesso, Referenze,
} from "@/components/preventivi/pdf/racconto/pagineRacconto";

/** Le foto del documento: una per posto (e una per pezzo del sistema). Senza foto, il posto si chiude. */
export type FotoFullElectric =
  | "copertina" | "cosaVuolDire" | "oggi" | "domani" | "energia" | "bollette" | "incentivi" | "ambiente"
  | "passaggi" | "installazione" | "decisione" | ComponenteFullElectric;

export interface FullElectricPdfData extends DatiRacconto {
  sistema: {
    componenti: PezzoFullElectric[];
    /** Cosa si lascia: «Caldaia a gas e piano cottura a gas». */
    impiantoAttuale: string;
    voci: { descrizione: string; quantita?: number | null; unita?: string | null }[];
    caratteristiche: { etichetta: string; valore: string }[];
  };
  economia: FullElectricEconomia;
  testi?: {
    titoloCopertina?: string | null;
    sottotitoloCopertina?: string | null;
    faq?: DomandaRisposta[] | null;
    passaggi?: Passaggio[] | null;
  };
  foto?: Partial<Record<FotoFullElectric, string | null>>;
  /** Il colore dell'azienda al posto del blu, se c'è. */
  colorePrimario?: string | null;
}

const titoliPezzi = (d: FullElectricPdfData) => d.sistema.componenti.map((p) => p.titolo);

// ─── Grafici e riquadri della Full Electric ─────────────────────────────────
/** L'anno tipico: produzione del tetto e consumi della casa, mese per mese. */
function GraficoMesi({ r, c }: { r: FullElectricRisultato; c: Palette }) {
  const w = LARGHEZZA - 14; const h = 170; const padL = 44; const padR = 6; const padT = 12; const padB = 22;
  const massimo = Math.max(1, ...r.mesi.flatMap((m) => [m.produzione, m.consumo]));
  // Una tacca tonda sopra il massimo: 200, 500, 1.000…
  const scala = [100, 200, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000].find((v) => v >= massimo) ?? Math.ceil(massimo / 1000) * 1000;
  const base = h - padB;
  const yOf = (v: number) => padT + (base - padT) * (1 - v / scala);
  const passo = (w - padL - padR) / 12;
  const barra = Math.min(11, passo / 2 - 2);
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}>
      <Line x1={padL} y1={base} x2={w - padR} y2={base} stroke={BASE.grigioChiaro} strokeWidth={0.8} />
      <Line x1={padL} y1={yOf(scala)} x2={w - padR} y2={yOf(scala)} stroke={BASE.linea} strokeWidth={0.5} strokeDasharray="2 3" />
      <Line x1={padL} y1={yOf(scala / 2)} x2={w - padR} y2={yOf(scala / 2)} stroke={BASE.linea} strokeWidth={0.5} strokeDasharray="2 3" />
      <Text x={padL - 5} y={yOf(scala) + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>{kwh(scala)}</Text>
      <Text x={padL - 5} y={yOf(scala / 2) + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>{kwh(scala / 2)}</Text>
      <Text x={padL - 5} y={base + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>0</Text>
      {r.mesi.map((m, i) => {
        const centro = padL + i * passo + passo / 2;
        return (
          <G key={m.mese}>
            <Rect x={centro - barra - 1} y={yOf(m.produzione)} width={barra} height={Math.max(0, base - yOf(m.produzione))} rx={2} fill={BASE.arancio} />
            <Rect x={centro + 1} y={yOf(m.consumo)} width={barra} height={Math.max(0, base - yOf(m.consumo))} rx={2} fill={c.navy} />
            <Text x={centro} y={h - 8} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "middle" } as never}>{m.mese}</Text>
          </G>
        );
      })}
    </Svg>
  );
}

/** Sotto una barra divisa, le parti troppo strette per la loro scritta: un colore senza nome non si legge. */
function PartiSenzaScritta({ parti }: { parti: { colore: string; testo: string }[] }) {
  if (!parti.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
      {parti.map((p) => (
        <View key={p.testo} style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
          <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: p.colore, marginRight: 4 }} />
          <Text style={{ fontSize: 7, color: BASE.testo }}>{p.testo}</Text>
        </View>
      ))}
    </View>
  );
}

/** Una barra divisa nelle sue parti: da dove arrivano i kWh, e dove vanno. */
function BarraDivisa({ etichetta, totale, parti }: { etichetta: string; totale: number; parti: { valore: number; colore: string; testo: string }[] }) {
  const visibili = parti.filter((p) => p.valore > 0);
  return (
    <View wrap={false} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: BASE.ink }}>{etichetta}</Text>
        <Text style={{ fontSize: 8, color: BASE.grigio }}>{kwh(totale)}</Text>
      </View>
      <View style={{ flexDirection: "row", height: 22, borderRadius: 5, overflow: "hidden", backgroundColor: BASE.fondo }}>
        {visibili.map((p) => (
          <View key={p.testo} style={{ flex: p.valore, backgroundColor: p.colore, justifyContent: "center", paddingHorizontal: 6 }}>
            {/* Il testo solo dove ci sta: una parte piccola resta un colore. */}
            {totale > 0 && p.valore / totale >= 0.2 ? <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.8, color: "#FFFFFF" }}>{p.testo}</Text> : null}
          </View>
        ))}
      </View>
      <PartiSenzaScritta parti={visibili.filter((p) => !(totale > 0 && p.valore / totale >= 0.2))} />
    </View>
  );
}

// ─── Pagine della Full Electric ─────────────────────────────────────────────
function CosaVuolDire({ d, c }: { d: FullElectricPdfData; c: Palette }) {
  const schede: { icona: NomeIcona; titolo: string; testo: string }[] = [
    { icona: "no", titolo: "Niente più gas in casa", testo: "Nessuna combustione, niente contratto del gas con le sue quote fisse, niente revisione della caldaia." },
    { icona: "sole", titolo: "L'energia la fa il tuo tetto", testo: "Di giorno la casa usa l'energia del fotovoltaico prima di prenderla dalla rete." },
    { icona: "batteria", titolo: "La sera, dalla batteria", testo: "Quello che il tetto produce a mezzogiorno serve anche la sera, quando si è a casa." },
    { icona: "temperatura", titolo: "Il calore dall'aria", testo: "La pompa di calore prende calore dall'aria esterna: ne rende più di quanta elettricità consuma." },
  ];
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Casa Full Electric" titolo={"Una sola energia,\n"} evidenza="fatta in casa." sottotitolo="Riscaldamento, acqua calda e cucina passano all'elettricità. Il tuo tetto ne produce una parte, la batteria la conserva per la sera, la rete dà il resto." />
      <Foto src={d.foto?.cosaVuolDire} altezza={150} stile={{ marginBottom: 10 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {schede.map((s, i) => <Scheda key={s.titolo} {...s} c={c} ultimaColonna={i % 2 === 1} />)}
      </View>
      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <View style={{ flex: 1, marginRight: 18 }}>
          <TitoletoSezione>Per chi è</TitoletoSezione>
          <Spunta testo="Per chi ha una caldaia a gas da cambiare, oggi o fra poco." />
          <Spunta testo="Per chi ha un tetto al sole e vive la casa anche di sera." />
          <Spunta testo="Per chi vuole una bolletta sola, più prevedibile." />
        </View>
        <View style={{ flex: 1 }}>
          <TitoletoSezione>Cosa serve</TitoletoSezione>
          <Spunta testo="Un tetto o uno spazio adatto ai moduli." />
          <Spunta testo="Un posto per l'unità esterna e per la batteria." />
          <Spunta testo="La potenza del contatore adeguata: di solito 4,5 o 6 kW." />
        </View>
      </View>
      <Spinta />
      <Nota tono="blu" icona="documenti" titolo="Numeri stimati, e dichiarati." testo="Produzione, consumi, bollette e incentivi di questo preventivo sono stime sui dati scritti qui: il risultato vero dipende da come si usa la casa, dal meteo e dalle tariffe." />
    </Pagina>
  );
}

function Cambiamento({ d, c }: { d: FullElectricPdfData; c: Palette }) {
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il tuo intervento" titolo={"Da due bollette\n"} evidenza="a una." sottotitolo="Via la caldaia e il piano a gas: il calore dall'aria, la cucina a induzione, l'energia dal tetto." />
      <OggiDomani
        oggi={{ foto: d.foto?.oggi, titolo: d.sistema.impiantoAttuale, testo: "Gas per scaldare, per l'acqua calda e per cucinare: due contratti, due bollette e la caldaia da revisionare." }}
        domani={{ foto: d.foto?.domani, etichetta: "Domani · Casa Full Electric", titolo: "Tutta elettrica, col sole del tetto", testo: titoliPezzi(d).length ? `${titoliPezzi(d).join(", ")}.` : "Il sistema descritto pezzo per pezzo nelle prossime pagine." }}
      />
      <CasaInBreve d={d} />
      <View style={{ marginTop: 16 }}>
        <TitoletoSezione>Cosa cambia, in pratica</TitoletoSezione>
        <Spunta testo="La caldaia e il piano a gas si smontano; quando tutto funziona, il contratto del gas si chiude." />
        <Spunta testo="Riscaldamento e acqua calda dalla pompa di calore, la cucina a induzione, l'energia in parte dal tetto." />
        <Spunta testo="Il sistema, pezzo per pezzo, è nella pagina che segue; energia, bollette e incentivi subito dopo." />
      </View>
      <Spinta />
      <Nota tono="verde" icona="energia" titolo="Una bolletta sola." testo="Senza gas restano la luce presa dalla rete e le sue quote fisse, meno quello che il tetto vende alla rete quando la casa non lo usa." />
    </Pagina>
  );
}

/** Un pezzo del sistema: la foto (o il suo segno), cosa è, cosa fa. */
function SchedaPezzo({ pezzo, foto, c, ultimaColonna }: { pezzo: PezzoFullElectric; foto?: string | null; c: Palette; ultimaColonna: boolean }) {
  const info = PEZZI_FULL_ELECTRIC[pezzo.tipo];
  return (
    <View wrap={false} style={{ width: (LARGHEZZA - 12) / 2, marginRight: ultimaColonna ? 0 : 12, marginBottom: 12, borderWidth: 1, borderColor: BASE.linea, borderRadius: 10, overflow: "hidden" }}>
      {foto ? (
        <Image src={foto} style={{ width: "100%", height: 104, objectFit: "cover" }} />
      ) : (
        <View style={{ height: 104, backgroundColor: BASE.fondo, alignItems: "center", justifyContent: "center" }}>
          <IconaPdf nome={info.icona} colore={c.navyChiaro} lato={34} />
        </View>
      )}
      <View style={{ padding: 11 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: BASE.arancioTenue, alignItems: "center", justifyContent: "center", marginRight: 7 }}>
            <IconaPdf nome={info.icona} colore={BASE.arancioScuro} lato={10} />
          </View>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 10, color: c.navy }}>{pezzo.titolo}</Text>
        </View>
        {pezzo.dettaglio ? <Text style={{ fontSize: 7.6, fontFamily: "Helvetica-Bold", color: BASE.ink, marginTop: 5 }}>{pezzo.dettaglio}</Text> : null}
        <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 4, lineHeight: 1.4 }}>{info.cosaFa}</Text>
      </View>
    </View>
  );
}

function Sistema({ d, c }: { d: FullElectricPdfData; c: Palette }) {
  const scheda = d.sistema.caratteristiche.filter((x) => x.etichetta?.trim() && x.valore?.trim()).slice(0, 8);
  const meta = Math.ceil(scheda.length / 2);
  const colonne = [scheda.slice(0, meta), scheda.slice(meta)];
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il tuo sistema" titolo={"Pezzo per pezzo,\n"} evidenza="un solo impianto." sottotitolo="Ogni componente fa la sua parte: insieme scaldano la casa, fanno l'acqua calda, cucinano e producono l'energia che serve." />
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {d.sistema.componenti.map((p, i) => <SchedaPezzo key={p.tipo} pezzo={p} foto={d.foto?.[p.tipo]} c={c} ultimaColonna={i % 2 === 1} />)}
      </View>
      {d.sistema.componenti.some((p) => d.foto?.[p.tipo]) ? <Text style={{ fontSize: 6, color: BASE.grigioChiaro, marginTop: -6, marginBottom: 8 }}>Immagini illustrative: i modelli sono quelli indicati.</Text> : null}
      {scheda.length ? (
        <View wrap={false} style={{ marginTop: 4 }}>
          <TitoletoSezione>La scheda del sistema</TitoletoSezione>
          <View style={{ flexDirection: "row" }}>
            {colonne.map((col, k) => (
              <View key={k} style={{ flex: 1, marginRight: k === 0 ? 12 : 0, borderWidth: col.length ? 1 : 0, borderColor: BASE.linea, borderRadius: 8 }}>
                {col.map((x, i) => (
                  <View key={x.etichetta} style={{ flexDirection: "row", paddingVertical: 6.5, paddingHorizontal: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BASE.linea, backgroundColor: i % 2 === 0 ? "#FFFFFF" : BASE.fondo }}>
                    <Text style={{ flex: 1.1, fontSize: 7.5, color: BASE.grigio }}>{x.etichetta}</Text>
                    <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: BASE.ink, textAlign: "right" }}>{x.valore}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 6.5, color: BASE.grigioChiaro, marginTop: 4 }}>Dati dei produttori per i modelli proposti. Fanno fede le schede tecniche allegate.</Text>
        </View>
      ) : null}
    </Pagina>
  );
}

function Energia({ d, r, c }: { d: FullElectricPdfData; r: FullElectricRisultato; c: Palette }) {
  const e = r.energia;
  return (
    <Pagina d={d} c={c}>
      <Intestazione
        c={c}
        occhiello="La tua energia"
        titolo={e.coperturaPct > 0 ? `Il ${e.coperturaPct}% dei consumi\n` : "La tua energia,\n"}
        evidenza={e.coperturaPct > 0 ? "arriva dal tuo tetto." : "mese per mese."}
        sottotitolo="Quanto produce il tetto e quanto consuma la casa in un anno tipico. D'inverno la pompa di calore chiede di più e il sole dà di meno: la differenza arriva dalla rete."
      />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Produzione" valore={kwh(e.produzione)} nota="del tetto, in un anno" tono="arancio" />
        <Kpi etichetta="Consumi della casa" valore={kwh(e.consumo)} nota="tutta elettrica, in un anno" />
        <Kpi etichetta="Dal tuo tetto" valore={`${e.coperturaPct}%`} nota="dei consumi di casa" tono="verde" />
        <Kpi etichetta="Dalla rete" valore={kwh(e.dallaRete)} nota="il resto, in bolletta" tono="blu" ultimo />
      </View>
      <View style={{ marginTop: 14, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 6 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink, marginLeft: 8 }}>Mese per mese</Text>
        <Text style={{ fontSize: 7, color: BASE.grigio, marginLeft: 8, marginTop: 2, marginBottom: 4 }}>Andamento tipico, indicativo: la produzione vera dipende da orientamento, ombre e meteo.</Text>
        <GraficoMesi r={r} c={c} />
        <Legenda voci={[{ colore: BASE.arancio, testo: "Produzione del tetto" }, { colore: c.navy, testo: "Consumi della casa" }]} />
        <View style={{ height: 8 }} />
      </View>
      <View style={{ marginTop: 14 }}>
        <TitoletoSezione>Il bilancio dell'anno</TitoletoSezione>
        <BarraDivisa etichetta="I consumi della casa" totale={e.consumo} parti={[
          { valore: e.autoconsumo, colore: BASE.verde, testo: `Dal tetto · ${kwh(e.autoconsumo)}` },
          { valore: e.dallaRete, colore: c.navy, testo: `Dalla rete · ${kwh(e.dallaRete)}` },
        ]} />
        <BarraDivisa etichetta="La produzione del tetto" totale={e.produzione} parti={[
          { valore: e.autoconsumo, colore: BASE.verde, testo: `Usata in casa · ${kwh(e.autoconsumo)}` },
          { valore: e.immessa, colore: BASE.arancio, testo: `Venduta alla rete · ${kwh(e.immessa)}` },
        ]} />
      </View>
      <Spinta />
      <Foto src={d.foto?.energia} altezza={110} />
    </Pagina>
  );
}

function Bollette({ d, r, c }: { d: FullElectricPdfData; r: FullElectricRisultato; c: Palette }) {
  const b = r.bollette;
  const risparmia = r.risparmioAnnuo > 0;
  const righe: [string, string, string][] = [
    ["Gas", soldi(b.oggi.gas), soldi(0)],
    ["Luce", soldi(b.oggi.luce), soldi(b.domani.luce)],
    ["Energia venduta alla rete", "-", b.domani.ricavo > 0 ? `-${soldi(b.domani.ricavo)}` : soldi(0)],
  ];
  return (
    <Pagina d={d} c={c}>
      <Intestazione
        c={c}
        occhiello="Le bollette"
        titolo={risparmia ? `${soldi(r.risparmioMensile)} al mese\n` : "Le bollette,\n"}
        evidenza={risparmia ? "in meno in bolletta." : "prima e dopo."}
        sottotitolo="Un anno di spese per l'energia della casa: oggi gas e luce, domani solo la luce presa dalla rete, meno quella che il tetto vende."
      />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Oggi, gas e luce" valore={soldi(b.oggi.totale)} nota="in un anno" tono="rosso" />
        <Kpi etichetta="Domani, solo luce" valore={soldi(b.domani.totale)} nota="rete meno energia venduta" tono="verde" />
        <Kpi etichetta="Risparmio" valore={soldi(Math.max(0, r.risparmioAnnuo))} nota="ogni anno, ai prezzi di oggi" tono="verde" ultimo />
      </View>
      <View style={{ marginTop: 14, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 8 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink }}>La spesa di un anno per l'energia di casa</Text>
        <GraficoSpesa oggi={b.oggi.totale} domani={Math.max(0, b.domani.totale)} etichettaOggi="Oggi · gas e luce" etichettaDomani="Domani · solo luce" c={c} />
      </View>
      <View style={{ marginTop: 12, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
        <View style={{ flexDirection: "row", backgroundColor: c.navy, borderTopLeftRadius: 7, borderTopRightRadius: 7, paddingVertical: 6, paddingHorizontal: 11 }}>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>VOCE</Text>
          <Text style={{ width: 90, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>OGGI</Text>
          <Text style={{ width: 90, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>DOMANI</Text>
        </View>
        {righe.map(([voce, oggi, domani]) => (
          <View key={voce} style={{ flexDirection: "row", paddingVertical: 6, paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: BASE.linea }}>
            <Text style={{ flex: 1, fontSize: 8, color: BASE.testo }}>{voce}</Text>
            <Text style={{ width: 90, fontSize: 8, color: BASE.ink, textAlign: "right" }}>{oggi}</Text>
            <Text style={{ width: 90, fontSize: 8, color: BASE.ink, textAlign: "right" }}>{domani}</Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", paddingVertical: 7, paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: BASE.linea, backgroundColor: BASE.fondo }}>
          <Text style={{ flex: 1, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BASE.ink }}>In un anno</Text>
          <Text style={{ width: 90, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BASE.rosso, textAlign: "right" }}>{soldi(b.oggi.totale)}</Text>
          <Text style={{ width: 90, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BASE.verdeScuro, textAlign: "right" }}>{soldi(b.domani.totale)}</Text>
        </View>
      </View>
      <Spinta />
      <Foto src={d.foto?.bollette} altezza={110} stile={{ marginBottom: 10 }} />
      <Nota
        tono="arancio" icona="risparmio" titolo="Ai prezzi di oggi."
        testo={`I conti usano i prezzi scritti in questo preventivo: luce dalla rete ${soldiCent(d.economia.domani.prezzoLuce)} al kWh, energia venduta ${soldiCent(d.economia.domani.prezzoImmissione)} al kWh. Se l'energia aumenta cresce anche il risparmio: negli anni lo contiamo con un +${d.economia.aumentoEnergiaPct}% l'anno.`}
      />
    </Pagina>
  );
}

function Incentivi({ d, r, c }: { d: FullElectricPdfData; r: FullElectricRisultato; c: Palette }) {
  const inc = r.incentivi;
  const det = inc.detrazione;
  const quota = (v: number) => (r.prezzo > 0 ? v / r.prezzo : 0);
  const parti = [
    { valore: r.costoNetto, colore: c.navy, testo: `A te · ${soldi(r.costoNetto)}` },
    { valore: det?.totale ?? 0, colore: BASE.blu, testo: `Detrazione · ${soldi(det?.totale ?? 0)}` },
    { valore: inc.contributoCt, colore: BASE.arancio, testo: `Conto Termico · ${soldi(inc.contributoCt)}` },
  ].filter((p) => p.valore > 0);
  return (
    <Pagina d={d} c={c}>
      <Intestazione
        c={c}
        occhiello="Gli incentivi"
        titolo={inc.totale > 0 ? `${soldi(inc.totale)}\n` : "Gli incentivi,\n"}
        evidenza={inc.totale > 0 ? "di incentivi stimati." : "caso per caso."}
        sottotitolo="Detrazione per la casa e Conto Termico valgono su componenti diversi: qui trovi cosa vale per cosa e quanto resta a te."
      />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Prezzo chiavi in mano" valore={soldi(r.prezzo)} nota={`IVA ${d.economia.ivaPct}% inclusa`} />
        {inc.contributoCt > 0 ? <Kpi etichetta="Conto Termico" valore={`-${soldi(inc.contributoCt)}`} nota="sulla pompa di calore" tono="arancio" /> : null}
        {det ? <Kpi etichetta={`Detrazione ${det.pct}%`} valore={`-${soldi(det.totale)}`} nota={`in ${FULL_ELECTRIC.anniDetrazione} anni`} tono="blu" /> : null}
        <Kpi etichetta="Dopo gli incentivi" valore={soldi(r.costoNetto)} nota="il costo vero" tono="verde" ultimo />
      </View>
      {parti.length > 1 ? (
        <View style={{ marginTop: 18 }}>
          <TitoletoSezione>Chi paga cosa</TitoletoSezione>
          <View style={{ flexDirection: "row", height: 30, borderRadius: 6, overflow: "hidden" }}>
            {parti.map((p) => (
              <View key={p.testo} style={{ flex: Math.max(0.001, quota(p.valore)), backgroundColor: p.colore, justifyContent: "center", paddingHorizontal: 8 }}>
                {quota(p.valore) >= 0.18 ? <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#FFFFFF" }}>{p.testo}</Text> : null}
              </View>
            ))}
          </View>
          <PartiSenzaScritta parti={parti.filter((p) => quota(p.valore) < 0.18)} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", marginTop: 16 }}>
        {det ? (
          <View style={{ flex: 1, marginRight: inc.contributoCt > 0 ? 10 : 0, backgroundColor: BASE.bluTenue, borderWidth: 1, borderColor: BASE.bluBordo, borderRadius: 8, padding: 12 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.1, color: BASE.blu }}>{`DETRAZIONE ${det.pct}% PER LA CASA`}</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: BASE.ink, marginTop: 5 }}>{soldi(det.totale)}</Text>
            <Text style={{ fontSize: 7.8, color: BASE.testo, marginTop: 4, lineHeight: 1.45 }}>{`Su ${soldi(det.base)} di spesa detraibile (fotovoltaico, batteria e lavori collegati): ${FULL_ELECTRIC.anniDetrazione} quote annuali da ${soldi(det.perAnno)} nella dichiarazione dei redditi.`}</Text>
          </View>
        ) : null}
        {inc.contributoCt > 0 ? (
          <View style={{ flex: 1, backgroundColor: BASE.arancioTenue, borderWidth: 1, borderColor: BASE.arancioBordo, borderRadius: 8, padding: 12 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.1, color: BASE.arancioScuro }}>CONTO TERMICO SULLA POMPA DI CALORE</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: BASE.ink, marginTop: 5 }}>{soldi(inc.contributoCt)}</Text>
            <Text style={{ fontSize: 7.8, color: BASE.testo, marginTop: 4, lineHeight: 1.45 }}>
              {inc.scontoInFattura
                ? `Lo scontiamo in fattura con il mandato all'incasso: ai lavori paghi ${soldi(r.pagaOggi)} invece di ${soldi(r.prezzo)}`
                : "Lo versa il GSE sul tuo conto corrente, dopo l'accettazione della domanda."}
            </Text>
          </View>
        ) : null}
        {!det && inc.contributoCt <= 0 ? (
          <Text style={{ fontSize: 8.5, color: BASE.testo, lineHeight: 1.5 }}>In questa proposta non ci sono incentivi stimati: se la tua casa ne ha diritto, li aggiungiamo prima della firma.</Text>
        ) : null}
      </View>
      <Spinta />
      <Foto src={d.foto?.incentivi} altezza={170} stile={{ marginBottom: 10 }} />
      <Nota tono="blu" icona="detrazione" titolo="Stime, a norma vigente." testo="Detrazione e Conto Termico non si sommano sullo stesso componente. Importi e aliquote dipendono dai requisiti della casa e dalle regole in vigore: verificali con il tuo consulente fiscale." />
    </Pagina>
  );
}

function Beneficio({ d, r, c }: { d: FullElectricPdfData; r: FullElectricRisultato; c: Palette }) {
  const anni = r.anniBeneficio.length - 1;
  const positivo = r.beneficioFinale > 0;
  const rientro = r.anniDiRientro;
  const tappe = [...new Set([0, 1, rientro != null ? Math.ceil(rientro) : -1, 5, 10, anni])]
    .filter((a) => a >= 0 && a <= anni)
    .sort((a, b) => a - b);
  return (
    <Pagina d={d} c={c}>
      <Intestazione
        c={c}
        occhiello="Il beneficio negli anni"
        titolo={positivo ? `+${soldi(r.beneficioFinale)}\n` : `In ${anni} anni\n`}
        evidenza={positivo ? `in ${anni} anni.` : "il conto completo."}
        sottotitolo={rientro != null
          ? `Risparmi in bolletta e incentivi, anno dopo anno, meno quello che spendi oggi. La spesa è ripagata in circa ${anniTesto(rientro)}.`
          : "Risparmi in bolletta e incentivi, anno dopo anno, meno quello che spendi oggi."}
      />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Spesa ripagata in" valore={rientro != null ? anniTesto(rientro) : "oltre l'orizzonte"} tono="arancio" />
        <Kpi etichetta={`Risparmi in ${anni} anni`} valore={soldi(Math.max(0, r.risparmiTotali))} tono="verde" />
        <Kpi etichetta="Incentivi" valore={soldi(r.incentivi.totale)} tono="neutro" ultimo />
      </View>
      <View style={{ marginTop: 16, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 6 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink, marginLeft: 8 }}>Quanto hai in tasca, anno dopo anno</Text>
        <Text style={{ fontSize: 7, color: BASE.grigio, marginLeft: 8, marginTop: 2 }}>Sotto lo zero finché la spesa non è ripagata, sopra da lì in poi.</Text>
        <GraficoCumulato anni={r.anniBeneficio} rientro={rientro} c={c} />
      </View>
      <View style={{ marginTop: 12, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
        <View style={{ flexDirection: "row", backgroundColor: c.navy, borderTopLeftRadius: 7, borderTopRightRadius: 7, paddingVertical: 6, paddingHorizontal: 11 }}>
          <Text style={{ width: 60, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>ANNO</Text>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>COSA SUCCEDE</Text>
          <Text style={{ width: 90, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>IN TASCA</Text>
        </View>
        {tappe.map((anno) => {
          const a = r.anniBeneficio[anno];
          const cosa = anno === 0
            ? (r.pagaOggi < r.prezzo ? "Lavori: paghi il prezzo già scontato del Conto Termico" : "Lavori: paghi il prezzo chiavi in mano")
            : anno === 1 && a.incentivi > 0 ? "Il primo anno di bollette leggere e la prima quota di incentivi"
            : rientro != null && anno === Math.ceil(rientro) ? "La spesa è ripagata: da qui in poi è guadagno"
            : anno === anni ? "Fine del periodo considerato"
            : anno === FULL_ELECTRIC.anniDetrazione && r.incentivi.detrazione ? "L'ultima quota della detrazione"
            : "Risparmi in bolletta";
          return (
            <View key={anno} style={{ flexDirection: "row", paddingVertical: 6, paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: BASE.linea }}>
              <Text style={{ width: 60, fontSize: 8, fontFamily: "Helvetica-Bold", color: BASE.ink }}>{anno === 0 ? "Oggi" : String(anno)}</Text>
              <Text style={{ flex: 1, fontSize: 8, color: BASE.testo }}>{cosa}</Text>
              <Text style={{ width: 90, fontSize: 8, fontFamily: "Helvetica-Bold", color: a.cumulato >= 0 ? BASE.verdeScuro : BASE.rosso, textAlign: "right" }}>{soldi(a.cumulato)}</Text>
            </View>
          );
        })}
      </View>
    </Pagina>
  );
}

function Ambiente({ d, r, c }: { d: FullElectricPdfData; r: FullElectricRisultato; c: Palette }) {
  const a = r.ambiente;
  const anni = r.anniBeneficio.length - 1;
  return (
    <Pagina d={d} c={c}>
      <Intestazione
        c={c}
        occhiello="L'ambiente"
        titolo={a.co2EvitataKg > 0 ? `${co2Testo(a.co2EvitataKg)} di CO2\n` : "Meno CO2,\n"}
        evidenza={a.co2EvitataKg > 0 ? "in meno ogni anno." : "niente gas."}
        sottotitolo="Niente più gas bruciato in casa, e una parte dell'elettricità fatta dal sole: la differenza, in un anno e negli anni."
      />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Gas non più bruciato" valore={`${intero(a.gasSmcEvitati)} Smc`} nota="ogni anno" tono="arancio" />
        <Kpi etichetta="CO2 evitata" valore={co2Testo(a.co2EvitataKg)} nota="ogni anno" tono="verde" />
        <Kpi etichetta={`In ${anni} anni`} valore={co2Testo(a.co2EvitataTotaleKg)} nota="di CO2 in meno" tono="verde" />
        <Kpi etichetta="Come piantare" valore={`${a.alberi} alberi`} nota="che la assorbono in un anno" ultimo />
      </View>
      <View style={{ marginTop: 14, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 8 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink }}>La CO2 di un anno</Text>
        <GraficoSpesa oggi={a.co2OggiKg} domani={a.co2DomaniKg} etichettaOggi="Oggi · gas e luce" etichettaDomani="Domani · solo luce dalla rete" c={c} formato={co2Testo} sottoDifferenza="di CO2 ogni anno" />
      </View>
      <Spinta />
      <Foto src={d.foto?.ambiente} altezza={190} stile={{ marginBottom: 10 }} />
      <Nota tono="verde" icona="sole" titolo="Stime con fattori medi." testo={`${String(FULL_ELECTRIC.co2PerSmcGas).replace(".", ",")} kg di CO2 per Smc di gas bruciato, ${String(FULL_ELECTRIC.co2PerKwhRete).replace(".", ",")} kg per kWh preso dalla rete; un albero adulto assorbe in media ${FULL_ELECTRIC.co2PerAlbero} kg di CO2 in un anno.`} />
    </Pagina>
  );
}

export function FullElectricPDF({ data }: { data: FullElectricPdfData }) {
  const c = palette(data.colorePrimario);
  const r = calcolaFullElectric(data.economia);
  // I pezzi presi dal documento degli altri preventivi (sigilli, recensioni) nei colori di questo.
  const tema = creaTema({ primario: c.navy, accento: BASE.arancio });
  const pezzi = titoliPezzi(data);
  const det = r.incentivi.detrazione;
  const incentivi = [
    det ? `detrazione ${det.pct}% ${soldi(det.totale)} in ${FULL_ELECTRIC.anniDetrazione} anni` : null,
    r.incentivi.contributoCt > 0 ? `Conto Termico ${soldi(r.incentivi.contributoCt)} ${r.incentivi.scontoInFattura ? "scontato in fattura" : "versato dal GSE"}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Document title={`Preventivo ${data.preventivo.codice} · Casa Full Electric`} author={data.azienda.nome} subject="Preventivo Casa Full Electric" language="it-IT">
      <CopertinaRacconto
        d={data} c={c} foto={data.foto?.copertina}
        sottoNome="La casa tutta elettrica"
        occhiello="Casa Full Electric · La tua proposta"
        titolo={data.testi?.titoloCopertina?.trim() || "La casa senza gas.\nTutta elettrica,\ndal tuo tetto."}
        sottotitolo={data.testi?.sottotitoloCopertina?.trim() || "Pompa di calore, induzione, fotovoltaico e batteria: un solo progetto e una sola bolletta."}
        schede={[
          { etichetta: "Il tuo sistema", titolo: pezzi.slice(0, 3).join(" · ") || "Casa Full Electric", nota: `al posto di: ${data.sistema.impiantoAttuale.toLowerCase()}`, flex: 1.3 },
          { etichetta: "Preparato per", titolo: data.cliente.nome, nota: data.cliente.indirizzo },
        ]}
      />
      <ChiSiamo d={data} c={c} tema={tema} />
      <CosaVuolDire d={data} c={c} />
      <Cambiamento d={data} c={c} />
      <Sistema d={data} c={c} />
      <Fornitura
        d={data} c={c} vociDiRiserva={data.sistema.voci}
        sottotitolo="I componenti proposti, i materiali e la manodopera compresi nel prezzo chiavi in mano."
        modello={{
          etichetta: "Il sistema proposto",
          titolo: "Casa Full Electric",
          sottotitolo: pezzi.join(" · ") || undefined,
          foto: data.foto?.domani ?? data.foto?.copertina ?? null,
          scheda: data.sistema.caratteristiche,
        }}
      />
      <FotoProgetto d={data} c={c} />
      <Energia d={data} r={r} c={c} />
      <Bollette d={data} r={r} c={c} />
      <Incentivi d={data} r={r} c={c} />
      <Beneficio d={data} r={r} c={c} />
      <Ambiente d={data} r={r} c={c} />
      <Referenze d={data} c={c} tema={tema} />
      <PassaggiRacconto
        d={data} c={c} titolo={"Dal sopralluogo\n"} evidenza="all'addio al gas."
        sottotitolo="Cosa succede, in ordine. I tempi delle pratiche dipendono dal distributore di rete e dal GSE."
        passaggi={data.testi?.passaggi?.length ? data.testi.passaggi : PASSAGGI_FULL_ELECTRIC}
        icone={["sopralluogo", "pratiche", "installazione", "collaudo", "verifica"]}
        documenti={DOCUMENTI_FULL_ELECTRIC}
        fotoAlta={data.foto?.passaggi} fotoBassa={data.foto?.installazione}
        nota={{ titolo: "Una bolletta sola.", testo: "Quando riscaldamento, acqua calda e cucina non usano più il gas, il contratto si chiude: niente più quote fisse del gas." }}
      />
      <DomandeRacconto d={data} c={c} faq={data.testi?.faq?.length ? data.testi.faq : FAQ_FULL_ELECTRIC} />
      <DecisioneRacconto
        d={data} c={c}
        offerta={{
          titolo: "Casa Full Electric, chiavi in mano",
          prezzo: r.prezzo,
          riga: conEuro(`IVA ${data.economia.ivaPct}% inclusa${r.incentivi.totale > 0 ? ` · incentivi stimati ${soldi(r.incentivi.totale)}` : ""}`),
          evidenza: r.incentivi.totale > 0 ? ["Dopo gli incentivi: ", soldi(r.costoNetto)] : ["Risparmio in bolletta: ", `${soldi(Math.max(0, r.risparmioAnnuo))} l'anno`],
        }}
        kpi={[
          { etichetta: "Risparmio annuo", valore: soldi(Math.max(0, r.risparmioAnnuo)), tono: "verde" },
          { etichetta: "Spesa ripagata", valore: r.anniDiRientro != null ? anniTesto(r.anniDiRientro) : "oltre", tono: "neutro" },
          { etichetta: `In ${r.anniBeneficio.length - 1} anni`, valore: soldi(r.beneficioFinale), tono: r.beneficioFinale >= 0 ? "verde" : "rosso" },
          { etichetta: "CO2 evitata", valore: `${co2Testo(r.ambiente.co2EvitataKg)} l'anno`, tono: "arancio" },
        ]}
        foto={data.foto?.decisione}
        passi={["Firma la proposta: online, con il link ricevuto, oppure su carta.", "Fissiamo il sopralluogo tecnico e il calendario dei lavori.", "Attiviamo l'impianto e prepariamo le pratiche per gli incentivi."]}
      />
      <Condizioni d={data} c={c} />
      <Firma
        d={data} c={c}
        oggetto={`Casa Full Electric${pezzi.length ? `: ${pezzi.join(", ")},` : ","} al posto di: ${data.sistema.impiantoAttuale.toLowerCase()}`}
        importo={`${soldi(r.prezzo)} IVA ${data.economia.ivaPct}% inclusa`}
        righeExtra={incentivi ? [["Incentivi stimati", incentivi]] : []}
        cosaSiAccetta={["il sistema proposto", "l'importo", "le stime di energia e di risparmio"]}
        avvertenza="Sa che produzione, risparmi e incentivi sono stime, e che gli incentivi dipendono dai requisiti e dalle regole in vigore."
      />
      <Recesso d={data} c={c} />
    </Document>
  );
}
