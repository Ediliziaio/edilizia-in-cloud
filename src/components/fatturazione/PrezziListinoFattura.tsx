/**
 * Fattura contro il listino del fornitore (23/11/2026). Si vede solo quando c'è un confronto
 * da fare: voci riconosciute nel listino. Le voci pagate più del listino si raggruppano per
 * articolo e prezzo, con le righe della fattura: in una fattura di 71 righe lo stesso
 * calcestruzzo compare trenta volte, e trenta avvisi uguali non li legge nessuno.
 * Le voci che il listino scrive diverso («CUBIERE PVC» / «cubetti in PVC») si abbinano una
 * volta qui sotto e da lì valgono per tutte le fatture del fornitore.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { useVociListinoFornitore } from "@/hooks/useListinoFornitore";
import { righeDocumentoFattura } from "@/lib/ddt/proponiPrezziFattura";
import { chiaveEquivalenza, confrontaConListino, voceDelListino } from "../../../shared/acquisti/prezziListino";

// Funzioni nuove, non ancora nei tipi generati.
const db = supabase as unknown as {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export function PrezziListinoFattura({ fornitoreId, righe, xmlRaw, indiceCorpo, puoModificare = false }: {
  fornitoreId: string | null | undefined;
  righe: unknown;
  xmlRaw: string | null;
  indiceCorpo: number | null;
  puoModificare?: boolean;
}) {
  const qc = useQueryClient();
  const { voci } = useVociListinoFornitore(fornitoreId);
  const equivalenze = useQuery({
    queryKey: ["listino-equivalenze", fornitoreId],
    enabled: !!fornitoreId && voci.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("listino_equivalenze_fornitore", { p_supplier: fornitoreId });
      if (error) return new Map<string, string>();
      return new Map(((data ?? []) as Array<{ chiave: string; voce_id: string }>).map((e) => [e.chiave, e.voce_id]));
    },
  });
  const lette = useMemo(() => righeDocumentoFattura({ righe, xml_raw: xmlRaw, indice_corpo: indiceCorpo })
    .map((r) => ({ numero: r.id, descrizione: r.descrizione, codice: r.codice, um: r.um, prezzo: r.prezzo })), [righe, xmlRaw, indiceCorpo]);
  const esiti = useMemo(() => (voci.length ? confrontaConListino(lette, voci, equivalenze.data) : []), [voci, lette, equivalenze.data]);
  // Le voci con un prezzo che il listino non riconosce: una per chiave, con le righe dove compaiono.
  const sconosciute = useMemo(() => {
    if (!voci.length) return [];
    const m = new Map<string, { chiave: string; descrizione: string; codice: string | null; prezzo: number; righe: Array<number | string> }>();
    for (const r of lette) {
      if (r.prezzo == null || !(r.prezzo > 0) || voceDelListino(r, voci, equivalenze.data)) continue;
      const k = chiaveEquivalenza(r.codice, r.descrizione);
      if (!k) continue;
      const g = m.get(k) ?? { chiave: k, descrizione: r.descrizione, codice: r.codice, prezzo: r.prezzo, righe: [] };
      g.righe.push(r.numero);
      m.set(k, g);
    }
    return [...m.values()];
  }, [voci, lette, equivalenze.data]);
  const [scelte, setScelte] = useState<Record<string, string>>({});
  const abbina = useMutation({
    mutationFn: async (v: { chiave: string; voce: string; codice: string | null; descrizione: string }) => {
      const { error } = await db.rpc("listino_equivalenza_salva", { p_supplier: fornitoreId, p_voce: v.voce, p_codice: v.codice, p_descrizione: v.descrizione });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Abbinamento ricordato per le prossime fatture del fornitore");
      void qc.invalidateQueries({ queryKey: ["listino-equivalenze", fornitoreId] });
    },
    onError: (e: Error) => toast.error("Abbinamento non salvato", { description: e.message }),
  });
  if (!fornitoreId || (esiti.length === 0 && sconosciute.length === 0)) return null;
  const care = esiti.filter((e) => e.esito === "piu_caro");
  const gruppi = [...care.reduce((m, e) => {
    const k = `${e.voce.id}|${e.prezzoFattura}`;
    const g = m.get(k) ?? { ...e, righe: [] as Array<number | string> };
    g.righe.push(e.numero);
    return m.set(k, g);
  }, new Map<string, (typeof care)[number] & { righe: Array<number | string> }>()).values()];
  const scaduto = esiti.find((e) => e.voce.listinoScadutoIl)?.voce.listinoScadutoIl;
  return (
    <div className="space-y-1 text-xs" aria-label="Prezzi contro il listino del fornitore">
      {esiti.length > 0 && (gruppi.length === 0 ? (
        <p className="text-emerald-700 dark:text-emerald-400">Prezzi in linea con il listino del fornitore ({esiti.length} {esiti.length === 1 ? "voce confrontata" : "voci confrontate"}).</p>
      ) : (
        <div role="alert" className="text-amber-800 dark:text-amber-300">
          <p className="font-medium">{care.length} {care.length === 1 ? "voce pagata" : "voci pagate"} più del listino del fornitore</p>
          <ul className="mt-0.5 space-y-0.5">
            {gruppi.map((g) => (
              <li key={`${g.voce.id}|${g.prezzoFattura}`}>
                {g.voce.descrizione}: {formatCurrency(g.prezzoFattura)} in fattura, {formatCurrency(g.prezzoListino)} a listino (+{g.differenzaPct.toLocaleString("it-IT")}%)
                <span className="text-muted-foreground"> · {g.righe.length === 1 ? "riga" : "righe"} {g.righe.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {sconosciute.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">{sconosciute.length} {sconosciute.length === 1 ? "voce non trovata" : "voci non trovate"} nel listino{puoModificare ? ": abbinale una volta e il confronto le riconosce sempre" : ""}</summary>
          <ul className="mt-1 space-y-1.5">
            {sconosciute.map((g) => (
              <li key={g.chiave} className="space-y-1">
                <p className="text-foreground">{g.descrizione} · {formatCurrency(g.prezzo)} <span className="text-muted-foreground">· {g.righe.length === 1 ? "riga" : "righe"} {g.righe.join(", ")}</span></p>
                {puoModificare && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Voce del listino per ${g.descrizione}`} className="h-8 min-w-0 max-w-full flex-1 rounded-md border bg-background px-2 text-xs"
                      value={scelte[g.chiave] ?? ""} onChange={(e) => setScelte({ ...scelte, [g.chiave]: e.target.value })}>
                      <option value="">È questa voce del listino…</option>
                      {voci.map((v) => <option key={v.id} value={v.id}>{v.descrizione} · {formatCurrency(v.prezzo)}{v.unita ? `/${v.unita}` : ""}</option>)}
                    </select>
                    <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={!scelte[g.chiave] || abbina.isPending}
                      onClick={() => abbina.mutate({ chiave: g.chiave, voce: scelte[g.chiave], codice: g.codice, descrizione: g.descrizione })}>Abbina</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {scaduto && <p className="text-muted-foreground">Listino scaduto il {formatDateIt(scaduto)}: il prezzo pattuito potrebbe essere cambiato.</p>}
    </div>
  );
}
