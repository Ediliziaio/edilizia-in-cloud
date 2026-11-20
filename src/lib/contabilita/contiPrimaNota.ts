import type { ContoContabile } from "./libroGiornale";

export interface ContoPrimaNota {
  valore: string;
  etichetta: string;
  account_label: string;
  bank_account_id: string | null;
  conto_liquidita_id: string | null;
  cassa?: boolean;
}

interface Banca {
  id: string | null;
  display_name?: string | null;
  account_name?: string | null;
  iban?: string | null;
  currency?: string | null;
}

/** Il ruolo del piano, anche ereditato dal mastro, prevale sulla descrizione. */
function tipoLiquidita(conto: ContoContabile, perId: ReadonlyMap<string, ContoContabile>): "banca" | "cassa" | null {
  let c: ContoContabile | undefined = conto;
  const visti = new Set<string>(), nomi: string[] = [];
  while (c && !visti.has(c.id)) {
    visti.add(c.id);
    const codice = c.codice_standard ?? c.codice;
    if (/^06\.01(?:\.|$)/.test(codice)) return "banca";
    if (/^06\.02(?:\.|$)/.test(codice)) return "cassa";
    nomi.push(c.descrizione);
    c = c.mastro_id ? perId.get(c.mastro_id) : undefined;
  }
  for (const nome of nomi) {
    if (/banc|conti correnti|depositi.*postal|cassa.*(?:risparmio|rurale|credito)/i.test(nome)) return "banca";
    if (/cassa|contanti|cash/i.test(nome)) return "cassa";
    if (/disponibilit.*liquid/i.test(nome)) return "banca";
  }
  return null;
}

export function contiDiLiquidita(piano: readonly ContoContabile[]): ContoContabile[] {
  const perId = new Map(piano.map(c => [c.id, c]));
  return piano.filter(c => c.attivo && c.movimentabile && c.natura === "attivo" && tipoLiquidita(c, perId) != null);
}

/** Collega il sottoconto alla banca soltanto quando la corrispondenza è univoca. */
export function mappaContiPrimaNota(bancheGrezze: readonly Banca[], piano: readonly ContoContabile[]): ContoPrimaNota[] {
  const banche = bancheGrezze.filter(b => b.id && (!b.currency || b.currency === "EUR"));
  const perId = new Map(piano.map(c => [c.id, c]));
  const conti = contiDiLiquidita(piano);
  const cassa = new Map(conti.map(c => [c.id, tipoLiquidita(c, perId) === "cassa"]));
  const chiave = (nome: string) => nome.trim().toLocaleLowerCase("it");
  const nomeBanca = (b: Banca) => b.display_name || b.account_name || "Conto bancario";
  const delPiano = (nome: string) => conti.filter(c => !cassa.get(c.id) && chiave(c.descrizione) === chiave(nome));
  return [
    ...banche.map((b): ContoPrimaNota => {
      const nome = nomeBanca(b), corrispondenti = delPiano(nome);
      return { valore: `banca:${b.id}`, etichetta: `${nome}${b.iban ? ` · …${b.iban.slice(-4)}` : ""}`, account_label: nome,
        bank_account_id: b.id!, conto_liquidita_id: corrispondenti.length === 1 ? corrispondenti[0].id : null, cassa: false };
    }),
    ...conti.map((c): ContoPrimaNota => {
      const corrispondenti = banche.filter(b => chiave(nomeBanca(b)) === chiave(c.descrizione));
      return { valore: `conto:${c.id}`, etichetta: `${c.codice} · ${c.descrizione}`, account_label: c.descrizione,
        bank_account_id: !cassa.get(c.id) && corrispondenti.length === 1 && delPiano(c.descrizione).length === 1 ? corrispondenti[0].id : null,
        conto_liquidita_id: c.id, cassa: cassa.get(c.id) ?? false };
    }),
  ];
}
