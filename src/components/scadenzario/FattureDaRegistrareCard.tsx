/**
 * FattureDaRegistrareCard — bozze di scadenza create da chat/foto (Silvio:
 * registra_fattura_passiva) con email_id NULL, stato='bozza'. Il titolare le
 * conferma (→ scadenza reale nel cashflow) o le scarta. Si nasconde se vuota.
 */
import { useConfermaScadenza, useScartaScadenza, useScadenzeBozzeDaRegistrare } from "@/lib/email-ai/hooks";
import { Button } from "@/components/ui/button";
import { Check, X, FileText, Loader2 } from "lucide-react";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtDate = (iso: string) => {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

export default function FattureDaRegistrareCard({ companyId }: { companyId: string | null | undefined }) {
  const { data: bozze = [], isLoading } = useScadenzeBozzeDaRegistrare(companyId);
  const conferma = useConfermaScadenza();
  const scarta = useScartaScadenza();

  if (isLoading || bozze.length === 0) return null; // niente clutter quando è vuota

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-orange-600" />
        <h3 className="text-sm font-semibold text-slate-800">Da registrare (da chat/foto)</h3>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">{bozze.length}</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Fatture passive caricate in chat con Silvio. Conferma per inserirle tra le uscite previste, oppure scarta.
      </p>
      <div className="space-y-2">
        {bozze.map((b) => {
          const busy = (conferma.isPending && conferma.variables?.id === b.id) || (scarta.isPending && scarta.variables?.id === b.id);
          return (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{b.descrizione || "Fattura fornitore"}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-rose-600">{eur(b.amount)}</span>
                  <span>·</span>
                  <span>scadenza {fmtDate(b.due_date)}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">uscita</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" className="h-8 gap-1" disabled={busy} onClick={() => conferma.mutate({ id: b.id })}>
                  {busy && conferma.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Conferma
                </Button>
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-slate-500 hover:text-rose-600" disabled={busy} onClick={() => scarta.mutate({ id: b.id })}>
                  <X className="h-3.5 w-3.5" /> Scarta
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
