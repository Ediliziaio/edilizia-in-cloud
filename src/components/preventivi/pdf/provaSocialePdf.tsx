/**
 * Le prove nel «Piano dei lavori»: il voto su Google o Trustpilot, le parole dei
 * clienti, i sigilli delle garanzie, le domande frequenti. Disegnate qui, con le
 * stime d'altezza accanto (le usa il documento per sapere dove finisce una pagina):
 * chi cambia un corpo o un margine in un componente, lo cambia nella sua stima.
 *
 * Solo caratteri WinAnsi (vedi DocumentoEdilePDF): le stelle e i sigilli sono
 * disegni, non caratteri.
 */
import type * as React from "react";
import { Polygon, Svg, Text, View } from "@react-pdf/renderer";
import type { TemaDocumento } from "./temaDocumento";
import { IconaPdf } from "./IconaPdf";
import { altezzaTesto, type FamigliaPdf } from "./misuraTesto";
import { senzaNumeroDavanti } from "./testoDocumento";
import type { DocEdileFaq, DocEdileTestimonianza, DocEdileVoceElenco } from "./documentoEdileTipi";
import {
  ORO_STELLE, PUNTI_STELLA, indirizzoDaLeggere, recensioniScritte, stellePiene, votoScritto, type VotoOnline,
} from "../../../../supabase/functions/_shared/recensioniOnline";
import { contornoSigillo, durataDellaGaranzia, iconaDellaGaranzia } from "../../../../supabase/functions/_shared/sigilloGaranzia";

/**
 * REACT_PDF_GRUPPO_IN_TESTA — un gruppo che non si spezza (il titolo con la prima
 * riga) non va messo come primo figlio di un contenitore che si spezza, dentro un
 * altro che si spezza. Quando non ci sta in fondo alla pagina, react-pdf vede il
 * contenitore «vuoto su questa pagina» e ce lo lascia tutto: schiacciato nel poco
 * posto che resta, col testo uno sopra l'altro (preventivo Serramenti, 22/09/2026).
 * Per questo ParoleDeiClienti e Domande restituiscono i gruppi senza contenitore.
 */
const fam = (nome: string): FamigliaPdf =>
  (["Helvetica", "Helvetica-Bold", "Times-Roman", "Times-Bold", "Times-Italic"] as const).find((f) => f === nome) ?? "Helvetica";

/** Il grigio della parte vuota di una stella: si vede sul bianco e sulla carta calda. */
const STELLA_VUOTA = "#D5D9DF";

