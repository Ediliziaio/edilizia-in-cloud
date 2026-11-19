import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ContoContabile } from "@/lib/contabilita/libroGiornale";

export interface ContoPrimaNota {
  valore: string;
  etichetta: string;
  account_label: string;
  bank_account_id: string | null;
  conto_liquidita_id: string | null;
}

/** Include i sottoconti del piano proprio, anche se il nome non contiene «banca». */
export function contiDiLiquidita(conti: readonly ContoContabile[]) {
  const perId = new Map(conti.map(c => [c.id, c]));
  return conti.filter(c => {
    if (!c.attivo || !c.movimentabile || c.natura !== "attivo") return false;
    let corrente: ContoContabile | undefined = c;
    const visti = new Set<string>();
    while (corrente && !visti.has(corrente.id)) {
      visti.add(corrente.id);
      if (["06.01", "06.02"].includes(corrente.codice_standard ?? corrente.codice)
          || /banc|cassa|disponibilit.*liquid|conti correnti|depositi.*postal/i.test(corrente.descrizione)) return true;
      corrente = corrente.mastro_id ? perId.get(corrente.mastro_id) : undefined;
    }
    return false;
  });
}

export function useContiPrimaNota(companyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["prima-nota-conti", companyId], enabled: enabled && !!companyId,
    queryFn: async (): Promise<ContoPrimaNota[]> => {
      const [banche, piano] = await Promise.all([
        supabase.from("bank_accounts_operativi").select("id,display_name,account_name,iban,currency")
          .eq("company_id", companyId!).eq("is_active", true).order("created_at"),
        supabase.from("contabilita_conti").select("*").eq("company_id", companyId!).order("codice"),
      ]);
      if (banche.error) throw banche.error;
      if (piano.error) throw piano.error;
      const conti = contiDiLiquidita((piano.data ?? []) as ContoContabile[]);
      return [
        ...(banche.data ?? []).filter(b => !b.currency || b.currency === "EUR").map(b => {
          const nome = b.display_name || b.account_name || "Conto bancario";
          const corrispondenti = conti.filter(c => c.descrizione.trim().toLocaleLowerCase("it") === nome.trim().toLocaleLowerCase("it"));
          return { valore: `banca:${b.id}`, etichetta: `${nome}${b.iban ? ` · …${b.iban.slice(-4)}` : ""}`,
            account_label: nome, bank_account_id: b.id!, conto_liquidita_id: corrispondenti.length === 1 ? corrispondenti[0].id : null };
        }),
        ...conti.map((c): ContoPrimaNota => ({ valore: `conto:${c.id}`, etichetta: `${c.codice} · ${c.descrizione}`, account_label: c.descrizione,
          bank_account_id: null, conto_liquidita_id: c.id })),
      ];
    }, staleTime: 30_000,
  });
}
