/**
 * Il listino si carica anche senza contratto (25/11/2026).
 *
 * `appalto_tariffe.contratto_id` e' NOT NULL: una tariffa appartiene sempre a un
 * accordo. Ma pretendere che il titolare scriva prima le condizioni — giorni di
 * pagamento, ritenuta, maggiorazioni, modo di fatturazione — per poter caricare
 * il foglio dei prezzi che il committente gli ha appena mandato e' un ostacolo
 * messo nel punto sbagliato: i prezzi arrivano prima dell'accordo scritto, e
 * senza listino la commessa a misura non sa a quanto fatturare.
 *
 * Quindi il contenitore lo apre il programma: se il committente non ha nessun
 * contratto, al primo salvataggio del listino ne nasce uno con i valori
 * predefiniti del database (30 giorni, ritenuta 0, per commessa, IVA ordinaria),
 * che si completa quando si vuole. Chi carica lo legge nel messaggio di esito:
 * un contratto comparso senza dirlo sarebbe peggio del blocco.
 */
import { contrattoDiOggi, oggiISO, type ContrattoAppaltoMinimo } from "./contratti";

export interface ContrattoScelto {
  id: string;
  nome: string;
  /** Vero solo se l'abbiamo creato adesso: serve a dirlo a chi ha caricato. */
  creato: boolean;
}

interface ContrattoLetto extends ContrattoAppaltoMinimo {
  nome: string;
}

/** `Accordo 2026`. L'anno, perche' un accordo d'appalto si rinnova. */
export function nomeContrattoPredefinito(oggi: Date = new Date()): string {
  return `Accordo ${oggi.getFullYear()}`;
}

/**
 * Il contratto su cui scrivere il listino di questo committente.
 *
 * Se la pagina ne ha gia' uno in mano lo usa e non tocca il database. Altrimenti
 * rilegge i contratti (la cache della pagina puo' essere vecchia: due schede
 * aperte non devono creare due accordi) e solo se davvero non ce n'e' nessuno lo
 * crea.
 *
 * `db` e' il client Supabase; sta come parametro per poterlo provare senza rete.
 */
export async function assicuraContratto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  { companyId, committenteId, contratto }: {
    companyId: string;
    committenteId: string;
    contratto?: { id: string; nome: string } | null;
  },
): Promise<ContrattoScelto> {
  if (contratto?.id) return { ...contratto, creato: false };

  const { data, error } = await db.from("appalto_contratti")
    .select("id, nome, valido_dal, valido_al, attivo")
    .eq("company_id", companyId)
    .eq("committente_id", committenteId)
    .order("valido_dal", { ascending: false });
  if (error) throw error;

  const esistente = contrattoDiOggi((data ?? []) as ContrattoLetto[]);
  if (esistente) return { id: esistente.id, nome: esistente.nome, creato: false };

  const nome = nomeContrattoPredefinito();
  const creato = await db.from("appalto_contratti")
    .insert({ company_id: companyId, committente_id: committenteId, nome, valido_dal: oggiISO() })
    .select("id, nome")
    .single();
  if (creato.error) throw creato.error;
  return { id: String(creato.data.id), nome: String(creato.data.nome ?? nome), creato: true };
}
