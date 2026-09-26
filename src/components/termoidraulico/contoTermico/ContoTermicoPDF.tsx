/**
 * Il preventivo Conto Termico 3.0: lo stesso racconto del preventivo
 * fotovoltaico (copertina blu, numeri grandi, risparmio e cassa negli anni),
 * scritto per chi sostituisce il riscaldamento e riceve il contributo del GSE.
 *
 * È un PDF vero (react-pdf) e non una pagina da stampare: così si scarica, si
 * allega e si firma online come gli altri preventivi dei moduli. Usa solo i
 * caratteri incorporati (Helvetica): niente «−», «→», «✓», che spariscono.
 *
 * I numeri arrivano tutti da calcolaContoTermico: una pagina non può dire una
 * cifra e la successiva un'altra.
 */
import { Document, Line, Path, Svg, Text, View } from "@react-pdf/renderer";
import { IconaPdf } from "@/components/preventivi/pdf/IconaPdf";
import type { NomeIcona } from "../../../../supabase/functions/_shared/iconePreventivo";
import { anniTesto, calcolaContoTermico, type ContoTermicoEconomia, type ContoTermicoRisultato } from "@/lib/contoTermico/calcoli";
import { CONTO_TERMICO, INTERVENTI_CONTO_TERMICO, type InterventoContoTermico } from "@/lib/contoTermico/regole";
import {
  DOCUMENTI_CONTO_TERMICO, FAQ_CONTO_TERMICO, PASSAGGI_CONTO_TERMICO, VANTAGGI_CONTO_TERMICO,
  type DomandaRisposta, type Passaggio, type Vantaggio,
} from "@/lib/contoTermico/testi";
import { creaTema } from "@/components/preventivi/pdf/temaDocumento";
// I pezzi comuni ai documenti «racconto» (Conto Termico, Casa Full Electric).
// Caricarli prepara anche Buffer e toglie la sillabazione inglese.
import {
  Foto, GraficoCumulato, GraficoSpesa, Intestazione, Kpi, Legenda, Nota, Pagina, Scheda, Spinta, Spunta, TitoletoSezione,
  type DatiRacconto,
} from "@/components/preventivi/pdf/racconto/baseRacconto";
import { BASE, LARGHEZZA, PDF_EURO, conEuro, palette, soldi, type Palette } from "@/components/preventivi/pdf/racconto/temaRacconto";
import {
  CasaInBreve, ChiSiamo, Condizioni, CopertinaRacconto, DecisioneRacconto, DomandeRacconto, Firma, FotoProgetto, Fornitura,
  OggiDomani, PassaggiRacconto, Recesso, Referenze,
} from "@/components/preventivi/pdf/racconto/pagineRacconto";

/** Le foto del documento: una per posto. Senza foto, il posto si chiude. */
export type FotoContoTermico =
  | "copertina" | "cosaVuolDire" | "oggi" | "domani" | "interno" | "dettaglio" | "incentivo" | "installazione" | "comfort" | "passaggi" | "domande" | "decisione";

export interface ContoTermicoPdfData extends DatiRacconto {
  intervento: {
    tipo: InterventoContoTermico;
    /** Cosa si installa: «Pompa di calore aria-acqua 8 kW». */
    titolo: string;
    /** Cosa si toglie: «Caldaia a gas del 2008». */
    impiantoAttuale: string;
    voci: { descrizione: string; quantita?: number | null; unita?: string | null }[];
    /** La scheda tecnica del modello proposto: «Potenza termica» → «8 kW». */
    caratteristiche?: { etichetta: string; valore: string }[];
  };
  economia: ContoTermicoEconomia;
  testi?: {
    titoloCopertina?: string | null;
    sottotitoloCopertina?: string | null;
    faq?: DomandaRisposta[] | null;
    passaggi?: Passaggio[] | null;
    vantaggi?: Vantaggio[] | null;
  };
  foto?: Partial<Record<FotoContoTermico, string | null>>;
  /** Il colore dell'azienda al posto del blu, se c'è. */
  colorePrimario?: string | null;
}

