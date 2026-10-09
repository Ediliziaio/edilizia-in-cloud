/** Catalogo geometrico comune a tutte le aziende e linee; non certifica la gamma di un produttore. */
import { TIPOLOGIE_DISEGNO, type TipologiaDisegno } from "./disegnoSerramento";
import { apertureDellaTipologia } from "./assiDisegno";

export function gruppoConfigurazione(t: TipologiaDisegno): string {
  if (t.forma) return "Sagome";
  if (t.monoblocco) return "Monoblocchi";
  if (t.ante.some((a) => a.tipo === "scorrevole" || a.tipo === "alzante_scorrevole")) return "Scorrevoli e alzanti";
  if (t.soglia) return "Porte finestra e portoncini";
  if (t.sopraluce || t.sottoluce) return "Finestre con sopraluce o sottoluce";
  return "Finestre";
}

export const GRUPPI_CONFIGURAZIONI = [...new Set(TIPOLOGIE_DISEGNO.map(gruppoConfigurazione))].map((titolo) => ({
  titolo,
  voci: TIPOLOGIE_DISEGNO.filter((t) => gruppoConfigurazione(t) === titolo).map((t) => [t.id, t.nome] as [string, string]),
}));

/** Payload del completamento: nessun prezzo, colore proprietario o prestazione termica inventata. */
export function configurazioniStandard() {
  return TIPOLOGIE_DISEGNO.map((t) => ({
    id: t.id,
    nome: t.nome,
    assi: [
      ...(apertureDellaTipologia(t.id).length ? [{ codice: "apertura", nome: "Apertura", valori: apertureDellaTipologia(t.id).map((a) => ({ codice: a.codice, nome: a.nome })) }] : []),
      ...(t.soglia ? [{ codice: "soglia", nome: "Soglia", valori: [{ codice: "con", nome: "Con soglia" }, { codice: "senza", nome: "Senza soglia" }] }] : []),
      ...(t.sopraluce ? [{ codice: "apertura_sopraluce", nome: "Sopraluce", valori: [{ codice: "fisso", nome: "Fisso" }, { codice: "vasistas", nome: "Apribile a vasistas" }] }] : []),
      { codice: "colore", nome: "Colore", valori: [{ codice: "standard", nome: "Colore standard da definire" }] },
      { codice: "tipologia_vetro", nome: "Tipologia vetro", valori: [{ codice: "standard", nome: "Vetro standard da definire" }] },
      { codice: "telaio", nome: "Telaio", valori: [{ codice: "telaio_a_l", nome: "Telaio a L" }, { codice: "telaio_a_z", nome: "Telaio a Z" }] },
    ],
  }));
}
