import type { FamilyWithAxes } from "@/types/articleFamily";
import type { CategoriaListino, MacroListino } from "./lineeListino";

export interface ModelloDaRiordinare {
  macroId: string;
  categoriaId: string;
  nome: string;
}

export interface PianoRiordinoModelli {
  companyId: string;
  serramenti: MacroListino;
  modelli: ModelloDaRiordinare[];
  /** Associazioni esplicite: nessuna deduzione di compatibilità dal nome. */
  assegnazioni: Record<string, { macroId: string; categoriaId: string }>;
  categorieAggiuntive?: CategoriaListino[];
  /** Mantiene riconoscibile la serie anche nella descrizione del preventivo/PDF. */
  scriviModelloInDescrizione?: boolean;
}

/** Riordina i collegamenti e può esplicitare il modello nella descrizione.
 * ID, prezzi, griglie, assi e opzioni restano quelli originali. */
export function riordinaModelli(
  catalogo: { famiglie: FamilyWithAxes[]; macrocategorie: MacroListino[]; categorie: CategoriaListino[] },
  piano: PianoRiordinoModelli,
) {
  if (catalogo.famiglie.some(f => f.company_id !== piano.companyId)) {
    throw new Error("Il riordino deve contenere una sola azienda.");
  }
  const macroIds = new Set(piano.modelli.map(m => m.macroId));
  if (macroIds.size !== piano.modelli.length || new Set(piano.modelli.map(m => m.categoriaId)).size !== piano.modelli.length) {
    throw new Error("Ogni modello deve avere un'associazione univoca.");
  }
  if (macroIds.has(piano.serramenti.id)) throw new Error("Il gruppo Serramenti deve essere distinto dalle serie.");
  const modelli = new Map(piano.modelli.map(m => [m.macroId, m]));
  const categorieModelli = piano.modelli.map((m, i) => ({
    id: m.categoriaId, nome: m.nome, macrocategoria_id: piano.serramenti.id, sort_order: i * 10,
  }));
  const nuoveCategorie = [...categorieModelli, ...(piano.categorieAggiuntive ?? [])];
  if (nuoveCategorie.some(c => catalogo.categorie.some(old => old.id === c.id && (old.nome !== c.nome || old.macrocategoria_id !== c.macrocategoria_id)))) {
    throw new Error("Una nuova categoria usa un identificativo già presente.");
  }
  const categorie = [...catalogo.categorie, ...nuoveCategorie.filter(c=>!catalogo.categorie.some(old=>old.id===c.id))];
  const macroDestinazione = new Set([...catalogo.macrocategorie.map(m => m.id), piano.serramenti.id]);
  const famiglie = catalogo.famiglie.map(f => {
    const modello = f.macrocategoria_id ? modelli.get(f.macrocategoria_id) : undefined;
    const destinazione = piano.assegnazioni[f.id] ?? (modello ? {
      macroId: piano.serramenti.id, categoriaId: modello.categoriaId,
    } : undefined);
    if (!destinazione) return f;
    if (!macroDestinazione.has(destinazione.macroId) || !categorie.some(c => c.id === destinazione.categoriaId && c.macrocategoria_id === destinazione.macroId)) {
      throw new Error(`Destinazione non valida per ${f.id}.`);
    }
    const modelloDestinazione = piano.modelli.find(m => m.categoriaId === destinazione.categoriaId);
    const descrizione = piano.scriviModelloInDescrizione && modelloDestinazione && !f.descrizione?.split('\n').includes(`Modello: ${modelloDestinazione.nome}`)
      ? [f.descrizione, `Modello: ${modelloDestinazione.nome}`].filter(Boolean).join("\n")
      : f.descrizione;
    return { ...f, descrizione, macrocategoria_id: destinazione.macroId, categoria_id: destinazione.categoriaId };
  });
  const macrocategorie = catalogo.macrocategorie.map(m => macroIds.has(m.id) && !famiglie.some(f => f.macrocategoria_id === m.id)
    ? { ...m, attivo: false, verticali_abilitati: [], tipologia: null }
    : m);
  return { famiglie, macrocategorie: [...macrocategorie.filter(m=>m.id!==piano.serramenti.id), piano.serramenti], categorie };
}
