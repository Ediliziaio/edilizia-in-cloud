/**
 * Notifiche nella lingua dell'operaio, senza toccare il server (piano 2026-11-23-lingua-piattaforma, fase 3 «leggera»).
 *
 * Il database scrive titolo e testo delle notifiche già composti, in italiano, da pochi modelli fissi (funzioni
 * `tg_campo_rapportino_esito`, `tg_campo_assegnazione_notifica`, `campo_promemoria`, `notify_task_assigned`,
 * `create_task_due_notifications`, scadenze dei mezzi). Qui riconosciamo il modello, tiriamo fuori i dati (date,
 * codici, nomi) e mostriamo la frase tradotta con gli stessi dati. Una frase che non corrisponde a nessun modello
 * resta com'è: niente si rompe, al massimo si legge in italiano come oggi.
 *
 * Se un modello cambia nel database, la notifica torna semplicemente in italiano: il test `campoLinguaNotifiche`
 * tiene l'elenco allineato agli esempi veri.
 */
import { italiano, type Traduttore } from "./traduttore";

/** L'ordine conta: prima i modelli più precisi. Il valore `cosa` è una parola da tradurre (es. «assicurazione»). */
export const MODELLI_NOTIFICA: readonly string[] = [
  // Esito del rapportino
  "Rapportino del {data} approvato",
  "Rapportino del {data} rifiutato",
  "Cantiere {codice}. Le ore sono passate in commessa.",
  "Le ore sono passate in commessa.",
  "Cantiere {codice}. Rifallo e rimandalo.",
  "Rifallo e rimandalo.",
  "Cantiere {codice}. Motivo: {motivo}",
  "Motivo: {motivo}",
  // Assegnazione a un cantiere
  "Nuovo cantiere: un cantiere",
  "Sei capocantiere di un cantiere",
  "Nuovo cantiere: {codice}",
  "Sei capocantiere di {codice}",
  "{testo} · dal {data}",
  "dal {data}",
  // Promemoria
  "Manca il rapportino di oggi",
  "Due minuti: cosa hai fatto, quante ore, una foto. Anche a voce.",
  "Non hai timbrato l'uscita",
  "Sei entrato alle {ora}. Se hai finito, timbra l'uscita.",
  // Avviso della sera (campo_promemoria, slot «domani», 26/11/2026): il testo è l'indirizzo, resta com'è.
  "Domani sei a {cantiere}",
  "Apri l'app per i dettagli.",
  // Il materiale chiesto dal cantiere (trigger campo_materiale_avvisa_richiedente, 26/11/2026)
  "Il materiale che hai chiesto è stato ordinato",
  "È arrivata una parte del materiale che hai chiesto",
  "Il materiale che hai chiesto è arrivato",
  // Le mie scadenze (hr-check-scadenze, 26/11/2026)
  "Documento scaduto: {cosa}",
  "Documento in scadenza: {cosa}",
  "Scaduto il {data}. Rinnovalo e caricalo dall'app.",
  "Scade il {data}. Rinnovalo e caricalo dall'app.",
  // Attività
  "Nuova attività assegnata",
  "Attività riassegnata a te",
  "Attività in scadenza oggi",
  "Attività scaduta",
  "{titolo} — Scadenza: {data}",
  "{titolo} — scaduta il {data}",
  // Correzione della timbratura (campo_timbratura_correzione_decidi)
  "Correzione timbratura approvata",
  "Correzione timbratura respinta",
  "Entrata del {quando}: {risposta}",
  "Uscita del {quando}: {risposta}",
  "Entrata del {quando}",
  "Uscita del {quando}",
  // Ticket di assistenza (notify_new_ticket). «Da {nome}» no: troppo generico, prenderebbe frasi qualsiasi.
  "Nuovo ticket: {oggetto}",
  "Da Cliente",
  // Scadenze dei mezzi
  "Scadenza passata: {cosa} · {mezzo}",
  "In scadenza: {cosa} · {mezzo}",
  "{testo} · scadenza passata il {data}",
  "{testo} · scade il {data}",
];

/** Le parole che possono stare in `{cosa}` nelle scadenze dei mezzi (si traducono anche loro). */
export const COSE_SCADENZA_MEZZI: readonly string[] = [
  "assicurazione", "revisione", "tagliando", "bollo", "verifica periodica", "manutenzione", "noleggio",
];

const scappa = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compilati = MODELLI_NOTIFICA.map(modello => {
  const nomi: string[] = [];
  const corpo = modello.split(/(\{\w+\})/).map(pezzo => {
    const m = pezzo.match(/^\{(\w+)\}$/);
    if (!m) return scappa(pezzo);
    nomi.push(m[1]);
    return "(.+?)";
  }).join("");
  return { modello, nomi, re: new RegExp(`^${corpo}$`, "s") };
});

/** Il testo di una notifica nella lingua di `t`. Senza modello riconosciuto resta il testo originale. */
export function traduciTestoNotifica(testo: string | null | undefined, t: Traduttore = italiano): string {
  const originale = testo ?? "";
  if (!originale) return originale;
  for (const { modello, nomi, re } of compilati) {
    const m = originale.match(re);
    if (!m) continue;
    const valori: Record<string, string> = {};
    nomi.forEach((nome, i) => {
      const v = m[i + 1];
      // Parole fisse dentro il modello (es. «assicurazione») e pezzi che sono a loro volta un modello (es. il testo prima di «· dal»).
      valori[nome] = nome === "cosa" ? t(v) : nome === "testo" ? traduciTestoNotifica(v, t) : v;
    });
    return t(modello, valori);
  }
  return originale;
}