// ─── Le stelle: la parte piena è la stessa stella, tagliata ──────────────────
export function Stelle({ voto, lato = 11 }: { voto: number; lato?: number }) {
  const spazio = lato * 0.2;
  return (
    <View style={{ flexDirection: "row" }}>
      {stellePiene(voto).map((pieno, i) => (
        <View key={i} style={{ width: lato, height: lato, marginRight: i < 4 ? spazio : 0 }}>
          <Svg width={lato} height={lato} viewBox="0 0 24 24">
            <Polygon points={PUNTI_STELLA} fill={STELLA_VUOTA} />
          </Svg>
          {pieno > 0 ? (
            <View style={{ position: "absolute", left: 0, top: 0, width: lato * pieno, height: lato, overflow: "hidden" }}>
              <Svg width={lato} height={lato} viewBox="0 0 24 24">
                <Polygon points={PUNTI_STELLA} fill={ORO_STELLE} />
              </Svg>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ─── Il voto sulle piattaforme ────────────────────────────────────────────────
const meseAnno = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
};

/** La data più vecchia fra quelle dei voti: la nota sotto non dice più di così. */
function aggiornatiA(voti: VotoOnline[]): string | null {
  const date = voti.map((v) => v.aggiornato).filter((d): d is string => Boolean(d)).sort();
  return meseAnno(date[0] ?? null);
}

export function VotiOnline({ tema, voti, larghezza }: { tema: TemaDocumento; voti: VotoOnline[]; larghezza: number }) {
  if (!voti.length) return null;
  const quando = aggiornatiA(voti);
  const nota = `Voti e numero di recensioni come compaiono sulle piattaforme${quando ? `, a ${quando}` : ""}.`;
  if (voti.length === 1) {
    const v = voti[0];
    const conta = recensioniScritte(v.numero);
    const indirizzo = indirizzoDaLeggere(v.link, 60);
    return (
      <View wrap={false} style={{ marginBottom: 22 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: tema.cartaCalda, borderLeftWidth: 3, borderLeftColor: tema.fondo, paddingVertical: 14, paddingHorizontal: 18 }}>
          <View style={{ width: 150 }}>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7.5, color: tema.inchiostroMarca, letterSpacing: 1.4 }}>{v.nome.toUpperCase()}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6 }}>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 32, color: tema.inchiostro, lineHeight: 1 }}>{votoScritto(v.voto)}</Text>
              <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 10, color: tema.grigio, marginLeft: 4, marginBottom: 4 }}>su 5</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Stelle voto={v.voto} lato={15} />
            {conta ? <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, marginTop: 7 }}>{conta}</Text> : null}
            {indirizzo ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8, color: tema.grigio, marginTop: 2 }}>{indirizzo}</Text> : null}
          </View>
        </View>
        <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, marginTop: 5 }}>{nota}</Text>
      </View>
    );
  }
  const spazio = 12;
  const larga = (larghezza - spazio * (voti.length - 1)) / voti.length;
  return (
    <View wrap={false} style={{ marginBottom: 22 }}>
      <View style={{ flexDirection: "row" }}>
        {voti.map((v, i) => {
          const conta = recensioniScritte(v.numero);
          const indirizzo = indirizzoDaLeggere(v.link, voti.length === 2 ? 40 : 26);
          return (
            <View key={i} style={{ width: larga, marginLeft: i === 0 ? 0 : spazio, backgroundColor: tema.cartaCalda, borderTopWidth: 2, borderTopColor: tema.fondo, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 13 }}>
              <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7.5, color: tema.inchiostroMarca, letterSpacing: 1.4 }}>{v.nome.toUpperCase()}</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 7 }}>
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 28, color: tema.inchiostro, lineHeight: 1 }}>{votoScritto(v.voto)}</Text>
                <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9, color: tema.grigio, marginLeft: 4, marginBottom: 3 }}>su 5</Text>
              </View>
              <View style={{ marginTop: 7 }}><Stelle voto={v.voto} lato={12} /></View>
              {conta ? <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 8.5, color: tema.inchiostro, marginTop: 7 }}>{conta}</Text> : null}
              {indirizzo ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7.5, color: tema.grigio, marginTop: 2 }}>{indirizzo}</Text> : null}
            </View>
          );
        })}
      </View>
      <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 7, color: tema.grigioChiaro, marginTop: 5 }}>{nota}</Text>
    </View>
  );
}

export function stimaVotiOnline(voti: VotoOnline[]): number {
  if (!voti.length) return 0;
  const nota = 5 + 7 * 1.2;
  if (voti.length === 1) {
    const v = voti[0];
    const destra = 15 + (v.numero != null ? 7 + 9.5 * 1.2 : 0) + (v.link ? 2 + 8 * 1.2 : 0);
    return 28 + Math.max(7.5 * 1.2 + 6 + 32, destra) + nota + 22;
  }
  const alta = Math.max(...voti.map((v) => 12 + 7.5 * 1.2 + 7 + 28 + 7 + 12 + (v.numero != null ? 7 + 8.5 * 1.2 : 0) + (v.link ? 2 + 7.5 * 1.2 : 0) + 13));
  return alta + nota + 22;
}

