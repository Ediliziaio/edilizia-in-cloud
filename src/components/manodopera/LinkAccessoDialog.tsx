/**
 * L'ufficio dà l'app di cantiere con un link (02/11/2026): niente email né password.
 * I link nascono all'apertura e partono su WhatsApp, uno per persona, col tocco di chi li manda.
 */
import { useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useLinkAccessoApp, type LinkAccesso } from "@/hooks/useOperai";
import { testoLinkAccesso } from "@/lib/campo/linkAccesso";
import { linkWhatsApp } from "@/lib/opportunita/appuntamentoPrecompilato";

export function LinkAccessoDialog({ aperto, onAperto, employeeIds, onUsaEmail }: {
  aperto: boolean;
  onAperto: (v: boolean) => void;
  employeeIds: string[];
  /** Una persona sola, con l'email: la strada di prima resta. */
  onUsaEmail?: () => void;
}) {
  const { company, effectiveCompany } = useAuth();
  const azienda = (effectiveCompany ?? company)?.name;
  const crea = useLinkAccessoApp();
  const [mandati, setMandati] = useState<Set<string>>(new Set());
  const chiave = employeeIds.join(",");

  useEffect(() => {
    if (!aperto || !chiave) return;
    setMandati(new Set());
    crea.mutate(chiave.split(","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, chiave]);

  const segna = (id: string) => setMandati((m) => new Set(m).add(id));
  const copia = async (r: LinkAccesso) => {
    try {
      await navigator.clipboard.writeText(testoLinkAccesso(r.nome, azienda, r.url!));
      segna(r.employee_id);
      toast.success("Messaggio copiato");
    } catch {
      toast.error("Non riesco a copiare da questo browser");
    }
  };

  const risultati = crea.data ?? [];
  return (
    <Dialog open={aperto} onOpenChange={onAperto}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dai l'app di cantiere</DialogTitle>
          <DialogDescription>Ognuno riceve il suo link: lo apre, tocca «Entra» ed è dentro. Vale 14 giorni e una volta sola.</DialogDescription>
        </DialogHeader>
        {crea.isPending && <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Preparo i link…</p>}
        {crea.isError && (
          <div role="alert" className="space-y-2 py-2 text-sm">
            <p>{crea.error instanceof Error ? crea.error.message : "Non sono riuscito a preparare i link."}</p>
            <Button size="sm" variant="outline" onClick={() => crea.mutate(chiave.split(","))}>Riprova</Button>
          </div>
        )}
        <ul className="divide-y">
          {risultati.map((r) => {
            const wa = r.url ? linkWhatsApp(r.telefono, testoLinkAccesso(r.nome, azienda, r.url)) : null;
            const mandato = mandati.has(r.employee_id);
            return (
              <li key={r.employee_id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.nome || "Senza nome"}</p>
                  {r.errore && <p className="text-xs text-muted-foreground">{r.errore}</p>}
                </div>
                {r.url && (
                  <>
                    {mandato && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Mandato" />}
                    <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label={`Copia il messaggio per ${r.nome}`} onClick={() => void copia(r)}>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {wa ? (
                      <Button asChild size="sm" className="shrink-0 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                        <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => segna(r.employee_id)}>
                          <MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp
                        </a>
                      </Button>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">Senza numero</span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {onUsaEmail && !crea.isPending && (
          <button type="button" className="text-left text-sm text-primary underline" onClick={onUsaEmail}>Ha un'email? Usa quella</button>
        )}
      </DialogContent>
    </Dialog>
  );
}
