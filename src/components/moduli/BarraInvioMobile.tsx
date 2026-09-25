/**
 * Barra in basso del passo PDF dei preventivatori, sul telefono: indietro ·
 * PDF (da mandare con WhatsApp, Mail… o da guardare) · l'azione principale,
 * che passa il chiamante (di solito «Invia per firma»). Sta dove stava la barra
 * dei passi prima, sopra la navigazione dell'app.
 */
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Eye, FileText, Loader2, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { condividiFile } from "@/lib/mobile/condividiFile";

interface Props {
  onIndietro: () => void;
  /** «Preventivo RST-2026-001»: titolo della condivisione e nome del file. */
  titolo: string;
  generaPdf: () => Promise<Blob>;
  /** Perché il PDF non si può ancora fare (computo vuoto…): al tocco si dice questo. */
  pdfBloccato?: string | null;
  /** L'azione principale, larga quanto resta della barra. */
  children: ReactNode;
}

export function BarraInvioMobile({ onIndietro, titolo, generaPdf, pdfBloccato, children }: Props) {
  const [pdfInCorso, setPdfInCorso] = useState(false);
  const pdfPronto = useRef<Promise<Blob> | null>(null);
  const nomeFile = `${titolo.replace(/[\\/:*?"<>|]+/g, "").trim() || "Preventivo"}.pdf`;

  // Il PDF si comincia a preparare quando si apre il menu: al tocco su «Manda»
  // spesso è già pronto, e il telefono non dà per scaduto il tocco.
  const preparaPdf = () => {
    if (!pdfPronto.current) {
      pdfPronto.current = generaPdf();
      pdfPronto.current.catch(() => { /* l'errore lo mostra chi aspetta il PDF */ });
    }
    return pdfPronto.current;
  };

  const usaPdf = async (azione: "manda" | "guarda") => {
    setPdfInCorso(true);
    try {
      const blob = await preparaPdf();
      if (azione === "manda") {
        const esito = await condividiFile(blob, nomeFile, titolo);
        if (esito === "serve-un-tocco") {
          toast.success("PDF pronto", {
            action: { label: "Manda", onClick: () => { void condividiFile(blob, nomeFile, titolo); } },
            duration: 10000,
          });
        }
        if (esito !== "non-supportato") return;
      }
      const url = URL.createObjectURL(blob);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (!window.open(url, "_blank")) {
        toast.success("PDF pronto", {
          action: { label: "Apri", onClick: () => window.open(url, "_blank") },
          duration: 10000,
        });
      }
    } catch (e) {
      toast.error("PDF non generato", { description: e instanceof Error ? e.message : "Riprova." });
    } finally {
      pdfPronto.current = null;
      setPdfInCorso(false);
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-2xl border bg-background/95 px-3 py-2.5 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur">
      <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={onIndietro} aria-label="Indietro">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      {pdfBloccato ? (
        <Button
          variant="outline"
          className="h-11 shrink-0 gap-1.5 px-3 text-muted-foreground"
          onClick={() => toast.error(pdfBloccato)}
        >
          <FileText className="h-4 w-4" /> PDF
        </Button>
      ) : (
        <DropdownMenu
          onOpenChange={(aperto) => {
            // Chiuso senza scegliere: il prossimo PDF riparte dai dati di quel momento.
            if (aperto) void preparaPdf();
            else pdfPronto.current = null;
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-11 shrink-0 gap-1.5 px-3" disabled={pdfInCorso}>
              {pdfInCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              PDF
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => { void usaPdf("manda"); }}>
              <Share className="h-4 w-4" /> Manda il PDF
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => { void usaPdf("guarda"); }}>
              <Eye className="h-4 w-4" /> Guarda il PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {children}
    </div>
  );
}