// ─── Grafici ────────────────────────────────────────────────────────────────
/** Quanto è tornato in tasca, anno per anno: contributo contro detrazione. */
function GraficoConfronto({ r }: { r: ContoTermicoRisultato }) {
  if (!r.detrazione) return null;
  const w = LARGHEZZA - 14; const h = 160; const padL = 46; const padR = 16; const padT = 12; const padB = 24;
  const anni = Array.from({ length: 11 }, (_, i) => i);
  const contributo = (anno: number) => r.rate.filter((x) => x.anno <= anno).reduce((s, x) => s + x.importo, 0);
  // Con lo sconto in fattura il contributo è già nel prezzo: c'è dall'anno 0.
  const ricevuto = (anno: number) => (r.pagaOggi < r.prezzo ? r.contributo : contributo(anno));
  const detratto = (anno: number) => Math.min(anno, 10) * (r.detrazione?.perAnno ?? 0);
  const max = Math.max(r.contributo, r.detrazione.totale, 1);
  const xOf = (a: number) => padL + (a * (w - padL - padR)) / 10;
  const yOf = (v: number) => padT + ((max - v) * (h - padT - padB)) / max;
  const tracciato = (f: (a: number) => number) => anni.map((a, i) => `${i === 0 ? "M" : "L"} ${xOf(a)} ${yOf(f(a))}`).join(" ");
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}>
      <Line x1={padL} y1={yOf(0)} x2={w - padR} y2={yOf(0)} stroke={BASE.grigioChiaro} strokeWidth={0.8} />
      <Line x1={padL} y1={yOf(max)} x2={w - padR} y2={yOf(max)} stroke={BASE.linea} strokeWidth={0.5} strokeDasharray="2 3" />
      <Text x={padL - 6} y={yOf(0) + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>{`0 ${PDF_EURO}`}</Text>
      <Text x={padL - 6} y={yOf(max) + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>{soldi(max)}</Text>
      <Path d={tracciato(detratto)} stroke={BASE.grigioChiaro} strokeWidth={1.6} strokeDasharray="4 3" fill="none" />
      <Path d={tracciato(ricevuto)} stroke={BASE.verde} strokeWidth={2.2} fill="none" />
      {anni.map((a) => (
        <Text key={`x-${a}`} x={xOf(a)} y={h - 8} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "middle" } as never}>{a === 0 ? "Oggi" : `Anno ${a}`}</Text>
      ))}
    </Svg>
  );
}

