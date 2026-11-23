/**
 * Prima di stampare il verbale SAL: quali foto del cantiere e quali allegati ci vanno.
 * Nessuna foto è già scelta: il verbale va al cliente, e la scelta deve essere di chi lo manda.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { allegatiDaTesto, fotoNelPeriodo, MASSIMO_FOTO_VERBALE } from "@/lib/orders/fotoVerbaleSal";
import { FORMATI_VERBALE_SAL, type FormatoVerbaleSal } from "@/lib/orders/formatiVerbaleSal";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

/** Gli allegati che di solito accompagnano un SAL: un clic e sono nell'elenco. */
const ALLEGATI_SOLITI = ["Libretto delle misure", "Computo metrico", "Certificato di pagamento", "Giornale dei lavori"];

interface Foto { id: string; taken_at: string; descrizione: string | null; url: string | null }

export function VerbaleSalDialog({ numero, orderId, companyId, dal, al, inCorso, onGenera, onClose }: {
  numero: number; orderId: string; companyId: string;
  /** Data del SAL precedente e di questo: dicono quali foto sono del periodo. */
  dal: string | null; al: string | null;
  inCorso: boolean;
  onGenera: (fotoIds: string[], allegati: string[], formato: FormatoVerbaleSal) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const [scelte, setScelte] = useState<string[]>([]);
  const [allegati, setAllegati] = useState("");
  const [formato, setFormato] = useState<FormatoVerbaleSal>("completo");
  const [opzioniAperte, setOpzioniAperte] = useState(false);
  const elencoAllegati = allegatiDaTesto(allegati);
  const totaleAllegati = scelte.length + elencoAllegati.length;
  const foto = useQuery({
    queryKey: ["foto-verbale-sal", orderId, companyId],
    enabled: opzioniAperte,
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
          const data = new Date(f.taken_at).toLocaleDateString(intlCampo(), { timeZone: "Europe/Rome" });
          return (
            <button key={f.id} type="button" aria-pressed={scelta} aria-label={tr("Foto del {data}", { data })} title={f.descrizione ?? data} onClick={() => scegli(f.id)}
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
      <DialogContent aria-describedby={undefined} className="flex flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-2rem)]">
        <DialogHeader className="shrink-0 px-4 pb-3 pt-4 pr-10">
          <DialogTitle className="text-base leading-6">{tr("Verbale SAL n. {n}", { n: numero })}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 space-y-2 overflow-y-auto px-4 pb-3 pt-1">
          <fieldset disabled={inCorso}>
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{tr("Formato del PDF")}</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(FORMATI_VERBALE_SAL) as FormatoVerbaleSal[]).map(valore => {
                const { titolo, descrizione } = FORMATI_VERBALE_SAL[valore];
                return <button key={valore} type="button" aria-pressed={formato === valore} onClick={() => setFormato(valore)}
                  className={cn("flex flex-col items-start rounded-md border px-2 py-2 text-left leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
                    formato === valore ? "border-primary/50 bg-primary/5" : "hover:bg-muted")}>
                  <span className="block text-sm font-medium">{tr(titolo)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{tr(descrizione)}</span>
                </button>;
              })}
            </div>
          </fieldset>
          <Collapsible open={opzioniAperte} onOpenChange={setOpzioniAperte}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" type="button" disabled={inCorso}
                className="group h-9 w-full justify-start gap-2 px-1.5 text-muted-foreground">
                <Paperclip className="h-4 w-4" aria-hidden />
                {tr("Foto e allegati")}
                {totaleAllegati > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{totaleAllegati}</span>}
                <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 rounded-md border px-3 py-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{tr("Foto del cantiere")} {foto.data?.length ? <span className="font-normal text-muted-foreground">· {scelte.length}/{MASSIMO_FOTO_VERBALE}</span> : null}</p>
                  {periodo.length > 0 && (
                    <span className="flex gap-1">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setScelte(periodo.slice(0, MASSIMO_FOTO_VERBALE).map((f) => f.id))}>{tr("Seleziona periodo")}</Button>
                    </span>
                  )}
                  {scelte.length > 0 && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setScelte([])}>{tr("Deseleziona")}</Button>}
                </div>
                {foto.isLoading ? <p role="status" className="text-sm text-muted-foreground">{tr("Carico le foto…")}</p>
                  : foto.isError ? <p role="alert" className="text-sm text-destructive">{tr("Foto non disponibili.")} <Button variant="outline" size="sm" onClick={() => void foto.refetch()}>{tr("Riprova")}</Button></p>
                  : !foto.data?.length ? <p className="text-xs text-muted-foreground">{tr("Nessuna foto nella commessa.")}</p>
                  : <>{griglia(tr("Nel periodo di questo SAL"), periodo)}{griglia(tr("Altre foto della commessa"), altre)}</>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verbale-allegati">{tr("Elenco allegati")}</Label>
                <div className="flex flex-wrap gap-1">
                  {ALLEGATI_SOLITI.filter((a) => !elencoAllegati.includes(a)).map((a) => (
                    <Button key={a} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAllegati((t) => (t.trim() ? `${t.trimEnd()}\n${a}` : a))}>+ {a}</Button>
                  ))}
                </div>
                <Textarea id="verbale-allegati" rows={2} className="min-h-14" value={allegati} onChange={(e) => setAllegati(e.target.value)} placeholder={tr("Un nome per riga")} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <DialogFooter className="shrink-0 border-t px-4 py-3">
          <Button size="sm" disabled={inCorso} onClick={() => onGenera(scelte, elencoAllegati, formato)}>
            {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{tr("Anteprima PDF")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