// ─── Le parole dei clienti ────────────────────────────────────────────────────
/** Il testo senza le virgolette che l'azienda ha già scritto: le mette il documento. */
const senzaVirgolette = (t: string) => t.trim().replace(/^[«"“„']+\s*/, "").replace(/\s*[»"”']+$/, "");

const firmaDi = (r: DocEdileTestimonianza) =>
  `${(r.autore || "Cliente").toUpperCase()}${r.ruolo ? `  ·  ${r.ruolo.toUpperCase()}` : ""}`;

/** La prima grande se sono dispari, le altre a coppie. */
function righeDiCitazioni(voci: DocEdileTestimonianza[]): DocEdileTestimonianza[][] {
  const righe: DocEdileTestimonianza[][] = [];
  let i = 0;
  if (voci.length % 2 === 1) { righe.push([voci[0]]); i = 1; }
  for (; i < voci.length; i += 2) righe.push(voci.slice(i, i + 2));
  return righe;
}

const SPAZIO_CITAZIONI = 22;
const corpoCitazione = (sola: boolean) => (sola ? 13 : 11);

/**
 * Le parole dei clienti a righe (la prima grande se sono dispari). `testa` (il titolo
 * del capitolo, il voto online) sta sempre con la prima riga: un titolo solo in fondo
 * alla pagina, con le recensioni su quella dopo, non si legge.
 */
export function ParoleDeiClienti({ tema, voci, larghezza, testa }: {
  tema: TemaDocumento; voci: DocEdileTestimonianza[]; larghezza: number; testa?: React.ReactNode;
}) {
  const righe = righeDiCitazioni(voci);
  const riga = (r: DocEdileTestimonianza[], k: number) => {
    const sola = r.length === 1;
    const larga = sola ? larghezza : (larghezza - SPAZIO_CITAZIONI) / 2;
    return (
      <View key={k} wrap={false} style={{ flexDirection: "row", marginBottom: 20 }}>
        {r.map((v, i) => (
          <View key={i} style={{ width: larga, marginLeft: i === 0 ? 0 : SPAZIO_CITAZIONI, borderLeftWidth: 2, borderLeftColor: tema.tintaForte, paddingLeft: 14, paddingVertical: 2 }}>
            {v.voto ? <View style={{ marginBottom: 7 }}><Stelle voto={v.voto} lato={9} /></View> : null}
            <Text style={{ fontFamily: tema.caratteri.accento, fontSize: corpoCitazione(sola), color: tema.inchiostro, lineHeight: 1.45 }}>
              {`«${senzaVirgolette(v.testo)}»`}
            </Text>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 7, color: tema.inchiostroMarca, letterSpacing: 1, marginTop: 8, lineHeight: 1.4 }}>{firmaDi(v)}</Text>
          </View>
        ))}
      </View>
    );
  };
  // Senza un contenitore in mezzo (vedi REACT_PDF_GRUPPO_IN_TESTA).
  return (
    <>
      <View wrap={false}>
        {testa}
        {righe[0] ? riga(righe[0], 0) : null}
      </View>
      {righe.slice(1).map((r, k) => riga(r, k + 1))}
    </>
  );
}

export function stimaParoleDeiClienti(tema: TemaDocumento, voci: DocEdileTestimonianza[], larghezza: number): number {
  let totale = 0;
  for (const riga of righeDiCitazioni(voci)) {
    const sola = riga.length === 1;
    const interna = (sola ? larghezza : (larghezza - SPAZIO_CITAZIONI) / 2) - 16;
    totale += 20 + 4 + Math.max(...riga.map((v) => (v.voto ? 9 + 7 : 0)
      + altezzaTesto(`«${senzaVirgolette(v.testo)}»`, interna, fam(tema.caratteri.accento), corpoCitazione(sola), 1.45)
      + 8 + altezzaTesto(firmaDi(v), interna, fam(tema.caratteri.forte), 7, 1.4)));
  }
  return totale;
}

// ─── Il sigillo di una garanzia: gli anni, o l'icona ─────────────────────────
export function SigilloGaranzia({ tema, titolo, descrizione, lato = 42 }: { tema: TemaDocumento; titolo: string; descrizione?: string | null; lato?: number }) {
  const durata = durataDellaGaranzia(titolo, descrizione);
  const r = lato / 2;
  return (
    <View style={{ width: lato, height: lato }}>
      <Svg width={lato} height={lato} viewBox={`0 0 ${lato} ${lato}`}>
        <Polygon points={contornoSigillo(r)} fill={tema.fondo} />
      </Svg>
      {/* L'anello interno: un cerchio bianco appena più piccolo, con dentro il colore. */}
      <View style={{ position: "absolute", left: lato * 0.16, top: lato * 0.16, width: lato * 0.68, height: lato * 0.68, borderRadius: lato * 0.34, borderWidth: 0.7, borderColor: tema.tintaForte }} />
      <View style={{ position: "absolute", left: 0, top: 0, width: lato, height: lato, alignItems: "center", justifyContent: "center" }}>
        {durata ? (
          <>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: durata.numero >= 10 ? lato * 0.3 : lato * 0.34, color: tema.bianco, lineHeight: 1 }}>{String(durata.numero)}</Text>
            <Text style={{ fontFamily: tema.caratteri.forte, fontSize: lato * 0.125, color: tema.bianco, letterSpacing: 0.6, marginTop: 1 }}>{durata.unita}</Text>
          </>
        ) : (
          <IconaPdf nome={iconaDellaGaranzia(titolo, descrizione)} colore={tema.bianco} lato={lato * 0.42} />
        )}
      </View>
    </View>
  );
}

