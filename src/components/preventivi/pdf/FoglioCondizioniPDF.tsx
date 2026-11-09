/**
 * Il foglio delle condizioni: uguale per tutti i documenti e per tutte le aziende (09/11/2026).
 *
 * Florin: «togli il titolo grande e il logo, fallo più semplice, che sia standard per tutti». Niente
 * intestazione, niente etichette, un solo carattere: i titoli delle clausole, il testo, e in fondo a ogni
 * pagina i dati societari dell'azienda. Le dimensioni e i font scelti a mano nell'editor qui non contano.
 */
import { Document, Page, Text, View, pdf } from "@react-pdf/renderer";
import type { RigaContratto } from "../../../../supabase/functions/_shared/testoRiccoContratto";
import { clausoleDaApprovare, perArticoli, righeDaStampare } from "../../../../supabase/functions/_shared/condizioniStandard";
import { TestoContrattoPdf } from "./TestoContrattoPdf";
import { fontPiedeRegistrato } from "./fontPiede";
import { personalizzazioneDocumento } from "../../../../supabase/functions/_shared/personalizzazioneDocumenti";

const MARGINE = 50;
const GRIGIO = "#6B7280";
const INCHIOSTRO = "#1F2937";
const A4_ALTEZZA = 841.89;

/**
 * Il piè di pagina di ogni documento: i dati societari centrati, in alto, e sotto il numero di pagina
 * (Florin, 09/11/2026). `fixed`: su ogni foglio.
 */
export function PieSocietario({ righe, font: fontBase = "Helvetica", margine = MARGINE, colore: coloreBase = GRIGIO, companyId }: {
  righe: string[]; font?: string; margine?: number; colore?: string;
  /** L'azienda del documento: carattere e colore propri, se ne ha (personalizzazioneDocumenti). */
  companyId?: string | null;
}) {
  const veste = personalizzazioneDocumento(companyId);
  const font = veste.piedeFont ? fontPiedeRegistrato(veste.piedeFont) : fontBase;
  const colore = veste.piedeColore ?? coloreBase;
  // Posizioni e altezze scritte: con `bottom` su un contenuto che scorre più fogli il piè finiva fuori pagina, e un
  // numero di pagina dentro il riquadro restava senza spazio e non si stampava.
  const altezzaDati = 5 + righe.length * 9.5;
  const cimaDati = A4_ALTEZZA - 32 - altezzaDati;
  return (
    <>
      <View fixed style={{ position: "absolute", top: cimaDati, height: altezzaDati, left: margine, right: margine, borderTopWidth: 0.5, borderTopColor: "#D1D5DB", paddingTop: 5 }}>
        {righe.map((r, i) => <Text key={i} style={{ fontFamily: font, fontSize: 7, color: colore, lineHeight: 1.35, textAlign: "center" }}>{r}</Text>)}
      </View>
      <Text fixed style={{ position: "absolute", top: A4_ALTEZZA - 29, left: margine, right: margine, fontFamily: font, fontSize: 7, color: colore, textAlign: "center" }}
        render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
    </>
  );
}

/** Via carattere, dimensione e colore messi a mano: restano grassetto, corsivo e sottolineato. */
function rigaStandard(r: RigaContratto): RigaContratto {
  return { ...r, interlinea: undefined, spazioDopo: undefined, parti: r.parti?.map((p) => ({ ...p, stile: { grassetto: p.stile.grassetto, corsivo: p.stile.corsivo, sottolineato: p.stile.sottolineato, barrato: p.stile.barrato } })) };
}

export function CorpoFoglio({ righe, font = "Helvetica" }: { righe: RigaContratto[]; font?: string }) {
  return (
    <>
      {perArticoli(righe).map((gruppo, g) => (
        <View key={g} wrap minPresenceAhead={36}>
          {gruppo.map((r, i) => <TestoContrattoPdf key={i} riga={rigaStandard(r)} prima={g === 0 && i === 0} font={font} colore={INCHIOSTRO} dimensione={9.5} />)}
        </View>
      ))}
    </>
  );
}

export interface FirmeFoglio { sinistra: string; destra: string }

function RigaFirme({ sinistra, destra }: { sinistra: string; destra: string }) {
  const firma = { flex: 1, borderTopWidth: 0.75, borderTopColor: "#374151", paddingTop: 4, textAlign: "center", fontSize: 8.5, fontFamily: "Helvetica", color: INCHIOSTRO } as const;
  return (
    <View style={{ flexDirection: "row", gap: 30, marginTop: 34 }}>
      {sinistra ? <Text style={firma}>{sinistra}</Text> : <Text style={{ flex: 1 }} />}
      <Text style={firma}>{destra}</Text>
    </View>
  );
}

export function FoglioCondizioniPDF({ titolo, autore, righe, societarie, firme, conTitolo = false, companyId }: {
  /** Solo nelle proprietà del file: sul foglio non si scrive. */
  titolo: string; autore?: string;
  righe: RigaContratto[];
  societarie: string[];
  /** Per i documenti che si firmano: le due firme e, se ci sono, le clausole da approvare a parte. */
  firme?: FirmeFoglio;
  /** Un contratto si apre col suo titolo («Contratto di appalto»); le sole condizioni no. */
  conTitolo?: boolean;
  companyId?: string | null;
}) {
  const daApprovare = firme ? clausoleDaApprovare(righe) : [];
  const corpo = righeDaStampare(righe, { conRiquadroFirma: daApprovare.length > 0 });
  const testo = conTitolo && righe[0]?.tipo === "h1" ? [righe[0], ...corpo] : corpo;
  return (
    <Document title={titolo} author={autore} producer="Edilizia in Cloud">
      <Page size="A4" style={{ paddingTop: 48, paddingBottom: 72, paddingHorizontal: MARGINE, fontFamily: "Helvetica" }}>
        <PieSocietario righe={societarie} companyId={companyId} />
        <CorpoFoglio righe={testo} />
        {firme && (
          <View wrap={false}>
            <Text style={{ marginTop: 26, fontSize: 8.5, fontFamily: "Helvetica", color: INCHIOSTRO }}>Luogo e data ______________________________</Text>
            <RigaFirme sinistra={firme.sinistra} destra={firme.destra} />
          </View>
        )}
        {daApprovare.length > 0 && firme && (
          <View wrap={false}>
            <Text style={{ marginTop: 22, fontSize: 8.5, fontFamily: "Helvetica", color: INCHIOSTRO, lineHeight: 1.4 }}>
              {`Ai sensi degli artt. 1341 e 1342 c.c. si approvano specificamente le seguenti clausole: ${daApprovare.join("; ")}.`}
            </Text>
            <RigaFirme sinistra="" destra={firme.destra} />
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function foglioCondizioniBlob(p: Parameters<typeof FoglioCondizioniPDF>[0]): Promise<Blob> {
  return pdf(<FoglioCondizioniPDF {...p} />).toBlob();
}
