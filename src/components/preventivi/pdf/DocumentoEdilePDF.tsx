/**
 * DocumentoEdilePDF — il «Piano dei lavori»: il documento che gli otto
 * preventivatori edili consegnano al cliente.
 *
 * Impianto editoriale: copertina nel colore dell'azienda (la foto va in tinta),
 * capitoli numerati con il titolo che porta una parola in corsivo, richieste in
 * ordine coi filetti, tempi a barre, l'investimento su una pagina a sé. Il
 * prezzo arriva dopo il valore: chi siamo, il progetto, come lavoriamo, i lavori
 * già fatti vengono prima del piano e del totale.
 *
 * Caratteri: solo quelli interni al PDF (Helvetica e Times). Nessun download,
 * nessuna attesa di rete, nessun PDF che non esce perché un font non risponde.
 * ⚠️ I caratteri interni sono WinAnsi: niente frecce, niente spunte, niente segno
 * meno tipografico U+2212 (spariscono in silenzio). Si usano il trattino normale,
 * il punto mediano e le virgolette basse. Lo controlla pdfImpaginazioneFix.test.ts.
 *
 * Niente promesse a nome dell'azienda: garanzie, percorso, domande frequenti e
 * recensioni compaiono solo se l'azienda le ha scritte nel suo modello.
 */
import * as React from "react";
import {
  Document, Page, Text, View, Image, Svg, Rect, Path, Circle, Line, G, Defs, LinearGradient, RadialGradient, Stop, Font,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/formatters";
import { htmlToRichBlocks } from "@/lib/ristrutturazione/richTextPdf";
import { parseFinanziamentoPromo, calcolaRataMensile } from "@/lib/preventivi/finanziamentoLite";
import { fraseValiditaChiusura } from "@/lib/preventivi/validitaOfferta";
import { creaTema, coloriCopertina, copertinaInTinta, type TemaDocumento } from "./temaDocumento";
import { chiaveLibera, ordineEffettivo } from "./ordineCapitoli";
import { IconaPdf } from "./IconaPdf";
import { eTavola } from "@/lib/pdf/proporzioniImmagine";
import {
  Domande, ParoleDeiClienti, SchedeGaranzie, VotiOnline,
  altezzeDomande, stimaParoleDeiClienti, stimaSchedeGaranzie, stimaVotiOnline,
} from "./provaSocialePdf";
import { BLOCCHI, type ChiaveBlocco } from "../../../../supabase/functions/_shared/blocchiPreventivo";
import { MODULO_RECESSO } from "../../../../supabase/functions/_shared/condizioniStandard";
import { giorniDellaDurata, senzaNumeroDavanti, spezzaAccento } from "./testoDocumento";
import { altezzaTesto, righeDiTesto, testoDaHtml, type FamigliaPdf } from "./misuraTesto";
import type {
  DocEdileBlocco, DocEdileCapitolo, DocEdileDati, DocEdileFase, DocEdileFoto, DocEdileFotoBlocco, DocEdileVoceElenco,
} from "./documentoEdileTipi";

// Le parole italiane spezzate dal sillabatore inglese erano brutte: mai a capo dentro la parola.
Font.registerHyphenationCallback((word) => [word]);


// A4 misura 595,28 × 841,89 punti: un elemento alto 842 «non ci sta» e il
// motore lo manda alla pagina dopo (la copertina usciva su tre fogli).
const LARGHEZZA = 595;
const ALTEZZA = 841;
const MARGINE = 48;
const UTILE = LARGHEZZA - MARGINE * 2;

const dueCifre = (n: number) => String(n).padStart(2, "0");
const oggi = () => new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const quantita = (q: number): string => {
  const n = Number(q) || 0;
  return Number.isInteger(n) ? String(n) : n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
};
const percento = (v: number): string => {
  const n = Number(v) || 0;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
};

// ─── Quanto occupa un capitolo, prima di disegnarlo ──────────────────────────
// react-pdf non dice dove finisce una pagina. Per riempire con una foto le pagine
// che resterebbero mezze bianche, il documento stima l'altezza dei capitoli che
// non si spezzano, con le larghezze vere dei caratteri (misuraTesto). Le stime
// ricalcano gli stili dei componenti qui sotto: chi cambia un corpo o un margine
// lì, lo cambia anche qui. Sbagliano per eccesso: meglio un filo di bianco che
// una foto che non ci sta e finisce da sola sulla pagina dopo.

/** L'altezza scrivibile di una pagina: 841 punti meno i margini di 96 sopra e sotto. */
const ALTEZZA_UTILE = ALTEZZA - 96 * 2;
/** Lo stacco fra due capitoli sulla stessa pagina. */
const STACCO = 30;
/**
 * Un capitolo segue il precedente sulla stessa pagina solo se, a stima, ci sta con
 * questo margine; altrimenti va a capo per scelta. Così la pagina che il documento
 * prevede è quella che esce davvero: per pochi punti il motore decideva diverso, e
 * la foto che doveva riempire la pagina finiva da sola su quella dopo.
 */
const MARGINE_PREVISIONE = 24;

const fam = (nome: string): FamigliaPdf =>
  (["Helvetica", "Helvetica-Bold", "Times-Roman", "Times-Bold", "Times-Italic"] as const).find((f) => f === nome) ?? "Helvetica";
const senzaAsterischi = (t: string) => t.replace(/\*/g, "");

function stimaTesta(tema: TemaDocumento, titolo: string, sommario?: string | null): number {
  const larga = UTILE - 64;
  const titoloH = righeDiTesto(senzaAsterischi(titolo), larga, fam(tema.caratteri.titolo), 23) * 23 * 1.2;
  const sommarioH = sommario ? 6 + altezzaTesto(sommario, Math.min(400, larga), fam(tema.caratteri.testo), 10, 1.45) : 0;
  return Math.max(46, 3 + 7 * 1.2 + 5 + titoloH + sommarioH) + 18;
}

const STIMA_TITOLINO = 7 * 1.2 + 5 + 1 + 8;

function stimaSchede(tema: TemaDocumento, voci: DocEdileVoceElenco[], colonne: 2 | 3): number {
  let totale = 0;
  for (let i = 0; i < voci.length; i += colonne) {
    const riga = voci.slice(i, i + colonne);
    const interna = (UTILE - 10 * (riga.length - 1)) / riga.length - 24;
    const alte = riga.map((v) => 10 + 18 * 1.2 + 4
      + altezzaTesto(senzaNumeroDavanti(v.titolo), interna, fam(tema.caratteri.forte), 9.5, 1.3)
      + (v.descrizione ? 3 + altezzaTesto(v.descrizione, interna, fam(tema.caratteri.testo), 8.5, 1.45) : 0) + 12);
    totale += Math.max(...alte) + 10;
  }
  return totale;
}

function stimaPassi(tema: TemaDocumento, voci: DocEdileVoceElenco[]): number {
  const perRiga = voci.length <= 5 ? voci.length : Math.ceil(voci.length / 2);
  let totale = 0;
  for (let i = 0; i < voci.length; i += perRiga) {
    const riga = voci.slice(i, i + perRiga);
    const colonna = UTILE / perRiga;
    const alte = riga.map((v, j) => {
      const larga = colonna - (j === riga.length - 1 ? 0 : 10);
      return 24 + 8 + altezzaTesto(senzaNumeroDavanti(v.titolo), larga, fam(tema.caratteri.forte), 9.5, 1.25)
        + (v.descrizione ? 3 + altezzaTesto(v.descrizione, larga, fam(tema.caratteri.testo), 8, 1.45) : 0);
    });
    totale += Math.max(...alte) + 14;
  }
  return totale;
}

function stimaTempi(tema: TemaDocumento, fasi: DocEdileFase[]): number {
  const larga = UTILE - 24 - 12 - 250;
  let totale = 0;
  for (const f of fasi) {
    const sinistra = altezzaTesto(senzaNumeroDavanti(f.fase), larga, fam(tema.caratteri.forte), 9.5, 1.2)
      + (f.descrizione ? 2 + altezzaTesto(f.descrizione, larga, fam(tema.caratteri.testo), 8, 1.4) : 0);
    totale += 16.6 + Math.max(sinistra, 9 + (f.durata ? 3 + 7.5 * 1.2 : 0));
  }
  const giorni = fasi.map((f) => giorniDellaDurata(f.durata));
  const nota = giorni.every((g) => g != null) && (giorni as number[]).reduce((a, b) => a + b, 0) >= 7 ? 9 + 8.5 * 1.3 : 0;
  return totale + nota;
}

function stimaTestoRicco(tema: TemaDocumento, html: string | null | undefined, larghezza: number, corpo: number, interlinea: number): number {
  const blocchi = testoDaHtml(html).split("\n").filter((b) => b.trim());
  return blocchi.reduce((t, b) => t + altezzaTesto(b, larghezza, fam(tema.caratteri.testo), corpo, interlinea) + 6, 0);
}

/** La foto che riempie la fine di una pagina: stacco, foto e la riga «immagine indicativa». */
const CORNICE_RIEMPIMENTO = 14 + 15;
/** Il margine di sicurezza sulle stime (che già sbagliano per eccesso di 20-30 punti). */
const SICUREZZA_RIEMPIMENTO = 16;
/** Sotto questa altezza una foto sembra un ritaglio: meglio il bianco. */
const RIEMPIMENTO_MINIMO = 120;
/**
 * La foto di un blocco (o dei prossimi passi) che divide la pagina con un capitolo
 * corto: non più bassa di così. Una fascia, come quelle del Fotovoltaico (almeno 39 mm).
 */
const FOTO_BLOCCO_DIVISA = 120;

// ─── La foto che riempie la fine di una pagina ────────────────────────────────
function FotoRiempimento({ tema, foto, altezza }: { tema: TemaDocumento; foto: DocEdileFotoBlocco; altezza: number }) {
  return (
    <View wrap={false} style={{ marginTop: 14 }}>
      <Image src={foto.src} style={{ width: UTILE, height: altezza, objectFit: "cover" }} />
      {foto.diSerie ? (
        <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, marginTop: 5 }}>Immagine indicativa.</Text>
      ) : null}
    </View>
  );
}

/**
 * La foto che riempie il fondo dell'ultima pagina di un foglio che scorre: alta
 * esattamente quanto il bianco che resta, misurato dal motore a pagine fatte (come
 * FotoInFondo dei Serramenti). Il documento decide solo se metterla, con la stima;
 * con un'altezza stimata, se il capitolo sopra era più lungo della stima, la foto
 * finiva da sola sulla pagina dopo.
 */
function FotoInFondo({ tema, foto }: { tema: TemaDocumento; foto: DocEdileFotoBlocco }) {
  return (
    <View fixed style={{ flexGrow: 1 }} render={(fogli) => {
      // react-pdf passa anche subPageTotalPages (layout, resolvePageIndices), ma i suoi tipi non lo dicono.
      const { subPageNumber, subPageTotalPages } = fogli as { subPageNumber?: number; subPageTotalPages?: number };
      if (subPageNumber == null || subPageTotalPages == null || subPageNumber !== subPageTotalPages) return null;
      return (
        <View style={{ flexGrow: 1, marginTop: 14 }}>
          <Image src={foto.src} style={{ flexGrow: 1, flexBasis: 0, width: UTILE, objectFit: "cover" }} />
          {foto.diSerie ? (
            <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, marginTop: 5 }}>Immagine indicativa.</Text>
          ) : null}
        </View>
      );
    }} />
  );
}

// ─── Titolo con la parola in corsivo ─────────────────────────────────────────
function TitoloAccento({ tema, testo, corpo, colore, coloreAccento, allineamento = "left", interlinea = 1.2 }: {
  tema: TemaDocumento; testo: string; corpo: number; colore: string; coloreAccento: string;
  allineamento?: "left" | "center"; interlinea?: number;
}) {
  return (
    <Text style={{ fontFamily: tema.caratteri.titolo, fontSize: corpo, color: colore, lineHeight: interlinea, letterSpacing: -corpo * 0.022, textAlign: allineamento }}>
      {spezzaAccento(testo).map((p, i) =>
        p.accento ? (
          // Il corsivo del Times è più minuto dell'Helvetica nero: un filo più grande per pareggiare.
          // L'interlinea va ripetuta su ogni pezzo: quella del contenitore, coi pezzi annidati, non vale.
          <Text key={i} style={{ fontFamily: tema.caratteri.accento, fontSize: corpo * 1.1, color: coloreAccento, letterSpacing: -corpo * 0.012, lineHeight: interlinea / 1.1 }}>{p.testo}</Text>
        ) : (
          // La dimensione va ripetuta anche qui: senza, l'interlinea di un pezzo
          // annidato si calcola su un carattere di 12 punti, e un titolo di copertina
          // su quattro righe usciva con le righe una sopra l'altra.
          <Text key={i} style={{ fontSize: corpo, lineHeight: interlinea }}>{p.testo}</Text>
        ),
      )}
    </Text>
  );
}

// ─── La barra a segmenti: il segno ricorrente del documento ──────────────────
function BarraSegmenti({ colore, larghezza, spessore = 2.5 }: { colore: string; larghezza: number; spessore?: number }) {
  const opacita = [1, 0.72, 0.48, 0.28, 0.14];
  const passo = larghezza / opacita.length;
  return (
    <Svg width={larghezza} height={spessore} viewBox={`0 0 ${larghezza} ${spessore}`}>
      {opacita.map((o, i) => (
        <Rect key={i} x={i * passo} y={0} width={passo - (i < opacita.length - 1 ? 3 : 0)} height={spessore} fill={colore} opacity={o} />
      ))}
    </Svg>
  );
}

// ─── Testo ricco (chi siamo, modalità di pagamento) ──────────────────────────
function TestoRicco({ tema, html, stile }: { tema: TemaDocumento; html: string | null | undefined; stile: Record<string, unknown> }) {
  const blocchi = htmlToRichBlocks(html);
  if (!blocchi.length) return null;
  return (
    <View>
      {blocchi.map((b, i) => {
        const righe = b.runs.map((r, j) => (
          <Text key={j} style={{ ...(r.bold ? { fontFamily: tema.caratteri.forte } : {}), ...(r.italic ? { fontFamily: "Helvetica-Oblique" } : {}) }}>{r.text}</Text>
        ));
        return b.type === "bullet" ? (
          <View key={i} style={{ flexDirection: "row", marginBottom: 3 }}>
            <Text style={[stile, { width: 12 }]}>•</Text>
            <Text style={[stile, { flex: 1 }]}>{righe}</Text>
          </View>
        ) : (
          <Text key={i} style={[stile, { marginBottom: 6 }]}>{righe}</Text>
        );
      })}
    </View>
  );
}

