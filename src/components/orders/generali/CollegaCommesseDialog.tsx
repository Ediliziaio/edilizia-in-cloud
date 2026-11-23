// src/components/orders/generali/CollegaCommesseDialog.tsx
// Mettere dentro la generale commesse che esistono già. Se la generale ha un cliente,
// si parte dalle commesse dello stesso cliente: sono quasi sempre quelle giuste.
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { messaggioGenerale, useCollegaCommesse, useCommesseCollegabili } from "@/hooks/useCommesseGenerali";
import { DEFINIZIONI_MODELLI, formattaEuro, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  riepilogo: RiepilogoGenerale;
}

export function CollegaCommesseDialog({ open, onOpenChange, riepilogo }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {/* Il contenuto nasce a ogni apertura: ricerca e scelte ripartono da zero. */}
        <Contenuto onOpenChange={onOpenChange} riepilogo={riepilogo} />
      </DialogContent>
    </Dialog>
  );
}

function Contenuto({ onOpenChange, riepilogo }: Omit<Props, "open">) {
  const g = riepilogo.generale;
  const def = DEFINIZIONI_MODELLI[g.modello];
  const { data: commesse = [], isLoading, isError } = useCommesseCollegabili(g.id, true);
  const collega = useCollegaCommesse(g.id);
  const [cerca, setCerca] = useState("");
  const [soloCliente, setSoloCliente] = useState(!!g.clienteId);
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const t = useT();

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return commesse.filter((c) =>
      (!soloCliente || !g.clienteId || c.customer_id === g.clienteId)
      && (!q || [c.order_code, c.description, c.client_name].some((v) => v?.toLowerCase().includes(q))));
  }, [commesse, cerca, soloCliente, g.clienteId]);

  const inAltraGenerale = visibili.filter((c) => scelte.has(c.id) && c.commessa_generale_id).length;

  const cambia = (id: string, si: boolean) =>
    setScelte((prima) => {
      const dopo = new Set(prima);
      if (si) dopo.add(id); else dopo.delete(id);
      return dopo;
    });

  const conferma = () => {
    collega.mutate([...scelte], {
      onSuccess: (n) => {
        toast.success(t(n === 1 ? "1 commessa aggiunta" : "{n} commesse aggiunte", { n }));
        onOpenChange(false);
      },
      onError: (e) => toast.error(messaggioGenerale(e, "il collegamento")),
    });
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{t("Collega commesse esistenti")}</DialogTitle>
          <DialogDescription>
            {t("Le commesse scelte diventano {tipo} di «{nome}». Restano commesse normali: cantiere, costi e fatture non cambiano.", { tipo: def.figlia.tante.toLowerCase(), nome: g.nome })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder={t("Cerca per codice, descrizione o cliente")} className="pl-8" aria-label={t("Cerca commesse")} />
          </div>
          {g.clienteId && (
            <div className="flex items-center gap-2">
              <Switch id="solo-cliente" checked={soloCliente} onCheckedChange={setSoloCliente} />
              <Label htmlFor="solo-cliente" className="text-sm font-normal">{g.cliente ? t("Solo commesse di {cliente}", { cliente: g.cliente }) : t("Solo commesse di questo cliente")}</Label>
            </div>
          )}

          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">{t("Carico le commesse…")}</p>
            ) : isError ? (
              <p className="p-4 text-sm text-destructive">{t("Non riesco a leggere le commesse. Riprova.")}</p>
            ) : visibili.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {soloCliente && g.clienteId ? t("Nessuna commessa di questo cliente da collegare. Togli il filtro per vederle tutte.") : t("Nessuna commessa da collegare.")}
              </p>
            ) : (
              <ul className="divide-y">
                {visibili.map((c) => {
                  const id = `collega-${c.id}`;
                  return (
                    <li key={c.id}>
                      <label htmlFor={id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                        <Checkbox id={id} checked={scelte.has(c.id)} onCheckedChange={(v) => cambia(c.id, v === true)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {c.order_code && <span className="mr-1.5 text-xs text-muted-foreground">{c.order_code}</span>}
                            {c.description || t("Commessa senza descrizione")}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[c.client_name, c.commessa_generale_id ? t("già in un'altra commessa generale") : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {c.total_amount != null && riepilogo.permessi.importi && (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formattaEuro(Number(c.total_amount))}</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {inAltraGenerale > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {inAltraGenerale === 1 ? t("Una delle commesse scelte è in un'altra generale: verrà spostata qui.") : t("{n} commesse scelte sono in un'altra generale: verranno spostate qui.", { n: inAltraGenerale })}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Annulla")}</Button>
          <Button onClick={conferma} disabled={scelte.size === 0 || collega.isPending}>
            {collega.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {scelte.size === 0 ? t("Collega") : scelte.size === 1 ? t("Collega 1 commessa") : t("Collega {n} commesse", { n: scelte.size })}
          </Button>
        </DialogFooter>
    </>
  );
}
