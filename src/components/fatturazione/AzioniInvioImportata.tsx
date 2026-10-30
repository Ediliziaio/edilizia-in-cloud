import { useEffect, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * «Stampa PDF» e «Invia per e-mail» di una fattura importata da un altro gestionale.
 * Non creano né modificano il documento: lo stampano dai dati importati
 * (generate-invoice-pdf) e lo spediscono al cliente (send-invoice-email), come
 * faceva il vecchio dettaglio di /azienda/fatturazione/:id.
 */
export interface FatturaDaInviare {
  id: string;
  numero: string;
  tipo: "fattura" | "nota_credito" | "proforma" | string;
  cliente: string | null;
  emailCliente: string | null;
  dataEmissione: string | null;
  dataScadenza: string | null;
  totale: number;
}

const ETICHETTA: Record<string, string> = { nota_credito: "Nota di credito", proforma: "Proforma" };

export function AzioniInvioImportata({ fattura, nomeAzienda }: { fattura: FatturaDaInviare; nomeAzienda?: string | null }) {
  const isMobile = useIsMobile();
  const [aperto, setAperto] = useState(false);
  const [destinatario, setDestinatario] = useState("");
  const [oggetto, setOggetto] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [invio, setInvio] = useState(false);
  const [stampa, setStampa] = useState(false);
  const etichetta = ETICHETTA[fattura.tipo] ?? "Fattura";

  // Precompila solo i campi vuoti: le modifiche dell'utente restano.
  useEffect(() => {
    if (!aperto) return;
    const azienda = nomeAzienda || "";
    if (fattura.emailCliente) setDestinatario((p) => p || fattura.emailCliente!);
    setOggetto((p) => p || `${etichetta} N° ${fattura.numero || "—"}${azienda ? ` — ${azienda}` : ""}`);
    setMessaggio((p) => {
      if (p) return p;
      const data = fattura.dataEmissione ? format(new Date(fattura.dataEmissione), "dd/MM/yyyy", { locale: it }) : "";
      const scadenza = fattura.dataScadenza ? format(new Date(fattura.dataScadenza), "dd/MM/yyyy", { locale: it }) : "";
      return [
        `Gentile ${fattura.cliente || "Cliente"},`,
        ``,
        `in allegato trovate la ${etichetta.toLowerCase()} N° ${fattura.numero || "—"}${data ? ` del ${data}` : ""} per un importo di ${formatCurrency(fattura.totale)}.`,
        scadenza ? `Vi ricordiamo che il termine di pagamento è il ${scadenza}.` : ``,
        `Per qualsiasi necessità restiamo a vostra disposizione.`,
        ``,
        `Cordiali saluti,`,
        azienda || `Lo staff`,
      ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
    });
  }, [aperto, fattura, etichetta, nomeAzienda]);

  const stampaPdf = async () => {
    setStampa(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", { body: { invoice_id: fattura.id } });
      if (error) throw error;
      const html = data?.html;
      if (!html) throw new Error("Il PDF è arrivato vuoto");
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
    } catch (e) {
      toast.error("PDF non preparato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setStampa(false);
    }
  };

  const invia = async () => {
    if (!destinatario) { toast.error("Inserisci un indirizzo email"); return; }
    setInvio(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoice_id: fattura.id, to_email: destinatario, subject: oggetto || undefined, message: messaggio || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Email inviata", { description: `${etichetta} inviata a ${destinatario}` });
      setAperto(false);
      setMessaggio("");
    } catch (e) {
      toast.error("Email non inviata", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setInvio(false);
    }
  };

  return (
    <>
      {/* Niente stampa da telefono. */}
      <Button size="sm" variant="secondary" className="gap-1.5 max-sm:hidden" disabled={stampa} onClick={() => void stampaPdf()}>
        {stampa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Stampa PDF
      </Button>
      <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setAperto(true)}>
        <Mail className="h-4 w-4" />Invia per e-mail
      </Button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invia {etichetta.toLowerCase()} per e-mail</DialogTitle>
            <DialogDescription className="max-sm:sr-only">Il cliente riceve un'email con il riepilogo del documento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-sm:space-y-3 max-sm:py-0">
            <div>
              <Label>Email destinatario *</Label>
              <Input type="email" value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="cliente@esempio.it" />
            </div>
            <div>
              <Label>Oggetto</Label>
              <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
            </div>
            <div>
              <Label>Messaggio</Label>
              <Textarea value={messaggio} onChange={(e) => setMessaggio(e.target.value)} rows={isMobile ? 6 : 9} className="resize-y" />
              <p className="mt-1 text-xs text-muted-foreground max-sm:hidden">Il riepilogo del documento (righe e totali) viene aggiunto sotto il messaggio.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAperto(false)} className="max-sm:hidden">Annulla</Button>
            <Button onClick={() => void invia()} disabled={invio || !destinatario}>
              {invio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}Invia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