// ─── Decorazione di copertina ────────────────────────────────────────────────
// «square» era una finestra a quattro ante, nata coi serramenti e finita sulle
// copertine di piscine, tetti e impianti elettrici. Ora è un segno da tavola di
// progetto: squadre agli angoli, assi e una quota. Vale per ogni mestiere.
function Decorazione({ colore, stile }: { colore: string; stile: "square" | "circle" | "line" | "pattern" | "none" }) {
  if (stile === "none") return null;
  const lato = 150;
  if (stile === "circle") {
    return (
      <Svg width={lato} height={lato} viewBox="0 0 150 150">
        <Circle cx={75} cy={75} r={70} stroke={colore} strokeWidth={1.4} fill="none" opacity={0.55} />
        <Circle cx={75} cy={75} r={48} stroke={colore} strokeWidth={1} fill="none" opacity={0.35} />
        <Circle cx={75} cy={75} r={26} stroke={colore} strokeWidth={0.8} fill="none" opacity={0.22} />
      </Svg>
    );
  }
  if (stile === "line") {
    return (
      <Svg width={lato} height={lato} viewBox="0 0 150 150">
        <Line x1={75} y1={6} x2={75} y2={144} stroke={colore} strokeWidth={1.6} opacity={0.6} />
        <Line x1={58} y1={30} x2={92} y2={30} stroke={colore} strokeWidth={1} opacity={0.4} />
        <Line x1={58} y1={120} x2={92} y2={120} stroke={colore} strokeWidth={1} opacity={0.4} />
      </Svg>
    );
  }
  if (stile === "pattern") {
    const punti: React.ReactNode[] = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
      punti.push(<Circle key={`${r}-${c}`} cx={15 + c * 24} cy={15 + r * 24} r={1.8} fill={colore} opacity={0.4} />);
    }
    return <Svg width={lato} height={lato} viewBox="0 0 150 150"><G>{punti}</G></Svg>;
  }
  return (
    <Svg width={lato} height={lato} viewBox="0 0 150 150">
      <G opacity={0.55}>
        {/* squadre agli angoli */}
        <Path d="M 12 40 L 12 12 L 40 12" stroke={colore} strokeWidth={1.4} fill="none" />
        <Path d="M 110 12 L 138 12 L 138 40" stroke={colore} strokeWidth={1.4} fill="none" />
        <Path d="M 138 110 L 138 138 L 110 138" stroke={colore} strokeWidth={1.4} fill="none" />
        <Path d="M 40 138 L 12 138 L 12 110" stroke={colore} strokeWidth={1.4} fill="none" />
      </G>
      <G opacity={0.3}>
        {/* assi */}
        <Line x1={75} y1={24} x2={75} y2={126} stroke={colore} strokeWidth={0.8} strokeDasharray="5 4" />
        <Line x1={24} y1={75} x2={126} y2={75} stroke={colore} strokeWidth={0.8} strokeDasharray="5 4" />
        <Circle cx={75} cy={75} r={22} stroke={colore} strokeWidth={0.8} fill="none" />
      </G>
      <Circle cx={75} cy={75} r={2.2} fill={colore} opacity={0.7} />
    </Svg>
  );
}

/** Tavola di progetto sul fondo pieno: la copertina senza foto non è un rettangolo vuoto. */
function TavolaDiProgetto({ colore, conSegni }: { colore: string; conSegni: boolean }) {
  const verticali: React.ReactNode[] = [];
  const orizzontali: React.ReactNode[] = [];
  for (let x = 35; x < LARGHEZZA; x += 35) verticali.push(<Line key={`v${x}`} x1={x} y1={0} x2={x} y2={ALTEZZA} stroke={colore} strokeWidth={0.4} />);
  for (let y = 35; y < ALTEZZA; y += 35) orizzontali.push(<Line key={`o${y}`} x1={0} y1={y} x2={LARGHEZZA} y2={y} stroke={colore} strokeWidth={0.4} />);
  return (
    <Svg width={LARGHEZZA} height={ALTEZZA} viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}>
      <G opacity={0.07}>{verticali}{orizzontali}</G>
      <G opacity={conSegni ? 0.16 : 0}>
        <Circle cx={470} cy={250} r={190} stroke={colore} strokeWidth={0.8} fill="none" />
        <Circle cx={470} cy={250} r={120} stroke={colore} strokeWidth={0.6} fill="none" />
        <Line x1={210} y1={250} x2={595} y2={250} stroke={colore} strokeWidth={0.6} strokeDasharray="6 5" />
        <Line x1={470} y1={20} x2={470} y2={520} stroke={colore} strokeWidth={0.6} strokeDasharray="6 5" />
      </G>
    </Svg>
  );
}

// ─── Intestazione e piè di pagina delle pagine interne ───────────────────────
function Intestazione({ tema, dati }: { tema: TemaDocumento; dati: DocEdileDati }) {
  const { azienda, modulo, codice } = dati;
  return (
    <View fixed style={{ position: "absolute", top: 30, left: MARGINE, right: MARGINE }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 26 }}>
        {azienda.logoUrl ? (
          <Image src={azienda.logoUrl} style={{ height: 24, maxWidth: 130, objectFit: "contain", objectPositionX: 0 }} />
        ) : (
          // Una riga sola, e mai sopra il blocco a destra: con «Costruzioni Edili
          // Generali Fratelli Bianchi & Figli S.r.l. Unipersonale» ci finiva sopra.
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, letterSpacing: 0.6, maxWidth: UTILE - 200, maxLines: 1, textOverflow: "ellipsis" }}>{azienda.nome.toUpperCase()}</Text>
        )}
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 6.5, color: tema.inchiostroMarca, letterSpacing: 1.3 }}>
            {`PIANO DEI LAVORI · ${modulo.etichetta.toUpperCase()}`}
          </Text>
          {codice ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7.5, color: tema.grigio, marginTop: 2 }}>{`N. ${codice} · ${oggi()}`}</Text> : null}
        </View>
      </View>
      <View style={{ marginTop: 8 }}><BarraSegmenti colore={tema.fondo} larghezza={UTILE} /></View>
    </View>
  );
}

