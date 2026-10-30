// src/components/orders/generali/investitori/RendicontoDialog.tsx
// F7 «Rendere conto a un investitore»: anteprima del PDF con i suoi numeri → invio per
// email, solo con un clic esplicito su «Invia». Il PDF che parte è lo stesso dell'anteprima.
// @react-pdf/renderer arriva con un import dinamico all'apertura: è il pezzo pesante del bundle.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useInviaRendiconto } from "@/hooks/useGeneraleInvestitori";
import { DEFINIZIONI_MODELLI, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type { ContiInvestitori } from "@/lib/orders/generali/investitoriConti";
import type { VenditeUnita } from "@/lib/orders/generali/investitoriLettura";
import { datiRendiconto, nomeFileRendiconto, type DatiRendiconto } from "@/lib/orders/generali/investitoriRendiconto";
import type { NumeriInvestitori } from "@/lib/orders/generali/pianoConti";
import { logger } from "@/utils/logger";

let moduloPdf: Promise<{
  pdf: typeof import("@react-pdf/renderer").pdf;
  Doc: typeof import("@/components/orders/generali/investitori/RendicontoInvestitorePDF").RendicontoInvestitorePDF;
}> | null = null;
function caricaPdf() {
  if (!moduloPdf) {
    moduloPdf = Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/orders/generali/investitori/RendicontoInvestitorePDF"),
    ]).then(([p, t]) => ({ pdf: p.pdf, Doc: t.RendicontoInvestitorePDF }));
  }
  return moduloPdf;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  riepilogo: RiepilogoGenerale;
  fonteId: string;
  conti: ContiInvestitori;
  numeriPiano: NumeriInvestitori | null;
  vendite: VenditeUnita | null;
  oggi: string;
  puoInviare: boolean;
}

