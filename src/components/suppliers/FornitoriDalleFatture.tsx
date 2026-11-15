/**
 * Fornitori → «Fornitori dalle fatture» (docs/automazioni-acquisti.md §5).
 *
 * Le fatture ricevute di un fornitore che in rubrica non c'è restano senza fornitore: niente
 * scadenze per fornitore, niente costi per fornitore. Qui si vede chi manca (anteprima, non scrive),
 * si scelgono quelli da creare e si crea: il fornitore nasce coi dati della sua fattura più recente
 * e le sue fatture si agganciano. Mai da soli, mai su un nome: solo con P.IVA o codice fiscale validi.
 * Esteri e identificativi non validi restano da fare a mano, col motivo.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { invalidaFornitori } from "@/lib/suppliers/cacheFornitori";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface CedenteMancante {
  chiave: string;
  nome: string | null;
  piva: string | null;
  codice_fiscale: string | null;
  paese: string | null;
  fatture: number;
  totale: number;
  ultima: string | null;
  identificativo_valido: boolean;
  gia_in_rubrica: string | null;
  omonimi: number;
}

/** Si possono creare (o solo agganciare) da qui; gli altri vanno fatti a mano. */
export function creabile(c: CedenteMancante): boolean {
  return !!c.gia_in_rubrica || c.identificativo_valido;
}

export const BLOCCO = 200;

export function useCedentiMancanti(companyId: string | undefined) {
  return useQuery({
    queryKey: ["fornitori-dalle-fatture", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CedenteMancante[]> => {
      const { data, error } = await db.rpc("acquisti_fornitori_dalle_fatture_anteprima", { p_company: companyId, p_limite: 5000 });
      if (error) throw error;
      return (data ?? []) as CedenteMancante[];
    },
  });
}

export function FornitoriDalleFatture({ companyId }: { companyId: string }) {
  const { data: cedenti = [], isError } = useCedentiMancanti(companyId);
  const [aperto, setAperto] = useState(false);
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const ok = useMemo(() => cedenti.filter(creabile), [cedenti]);
  const altri = useMemo(() => cedenti.filter((c) => !creabile(c)), [cedenti]);
  const fattureTot = cedenti.reduce((s, c) => s + c.fatture, 0);

  const crea = useMutation({
    mutationFn: async (chiavi: string[]) => {
      const tot = { creati: 0, agganciati: 0, fatture: 0, saltati: [] as Array<{ chiave: string; nome?: string; motivo: string }> };
      for (let i = 0; i < chiavi.length; i += BLOCCO) {
        const { data, error } = await db.rpc("acquisti_fornitori_dalle_fatture_crea", { p_company: companyId, p_chiavi: chiavi.slice(i, i + BLOCCO) });
        if (error) throw error;
        tot.creati += data.creati;
        tot.agganciati += data.agganciati;
        tot.fatture += data.fatture;
        tot.saltati.push(...(data.saltati ?? []));
      }
      return tot;
    },
    onSuccess: (r) => {
      toast.success(`${r.creati} fornitori creati, ${r.agganciati} agganciati, ${r.fatture} fatture collegate`, {
        description: r.saltati.length ? `${r.saltati.length} da fare a mano: ${r.saltati.slice(0, 3).map((s) => `${s.nome ?? s.chiave} (${s.motivo})`).join("; ")}` : undefined,
      });
      setScelti(new Set());
      void qc.invalidateQueries({ queryKey: ["fornitori-dalle-fatture", companyId] });
      void invalidaFornitori(qc);
    },
    onError: (e: Error) => toast.error("Fornitori non creati", { description: e.message }),
  });

  if (isError || cedenti.length === 0) return null;
  const tuttiScelti = scelti.size === ok.length && ok.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
        <p>
          <strong>{fattureTot}</strong> fatture ricevute non hanno un fornitore: vengono da <strong>{cedenti.length}</strong> fornitori da creare
          o da collegare.
        </p>
        <Button size="sm" variant="outline" onClick={() => setAperto(true)}>
          <FileSearch className="mr-1 h-4 w-4" /> Rivedi e crea
        </Button>
      </div>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fornitori dalle fatture</DialogTitle>
            <DialogDescription>
              Scegli chi creare: il fornitore nasce coi dati della sua fattura più recente e le sue fatture si collegano. Solo chi ha
              una P.IVA o un codice fiscale valido; un nome uguale a un fornitore che hai già, con un'altra P.IVA, è segnalato.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => setScelti(tuttiScelti ? new Set() : new Set(ok.map((c) => c.chiave)))}>
              {tuttiScelti ? "Deseleziona tutti" : `Seleziona tutti (${ok.length})`}
            </Button>
            <Button size="sm" disabled={!scelti.size || crea.isPending} onClick={() => crea.mutate([...scelti])}>
              {crea.isPending ? "Creo…" : `Crea e collega ${scelti.size || ""}`}
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="w-8" />
                <th className="py-2 text-left font-normal">Fornitore</th>
                <th className="py-2 text-left font-normal">P.IVA / CF</th>
                <th className="py-2 text-right font-normal">Fatture</th>
                <th className="py-2 text-right font-normal">Totale</th>
                <th className="py-2 text-right font-normal">Ultima</th>
              </tr>
            </thead>
            <tbody>
              {ok.map((c) => (
                <tr key={c.chiave} className="border-b last:border-b-0" data-cedente={c.chiave}>
                  <td>
                    <Checkbox
                      aria-label={`Scegli ${c.nome ?? c.chiave}`}
                      checked={scelti.has(c.chiave)}
                      onCheckedChange={(v) => setScelti((s) => { const n = new Set(s); if (v === true) n.add(c.chiave); else n.delete(c.chiave); return n; })}
                    />
                  </td>
                  <td className="py-2">
                    {c.nome ?? "—"}
                    {c.gia_in_rubrica && <span className="ml-2 text-xs text-muted-foreground">già in rubrica: si collegano solo le fatture</span>}
                    {c.omonimi > 0 && <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">nome uguale a un fornitore con altra P.IVA</span>}
                  </td>
                  <td className="py-2 tabular-nums">{c.piva || c.codice_fiscale}</td>
                  <td className="py-2 text-right tabular-nums">{c.fatture}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(c.totale)}</td>
                  <td className="py-2 text-right">{c.ultima ? formatDateShort(c.ultima) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {altri.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Da creare a mano ({altri.length})</p>
              <ul className="text-xs text-muted-foreground">
                {altri.map((c) => (
                  <li key={c.chiave}>
                    {c.nome ?? c.chiave} · {c.piva || c.codice_fiscale} · {c.paese && c.paese !== "IT" ? "fornitore estero" : "P.IVA o codice fiscale non valido"} · {c.fatture} fatture
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
