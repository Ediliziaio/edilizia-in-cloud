/**
 * Codici del committente sulla commessa (16/11/2026, docs/piano-punti-aperti-20261116.md §4):
 * il codice cantiere del cliente, il suo numero d'ordine… La banca li cerca nelle causali degli
 * incassi: codice + cliente giusto + importo che torna → collegamento automatico (con
 * l'interruttore comune acceso), solo il codice → proposta. Se il campo è vuoto, la banca cerca un
 * codice nella descrizione del lavoro. Si salvano con commessa_codici_committente_salva.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hash, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { codiceValido, codiciDaTesto, codiciNelTesto } from "@/lib/orders/codiciCommittente";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Riga { codici_committente: string[] | null; riferimento_committente: string | null; description: string | null; work_description: string | null }

export function CodiciCommittenteRiquadro({ orderId, puoModificare }: { orderId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const [modifica, setModifica] = useState(false);
  const [testo, setTesto] = useState("");
  const q = useQuery({
    queryKey: ["commessa-codici-committente", orderId],
    queryFn: async () => {
      const { data, error } = await db.from("orders").select("codici_committente, riferimento_committente, description, work_description").eq("id", orderId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Riga | null;
    },
  });
  const salva = useMutation({
    mutationFn: async (codici: string[]) => {
      const { data, error } = await db.rpc("commessa_codici_committente_salva", { p_order: orderId, p_codici: codici });
      if (error) throw new Error(error.message);
      return data as string[];
    },
    onSuccess: () => { toast.success("Codici del committente salvati"); setModifica(false); void qc.invalidateQueries({ queryKey: ["commessa-codici-committente", orderId] }); },
    onError: (e: Error) => toast.error("Codici non salvati", { description: e.message }),
  });

  if (q.isLoading || q.isError || !q.data) return null;
  const codici = q.data.codici_committente ?? [];
  const dallaDescrizione = codici.length || q.data.riferimento_committente ? [] : codiciNelTesto([q.data.description, q.data.work_description].filter(Boolean).join(" "));
  const nuovi = codiciDaTesto(testo);
  const nonValidi = nuovi.filter((c) => !codiceValido(c));

  return (
    <section aria-labelledby="codici-committente" className="rounded-xl border bg-card p-4" data-testid="codici-committente">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="codici-committente" className="flex items-center gap-2 text-sm font-semibold">
          <Hash className="h-4 w-4 text-slate-600" aria-hidden="true" />Codici del committente
        </h3>
        {puoModificare && !modifica && (
          <Button size="sm" variant="ghost" onClick={() => { setTesto(codici.join(", ")); setModifica(true); }}>
            <Pencil className="mr-1 h-3.5 w-3.5" />{codici.length ? "Modifica" : "Aggiungi"}
          </Button>
        )}
      </div>
      {modifica ? (
        <div className="mt-2 space-y-2">
          <Input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Per esempio: MM 311, ODL 4500123" aria-label="Codici del committente, separati da virgola" />
          {nonValidi.length > 0 && <p className="text-xs text-destructive">Troppo corti: {nonValidi.join(", ")} (almeno 3 caratteri, 4 se solo cifre).</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => salva.mutate(nuovi)} disabled={salva.isPending || nonValidi.length > 0}>{salva.isPending ? "Salvo…" : "Salva"}</Button>
            <Button size="sm" variant="outline" onClick={() => setModifica(false)} disabled={salva.isPending}>Chiudi</Button>
          </div>
        </div>
      ) : codici.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {codici.map((c) => <li key={c} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-sm">{c}</li>)}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Nessun codice.{" "}
          {dallaDescrizione.length
            ? `Finché è vuoto, la banca cerca nella descrizione del lavoro: ${dallaDescrizione.join(", ")}.`
            : "Finché è vuoto, la banca cerca un codice nella descrizione del lavoro."}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Il codice cantiere o il numero d'ordine che il cliente scrive nella causale del bonifico: la banca lo usa per collegare l'incasso a questa commessa.
      </p>
    </section>
  );
}