function useAzienda() {
  const { effectiveCompany } = useAuth();
  return useQuery({
    queryKey: ["generale-rendiconto-azienda", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DatiRendiconto["azienda"]> => {
      const { data } = await supabase
        .from("companies")
        .select("name, vat_number, address, city, postal_code, province, phone, email, logo_url")
        .eq("id", effectiveCompany!.id)
        .maybeSingle();
      const a = (data ?? {}) as Record<string, string | null>;
      const luogo = [a.postal_code, a.city, a.province ? `(${a.province})` : null].filter(Boolean).join(" ");
      return {
        nome: a.name ?? effectiveCompany?.name ?? "La tua impresa",
        partitaIva: a.vat_number ?? null,
        indirizzo: [a.address, luogo].filter(Boolean).join(", ") || null,
        email: a.email ?? null,
        telefono: a.phone ?? null,
        logo: a.logo_url ?? null,
      };
    },
  });
}

export function RendicontoDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[94vh] max-w-5xl flex-col overflow-hidden">
        {props.open && <Contenuto {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Contenuto({ onOpenChange, riepilogo, fonteId, conti, numeriPiano, vendite, oggi, puoInviare }: Props) {
  const azienda = useAzienda();
  const invia = useInviaRendiconto(riepilogo.generale.id);
  const fonte = conti.fonti.find((c) => c.fonte.id === fonteId)?.fonte ?? null;
  const [note, setNote] = useState("");
  const [destinatario, setDestinatario] = useState(fonte?.email ?? "");
  const [oggetto, setOggetto] = useState(`Rendiconto ${riepilogo.generale.nome}`);
  const [messaggio, setMessaggio] = useState(
    `le mandiamo il rendiconto aggiornato dell'operazione «${riepilogo.generale.nome}»: la sua posizione, come stanno andando lavori e vendite e quanto le spetta a fine operazione secondo la stima di oggi.\n\nPer qualunque domanda siamo a disposizione.`,
  );
  // Le note entrano nel PDF con «Aggiorna l'anteprima»: finché non lo si preme vale la prima stesura.
  const [richiesti, setRichiesti] = useState<DatiRendiconto | null>(null);

  const dati = useMemo(
    () =>
      azienda.data
        ? datiRendiconto({
            oggi, riepilogo, numeri: numeriPiano, conti, fonteId, vendite, azienda: azienda.data,
            unitaNome: DEFINIZIONI_MODELLI[riepilogo.generale.modello].figlia.tante,
          })
        : null,
    [azienda.data, oggi, riepilogo, numeriPiano, conti, fonteId, vendite],
  );
  const daStampare = richiesti ?? dati;

  // Il PDF dell'anteprima: si rifà solo quando cambiano i numeri da stampare.
  const anteprima = useQuery({
    queryKey: ["generale-rendiconto-pdf", daStampare],
    enabled: !!daStampare,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    meta: { silent: true },
    queryFn: async () => {
      const d = daStampare!;
      try {
        const { pdf: crea, Doc } = await caricaPdf();
        return { blob: await crea(<Doc d={d} />).toBlob(), dati: d };
      } catch (e) {
        logger.error("RendicontoDialog", e);
        throw e;
      }
    },
  });
  const url = useMemo(() => (anteprima.data ? URL.createObjectURL(anteprima.data.blob) : null), [anteprima.data]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const pdf = anteprima.data && url ? { ...anteprima.data, url } : null;
  const inPreparazione = anteprima.isFetching;
  const errore = anteprima.isError ? "Non sono riuscito a preparare il PDF. Riprova." : null;

  const datiConNote = dati ? { ...dati, note: note.trim() || null } : null;
  const nomeFile = dati ? nomeFileRendiconto(dati) : "Rendiconto.pdf";
  // Si manda il PDF dell'anteprima: note scritte dopo, senza aggiornarla, non partono.
  const noteDaAggiornare = !!pdf && (note.trim() || null) !== pdf.dati.note;
  const emailValida = EMAIL.test(destinatario.trim());
  const puoMandare = puoInviare && !!pdf && !inPreparazione && !noteDaAggiornare && emailValida && oggetto.trim().length > 0 && !invia.isPending;

  const scarica = () => {
    if (!pdf) return;
    const a = document.createElement("a");
    a.href = pdf.url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const manda = () => {
    if (!pdf || !puoMandare) return;
    invia.mutate(
      { fonteId, to: destinatario.trim(), subject: oggetto.trim(), message: messaggio.trim(), filename: nomeFile, pdf: pdf.blob, numeri: pdf.dati },
      {
        onSuccess: () => { toast.success(`Rendiconto inviato a ${destinatario.trim()}`); onOpenChange(false); },
        onError: (e) => toast.error("Rendiconto non inviato", { description: e instanceof Error ? e.message : "Riprova tra poco." }),
      },
    );
  };

  if (!fonte) return <p className="text-sm text-muted-foreground">Fonte non trovata.</p>;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rendiconto per {fonte.nome}</DialogTitle>
        <DialogDescription>Controlla l'anteprima: è il PDF che riceverà. Parte solo quando premi «Invia».</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative min-h-[60vh] rounded-md border bg-muted/30">
          {pdf && <iframe title="Anteprima del rendiconto" src={pdf.url} className="h-full min-h-[60vh] w-full rounded-md" />}
          {(inPreparazione || azienda.isLoading) && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparo il PDF…
            </div>
          )}
          {errore && <p className="p-4 text-sm text-destructive">{errore}</p>}
        </div>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); manda(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="rend-note">Note nel PDF <span className="font-normal text-muted-foreground">(facoltative)</span></Label>
            <Textarea id="rend-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} />
            <Button type="button" variant="outline" size="sm" onClick={() => setRichiesti(datiConNote)} disabled={inPreparazione || !datiConNote}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Aggiorna l'anteprima
            </Button>
            {noteDaAggiornare && <p className="text-xs text-amber-700 dark:text-amber-400">Le note cambiate entrano nel PDF quando aggiorni l'anteprima.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rend-a">Invia a</Label>
            <Input id="rend-a" type="email" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} aria-invalid={(destinatario !== "" && !emailValida) || undefined} />
            {!fonte.email && destinatario === "" && (
              <p className="text-xs text-muted-foreground">Questa fonte non ha un'email: scrivila qui, o aggiungila nella fonte per le prossime volte.</p>
            )}
            {destinatario !== "" && !emailValida && <p className="text-xs text-destructive">L'indirizzo email non sembra giusto.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rend-oggetto">Oggetto</Label>
            <Input id="rend-oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rend-messaggio">Messaggio</Label>
            <p className="text-xs text-muted-foreground">Comincia con «Gentile {fonte.nome},».</p>
            <Textarea id="rend-messaggio" rows={6} value={messaggio} onChange={(e) => setMessaggio(e.target.value)} maxLength={4000} />
          </div>
          {!puoInviare && <p className="text-xs text-muted-foreground">Puoi scaricare il PDF; per inviarlo serve il permesso di modificare la commessa.</p>}
        </form>
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Chiudi</Button>
        <Button type="button" variant="outline" onClick={scarica} disabled={!pdf || inPreparazione}>
          <Download className="mr-1.5 h-4 w-4" /> Scarica
        </Button>
        {puoInviare && (
          <Button type="button" onClick={manda} disabled={!puoMandare}>
            {invia.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
            Invia{emailValida ? ` a ${destinatario.trim()}` : ""}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
