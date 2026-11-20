import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TIPI_DOCUMENTO_CANTIERE, URL_DOCUMENTI_CANTIERE, type TipoDocumentoCantiere } from "@/lib/commesse/documentiCantiere";

interface Props {
  orderId: string;
  codice?: string;
  documenti: { id: string; file_name: string; cantiere_tipo?: TipoDocumentoCantiere | null }[];
  onClose: () => void;
}

type AzioneQr = { tipo: "salva" } | { tipo: "revoca"; revisione: string };

function stampaQr(png: string, codice?: string) {
  const scheda = window.open("about:blank", "_blank");
  if (!scheda) return toast.error("Consenti l’apertura delle finestre per stampare il QR");
  scheda.opener = null;
  const doc = scheda.document;
  doc.title = "Cartello documenti di cantiere";
  const css = doc.createElement("style");
  css.textContent = "body{margin:0;font:17pt system-ui;color:#112a45}main{max-width:160mm;margin:20mm auto;padding:12mm;text-align:center;border:2px solid #112a45;border-radius:6mm}h1{font-size:32pt;margin:.3em 0}img{display:block;width:95mm;height:95mm;margin:6mm auto}p{margin:.4em 0}button{display:block;margin:10mm auto;padding:.6em;font:inherit}@media print{button{display:none}}";
  doc.head.append(css);
  const main = doc.createElement("main");
  const titolo = doc.createElement("h1");
  titolo.textContent = "Documenti di cantiere";
  const commessa = doc.createElement("p");
  commessa.textContent = codice ? `Commessa ${codice}` : "";
  const immagine = doc.createElement("img");
  immagine.alt = "QR dei documenti di cantiere";
  immagine.src = png;
  const azione = doc.createElement("p");
  azione.textContent = "Inquadra il QR per consultare e scaricare i documenti.";
  const stampa = doc.createElement("button");
  stampa.textContent = "Stampa";
  stampa.onclick = () => scheda.print();
  main.append(titolo, commessa, immagine, azione);
  doc.body.append(main, stampa);
  void immagine.decode().then(() => scheda.print()).catch(() => toast.error("Impossibile aprire l’immagine del QR"));
}

