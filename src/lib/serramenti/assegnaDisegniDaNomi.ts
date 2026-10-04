/**
 * Dalla lista degli articoli di un'azienda, quali ricevono un tipo di disegno dal nome (e quali no, e perché).
 * Non scrive niente: la schermata «Assegna i disegni dai nomi» mostra la proposta e il titolare conferma.
 */
import { TIPOLOGIE_DISEGNO } from "./disegnoSerramento";
import { tipologiaDaNome } from "./tipologiaDaNome";

export type Esito = "proposto" | "gia_assegnato" | "non_riconosciuto";

export interface PropostaDisegno {
  id: string;
  nome: string;
  esito: Esito;
  /** Il tipo proposto (solo con esito «proposto»). */
  tipo: string | null;
  /** Come si legge il tipo per una persona. */
  etichetta: string | null;
}

interface ArticoloMinimo {
  id: string;
  nome: string;
  disegno_tipologia?: string | null;
  deleted_at?: string | null;
}

export function etichettaTipo(tipo: string): string {
  const t = TIPOLOGIE_DISEGNO.find((x) => x.id === tipo);
  if (t) return t.nome;
  if (tipo.startsWith("persiana:")) {
    const [, resto, variante] = tipo.split(":");
    const base = resto.replace(/_/g, " ");
    const v = variante ? ` (${variante.replace(/_/g, " ")})` : "";
    return `Persiana ${base}${v}`;
  }
  return tipo;
}

export function proponiDisegniDaNomi(articoli: ArticoloMinimo[]): PropostaDisegno[] {
  return articoli
    .filter((a) => !a.deleted_at)
    .map((a): PropostaDisegno => {
      if (a.disegno_tipologia) return { id: a.id, nome: a.nome, esito: "gia_assegnato", tipo: null, etichetta: etichettaTipo(a.disegno_tipologia) };
      const tipo = tipologiaDaNome(a.nome);
      if (!tipo) return { id: a.id, nome: a.nome, esito: "non_riconosciuto", tipo: null, etichetta: null };
      return { id: a.id, nome: a.nome, esito: "proposto", tipo, etichetta: etichettaTipo(tipo) };
    });
}
