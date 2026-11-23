import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Scadenza } from "@/hooks/useScadenzario";
import type { ModificaScadenza } from "@/lib/finance/modificaScadenza";
import { messaggioErroreOperazione } from "@/lib/operazioniPerRiga";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ModificaScadenzaDialog({ scadenza: s, onClose, onConfirm, isPending }: {
  scadenza: Scadenza; onClose: () => void; onConfirm: (dati: ModificaScadenza) => Promise<unknown>; isPending: boolean;
}) {
  const t = useT();
  const [dati, setDati] = useState({ description: s.description, amount: String(s.amount), due_date: s.due_date ?? "", payment_method: s.payment_method ?? "", notes: s.notes ?? "" });
  const [errore, setErrore] = useState("");
  const invio = useRef(false);
  const cambia = (campo: keyof typeof dati, valore: string) => setDati((prima) => ({ ...prima, [campo]: valore }));
  const importo = Number(dati.amount.replace(",", "."));
  const valida = dati.description.trim() && Number.isFinite(importo) && importo > 0 && dati.due_date;
  return <Dialog open onOpenChange={(v) => { if (!v && !isPending && !invio.current) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{t("Modifica scadenza")}</DialogTitle><DialogDescription>{t("Correggi la scadenza manuale ancora aperta. I pagamenti si registrano dall'elenco.")}</DialogDescription></DialogHeader>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!valida || isPending || invio.current) return;
        invio.current = true; setErrore("");
        try { await onConfirm({ ...dati, description: dati.description.trim(), amount: importo }); }
        catch (err) { setErrore(messaggioErroreOperazione(err, t("Scadenza non modificata. Riprova."))); }
        finally { invio.current = false; }
      }}>
        <fieldset disabled={isPending} className="space-y-4">
          <div className="space-y-1"><Label htmlFor="scadenza-descrizione">{t("Descrizione")}</Label><Input id="scadenza-descrizione" value={dati.description} maxLength={500} onChange={(e) => cambia("description", e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="scadenza-importo">{t("Importo (€)")}</Label><Input id="scadenza-importo" inputMode="decimal" value={dati.amount} onChange={(e) => cambia("amount", e.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="scadenza-data">{t("Scadenza")}</Label><Input id="scadenza-data" type="date" value={dati.due_date} onChange={(e) => cambia("due_date", e.target.value)} required /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="scadenza-metodo">{t("Metodo di pagamento")}</Label><Input id="scadenza-metodo" value={dati.payment_method} maxLength={80} onChange={(e) => cambia("payment_method", e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="scadenza-note">{t("Note")}</Label><Textarea id="scadenza-note" value={dati.notes} onChange={(e) => cambia("notes", e.target.value)} /></div>
        </fieldset>
        {errore && <p role="alert" className="mt-3 text-sm text-destructive">{errore}</p>}
        <DialogFooter className="mt-4"><Button type="button" variant="outline" disabled={isPending} onClick={onClose}>{t("Annulla")}</Button><Button type="submit" disabled={isPending || !valida}>{isPending ? t("Salvataggio…") : t("Salva modifiche")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
