import { Check, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMieiPrelievi, useRichiediDdt } from "@/hooks/campo/useCampoPrelievo";
import { formatoQuantitaMagazzino, nomeCantierePrelievo } from "@/lib/campo/magazzino";

const dataPrelievo = new Intl.DateTimeFormat("it-IT", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});
const stati = {
  consegnato: { label: "Consegnato", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  rifiutato: { label: "Rifiutato", className: "bg-destructive/10 text-destructive" },
  richiesto: { label: "In attesa di conferma", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
} as const;

export function CampoPrelievi({ companyId, puoPrelevare }: { companyId: string; puoPrelevare: boolean }) {
  const cronologia = useMieiPrelievi(companyId);
  const richiedi = useRichiediDdt(companyId);

  if (cronologia.isLoading) return (
    <div role="status" className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Carico i prelievi</span></div>
  );
  if (cronologia.isError) return (
    <div role="alert" className="space-y-2 rounded-xl border p-4 text-sm">
      <p>Non riesco a caricare i tuoi prelievi.</p>
      <Button variant="outline" size="sm" onClick={() => void cronologia.refetch()}>Riprova</Button>
    </div>
  );
  if (!cronologia.data?.prelievi.length) return (
    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
      <Package aria-hidden="true" className="mx-auto mb-2 h-7 w-7" />
      <p className="text-sm">Nessun prelievo registrato.</p>
    </div>
  );

  const cantieri = new Map(cronologia.data.cantieri.map((cantiere) => [cantiere.id, cantiere]));
  return (
    <ul className="space-y-3">
      {cronologia.data.prelievi.map((prelievo) => {
        const stato = stati[prelievo.stato] ?? stati.richiesto;
        const cantiere = cantieri.get(prelievo.order_id ?? "");
        return (
          <li key={prelievo.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <time dateTime={prelievo.data} className="text-muted-foreground">{dataPrelievo.format(new Date(prelievo.data))}</time>
              <span className={`rounded-full px-2 py-1 font-semibold ${stato.className}`}>{stato.label}</span>
            </div>
            <p className="mt-2 break-words text-sm font-semibold">
              {cantiere ? nomeCantierePrelievo(cantiere) : prelievo.order_id ? "Cantiere assegnato" : "Senza cantiere"}
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {prelievo.righe.map((riga, indice) => (
                <li key={`${riga.stock_item_id}-${indice}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words">{riga.name}</span>
                  <span className="shrink-0 font-medium tabular-nums">{formatoQuantitaMagazzino.format(riga.quantita)} {riga.unita}</span>
                </li>
              ))}
            </ul>
            {prelievo.note && <p className="mt-2 break-words text-xs text-muted-foreground">{prelievo.note}</p>}
            {prelievo.motivo_rifiuto && <p className="mt-2 break-words text-xs text-destructive">{prelievo.motivo_rifiuto}</p>}
            {prelievo.stato === "consegnato" && (prelievo.documento_numero || prelievo.ddt_richiesto || puoPrelevare) && (
              <div className="mt-3 border-t pt-3">
                {prelievo.documento_numero ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium"><Check className="h-4 w-4" /> DDT {prelievo.documento_numero} pronto</p>
                ) : prelievo.ddt_richiesto ? (
                  <p className="text-xs text-muted-foreground">DDT richiesto all’ufficio</p>
                ) : puoPrelevare && (
                  <Button variant="outline" className="min-h-11 w-full" disabled={richiedi.isPending}
                    onClick={() => richiedi.mutate(prelievo.id, {
                      onSuccess: () => toast.success("DDT richiesto all’ufficio"),
                      onError: (error) => toast.error(error.message),
                    })}>
                    Richiedi DDT
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
