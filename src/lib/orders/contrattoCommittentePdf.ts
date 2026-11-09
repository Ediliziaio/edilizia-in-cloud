/**
 * Il PDF vero del contratto col committente (09/11/2026).
 *
 * Il testo lo scrive l'AI e in coda il sistema attacca le condizioni dell'azienda, parola per parola. Stampato così
 * le firme finivano a metà, prima delle condizioni. Qui si rimette in ordine: via le righe di firma dell'AI (le
 * disegna il foglio, in fondo) e un solo elenco delle clausole da approvare a parte, così la seconda firma c'è sempre.
 */
import { leggiTestoRiccoContratto, type RigaContratto } from "../../../supabase/functions/_shared/testoRiccoContratto";
import { TITOLO_CLAUSOLE_1341 } from "../../../supabase/functions/_shared/condizioniArchivio";

const eTitolo = (r: RigaContratto) => r.tipo === "h1" || r.tipo === "h2";
const eSezioneDaApprovare = (r: RigaContratto) => eTitolo(r) && /1341|approvare (specificamente|a parte)/i.test(r.testo);
/** «____», «[Firma del Committente]», «Luogo e data: …»: li disegna il foglio. */
const eRigaDiFirma = (r: RigaContratto) => {
  const t = r.testo.trim();
  return /^_{3,}$/.test(t) || /^\[?\s*firma\b[^\]]*\]?$/i.test(t) || /^luogo e data\b.{0,40}$/i.test(t);
};

/** Una riga con più pezzi di firma, spezzata dagli a-capo del testo, si pulisce pezzo per pezzo. */
function senzaFirme(r: RigaContratto): RigaContratto | null {
  const pezzi = r.testo.split("\n").filter((p) => !eRigaDiFirma({ ...r, testo: p }));
  if (!pezzi.join("").trim()) return null;
  return pezzi.length === r.testo.split("\n").length ? r : { ...r, testo: pezzi.join("\n").trim(), parti: undefined };
}

export function righeDelContratto(md: string | null | undefined): RigaContratto[] {
  const righe: RigaContratto[] = [];
  const daApprovare: string[] = [];
  let dentro = false;
  for (const originale of leggiTestoRiccoContratto(String(md ?? ""))) {
    if (eTitolo(originale)) dentro = eSezioneDaApprovare(originale);
    if (dentro) {
      if (originale.tipo === "li" && !daApprovare.includes(originale.testo)) daApprovare.push(originale.testo);
      continue;
    }
    const pulita = senzaFirme(originale);
    if (pulita) righe.push(pulita);
  }
  if (daApprovare.length) {
    righe.push({ tipo: "h2", testo: TITOLO_CLAUSOLE_1341 });
    for (const testo of daApprovare) righe.push({ tipo: "li", testo });
  }
  return righe;
}

/** Il contratto ha ancora dati da completare? Meglio dirlo prima che parta. */
export const contrattoDaCompletare = (md: string | null | undefined): boolean => /\[DA COMPLETARE\]/i.test(String(md ?? ""));
