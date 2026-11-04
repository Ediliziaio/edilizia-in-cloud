/**
 * Le fatture dei fornitori su un mezzo: carburante, officina, leasing. Vale l'importo del legame, cioè le
 * righe che citano il mezzo, non il totale della fattura. Il totale qui sta a parte da tagliandi e scadenze:
 * un bollo può essere sia un documento sia una fattura, e sommarli conterebbe la spesa due volte.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link as LinkIcon, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const errore = (e: unknown) => toast.error("Non riuscito", { description: e instanceof Error ? e.message : String(e) });

interface Riga {
  id: string; importo: number | null; confermata: boolean; origine: string;
  fatture_ricevute: { numero_fattura: string; data_fattura: string; cedente_ragione_sociale: string; totale_documento: number | null } | null;
}

export function totaleConfermato(righe: ReadonlyArray<Pick<Riga, "importo" | "confermata">>): number {
  return Math.round(righe.reduce((s, r) => s + (r.confermata ? Number(r.importo ?? 0) : 0), 0) * 100) / 100;
}

export function MezzoFattureSection({ mezzoId, puoModificare }: { mezzoId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const chiave = ["mezzo-fatture", mezzoId];
  const { data: righe = [], isLoading, error } = useQuery({
    queryKey: chiave,
    queryFn: async () => {
      const { data, error: e } = await db.from("fattura_ricevuta_mezzi")
        .select("id, importo, confermata, origine, fatture_ricevute(numero_fattura, data_fattura, cedente_ragione_sociale, totale_documento)")
        .eq("mezzo_id", mezzoId).order("created_at", { ascending: false }).limit(1000);
      if (e) throw e;
      return ((data ?? []) as Riga[]).sort((a, b) => (b.fatture_ricevute?.data_fattura ?? "").localeCompare(a.fatture_ricevute?.data_fattura ?? ""));
    },
  });
  const aggiorna = () => void qc.invalidateQueries({ queryKey: chiave });
  const conferma = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: u } = await supabase.auth.getUser();
      const { error: e } = await db.from("fattura_ricevuta_mezzi").update({ confermata: true, confermata_da: u.user?.id ?? null, confermata_at: new Date().toISOString() }).in("id", ids);
      if (e) throw e;
    },
    onSuccess: aggiorna, onError: errore,
  });
  const togli = useMutation({
    mutationFn: async (id: string) => { const { error: e } = await db.from("fattura_ricevuta_mezzi").delete().eq("id", id); if (e) throw e; },
    onSuccess: aggiorna, onError: errore,
  });
  const cerca = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await db.rpc("mezzo_cerca_nelle_fatture", { p_mezzo_id: mezzoId });
      if (e) throw e;
      return Number(data ?? 0);
    },
    onSuccess: (n) => { toast.success(n ? `Trovate ${n} fatture da confermare` : "Nessuna fattura nuova con questa targa"); aggiorna(); },
    onError: errore,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carico le fatture…</p>;
  if (error) return <p className="text-sm text-destructive">Fatture non disponibili.</p>;
  const daConfermare = righe.filter((r) => !r.confermata);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm"><span className="font-semibold">{formatCurrency(totaleConfermato(righe))}</span> <span className="text-muted-foreground">da fatture confermate, imponibile</span></p>
        {puoModificare && (
          <div className="flex gap-2">
            {daConfermare.length > 0 && <Button size="sm" onClick={() => conferma.mutate(daConfermare.map((r) => r.id))}><Check className="mr-1.5 h-3.5 w-3.5" />Conferma {daConfermare.length} proposte</Button>}
            <Button size="sm" variant="outline" disabled={cerca.isPending} onClick={() => cerca.mutate()}><Search className="mr-1.5 h-3.5 w-3.5" />Cerca la targa nelle fatture</Button>
          </div>
        )}
      </div>
      {!righe.length && <p className="text-sm text-muted-foreground">Nessuna fattura collegata. Si collegano da sole se la targa è scritta nelle righe, oppure a mano dalla fattura.</p>}
      <div className="divide-y rounded-md border">
        {righe.map((r) => {
          const f = r.fatture_ricevute;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f?.cedente_ragione_sociale ?? "Fattura"}</p>
                <p className="text-xs text-muted-foreground">
                  <Link className="inline-flex items-center gap-1 underline-offset-2 hover:underline" to={`/azienda/documenti/fatture-ricevute?cerca=${encodeURIComponent(f?.numero_fattura ?? "")}`}><LinkIcon className="h-3 w-3" />{f?.numero_fattura}</Link>
                  {f?.data_fattura ? ` · ${formatDateShort(f.data_fattura)}` : ""}
                  {f?.totale_documento != null ? ` · fattura ${formatCurrency(f.totale_documento)}` : ""}
                </p>
              </div>
              {!r.confermata && <Badge variant="outline">Da confermare</Badge>}
              <span className="font-medium tabular-nums">{r.importo != null ? formatCurrency(r.importo) : "—"}</span>
              {puoModificare && !r.confermata && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Conferma" title="Conferma" onClick={() => conferma.mutate([r.id])}><Check className="h-4 w-4" /></Button>}
              {puoModificare && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Togli" title="Togli" onClick={() => togli.mutate(r.id)}><X className="h-4 w-4" /></Button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