function PieDiPagina({ tema, dati }: { tema: TemaDocumento; dati: DocEdileDati }) {
  const { azienda, modello, codice } = dati;
  const recapiti = [azienda.indirizzo, azienda.telefono, azienda.email].filter(Boolean).join("  ·  ");
  const fiscali = [azienda.partitaIva ? `P.IVA ${azienda.partitaIva}` : null, azienda.sito].filter(Boolean).join("  ·  ");
  return (
    <View fixed style={{ position: "absolute", bottom: 26, left: MARGINE, right: MARGINE, borderTopWidth: 0.6, borderTopColor: tema.filetto, paddingTop: 7 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: 16 }}>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostro }}>{azienda.nome}</Text>
          {modello.mostraPieLegale && recapiti ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 6.5, color: tema.grigioChiaro, marginTop: 1.5 }}>{recapiti}</Text> : null}
          {modello.mostraPieLegale && fiscali ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 6.5, color: tema.grigioChiaro, marginTop: 1.5 }}>{fiscali}</Text> : null}
          {modello.testoPiePagina ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 6.5, color: tema.grigioChiaro, marginTop: 1.5 }}>{modello.testoPiePagina}</Text> : null}
          {modello.mostraPieVersione ? (
            <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 6.5, color: tema.grigioChiaro, marginTop: 1.5 }}>
              {`Documento ${codice ?? ""} · ${oggi()} · emesso tramite EdiliziaInCloud · Domus Group S.r.l.`}
            </Text>
          ) : null}
        </View>
        <Text
          style={{ fontFamily: tema.caratteri.forte, fontSize: 7.5, color: tema.inchiostroMarca }}
          render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`}
        />
      </View>
    </View>
  );
}

// ─── Apertura di capitolo ────────────────────────────────────────────────────
function Capitolo({ tema, numero, occhiello, titolo, sommario, staccoSopra = 0 }: {
  tema: TemaDocumento; numero: number; occhiello: string; titolo: string; sommario?: string | null; staccoSopra?: number;
}) {
  return (
    <View style={{ flexDirection: "row", marginTop: staccoSopra, marginBottom: 18 }} minPresenceAhead={130} wrap={false}>
      <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 46, color: tema.inchiostroMarca, width: 64, lineHeight: 1, letterSpacing: -1.5 }}>{dueCifre(numero)}</Text>
      <View style={{ flex: 1, paddingTop: 3 }}>
        <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1.6, marginBottom: 5 }}>{occhiello.toUpperCase()}</Text>
        <TitoloAccento tema={tema} testo={titolo} corpo={23} colore={tema.inchiostro} coloreAccento={tema.inchiostroMarca} />
        {sommario ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 10, color: tema.grigio, marginTop: 6, lineHeight: 1.45, maxWidth: 400 }}>{sommario}</Text> : null}
      </View>
    </View>
  );
}

function TitolinoSezione({ tema, testo }: { tema: TemaDocumento; testo: string }) {
  return (
    <View style={{ marginBottom: 8 }} minPresenceAhead={60}>
      <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostro, letterSpacing: 1.5 }}>{testo.toUpperCase()}</Text>
      <View style={{ height: 1, backgroundColor: tema.inchiostro, marginTop: 5 }} />
    </View>
  );
}

/** «Le richieste, in ordine»: numero nel colore dell'azienda, testo, filetto. */
function ElencoInOrdine({ tema, voci }: { tema: TemaDocumento; voci: DocEdileVoceElenco[] }) {
  return (
    <View>
      {voci.map((v, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", paddingVertical: 7, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 8.5, color: tema.inchiostroMarca, width: 26, paddingTop: 0.5 }}>{dueCifre(i + 1)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, lineHeight: 1.3 }}>{senzaNumeroDavanti(v.titolo)}</Text>
            {v.descrizione ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, marginTop: 2, lineHeight: 1.45 }}>{v.descrizione}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Come lavoriamo: i passi in fila, uniti da una linea ─────────────────────
function Passi({ tema, voci }: { tema: TemaDocumento; voci: DocEdileVoceElenco[] }) {
  const perRiga = voci.length <= 5 ? voci.length : Math.ceil(voci.length / 2);
  const righe: DocEdileVoceElenco[][] = [];
  for (let i = 0; i < voci.length; i += perRiga) righe.push(voci.slice(i, i + perRiga));
  let contatore = 0;
  return (
    <View>
      {righe.map((riga, r) => (
        <View key={r} wrap={false} style={{ flexDirection: "row", marginBottom: 14 }}>
          {riga.map((v, i) => {
            contatore += 1;
            const ultimo = i === riga.length - 1;
            return (
              <View key={i} style={{ flex: 1, paddingRight: ultimo ? 0 : 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: tema.fondo, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9, color: tema.bianco }}>{contatore}</Text>
                  </View>
                  {!ultimo ? <View style={{ flex: 1, height: 1, backgroundColor: tema.tintaForte, marginLeft: 6 }} /> : null}
                </View>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, lineHeight: 1.25 }}>{senzaNumeroDavanti(v.titolo)}</Text>
                {v.descrizione ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8, color: tema.grigio, marginTop: 3, lineHeight: 1.45 }}>{v.descrizione}</Text> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Schede (perché sceglierci, garanzie) ────────────────────────────────────
function Schede({ tema, voci, colonne }: { tema: TemaDocumento; voci: DocEdileVoceElenco[]; colonne: 2 | 3 }) {
  const righe: DocEdileVoceElenco[][] = [];
  for (let i = 0; i < voci.length; i += colonne) righe.push(voci.slice(i, i + colonne));
  const spazio = 10;
  let contatore = 0;
  return (
    <View>
      {righe.map((riga, r) => {
        // L'ultima riga si divide tutta la larghezza: 5 voci = tre schede e poi due larghe.
        const larghezza = (UTILE - spazio * (riga.length - 1)) / riga.length;
        return (
          <View key={r} wrap={false} style={{ flexDirection: "row", marginBottom: spazio }}>
            {riga.map((v, i) => {
              contatore += 1;
              return (
                <View key={i} style={{ width: larghezza, marginLeft: i === 0 ? 0 : spazio, backgroundColor: tema.cartaCalda, borderTopWidth: 2, borderTopColor: tema.fondo, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 }}>
                  <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 18, color: tema.inchiostroMarca, marginBottom: 4 }}>{dueCifre(contatore)}</Text>
                  <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, lineHeight: 1.3 }}>{senzaNumeroDavanti(v.titolo)}</Text>
                  {v.descrizione ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, marginTop: 3, lineHeight: 1.45 }}>{v.descrizione}</Text> : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ─── Fotografie: la prima grande, le altre a coppie ──────────────────────────
function Galleria({ tema, foto }: { tema: TemaDocumento; foto: DocEdileFoto[] }) {
  if (!foto.length) return null;
  const [prima, ...altre] = foto;
  const coppie: DocEdileFoto[][] = [];
  for (let i = 0; i < altre.length; i += 2) coppie.push(altre.slice(i, i + 2));
  const Didascalia = ({ f }: { f: DocEdileFoto }) =>
    f.didascalia || f.luogo ? (
      <View style={{ flexDirection: "row", marginTop: 5 }}>
        {f.didascalia ? <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 8.5, color: tema.inchiostro }}>{f.didascalia}</Text> : null}
        {f.luogo ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigioChiaro }}>{`${f.didascalia ? "  ·  " : ""}${f.luogo}`}</Text> : null}
      </View>
    ) : null;
  return (
    <View>
      <View wrap={false} style={{ marginBottom: 14 }}>
        <Image src={prima.url} style={{ width: UTILE, height: 246, objectFit: "cover" }} />
        <Didascalia f={prima} />
      </View>
      {coppie.map((coppia, r) => (
        <View key={r} wrap={false} style={{ flexDirection: "row", marginBottom: 14 }}>
          {coppia.map((f, i) => (
            <View key={f.id ?? i} style={{ width: (UTILE - 12) / 2, marginLeft: i === 0 ? 0 : 12 }}>
              <Image src={f.url} style={{ width: (UTILE - 12) / 2, height: 150, objectFit: "cover" }} />
              <Didascalia f={f} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── I tempi: una barra per fase, una dopo l'altra ───────────────────────────
function Tempi({ tema, fasi }: { tema: TemaDocumento; fasi: DocEdileFase[] }) {
  const giorni = fasi.map((f) => giorniDellaDurata(f.durata));
  const misurabile = giorni.every((g) => g != null);
  const pesi = misurabile ? (giorni as number[]) : fasi.map(() => 1);
  const totale = pesi.reduce((s, g) => s + g, 0) || 1;
  const pista = 250;
  let inizio = 0;
  return (
    <View>
      {fasi.map((f, i) => {
        const x = (inizio / totale) * pista;
        const w = Math.max(10, (pesi[i] / totale) * pista);
        inizio += pesi[i];
        return (
          <View key={i} wrap={false} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 8.5, color: tema.inchiostroMarca, width: 24 }}>{dueCifre(i + 1)}</Text>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro }}>{senzaNumeroDavanti(f.fase)}</Text>
              {f.descrizione ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8, color: tema.grigio, marginTop: 2, lineHeight: 1.4 }}>{f.descrizione}</Text> : null}
            </View>
            <View style={{ width: pista }}>
              <View style={{ height: 9, backgroundColor: tema.tinta }}>
                <View style={{ position: "absolute", left: Math.min(x, pista - w), top: 0, width: w, height: 9, backgroundColor: tema.fondo }} />
              </View>
              {f.durata ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7.5, color: tema.grigio, marginTop: 3, marginLeft: Math.min(x, pista - 60) }}>{f.durata}</Text> : null}
            </View>
          </View>
        );
      })}
      {misurabile && totale >= 7 ? (
        <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, marginTop: 9 }}>
          {"Durata complessiva stimata: circa "}
          <Text style={{ fontFamily: tema.caratteri.forte, color: tema.inchiostro }}>{`${Math.round(totale / 7)} settimane`}</Text>
          {". I tempi si confermano insieme all'avvio dei lavori."}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Il piano dei lavori: capitoli e voci ────────────────────────────────────
function TabellaCapitolo({ tema, cap, indice, mostraMargine, mostraPrezzi, mostraQta, mostraSubtotali, mostraImporti = true }: {
  tema: TemaDocumento; cap: DocEdileCapitolo; indice: number;
  mostraMargine: boolean; mostraPrezzi: boolean; mostraQta: boolean; mostraSubtotali: boolean;
  /** False col prezzo scritto a mano: le righe possono essere a 0 €, e «0,00 €» su ogni riga smentirebbe il prezzo. */
  mostraImporti?: boolean;
}) {
  const testa = { fontFamily: tema.caratteri.forte, fontSize: 6.5, color: tema.grigioChiaro, letterSpacing: 0.9 } as const;
  const cella = { fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.inchiostro } as const;
  return (
    <View style={{ marginBottom: 16 }}>
      <View wrap={false} minPresenceAhead={50}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 6, borderBottomWidth: 1.2, borderBottomColor: tema.fondo }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", flex: 1 }}>
            <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 17, color: tema.inchiostroMarca, width: 28, lineHeight: 1 }}>{dueCifre(indice)}</Text>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 11.5, color: tema.inchiostro, flex: 1 }}>{cap.nome}</Text>
          </View>
          {mostraSubtotali ? <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 11, color: tema.inchiostro }}>{formatCurrency(cap.subtotale)}</Text> : null}
        </View>
        <View style={{ flexDirection: "row", paddingTop: 6, paddingBottom: 4 }}>
          <Text style={[testa, { flex: 1, paddingLeft: 28 }]}>LAVORAZIONE</Text>
          {mostraQta ? <Text style={[testa, { width: 40, textAlign: "center" }]}>U.M.</Text> : null}
          {mostraQta ? <Text style={[testa, { width: 44, textAlign: "right" }]}>Q.TÀ</Text> : null}
          {mostraPrezzi ? <Text style={[testa, { width: 66, textAlign: "right" }]}>PREZZO</Text> : null}
          {mostraImporti ? <Text style={[testa, { width: 74, textAlign: "right" }]}>IMPORTO</Text> : null}
          {mostraMargine ? <Text style={[testa, { width: 58, textAlign: "right" }]}>MARGINE</Text> : null}
        </View>
      </View>
      {cap.voci.map((v) => (
        <View key={v.id} wrap={false} style={{ flexDirection: "row", paddingVertical: 6, borderTopWidth: 0.6, borderTopColor: tema.filetto }}>
          <View style={{ flex: 1, paddingLeft: 28, paddingRight: 8 }}>
            <Text style={[cella, { lineHeight: 1.35 }]}>{v.descrizione}</Text>
            {v.fonte ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, marginTop: 1.5 }}>{`Fonte: ${v.fonte}`}</Text> : null}
          </View>
          {mostraQta ? <Text style={[cella, { width: 40, textAlign: "center", color: tema.grigio }]}>{v.unitaMisura ?? ""}</Text> : null}
          {mostraQta ? <Text style={[cella, { width: 44, textAlign: "right" }]}>{quantita(v.quantita)}</Text> : null}
          {mostraPrezzi ? <Text style={[cella, { width: 66, textAlign: "right", color: tema.grigio }]}>{formatCurrency(v.prezzoUnitario)}</Text> : null}
          {mostraImporti ? <Text style={[cella, { width: 74, textAlign: "right", fontFamily: tema.caratteri.forte }]}>{formatCurrency(v.importo)}</Text> : null}
          {mostraMargine ? <Text style={[cella, { width: 58, textAlign: "right", color: "#15803D" }]}>{formatCurrency(v.margineEur ?? 0)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Le condizioni, articolo per articolo: ogni titolo con il suo testo, così
 * l'impaginazione non lascia un titolo solo in fondo alla pagina. La prima riga,
 * se è il titolo generale, si toglie: la pagina ha già il suo.
 */
function perArticoli(
  righe: DocEdileDati["modello"]["condizioniLegali"],
  { senzaClausoleDaFirmare = false } = {},
): Array<typeof righe> {
  const utili = righe.length > 0 && righe[0].tipo === "h1" ? righe.slice(1) : righe;
  const gruppi: Array<typeof righe> = [];
  for (const r of utili) {
    if ((r.tipo === "h1" || r.tipo === "h2") || gruppi.length === 0) gruppi.push([]);
    gruppi[gruppi.length - 1].push(r);
  }
  // L'elenco delle clausole da approvare a parte sta sulla pagina della firma,
  // accanto alla seconda firma: qui sarebbe una ripetizione, e da sola si
  // portava via una pagina intera.
  if (!senzaClausoleDaFirmare) return gruppi;
  return gruppi.filter((g) => !/1341|approvare specificamente/i.test(g[0]?.testo ?? ""));
}

/**
 * Un indirizzo email è una parola sola: se è lungo non va a capo e sborda dal
 * riquadro. Lo si spezza prima della chiocciola, dove si legge ancora bene.
 */
function emailACapo(email: string | null): string | null {
  if (!email || email.length <= 30 || !email.includes("@")) return email;
  const [nome, dominio] = email.split("@");
  return `${nome}\n@${dominio}`;
}

/** Una riga da firmare: filetto e, sotto, che cosa ci va scritto. */
function LineaFirma({ tema, etichetta, chi, larghezza, altezza = 34 }: {
  tema: TemaDocumento; etichetta: string; chi?: string; larghezza?: number; altezza?: number;
}) {
  return (
    <View style={{ width: larghezza, flex: larghezza ? undefined : 1 }}>
      <View style={{ height: altezza }} />
      <View style={{ borderTopWidth: 0.7, borderTopColor: tema.inchiostro, paddingTop: 4 }}>
        <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigio, letterSpacing: 0.9 }}>{etichetta}</Text>
        {chi ? <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7.5, color: tema.inchiostro, marginTop: 2, maxLines: 1, textOverflow: "ellipsis" }}>{chi}</Text> : null}
      </View>
    </View>
  );
}

/** Le voci del riepilogo che il cliente firma: etichetta a sinistra, valore a destra. */
function RigaRiepilogo({ tema, etichetta, valore, forte = false }: {
  tema: TemaDocumento; etichetta: string; valore: string; forte?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: tema.filetto }}>
      <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7.5, color: tema.grigio, letterSpacing: 0.8, width: 118, paddingTop: 2 }}>{etichetta.toUpperCase()}</Text>
      <Text style={{ fontFamily: forte ? tema.caratteri.forte : tema.caratteri.testo, fontSize: forte ? 13 : 9.5, color: tema.inchiostro, flex: 1, lineHeight: 1.4 }}>{valore}</Text>
    </View>
  );
}

// ─── Copertina ───────────────────────────────────────────────────────────────
function Copertina({ tema, dati }: { tema: TemaDocumento; dati: DocEdileDati }) {
  const c = dati.modello.copertina;
  const { fondo, testo, evidenza } = coloriCopertina(tema, { fondo: c.coloreFondo, testo: c.coloreTesto });
  const opacita = c.opacitaVelo ?? 0.6;
  const inTinta = copertinaInTinta(c.opacitaVelo);
  // In tinta la foto prende il colore dell'azienda (pieno, come una stampa a due colori) e
  // il testo poggia sulla sua versione scura; a colori il velo è nero, quanto basta per leggere.
  const coloreVelo = inTinta ? (c.coloreFondo ? fondo : tema.fondo) : "#000000";
  const coloreAppoggio = inTinta ? fondo : "#000000";
  const titolo = c.titolo || dati.modulo.titoloCopertina;
  const sottotitolo = c.sottotitolo || [dati.tipoIntervento, dati.localita].filter(Boolean).join(" · ") || dati.modulo.sottotitoloCopertina;
  const occhiello = c.occhiello || "Piano dei lavori";
  const corpoTitolo = Math.max(26, Math.min(54, c.corpoTitolo ?? 42));
  const corpoOcchiello = Math.max(7, Math.min(12, c.corpoOcchiello ?? 8.5));
  const corpoSottotitolo = Math.max(10, Math.min(16, c.corpoSottotitolo ?? 12.5));
  // Il logo scelto per la copertina vince; poi, su fondo scuro, il logo chiaro del kit del marchio.
  const logo = c.logoUrl || (testo === "#FFFFFF" ? dati.azienda.logoChiaroUrl : null) || dati.azienda.logoUrl;
  const centro = c.allineamento === "center";
  const giustificaLogo = c.posizioneLogo === "top_right" ? "flex-end" : c.posizioneLogo === "top_center" ? "center" : "flex-start";
  const giustificaTesto = c.verticale === "top" ? "flex-start" : c.verticale === "center" ? "center" : "flex-end";
  // Il velo (quanto colore sulla foto) lo sceglie l'azienda. La leggibilità no: dietro
  // al testo c'è sempre un fondo che sfuma, qualunque foto e qualunque opacità.
  const [inAlto, inBasso] = c.verticale === "top" ? [1, 0.55] : [0.55, 1];

  const scheda: Array<{ etichetta: string; valore: string }> = [
    { etichetta: "Preparato per", valore: dati.cliente },
    { etichetta: "Cantiere", valore: dati.cantiere || "—" },
    { etichetta: "Riferimento", valore: dati.codice ?? "—" },
    { etichetta: "Data", valore: oggi() },
  ];

  return (
    <Page size="A4" style={{ backgroundColor: fondo, fontFamily: tema.caratteri.testo }}>
      {c.immagineUrl ? (
        <Image src={c.immagineUrl} style={{ position: "absolute", top: 0, left: 0, width: LARGHEZZA, height: ALTEZZA, objectFit: "cover" }} />
      ) : null}
      <View style={{ position: "absolute", top: 0, left: 0, width: LARGHEZZA, height: ALTEZZA }}>
        <Svg width={LARGHEZZA} height={ALTEZZA} viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}>
          <Defs>
            <LinearGradient id="velo-verticale" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={coloreVelo} stopOpacity={opacita * inAlto} />
              <Stop offset="0.5" stopColor={coloreVelo} stopOpacity={opacita * 0.75} />
              <Stop offset="1" stopColor={coloreVelo} stopOpacity={opacita * inBasso} />
            </LinearGradient>
            <LinearGradient id="fondo-testo-basso" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.4" stopColor={coloreAppoggio} stopOpacity={0} />
              <Stop offset="0.7" stopColor={coloreAppoggio} stopOpacity={0.8} />
              <Stop offset="1" stopColor={coloreAppoggio} stopOpacity={0.96} />
            </LinearGradient>
            <LinearGradient id="fondo-testo-alto" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={coloreAppoggio} stopOpacity={0.96} />
              <Stop offset="0.34" stopColor={coloreAppoggio} stopOpacity={0.78} />
              <Stop offset="0.62" stopColor={coloreAppoggio} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="velo-diagonale" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={coloreVelo} stopOpacity={opacita * 0.4} />
              <Stop offset="1" stopColor={coloreVelo} stopOpacity={Math.min(1, opacita * 1.1)} />
            </LinearGradient>
            <RadialGradient id="velo-vignetta" cx="0.5" cy="0.45" r="0.8" fx="0.5" fy="0.45">
              <Stop offset="0" stopColor={coloreVelo} stopOpacity={opacita * 0.35} />
              <Stop offset="0.7" stopColor={coloreVelo} stopOpacity={opacita * 0.8} />
              <Stop offset="1" stopColor={coloreVelo} stopOpacity={Math.min(1, opacita * 1.15)} />
            </RadialGradient>
            <LinearGradient id="fondo-pieno" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={tema.fondo} stopOpacity={0.55} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.28} />
            </LinearGradient>
          </Defs>
          {c.immagineUrl ? (
            <G>
              <Rect
                x={0} y={0} width={LARGHEZZA} height={ALTEZZA}
                fill={c.stileVelo === "flat" ? coloreVelo : c.stileVelo === "gradient_diag" ? "url(#velo-diagonale)" : c.stileVelo === "vignette" ? "url(#velo-vignetta)" : "url(#velo-verticale)"}
                opacity={c.stileVelo === "flat" ? opacita : 1}
              />
              {c.verticale === "center" ? (
                <Rect x={0} y={0} width={LARGHEZZA} height={ALTEZZA} fill={coloreAppoggio} opacity={0.45} />
              ) : (
                <Rect x={0} y={0} width={LARGHEZZA} height={ALTEZZA} fill={c.verticale === "top" ? "url(#fondo-testo-alto)" : "url(#fondo-testo-basso)"} />
              )}
              {/* la scheda in fondo alla pagina ha sempre il suo appoggio */}
              {c.mostraScheda && c.verticale !== "bottom" ? (
                <Rect x={0} y={0} width={LARGHEZZA} height={ALTEZZA} fill="url(#fondo-testo-basso)" opacity={0.8} />
              ) : null}
            </G>
          ) : (
            <Rect x={0} y={0} width={LARGHEZZA} height={ALTEZZA} fill="url(#fondo-pieno)" />
          )}
        </Svg>
      </View>
      {!c.immagineUrl ? (
        <View style={{ position: "absolute", top: 0, left: 0 }}><TavolaDiProgetto colore={testo} conSegni={c.mostraDecorazione && c.decorazione !== "none"} /></View>
      ) : null}
      {c.immagineUrl && c.mostraDecorazione && c.decorazione !== "none" ? (
        <View style={{ position: "absolute", top: 40, right: 40 }}><Decorazione colore={testo} stile={c.decorazione} /></View>
      ) : null}

      <View style={{ position: "absolute", top: 0, left: 0, width: LARGHEZZA, height: ALTEZZA, paddingHorizontal: MARGINE, paddingTop: 46, paddingBottom: 44 }}>
        <View style={{ height: 62, flexDirection: "row", justifyContent: giustificaLogo, alignItems: "flex-start" }}>
          {c.posizioneLogo === "hidden" ? null : logo ? (
            <Image src={logo} style={{ height: 50 * c.scalaLogo, maxWidth: 190 * c.scalaLogo, objectFit: "contain" }} />
          ) : (
            <View>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 13, color: testo, letterSpacing: 2.2 }}>{dati.azienda.nome.toUpperCase()}</Text>
              <View style={{ marginTop: 7, width: 40 }}><BarraSegmenti colore={evidenza} larghezza={40} spessore={2} /></View>
            </View>
          )}
        </View>

        <View style={{ flex: 1, justifyContent: giustificaTesto, alignItems: centro ? "center" : "flex-start", paddingTop: 30, paddingBottom: 34 }}>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: corpoOcchiello, color: evidenza, letterSpacing: 2.4, marginBottom: 14, textAlign: c.allineamento }}>{occhiello.toUpperCase()}</Text>
          <View style={{ maxWidth: 480 }}>
            <TitoloAccento tema={tema} testo={titolo} corpo={corpoTitolo} colore={testo} coloreAccento={evidenza} allineamento={c.allineamento} interlinea={1.2} />
          </View>
          <Text style={{ fontFamily: tema.caratteri.testo, fontSize: corpoSottotitolo, color: testo, opacity: 0.86, marginTop: 14, lineHeight: 1.4, maxWidth: 400, textAlign: c.allineamento }}>{sottotitolo}</Text>
        </View>

        {c.mostraScheda ? (
          <View>
            <BarraSegmenti colore={testo} larghezza={UTILE} spessore={2} />
            <View style={{ flexDirection: "row", marginTop: 14 }}>
              {scheda.map((s, i) => (
                <View key={i} style={{ flex: i === 1 ? 1.5 : 1, paddingRight: 12 }}>
                  <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 6.5, color: evidenza, letterSpacing: 1.4, marginBottom: 4 }}>{s.etichetta.toUpperCase()}</Text>
                  <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: testo, lineHeight: 1.3 }}>{s.valore}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Page>
  );
}

// ─── Il documento ────────────────────────────────────────────────────────────
/**
 * Una o due foto del blocco; sotto, la nota quando sono foto di serie. Con
 * `altezza` (il blocco ha una pagina sua) le foto sono alte quanto serve a
 * riempire la pagina. Non con flexGrow: accanto a un elemento che si allarga il
 * motore misura il titolo su una riga sola, e il sommario ci finisce sopra.
 */
function FotoBlocco({ tema, foto, nota, altezza }: { tema: TemaDocumento; foto: DocEdileFotoBlocco[]; nota: string | null; altezza?: number }) {
  if (!foto.length) return null;
  const due = foto.length > 1;
  const larga = (UTILE - 10) / 2;
  return (
    <View wrap={false} style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row" }}>
        {foto.slice(0, 2).map((f, i) => (
          <Image key={i} src={f.src} style={{ width: due ? larga : UTILE, height: altezza ?? (due ? 156 : 236), objectFit: "cover", marginLeft: i === 0 ? 0 : 10 }} />
        ))}
      </View>
      {nota && foto.some((f) => f.diSerie) ? (
        <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, marginTop: 5 }}>{nota}</Text>
      ) : null}
    </View>
  );
}

/**
 * L'altezza delle foto di un blocco che ha una pagina sua: la pagina utile (649
 * punti) meno titolo, sommario, voci e nota, misurati coi caratteri veri
 * (misuraTesto), con un margine di sicurezza. Fino al 22/09/2026 si contavano i
 * caratteri, per eccesso: le foto uscivano più basse del posto che avevano.
 */
function altezzaFotoPiena(tema: TemaDocumento, blocco: DocEdileBlocco, conEscluse = false): number {
  const altezza = 649 - altezzaTestoBlocco(tema, blocco, conEscluse) - 16 - 16 - SICUREZZA_RIEMPIMENTO;
  return Math.max(150, Math.min(430, Math.floor(altezza)));
}

/** Titolo, sommario, voci e nota di un blocco, senza la foto: ricalca Capitolo e VociBlocco. */
function altezzaTestoBlocco(tema: TemaDocumento, blocco: DocEdileBlocco, conEscluse = false): number {
  const capitolo = stimaTesta(tema, blocco.titolo, blocco.intro);
  const altezzaVoci = (elenco: DocEdileBlocco["voci"]) => {
    const colonne = elenco.some((v) => v.testo) ? 2 : 3;
    // Il cerchio dell'icona (22) e lo stacco (8) tolgono 30 punti al testo.
    const larga = (UTILE - 14 * (colonne - 1)) / colonne - 30;
    let totale = 0;
    for (let i = 0; i < elenco.length; i += colonne) {
      const riga = elenco.slice(i, i + colonne);
      const alta = Math.max(22, ...riga.map((v) => (v.testo ? 1 : 5)
        + altezzaTesto(v.titolo, larga, fam(tema.caratteri.forte), 9.5, 1.3)
        + (v.testo ? 2 + altezzaTesto(v.testo, larga, fam(tema.caratteri.testo), 8.5, 1.45) : 0)));
      totale += alta + (colonne === 2 ? 12 : 9);
    }
    return totale;
  };
  // «Cosa è compreso»: due titolini (compreso, non compreso) e le escluse.
  const voci = (conEscluse ? STIMA_TITOLINO : 0) + altezzaVoci(blocco.voci)
    + (conEscluse && blocco.escluse.length > 0 ? 10 + STIMA_TITOLINO + altezzaVoci(blocco.escluse) : 0);
  // La nota «Immagini indicative» esce sotto le foto: senza foto non c'è.
  const nota = blocco.nota && blocco.foto.length > 0 ? 5 + 7 * 1.2 : 0;
  return capitolo + voci + nota;
}

/** Le voci di un blocco: icona in un cerchio di tinta, titolo, spiegazione. */
function VociBlocco({ tema, voci, attenuate = false, colonne: scelte, larghezzaTotale = UTILE }: {
  tema: TemaDocumento; voci: DocEdileBlocco["voci"]; attenuate?: boolean;
  /** Accanto a una tavola le voci stanno in una colonna sola, larga `larghezzaTotale`. */
  colonne?: 1 | 2 | 3; larghezzaTotale?: number;
}) {
  // Con una spiegazione le voci stanno su due colonne; solo titoli, su tre.
  const colonne = scelte ?? (voci.some((x) => x.testo) ? 2 : 3);
  const righe: DocEdileBlocco["voci"][] = [];
  for (let i = 0; i < voci.length; i += colonne) righe.push(voci.slice(i, i + colonne));
  const spazio = 14;
  const larghezza = (larghezzaTotale - spazio * (colonne - 1)) / colonne;
  return (
    <View>
      {righe.map((riga, r) => (
        <View key={r} wrap={false} style={{ flexDirection: "row", marginBottom: colonne === 3 ? 9 : 12 }}>
          {riga.map((x, i) => (
            <View key={i} style={{ width: larghezza, marginLeft: i === 0 ? 0 : spazio, flexDirection: "row" }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: attenuate ? tema.cartaCalda : tema.tinta, alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                {x.icona ? <IconaPdf nome={x.icona} colore={attenuate ? tema.grigio : tema.inchiostroMarca} lato={11} /> : null}
              </View>
              <View style={{ flex: 1, paddingTop: x.testo ? 1 : 5 }}>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: attenuate ? tema.grigio : tema.inchiostro, lineHeight: 1.3 }}>{x.titolo}</Text>
                {x.testo ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, marginTop: 2, lineHeight: 1.45 }}>{x.testo}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── La tavola: una foto sola e verticale, intera, con le voci accanto ───────
// Le tavole del pacchetto bento (22/09/2026) hanno le scritte dentro: ritagliate
// per stare nella fascia delle foto perdevano i titoli. Si mostrano intere, grandi
// quanto la pagina permette, con le voci del blocco in una colonna al loro fianco.
const STACCO_TAVOLA = 16;
const COLONNA_VOCI_MINIMA = 100;

/** La tavola del blocco, se il blocco ha una foto sola e verticale (la proporzione, larghezza/altezza). */
function tavolaDelBlocco(blocco: DocEdileBlocco): number | null {
  return blocco.foto.length === 1 ? eTavola(blocco.foto[0].src) : null;
}

/** Quanto sono alte le voci nella colonna accanto alla tavola (ricalca VociColonna). */
function altezzaVociInColonna(tema: TemaDocumento, voci: DocEdileBlocco["voci"], larga: number): number {
  return voci.reduce((t, v) => t + 12
    + Math.max(16, altezzaTesto(v.titolo, larga - 22, fam(tema.caratteri.forte), 9.5, 1.3))
    + (v.testo ? 3 + altezzaTesto(v.testo, larga, fam(tema.caratteri.testo), 8.5, 1.45) : 0), 0);
}

/**
 * La tavola più larga che sta nella pagina sotto il titolo: la riga (la tavola e la
 * colonna delle voci accanto, la più alta delle due) non deve superare lo spazio
 * che resta. Con poche voci la tavola prende quasi tutta la larghezza; con tante si
 * stringe, e la colonna si allarga.
 */
function misuraTavola(tema: TemaDocumento, blocco: DocEdileBlocco, proporzione: number) {
  const nota = blocco.nota && blocco.foto.some((f) => f.diSerie) ? 5 + 7 * 1.2 : 0;
  const disponibile = ALTEZZA_UTILE - stimaTesta(tema, blocco.titolo, blocco.intro) - nota - SICUREZZA_RIEMPIMENTO;
  const massima = Math.floor(Math.min(disponibile * proporzione, UTILE - STACCO_TAVOLA - COLONNA_VOCI_MINIMA));
  let larghezza = massima;
  while (larghezza > 220 && Math.max(larghezza / proporzione, altezzaVociInColonna(tema, blocco.voci, UTILE - STACCO_TAVOLA - larghezza)) > disponibile) {
    larghezza -= 5;
  }
  return { larghezza, altezza: Math.floor(larghezza / proporzione), colonna: UTILE - STACCO_TAVOLA - larghezza };
}

/** Le voci accanto alla tavola: l'icona piccola accanto al titolo, la spiegazione sotto, a tutta colonna. */
function VociColonna({ tema, voci }: { tema: TemaDocumento; voci: DocEdileBlocco["voci"] }) {
  return (
    <View>
      {voci.map((x, i) => (
        <View key={i} wrap={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: tema.tinta, alignItems: "center", justifyContent: "center", marginRight: 6 }}>
              {x.icona ? <IconaPdf nome={x.icona} colore={tema.inchiostroMarca} lato={9} /> : null}
            </View>
            <Text style={{ flex: 1, fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, lineHeight: 1.3, paddingTop: 1.5 }}>{x.titolo}</Text>
          </View>
          {x.testo ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, marginTop: 3, lineHeight: 1.45 }}>{x.testo}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function TavolaBlocco({ tema, blocco, proporzione }: { tema: TemaDocumento; blocco: DocEdileBlocco; proporzione: number }) {
  const { larghezza, altezza, colonna } = misuraTavola(tema, blocco, proporzione);
  return (
    <View wrap={false} style={{ flexDirection: "row", alignItems: "flex-start" }}>
      <View style={{ width: larghezza }}>
        <Image src={blocco.foto[0].src} style={{ width: larghezza, height: altezza, objectFit: "contain" }} />
        {blocco.nota && blocco.foto[0].diSerie ? (
          <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, marginTop: 5 }}>{blocco.nota}</Text>
        ) : null}
      </View>
      <View style={{ width: colonna, marginLeft: STACCO_TAVOLA, paddingTop: 2 }}>
        <VociColonna tema={tema} voci={blocco.voci} />
      </View>
    </View>
  );
}

/** Un blocco della libreria come capitolo del documento (con `riempi`, su una pagina sua). */
function CapitoloBlocco({ tema, numero, chiave, blocco, riempi = false, altezzaFoto }: {
  tema: TemaDocumento; numero: number; chiave: ChiaveBlocco; blocco: DocEdileBlocco; riempi?: boolean;
  /** Sulla pagina divisa con un capitolo corto (vedi `sulBlocco`): la foto prende quello che resta. */
  altezzaFoto?: number;
}) {
  if (chiave === "compreso") {
    // Tutto insieme: segue il capitolo prima se ci sta, altrimenti va intero alla
    // pagina dopo. Diviso, il titolo restava da solo in fondo alla pagina del computo.
    // Con una foto (dal 22/09/2026 di serie per bagni e ristrutturazione) ha una
    // pagina sua, e la foto la riempie.
    return (
      <View wrap={false}>
        <Capitolo tema={tema} numero={numero} occhiello={blocco.occhiello} titolo={blocco.titolo} sommario={blocco.intro} />
        {riempi ? <FotoBlocco tema={tema} foto={blocco.foto} nota={blocco.nota} altezza={altezzaFoto ?? altezzaFotoPiena(tema, blocco, true)} /> : null}
        <TitolinoSezione tema={tema} testo="Compreso nel prezzo" />
        <VociBlocco tema={tema} voci={blocco.voci} />
        {blocco.escluse.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <TitolinoSezione tema={tema} testo="Non compreso" />
            <VociBlocco tema={tema} voci={blocco.escluse} attenuate />
          </View>
        ) : null}
      </View>
    );
  }
  const tavola = riempi ? tavolaDelBlocco(blocco) : null;
  return (
    <View>
      <Capitolo tema={tema} numero={numero} occhiello={blocco.occhiello} titolo={blocco.titolo} sommario={blocco.intro} />
      {tavola != null ? <TavolaBlocco tema={tema} blocco={blocco} proporzione={tavola} /> : (
        <>
          <FotoBlocco tema={tema} foto={blocco.foto} nota={blocco.nota} altezza={riempi ? altezzaFoto ?? altezzaFotoPiena(tema, blocco) : undefined} />
          <VociBlocco tema={tema} voci={blocco.voci} />
        </>
      )}
    </View>
  );
}

export function DocumentoEdilePDF({ dati }: { dati: DocEdileDati }) {
  const { modello, modulo, totali, capitoli, opzioniComputo: oc } = dati;
  const tema = creaTema({
    primario: modello.colorePrimario, secondario: modello.coloreSecondario, accento: modello.coloreAccento,
    tipografia: modello.tipografia,
  });

  // L'ordine e la visibilità scelti dall'azienda (completati con quelli di serie).
  const ordine = ordineEffettivo(modello.ordineCapitoli, modello.pagineLibere);
  const visibile = (k: string) => ordine.some((v) => v.chiave === k && v.visibile);

  const haChiSiamo = modello.mostraChiSiamo && Boolean(modello.chiSiamoHtml);
  const haUsp = modello.usp.length > 0;
  const votiOnline = dati.azienda.votiOnline;
  const haRecensioni = modello.testimonianze.length > 0 || votiOnline.length > 0;
  const haLavori = modello.galleriaLavori.length > 0 && visibile("lavori");
  const haProgetto = (modello.esigenze.length > 0 || modello.soluzione.length > 0) && visibile("progetto");
  const haPercorso = modello.mostraPercorso && modello.percorso.length > 0;
  // La prima foto del progetto apre il capitolo «Il progetto»; le altre hanno il loro capitolo.
  const fotoApertura = haProgetto ? dati.fotoProgetto[0] ?? null : null;
  const fotoCapitolo = fotoApertura ? dati.fotoProgetto.slice(1) : dati.fotoProgetto;
  const haFoto = fotoCapitolo.length > 0;
  const haTempi = modello.mostraCronoprogramma && modello.cronoprogramma.length > 0;
  // Garanzie e domande sono due capitoli dal 22/09/2026: le domande stanno in fondo,
  // subito prima dei prossimi passi. L'interruttore del modello vale per entrambi.
  const haGaranzie = modello.mostraGaranzie && modello.garanzie.length > 0;
  const haDomande = modello.mostraGaranzie && modello.faq.length > 0;
  const sommarioRecensioni = votiOnline.length > 0 && modello.testimonianze.length > 0
    ? "Il nostro voto sulle piattaforme di recensioni e le parole di chi ha già lavorato con noi."
    : votiOnline.length > 0
      ? "Il nostro voto sulle piattaforme di recensioni: le recensioni si leggono tutte sulle nostre schede."
      : "Le parole di chi ha già lavorato con noi.";
  const colonneUsp: 2 | 3 = modello.usp.length % 3 === 0 || modello.usp.length > 4 ? 3 : 2;
  const colonneGaranzie: 2 | 3 = modello.garanzie.length === 2 || modello.garanzie.length === 4 ? 2 : 3;

  // Un capitolo esce se ha qualcosa da dire e se l'azienda non l'ha nascosto.
  const presente: Record<string, boolean> = {
    chiSiamo: haChiSiamo || haUsp,
    progetto: haProgetto,
    percorso: haPercorso,
    lavori: haLavori,
    recensioni: haRecensioni,
    foto: haFoto,
    // «Voce per voce» senza voci: a corpo il capitolo era una riga su una pagina
    // bianca. Il totale sta già nell'investimento.
    piano: oc.livello !== "corpo",
    investimento: true,
    garanzie: haGaranzie,
    tempi: haTempi,
    domande: haDomande,
    // I blocchi escono se hanno qualcosa: le voci (o le foto) del settore o dell'azienda.
    ...Object.fromEntries(BLOCCHI.map(({ chiave }) => [chiave, modello.blocchi[chiave].voci.length > 0 || modello.blocchi[chiave].foto.length > 0])),
  };
  const libere = new Map(modello.pagineLibere.map((pl) => [chiaveLibera(pl.id), pl]));
  const sequenza = ordine.filter((v) => v.chiave !== "apertura" && v.visibile && (libere.has(v.chiave) || presente[v.chiave]));
  // I numeri seguono i capitoli che escono davvero, nell'ordine scelto: nessun salto da 02 a 05.
  const numeroDi = new Map(sequenza.map((v, i) => [v.chiave, i + 1]));
  const numeroPassi = sequenza.length + 1;
  const TITOLI: Record<string, string> = {
    chiSiamo: "Chi siamo", progetto: "Il progetto", percorso: "Come lavoriamo", lavori: "I nostri lavori",
    foto: "Foto e render", piano: modulo.titoloComputo.replace(/\*/g, ""), investimento: "Il tuo investimento",
    garanzie: "Le garanzie", tempi: "I tempi", recensioni: "Dicono di noi", domande: "Domande e risposte",
    ...Object.fromEntries(BLOCCHI.map((b) => [b.chiave, b.etichetta])),
  };
  const sommario: Array<{ numero: number; titolo: string }> = [
    ...sequenza.map((v) => ({
      numero: numeroDi.get(v.chiave) ?? 0,
      titolo: libere.get(v.chiave)?.titolo.replace(/\*/g, "") || TITOLI[v.chiave] || "",
    })),
    { numero: numeroPassi, titolo: "I prossimi passi" },
  ];
  // I capitoli che seguono il precedente sulla stessa pagina, interi, se c'è posto:
  // hanno un'altezza limitata (i blocchi, i passi, un cronoprogramma corto). Gli
  // altri (computo, progetto, gallerie, prezzo…) cominciano un foglio nuovo.
  const scorreIntero = (chiave: string): boolean =>
    ["comeFunziona", "percorso", "protezione", "controlli", "compreso", "documenti", "diario", "garanzie"].includes(chiave)
    // Le recensioni intere solo se stanno in una pagina: tante testimonianze si spezzano a righe.
    || (chiave === "recensioni" && (stimaCapitolo("recensioni") ?? ALTEZZA_UTILE) <= ALTEZZA_UTILE - 40)
    || (chiave === "tempi" && modello.cronoprogramma.length <= 8)
    // «Il progetto» senza foto sono due elenchi: segue il capitolo prima, se ci sta
    // intero. Da solo lasciava mezza pagina bianca.
    || (chiave === "progetto" && !fotoApertura && (stimaCapitolo("progetto") ?? ALTEZZA_UTILE) <= ALTEZZA_UTILE - 40);

  // Una foto non si ripete: quelle di riempimento e quella dei prossimi passi
  // escono solo se non sono già nel documento (foto del progetto, lavori, chi
  // siamo, blocchi). Le foto arrivano già convertite: la stessa immagine ha lo
  // stesso indirizzo. Prima, con le foto di serie, la stessa immagine poteva
  // uscire tre volte (il progetto, il diario, i prossimi passi).
  const fotoUsate = new Set<string>([
    ...dati.fotoProgetto.map((f) => f.url),
    ...(haLavori ? modello.galleriaLavori.map((f) => f.url) : []),
    ...(haChiSiamo && modello.chiSiamoFotoUrl ? [modello.chiSiamoFotoUrl] : []),
    ...sequenza.flatMap((v) => {
      const b = BLOCCHI.find((x) => x.chiave === v.chiave);
      return b ? modello.blocchi[b.chiave].foto.map((f) => f.src) : [];
    }),
  ]);
  const fotoChiusura = modello.fotoChiusura && !fotoUsate.has(modello.fotoChiusura.src) ? modello.fotoChiusura : null;
  if (fotoChiusura) fotoUsate.add(fotoChiusura.src);

  // I segmenti: un blocco con le foto ha una pagina sua, il resto scorre.
  const conPaginaPropria = (chiave: string) => {
    const b = BLOCCHI.find((x) => x.chiave === chiave);
    return Boolean(b && modello.blocchi[b.chiave].foto.length > 0);
  };
  const segmenti: Array<{ propria: boolean; chiavi: string[]; altezzaFoto?: number }> = [];
  for (const v of sequenza) {
    const ultimo = segmenti[segmenti.length - 1];
    if (conPaginaPropria(v.chiave)) segmenti.push({ propria: true, chiavi: [v.chiave] });
    else if (ultimo && !ultimo.propria) ultimo.chiavi.push(v.chiave);
    else segmenti.push({ propria: false, chiavi: [v.chiave] });
  }


  // I prossimi passi: la foto del lavoro finito, i passi, i contatti (o la firma).
  // La foto è alta 330 punti sulla pagina sua; meno, quando i passi salgono sull'ultima
  // pagina dei capitoli (vedi `fotoChiusuraInCoda`).
  const sommarioChiusura = fraseValiditaChiusura(modello.testoValidita, modello.giorniValidita);
  const passiChiusura = [
    { titolo: "Conferma", descrizione: "Firma questo documento, o rispondici anche solo con un messaggio." },
    { titolo: "Partenza lavori", descrizione: "Concordiamo insieme la data di inizio e il calendario definitivo." },
  ];
  // `inCoda`: dopo l'ultimo capitolo, sulla stessa pagina. Lo stacco sta sopra i passi e
  // non sotto il capitolo: react-pdf conta il margine di sotto nella presenza di un
  // capitolo, e un capitolo che ci stava a filo, col margine, saltava intero alla pagina dopo.
  const chiusura = (altezzaFoto: number | null, inCoda = false) => (
    <View wrap={false} style={inCoda ? { marginTop: STACCO } : undefined}>
      <Capitolo tema={tema} numero={numeroPassi} occhiello="I prossimi passi" titolo="Pronti a *partire*?" sommario={sommarioChiusura} />
      {fotoChiusura && altezzaFoto ? (
        <Image src={fotoChiusura.src} style={{ width: UTILE, height: altezzaFoto, objectFit: "cover", marginBottom: 18 }} />
      ) : null}
      <Passi tema={tema} voci={passiChiusura} />
      <View wrap={false} style={{ flexDirection: "row", marginTop: 10 }}>
        <View style={{ flex: 1, backgroundColor: tema.cartaCalda, padding: 14, marginRight: 12 }}>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1.4, marginBottom: 7 }}>I NOSTRI CONTATTI</Text>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 10.5, color: tema.inchiostro, marginBottom: 4 }}>{dati.azienda.nome}</Text>
          {[dati.azienda.telefono, emailACapo(dati.azienda.email), dati.azienda.indirizzo].filter(Boolean).map((r, i) => (
            <Text key={i} style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.grigio, lineHeight: 1.5 }}>{r}</Text>
          ))}
        </View>
        {/* Senza condizioni non c'è la pagina della firma: allora si firma qui.
            Con le condizioni, la firma sta lì e due riquadri sarebbero uno di troppo. */}
        {modello.condizioniLegali.length > 0 ? (
          <View style={{ flex: 1.25, backgroundColor: tema.cartaCalda, padding: 14, justifyContent: "center" }}>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1.4, marginBottom: 6 }}>LA FIRMA</Text>
            <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.grigio, lineHeight: 1.5 }}>
              Le condizioni generali e la pagina da firmare sono in fondo a questo documento.
            </Text>
          </View>
        ) : (
        <View style={{ flex: 1.25, borderWidth: 0.8, borderColor: tema.inchiostro, padding: 14 }}>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostro, letterSpacing: 1.4 }}>PER ACCETTAZIONE</Text>
          <View style={{ flexDirection: "row", marginTop: 44 }}>
            <View style={{ width: 86, borderTopWidth: 0.6, borderTopColor: tema.grigioChiaro, paddingTop: 4, marginRight: 14 }}>
              <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, letterSpacing: 0.8 }}>DATA</Text>
            </View>
            <View style={{ flex: 1, borderTopWidth: 0.6, borderTopColor: tema.grigioChiaro, paddingTop: 4 }}>
              <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, letterSpacing: 0.8 }}>FIRMA DEL CLIENTE</Text>
            </View>
          </View>
        </View>
        )}
      </View>
    </View>
  );

  // Il piano in numeri: fatti contabili del documento, niente che suoni da promessa.
  const giorniFasi = modello.cronoprogramma.map((f) => giorniDellaDurata(f.durata));
  const durataGiorni = haTempi && giorniFasi.every((g) => g != null) ? (giorniFasi as number[]).reduce((a, b) => a + b, 0) : 0;
  const nVoci = capitoli.reduce((a, c) => a + c.voci.length, 0);
  const inNumeri: Array<{ numero: string; etichetta: string }> = [
    ...(oc.livello !== "corpo" && capitoli.length > 0 ? [{ numero: String(capitoli.length), etichetta: capitoli.length === 1 ? "capitolo di lavoro" : "capitoli di lavoro" }] : []),
    ...(oc.livello === "dettagliato" && nVoci > 0 ? [{ numero: String(nVoci), etichetta: nVoci === 1 ? "lavorazione descritta" : "lavorazioni descritte, una per una" }] : []),
    ...(durataGiorni >= 7 ? [{ numero: String(Math.round(durataGiorni / 7)), etichetta: "settimane di cantiere, stimate" }] : []),
    ...(modello.giorniValidita && modello.giorniValidita > 0 ? [{ numero: String(modello.giorniValidita), etichetta: "giorni di validità dell'offerta" }] : []),
  ];

  const promo = dati.mostraFinanziamento ? parseFinanziamentoPromo(modello.finanziamentoPromo) : null;
  const rata = promo ? calcolaRataMensile(totali.totale, promo.rate, promo.tan_pct) : 0;
  // Col prezzo scritto a mano le righe possono essere a 0 €: il totale delle
  // lavorazioni è il prezzo scritto, e gli importi di righe e capitoli non si mostrano.
  const prezzoManuale = totali.prezzoManuale === true;
  const importoLordo = prezzoManuale
    ? Number(totali.imponibileLordo) || 0
    : capitoli.reduce((s, c) => s + (Number(c.subtotale) || 0), 0);
  const corpoTesto = { fontFamily: tema.caratteri.testo, fontSize: 10, color: tema.inchiostro, lineHeight: 1.55 } as const;
  // paddingBottom: il piè di pagina può arrivare a cinque righe (nome, recapiti, dati
  // fiscali, testo libero, versione). Sotto i 90 punti il testo gli finiva sopra.
  const pagina = { paddingTop: 96, paddingBottom: 96, paddingHorizontal: MARGINE, fontFamily: tema.caratteri.testo, backgroundColor: tema.carta } as const;
  const cornice = (<><Intestazione tema={tema} dati={dati} /><PieDiPagina tema={tema} dati={dati} /></>);

  // Dopo il capitolo precedente, sulla stessa pagina: quelli di altezza limitata
  // (se ci stanno interi) e il piano dei lavori, che si spezza da sé. Il computo
  // cominciava sempre su un foglio nuovo, e sotto le foto del progetto restava
  // mezza pagina bianca.
  const seguePrecedente = (chiave: string) => scorreIntero(chiave) || chiave === "piano" || chiave === "domande";

  // Quanto occupa un capitolo che non si spezza (null: non si sa, o si spezza).
  const stimaGalleria = (foto: DocEdileFoto[]) => {
    if (!foto.length) return 0;
    const didascalia = (f: DocEdileFoto) => (f.didascalia || f.luogo ? 5 + 8.5 * 1.2 : 0);
    let h = 246 + didascalia(foto[0]) + 14;
    for (let i = 1; i < foto.length; i += 2) h += 150 + Math.max(...foto.slice(i, i + 2).map(didascalia)) + 14;
    return h;
  };
  const stimaCapitolo = (chiave: string): number | null => {
    let h: number | null = null;
    switch (chiave) {
      case "chiSiamo": {
        const conFoto = Boolean(modello.chiSiamoFotoUrl);
        const testo = haChiSiamo
          ? Math.max(stimaTestoRicco(tema, modello.chiSiamoHtml, UTILE - (conFoto ? 210 + 18 : 60), 10, 1.55), conFoto ? 236 : 0) + 22
          : 0;
        const usp = haUsp ? STIMA_TITOLINO + stimaSchede(tema, modello.usp, colonneUsp) + 12 : 0;
        h = stimaTesta(tema, "Chi c'è dietro questo progetto.") + testo + usp;
        break;
      }
      case "progetto": {
        const due = modello.esigenze.length > 0 && modello.soluzione.length > 0;
        const larga = (due ? (UTILE - 24) / 2 : UTILE) - 26;
        const colonna = (voci: DocEdileVoceElenco[]) => (voci.length ? STIMA_TITOLINO + voci.reduce((t, v) => t + 14.6
          + altezzaTesto(senzaNumeroDavanti(v.titolo), larga, fam(tema.caratteri.forte), 9.5, 1.3)
          + (v.descrizione ? 2 + altezzaTesto(v.descrizione, larga, fam(tema.caratteri.testo), 8.5, 1.45) : 0), 0) : 0);
        h = stimaTesta(tema, "Le tue richieste, in ordine.")
          + (fotoApertura ? 230 + 18 + (fotoApertura.didascalia ? 5 + 8 * 1.2 : 0) : 0)
          + Math.max(colonna(modello.esigenze), colonna(modello.soluzione)) + 26;
        break;
      }
      case "percorso": h = stimaTesta(tema, "Dal primo incontro alla consegna.") + stimaPassi(tema, modello.percorso); break;
      case "lavori": h = stimaTesta(tema, "Lavori finiti, non promesse.", "Alcuni interventi che abbiamo già consegnato.") + stimaGalleria(modello.galleriaLavori); break;
      case "recensioni":
        h = stimaTesta(tema, "La parola ai nostri clienti.", sommarioRecensioni)
          + stimaVotiOnline(votiOnline) + stimaParoleDeiClienti(tema, modello.testimonianze, UTILE);
        break;
      case "foto": h = stimaTesta(tema, "Il tuo progetto, da vedere.", "Lo stato di oggi e come diventerà.") + stimaGalleria(fotoCapitolo); break;
      case "garanzie": h = stimaTesta(tema, "Più certezze, meno dubbi.") + stimaSchedeGaranzie(tema, modello.garanzie, colonneGaranzie, UTILE); break;
      case "tempi": h = modello.cronoprogramma.length > 8 ? null : stimaTesta(tema, "Quanto dura il cantiere.") + stimaTempi(tema, modello.cronoprogramma) + 30; break;
      case "investimento": {
        const tabella = oc.livello !== "corpo" && capitoli.length > 1 && !prezzoManuale
          ? 12 + 6.5 * 1.2 + capitoli.length * ((capitoli.length > 6 ? 10 : 16) + 9.5 * 1.2) + 14
          : 0;
        const totaliH = (totali.scontoPct > 0 ? 4 : 2) * (10 + 9.5 * 1.2 + 0.6);
        const pagamentoH = modello.pagamentoHtml ? STIMA_TITOLINO + stimaTestoRicco(tema, modello.pagamentoHtml, UTILE - 250 - 28 - 12, 9, 1.45) : 0;
        const banda = 16 + 44 + 32 * 1.2;
        const finanziamento = promo && rata > 0 ? 14 + 22 + 10 * 1.2 + 2 + altezzaTesto("Simulazione indicativa in 120 rate mensili (TAN 9,9%), soggetta ad approvazione della finanziaria.", UTILE - 28 - 130, "Helvetica", 8, 1.4) : 0;
        const detrazione = totali.detrazionePct > 0 ? 14 + 22 + Math.max(7 * 1.2 + 4 + 17 * 1.2 + 1 + 7.5 * 1.2, altezzaTesto("Importo indicativo, calcolato sull'imponibile e ripartito come prevede la normativa. L'effettiva detraibilità dipende dai requisiti del tuo intervento e va verificata con il tuo consulente fiscale.", UTILE - 28 - 150, "Helvetica", 8, 1.45)) : 0;
        const margine = modello.mostraMargine ? 14 + 20 + 7.5 * 1.2 + 4 + 9 * 1.2 : 0;
        h = stimaTesta(tema, "Il tuo investimento.", "Un prezzo chiaro: quanto costa e che cosa comprende, senza giri di parole.")
          + tabella + Math.max(totaliH, pagamentoH) + banda + finanziamento + detrazione + margine;
        break;
      }
      default: {
        // Un blocco della libreria senza foto (con le foto ha una pagina sua).
        const b = BLOCCHI.find((x) => x.chiave === chiave);
        h = b && modello.blocchi[b.chiave].foto.length === 0 ? altezzaTestoBlocco(tema, modello.blocchi[b.chiave], b.chiave === "compreso") : null;
      }
    }
    // Più alto di una pagina: si spezza, e dopo non si sa più dove si è.
    return h != null && h <= ALTEZZA_UTILE ? h : null;
  };

  // Il piano dei lavori si spezza da sé: per sapere dove finisce se ne rifà
  // l'impaginazione riga per riga, come il motore. Le righe non si spezzano, il
  // titolo di ogni capitolo vuole sotto almeno 50 punti, quello del piano 130.
  // Restituisce quanto è pieno l'ultimo foglio, e se il titolo è passato a un foglio nuovo.
  const testaPiano = stimaTesta(tema, "Che cosa faremo, voce per voce.", "Le lavorazioni previste, raccolte per capitolo.");
  const codaDelPiano = (inizio: number): { coda: number; aCapo: boolean } => {
    let usato = inizio;
    let aCapo = false;
    const metti = (h: number, sotto = 0) => {
      if (usato > 0 && usato + h + sotto > ALTEZZA_UTILE) usato = 0;
      usato += h;
    };
    if (inizio > 0 && inizio + testaPiano + 130 > ALTEZZA_UTILE) { usato = 0; aCapo = true; }
    usato += testaPiano;
    if (oc.livello === "corpo") metti(6 + 11.5 * 1.2 + 1.2);
    else if (oc.livello === "sintetico") capitoli.forEach(() => metti(18 + 17 + 0.6));
    else {
      const larga = UTILE - 28 - 8 - (oc.mostraQta ? 84 : 0) - (oc.mostraPrezzi && !prezzoManuale ? 66 : 0) - (!prezzoManuale ? 74 : 0) - (modello.mostraMargine ? 58 : 0);
      for (const cap of capitoli) {
        metti(6 + 17 + 1.2 + 6 + 6.5 * 1.2 + 4, 50);
        for (const v of cap.voci) {
          metti(12.6 + Math.max(9 * 1.2, altezzaTesto(v.descrizione, larga - 3, fam(tema.caratteri.testo), 9, 1.35) + (v.fonte ? 1.5 + 7 * 1.2 : 0)));
        }
        usato = Math.min(ALTEZZA_UTILE, usato + 16);
      }
    }
    metti(6 + 10 + 14 * 1.2);
    return { coda: usato, aCapo };
  };

  // Le domande si spezzano una per volta, come le righe del piano; il titolo resta
  // con la prima.
  const testaDomande = stimaTesta(tema, "Le domande che ci fanno più spesso.");
  const codaDelleDomande = (inizio: number): { coda: number; aCapo: boolean } => {
    const alte = altezzeDomande(tema, modello.faq, UTILE);
    let usato = inizio;
    let aCapo = false;
    if (inizio > 0 && inizio + testaDomande + (alte[0] ?? 0) > ALTEZZA_UTILE) { usato = 0; aCapo = true; }
    usato += testaDomande + (alte[0] ?? 0);
    for (const h of alte.slice(1)) {
      if (usato + h > ALTEZZA_UTILE) usato = 0;
      usato += h;
    }
    return { coda: usato, aCapo };
  };
  const codaSpezzata: Record<string, (inizio: number) => { coda: number; aCapo: boolean }> = {
    piano: codaDelPiano, domande: codaDelleDomande,
  };

  // Le pagine che resterebbero mezze bianche: in fondo, una foto che le riempie.
  // Si ripercorre ogni foglio che scorre come lo impagina il motore (un capitolo
  // che segue il precedente sta sulla stessa pagina se ci sta intero, gli altri
  // cominciano una pagina nuova) e, dove l'ultimo capitolo di una pagina lascia
  // almeno una foto di bianco, la foto di quel capitolo la riempie. Chi viene dopo
  // comincia comunque una pagina nuova.
  const riempimento = new Map<string, number>();
  // I capitoli che cominciano una pagina nuova per scelta (vedi MARGINE_PREVISIONE).
  const aCapo = new Set<string>();
  // L'ultima pagina di ogni foglio che scorre: da quale capitolo comincia e quanto è
  // piena (null: non si sa). Serve a portare un capitolo corto sulla pagina del blocco dopo.
  const ultimaPagina = new Map<number, { da: number; usato: number | null; incerto: boolean; bilico: number | null }>();
  for (const [s, segmento] of segmenti.entries()) {
    if (segmento.propria) continue;
    let usato: number | null = null;
    let ultimo: string | null = null;
    let da = 0;
    // Un capitolo che si spezza e che, senza il margine della previsione, starebbe
    // tutto sulla pagina: dove finisce lo decide il motore, non la stima. Per la foto
    // che riempie vale allora la pagina più piena delle due.
    let incerto = false;
    let usatoPerFoto: number | null = null;
    // L'ultimo capitolo in bilico (lo decide il motore): se sta da solo, è alto così.
    let bilico: number | null = null;
    const chiudi = () => {
      const foto = ultimo ? modello.fotoRiempimento[ultimo] : null;
      if (usato == null || usatoPerFoto == null || !ultimo || !foto || fotoUsate.has(foto.src)) return;
      const altezza = Math.min(380, Math.floor(ALTEZZA_UTILE - usatoPerFoto - CORNICE_RIEMPIMENTO - SICUREZZA_RIEMPIMENTO));
      if (altezza >= RIEMPIMENTO_MINIMO) {
        riempimento.set(ultimo, altezza);
        fotoUsate.add(foto.src);
      }
    };
    segmento.chiavi.forEach((chiave, i) => {
      const spezzata = codaSpezzata[chiave];
      if (spezzata) {
        // Comincia sotto il capitolo prima se il titolo ci sta con margine, altrimenti su un foglio nuovo.
        const sotto = i > 0 && usato != null && (usato as number) + STACCO + MARGINE_PREVISIONE < ALTEZZA_UTILE;
        const inizio = sotto ? (usato as number) + STACCO + MARGINE_PREVISIONE : 0;
        const { coda, aCapo: titoloACapo } = spezzata(inizio);
        const senzaMargine = sotto ? spezzata((usato as number) + STACCO) : null;
        incerto = senzaMargine != null && (senzaMargine.coda >= (usato as number) + STACCO) !== (coda >= inizio);
        if (i > 0 && (!sotto || titoloACapo)) {
          chiudi();
          aCapo.add(chiave);
        }
        // Un capitolo che passa su un'altra pagina fa cominciare lì l'ultima pagina.
        if (i === 0 || !sotto || titoloACapo || coda < inizio) da = i;
        usato = coda;
        usatoPerFoto = incerto && senzaMargine ? Math.max(coda, senzaMargine.coda) : coda;
        bilico = null;
        ultimo = chiave;
        return;
      }
      const h = stimaCapitolo(chiave);
      if (i > 0 && seguePrecedente(chiave) && usato != null && h != null) {
        const dopo = usato + STACCO + h;
        // Ci sta con margine: stessa pagina.
        if (dopo <= ALTEZZA_UTILE - MARGINE_PREVISIONE) {
          usato = dopo;
          usatoPerFoto = dopo;
          incerto = false;
          bilico = null;
          ultimo = chiave;
          return;
        }
        // In bilico: se la pagina prima non prende la foto, decide il motore, e da
        // qui in poi non si sa più dove si è (nessuna foto fino alla prossima pagina nuova).
        if (dopo <= ALTEZZA_UTILE + 60) {
          chiudi();
          if (!riempimento.has(ultimo as string)) {
            usato = null;
            usatoPerFoto = null;
            bilico = h;
            da = i;
            ultimo = chiave;
            return;
          }
          aCapo.add(chiave);
          usato = h;
          usatoPerFoto = h;
          incerto = false;
          bilico = null;
          ultimo = chiave;
          da = i;
          return;
        }
      }
      if (i > 0) {
        chiudi();
        aCapo.add(chiave);
      }
      usato = h;
      usatoPerFoto = h;
      incerto = false;
      bilico = null;
      ultimo = chiave;
      da = i;
    });
    ultimaPagina.set(s, { da, usato, incerto, bilico });
    // In fondo all'ultimo foglio seguono i prossimi passi (senza foto): lì non si riempie.
    if (!(s === segmenti.length - 1 && !fotoChiusura)) chiudi();
  }
  // L'ultima pagina dei capitoli, prima che qualcuno salga sulle pagine dei blocchi.
  const ultimoFoglio = segmenti.length > 0 && !segmenti[segmenti.length - 1].propria ? ultimaPagina.get(segmenti.length - 1) ?? null : null;

  // Un capitolo corto rimasto da solo sull'ultima pagina di un foglio che scorre
  // (le garanzie dopo un prezzo che riempie la pagina, un blocco senza foto) sale
  // sulla pagina del blocco con le foto che segue: la foto del blocco si accorcia e
  // prende quello che resta. Prima restava una pagina per tre quarti bianca e, dopo,
  // una pagina di foto. Mai sotto FOTO_BLOCCO_DIVISA: meglio la pagina bianca che una
  // foto a striscia. I capitoli che si spezzano da sé (piano, domande) restano dove sono.
  for (let s = segmenti.length - 2; s >= 0; s -= 1) {
    const flusso = segmenti[s];
    const blocco = segmenti[s + 1];
    if (flusso.propria || !blocco.propria || blocco.chiavi.length !== 1) continue;
    const pagina = ultimaPagina.get(s);
    // In bilico sotto il capitolo prima (lo decideva il motore): sale sul blocco, alto com'è.
    const usatoPagina = pagina?.usato ?? (pagina?.bilico != null && pagina.da === flusso.chiavi.length - 1 ? pagina.bilico : null);
    if (!pagina || usatoPagina == null) continue;
    const corti = flusso.chiavi.slice(pagina.da);
    if (!corti.length || corti.some((k) => codaSpezzata[k] || stimaCapitolo(k) == null)) continue;
    const b = BLOCCHI.find((x) => x.chiave === blocco.chiavi[0]);
    if (!b || (b.chiave !== "compreso" && tavolaDelBlocco(modello.blocchi[b.chiave]) != null)) continue;
    const foto = ALTEZZA_UTILE - usatoPagina - STACCO - altezzaTestoBlocco(tema, modello.blocchi[b.chiave], b.chiave === "compreso") - 16 - 16 - SICUREZZA_RIEMPIMENTO;
    if (foto < FOTO_BLOCCO_DIVISA) continue;
    // La foto di riempimento che l'ultimo capitolo aveva preso non serve più: c'è quella del blocco.
    riempimento.delete(corti[corti.length - 1]);
    corti.forEach((k) => aCapo.delete(k));
    segmenti[s + 1] = { propria: true, chiavi: [...corti, blocco.chiavi[0]], altezzaFoto: Math.min(430, Math.floor(foto)) };
    if (pagina.da === 0) segmenti.splice(s, 1);
    else segmenti[s] = { ...flusso, chiavi: flusso.chiavi.slice(0, pagina.da) };
  }

  // I prossimi passi con la foto hanno una pagina loro. Se però l'ultima pagina dei
  // capitoli lascia posto ai passi, ai contatti e a una foto non troppo bassa, salgono
  // lì e la foto si accorcia: prima un'ultima domanda poteva restare da sola su un
  // foglio, e i passi andavano su quello dopo.
  const altezzaChiusuraSenzaFoto = stimaTesta(tema, "Pronti a partire?", sommarioChiusura) + stimaPassi(tema, passiChiusura) + 10 + 120;
  let fotoChiusuraInCoda: number | null = null;
  if (fotoChiusura && ultimoFoglio?.usato != null && !ultimoFoglio.incerto && segmenti.length > 0 && !segmenti[segmenti.length - 1].propria) {
    const resto = ALTEZZA_UTILE - ultimoFoglio.usato - STACCO - altezzaChiusuraSenzaFoto - 18 - SICUREZZA_RIEMPIMENTO;
    if (resto >= FOTO_BLOCCO_DIVISA) {
      fotoChiusuraInCoda = Math.min(330, Math.floor(resto));
      const ultimi = segmenti[segmenti.length - 1].chiavi;
      riempimento.delete(ultimi[ultimi.length - 1]);
    }
  }
  const chiusuraInCoda = !fotoChiusura || fotoChiusuraInCoda != null;

  // Il contenuto di ogni capitolo, con il suo numero nella sequenza scelta.
  const contenutoCapitolo = (chiave: string, numero: number, riempi = false, altezzaFoto?: number): React.ReactNode => {
    const libera = libere.get(chiave);
    if (libera) {
      return (
        <>
          <Capitolo tema={tema} numero={numero} occhiello={libera.occhiello ?? dati.azienda.nome} titolo={libera.titolo || "…"} />
          {libera.fotoUrl ? (
            <View wrap={false} style={{ marginBottom: 18 }}>
              <Image src={libera.fotoUrl} style={{ width: UTILE, height: 250, objectFit: "cover" }} />
              {libera.didascalia ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8, color: tema.grigioChiaro, marginTop: 5 }}>{libera.didascalia}</Text> : null}
            </View>
          ) : null}
          {libera.testoHtml ? <TestoRicco tema={tema} html={libera.testoHtml} stile={corpoTesto} /> : null}
        </>
      );
    }
    const blocco = BLOCCHI.find((b) => b.chiave === chiave);
    if (blocco) return <CapitoloBlocco tema={tema} numero={numero} chiave={blocco.chiave} blocco={modello.blocchi[blocco.chiave]} riempi={riempi} altezzaFoto={altezzaFoto} />;
    switch (chiave) {
      case "chiSiamo": return (<>
          <Capitolo tema={tema} numero={numero} occhiello="Chi siamo" titolo={`Chi c'è *dietro* questo progetto.`} />
          {haChiSiamo ? (
            <View style={{ flexDirection: "row", marginBottom: 22 }}>
              <View style={{ flex: 1, paddingRight: modello.chiSiamoFotoUrl ? 18 : 60 }}>
                <TestoRicco tema={tema} html={modello.chiSiamoHtml} stile={corpoTesto} />
              </View>
              {modello.chiSiamoFotoUrl ? (
                <Image src={modello.chiSiamoFotoUrl} style={{ width: 210, height: 236, objectFit: "cover" }} />
              ) : null}
            </View>
          ) : null}
          {haUsp ? (
            <View style={{ marginBottom: 12 }}>
              <TitolinoSezione tema={tema} testo="Perché sceglierci" />
              <Schede tema={tema} voci={modello.usp} colonne={colonneUsp} />
            </View>
          ) : null}
