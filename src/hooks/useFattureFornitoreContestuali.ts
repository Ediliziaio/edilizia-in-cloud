import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { pagamentoDaMostrare } from "@/lib/fatturazione/pagamentoFatturaRicevuta";
import { statoRataFornitore, type RataFornitore } from "@/lib/fatturazione/rateFornitoriScadenzario";

export type FatturaFornitore = {
  id: string; numero_fattura: string | null; data_fattura: string | null; tipo_documento: string | null;
  stato: string | null; pagata_il: string | null; company_cost_id: string | null;
  totale_documento: number | null; piano_pagamento: unknown;
};
type RataScadenzario = Omit<RataFornitore, "fatture_ricevute"> & { fattura_id: string | null };
type RataDiretta = Omit<RataScadenzario, "fattura_id" | "residuo" | "fornitore"> & { fattura_ricevuta_id: string | null };
export type ScadenzaFornitore = {
  id: string; numero: number; scadenza: string | null; importo: number | null; residuo: number | null;
  metodo: string | null; stato: string; prevista: boolean;
};
type SaldoFattura = { id: string; residuo: number | null; pagato?: number | null; segnata_non_registrata?: number | null };
export type FatturaConScadenze = FatturaFornitore & {
  scadenze: ScadenzaFornitore[]; residuoFattura: number | null; pagatoFattura?: number | null; segnataNonRegistrata?: number | null;
};

function dataScadenza(valore: string | null): string | null {
  const data = valore?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data === "9999-12-31") return null;
  const letta = new Date(`${data}T00:00:00Z`);
  return Number.isFinite(letta.getTime()) && letta.toISOString().slice(0, 10) === data ? data : null;
}

/** Le rate senza costo possono esistere già: conserva lo stato, non inventare il residuo. */
export function completaRateFornitore(rate: RataScadenzario[], dirette: RataDiretta[]): RataScadenzario[] {
  const perId = new Map(rate.map(r => [r.id, r]));
  for (const r of dirette) if (!perId.has(r.id)) perId.set(r.id, {
    ...r, fattura_id: r.fattura_ricevuta_id, residuo: r.stato === "pagata" || !!r.pagata_il ? 0 : null, fornitore: null,
  });
  return [...perId.values()];
}

/** Solo identificativi fiscali semplici: non associare mai documenti per nome simile. */
export function filtriFornitore(supplierId?: string | null, piva?: string | null, cf?: string | null, paese?: string | null): string[] {
  const id = supplierId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplierId) ? supplierId : null;
  const nazione = paese && /^[A-Za-z]{2}$/.test(paese) ? paese.toUpperCase() : null;
  const fiscale = (s?: string | null) => {
    const v = (s ?? "").replace(/[\s.-]/g, "").toUpperCase();
    return /^[A-Z0-9]{3,32}$/.test(v) ? v : null;
  };
  const iva = fiscale(piva), codice = fiscale(cf);
  const filtri: string[] = [];
  if (id) filtri.push(`fornitore_id.eq.${id}`);
  const aggiungiFiscale = (campo: string, valore: string) => {
    const limiti = [`${campo}.eq.${valore}`];
    if (id) limiti.push("fornitore_id.is.null");
    if (nazione) limiti.push(`cedente_paese.eq.${nazione}`);
    filtri.push(limiti.length === 1 ? limiti[0] : `and(${limiti.join(",")})`);
  };
  if (iva) {
    aggiungiFiscale("cedente_piva", iva);
    if (/^IT\d{11}$/.test(iva)) aggiungiFiscale("cedente_piva", iva.slice(2));
    else if (/^\d{11}$/.test(iva)) aggiungiFiscale("cedente_piva", `IT${iva}`);
  }
  if (codice) aggiungiFiscale("cedente_cf", codice);
  return filtri;
}

