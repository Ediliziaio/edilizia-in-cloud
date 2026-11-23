/**
 * Bolla registrata a mano, originale allegato: cosa la lettura dell'originale aggiunge (23/11/2026).
 * Una bolla di calcestruzzo era stata scritta a mano con una sola riga, senza «INTEGRAZIONE
 * VIAGGIO», targa e autista che sulla carta c'erano. Qui si propone SOLO quello che manca: una
 * riga già scritta (stesso codice, stessa descrizione, o stesso calcestruzzo) non si duplica, un
 * campo già compilato non si tocca. Chi ha scritto ha ragione.
 */
import type { DDTRiga, DDTRigaNuova } from "@/hooks/useDDTRicezione";
import type { LetturaDDT } from "./letturaAI";
import { soloAlfanumerico } from "../../../shared/acquisti/normalizza";
import { chiaveCalcestruzzo } from "../../../shared/acquisti/prezziListino";

export interface TestataBolla {
  targa_mezzo?: string | null;
  autista_nome?: string | null;
  corriere?: string | null;
  // Larghi come arrivano dalla bolla salvata: qui conta solo se sono vuoti.
  trasporto_a_cura_di?: string | null;
  porto?: string | null;
}

export interface Completamento {
  righe: DDTRigaNuova[];
  campi: Partial<TestataBolla>;
}

const stessaRiga = (a: Pick<DDTRiga, "codice_articolo" | "descrizione">, b: Pick<DDTRigaNuova, "codice_articolo" | "descrizione">) => {
  const ca = soloAlfanumerico(a.codice_articolo), cb = soloAlfanumerico(b.codice_articolo);
  if (ca && cb && ca === cb) return true;
  const da = soloAlfanumerico(a.descrizione), dbb = soloAlfanumerico(b.descrizione);
  if (da && da === dbb) return true;
  const ka = chiaveCalcestruzzo(a.descrizione ?? "");
  return !!ka && ka === chiaveCalcestruzzo(b.descrizione ?? "");
};

export function completaBolla(letta: LetturaDDT, righe: Array<Pick<DDTRiga, "codice_articolo" | "descrizione" | "posizione">>, testata: TestataBolla): Completamento {
  let posizione = righe.reduce((m, r) => Math.max(m, r.posizione ?? 0), 0);
  const nuove = letta.righe
    .filter((r) => r.descrizione.trim() && !righe.some((e) => stessaRiga(e, r)))
    .map((r): DDTRigaNuova => ({ ...r, posizione: ++posizione, order_item_id: null, origine: "ai" }));
  const campi: Partial<TestataBolla> = {};
  if (!testata.targa_mezzo && letta.targaMezzo) campi.targa_mezzo = letta.targaMezzo.toUpperCase();
  if (!testata.autista_nome && letta.autistaNome) campi.autista_nome = letta.autistaNome;
  if (!testata.corriere && letta.corriere) campi.corriere = letta.corriere;
  if (!testata.trasporto_a_cura_di && letta.trasportoACuraDi) campi.trasporto_a_cura_di = letta.trasportoACuraDi;
  if (!testata.porto && letta.porto) campi.porto = letta.porto;
  return { righe: nuove, campi };
}