// ─── Pagine ─────────────────────────────────────────────────────────────────
function CosaVuolDire({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  const schede: { icona: NomeIcona; titolo: string; testo: string }[] = [
    { icona: "pagamento", titolo: "Soldi sul conto, non sconti sulle tasse", testo: "Il GSE versa il contributo sul tuo conto corrente. Non è una detrazione: non serve avere tasse da scalare." },
    { icona: "calendario", titolo: "Arriva presto", testo: `Fino a ${soldi(CONTO_TERMICO.sogliaUnicaRata)} in un'unica soluzione dopo l'accettazione della domanda; oltre, in 2 o 5 rate annuali.` },
    { icona: "risparmio", titolo: `Fino al ${CONTO_TERMICO.percentualeMassima}% della spesa`, testo: "Quanto esattamente lo decide il GSE: dipende da potenza ed efficienza del generatore e dalla zona climatica." },
    { icona: "pratiche", titolo: "Ti accompagniamo nella pratica", testo: `La domanda va inviata al GSE entro ${CONTO_TERMICO.giorniPerLaDomanda} giorni dalla fine dei lavori, con foto, fatture e documenti.` },
  ];
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il Conto Termico 3.0" titolo={"Un contributo,\n"} evidenza="non una detrazione." sottotitolo="In parole semplici: lo Stato ti restituisce una parte di quello che spendi per sostituire il vecchio riscaldamento con uno che usa energia rinnovabile." />
      <Foto src={d.foto?.cosaVuolDire} altezza={128} stile={{ marginBottom: 10 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {schede.map((s, i) => <Scheda key={s.titolo} {...s} c={c} ultimaColonna={i % 2 === 1} />)}
      </View>
      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <View style={{ flex: 1, marginRight: 18 }}>
          <TitoletoSezione>Chi può chiederlo</TitoletoSezione>
          <Spunta testo="Chi ha la casa: il proprietario o chi ha un diritto reale sull'immobile." />
          <Spunta testo="Chi la usa con un contratto: l'inquilino o il comodatario." />
          <Spunta testo="Per interventi sulla casa in cui vive o che mette a disposizione." />
        </View>
        <View style={{ flex: 1 }}>
          <TitoletoSezione>Cosa serve</TitoletoSezione>
          <Spunta testo="Un impianto di riscaldamento funzionante, che viene sostituito." />
          <Spunta testo="Un generatore nuovo che rispetta i requisiti minimi di efficienza." />
          <Spunta testo={`La domanda al GSE entro ${CONTO_TERMICO.giorniPerLaDomanda} giorni dalla fine dei lavori.`} />
        </View>
      </View>
      <Spinta />
      <Nota tono="blu" icona="documenti" titolo={`Le regole: ${CONTO_TERMICO.decreto}, in vigore dal ${CONTO_TERMICO.inVigoreDal}.`} testo="Il contributo di questo preventivo è una stima: l'importo definitivo lo stabilisce il GSE alla fine dell'istruttoria. Non si somma alla detrazione fiscale sullo stesso intervento." />
    </Pagina>
  );
}

function Intervento({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  const tipo = INTERVENTI_CONTO_TERMICO[d.intervento.tipo] ?? "Il nuovo impianto";
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il tuo intervento" titolo={"Cosa cambia\n"} evidenza="in casa tua." sottotitolo="Togliamo il generatore che hai oggi e installiamo quello nuovo: è la sostituzione che dà diritto al contributo." />
      <OggiDomani
        oggi={{ foto: d.foto?.oggi, titolo: d.intervento.impiantoAttuale, testo: "Viene smontato e smaltito, e se ne conserva il certificato per la pratica." }}
        domani={{ foto: d.foto?.domani, etichetta: `Domani · ${tipo}`, titolo: d.intervento.titolo, testo: "Energia rinnovabile dall'aria, dall'acqua o dal sole: il requisito del Conto Termico." }}
      />
      <CasaInBreve d={d} />

      <View style={{ marginTop: 16 }}>
        <TitoletoSezione>Cosa cambia, in pratica</TitoletoSezione>
        <Spunta testo="Il vecchio generatore viene smontato e smaltito, con il certificato che serve alla domanda al GSE." />
        <Spunta testo="Il nuovo impianto usa energia rinnovabile: è il requisito del Conto Termico." />
        <Spunta testo="Cosa installiamo, voce per voce, è nella pagina che segue; il contributo e il risparmio subito dopo." />
      </View>
      <Spinta />
      <Nota tono="blu" icona="documenti" titolo="Una sostituzione, non un'aggiunta." testo="Il Conto Termico chiede di sostituire un impianto di riscaldamento funzionante. Fanno eccezione il solare termico e la pompa di calore affiancata a una caldaia a condensazione con meno di 5 anni." />
    </Pagina>
  );
}

const ICONE_VANTAGGI: NomeIcona[] = ["energia", "fiamma", "verifica", "temperatura", "sole", "pagamento"];

function Caratteristiche({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  const scheda = (d.intervento.caratteristiche ?? []).filter((x) => x.etichetta?.trim() && x.valore?.trim()).slice(0, 9);
  const vantaggi = (d.testi?.vantaggi?.length ? d.testi.vantaggi : VANTAGGI_CONTO_TERMICO[d.intervento.tipo] ?? VANTAGGI_CONTO_TERMICO.pompa_calore).slice(0, 6);
  const conFoto = Boolean(d.foto?.interno || d.foto?.dettaglio);
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il tuo nuovo impianto" titolo={"Com'è fatto,\n"} evidenza="punto per punto." sottotitolo={`${d.intervento.titolo}: la scheda tecnica del modello proposto e quello che cambia in casa.`} />
      <View style={{ flexDirection: "row" }}>
        {conFoto ? (
          <View style={{ width: LARGHEZZA * 0.44, marginRight: 14 }}>
            <Foto src={d.foto?.interno} altezza={scheda.length > 5 ? 150 : 128} larghezza="100%" didascalia={false} />
            {d.foto?.dettaglio ? <Foto src={d.foto.dettaglio} altezza={96} larghezza="100%" didascalia={false} stile={{ marginTop: 8 }} /> : null}
            <Text style={{ fontSize: 6, color: BASE.grigioChiaro, marginTop: 3 }}>Immagini illustrative.</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <TitoletoSezione>Scheda tecnica</TitoletoSezione>
          {scheda.length ? (
            <View style={{ borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
              {scheda.map((x, i) => (
                <View key={x.etichetta} style={{ flexDirection: "row", paddingVertical: 6.5, paddingHorizontal: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BASE.linea, backgroundColor: i % 2 === 0 ? "#FFFFFF" : BASE.fondo }}>
                  <Text style={{ flex: 1.1, fontSize: 7.5, color: BASE.grigio }}>{x.etichetta}</Text>
                  <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: BASE.ink, textAlign: "right" }}>{x.valore}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 8, color: BASE.grigio, lineHeight: 1.45 }}>I dati del modello proposto si trovano nella scheda tecnica del produttore allegata alla proposta.</Text>
          )}
          {scheda.length ? <Text style={{ fontSize: 6.5, color: BASE.grigioChiaro, marginTop: 4, lineHeight: 1.35 }}>Dati del produttore per il modello proposto. Fa fede la scheda tecnica allegata.</Text> : null}
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <TitoletoSezione>Cosa ti porta</TitoletoSezione>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {vantaggi.map((v, i) => (
            <View key={v.titolo} style={{ width: (LARGHEZZA - 16) / 3, marginRight: i % 3 === 2 ? 0 : 8, marginBottom: 8, backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, padding: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i === vantaggi.length - 1 ? BASE.arancioTenue : BASE.verdeTenue, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                <IconaPdf nome={ICONE_VANTAGGI[i] ?? "verifica"} colore={i === vantaggi.length - 1 ? BASE.arancioScuro : BASE.verdeScuro} lato={11} />
              </View>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: c.navy }}>{v.titolo}</Text>
              <Text style={{ fontSize: 7.2, color: BASE.testo, marginTop: 3, lineHeight: 1.4 }}>{conEuro(v.testo)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pagina>
  );
}

function Incentivo({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const sconto = d.economia.modalita === "sconto_in_fattura";
  const quotaContributo = r.prezzo > 0 ? r.contributo / r.prezzo : 0;
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il tuo incentivo" titolo={`${soldi(r.contributo)}\n`} evidenza="li mette lo Stato." sottotitolo={`Il Conto Termico copre il ${r.coperturaPct}% del prezzo chiavi in mano. Ecco quanto resta a te e come ricevi il contributo.`} />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Prezzo chiavi in mano" valore={soldi(r.prezzo)} nota={`IVA ${d.economia.ivaPct}% inclusa`} />
        <Kpi etichetta="Contributo GSE stimato" valore={`-${soldi(r.contributo)}`} nota="stima: lo conferma il GSE" tono="arancio" />
        <Kpi etichetta="Resta a te" valore={soldi(r.restaATe)} nota="il costo vero dell'impianto" tono="verde" ultimo />
      </View>

      <View style={{ marginTop: 18 }}>
        <TitoletoSezione>Chi paga cosa</TitoletoSezione>
        <View style={{ flexDirection: "row", height: 30, borderRadius: 6, overflow: "hidden" }}>
          <View style={{ flex: Math.max(0.001, 1 - quotaContributo), backgroundColor: c.navy, justifyContent: "center", paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: "#FFFFFF" }}>{`Tu · ${soldi(r.restaATe)}`}</Text>
          </View>
          <View style={{ flex: Math.max(0.001, quotaContributo), backgroundColor: BASE.arancio, justifyContent: "center", paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: "#FFFFFF" }}>{`GSE · ${soldi(r.contributo)}`}</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 20 }}>
        <TitoletoSezione>Come ricevi il contributo</TitoletoSezione>
        {sconto ? (
          <Nota tono="verde" icona="pagamento" titolo={`Sconto in fattura: paghi ${soldi(r.pagaOggi)} invece di ${soldi(r.prezzo)}.`} testo="Il contributo lo incassiamo noi dal GSE, con il tuo mandato all'incasso, e te lo scontiamo subito sul prezzo. Tu non anticipi la parte del GSE." />
        ) : (
          <View>
            <Nota tono="blu" icona="pagamento" titolo={`Paghi ${soldi(r.prezzo)} ai lavori; il GSE ti versa ${soldi(r.contributo)}.`} testo={r.rate.length <= 1 ? "In un'unica soluzione, dopo che il GSE ha accettato la domanda." : `In ${r.rate.length} rate annuali, la prima dopo che il GSE ha accettato la domanda.`} />
            {r.rate.length > 0 ? (
              <View style={{ marginTop: 10, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
                <View style={{ flexDirection: "row", backgroundColor: c.navy, borderTopLeftRadius: 7, borderTopRightRadius: 7, paddingVertical: 6, paddingHorizontal: 11 }}>
                  <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>RATA</Text>
                  <Text style={{ flex: 2, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>QUANDO</Text>
                  <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>IMPORTO</Text>
                </View>
                {r.rate.map((x) => (
                  <View key={x.numero} style={{ flexDirection: "row", paddingVertical: 6, paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: BASE.linea }}>
                    <Text style={{ flex: 1, fontSize: 8, color: BASE.ink }}>{r.rate.length === 1 ? "Unica" : `${x.numero}ª`}</Text>
                    <Text style={{ flex: 2, fontSize: 8, color: BASE.testo }}>{x.anno === 1 ? "Dopo l'accettazione della domanda" : `Dopo ${x.anno - 1} ${x.anno - 1 === 1 ? "anno" : "anni"} dalla prima`}</Text>
                    <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: BASE.verdeScuro, textAlign: "right" }}>{soldi(x.importo)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
      <Foto src={d.foto?.incentivo} altezza={132} stile={{ marginTop: 16 }} />
      <Spinta />
      <Nota tono="arancio" icona="verifica" titolo="Perché è una stima." testo="Il GSE calcola il contributo con una formula che tiene conto della potenza del generatore, della sua efficienza stagionale (SCOP) e della zona climatica. La cifra definitiva arriva con l'accettazione della domanda." />
    </Pagina>
  );
}

function Risparmio({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const e = d.economia;
  const c_risparmia = r.risparmioAnnuo > 0;
  const tipo = INTERVENTI_CONTO_TERMICO[d.intervento.tipo]?.toLowerCase() ?? "nuovo impianto";
  return (
    <Pagina d={d} c={c}>
      {c_risparmia ? (
        <Intestazione c={c} occhiello="Il risparmio in bolletta" titolo={`${soldi(r.risparmioMensile)} al mese\n`} evidenza="che restano a te." sottotitolo="Quello che non paghi più per scaldare casa e produrre acqua calda. Stima del primo anno, con la spesa che ci hai indicato." />
      ) : (
        <Intestazione c={c} occhiello="La spesa di ogni anno" titolo={"Quanto costa\n"} evidenza="scaldare casa." sottotitolo="La spesa di un anno per riscaldamento e acqua calda, oggi e col nuovo impianto." />
      )}
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Al mese" valore={soldi(Math.max(0, r.risparmioMensile))} nota="in media, il primo anno" tono="verde" grande />
        <Kpi etichetta="All'anno" valore={soldi(Math.max(0, r.risparmioAnnuo))} nota="il primo anno" tono="verde" grande ultimo />
      </View>
      <View style={{ marginTop: 18, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 10 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink, marginLeft: 4 }}>Spesa di un anno per riscaldamento e acqua calda</Text>
        <GraficoSpesa oggi={e.spesaAnnuaAttuale} domani={e.spesaAnnuaNuova} etichettaOggi={`Oggi · ${d.intervento.impiantoAttuale}`.slice(0, 44)} etichettaDomani={`Domani · ${tipo}`.slice(0, 44)} c={c} />
      </View>
      <View style={{ marginTop: 14, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
        <View style={{ flexDirection: "row", backgroundColor: c.navy, borderTopLeftRadius: 7, borderTopRightRadius: 7, paddingVertical: 6, paddingHorizontal: 11 }}>
          <Text style={{ flex: 2, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>VOCE</Text>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>OGGI</Text>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>DOMANI</Text>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>DIFFERENZA</Text>
        </View>
        <View style={{ flexDirection: "row", paddingVertical: 7, paddingHorizontal: 11 }}>
          <Text style={{ flex: 2, fontSize: 8, color: BASE.ink }}>Riscaldamento e acqua calda, in un anno</Text>
          <Text style={{ flex: 1, fontSize: 8, color: BASE.ink, textAlign: "right" }}>{soldi(e.spesaAnnuaAttuale)}</Text>
          <Text style={{ flex: 1, fontSize: 8, color: BASE.ink, textAlign: "right" }}>{soldi(e.spesaAnnuaNuova)}</Text>
          <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: r.risparmioAnnuo >= 0 ? BASE.verdeScuro : BASE.rosso, textAlign: "right" }}>{soldi(-r.risparmioAnnuo)}</Text>
        </View>
      </View>
      <Foto src={d.foto?.comfort} altezza={118} stile={{ marginTop: 14 }} />
      <Spinta />
      <Nota tono="blu" icona="energia" titolo="Il risparmio si misura in bolletta, non a parole." testo={`È una stima: parte dalla spesa annua che ci hai indicato (${soldi(e.spesaAnnuaAttuale)}) e da quella prevista col nuovo impianto (${soldi(e.spesaAnnuaNuova)}). Negli anni successivi consideriamo prezzi dell'energia in aumento del ${String(e.aumentoEnergiaPct).replace(".", ",")}% l'anno.`} />
    </Pagina>
  );
}

function Beneficio({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const anni = r.anniBeneficio.length - 1;
  const positivo = r.beneficioFinale > 0;
  const tappe = [...new Set([0, 1, r.anniDiRientro != null ? Math.ceil(r.anniDiRientro) : -1, 5, 10, anni])]
    .filter((a) => a >= 0 && a <= anni)
    .sort((a, b) => a - b);
  return (
    <Pagina d={d} c={c}>
      <Intestazione
        c={c}
        occhiello="Il beneficio negli anni"
        titolo={positivo ? `+${soldi(r.beneficioFinale)}\n` : `In ${anni} anni\n`}
        evidenza={positivo ? `in ${anni} anni.` : "il conto completo."}
        sottotitolo={r.anniDiRientro != null
          ? `Contributo e risparmi in bolletta, anno dopo anno, meno quello che spendi oggi. La spesa è ripagata in circa ${anniTesto(r.anniDiRientro)}.`
          : "Contributo e risparmi in bolletta, anno dopo anno, meno quello che spendi oggi."}
      />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Spesa ripagata in" valore={r.anniDiRientro != null ? anniTesto(r.anniDiRientro) : "oltre l'orizzonte"} tono="arancio" />
        <Kpi etichetta={`Risparmi in ${anni} anni`} valore={soldi(Math.max(0, r.risparmiTotali))} tono="verde" />
        <Kpi etichetta="Contributo GSE" valore={soldi(r.contributo)} tono="neutro" ultimo />
      </View>
      <View style={{ marginTop: 16, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 6 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink, marginLeft: 8 }}>Quanto hai in tasca, anno dopo anno</Text>
        <Text style={{ fontSize: 7, color: BASE.grigio, marginLeft: 8, marginTop: 2 }}>Sotto lo zero finché la spesa non è ripagata, sopra da lì in poi.</Text>
        <GraficoCumulato anni={r.anniBeneficio} rientro={r.anniDiRientro} c={c} />
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
            ? (r.pagaOggi < r.prezzo ? "Lavori: paghi il prezzo già scontato del contributo" : "Lavori: paghi il prezzo chiavi in mano")
            : anno === 1 && a.contributo > 0 ? `Arriva ${r.rate.length > 1 ? "la prima rata" : "il contributo"} del GSE e il primo anno di risparmi`
            : r.anniDiRientro != null && anno === Math.ceil(r.anniDiRientro) ? "La spesa è ripagata: da qui in poi è guadagno"
            : anno === anni ? "Fine del periodo considerato"
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

function Confronto({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  if (!r.detrazione) return null;
  const sconto = d.economia.modalita === "sconto_in_fattura";
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Contributo o detrazione" titolo={"Il contributo arriva subito.\n"} evidenza="La detrazione in 10 anni." sottotitolo="Sullo stesso intervento si sceglie l'uno o l'altra: non si sommano. Ecco la differenza, con i numeri di questa proposta." />
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, backgroundColor: BASE.verdeTenue, borderWidth: 1, borderColor: BASE.verdeBordo, borderRadius: 10, padding: 14, marginRight: 10 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.verdeScuro }}>CONTO TERMICO 3.0</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -0.7, color: BASE.verdeScuro, marginTop: 6 }}>{soldi(r.contributo)}</Text>
          <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 3 }}>{sconto ? "subito, scontati in fattura" : r.rate.length > 1 ? `in ${r.rate.length} rate annuali` : "in un'unica soluzione"}</Text>
          <View style={{ marginTop: 10 }}>
            <Spunta testo="Soldi versati sul conto (o sconto sul prezzo)." />
            <Spunta testo="Non servono tasse da scalare." />
            <Spunta testo="Importo confermato dal GSE." />
          </View>
        </View>
        <View style={{ flex: 1, backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.grigio }}>{`DETRAZIONE FISCALE ${r.detrazione.pct}%`}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -0.7, color: BASE.ink, marginTop: 6 }}>{soldi(r.detrazione.totale)}</Text>
          <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 3 }}>{`in 10 anni, ${soldi(r.detrazione.perAnno)} per dichiarazione dei redditi`}</Text>
          <View style={{ marginTop: 10 }}>
            <Spunta testo="Si recupera come minori tasse, un decimo l'anno." />
            <Spunta testo="Serve avere abbastanza IRPEF ogni anno." />
            <Spunta testo="Paghi tutto il prezzo ai lavori." />
          </View>
        </View>
      </View>
      <View style={{ marginTop: 16, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 6 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink, marginLeft: 8 }}>Quanto ti è tornato, anno dopo anno</Text>
        <Legenda voci={[{ colore: BASE.verde, testo: "Conto Termico" }, { colore: BASE.grigioChiaro, testo: `Detrazione ${r.detrazione.pct}% in 10 anni`, tratteggio: true }]} />
        <GraficoConfronto r={r} />
      </View>
      <Spinta />
      <Nota tono="arancio" icona="detrazione" titolo="Non si sommano." testo="Il Conto Termico non si cumula con altri incentivi dello Stato sullo stesso intervento: scegliendo il contributo, per questo impianto non si chiede la detrazione." />
    </Pagina>
  );
}

export function ContoTermicoPDF({ data }: { data: ContoTermicoPdfData }) {
  const c = palette(data.colorePrimario);
  const r = calcolaContoTermico(data.economia);
  // I pezzi presi dal documento degli altri preventivi (sigilli delle garanzie,
  // recensioni, voto online) nei colori di questo.
  const tema = creaTema({ primario: c.navy, accento: BASE.arancio });
  return (
    <Document title={`Preventivo ${data.preventivo.codice} · Conto Termico 3.0`} author={data.azienda.nome} subject="Preventivo Conto Termico 3.0" language="it-IT">
      <CopertinaRacconto
        d={data} c={c} foto={data.foto?.copertina}
        sottoNome="Riscaldamento con il Conto Termico 3.0"
        occhiello="Conto Termico 3.0 · La tua proposta"
        titolo={data.testi?.titoloCopertina?.trim() || "Il calore di casa.\nCon l'aiuto\ndello Stato."}
        // In copertina nessun prezzo: il nuovo impianto e per chi è. I numeri vengono dopo.
        sottotitolo={data.testi?.sottotitoloCopertina?.trim() || "Il nuovo impianto, il contributo del GSE e quanto risparmi negli anni: tutto in queste pagine."}
        schede={[
          { etichetta: "Il nuovo impianto", titolo: data.intervento.titolo, nota: `al posto di: ${data.intervento.impiantoAttuale.toLowerCase()}`, flex: 1.2 },
          { etichetta: "Preparato per", titolo: data.cliente.nome, nota: data.cliente.indirizzo },
        ]}
      />
      <ChiSiamo d={data} c={c} tema={tema} />
      <CosaVuolDire d={data} c={c} />
      <Intervento d={data} c={c} />
      <Fornitura
        d={data} c={c} vociDiRiserva={data.intervento.voci}
        modello={{
          etichetta: "Il modello proposto",
          titolo: data.intervento.titolo,
          sottotitolo: `al posto di: ${data.intervento.impiantoAttuale.toLowerCase()}`,
          foto: data.foto?.domani ?? data.foto?.copertina ?? null,
          scheda: data.intervento.caratteristiche ?? [],
        }}
      />
      <Caratteristiche d={data} c={c} />
      <FotoProgetto d={data} c={c} />
      <Incentivo d={data} r={r} c={c} />
      <Risparmio d={data} r={r} c={c} />
      <Beneficio d={data} r={r} c={c} />
      {r.detrazione ? <Confronto d={data} r={r} c={c} /> : null}
      <Referenze d={data} c={c} tema={tema} />
      <PassaggiRacconto
        d={data} c={c} titolo={"Dalla firma\n"} evidenza="al contributo."
        sottotitolo="Cosa succede, in ordine. I tempi del GSE dipendono dall'istruttoria della domanda."
        passaggi={data.testi?.passaggi?.length ? data.testi.passaggi : PASSAGGI_CONTO_TERMICO}
        icone={["sopralluogo", "firma", "installazione", "pratiche", "pagamento", "verifica"]}
        documenti={DOCUMENTI_CONTO_TERMICO}
        fotoAlta={data.foto?.passaggi} fotoBassa={data.foto?.installazione}
        nota={{ titolo: "Un impegno da conoscere.", testo: `L'impianto va mantenuto per tutta la durata dell'incentivo e per i ${CONTO_TERMICO.anniDiMantenimento} anni successivi all'ultima rata: in quel periodo il GSE può fare controlli.` }}
      />
      <DomandeRacconto d={data} c={c} faq={data.testi?.faq?.length ? data.testi.faq : FAQ_CONTO_TERMICO} foto={data.foto?.domande} />
      <DecisioneRacconto
        d={data} c={c}
        offerta={{
          titolo: `${data.intervento.titolo}, chiavi in mano`,
          prezzo: r.prezzo,
          riga: `IVA ${data.economia.ivaPct}% inclusa · contributo GSE stimato ${soldi(r.contributo)}`,
          evidenza: ["Con il Conto Termico resta a te: ", soldi(r.restaATe)],
        }}
        kpi={[
          { etichetta: "Contributo", valore: soldi(r.contributo), tono: "arancio" },
          { etichetta: "Risparmio annuo", valore: soldi(Math.max(0, r.risparmioAnnuo)), tono: "verde" },
          { etichetta: "Spesa ripagata", valore: r.anniDiRientro != null ? anniTesto(r.anniDiRientro) : "oltre", tono: "neutro" },
          { etichetta: `In ${r.anniBeneficio.length - 1} anni`, valore: soldi(r.beneficioFinale), tono: r.beneficioFinale >= 0 ? "verde" : "rosso" },
        ]}
        foto={data.foto?.decisione}
        passi={["Firma la proposta: online, con il link ricevuto, oppure su carta.", "Fissiamo il sopralluogo e la data dei lavori.", "Dopo i lavori raccogliamo insieme i documenti per il GSE."]}
      />
      <Condizioni d={data} c={c} />
      <Firma
        d={data} c={c}
        oggetto={`${data.intervento.titolo} al posto di: ${data.intervento.impiantoAttuale.toLowerCase()}`}
        importo={`${soldi(r.prezzo)} IVA ${data.economia.ivaPct}% inclusa`}
        righeExtra={[["Contributo GSE", `${soldi(r.contributo)} stimato · ${data.economia.modalita === "sconto_in_fattura" ? "scontato in fattura con mandato all'incasso" : "versato dal GSE al committente"}`]]}
        cosaSiAccetta={["l'impianto", "l'importo", "il modo in cui riceve il contributo"]}
        avvertenza="Sa che il contributo è stimato e che l'importo definitivo lo stabilisce il GSE."
      />
      <Recesso d={data} c={c} />
    </Document>
  );
}