export function QrCantiereDialog({ orderId, codice, documenti, onClose }: Props) {
  const key = ["commessa-qr-cantiere", orderId];
  const cache = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: async () => {
    const { data, error } = await supabase.from("commessa_qr_cantiere").select("token, documento_ids, revisione").eq("order_id", orderId).maybeSingle();
    if (error) throw error;
    return data;
  }, retry: false });
  const [bozza, setBozza] = useState<{ revisione: string | null; ids: string[] } | null>(null);
  const [confermaRevoca, setConfermaRevoca] = useState<string | null>(null);
  const [mostraLink, setMostraLink] = useState(false);
  const [png, setPng] = useState<{ url: string; immagine: string } | null>(null);
  const attivo = query.data;
  const correnti = attivo?.documento_ids ?? [];
  const revisione = attivo?.revisione ?? null;
  const cambiatoAltrove = bozza !== null && bozza.revisione !== revisione;
  const setScelta = (ids: string[]) => setBozza({ revisione, ids });
  const selezionati = documenti.filter(doc => (bozza?.ids ?? correnti).includes(doc.id)).map(doc => doc.id);
  const tuttiSelezionati = selezionati.length === documenti.length;
  const estranei = correnti.length - correnti.filter(id => documenti.some(doc => doc.id === id)).length;
  const modificato = selezionati.length !== correnti.length || selezionati.some(id => !correnti.includes(id));
  const url = attivo ? new URL(`${URL_DOCUMENTI_CANTIERE}#${attivo.token}`, window.location.origin).href : "";

  const immagine = png?.url === url ? png.immagine : "";
  useEffect(() => {
    if (!url) return;
    let attuale = true;
    void import("qrcode").then(qr => qr.toDataURL(url, { width: 768, margin: 4, errorCorrectionLevel: "M" }))
      .then(png => { if (attuale) setPng({ url, immagine: png }); })
      .catch(() => { if (attuale) toast.error("Impossibile generare l’immagine del QR"); });
    return () => { attuale = false; };
  }, [url]);

  const mutazione = useMutation({
    mutationFn: async (azione: AzioneQr) => {
      if (azione.tipo === "revoca") {
        const { data, error } = await supabase.from("commessa_qr_cantiere").delete()
          .eq("order_id", orderId).eq("revisione", azione.revisione).select("order_id").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("QR modificato da un altro utente");
        return null;
      }
      if (!bozza || cambiatoAltrove) throw new Error("Il QR è stato aggiornato nel frattempo");
      const tabella = supabase.from("commessa_qr_cantiere");
      const comando = bozza.revisione
        ? tabella.update({ documento_ids: selezionati, revisione: crypto.randomUUID() }).eq("order_id", orderId).eq("revisione", bozza.revisione)
        : tabella.insert({ order_id: orderId, documento_ids: selezionati });
      const { data, error } = await comando.select("token, documento_ids, revisione").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (risultato, azione) => {
      cache.setQueryData(key, risultato);
      setBozza(null);
      setConfermaRevoca(null);
      setMostraLink(false);
      toast.success(azione.tipo === "revoca" ? "QR revocato" : attivo ? "Documenti del QR aggiornati" : "QR attivato");
    },
    onError: () => { toast.error("Modifiche al QR non salvate. Verifica i permessi e ricarica lo stato."); void query.refetch(); },
  });

  async function copiaLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiato");
    } catch {
      setMostraLink(true);
    }
  }

  return <>
    <Dialog open onOpenChange={open => { if (!open && !mutazione.isPending) onClose(); }}>
      <DialogContent className="flex max-h-[88dvh] max-w-2xl flex-col overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" /> QR documenti di cantiere</DialogTitle>
          <DialogDescription>Chiunque abbia il QR può consultare e scaricare i documenti selezionati. Controlla che siano adatti alla condivisione in cantiere.</DialogDescription>
        </DialogHeader>
        {query.isPending ? <p role="status" className="text-sm">Caricamento del QR…</p> : query.isError ? <div role="alert" className="space-y-2 text-sm">
          <p>Stato del QR non disponibile.</p><Button variant="outline" onClick={() => void query.refetch()}>Riprova</Button>
        </div> : <>
          {attivo && <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/40 p-3">
            {immagine && <img src={immagine} alt="QR dei documenti di cantiere" className="h-28 w-28 rounded bg-white" width={112} height={112} />}
            <div className="flex-1 space-y-2"><p className="text-sm font-medium">QR attivo{!correnti.length && " · Nessun documento condiviso"}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => stampaQr(immagine, codice)} disabled={!immagine}><Printer className="mr-2 h-4 w-4" /> Stampa QR</Button>
                <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Apri pagina</a></Button>
                <Button size="sm" variant="ghost" onClick={() => void copiaLink()}><Copy className="mr-2 h-4 w-4" /> Copia link</Button>
              </div>
              {mostraLink && <Input aria-label="Link da copiare" value={url} readOnly onFocus={e => e.currentTarget.select()} />}
            </div>
          </div>}
          {cambiatoAltrove && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted p-3 text-sm">
            <span>La selezione del QR è cambiata mentre la stavi modificando.</span>
            <Button size="sm" variant="outline" onClick={() => setBozza(null)}>Carica le modifiche più recenti</Button>
          </div>}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Documenti da mostrare <span className="font-normal text-muted-foreground">· {selezionati.length} selezionati</span></p>
              {documenti.length > 1 && <Button variant="ghost" size="sm" disabled={mutazione.isPending || cambiatoAltrove}
                onClick={() => setScelta(tuttiSelezionati ? [] : documenti.map(doc => doc.id))}>
                {tuttiSelezionati ? "Azzera selezione" : "Seleziona tutti"}
              </Button>}
            </div>
            {estranei > 0 && <p className="text-xs text-amber-700">Alcuni documenti del QR sono stati rimossi o hanno cambiato riservatezza o revisione.</p>}
            {documenti.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Carica un documento di cantiere con accesso operativo. Le revisioni in lavorazione o superate non sono disponibili per il QR.</p> :
              <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                {documenti.map(doc => <label key={doc.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox checked={selezionati.includes(doc.id)} disabled={mutazione.isPending || cambiatoAltrove}
                    onCheckedChange={valore => setScelta(valore ? [...selezionati, doc.id] : selezionati.filter(id => id !== doc.id))} />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{doc.file_name}<span className="block text-xs text-muted-foreground">{doc.cantiere_tipo && TIPI_DOCUMENTO_CANTIERE[doc.cantiere_tipo]}</span></span>
                </label>)}
              </div>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
            {attivo && <Button variant="ghost" className="mr-auto text-destructive" disabled={mutazione.isPending} onClick={() => setConfermaRevoca(attivo.revisione)}>Revoca QR</Button>}
            <Button variant="outline" onClick={onClose} disabled={mutazione.isPending}>Chiudi</Button>
            <Button disabled={mutazione.isPending || cambiatoAltrove || !bozza || !modificato || (!attivo && selezionati.length === 0)} onClick={() => mutazione.mutate({ tipo: "salva" })}>
              {mutazione.isPending ? "Salvataggio…" : attivo ? "Aggiorna documenti" : "Attiva e genera QR"}
            </Button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={confermaRevoca !== null} onOpenChange={open => { if (!open) setConfermaRevoca(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revocare il QR?</AlertDialogTitle>
        <AlertDialogDescription>{confermaRevoca !== revisione
          ? "Il QR è cambiato. Chiudi questa conferma e aprila di nuovo per revocare il QR attuale."
          : "Il cartello già stampato smetterà di aprire la pagina. Se lo riattivi, dovrai stampare il nuovo QR."}</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction
        disabled={mutazione.isPending || !confermaRevoca || confermaRevoca !== revisione}
        onClick={() => { if (confermaRevoca) mutazione.mutate({ tipo: "revoca", revisione: confermaRevoca }); }}
      >Revoca QR</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
}
