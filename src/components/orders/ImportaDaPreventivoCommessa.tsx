/**
 * «Importa da preventivo» nella vista Varianti della commessa (14/11/2026, fase 6 del piano anomalie).
 *
 * Vale per la commessa del cliente privato e per quella del committente: elenca i preventivi accettati dello stesso
 * cliente che non sono ancora diventati né una commessa né un lavoro extra, e il prescelto apre il flusso di sempre
 * (`?lavoro_extra_da=`, `LavoroExtraDaPreventivo`): voci e importo dal preventivo, fasi all'approvazione.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileInput, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { euro } from "@/lib/clienti/schedaCliente";
import { numeroPreventivo, preventiviImportabili, type PreventivoCommittente } from "@/lib/preventivi/preventiviCommittente";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Riga = Pick<PreventivoCommittente, "id" | "quote_number" | "title" | "total" | "status" | "variante_id" | "revision_number" | "signed_at" | "created_at">;

const giornoIT = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function ImportaDaPreventivoCommessa({ orderId, companyId, customerId, onScelto }: {
  orderId: string;
  companyId: string;
  customerId: string | null;
  onScelto: (quoteId: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [scelto, setScelto] = useState<string | null>(null);

  const elenco = useQuery({
    queryKey: ["preventivi-per-commessa", companyId, orderId, customerId],
    enabled: aperto && !!customerId,
    queryFn: async (): Promise<Riga[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: profilo } = await db.from("profiles").select("marketing_contact_id").eq("id", customerId).maybeSingle();
      const contatto: string | null = profilo?.marketing_contact_id ?? null;
      let q = db.from("quotes")
        .select("id, quote_number, title, total, status, variante_id, revision_number, signed_at, created_at")
        .eq("company_id", companyId).is("deleted_at", null).eq("status", "accettata").is("variante_id", null);
      q = contatto ? q.or(`customer_id.eq.${customerId},contact_id.eq.${contatto}`) : q.eq("customer_id", customerId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const righe = (data ?? []) as Riga[];
      if (righe.length === 0) return [];
      const { data: commesse, error: e2 } = await db.from("orders").select("quote_id")
        .eq("company_id", companyId).is("deleted_at", null).in("quote_id", righe.map((r) => r.id));
      if (e2) throw e2;
      return preventiviImportabili(righe, ((commesse ?? []) as Array<{ quote_id: string | null }>).map((o) => o.quote_id));
    },
  });

  if (!customerId) return null;
  const righe = elenco.data ?? [];
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setScelto(null); setAperto(true); }}>
        <FileInput className="h-4 w-4" /> Importa da preventivo
      </Button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importa da preventivo</DialogTitle>
            <DialogDescription>
              I preventivi accettati di questo cliente non ancora usati. Il prescelto diventa un lavoro extra con le sue voci e il suo importo;
              all'approvazione nasce la fase nelle lavorazioni.
            </DialogDescription>
          </DialogHeader>
          {elenco.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cerco i preventivi…</p>
          ) : elenco.isError ? (
            <p className="text-sm text-destructive">Non riesco a leggere i preventivi: riprova tra poco.</p>
          ) : righe.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun preventivo accettato da importare: quelli già diventati una commessa o un lavoro extra non si usano una seconda volta.</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-md border" role="radiogroup" aria-label="Preventivi accettati">
              {righe.map((q) => (
                <li key={q.id}>
                  <label className="flex cursor-pointer items-start gap-3 p-2.5 hover:bg-muted/50">
                    <input type="radio" name="preventivo-da-importare" className="mt-1" checked={scelto === q.id} onChange={() => setScelto(q.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{numeroPreventivo(q)}</span>
                        {q.total != null && <span className="shrink-0 text-sm tabular-nums">{euro(q.total, true)}</span>}
                      </span>
                      {q.title && <span className="line-clamp-1 block text-xs text-muted-foreground">{q.title}</span>}
                      <span className="block text-xs text-muted-foreground">accettato {giornoIT(q.signed_at ?? q.created_at)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAperto(false)}>Annulla</Button>
            <Button disabled={!scelto} onClick={() => { if (scelto) { setAperto(false); onScelto(scelto); } }}>Apri il lavoro extra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
