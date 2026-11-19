/**
 * I conti dell'azienda che si possono scegliere in fattura (19/11/2026).
 *
 * In fattura l'IBAN si compilava da solo con quello principale delle impostazioni, e per usarne un
 * altro bisognava riscriverlo a mano ogni volta: Impresa Vulcano lavora con due banche e si trovava
 * sempre proposta la stessa. Ora i conti si scrivono una volta sola in Impostazioni → Fatturazione e
 * in fattura si sceglie dalla tendina.
 *
 * Il primo della lista è sempre il conto principale, che resta quello proposto di serie: le aziende
 * che ne hanno uno solo non vedono nessuna differenza.
 *
 * I conti della Tesoreria non entrano qui: l'Open Banking manda l'IBAN mascherato («•••• 0901»), e
 * su una fattura non si può scrivere.
 */
import type { AnagraficaAzienda, ContoFatturazione } from "@/types/fatturazione";

/** Senza spazi e in maiuscolo, come lo vuole il tracciato della fattura elettronica. */
export const pulisciIbanConto = (iban: string | null | undefined): string =>
  String(iban ?? "").replace(/\s+/g, "").toUpperCase();

/** Un IBAN italiano scritto bene: IT, due cifre di controllo, il CIN, 22 fra cifre e lettere. */
export const ibanValido = (iban: string | null | undefined): boolean =>
  /^IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/.test(pulisciIbanConto(iban));

export interface ContoScegliibile extends ContoFatturazione {
  /** Il conto principale delle impostazioni: proposto di serie, non si cancella da qui. */
  principale: boolean;
  /** Le ultime quattro cifre, per distinguere due conti della stessa banca. */
  ultime: string;
}

/** Il nome da mostrare: quello scritto dall'azienda, o la banca, o le ultime cifre dell'IBAN. */
export function nomeConto(c: ContoFatturazione): string {
  const nome = String(c.nome ?? "").trim();
  if (nome) return nome;
  const banca = String(c.banca ?? "").trim();
  const ultime = pulisciIbanConto(c.iban).slice(-4);
  return [banca, ultime ? `···${ultime}` : ""].filter(Boolean).join(" ") || "Conto";
}

/**
 * I conti fra cui scegliere: il principale per primo, poi gli altri. Fuori quelli senza IBAN e i
 * doppioni dello stesso IBAN, che in tendina sarebbero due voci identiche.
 */
export function contiDellAzienda(azienda: Partial<AnagraficaAzienda> | null | undefined): ContoScegliibile[] {
  const out: ContoScegliibile[] = [];
  const visti = new Set<string>();
  const aggiungi = (c: ContoFatturazione, principale: boolean) => {
    const iban = pulisciIbanConto(c.iban);
    if (!iban || visti.has(iban)) return;
    visti.add(iban);
    out.push({ ...c, iban, principale, ultime: iban.slice(-4) });
  };
  if (azienda?.iban_principale) {
    aggiungi({
      nome: String(azienda.nome_banca ?? "").trim() || "Conto principale",
      iban: azienda.iban_principale,
      bic: azienda.bic_swift ?? undefined,
      banca: azienda.nome_banca ?? undefined,
    }, true);
  }
  for (const c of azienda?.conti_fatturazione ?? []) {
    if (c && typeof c === "object") aggiungi(c, false);
  }
  return out;
}

/** Il conto che corrisponde all'IBAN scritto sulla fattura, se è uno di quelli dell'azienda. */
export function contoDellIban(
  conti: ContoScegliibile[],
  iban: string | null | undefined,
): ContoScegliibile | null {
  const cercato = pulisciIbanConto(iban);
  if (!cercato) return null;
  return conti.find((c) => c.iban === cercato) ?? null;
}
