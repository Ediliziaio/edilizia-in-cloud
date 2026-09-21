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
import { BLOCCHI, type ChiaveBlocco } from "../../../../supabase/functions/_shared/blocchiPreventivo";
import { MODULO_RECESSO } from "../../../../supabase/functions/_shared/condizioniStandard";
import { giorniDellaDurata, senzaNumeroDavanti, spezzaAccento } from "./testoDocumento";
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

// ─── Recensioni: la voce del cliente, in corsivo ─────────────────────────────
function Recensioni({ tema, voci }: { tema: TemaDocumento; voci: Array<{ autore: string; ruolo?: string | null; testo: string }> }) {
  const Voce = ({ r, largo }: { r: { autore: string; ruolo?: string | null; testo: string }; largo: boolean }) => (
    <View style={{ flexDirection: "row" }}>
      <Text style={{ fontFamily: tema.caratteri.testo, fontSize: largo ? 44 : 34, color: tema.tintaForte, width: largo ? 34 : 26, lineHeight: 0.9 }}>«</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: tema.caratteri.accento, fontSize: largo ? 12.5 : 11, color: tema.inchiostro, lineHeight: 1.45 }}>{r.testo}</Text>
        <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1, marginTop: 6 }}>
          {`${(r.autore || "Cliente").toUpperCase()}${r.ruolo ? `  ·  ${r.ruolo.toUpperCase()}` : ""}`}
        </Text>
      </View>
    </View>
  );
  const coppie: Array<typeof voci> = [];
  for (let i = 0; i < voci.length; i += 2) coppie.push(voci.slice(i, i + 2));
  return (
    <View style={{ marginTop: 10 }}>
      <TitolinoSezione tema={tema} testo="Cosa dicono i nostri clienti" />
      {voci.length === 1 ? (
        <View wrap={false} style={{ paddingVertical: 8 }}><Voce r={voci[0]} largo /></View>
      ) : (
        coppie.map((coppia, i) => (
          <View key={i} wrap={false} style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
            {coppia.map((r, j) => (
              <View key={j} style={{ width: (UTILE - 18) / 2, marginLeft: j === 0 ? 0 : 18 }}><Voce r={r} largo={false} /></View>
            ))}
          </View>
        ))
      )}
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
 * punti) meno titolo, sommario, voci e nota, stimati per eccesso dal numero di
 * caratteri, con un margine di sicurezza. Meglio 1-2 cm bianchi che una foto
 * troppo alta, che spingerebbe le voci su un'altra pagina.
 */
function altezzaFotoPiena(blocco: DocEdileBlocco, conEscluse = false): number {
  const righe = (testo: string, perRiga: number) => Math.max(1, Math.ceil(testo.length / perRiga));
  const titolo = righe(blocco.titolo.replace(/\*/g, ""), 32) * 23 * 1.2;
  const sommario = blocco.intro ? 6 + righe(blocco.intro, 72) * 10 * 1.45 : 0;
  const capitolo = 3 + 12 + titolo + sommario + 18;
  const altezzaVoci = (elenco: DocEdileBlocco["voci"]) => {
    const colonne = elenco.some((v) => v.testo) ? 2 : 3;
    let totale = 0;
    for (let i = 0; i < elenco.length; i += colonne) {
      const riga = elenco.slice(i, i + colonne);
      const alta = Math.max(22, ...riga.map((v) => colonne === 2
        ? 1 + righe(v.titolo, 36) * 9.5 * 1.3 + (v.testo ? 2 + righe(v.testo, 45) * 8.5 * 1.45 : 0)
        : 5 + righe(v.titolo, 21) * 9.5 * 1.3));
      totale += alta + (colonne === 2 ? 12 : 9);
    }
    return totale;
  };
  // «Cosa è compreso»: due titolini (compreso, non compreso) e le escluse.
  const voci = altezzaVoci(blocco.voci)
    + (conEscluse ? 22 + (blocco.escluse.length > 0 ? 10 + 22 + altezzaVoci(blocco.escluse) : 0) : 0);
  const nota = blocco.nota ? 14 : 0;
  const altezza = 649 - capitolo - voci - nota - 16 - 16;
  return Math.max(150, Math.min(430, Math.floor(altezza)));
}

