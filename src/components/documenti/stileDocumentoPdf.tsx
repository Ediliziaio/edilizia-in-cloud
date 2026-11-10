/**
 * Lo stile unico dei documenti (10/11/2026) tradotto per react-pdf: testata, titolo di sezione, tabella, riquadro,
 * etichetta di stato, firme, piè e riga dei riferimenti. La specifica è in testa a
 * supabase/functions/_shared/stileDocumenti.ts: qui si usano le sue costanti, mai valori copiati a mano.
 *
 * Lo usano rendiconto, contratti (cliente e subappalto) e riepilogo commessa. NON i preventivi.
 */
import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PieSocietario } from "@/components/preventivi/pdf/FoglioCondizioniPDF";
import {
  accentoDocumento, colore, pagina, riquadro, sezione, tabella, testata,
} from "../../../supabase/functions/_shared/stileDocumenti";
import { margineInferiorePiede, misurePiede, personalizzazioneDocumento } from "../../../supabase/functions/_shared/personalizzazioneDocumenti";

export { colore, pagina, riquadro, sezione, tabella, testata };

const A4_ALTEZZA = 841.89;
const A4_LARGHEZZA = 595.28;
export const LARGHEZZA_UTILE = A4_LARGHEZZA - pagina.margineLaterale * 2;

/** L'accento del documento: il colore della veste, poi quello dell'azienda, poi il predefinito. */
export function accentoPdf(companyId: string | null | undefined, coloreAzienda?: string | null): string {
  return accentoDocumento({ coloreVeste: personalizzazioneDocumento(companyId).piedeColore, coloreAzienda });
}

