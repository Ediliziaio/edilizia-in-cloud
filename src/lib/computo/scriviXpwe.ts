/**
 * Esportazione del preventivo con computo nel formato XPWE di ACCA PriMus
 * (29/10/2026), così un tecnico lo riapre in PriMus. Si scrive la stessa
 * struttura che legge `computoXpwe.ts`: capitoli come super categorie, elenco
 * prezzi (EPItem) e voci di computo (VCItem) con le righe di misura (RGItem).
 * Un file esportato si reimporta qui identico: lo prova il test di andata e ritorno.
 */
import { calcolaVoce, numeroEditor, quantitaMisura, type BozzaComputo } from "./editorNativo";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (nome: string, valore: string | number | null | undefined) => `<${nome}>${valore == null ? "" : esc(String(valore))}</${nome}>`;
const num = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "" : String(Math.round(n * 1e6) / 1e6));

export function scriviComputoXpwe(bozza: BozzaComputo, impresa = ""): string {
  const capitoli = [...new Set(bozza.voci.map(v => v.capitolo.trim() || "Opere edili"))];
  const idCapitolo = new Map(capitoli.map((c, k) => [c, k + 1]));
  const ep: string[] = [], vc: string[] = [];
  bozza.voci.forEach((v, k) => {
    const id = k + 1;
    const c = calcolaVoce(v);
    const righe = v.descrizione.trim().split("\n");
    ep.push(`<EPItem ID="${id}">${tag("TipoEP", 0)}${tag("Tariffa", v.tariffa.trim() || `NP.${String(id).padStart(3, "0")}`)}${tag("Articolo", "")}${tag("DesRidotta", righe[0].slice(0, 120))}${tag("DesBreve", righe[0].slice(0, 255))}${tag("DesEstesa", v.descrizione.trim())}${tag("UnMisura", v.unita)}${tag("Prezzo1", num(c.prezzo))}${tag("IDSpCap", 0)}${tag("IDCap", 0)}${tag("IDSbCap", 0)}${tag("Flags", 0)}</EPItem>`);
    const misure = v.misure.map((m, r) => {
      const q = quantitaMisura(m);
      const n = (s: string) => num(numeroEditor(s));
      return `<RGItem ID="${r + 1}">${tag("IDVV", -2)}${tag("Descrizione", m.descrizione || m.formula)}${tag("PartiUguali", n(m.parti))}${tag("Lunghezza", n(m.lunghezza))}${tag("Larghezza", n(m.larghezza))}${tag("HPeso", n(m.altezza))}${tag("Quantita", num(q))}${tag("Flags", 0)}</RGItem>`;
    }).join("");
    const segno = v.detrazione ? -1 : 1;
    vc.push(`<VCItem ID="${id}">${tag("IDEP", id)}${tag("Quantita", num(c.quantita == null ? null : segno * Math.abs(c.quantita)))}${tag("DataMis", "")}${tag("Flags", 0)}${tag("IDSpCat", idCapitolo.get(v.capitolo.trim() || "Opere edili"))}${tag("IDCat", 0)}${tag("IDSbCat", 0)}<PweVCMisure>${misure}</PweVCMisure></VCItem>`);
  });
  const categorie = capitoli.map((c, k) => `<DGSuperCategorieItem ID="${k + 1}">${tag("DesSintetica", c)}${tag("DesEstesa", c)}${tag("Codice", String(k + 1).padStart(2, "0"))}</DGSuperCategorieItem>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<PweDocumento>${tag("CopyRight", "Copyright ACCA software S.p.A.")}${tag("TipoDocumento", 1)}${tag("TipoFormato", "XMLPwe")}${tag("Versione", "")}${tag("SourceVersione", "Edilizia in Cloud")}
<PweDatiGenerali><PweDGProgetto><PweDGDatiGenerali>${tag("PercPrezzi", 0)}${tag("Comune", "")}${tag("Provincia", "")}${tag("Oggetto", bozza.oggetto.trim() || bozza.titolo.trim())}${tag("Committente", bozza.committente.trim())}${tag("Impresa", impresa)}${tag("ParteOpera", "")}</PweDGDatiGenerali></PweDGProgetto>
<PweDGCapitoliCategorie><PweDGSuperCategorie>${categorie}</PweDGSuperCategorie><PweDGCategorie></PweDGCategorie><PweDGSubCategorie></PweDGSubCategorie></PweDGCapitoliCategorie></PweDatiGenerali>
<PweMisurazioni><PweElencoPrezzi>${ep.join("")}</PweElencoPrezzi><PweVociComputo>${vc.join("")}</PweVociComputo></PweMisurazioni>
</PweDocumento>
`;
}