</>);
      case "progetto": return (            <View style={{ marginBottom: 26 }}>
              <Capitolo tema={tema} numero={numero} occhiello="Il progetto" titolo="Le tue *richieste*, in ordine." />
              {fotoApertura ? (
                <View wrap={false} style={{ marginBottom: 18 }}>
                  <Image src={fotoApertura.url} style={{ width: UTILE, height: 230, objectFit: "cover" }} />
                  {fotoApertura.didascalia ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8, color: tema.grigioChiaro, marginTop: 5 }}>{fotoApertura.didascalia}</Text> : null}
                </View>
              ) : null}
              <View style={{ flexDirection: "row" }}>
                {modello.esigenze.length > 0 ? (
                  <View style={{ flex: 1, paddingRight: modello.soluzione.length > 0 ? 12 : 0 }}>
                    <TitolinoSezione tema={tema} testo="Da dove partiamo" />
                    <ElencoInOrdine tema={tema} voci={modello.esigenze} />
                  </View>
                ) : null}
                {modello.soluzione.length > 0 ? (
                  <View style={{ flex: 1, paddingLeft: modello.esigenze.length > 0 ? 12 : 0 }}>
                    <TitolinoSezione tema={tema} testo="La nostra risposta" />
                    <ElencoInOrdine tema={tema} voci={modello.soluzione} />
                  </View>
                ) : null}
              </View>
            </View>);
      case "percorso": return (            <View>
              <Capitolo tema={tema} numero={numero} occhiello="Come lavoriamo" titolo="Dal primo incontro alla *consegna*." />
              <Passi tema={tema} voci={modello.percorso} />
            </View>);
      case "lavori": return (<>
          <Capitolo tema={tema} numero={numero} occhiello="I nostri lavori" titolo="Lavori *finiti*, non promesse." sommario="Alcuni interventi che abbiamo già consegnato." />
          <Galleria tema={tema} foto={modello.galleriaLavori} />
</>);
      case "recensioni": return (
          <ParoleDeiClienti tema={tema} voci={modello.testimonianze} larghezza={UTILE} testa={<>
            <Capitolo tema={tema} numero={numero} occhiello="Dicono di noi" titolo="La parola ai *nostri clienti*." sommario={sommarioRecensioni} />
            <VotiOnline tema={tema} voti={votiOnline} larghezza={UTILE} />
          </>} />
      );
      case "foto": return (<>
          <Capitolo tema={tema} numero={numero} occhiello="Foto e render" titolo="Il tuo progetto, *da vedere*." sommario="Lo stato di oggi e come diventerà." />
          <Galleria tema={tema} foto={fotoCapitolo} />
</>);
      case "piano": return (<>
        <Capitolo tema={tema} numero={numero} occhiello={modulo.titoloComputo.replace(/\*/g, "")} titolo="Che cosa *faremo*, voce per voce." sommario="Le lavorazioni previste, raccolte per capitolo." />
        {oc.livello === "corpo" ? (
          <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 6, borderBottomWidth: 1.2, borderBottomColor: tema.fondo }}>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 11.5, color: tema.inchiostro }}>Lavorazioni a corpo</Text>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 11, color: tema.inchiostro }}>{formatCurrency(importoLordo)}</Text>
          </View>
        ) : oc.livello === "sintetico" ? (
          capitoli.map((cap, i) => (
            <View key={cap.nome} wrap={false} style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", flex: 1 }}>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 17, color: tema.inchiostroMarca, width: 28, lineHeight: 1 }}>{dueCifre(i + 1)}</Text>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 11, color: tema.inchiostro, flex: 1 }}>{cap.nome}</Text>
              </View>
              {!prezzoManuale ? <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 11, color: tema.inchiostro }}>{formatCurrency(cap.subtotale)}</Text> : null}
            </View>
          ))
        ) : (
          capitoli.map((cap, i) => (
            <TabellaCapitolo
              key={cap.nome} tema={tema} cap={cap} indice={i + 1}
              mostraMargine={modello.mostraMargine} mostraPrezzi={oc.mostraPrezzi && !prezzoManuale} mostraQta={oc.mostraQta}
              mostraSubtotali={oc.mostraSubtotali && !prezzoManuale} mostraImporti={!prezzoManuale}
            />
          ))
        )}
        <View wrap={false} style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end", marginTop: 6, paddingTop: 10, borderTopWidth: 1.2, borderTopColor: tema.inchiostro }}>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.grigio, letterSpacing: 1.3, marginRight: 16, marginBottom: 2 }}>TOTALE LAVORAZIONI · IVA ESCLUSA</Text>
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 14, color: tema.inchiostro, paddingRight: 3.5 }}>{formatCurrency(importoLordo)}</Text>
        </View>
