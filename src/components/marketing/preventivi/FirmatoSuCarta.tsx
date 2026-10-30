/**
 * Il preventivo firmato su carta diventa il contratto (29/10/2026).
 *
 * «Firmato su carta»: l'ufficio carica la scansione, indica il giorno e chi ha
 * firmato; il database (preventivo_firmato_su_carta) controlla che il file ci
 * sia e lo rende «accettata» come la firma digitale. La scansione sta in
 * quote-pdfs/<azienda>/contratti-carta/<preventivo>/ e non si sovrascrive né
 * si cancella.
 *
 * ContrattoFirmatoCard: come è stato firmato e il documento, da aprire.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSignature, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import {
  ACCETTA_SCANSIONE, documentoFirmato, ETICHETTA_FIRMA, modoFirma, percorsoContrattoCarta, scansioneValida,
} from "@/lib/preventivi/contrattoFirmato";

// La funzione nuova non è nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Il giorno di qui (il database confronta col giorno di Roma).
const oggi = () => new Date().toLocaleDateString("en-CA");

export function FirmatoSuCartaDialog({ open, onOpenChange, quote }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: { id: string; company_id: string; client_name?: string | null; quote_number?: string | null };
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [giorno, setGiorno] = useState(oggi());
  const [firmatario, setFirmatario] = useState(quote.client_name ?? "");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const conferma = async () => {
    setErrore(null);
    if (!file) { setErrore("Carica la scansione del contratto firmato."); return; }
    const nonValido = scansioneValida(file);
    if (nonValido) { setErrore(nonValido); return; }
    if (!giorno || giorno > oggi()) { setErrore("Indica il giorno della firma (non nel futuro)."); return; }
    if (!firmatario.trim()) { setErrore("Indica chi ha firmato."); return; }
    setSalvando(true);
    try {
      // Prima il controllo (stato, permesso, data, firmatario), poi il file: una scansione caricata
      // non si cancella più, e non deve restare orfana se la firma viene rifiutata.
      const { error: verifica } = await db.rpc("preventivo_firmato_su_carta", {
        p_quote: quote.id, p_path: null, p_nome: null, p_mime: null,
        p_firmato_il: giorno, p_firmatario: firmatario.trim(), p_solo_verifica: true,
      });
      if (verifica) throw verifica;
      const path = percorsoContrattoCarta(quote.company_id, quote.id, file.name);
      const { error: caricamento } = await supabase.storage.from("quote-pdfs")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (caricamento) throw caricamento;
      const { error } = await db.rpc("preventivo_firmato_su_carta", {
        p_quote: quote.id, p_path: path, p_nome: file.name, p_mime: file.type || null,
        p_firmato_il: giorno, p_firmatario: firmatario.trim(),
      });
      if (error) throw error;
      toast.success(`${quote.quote_number ?? "Il preventivo"} è firmato: ora è il contratto.`, {
        description: "Puoi creare la commessa.",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(quote.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      onOpenChange(false);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Firma non registrata: riprova.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!salvando) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Firmato su carta</DialogTitle>
          <DialogDescription>
            Il cliente ha firmato il preventivo stampato? Carica la scansione: il preventivo diventa il contratto, come con la
            firma digitale, e il documento resta collegato. Non si può sostituire né cancellare.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Scansione del contratto firmato</span>
            <Input type="file" accept={ACCETTA_SCANSIONE} aria-label="Scansione del contratto firmato"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrore(null); }} />
            <span className="block text-xs text-muted-foreground">PDF o foto, fino a 20 MB. Tutte le pagine, con la firma.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Firmato il</span>
              <Input type="date" value={giorno} max={oggi()} onChange={(e) => setGiorno(e.target.value)} aria-label="Firmato il" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Firmato da</span>
              <Input value={firmatario} onChange={(e) => setFirmatario(e.target.value)} aria-label="Firmato da" placeholder="Nome e cognome" />
            </label>
          </div>
          {errore && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{errore}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={salvando} onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button disabled={salvando} onClick={conferma}>
            <FileSignature className="mr-1.5 h-4 w-4" aria-hidden />{salvando ? "Registro la firma…" : "Registra la firma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContrattoFirmatoCard({ quote }: {
  quote: { firma_modo?: string | null; signed_at?: string | null; signed_by_name?: string | null; signed_by_ip?: string | null; contratto_firmato?: unknown };
}) {
  const modo = modoFirma(quote);
  const documento = documentoFirmato(quote.contratto_firmato);
  if (!modo && !documento) return null;
  const giorno = quote.signed_at ? new Date(quote.signed_at).toLocaleDateString("it-IT") : null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 text-sm">
        <FileSignature className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
        <span className="font-medium text-foreground">{modo ? ETICHETTA_FIRMA[modo] : "Contratto firmato"}</span>
        <span className="text-muted-foreground">
          {[giorno && `il ${giorno}`, quote.signed_by_name && `da ${quote.signed_by_name}`].filter(Boolean).join(" ")}
        </span>
        {documento && (
          <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => openAttachmentInTab(documento.path, documento.bucket)}>
            <Paperclip className="mr-1.5 h-3.5 w-3.5" aria-hidden />Apri il contratto firmato
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