/** Le voci di un blocco: icona in un cerchio di tinta, titolo, spiegazione. */
function VociBlocco({ tema, voci, attenuate = false }: { tema: TemaDocumento; voci: DocEdileBlocco["voci"]; attenuate?: boolean }) {
  // Con una spiegazione le voci stanno su due colonne; solo titoli, su tre.
  const colonne = voci.some((x) => x.testo) ? 2 : 3;
  const righe: DocEdileBlocco["voci"][] = [];
  for (let i = 0; i < voci.length; i += colonne) righe.push(voci.slice(i, i + colonne));
  const spazio = 14;
  const larghezza = (UTILE - spazio * (colonne - 1)) / colonne;
  return (
    <View>
      {righe.map((riga, r) => (
        <View key={r} wrap={false} style={{ flexDirection: "row", marginBottom: colonne === 2 ? 12 : 9 }}>
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

/** Un blocco della libreria come capitolo del documento (con `riempi`, su una pagina sua). */
function CapitoloBlocco({ tema, numero, chiave, blocco, riempi = false }: { tema: TemaDocumento; numero: number; chiave: ChiaveBlocco; blocco: DocEdileBlocco; riempi?: boolean }) {
  if (chiave === "compreso") {
    // Tutto insieme: segue il capitolo prima se ci sta, altrimenti va intero alla
    // pagina dopo. Diviso, il titolo restava da solo in fondo alla pagina del computo.
    // Con una foto (dal 22/09/2026 di serie per bagni e ristrutturazione) ha una
    // pagina sua, e la foto la riempie.
    return (
      <View wrap={false}>
        <Capitolo tema={tema} numero={numero} occhiello={blocco.occhiello} titolo={blocco.titolo} sommario={blocco.intro} />
        {riempi ? <FotoBlocco tema={tema} foto={blocco.foto} nota={blocco.nota} altezza={altezzaFotoPiena(blocco, true)} /> : null}
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
  return (
    <View>
      <Capitolo tema={tema} numero={numero} occhiello={blocco.occhiello} titolo={blocco.titolo} sommario={blocco.intro} />
      <FotoBlocco tema={tema} foto={blocco.foto} nota={blocco.nota} altezza={riempi ? altezzaFotoPiena(blocco) : undefined} />
      <VociBlocco tema={tema} voci={blocco.voci} />
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
  const haRecensioni = modello.testimonianze.length > 0;
  const haLavori = modello.galleriaLavori.length > 0 && visibile("lavori");
  // Le recensioni stanno accanto ai lavori finiti (la prova tutta insieme); senza
  // galleria, o con la galleria nascosta, restano in «Chi siamo».
  const recensioniCoiLavori = haRecensioni && haLavori;
  const haProgetto = (modello.esigenze.length > 0 || modello.soluzione.length > 0) && visibile("progetto");
  const haPercorso = modello.mostraPercorso && modello.percorso.length > 0;
  // La prima foto del progetto apre il capitolo «Il progetto»; le altre hanno il loro capitolo.
  const fotoApertura = haProgetto ? dati.fotoProgetto[0] ?? null : null;
  const fotoCapitolo = fotoApertura ? dati.fotoProgetto.slice(1) : dati.fotoProgetto;
  const haFoto = fotoCapitolo.length > 0;
  const haTempi = modello.mostraCronoprogramma && modello.cronoprogramma.length > 0;
  const haGaranzie = modello.mostraGaranzie && (modello.garanzie.length > 0 || modello.faq.length > 0);

  // Un capitolo esce se ha qualcosa da dire e se l'azienda non l'ha nascosto.
  const presente: Record<string, boolean> = {
    chiSiamo: haChiSiamo || haUsp || (haRecensioni && !recensioniCoiLavori),
    progetto: haProgetto,
    percorso: haPercorso,
    lavori: haLavori,
    foto: haFoto,
    // «Voce per voce» senza voci: a corpo il capitolo era una riga su una pagina
    // bianca. Il totale sta già nell'investimento.
    piano: oc.livello !== "corpo",
    investimento: true,
    garanzie: haGaranzie,
    tempi: haTempi,
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
    garanzie: "Garanzie e domande", tempi: "I tempi",
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
  const scorreIntero = (chiave: string) =>
    ["comeFunziona", "percorso", "protezione", "controlli", "compreso", "documenti", "diario"].includes(chiave)
    || (chiave === "tempi" && modello.cronoprogramma.length <= 8);

  // I segmenti: un blocco con le foto ha una pagina sua, il resto scorre.
  const conPaginaPropria = (chiave: string) => {
    const b = BLOCCHI.find((x) => x.chiave === chiave);
    return Boolean(b && modello.blocchi[b.chiave].foto.length > 0);
  };
  const segmenti: Array<{ propria: boolean; chiavi: string[] }> = [];
  for (const v of sequenza) {
    const ultimo = segmenti[segmenti.length - 1];
    if (conPaginaPropria(v.chiave)) segmenti.push({ propria: true, chiavi: [v.chiave] });
    else if (ultimo && !ultimo.propria) ultimo.chiavi.push(v.chiave);
    else segmenti.push({ propria: false, chiavi: [v.chiave] });
  }

  // I prossimi passi: la foto del lavoro finito, i passi, i contatti (o la firma).
  const chiusura = (
    <View wrap={false}>
      <Capitolo tema={tema} numero={numeroPassi} occhiello="I prossimi passi" titolo="Pronti a *partire*?" sommario={fraseValiditaChiusura(modello.testoValidita, modello.giorniValidita)} />
      {modello.fotoChiusura ? (
        <Image src={modello.fotoChiusura.src} style={{ width: UTILE, height: 330, objectFit: "cover", marginBottom: 18 }} />
      ) : null}
      <Passi
        tema={tema}
        voci={[
          { titolo: "Conferma", descrizione: "Firma questo documento, o rispondici anche solo con un messaggio." },
          { titolo: "Partenza lavori", descrizione: "Concordiamo insieme la data di inizio e il calendario definitivo." },
        ]}
      />
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

  // Il contenuto di ogni capitolo, con il suo numero nella sequenza scelta.
  const contenutoCapitolo = (chiave: string, numero: number, riempi = false): React.ReactNode => {
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
    if (blocco) return <CapitoloBlocco tema={tema} numero={numero} chiave={blocco.chiave} blocco={modello.blocchi[blocco.chiave]} riempi={riempi} />;
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
              <Schede tema={tema} voci={modello.usp} colonne={modello.usp.length % 3 === 0 || modello.usp.length > 4 ? 3 : 2} />
            </View>
          ) : null}
          {haRecensioni && !recensioniCoiLavori ? <Recensioni tema={tema} voci={modello.testimonianze} /> : null}
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
          {recensioniCoiLavori ? <Recensioni tema={tema} voci={modello.testimonianze} /> : null}
</>);
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
              <View key={cap.nome} wrap={false} style={{ flexDirection: "row", paddingVertical: 8, paddingHorizontal: 10, backgroundColor: i % 2 === 0 ? tema.tinta : tema.carta }}>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostroMarca, width: 30 }}>{dueCifre(i + 1)}</Text>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9.5, color: tema.inchiostro, flex: 1 }}>{cap.nome}</Text>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro }}>{formatCurrency(cap.subtotale)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View wrap={false}>
          <View style={{ alignSelf: "flex-end", width: 250 }}>
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

        {/* La validità sta nella fascia del prezzo, nei prossimi passi e nella pagina
            della firma. Qui, in una colonna sua, con un computo lungo il titolo
            restava in fondo alla pagina e la sua frase finiva da sola su un foglio
            bianco. Le modalità di pagamento non si staccano dal loro titolo. */}
        {modello.pagamentoHtml ? (
          <View style={{ marginTop: 24 }}>
            <View minPresenceAhead={48}>
              <TitolinoSezione tema={tema} testo="Modalità di pagamento" />
            </View>
            <TestoRicco tema={tema} html={modello.pagamentoHtml} stile={{ fontFamily: tema.caratteri.testo, fontSize: 9.5, color: tema.inchiostro, lineHeight: 1.5 }} />
          </View>
        ) : null}
</>);
      case "garanzie": return (          <View style={{ marginBottom: 28 }}>
            <Capitolo tema={tema} numero={numero} occhiello="Garanzie e domande" titolo="Più *certezze*, meno dubbi." />
            {modello.garanzie.length > 0 ? (
              <View style={{ marginBottom: 14 }}>
                <TitolinoSezione tema={tema} testo="Le nostre garanzie" />
                <Schede tema={tema} voci={modello.garanzie} colonne={modello.garanzie.length === 2 || modello.garanzie.length === 4 ? 2 : 3} />
              </View>
            ) : null}
            {modello.faq.length > 0 ? (
              <View>
                <TitolinoSezione tema={tema} testo="Domande frequenti" />
                {modello.faq.map((q, i) => (
                  <View key={i} wrap={false} style={{ paddingVertical: 8, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
                    <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, lineHeight: 1.3 }}>{q.domanda}</Text>
                    {q.risposta ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.grigio, marginTop: 3, lineHeight: 1.5 }}>{q.risposta}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>);
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
          <View style={{ marginTop: 30 }}>
            <TitolinoSezione tema={tema} testo="L'intervento in breve" />
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {dati.scheda.map((s, i) => (
                <View key={i} style={{ width: "50%", paddingVertical: 8, paddingRight: 16, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
                  <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7.5, color: tema.grigioChiaro, marginBottom: 2 }}>{s.etichetta}</Text>
                  <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 10.5, color: tema.inchiostro }}>{s.valore}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {inNumeri.length >= 2 ? (
          <View style={{ marginTop: 30 }} wrap={false}>
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

        <View style={{ marginTop: 30 }} wrap={false}>
          <TitolinoSezione tema={tema} testo="In questo documento" />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {sommario.map((v) => (
              <View key={v.numero} style={{ width: "50%", flexDirection: "row", alignItems: "flex-end", paddingVertical: 7, paddingRight: 16, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 16, color: tema.inchiostroMarca, width: 30, lineHeight: 1 }}>{dueCifre(v.numero)}</Text>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 10, color: tema.inchiostro }}>{v.titolo}</Text>
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
        <Page key={`blocco-${segmento.chiavi[0]}`} size="A4" style={pagina}>
          {cornice}
          {contenutoCapitolo(segmento.chiavi[0], numeroDi.get(segmento.chiavi[0]) ?? 0, true)}
        </Page>
      ) : (
        <Page key={`flusso-${s}`} size="A4" style={pagina}>
          {cornice}
          {/* Lo stacco sta in fondo al capitolo, e solo se quello dopo può continuare
              sulla stessa pagina (uno che scorre, o i prossimi passi senza foto). In
              cima a una pagina nuova un margine spingeva il titolo più in basso degli
              altri; in fondo a un capitolo che riempie la pagina, sbordava da solo su
              un foglio bianco. */}
          {segmento.chiavi.map((chiave, i) => {
            const scorre = i > 0 && scorreIntero(chiave);
            const prossimo = segmento.chiavi[i + 1];
            const chiudeQui = !prossimo && s === segmenti.length - 1 && !modello.fotoChiusura;
            const continua = prossimo ? scorreIntero(prossimo) : chiudeQui;
            return (
              <View key={chiave} break={i > 0 && !scorre} wrap={scorre ? false : undefined} style={continua ? { marginBottom: 30 } : undefined}>
                {contenutoCapitolo(chiave, numeroDi.get(chiave) ?? i + 1)}
              </View>
            );
          })}
          {/* Senza foto, i prossimi passi seguono l'ultimo capitolo. */}
          {s === segmenti.length - 1 && !modello.fotoChiusura ? chiusura : null}
        </Page>
      ))}

      {/* ─── I prossimi passi: con la foto del lavoro finito, una pagina sua ───
          La foto è alta quanto lasciano titolo, passi e contatti (649 punti utili,
          ~270 per il resto, con margine per un indirizzo lungo). Senza foto la
          chiusura segue l'ultimo capitolo; dopo un blocco con pagina sua, ha la sua. */}
      {modello.fotoChiusura || segmenti.length === 0 || segmenti[segmenti.length - 1].propria ? (
        <Page size="A4" style={pagina}>
          {cornice}
          {chiusura}
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
