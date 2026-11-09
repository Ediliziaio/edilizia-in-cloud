/**
 * La nota di una riga, scrivibile anche dopo (09/11/2026).
 *
 * In prima nota e nello scadenzario la nota si poteva mettere solo quando si
 * creava la riga, e poi non si vedeva più da nessuna parte: finiva nel CSV e
 * basta. Le righe nate da sole — una fattura pagata, un movimento di banca —
 * non avevano nemmeno quel momento.
 *
 * Eppure è proprio su quelle che serve scrivere: «pagato in contanti da
 * Mario», «è l'acconto del Comune, il saldo arriva a giugno», «questa è la
 * parte del cappotto, l'altra metà è sull'altra commessa». La nota non tocca
 * gli importi, quindi si può aggiungere sempre, anche a una riga automatica.
 */
import { useState } from "react";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const LIMITE_NOTA = 2000;

export function NotaRiga({
  nota,
  titolo,
  descrizione,
  solaLettura,
  onSalva,
}: {
  nota: string | null | undefined;
  /** Cosa si sta annotando: «Movimento del 12/03», «Scadenza Rossi». */
  titolo: string;
  /** Una riga che dice a cosa serve la nota, qui dentro. */
  descrizione?: string;
  solaLettura?: boolean;
  onSalva: (nota: string | null) => Promise<unknown>;
}) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const [salvo, setSalvo] = useState(false);
  const presente = !!nota?.trim();

  const apri = () => {
    setTesto(nota ?? "");
    setAperto(true);
  };

  const salva = async () => {
    const pulito = testo.trim();
    if (pulito === (nota ?? "").trim()) { setAperto(false); return; }
    setSalvo(true);
    try {
      await onSalva(pulito || null);
      setAperto(false);
    } catch {
      toast.error("Nota non salvata: riprova.");
    } finally {
      setSalvo(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={`h-7 w-7 ${presente ? "text-amber-600" : "text-muted-foreground/50"}`}
        aria-label={presente ? `Nota: ${nota}` : `Aggiungi una nota a ${titolo}`}
        title={presente ? (nota as string) : solaLettura ? "Nessuna nota" : "Aggiungi una nota"}
        onClick={apri}
      >
        <StickyNote className={`h-4 w-4 ${presente ? "fill-amber-100" : ""}`} aria-hidden="true" />
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => { if (!salvo) setAperto(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nota · {titolo}</DialogTitle>
            <DialogDescription>
              {descrizione ??
                "Resta attaccata a questa riga e non cambia gli importi. Si legge qui e finisce nelle esportazioni."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Testo della nota"
            value={testo}
            maxLength={LIMITE_NOTA}
            rows={5}
            disabled={solaLettura || salvo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="Es. pagato in contanti da Mario; è l'acconto, il saldo a giugno"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAperto(false)} disabled={salvo}>
              {solaLettura ? "Chiudi" : "Annulla"}
            </Button>
            {!solaLettura && (
              <Button onClick={() => { void salva(); }} disabled={salvo}>
                {salvo ? "Salvo…" : "Salva nota"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
