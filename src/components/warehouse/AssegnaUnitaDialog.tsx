/**
 * Assegna l'unità di misura agli articoli che non ce l'hanno (26/11/2026).
 *
 * La scheda Valore diceva «17 articoli con unità da verificare» e basta: per sistemarli bisognava
 * aprire ogni articolo, e la modifica dell'articolo non lascia cambiare l'unità (resta fissa per
 * tenere coerenti i movimenti). Qui si assegna solo a chi NON ne ha una: niente da convertire.
 * L'unità si propone da sola quando il nome finisce con «- ml», «- pz», «- set»…
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOTTONE_NUOVO } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export const UNITA_PROPOSTE = ["pz", "ml", "m", "m²", "m³", "kg", "l", "conf", "set", "kit", "barra", "sacchi", "rotoli"] as const;

/** «Cassonetto coibentato 165mm - ml» → «ml»; niente proposta se il nome non finisce con un'unità nota. */
export function unitaDalNome(nome: string): string | null {
  const coda = nome.split(/\s[-–]\s/).pop()?.trim().toLowerCase() ?? "";
  if (coda === nome.trim().toLowerCase()) return null;
  const normali: Record<string, string> = { mq: "m²", m2: "m²", mc: "m³", m3: "m³", lt: "l", litri: "l", pezzi: "pz", confezione: "conf" };
  // «barra 6mt» → «barra»: conta la prima parola.
  const prima = coda.split(/\s+/)[0];
  const u = normali[coda] ?? normali[prima] ?? (UNITA_PROPOSTE as readonly string[]).find((x) => x === coda) ?? prima;
  return (UNITA_PROPOSTE as readonly string[]).includes(u) ? u : null;
}

export function AssegnaUnitaDialog({ open, onOpenChange, articoli }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articoli: Array<{ id: string; name: string; quantity: number }>;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const iniziali = useMemo(() => Object.fromEntries(articoli.map((a) => [a.id, unitaDalNome(a.name) ?? ""])), [articoli]);
  const [scelte, setScelte] = useState<Record<string, string>>(iniziali);
  const daSalvare = articoli.filter((a) => scelte[a.id]);

  const salva = useMutation({
    mutationFn: async () => {
      // Un aggiornamento per unità, e solo dove l'unità è ancora vuota (chi l'ha già non si tocca).
      const perUnita = new Map<string, string[]>();
      for (const a of daSalvare) perUnita.set(scelte[a.id], [...(perUnita.get(scelte[a.id]) ?? []), a.id]);
      let fatti = 0;
      for (const [unita, ids] of perUnita) {
        const { data, error } = await supabase.from("warehouse_stock").update({ unita_misura: unita })
          .in("id", ids).or("unita_misura.is.null,unita_misura.eq.").select("id");
        if (error) throw error;
        fatti += data?.length ?? 0;
      }
      return fatti;
    },
    onSuccess: (fatti) => {
      toast.success(t("Unità assegnata a {n} articoli", { n: fatti }));
      void queryClient.invalidateQueries({ queryKey: ["wh"] });
      void queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(t("Unità non salvate"), { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Assegna l'unità di misura")}</DialogTitle>
          <DialogDescription>
            {t("Solo per gli articoli che non ce l'hanno. Quando il nome finisce con l'unità («- ml», «- pz») è già proposta.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t("A tutti:")}</span>
          {(["pz", "ml", "m²", "kg"] as const).map((u) => (
            <Button key={u} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
              onClick={() => setScelte((s) => Object.fromEntries(articoli.map((a) => [a.id, s[a.id] || u])))}>{u}</Button>
          ))}
        </div>
        <ul className="divide-y rounded-lg border">
          {articoli.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate" title={a.name}>{a.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{a.quantity}</span>
              <Select value={scelte[a.id] || "nessuna"} onValueChange={(v) => setScelte((s) => ({ ...s, [a.id]: v === "nessuna" ? "" : v }))}>
                <SelectTrigger aria-label={t("Unità di {name}", { name: a.name })} className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuna">—</SelectItem>
                  {UNITA_PROPOSTE.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" className="h-9" onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
          <Button className={cn(BOTTONE_NUOVO, "h-9 text-sm")} disabled={daSalvare.length === 0 || salva.isPending} onClick={() => salva.mutate()}>
            {salva.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("Salva {n} unità", { n: daSalvare.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
