import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import { fiscalDate } from "@/lib/fatturazione/fiscalInsights";
import type { FiscalDocument } from "@/lib/fatturazione/fiscalWorkspace";

const SCELTE = [
  { v: 100, t: "100% tutta" },
  { v: 50, t: "50% telefonia" },
  { v: 40, t: "40% auto" },
  { v: 0, t: "0% nessuna" },
];

/** Quanta IVA si detrae, fattura per fattura o per gruppi: si cerca il fornitore e si spunta. */
export function DetraibilitaAcquisti({ company, acquisti }: { company: string; acquisti: FiscalDocument[] }) {
  const qc = useQueryClient();
  const { isAdmin, solaLettura } = usePermissions();
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [percentuale, setPercentuale] = useState("40");
  const [invio, setInvio] = useState(false);

  const ridotte = acquisti.filter((d) => d.detraibilita_percentuale !== null && d.detraibilita_percentuale !== undefined);
  const visibili = useMemo(() => {
    const q = cerca.trim().toLocaleLowerCase("it");
    return acquisti.filter((d) => !q || `${d.numero_fattura ?? ""} ${d.cedente_ragione_sociale ?? ""}`.toLocaleLowerCase("it").includes(q));
  }, [acquisti, cerca]);

  if (!acquisti.length) return null;

  const valore = Number(percentuale.replace(",", "."));
  const valido = percentuale.trim() !== "" && Number.isFinite(valore) && valore >= 0 && valore <= 100;
  const tutteVisibili = visibili.length > 0 && visibili.every((d) => scelte.has(d.id));

  const cambia = (id: string) => setScelte((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const cambiaVisibili = () => setScelte((p) => {
    const n = new Set(p);
    visibili.forEach((d) => (tutteVisibili ? n.delete(d.id) : n.add(d.id)));
    return n;
  });

  const conferma = async () => {
    if (!scelte.size || !valido) return;
    setInvio(true);
    try {
      const { data, error } = await supabase.rpc("fiscalita_imposta_detraibilita" as never, {
        p_company: company, p_ids: [...scelte], p_percentuale: valore,
      } as never);
      if (error) throw error;
      const e = data as unknown as { aggiornate: number };
      toast.success(`${e.aggiornate} ${e.aggiornate === 1 ? "fattura aggiornata" : "fatture aggiornate"}: la liquidazione si ricalcola.`);
      setAperto(false);
      setScelte(new Set());
      await qc.invalidateQueries({ queryKey: ["fiscal-purchases"] });
      await qc.invalidateQueries({ queryKey: ["liquidazione-righi"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(/chiuso/i.test(msg) ? "Il periodo fiscale è chiuso: va riaperto prima." : "Non salvato. Riprova.");
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-4 py-2 text-sm">
      <p>
        <span className="font-medium">IVA detraibile</span>
        <span className="text-muted-foreground">
          {" · "}{ridotte.length === 0 ? "tutte le fatture al 100%" : `${ridotte.length} ${ridotte.length === 1 ? "fattura ridotta" : "fatture ridotte"}, le altre al 100%`}
        </span>
      </p>
      {isAdmin && !solaLettura && <Button size="sm" variant="outline" onClick={() => setAperto(true)}>Imposta IVA non detraibile</Button>}

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>IVA detraibile sugli acquisti</DialogTitle>
            <DialogDescription>Cerca il fornitore, spunta le fatture e scegli la percentuale. Riduce solo l'IVA detratta.</DialogDescription>
          </DialogHeader>
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Fornitore o numero…" className="h-8 text-sm" aria-label="Cerca fattura" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={tutteVisibili} onCheckedChange={cambiaVisibili} aria-label="Seleziona tutte le fatture visibili" />
            Seleziona tutte le {visibili.length} visibili
          </label>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {visibili.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                <Checkbox checked={scelte.has(d.id)} onCheckedChange={() => cambia(d.id)} aria-label={`Scegli ${d.numero_fattura}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.cedente_ragione_sociale || "—"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{d.numero_fattura} · {fiscalDate(String(d.data_fattura ?? ""))}</span>
                </span>
                <span className="text-right text-xs tabular-nums">
                  {formatCurrency(Number(d.iva_totale ?? 0))}
                  <span className="block text-muted-foreground">{d.detraibilita_percentuale ?? 100}%</span>
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="det-perc" className="text-xs">Percentuale detraibile</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {SCELTE.map((s) => (
                <Button key={s.v} type="button" size="sm" variant={percentuale === String(s.v) ? "default" : "outline"} className="h-7 text-xs" onClick={() => setPercentuale(String(s.v))}>{s.t}</Button>
              ))}
              <Input id="det-perc" inputMode="decimal" value={percentuale} onChange={(e) => setPercentuale(e.target.value)} className="h-7 w-16 text-right text-xs" aria-invalid={!valido} />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={conferma} disabled={!scelte.size || !valido || invio}>
              {invio && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Applica a {scelte.size} {scelte.size === 1 ? "fattura" : "fatture"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
