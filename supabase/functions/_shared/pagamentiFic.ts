/**
 * Le rate (payments_list) di una fattura su Fatture in Cloud dopo un incasso
 * parziale o il suo annullo (30/10/2026).
 *
 * Fino a oggi billing-payment-push sapeva solo segnare saldate TUTTE le rate:
 * un acconto o un incasso tolto in app restavano sbagliati su FIC. Qui si parte
 * da quanto risulta già pagato su FIC (la verità per le fatture importate), si
 * calcola il nuovo totale pagato e lo si ridistribuisce sulle rate in ordine di
 * scadenza: le rate coperte sono pagate, una rata coperta in parte si divide in
 * una parte pagata e una da pagare con la stessa scadenza, il resto è da
 * pagare. La somma delle rate resta l'importo lordo del documento (FIC lo
 * pretende).
 *
 * Modulo puro: lo usa billing-payment-push, lo provano i test in
 * src/test/logic/pagamentiFic.test.ts.
 */

export type RataFic = {
  amount?: number | string | null;
  due_date?: string | null;
  paid_date?: string | null;
  status?: string | null;
  payment_account?: { id?: number | null } | null;
};

export type RataInviata = {
  amount: number;
  due_date: string;
  paid_date?: string;
  status: "paid" | "not_paid";
  payment_account?: { id: number };
};

/** salda = tutto pagato (come prima); incassa = +importo; annulla = −importo. */
export type AzionePagamento =
  | { tipo: "salda" }
  | { tipo: "incassa"; importo: number }
  | { tipo: "annulla"; importo: number };

const cent = (n: number) => Math.round(n * 100);
const euro = (c: number) => c / 100;

/** Quanto risulta pagato su FIC: la somma delle rate «paid». */
export function pagatoSuFic(rate: RataFic[]): number {
  return euro(rate.reduce((t, r) => t + (r?.status === "paid" ? cent(Number(r.amount || 0)) : 0), 0));
}

/** Il nuovo totale pagato, mai sotto zero né sopra il lordo. */
export function nuovoPagato(lordo: number, pagatoOra: number, azione: AzionePagamento): number {
  const l = cent(lordo);
  const ora = cent(pagatoOra);
  const target =
    azione.tipo === "salda" ? l
    : azione.tipo === "incassa" ? ora + cent(Math.abs(azione.importo))
    : ora - cent(Math.abs(azione.importo));
  return euro(Math.min(l, Math.max(0, target)));
}

/**
 * Le rate da inviare a FIC perché il pagato sia `pagato`. Una rata già pagata
 * conserva la sua data di pagamento; una nuova prende `dataPagamento`. Le rate
 * pagate hanno sempre un conto di saldo (FIC lo pretende): il loro, oppure
 * `contoId`. Ritorna null se servirebbe un conto e non c'è.
 */
export function ripartisciPagamenti(p: {
  rate: RataFic[];
  lordo: number;
  pagato: number;
  dataPagamento: string;
  scadenzaPredefinita: string;
  contoId: number | null;
}): RataInviata[] | null {
  const lordo = cent(p.lordo);
  // Nessuna rata su FIC: una sola, per l'intero importo.
  const sorgenti: RataFic[] = p.rate.length > 0
    ? [...p.rate]
    : [{ amount: p.lordo, due_date: p.scadenzaPredefinita, status: "not_paid" }];

  // Le rate pagate prima (tengono la loro data), poi per scadenza.
  sorgenti.sort((a, b) => {
    const pa = a.status === "paid" ? 0 : 1;
    const pb = b.status === "paid" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return String(a.due_date ?? "").localeCompare(String(b.due_date ?? ""));
  });

  // Le rate devono sommare il lordo: l'eventuale differenza va sull'ultima.
  const importi = sorgenti.map((r) => cent(Number(r.amount || 0)));
  const somma = importi.reduce((t, x) => t + x, 0);
  if (somma !== lordo && importi.length > 0) importi[importi.length - 1] += lordo - somma;

  let resta = Math.min(cent(p.pagato), lordo);
  const fuori: RataInviata[] = [];
  for (let i = 0; i < sorgenti.length; i++) {
    const r = sorgenti[i];
    const importo = importi[i];
    if (importo <= 0) continue;
    const scadenza = r.due_date || p.scadenzaPredefinita;
    const coperto = Math.min(importo, resta);
    resta -= coperto;
    const conto = r.payment_account?.id ?? p.contoId;
    if (coperto > 0) {
      if (!conto) return null;
      fuori.push({
        amount: euro(coperto),
        due_date: scadenza,
        paid_date: r.status === "paid" && r.paid_date ? r.paid_date : p.dataPagamento,
        status: "paid",
        payment_account: { id: conto },
      });
    }
    if (importo - coperto > 0) {
      fuori.push({ amount: euro(importo - coperto), due_date: scadenza, status: "not_paid" });
    }
  }

  // Due parti da pagare con la stessa scadenza tornano una rata sola (dopo un annullo).
  const unite: RataInviata[] = [];
  for (const r of fuori) {
    const prima = unite.find((u) => u.status === "not_paid" && r.status === "not_paid" && u.due_date === r.due_date);
    if (prima) prima.amount = euro(cent(prima.amount) + cent(r.amount));
    else unite.push({ ...r });
  }
  return unite;
}

/** Lo stato locale della fattura importata dopo il push. */
export function statoLocale(lordo: number, pagato: number): "paid" | "issued" {
  return cent(pagato) >= cent(lordo) ? "paid" : "issued";
}
