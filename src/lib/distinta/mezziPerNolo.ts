// Prima di noleggiare: l'azienda ce l'ha già? (23/11/2026)
//
// Una voce «Nolo di piattaforma aerea» finiva fra i noli da contrattare anche quando la
// piattaforma era in magazzino. Qui si cerca fra mezzi e attrezzature dell'azienda quello che
// corrisponde alla voce, e si dice se è libero. È una proposta: assegnarlo resta una scelta.

export interface MezzoAzienda {
  id: string;
  nome: string;
  tipo?: string | null;
  marca?: string | null;
  modello?: string | null;
  /** proprieta, leasing, noleggio_lungo, noleggio_breve */
  possesso?: string | null;
  /** in_servizio, in_officina, fuori_servizio */
  stato?: string | null;
  /** singola: un mezzo; quantita: pezzi o m² (ponteggi, transenne). */
  gestione?: string | null;
  assegnato_order_id?: string | null;
  unita_misura?: string | null;
  /** Solo per la gestione a quantità: quanto ne resta libero. */
  disponibile?: number | null;
}

export interface MezzoProposto {
  mezzo: MezzoAzienda;
  /** true: si può assegnare; false: c'è ma è impegnato o fermo; null: non si sa. */
  libero: boolean | null;
  /** In una riga: perché lo si propone e in che stato è. */
  motivo: string;
}

const NON_DICONO_COSA = new Set(["nolo", "noleggio", "noli", "freddo", "caldo", "operatore", "senza", "compreso", "compresa", "trasporto", "montaggio", "smontaggio",
  "giorno", "giorni", "mese", "mesi", "ogni", "primo", "successivo", "successivi", "altezza", "lavoro", "tipo", "portata", "fino", "oltre", "della", "delle", "degli", "dello", "durata", "cantiere"]);
const pulito = (s: string) => s.toLocaleLowerCase("it-IT").normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Le radici che dicono di che mezzo si parla: «piattaforma», «autogru», «ponteggio». */
export function radiciMezzo(testo: string): string[] {
  return [...new Set((pulito(testo).match(/[a-z]{4,}/g) ?? []).filter((w) => !NON_DICONO_COSA.has(w)).map((w) => w.slice(0, 6)))];
}

/**
 * I mezzi dell'azienda che corrispondono a una voce di nolo, i liberi per primi. La parola che
 * dice cos'è (la prima della voce) deve stare nel nome, nel tipo o nel modello del mezzo:
 * una «piattaforma» non si copre con un «autocarro» solo perché la voce dice «autocarrata».
 */
export function mezziPerNolo(descrizioneNolo: string, mezzi: MezzoAzienda[], orderId?: string | null): MezzoProposto[] {
  const radici = radiciMezzo(descrizioneNolo);
  if (!radici.length) return [];
  const principale = radici[0];
  const esito: (MezzoProposto & { comuni: number })[] = [];
  for (const m of mezzi) {
    const delMezzo = new Set(radiciMezzo([m.nome, m.tipo === "attrezzatura" ? "" : m.tipo, m.marca, m.modello].filter(Boolean).join(" ")));
    if (!delMezzo.has(principale)) continue;
    const comuni = radici.filter((r) => delMezzo.has(r)).length;
    const aNoleggio = m.possesso === "noleggio_breve";
    let libero: boolean | null;
    let stato: string;
    if (m.stato && m.stato !== "in_servizio") { libero = false; stato = m.stato === "in_officina" ? "in officina" : "fuori servizio"; }
    else if (m.gestione === "quantita") {
      if (m.disponibile == null) { libero = null; stato = "disponibilità da verificare"; }
      else { libero = m.disponibile > 0; stato = libero ? `${m.disponibile.toLocaleString("it-IT")} ${m.unita_misura ?? "pz"} liberi` : "tutto impegnato in altri cantieri"; }
    } else if (m.assegnato_order_id && m.assegnato_order_id !== orderId) { libero = false; stato = "assegnato a un'altra commessa"; }
    else if (m.assegnato_order_id && m.assegnato_order_id === orderId) { libero = true; stato = "già assegnato a questa commessa"; }
    else { libero = true; stato = "libero"; }
    esito.push({ mezzo: m, libero, comuni,
      motivo: `${m.nome}${m.modello ? ` (${[m.marca, m.modello].filter(Boolean).join(" ")})` : ""}: ${stato}${aNoleggio ? " · è a sua volta un noleggio breve" : ""}` });
  }
  return esito
    .sort((a, b) => Number(b.libero === true) - Number(a.libero === true) || b.comuni - a.comuni || a.mezzo.nome.localeCompare(b.mezzo.nome, "it"))
    .slice(0, 3).map(({ comuni: _c, ...p }) => p);
}
