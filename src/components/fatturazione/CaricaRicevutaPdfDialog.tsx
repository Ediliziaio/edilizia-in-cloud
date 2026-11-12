import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { righeRicevutaPdf, problemiRicevutaPdf, type RicevutaPdfForm } from "@/lib/fatturazione/ricevutaPdf";

const VUOTO: RicevutaPdfForm = { fornitore: "", partitaIva: "", paese: "IT", numero: "", data: "", totale: "", indirizzo: "", cap: "", comune: "" };

/** Il PDF non è una fattura elettronica: i dati li scrive chi lo carica, il file resta allegato. */
export function CaricaRicevutaPdfDialog({
  file, companyId, onClose, onCaricata,
}: { file: File | null; companyId: string | null | undefined; onClose: () => void; onCaricata: () => void }) {
  const [form, setForm] = useState<RicevutaPdfForm>(VUOTO);
  const [salvo, setSalvo] = useState(false);
  useEffect(() => { if (file) setForm(VUOTO); }, [file]);

  const problemi = problemiRicevutaPdf(form);
  const campo = (k: keyof RicevutaPdfForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const salva = async () => {
    if (!file || !companyId || problemi.length > 0) return;
    setSalvo(true);
    const percorso = `${companyId}/ricevute-pdf/${crypto.randomUUID()}.pdf`;
    try {
      const { error: errFile } = await supabase.storage.from("documenti-fiscali").upload(percorso, file, { contentType: "application/pdf" });
      if (errFile) throw errFile;
      const { error } = await supabase.from("fatture_ricevute" as never).insert({
        company_id: companyId, ...righeRicevutaPdf(form),
        pdf_storage_bucket: "documenti-fiscali", pdf_storage_path: percorso,
      } as never);
      if (error) {
        await supabase.storage.from("documenti-fiscali").remove([percorso]);
        throw error;
      }
      toast.success("Fattura caricata");
      onCaricata();
    } catch (e) {
      toast.error("Fattura non caricata", { description: (e as { message?: string })?.message ?? "Errore sconosciuto" });
    } finally {
      setSalvo(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent struttura="scorrevole" ampiezza="modulo" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Carica fattura da PDF</DialogTitle>
          <DialogDescription>{file?.name}. Non muove l'IVA finché non fai l'integrazione o l'autofattura: l'indirizzo serve per quella.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label htmlFor="pdf-fornitore">Fornitore *</Label><Input id="pdf-fornitore" value={form.fornitore} onChange={campo("fornitore")} /></div>
          <div className="space-y-1"><Label htmlFor="pdf-piva">P.IVA o ID estero</Label><Input id="pdf-piva" value={form.partitaIva} onChange={campo("partitaIva")} /></div>
          <div className="space-y-1"><Label htmlFor="pdf-paese">Paese *</Label><Input id="pdf-paese" maxLength={2} className="uppercase" value={form.paese} onChange={campo("paese")} /></div>
          <div className="space-y-1"><Label htmlFor="pdf-numero">Numero *</Label><Input id="pdf-numero" value={form.numero} onChange={campo("numero")} /></div>
          <div className="space-y-1"><Label htmlFor="pdf-data">Data *</Label><Input id="pdf-data" type="date" value={form.data} onChange={campo("data")} /></div>
          <div className="col-span-2 space-y-1"><Label htmlFor="pdf-totale">Importo in euro *</Label><Input id="pdf-totale" inputMode="decimal" value={form.totale} onChange={campo("totale")} /></div>
          <div className="col-span-2 space-y-1"><Label htmlFor="pdf-indirizzo">Indirizzo *</Label><Input id="pdf-indirizzo" value={form.indirizzo} onChange={campo("indirizzo")} /></div>
          <div className="space-y-1"><Label htmlFor="pdf-cap">CAP</Label><Input id="pdf-cap" value={form.cap} onChange={campo("cap")} /></div>
          <div className="space-y-1"><Label htmlFor="pdf-comune">Comune *</Label><Input id="pdf-comune" value={form.comune} onChange={campo("comune")} /></div>
        </div>
        {problemi.length > 0 && <p className="text-xs text-amber-700">Manca: {problemi.join(", ")}.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => void salva()} disabled={salvo || problemi.length > 0}>{salvo ? "Salvo…" : "Carica"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