/** Le rate registrate prevalgono sul piano XML; un residuo sconosciuto resta sconosciuto. */
export function unisciFattureScadenze(fatture: FatturaFornitore[], rate: RataScadenzario[], saldi: SaldoFattura[] = []): FatturaConScadenze[] {
  const saldoPerFattura = new Map(saldi.map(s => [s.id, s]));
  const perFattura = new Map<string, RataScadenzario[]>();
  for (const rata of rate) if (rata.fattura_id) {
    const presenti = perFattura.get(rata.fattura_id) ?? [];
    presenti.push(rata);
    perFattura.set(rata.fattura_id, presenti);
  }
  return fatture.map(f => {
    const registrate = perFattura.get(f.id) ?? [];
    const scadenze: ScadenzaFornitore[] = registrate.length ? registrate.map(r => ({
      id: r.id, numero: r.numero, scadenza: dataScadenza(r.scadenza), importo: r.importo, residuo: r.residuo,
      metodo: r.metodo, stato: statoRataFornitore({ ...r, fatture_ricevute: null }), prevista: false,
    })) : (pagamentoDaMostrare(f)?.rate ?? []).map((r, i) => ({
      id: `xml:${f.id}:${i}`, numero: i + 1, scadenza: dataScadenza(r.scadenza), importo: r.importo,
      residuo: null as number | null, metodo: r.metodo, stato: r.pagataIl || f.pagata_il ? "pagata" : "da verificare", prevista: true,
    }));
    scadenze.sort((a, b) => (a.scadenza ?? "9999-12-31").localeCompare(b.scadenza ?? "9999-12-31") || a.numero - b.numero);
    const saldo = saldoPerFattura.get(f.id);
    return { ...f, scadenze, residuoFattura: saldo?.residuo ?? null, pagatoFattura: saldo?.pagato ?? null,
      segnataNonRegistrata: saldo?.segnata_non_registrata ?? null };
  }).sort((a, b) => (b.data_fattura ?? "").localeCompare(a.data_fattura ?? "") || a.id.localeCompare(b.id));
}

export function useFattureFornitoreContestuali({ companyId, fatturaId, supplierId, piva, cf, paese, enabled }: {
  companyId: string | null | undefined; fatturaId: string | null; supplierId?: string | null;
  piva?: string | null; cf?: string | null; paese?: string | null; enabled: boolean;
}) {
  const filtri = filtriFornitore(supplierId, piva, cf, paese);
  return useQuery({
    queryKey: ["fatture-ricevute", "contesto-fornitore", companyId, fatturaId, supplierId, piva, cf, paese],
    enabled: enabled && !!companyId && !!fatturaId && filtri.length > 0,
    queryFn: async (): Promise<FatturaConScadenze[]> => {
      // RLS e company_id si applicano a entrambe le letture; la ricerca fiscale
      // recupera solo fatture non ancora associate a un'altra anagrafica.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const fatture = await tutteLePagine<FatturaFornitore>((from, to) => db.from("fatture_ricevute")
        .select("id,numero_fattura,data_fattura,tipo_documento,stato,pagata_il,company_cost_id,totale_documento,piano_pagamento")
        .eq("company_id", companyId).or(filtri.join(",")).order("id").range(from, to));
      const ids = fatture.map(f => f.id);
      const rate: RataScadenzario[] = [];
      const dirette: RataDiretta[] = [];
      // Questo saldo è già disponibile nell'elenco delle fatture ricevute e non
      // espone i movimenti di Prima Nota. È il totale del documento, non della rata.
      const saldi = ids.length ? await tutteLePagine<SaldoFattura>((from, to) => db.rpc("fatture_ricevute_saldi", {
        p_company_id: companyId, p_anno: null,
      }).select("id,pagato,residuo,segnata_non_registrata").order("id").range(from, to)) : [];
      // Batch limitati per non superare la lunghezza delle richieste PostgREST.
      for (let i = 0; i < ids.length; i += 100) {
        const blocco = ids.slice(i, i + 100);
        rate.push(...await tutteLePagine<RataScadenzario>((from, to) => db.rpc("scadenzario_rate_fornitori", { p_company_id: companyId })
          .in("fattura_id", blocco).order("id").range(from, to)));
        dirette.push(...await tutteLePagine<RataDiretta>((from, to) => db.from("rate_fornitori")
          .select("id,numero,scadenza,importo,metodo,stato,pagata_il,updated_at,fattura_ricevuta_id")
          .eq("company_id", companyId).in("fattura_ricevuta_id", blocco).order("id").range(from, to)));
      }
      return unisciFattureScadenze(fatture, completaRateFornitore(rate, dirette), saldi);
    },
    staleTime: 0,
  });
}
