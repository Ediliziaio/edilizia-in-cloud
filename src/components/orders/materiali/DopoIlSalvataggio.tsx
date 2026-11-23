/**
 * «Genera dal computo», dopo «Salva i materiali» (14/11/2026): il passo verso gli
 * ordini. I materiali appena salvati e ancora da ordinare, divisi per fornitore,
 * con righe e totale; «Crea gli ordini in bozza» fa un ordine per fornitore con
 * la stessa funzione della barra dei Materiali (createMaterialPurchaseOrder,
 * che rilegge le righe e controlla che niente sia cambiato). I materiali senza
 * fornitore restano nei Materiali: lì si chiede l'offerta o si sceglie il fornitore.
 *
 * Prima il popup si chiudeva e «Ordina» si limitava a selezionare le righe:
 * dal computo all'ordine servivano ancora quattro passaggi a mano.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createMaterialPurchaseOrder } from "@/lib/orders/createMaterialPurchaseOrder";
import type { ProcurementItem } from "@/lib/orders/materialProcurement";
import { raggruppaPerFornitore } from "@/lib/distinta/ordiniDaMateriali";
import { chiaviMateriali } from "@/hooks/useMaterialiPerFase";

const euro = (n: number) => n.toLocaleString(intlCampo(), { style: "currency", currency: "EUR" });

export function DopoIlSalvataggio({ open, onOpenChange, materiali, companyId, orderId, orderCode, userId, fornitori, mostraPrezzi }: {
  open: boolean; onOpenChange: (o: boolean) => void; materiali: ProcurementItem[]; companyId: string; orderId: string;
  orderCode?: string | null; userId?: string; fornitori: Map<string, string>; mostraPrezzi: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { gruppi, senzaFornitore } = useMemo(() => raggruppaPerFornitore(materiali, fornitori), [materiali, fornitori]);
  const [scelti, setScelti] = useState<Set<string>>(() => new Set(gruppi.map((g) => g.supplierId)));
  const [creando, setCreando] = useState(false);
  const [creati, setCreati] = useState<string[]>([]);

  const crea = async () => {
    setCreando(true);
    const fatti: string[] = [];
    const errori: string[] = [];
    for (const g of gruppi.filter((x) => scelti.has(x.supplierId) && !creati.includes(x.supplierId))) {
      try {
        await createMaterialPurchaseOrder({ companyId, orderId, orderCode, supplierId: g.supplierId, userId, items: g.righe });
        fatti.push(g.supplierId);
      } catch (e) {
        errori.push(`${g.nome}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setCreati((c) => [...c, ...fatti]);
    setCreando(false);
    qc.invalidateQueries({ queryKey: chiaviMateriali.commessa(orderId) });
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    if (fatti.length) toast.success(fatti.length === 1 ? t("Ordine creato in bozza") : t("{n} ordini creati in bozza, uno per fornitore", { n: fatti.length }), { description: t("Li trovi in «Ordini d'acquisto» della commessa: controllali e inviali.") });
    if (errori.length) toast.error(t("Alcuni ordini non sono stati creati"), { description: errori.join(" · ") });
    if (fatti.length && !errori.length) onOpenChange(false);
  };

  const daCreare = gruppi.filter((g) => scelti.has(g.supplierId) && !creati.includes(g.supplierId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-3">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />{t("Materiali salvati: ora gli ordini")}</DialogTitle>
          <DialogDescription className="text-xs">
            {t("Un ordine in bozza per fornitore, con i materiali e i prezzi del suo listino. Prima di inviarlo lo controlli in «Ordini d'acquisto».")}
          </DialogDescription>
        </DialogHeader>

        {gruppi.length > 0 ? (
          <ul className="divide-y rounded-md border text-sm" aria-label={t("Ordini da creare")}>
            {gruppi.map((g) => {
              const fatto = creati.includes(g.supplierId);
              return (
                <li key={g.supplierId} className="flex items-center gap-3 px-3 py-2">
                  {fatto ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={t("Ordine creato")} />
                    : <Checkbox checked={scelti.has(g.supplierId)} aria-label={t("Ordina a {nome}", { nome: g.nome })}
                        onCheckedChange={(v) => setScelti((s) => { const n = new Set(s); if (v) n.add(g.supplierId); else n.delete(g.supplierId); return n; })} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{g.nome}</span>
                    <span className="block truncate text-[11px] text-slate-500" title={g.righe.map((r) => r.name).join(", ")}>
                      {t(g.righe.length === 1 ? "{n} materiale:" : "{n} materiali:", { n: g.righe.length })} {g.righe.slice(0, 4).map((r) => r.name).join(", ")}{g.righe.length > 4 ? "…" : ""}
                    </span>
                  </span>
                  {mostraPrezzi && (
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-medium text-slate-900">{euro(g.totale)}</span>
                      {g.senzaPrezzo > 0 && <span className="block text-[11px] text-amber-700">{t("{n} senza prezzo", { n: g.senzaPrezzo })}</span>}
                    </span>
                  )}
                  {fatto && <span className="shrink-0 text-[11px] font-medium text-emerald-700">{t("Creato")}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-slate-500">{t("Nessun materiale ha ancora un fornitore: scegli l'articolo o chiedi un'offerta dai Materiali.")}</p>
        )}

        {senzaFornitore.length > 0 && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-medium text-slate-800">{t("{n} materiali senza fornitore", { n: senzaFornitore.length })}</span> {t("restano nei Materiali: selezionali lì per chiedere un'offerta o sceglierne il fornitore.")}
          </p>
        )}

        <DialogFooter className="flex-row items-center gap-2 sm:space-x-0">
          <Button variant="ghost" size="sm" className="mr-auto" onClick={() => onOpenChange(false)}>{t("Non ora")}</Button>
          {gruppi.length > 0 && (
            <Button size="sm" disabled={!daCreare.length || creando} onClick={crea}>
              {creando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <ShoppingCart className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              {creando ? t("Creo gli ordini…") : daCreare.length === 1 ? t("Crea l'ordine in bozza") : t("Crea {n} ordini in bozza", { n: daCreare.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