</>);
      case "investimento": return (<>
        <Capitolo tema={tema} numero={numero} occhiello="L'investimento" titolo="Il tuo *investimento*." sommario="Un prezzo chiaro: quanto costa e che cosa comprende, senza giri di parole." />

        {oc.livello !== "corpo" && capitoli.length > 1 && !prezzoManuale ? (
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", backgroundColor: tema.fondo, paddingVertical: 6, paddingHorizontal: 10 }}>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 6.5, color: tema.bianco, letterSpacing: 1.2, width: 30 }}>N.</Text>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 6.5, color: tema.bianco, letterSpacing: 1.2, flex: 1 }}>CAPITOLO</Text>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 6.5, color: tema.bianco, letterSpacing: 1.2 }}>IMPONIBILE</Text>
            </View>
            {capitoli.map((cap, i) => (
              <View key={cap.nome} wrap={false} style={{ flexDirection: "row", paddingVertical: capitoli.length > 6 ? 5 : 8, paddingHorizontal: 10, backgroundColor: i % 2 === 0 ? tema.tinta : tema.carta }}>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostroMarca, width: 30 }}>{dueCifre(i + 1)}</Text>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9.5, color: tema.inchiostro, flex: 1 }}>{cap.nome}</Text>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro }}>{formatCurrency(cap.subtotale)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View wrap={false}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          {/* Le modalità di pagamento accanto ai totali: prima stavano sotto, dopo la
              detrazione, e con un computo lungo finivano da sole su un foglio nuovo. */}
          <View style={{ flex: 1, paddingRight: 28 }}>
            {modello.pagamentoHtml ? (
              <>
                <TitolinoSezione tema={tema} testo="Modalità di pagamento" />
                <TestoRicco tema={tema} html={modello.pagamentoHtml} stile={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.inchiostro, lineHeight: 1.45 }} />
              </>
            ) : null}
          </View>
          <View style={{ width: 250 }}>
            {[
              { e: "Imponibile lavori", v: formatCurrency(totali.imponibileLordo) },
              ...(totali.scontoPct > 0 ? [
                { e: `Sconto ${percento(totali.scontoPct)}`, v: `- ${formatCurrency(totali.scontoEur)}` },
                { e: "Imponibile netto", v: formatCurrency(totali.imponibile) },
              ] : []),
              { e: `IVA ${percento(totali.ivaPct)}`, v: formatCurrency(totali.iva) },
            ].map((r, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9.5, color: tema.grigio }}>{r.e}</Text>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, paddingRight: 2.5 }}>{r.v}</Text>
              </View>
            ))}
          </View>
          </View>

          {/* La banda a tutta pagina: il numero che il cliente cerca, nel colore dell'azienda. */}
          <View style={{ marginHorizontal: -MARGINE, marginTop: 16, backgroundColor: tema.fondo, paddingHorizontal: MARGINE, paddingVertical: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7.5, color: tema.bianco, letterSpacing: 1.8 }}>IL TUO INVESTIMENTO</Text>
              <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.bianco, opacity: 0.82, marginTop: 4 }}>
                {`IVA ${percento(totali.ivaPct)} inclusa${modello.giorniValidita && modello.giorniValidita > 0 ? ` · offerta valida ${modello.giorniValidita} giorni` : ""}`}
              </Text>
            </View>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 32, color: tema.bianco, letterSpacing: -0.6, paddingRight: 7 }}>{formatCurrency(totali.totale)}</Text>
          </View>
        </View>

        {promo && rata > 0 ? (
          <View wrap={false} style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: tema.cartaCalda, borderLeftWidth: 2, borderLeftColor: tema.fondo, paddingVertical: 11, paddingHorizontal: 14 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 10, color: tema.inchiostro }}>Possibilità di finanziamento</Text>
              <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8, color: tema.grigio, marginTop: 2, lineHeight: 1.4 }}>
                {`Simulazione indicativa in ${promo.rate} rate mensili${promo.tan_pct > 0 ? ` (TAN ${promo.tan_pct}%)` : " a tasso zero"}, soggetta ad approvazione della finanziaria.`}
              </Text>
            </View>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 15, color: tema.inchiostroMarca }}>{`da ${formatCurrency(rata)}/mese`}</Text>
          </View>
        ) : null}

        {totali.detrazionePct > 0 ? (
          <View wrap={false} style={{ marginTop: 14, flexDirection: "row", backgroundColor: tema.cartaCalda, borderLeftWidth: 2, borderLeftColor: tema.fondo, paddingVertical: 11, paddingHorizontal: 14 }}>
            <View style={{ width: 150 }}>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1.3 }}>{`DETRAZIONE FISCALE ${percento(totali.detrazionePct)}`}</Text>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 17, color: tema.inchiostro, marginTop: 4 }}>{formatCurrency(totali.detrazioneEur)}</Text>
              <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7.5, color: tema.grigio, marginTop: 1 }}>recuperabili, a norma vigente</Text>
            </View>
            <Text style={{ flex: 1, fontFamily: tema.caratteri.testo, fontSize: 8, color: tema.grigio, lineHeight: 1.45 }}>
              Importo indicativo, calcolato sull'imponibile e ripartito come prevede la normativa. L'effettiva detraibilità dipende dai requisiti del tuo intervento e va verificata con il tuo consulente fiscale.
            </Text>
          </View>
        ) : null}

        {modello.mostraMargine ? (
          <View wrap={false} style={{ marginTop: 14, borderWidth: 0.8, borderColor: "#B91C1C", borderStyle: "dashed", padding: 10 }}>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7.5, color: "#B91C1C", letterSpacing: 0.8 }}>MARGINALITÀ · RISERVATO, DA NON CONSEGNARE AL CLIENTE</Text>
            <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.inchiostro, marginTop: 4 }}>
              {`Costo totale ${formatCurrency(totali.costoTot)} · margine ${formatCurrency(totali.margineEur)} (${percento(totali.marginePct)})`}
            </Text>
          </View>
        ) : null}

