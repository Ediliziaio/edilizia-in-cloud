// src/components/orders/generali/investitori/RendicontoDialog.tsx
// F7 «Rendere conto a un investitore»: anteprima del PDF con i suoi numeri → invio per
// email, solo con un clic esplicito su «Invia». Il PDF che parte è lo stesso dell'anteprima.
// Si sceglie la versione del piano e se mettere il piano voce per voce; «Scarica» dà il PDF
// con il piano, senza o tutti e due, e li salva nello storico (stato «scaricato»).
// @react-pdf/renderer arriva con un import dinamico all'apertura: è il pezzo pesante del bundle.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Download, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useGeneraleInvestitori, useInviaRendiconto } from "@/hooks/useGeneraleInvestitori";
import { DEFINIZIONI_MODELLI, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type { ContiInvestitori } from "@/lib/orders/generali/investitoriConti";
import type { VenditeUnita } from "@/lib/orders/generali/investitoriLettura";
import { datiRendiconto, nomeFileRendiconto, type DatiRendiconto } from "@/lib/orders/generali/investitoriRendiconto";
import type { NumeriInvestitori } from "@/lib/orders/generali/pianoConti";
import { nomeVersionePiano } from "@/lib/orders/generali/pianoLettura";
import { logger } from "@/utils/logger";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
      <DialogContent ampiezza="spazio" className="flex max-h-[94vh] max-w-5xl flex-col overflow-hidden">
        {props.open && <Contenuto {...props} />}
      </DialogContent>
    </Dialog>
  );
}

type Versione = "anteprima" | "con" | "senza" | "tutte";