/** Le garanzie in schede, ciascuna col suo sigillo. */
export function SchedeGaranzie({ tema, voci, colonne, larghezza }: { tema: TemaDocumento; voci: DocEdileVoceElenco[]; colonne: 2 | 3; larghezza: number }) {
  const righe: DocEdileVoceElenco[][] = [];
  for (let i = 0; i < voci.length; i += colonne) righe.push(voci.slice(i, i + colonne));
  const spazio = 10;
  return (
    <View>
      {righe.map((riga, r) => {
        // L'ultima riga si divide tutta la larghezza, come nelle altre schede.
        const larga = (larghezza - spazio * (riga.length - 1)) / riga.length;
        return (
          <View key={r} wrap={false} style={{ flexDirection: "row", marginBottom: spazio }}>
            {riga.map((v, i) => (
              <View key={i} style={{ width: larga, marginLeft: i === 0 ? 0 : spazio, backgroundColor: tema.cartaCalda, borderTopWidth: 2, borderTopColor: tema.fondo, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 }}>
                <SigilloGaranzia tema={tema} titolo={v.titolo} descrizione={v.descrizione} />
                <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 9.5, color: tema.inchiostro, lineHeight: 1.3, marginTop: 9 }}>{senzaNumeroDavanti(v.titolo)}</Text>
                {v.descrizione ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 8.5, color: tema.grigio, marginTop: 3, lineHeight: 1.45 }}>{v.descrizione}</Text> : null}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function stimaSchedeGaranzie(tema: TemaDocumento, voci: DocEdileVoceElenco[], colonne: 2 | 3, larghezza: number): number {
  let totale = 0;
  for (let i = 0; i < voci.length; i += colonne) {
    const riga = voci.slice(i, i + colonne);
    const interna = (larghezza - 10 * (riga.length - 1)) / riga.length - 24;
    const alte = riga.map((v) => 12 + 42 + 9
      + altezzaTesto(senzaNumeroDavanti(v.titolo), interna, fam(tema.caratteri.forte), 9.5, 1.3)
      + (v.descrizione ? 3 + altezzaTesto(v.descrizione, interna, fam(tema.caratteri.testo), 8.5, 1.45) : 0) + 12);
    totale += Math.max(...alte) + 10;
  }
  return totale;
}

// ─── Le domande frequenti: numerate, una sotto l'altra ───────────────────────
// Si spezzano fra due pagine una domanda per volta, come le righe del computo: il
// titolo del capitolo resta sempre con la prima (`testa`).
const dueCifre = (n: number) => String(n).padStart(2, "0");

function Domanda({ tema, q, i }: { tema: TemaDocumento; q: DocEdileFaq; i: number }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 0.6, borderBottomColor: tema.filetto }}>
      <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 15, color: tema.inchiostroMarca, width: 32, lineHeight: 1 }}>{dueCifre(i + 1)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: tema.caratteri.forte, fontSize: 10.5, color: tema.inchiostro, lineHeight: 1.3 }}>{q.domanda}</Text>
        {q.risposta ? <Text style={{ fontFamily: tema.caratteri.testo, fontSize: 9.5, color: tema.grigio, marginTop: 4, lineHeight: 1.5 }}>{q.risposta}</Text> : null}
      </View>
    </View>
  );
}

export function Domande({ tema, voci, testa }: { tema: TemaDocumento; voci: DocEdileFaq[]; testa?: React.ReactNode }) {
  if (!voci.length) return <>{testa}</>;
  const [prima, ...altre] = voci;
  // Senza un contenitore in mezzo (vedi REACT_PDF_GRUPPO_IN_TESTA).
  return (
    <>
      <View wrap={false}>
        {testa}
        <Domanda tema={tema} q={prima} i={0} />
      </View>
      {altre.map((q, i) => (
        <View key={i} wrap={false}><Domanda tema={tema} q={q} i={i + 1} /></View>
      ))}
    </>
  );
}

/** L'altezza di ogni domanda, per sapere dove finisce il capitolo quando si spezza. */
export function altezzeDomande(tema: TemaDocumento, voci: DocEdileFaq[], larghezza: number): number[] {
  const larga = larghezza - 32;
  return voci.map((q) => 20.6 + Math.max(15,
    altezzaTesto(q.domanda, larga, fam(tema.caratteri.forte), 10.5, 1.3)
    + (q.risposta ? 4 + altezzaTesto(q.risposta, larga, fam(tema.caratteri.testo), 9.5, 1.5) : 0)));
}

export function stimaDomande(tema: TemaDocumento, voci: DocEdileFaq[], larghezza: number): number {
  return altezzeDomande(tema, voci, larghezza).reduce((t, h) => t + h, 0);
}