</>);
      case "garanzie": return (<>
          <Capitolo tema={tema} numero={numero} occhiello="Le nostre garanzie" titolo="Più *certezze*, meno dubbi." />
          <SchedeGaranzie tema={tema} voci={modello.garanzie} colonne={colonneGaranzie} larghezza={UTILE} />
</>);
      case "domande": return (<>
          <Capitolo tema={tema} numero={numero} occhiello="Domande e risposte" titolo="Le domande che ci fanno *più spesso*." />
          <Domande tema={tema} voci={modello.faq} />
</>);
      case "tempi": return (
          // Un cronoprogramma spezzato fra due pagine non si legge: fino a otto fasi resta intero.
          <View wrap={modello.cronoprogramma.length > 8} style={{ marginBottom: 30 }}>
            <Capitolo tema={tema} numero={numero} occhiello="I tempi" titolo="Quanto *dura* il cantiere." />
            <Tempi tema={tema} fasi={modello.cronoprogramma} />
          </View>
      );
      default: return null;
    }
  };

  return (
    <Document
      title={`Piano dei lavori ${dati.codice ?? ""} - ${dati.cliente}`}
      author={dati.azienda.nome}
      subject={`${modulo.etichetta} per ${dati.cliente}`}
    >
      <Copertina tema={tema} dati={dati} />

      {/* ─── Apertura: lettera, intervento in breve, sommario ─────────────── */}
      {visibile("apertura") ? (
        <Page size="A4" style={pagina}>
          {cornice}
        <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1.6, marginBottom: 8 }}>LA TUA PROPOSTA</Text>
        <TitoloAccento tema={tema} testo={dati.clienteNome ? `Per *${dati.clienteNome}*,` : "Gentile *cliente*,"} corpo={34} colore={tema.inchiostro} coloreAccento={tema.inchiostroMarca} />
        <Text style={[corpoTesto, { fontSize: 11, marginTop: 14, maxWidth: 420, color: tema.grigio }]}>
          {`in queste pagine trovi il piano dei lavori che ${dati.azienda.nome} ha preparato per ${dati.cantiere ? `l'immobile di ${dati.cantiere}` : "il tuo immobile"}: che cosa faremo, in che ordine, e con quale investimento.`}
        </Text>

        {dati.scheda.length > 0 ? (
          <View style={{ marginTop: 26 }}>
            <TitolinoSezione tema={tema} testo="L'intervento in breve" />
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {dati.scheda.map((s, i) => (
                <View key={i} style={{ width: "50%", paddingVertical: 6, paddingRight: 16, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
                  <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7.5, color: tema.grigioChiaro, marginBottom: 2 }}>{s.etichetta}</Text>
                  <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 10.5, color: tema.inchiostro }}>{s.valore}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {inNumeri.length >= 2 ? (
          <View style={{ marginTop: 26 }} wrap={false}>
            <TitolinoSezione tema={tema} testo="Il piano in numeri" />
            <View style={{ flexDirection: "row" }}>
              {inNumeri.map((v, i) => (
                <View key={i} style={{ flex: 1, paddingTop: 4, paddingRight: 12, borderLeftWidth: i === 0 ? 0 : 0.6, borderLeftColor: tema.filetto, paddingLeft: i === 0 ? 0 : 14 }}>
                  <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 34, color: tema.inchiostroMarca, lineHeight: 1.05, letterSpacing: -0.8 }}>{v.numero}</Text>
                  <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, marginTop: 3, lineHeight: 1.35 }}>{v.etichetta}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* L'indice sta sotto la lettera: con più di dieci capitoli va su tre colonne.
            Fino al 22/09/2026 su due colonne larghe non ci stava, e si prendeva un
            foglio intero con un terzo di pagina scritta. */}
        <View style={{ marginTop: 24 }} wrap={false}>
          <TitolinoSezione tema={tema} testo="In questo documento" />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {sommario.map((v) => (
              <View key={v.numero} style={{ width: sommario.length > 10 ? "33.33%" : "50%", flexDirection: "row", alignItems: "flex-end", paddingVertical: 5, paddingRight: 12, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 12, color: tema.inchiostroMarca, width: 24, lineHeight: 1 }}>{dueCifre(v.numero)}</Text>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9.5, color: tema.inchiostro, flex: 1 }}>{v.titolo}</Text>
              </View>
            ))}
          </View>
        </View>
        </Page>
      ) : null}

      {/* ─── I capitoli, nell'ordine scelto dall'azienda ────────────────────
          A segmenti. Un blocco con le foto (come funziona, protezione, controlli,
          documenti, diario) ha una pagina sua, e le foto la riempiono fino in fondo.
          Gli altri capitoli stanno in fogli che scorrono: i capitoli di altezza
          limitata (come lavoriamo, cosa è compreso, i tempi brevi) seguono il
          precedente se ci stanno interi, gli altri cominciano un foglio nuovo.
          Fino al 22/09/2026 ogni capitolo cominciava un foglio nuovo, e quasi ogni
          pagina finiva con 7-12 cm bianchi. Una foto che si allarga (flexGrow)
          dentro un foglio che scorre sposta i calcoli di tutto il foglio, e il testo
          si sovrappone: per questo i blocchi con le foto stanno su pagine proprie. */}
      {segmenti.map((segmento, s) => segmento.propria ? (
        <Page key={`blocco-${segmento.chiavi[segmento.chiavi.length - 1]}`} size="A4" style={pagina}>
          {cornice}
          {/* I capitoli corti saliti sulla pagina del blocco, interi, e poi il blocco con la foto accorciata. */}
          {segmento.chiavi.slice(0, -1).map((chiave) => (
            <View key={chiave} wrap={false} style={{ marginBottom: STACCO }}>
              {contenutoCapitolo(chiave, numeroDi.get(chiave) ?? 0)}
            </View>
          ))}
          {contenutoCapitolo(segmento.chiavi[segmento.chiavi.length - 1], numeroDi.get(segmento.chiavi[segmento.chiavi.length - 1]) ?? 0, true, segmento.altezzaFoto)}
        </Page>
      ) : (
        <Page key={`flusso-${s}`} size="A4" style={pagina}>
          {cornice}
          {/* Lo stacco sta in fondo al capitolo, e solo se quello dopo può continuare
              sulla stessa pagina. In cima a una pagina nuova un margine spingeva il
              titolo più in basso degli altri; in fondo a un capitolo che riempie la
              pagina, sbordava da solo su un foglio bianco. I prossimi passi in coda
              portano lo stacco sopra di sé (vedi `chiusura`). */}
          {segmento.chiavi.map((chiave, i) => {
            const scorre = i > 0 && scorreIntero(chiave);
            const segue = i > 0 && seguePrecedente(chiave) && !aCapo.has(chiave);
            const prossimo = segmento.chiavi[i + 1];
            const foto = riempimento.get(chiave);
            const fotoRiempimento = modello.fotoRiempimento[chiave];
            // I prossimi passi in coda portano lo stacco sopra di sé: dopo l'ultimo capitolo nessun margine.
            const continua = !foto && Boolean(prossimo) && seguePrecedente(prossimo) && !aCapo.has(prossimo);
            return (
              <React.Fragment key={chiave}>
                {/* `wrap` si passa solo quando è false: react-pdf guarda se la chiave c'è
                    («'wrap' in props»), e `wrap={undefined}` vale «non spezzare». Così fino al
                    22/09/2026 un computo più lungo di un foglio finiva schiacciato in uno solo,
                    con le righe una sopra l'altra. */}
                <View break={i > 0 && !segue} {...(scorre ? { wrap: false } : {})} style={continua ? { marginBottom: 30 } : undefined}>
                  {contenutoCapitolo(chiave, numeroDi.get(chiave) ?? i + 1)}
                </View>
                {/* Fuori dal capitolo: se la stima sbagliasse, la foto passerebbe alla pagina
                    dopo senza trascinarsi dietro (e schiacciare) il capitolo. In fondo al
                    foglio la foto la misura il motore (FotoInFondo, qui sotto). */}
                {foto && fotoRiempimento && prossimo ? <FotoRiempimento tema={tema} foto={fotoRiempimento} altezza={foto} /> : null}
              </React.Fragment>
            );
          })}
          {(() => {
            const ultimo = segmento.chiavi[segmento.chiavi.length - 1];
            const fotoUltimo = modello.fotoRiempimento[ultimo];
            return riempimento.has(ultimo) && fotoUltimo ? <FotoInFondo tema={tema} foto={fotoUltimo} /> : null;
          })()}
          {/* Senza foto, o con la foto accorciata, i prossimi passi seguono l'ultimo capitolo. */}
          {s === segmenti.length - 1 && chiusuraInCoda ? chiusura(fotoChiusuraInCoda, true) : null}
        </Page>
      ))}

      {/* ─── I prossimi passi: con la foto del lavoro finito, una pagina sua ───
          La foto è alta quanto lasciano titolo, passi e contatti (649 punti utili,
          ~270 per il resto, con margine per un indirizzo lungo). Senza foto la
          chiusura segue l'ultimo capitolo; dopo un blocco con pagina sua, ha la sua. */}
      {!chiusuraInCoda || segmenti.length === 0 || segmenti[segmenti.length - 1].propria ? (
        <Page size="A4" style={pagina}>
          {cornice}
          {chiusura(fotoChiusura ? 330 : null)}
        </Page>
      ) : null}

      {/* ─── Condizioni contrattuali e termini legali ─────────────────────── */}
      {modello.condizioniLegali.length > 0 ? (
        <Page size="A4" style={pagina}>
          {cornice}
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1.6, marginBottom: 6 }}>ALLEGATO</Text>
          <TitoloAccento tema={tema} testo="Condizioni *contrattuali*." corpo={21} colore={tema.inchiostro} coloreAccento={tema.inchiostroMarca} />
          <View style={{ marginTop: 14 }}>
            {/* Un articolo per volta: il titolo non resta mai in fondo a una pagina
                senza il suo testo, e l'elenco delle clausole da firmare non si spezza. */}
            {perArticoli(modello.condizioniLegali, { senzaClausoleDaFirmare: modello.clausoleDaApprovare.length > 0 }).map((gruppo, g) => (
              <View key={g} wrap={gruppo.length > 14} minPresenceAhead={36}>
                {gruppo.map((r, i) =>
                  r.tipo === "h1" ? <Text key={i} style={{ fontFamily: tema.caratteri.forte, fontSize: 11, color: tema.inchiostroMarca, marginTop: g === 0 ? 0 : 14, marginBottom: 5 }}>{r.testo}</Text>
                  : r.tipo === "h2" ? <Text key={i} style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, marginTop: g === 0 ? 0 : 10, marginBottom: 3 }}>{r.testo}</Text>
                  : r.tipo === "li" ? <Text key={i} style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, lineHeight: 1.5, marginLeft: 10, marginBottom: 2 }}>{`- ${r.testo}`}</Text>
                  : <Text key={i} style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, lineHeight: 1.5, marginBottom: 5 }}>{r.testo}</Text>,
                )}
              </View>
            ))}
          </View>
        </Page>
      ) : null}

      {/* ─── Firma e accettazione ──────────────────────────────────────────
          Il preventivo firmato è il contratto: questa è la pagina che lo rende
          tale. Riepilogo di ciò che si firma, dichiarazione, firme delle due
          parti e — quando le condizioni le elencano — l'approvazione specifica
          delle clausole dell'art. 1341 c.c., con una seconda firma. */}
      {modello.condizioniLegali.length > 0 ? (
        <Page size="A4" style={pagina}>
          {cornice}
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1.6, marginBottom: 6 }}>PER ACCETTAZIONE</Text>
          <TitoloAccento tema={tema} testo="Firma del *contratto*." corpo={21} colore={tema.inchiostro} coloreAccento={tema.inchiostroMarca} />

          <View style={{ marginTop: 16, backgroundColor: tema.cartaCalda, padding: 16 }}>
            <RigaRiepilogo tema={tema} etichetta="Impresa" valore={[dati.azienda.nome, dati.azienda.partitaIva ? `P.IVA ${dati.azienda.partitaIva}` : null].filter(Boolean).join(" · ")} />
            <RigaRiepilogo tema={tema} etichetta="Committente" valore={dati.cliente} />
            <RigaRiepilogo tema={tema} etichetta="Oggetto" valore={dati.tipoIntervento || modulo.etichetta} />
            {dati.cantiere ? <RigaRiepilogo tema={tema} etichetta="Luogo dei lavori" valore={dati.cantiere} /> : null}
            <RigaRiepilogo tema={tema} etichetta="Documento" valore={[dati.codice ? `Preventivo ${dati.codice}` : "Preventivo", `del ${oggi()}`].join(" ")} />
            <RigaRiepilogo tema={tema} etichetta="Importo" valore={`${formatCurrency(totali.totale)} · IVA ${percento(totali.ivaPct)} inclusa`} forte />
            {modello.giorniValidita && modello.giorniValidita > 0 ? (
              <RigaRiepilogo tema={tema} etichetta="Validità" valore={`${modello.giorniValidita} giorni dalla data del documento`} />
            ) : null}
          </View>

          <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.inchiostro, lineHeight: 1.55, marginTop: 14 }}>
            Il Committente dichiara di aver ricevuto, letto e accettato il presente documento in ogni sua parte — il piano
            dei lavori, l'investimento e le condizioni generali di contratto che lo accompagnano — e ne sottoscrive il
            contenuto.
          </Text>

          <View wrap={false} style={{ flexDirection: "row", marginTop: 18 }}>
            <LineaFirma tema={tema} etichetta="LUOGO E DATA" larghezza={150} />
            <View style={{ width: 16 }} />
            <LineaFirma tema={tema} etichetta="PER L'IMPRESA" chi={dati.azienda.nome} />
            <View style={{ width: 16 }} />
            <LineaFirma tema={tema} etichetta="FIRMA DEL COMMITTENTE" chi={dati.cliente} />
          </View>

          {modello.clausoleDaApprovare.length > 0 ? (
            <View wrap={false} style={{ marginTop: 22, borderWidth: 0.8, borderColor: tema.inchiostro, padding: 14 }}>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostro, letterSpacing: 1.2, marginBottom: 6 }}>APPROVAZIONE SPECIFICA (ARTT. 1341 E 1342 C.C.)</Text>
              <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, lineHeight: 1.5, marginBottom: 6 }}>
                Il Committente, dopo averle rilette, approva specificamente le clausole seguenti:
              </Text>
              {modello.clausoleDaApprovare.map((c, i) => (
                <Text key={i} style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.inchiostro, lineHeight: 1.45, marginBottom: 2 }}>{`- ${c}`}</Text>
              ))}
              <View style={{ flexDirection: "row", marginTop: 6 }}>
                <LineaFirma tema={tema} etichetta="LUOGO E DATA" larghezza={150} altezza={30} />
                <View style={{ width: 16 }} />
                <LineaFirma tema={tema} etichetta="SECONDA FIRMA DEL COMMITTENTE" altezza={30} />
              </View>
            </View>
          ) : null}
        </Page>
      ) : null}

      {/* ─── Allegato: il modulo di recesso ────────────────────────────────
          Esce quando l'azienda lo accende nel modello (spento di serie): serve
          a chi firma con un privato a casa sua o a distanza (Allegato I, parte B,
          D.lgs. 206/2005), e allora va consegnato insieme al contratto. */}
      {modello.condizioniLegali.length > 0 && modello.conRecesso ? (
        <Page size="A4" style={pagina}>
          {cornice}
          <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1.6, marginBottom: 6 }}>ALLEGATO</Text>
          <TitoloAccento tema={tema} testo="Modulo di *recesso*." corpo={21} colore={tema.inchiostro} coloreAccento={tema.inchiostroMarca} />
          <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.grigio, lineHeight: 1.55, marginTop: 12 }}>
            {MODULO_RECESSO.istruzioni}
          </Text>

          <View style={{ marginTop: 16, borderWidth: 0.8, borderColor: tema.inchiostro, padding: 18 }}>
            <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.inchiostro, lineHeight: 1.6 }}>
              Destinatario: <Text style={{ fontFamily: tema.caratteri.forte }}>{dati.azienda.nome}</Text>
              {dati.azienda.indirizzo ? `, ${dati.azienda.indirizzo}` : ""}
              {dati.azienda.email ? ` — ${dati.azienda.email}` : ""}
            </Text>
            <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.inchiostro, lineHeight: 1.6, marginTop: 10 }}>
              {MODULO_RECESSO.dichiarazione(dati.codice)}
            </Text>
            <View style={{ marginTop: 14 }}>
              {MODULO_RECESSO.campi.map((e) => (
                <View key={e} style={{ marginBottom: 16 }}>
                  <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7.5, color: tema.grigio, letterSpacing: 0.8, marginBottom: 14 }}>{e.toUpperCase()}</Text>
                  <View style={{ borderTopWidth: 0.6, borderTopColor: tema.grigioChiaro }} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", marginTop: 6 }}>
              <LineaFirma tema={tema} etichetta={MODULO_RECESSO.firme[0].toUpperCase()} larghezza={150} altezza={28} />
              <View style={{ width: 16 }} />
              <LineaFirma tema={tema} etichetta={MODULO_RECESSO.firme[1].toUpperCase()} altezza={28} />
            </View>
          </View>
        </Page>
      ) : null}
    </Document>
  );
}

export default DocumentoEdilePDF;