/** Stili fissi (senza accento): pagina, tabella, riquadro, firme. */
export const st = StyleSheet.create({
  pagina: {
    fontFamily: "Helvetica", fontSize: pagina.corpo, lineHeight: pagina.interlinea, color: colore.inchiostro,
    backgroundColor: "#FFFFFF", paddingTop: pagina.margineAlto, paddingHorizontal: pagina.margineLaterale,
  },
  nota: { fontSize: pagina.nota, color: colore.testoTenue, lineHeight: 1.35 },
  bold: { fontFamily: "Helvetica-Bold" },

  // Tabella
  tTesta: { flexDirection: "row", backgroundColor: colore.fondoIntestazione, paddingVertical: 4 },
  tTestaTesto: {
    fontSize: tabella.intestazioneCorpo, fontFamily: "Helvetica-Bold", color: colore.testoTenue, textTransform: "uppercase",
    paddingHorizontal: tabella.paddingOrizzontale, lineHeight: 1.25,
  },
  tRiga: {
    flexDirection: "row", alignItems: "center", minHeight: tabella.altezzaRigaMin, paddingVertical: 3,
    borderBottomWidth: tabella.filetto, borderBottomColor: colore.linea,
  },
  tCella: { fontSize: tabella.corpo, color: colore.inchiostro, paddingHorizontal: tabella.paddingOrizzontale, lineHeight: 1.3 },
  tGruppo: {
    flexDirection: "row", alignItems: "center", minHeight: tabella.altezzaRigaMin, paddingVertical: 3,
    backgroundColor: colore.fondoTenue, borderBottomWidth: tabella.filetto, borderBottomColor: colore.linea,
  },
  tGruppoTesto: { fontSize: tabella.corpo, fontFamily: "Helvetica-Bold", color: colore.inchiostro, paddingHorizontal: tabella.paddingOrizzontale },
  tTotale: {
    flexDirection: "row", alignItems: "center", minHeight: tabella.altezzaRigaMin, paddingVertical: 3,
    borderTopWidth: tabella.filettoTotale, borderTopColor: colore.inchiostro,
  },
  tTotaleTesto: { fontSize: tabella.corpo, fontFamily: "Helvetica-Bold", color: colore.inchiostro, paddingHorizontal: tabella.paddingOrizzontale },
  destra: { textAlign: "right" },

  // Riquadro
  riquadro: {
    backgroundColor: colore.fondoTenue, borderWidth: riquadro.bordo, borderColor: colore.linea, borderStyle: "solid",
    borderRadius: riquadro.raggio, padding: riquadro.padding,
  },
  rEtichetta: { fontSize: riquadro.etichettaCorpo, color: colore.testoTenue, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  rValore: { fontSize: riquadro.valoreCorpo, color: colore.inchiostro, lineHeight: 1.35 },
  rNome: { fontSize: riquadro.valoreCorpo, fontFamily: "Helvetica-Bold", color: colore.inchiostro, marginBottom: 2, lineHeight: 1.3 },
  rRiga: { fontSize: tabella.corpo, color: colore.inchiostro, lineHeight: 1.4 },
  rNumero: { fontSize: riquadro.numeroCorpo, fontFamily: "Helvetica-Bold", color: colore.inchiostro, lineHeight: 1.2 },

  // Firme
  firme: { flexDirection: "row", gap: 30, marginTop: 30 },
  firma: { flex: 1, borderTopWidth: 0.5, borderTopColor: colore.inchiostro, paddingTop: 4, fontSize: pagina.nota, color: colore.testoTenue, textAlign: "center" },
});

/** Il logo della testata: quello della veste (Vulcano: grande) o quello di serie; proporzioni conservate. */
function misureLogo(companyId: string | null | undefined): { altezza: number; larghezza: number } {
  const veste = personalizzazioneDocumento(companyId);
  return {
    altezza: veste.logoAltezza ?? testata.logoAltezza,
    larghezza: veste.logoLarghezzaMax ?? testata.logoLarghezzaMax,
  };
}

/**
 * La testata: a sinistra il logo su bianco (o, senza logo, la ragione sociale), a destra titolo e sotto numero ·
 * data, l'eventuale etichetta di stato; sotto, a tutta larghezza, il filetto d'accento.
 */
export function TestataDocumento({ logo, ragioneSociale, titolo, sotto, stato, accento, companyId, fixed }: {
  logo?: string | null;
  ragioneSociale: string;
  titolo: string;
  /** Righe sotto il titolo: numero · data, periodo… */
  sotto?: Array<string | null | undefined | false>;
  stato?: string | null;
  accento: string;
  companyId?: string | null;
  /** Ripetuta su ogni foglio. */
  fixed?: boolean;
}) {
  const m = misureLogo(companyId);
  // «N. 1  ·  del 09/11» → «N. 1 · del 09/11»: gli spazi doppi andavano a capo male sotto il titolo.
  const righe = (sotto ?? []).filter((r): r is string => !!r).map((r) => r.replace(/\s+·\s+/g, " · "));
  return (
    <View fixed={fixed} style={{
      flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 16,
      paddingBottom: testata.filettoDistanza, borderBottomWidth: testata.filettoSpessore, borderBottomColor: accento,
      marginBottom: testata.spazioDopo,
    }}>
      <View style={{ maxWidth: m.larghezza, flexShrink: 0 }}>
        {logo
          ? <Image src={logo} style={{ maxHeight: m.altezza, maxWidth: m.larghezza, objectFit: "contain", objectPositionX: 0 }} />
          : <Text style={{ fontSize: testata.ragioneSocialeCorpo, fontFamily: "Helvetica-Bold", color: colore.inchiostro }}>{ragioneSociale}</Text>}
      </View>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={{ fontSize: testata.titoloCorpo, fontFamily: "Helvetica-Bold", color: colore.inchiostro, textAlign: "right", lineHeight: 1.2 }}>{titolo}</Text>
        {righe.map((r, i) => (
          <Text key={i} style={{ fontSize: testata.sottotitoloCorpo, color: colore.testoTenue, textAlign: "right", marginTop: i === 0 ? 3 : 1, lineHeight: 1.3 }}>{r}</Text>
        ))}
        {stato ? <View style={{ marginTop: 4 }}><Etichetta testo={stato} /></View> : null}
      </View>
    </View>
  );
}

/** Firmato, approvato, accettato: il solo stato col colore positivo. */
const STATO_POSITIVO = /firmat|approvat|accettat/i;

/** L'etichetta di stato: 7 pt grassetto maiuscolo, fondo tenue, bordo linea. */
export function Etichetta({ testo, positivo }: { testo: string; positivo?: boolean }) {
  const ok = positivo ?? STATO_POSITIVO.test(testo);
  return (
    <Text style={{
      fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3,
      paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3, backgroundColor: colore.fondoTenue,
      borderWidth: 0.75, borderColor: colore.linea, borderStyle: "solid", color: ok ? colore.positivo : colore.testoTenue,
    }}>{testo}</Text>
  );
}

/** Il titolo di sezione: 8 pt grassetto maiuscolo nell'accento, filetto sotto. */
export function TitoloSezione({ children, accento, primo, id }: { children: ReactNode; accento: string; primo?: boolean; id?: string }) {
  return (
    <View id={id} minPresenceAhead={40} style={{
      marginTop: primo ? 0 : sezione.spazioPrima, marginBottom: sezione.spazioDopo, paddingBottom: 3,
      borderBottomWidth: sezione.filetto, borderBottomColor: colore.linea,
    }}>
      <Text style={{ fontSize: sezione.corpo, fontFamily: "Helvetica-Bold", letterSpacing: sezione.spaziatura, textTransform: "uppercase", color: accento }}>{children}</Text>
    </View>
  );
}

/** Le firme: una riga d'inchiostro e sotto, 8 pt tenue, chi firma. */
export function Firme({ voci, style }: { voci: string[]; style?: Record<string, unknown> }) {
  return (
    <View style={[st.firme, style ?? {}]} wrap={false}>
      {voci.map((v, i) => v ? <Text key={i} style={st.firma}>{v}</Text> : <Text key={i} style={{ flex: 1 }} />)}
    </View>
  );
}

/** Altezza dal fondo del foglio dove comincia il piè societario di serie (righe centrate e pagina). */
function cimaPiedeSerie(righe: number): number {
  return 32 + 5 + righe * 9.5;
}

/**
 * Il piè di ogni foglio: quello della veste (Vulcano) o le righe societarie centrate 7 pt tenui, e «Pag. n / m».
 * `riferimento`: impronta, edizione, «stampato il»: una sola riga 6,5 pt sopra il piè.
 */
export function PiedeDocumento({ righe, companyId, riferimento }: { righe: string[]; companyId?: string | null; riferimento?: string | null }) {
  const veste = personalizzazioneDocumento(companyId);
  const m = misurePiede(veste, LARGHEZZA_UTILE);
  const cima = m ? m.ingombro : cimaPiedeSerie(righe.length);
  return (
    <>
      <PieSocietario righe={righe} margine={pagina.margineLaterale} colore={colore.testoTenue} companyId={companyId} />
      {riferimento ? (
        <Text fixed style={{
          position: "absolute", top: A4_ALTEZZA - cima - 12, left: pagina.margineLaterale, right: pagina.margineLaterale,
          fontSize: 6.5, color: colore.testoTenue, textAlign: "center",
        }}>{riferimento}</Text>
      ) : null}
    </>
  );
}

/** Il margine inferiore della pagina perché il contenuto resti sopra il piè (e la riga dei riferimenti). */
export function margineInferioreDocumento(companyId: string | null | undefined, righe: number, conRiferimento = false): number {
  const extra = conRiferimento ? 14 : 0;
  const veste = personalizzazioneDocumento(companyId);
  if (misurePiede(veste, LARGHEZZA_UTILE)) return margineInferiorePiede(companyId, 0, LARGHEZZA_UTILE) + extra;
  return Math.ceil(cimaPiedeSerie(righe) + 10 + extra);
}
