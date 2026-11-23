import type { EsitoRiscontroDwg, RiscontroDwg } from "../../../shared/planimetrie/controlloDwg.ts";
import { areaPoligono, contornoIncrociato, distanza, interniSovrapposti } from "../../../shared/planimetrie/geometria.ts";
import type { Livello, Planimetria, Punto, StatoPianta } from "../../../shared/planimetrie/modello.ts";

function stessoContorno(a: Punto[], b: Punto[]) {
  return a.length === b.length && b.some((p, i) => distanza(p, a[0]) <= 0.02 &&
    [1, -1].some(verso => a.every((punto, j) => distanza(punto, b[(i + verso * j + b.length) % b.length]) <= 0.02)));
}

export function registraRiscontroDwg(documento: Planimetria, livelloId: string, id: string, stato: EsitoRiscontroDwg): Planimetria {
  const livello = documento.livelli.find(p => p.id === livelloId);
  const riscontro = livello?.controlloDwg?.find(r => r.id === id);
  if (!livello || !riscontro) throw new Error("Il riscontro DWG non è disponibile in questa versione.");
  if (riscontro.stato === stato) return documento;
  const cambiaContorno = riscontro.modifica && (riscontro.stato === "confermata") !== (stato === "confermata");
  const aggiornato = cambiaContorno ? aggiornaContorno(livello, riscontro.modifica, stato === "confermata") : livello;
  const nuovo = {
    ...aggiornato,
    controlloDwg: livello.controlloDwg!.map(r => r.id === id ? { ...r, stato } : r),
  };
  return { ...documento, livelli: documento.livelli.map(p => p.id === livelloId ? nuovo : p) };
}

function aggiornaContorno(livello: Livello, modifica: NonNullable<RiscontroDwg["modifica"]>, applica: boolean): Livello {
  const { localeId } = modifica;
  const atteso = applica ? modifica.prima : modifica.dopo;
  const nuovo = applica ? modifica.dopo : modifica.prima;
  const locale = livello.fatto.locali.find(l => l.id === localeId);
  if (!locale || !stessoContorno(locale.contorno, atteso)) {
    throw new Error("Il locale è stato modificato dopo l’importazione. Controlla il contorno attuale nell’editor prima di riprendere il riscontro.");
  }
  if (contornoIncrociato(nuovo) || areaPoligono(nuovo) <= 0) throw new Error("Il contorno proposto non chiude una superficie valida.");
  const aggiorna = <T extends StatoPianta>(pianta: T, nome: string): T => {
    const esistente = pianta.locali.find(l => l.id === localeId);
    if (!esistente || !stessoContorno(esistente.contorno, atteso)) return pianta;
    if (pianta.locali.some(l => l.id !== localeId && interniSovrapposti(l.contorno, nuovo)
      && !interniSovrapposti(l.contorno, atteso))) {
      throw new Error(`Il contorno proposto si sovrappone a un altro locale in «${nome}».`);
    }
    return {
      ...pianta,
      locali: pianta.locali.map(l => l.id === localeId
        ? { ...l, contorno: nuovo.map(p => ({ ...p })), origine: "stimata" } : l),
    };
  };
  return { ...livello, fatto: aggiorna(livello.fatto, "Stato di fatto"), proposte: livello.proposte.map(p => aggiorna(p, p.nome)) };
}
