/**
 * Prima di stampare il verbale SAL: quali foto del cantiere e quali allegati ci vanno.
 * Nessuna foto è già scelta: il verbale va al cliente, e la scelta deve essere di chi lo manda.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { allegatiDaTesto, fotoNelPeriodo, MASSIMO_FOTO_VERBALE } from "@/lib/orders/fotoVerbaleSal";
import { cn } from "@/lib/utils";

interface Foto { id: string; taken_at: string; descrizione: string | null; url: string | null }

export function VerbaleSalDialog({ numero, orderId, companyId, dal, al, inCorso, conSottofasi = false, onGenera, onClose }: {
  numero: number; orderId: string; companyId: string;
  /** Data del SAL precedente e di questo: dicono quali foto sono del periodo. */
  dal: string | null; al: string | null;
  inCorso: boolean;
  /** Il verbale ha il dettaglio per sottofase: si sceglie se stamparlo (sì per default). */
  conSottofasi?: boolean;
  onGenera: (fotoIds: string[], allegati: string[], dettaglioSottofasi: boolean) => void;
  onClose: () => void;
}) {
  const [scelte, setScelte] = useState<string[]>([]);
  const [allegati, setAllegati] = useState("");
  const [dettaglio, setDettaglio] = useState(true);
  const foto = useQuery({
    queryKey: ["foto-verbale-sal", orderId],
    staleTime: 60_000,
    queryFn: async (): Promise<Foto[]> => {
      const { data, error } = await supabase.from("foto_cantiere")
        .select("id, storage_path, thumbnail_path, taken_at, descrizione")
        .eq("order_id", orderId).eq("company_id", companyId).order("taken_at", { ascending: false }).limit(200);
      if (error) throw error;
      const righe = data ?? [];
      if (!righe.length) return [];
      const { data: firmate } = await supabase.storage.from("foto-cantiere").createSignedUrls(righe.map((r) => r.thumbnail_path || r.storage_path), 3600);
      return righe.map((r, i) => ({ id: r.id, taken_at: r.taken_at, descrizione: r.descrizione, url: firmate?.[i]?.signedUrl ?? null }));
    },
  });
  const { periodo, altre } = fotoNelPeriodo(foto.data ?? [], dal, al);
  const scegli = (id: string) => setScelte((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MASSIMO_FOTO_VERBALE ? [...s, id] : s));
  const griglia = (titolo: string, elenco: Foto[]) => elenco.length > 0 && (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{titolo} ({elenco.length})</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {elenco.map((f) => {
          const scelta = scelte.includes(f.id);
          const data = new Date(f.taken_at).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
          return (
            <button key={f.id} type="button" aria-pressed={scelta} aria-label={`Foto del ${data}`} title={f.descrizione ?? data} onClick={() => scegli(f.id)}
              className={cn("relative aspect-square overflow-hidden rounded-md border bg-muted", scelta && "ring-2 ring-primary ring-offset-1")}>
              {f.url && <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />}
              {scelta && <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground"><Check className="h-3 w-3" aria-hidden /></span>}
              <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1 text-[10px] text-white">{data}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={(aperto) => { if (!aperto && !inCorso) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b p-4 pr-10">
          <DialogTitle>Verbale SAL n. {numero}</DialogTitle>
          <DialogDescription>Scegli cosa accompagna il verbale. Foto e allegati stanno in una pagina a sé, dopo le firme.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          {conSottofasi && (
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={dettaglio} onChange={(e) => setDettaglio(e.target.checked)} />
              <span><span className="font-medium">Dettaglio sottofasi</span><span className="block text-xs text-muted-foreground">Sotto ogni fase le sue lavorazioni, con quantità e avanzamento. Spento, il verbale breve: una riga per fase.</span></span>
            </label>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Foto del cantiere · {scelte.length} di {MASSIMO_FOTO_VERBALE}</p>
            {foto.isLoading ? <p role="status" className="text-sm text-muted-foreground">Carico le foto…</p>
              : foto.isError ? <p role="alert" className="text-sm text-destructive">Foto non disponibili: il verbale si può stampare lo stesso. <Button variant="outline" size="sm" onClick={() => void foto.refetch()}>Riprova</Button></p>
              : !foto.data?.length ? <p className="text-sm text-muted-foreground">Nessuna foto su questa commessa.</p>
              : <>{griglia("Nel periodo di questo SAL", periodo)}{griglia("Altre foto della commessa", altre)}</>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="verbale-allegati">Allegati al verbale · uno per riga</Label>
            <Textarea id="verbale-allegati" rows={3} value={allegati} onChange={(e) => setAllegati(e.target.value)} placeholder={"Libretto delle misure\nComputo metrico"} />
            <p className="text-xs text-muted-foreground">Nel verbale compare l'elenco: i documenti vanno mandati insieme.</p>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t p-4">
          <Button variant="outline" disabled={inCorso} onClick={onClose}>Chiudi</Button>
          <Button disabled={inCorso} onClick={() => onGenera(scelte, allegatiDaTesto(allegati), dettaglio)}>
            {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}Prepara il verbale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