function Contenuto({ onOpenChange, riepilogo, fonteId, conti, numeriPiano, vendite, oggi, puoInviare }: Props) {
  const t = useT();
  const azienda = useAzienda();
  const invia = useInviaRendiconto(riepilogo.generale.id);
  const archivia = useInviaRendiconto(riepilogo.generale.id);
  const fonte = conti.fonti.find((c) => c.fonte.id === fonteId)?.fonte ?? null;
  const [note, setNote] = useState("");
  // Le note entrano nel PDF con «Aggiorna l'anteprima»: finché non lo si preme vale la prima stesura.
  const [noteStampa, setNoteStampa] = useState<string | null>(null);
  const [conPiano, setConPiano] = useState(true);
  // null = la versione del piano che il modulo guarda di solito (l'approvata, se c'è).
  const [versioneId, setVersioneId] = useState<string | null>(null);
  const [destinatario, setDestinatario] = useState(fonte?.email ?? "");
  const [oggetto, setOggetto] = useState(`Rendiconto ${riepilogo.generale.nome}`);
  const [messaggio, setMessaggio] = useState(
    `le mandiamo il rendiconto aggiornato dell'operazione «${riepilogo.generale.nome}»: la sua posizione, come stanno andando lavori e vendite e quanto le spetta a fine operazione secondo la stima di oggi.\n\nPer qualunque domanda siamo a disposizione.`,
  );
  const [scarico, setScarico] = useState(false);

  // Con un'altra versione del piano cambiano anche i conti dell'investitore: si rifanno qui.
  // Senza scelta, stesse chiavi di cache del modulo: nessuna lettura in più.
  const inv = useGeneraleInvestitori(riepilogo);
  const invVersione = useGeneraleInvestitori(riepilogo, { versioneId, enabled: versioneId !== null });
  const sorgente = versioneId !== null ? invVersione : inv;
  const caricoVersione = versioneId !== null && invVersione.isLoading;
  const contiUsati = sorgente.isLoading ? conti : sorgente.conti;
  const numeriUsati = sorgente.isLoading ? numeriPiano : sorgente.numeriPiano;
  const versioni = inv.versioni ?? [];
  const versioneInVista = sorgente.versionePiano ?? null;

  const datiPer = useCallback(
    (piano: boolean): DatiRendiconto | null =>
      azienda.data && !caricoVersione
        ? datiRendiconto({
            oggi, riepilogo, numeri: numeriUsati, conti: contiUsati, fonteId, vendite, azienda: azienda.data,
            unitaNome: DEFINIZIONI_MODELLI[riepilogo.generale.modello].figlia.tante,
            note: noteStampa, conPiano: piano, versionePiano: versioneInVista,
          })
        : null,
    [azienda.data, caricoVersione, oggi, riepilogo, numeriUsati, contiUsati, fonteId, vendite, noteStampa, versioneInVista],
  );
  const dati = useMemo(() => datiPer(conPiano), [datiPer, conPiano]);

  // Il PDF dell'anteprima: si rifà solo quando cambiano i numeri da stampare.
  const anteprima = useQuery({
    queryKey: ["generale-rendiconto-pdf", dati],
    enabled: !!dati,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    meta: { silent: true },
    queryFn: async () => {
      const d = dati!;
      try {
        return { blob: await creaPdf(d), dati: d };
      } catch (e) {
        logger.error("RendicontoDialog", e);
        throw e;
      }
    },
  });
  const url = useMemo(() => (anteprima.data ? URL.createObjectURL(anteprima.data.blob) : null), [anteprima.data]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const pdf = anteprima.data && url ? { ...anteprima.data, url } : null;
  const inPreparazione = anteprima.isFetching || caricoVersione;
  const errore = anteprima.isError ? t("Non sono riuscito a preparare il PDF. Riprova.") : null;

  const nomeFile = pdf ? nomeFileRendiconto(pdf.dati) : "Rendiconto.pdf";
  // Si manda il PDF dell'anteprima: note scritte dopo, senza aggiornarla, non partono.
  const noteDaAggiornare = (note.trim() || null) !== noteStampa;
  const emailValida = EMAIL.test(destinatario.trim());
  const puoMandare = puoInviare && !!pdf && !inPreparazione && !noteDaAggiornare && emailValida && oggetto.trim().length > 0 && !invia.isPending;

  /**
   * Scarica una o più versioni del PDF (con il piano voce per voce, senza, o tutte e due) e,
   * a chi può modificare la commessa, le salva nello storico come «scaricato» per riaverle.
   */
  const scarica = async (quale: Versione) => {
    if (!pdf) return;
    setScarico(true);
    try {
      const scelte = quale === "anteprima" ? [pdf.dati.conPiano !== false] : quale === "con" ? [true] : quale === "senza" ? [false] : [true, false];
      const files: { blob: Blob; dati: DatiRendiconto }[] = [];
      for (const piano of scelte) {
        if ((pdf.dati.conPiano !== false) === piano) files.push({ blob: pdf.blob, dati: pdf.dati });
        else {
          const d = datiPer(piano);
          if (d) files.push({ blob: await creaPdf(d), dati: d });
        }
      }
      for (const f of files) salvaFile(f.blob, nomeFileRendiconto(f.dati));
      if (!puoInviare) {
        toast.success(files.length > 1 ? t("{n} PDF scaricati", { n: files.length }) : t("PDF scaricato"));
        return;
      }
      const esiti = await Promise.allSettled(files.map((f) => archivia.mutateAsync({
        fonteId, archivia: true, to: "", subject: "", message: "", filename: nomeFileRendiconto(f.dati), pdf: f.blob, numeri: f.dati,
      })));
      const salvati = esiti.filter((e) => e.status === "fulfilled").length;
      if (salvati === files.length) toast.success(files.length > 1 ? t("{n} PDF scaricati e salvati nello storico dei rendiconti", { n: files.length }) : t("PDF scaricato e salvati nello storico dei rendiconti"));
      else toast.warning(t("Scaricato, ma non salvato nello storico"), { description: t("Il file è sul tuo computer; riprova più tardi per averlo anche nello storico.") });
    } catch (e) {
      logger.error("RendicontoDialog scarica", e);
      toast.error(t("Non sono riuscito a preparare il PDF. Riprova."));
    } finally {
      setScarico(false);
    }
  };

  const manda = () => {
    if (!pdf || !puoMandare) return;
    invia.mutate(
      { fonteId, to: destinatario.trim(), subject: oggetto.trim(), message: messaggio.trim(), filename: nomeFile, pdf: pdf.blob, numeri: pdf.dati },
      {
        onSuccess: () => { toast.success(t("Rendiconto inviato a {email}", { email: destinatario.trim() })); onOpenChange(false); },
        onError: (e) => toast.error(t("Rendiconto non inviato"), { description: e instanceof Error ? e.message : t("Riprova tra poco.") }),
      },
    );
  };

  if (!fonte) return <p className="text-sm text-muted-foreground">{t("Fonte non trovata.")}</p>;

  const pianoPronto = !!numeriUsati?.righe && numeriUsati.righe.length > 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("Rendiconto per {nome}", { nome: fonte.nome })}</DialogTitle>
        <DialogDescription>{t("Controlla l'anteprima: è il PDF che riceverà. Parte solo quando premi «Invia».")}</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative min-h-[60vh] rounded-md border bg-muted/30">
          {pdf && <iframe title={t("Anteprima del rendiconto")} src={pdf.url} className="h-full min-h-[60vh] w-full rounded-md" />}
          {(inPreparazione || azienda.isLoading) && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Preparo il PDF…")}
            </div>
          )}
          {errore && <p className="p-4 text-sm text-destructive">{errore}</p>}
        </div>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); manda(); }}>
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{t("Cosa c'è nel PDF")}</legend>
            {versioni.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="rend-versione" className="text-xs">{t("Versione del piano")}</Label>
                <Select value={versioneId ?? inv.versionePiano?.id ?? ""} onValueChange={(v) => setVersioneId(v === inv.versionePiano?.id ? null : v)}>
                  <SelectTrigger id="rend-versione" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {versioni.map((v) => <SelectItem key={v.id} value={v.id}>{nomeVersionePiano(v)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("Cambiano il piano stampato e anche i conti dell'investitore.")}</p>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Checkbox id="rend-piano" checked={conPiano} onCheckedChange={(v) => setConPiano(v === true)} disabled={!pianoPronto} className="mt-0.5" />
              <Label htmlFor="rend-piano" className="text-sm font-normal leading-tight">
                {t("Includi il piano voce per voce")}
                <span className="block text-xs text-muted-foreground">
                  {pianoPronto ? t("Tabella per categoria, torta dei costi e cascata. Senza, restano solo i totali.") : t("Il piano non è ancora pronto: nel PDF ci sono solo i totali.")}
                </span>
              </Label>
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="rend-note">{t("Note nel PDF")} <span className="font-normal text-muted-foreground">{t("(facoltative)")}</span></Label>
            <Textarea id="rend-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1500} />
            <Button type="button" variant="outline" size="sm" onClick={() => setNoteStampa(note.trim() || null)} disabled={inPreparazione || !noteDaAggiornare}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {t("Aggiorna l'anteprima")}
            </Button>
            {noteDaAggiornare && <p className="text-xs text-amber-700 dark:text-amber-400">{t("Le note cambiate entrano nel PDF quando aggiorni l'anteprima.")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rend-a">{t("Invia a")}</Label>
            <Input id="rend-a" type="email" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} aria-invalid={(destinatario !== "" && !emailValida) || undefined} />
            {!fonte.email && destinatario === "" && (
              <p className="text-xs text-muted-foreground">{t("Questa fonte non ha un'email: scrivila qui, o aggiungila nella fonte per le prossime volte.")}</p>
            )}
            {destinatario !== "" && !emailValida && <p className="text-xs text-destructive">{t("L'indirizzo email non sembra giusto.")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rend-oggetto">{t("Oggetto")}</Label>
            <Input id="rend-oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rend-messaggio">{t("Messaggio")}</Label>
            <p className="text-xs text-muted-foreground">{t("Comincia con «Gentile {nome},».", { nome: fonte.nome })}</p>
            <Textarea id="rend-messaggio" rows={6} value={messaggio} onChange={(e) => setMessaggio(e.target.value)} maxLength={4000} />
          </div>
          {!puoInviare && <p className="text-xs text-muted-foreground">{t("Puoi scaricare il PDF; per inviarlo, e per salvarlo nello storico, serve il permesso di modificare la commessa.")}</p>}
        </form>
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("Chiudi")}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" disabled={!pdf || inPreparazione || scarico}>
              {scarico ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />} {t("Scarica")} <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void scarica("anteprima")}>{t("Il PDF dell'anteprima")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!pianoPronto} onSelect={() => void scarica("con")}>{t("Con il piano voce per voce")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void scarica("senza")}>{t("Senza il piano (solo i totali)")}</DropdownMenuItem>
            <DropdownMenuItem disabled={!pianoPronto} onSelect={() => void scarica("tutte")}>{t("Tutte e due le versioni")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {puoInviare && (
          <Button type="button" onClick={manda} disabled={!puoMandare}>
            {invia.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
            {emailValida ? t("Invia a {email}", { email: destinatario.trim() }) : t("Invia")}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

async function creaPdf(d: DatiRendiconto): Promise<Blob> {
  const { pdf: crea, Doc } = await caricaPdf();
  return crea(<Doc d={d} />).toBlob();
}

function salvaFile(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
