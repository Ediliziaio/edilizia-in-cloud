import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAvanzaPosEsterno, caricaPosEsterno, type ConsegnaPosEsterno } from "@/hooks/useAvvioSicurezza";
import { oggiSicurezza } from "@/lib/sicurezza/fascicolo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ConsegnaPosEsternoDialog({ consegna, ufficio, chiudi }: {
  consegna: ConsegnaPosEsterno;
  ufficio?: boolean;
  chiudi: () => void;
}) {
  const t = useT();
  const invia = useAvanzaPosEsterno();
  const [file, setFile] = useState<File>();
  const [revisione, setRevisione] = useState("");
  const [data, setData] = useState(oggiSicurezza);
  const [path, setPath] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState("");
  const invio = useRef(false);
  async function salva() {
    if (!file || !revisione.trim() || invio.current) return;
    invio.current = true;
    setOccupato(true);
    setErrore("");
    try {
      const originale = path || await caricaPosEsterno(consegna, file);
      setPath(originale);
      await invia.mutateAsync({
        consegna, azione: "ricevi", data: ufficio ? data : undefined,
        file: { path: originale, nome: file.name.slice(-220), revisione: revisione.trim() },
      });
      chiudi();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : t("Consegna non registrata. Riprova."));
    } finally {
      invio.current = false;
      setOccupato(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !invio.current) chiudi(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{ufficio ? t("Carica POS ricevuto") : t("Consegna il POS")}</DialogTitle>
          <DialogDescription>{t("{nome_commessa} · allega l’originale PDF, fino a 15 MB.", { nome_commessa: String(consegna.nome_commessa ?? "") })}</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void salva(); }} aria-busy={occupato}>
          <div className="space-y-1">
            <Label htmlFor="pos-esterno-revisione">{t("Revisione riportata sul documento")}</Label>
            <Input id="pos-esterno-revisione" maxLength={120} value={revisione} required disabled={occupato} onChange={(e) => setRevisione(e.target.value)} />
          </div>
          {ufficio && <div className="space-y-1">
            <Label htmlFor="pos-esterno-data">{t("Ricevuto il")}</Label>
            <Input id="pos-esterno-data" type="date" max={oggiSicurezza()} value={data} required disabled={occupato} onChange={(e) => setData(e.target.value)} />
          </div>}
          <div className="space-y-1">
            <Label htmlFor="pos-esterno-file">{t("File PDF")}</Label>
            <Input id="pos-esterno-file" type="file" accept=".pdf,application/pdf" required disabled={occupato} onChange={(e) => { setFile(e.target.files?.[0]); setPath(""); }} />
          </div>
          {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={chiudi} disabled={occupato}>{t("Chiudi")}</Button>
            <Button type="submit" disabled={occupato || !file || !revisione.trim() || (ufficio && !data)}><FileUp className="mr-2 h-4 w-4" />
              {occupato ? t("Registro la consegna…") : t("Registra consegna")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
