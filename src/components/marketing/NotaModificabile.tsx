/**
 * Una nota di contatto o di opportunità, con la matita per correggerla.
 *
 * Stessa nota nella scheda opportunità e nella scheda contatto: il testo, chi
 * l'ha scritta e quando, e se è stata modificata. La matita compare solo a chi
 * la può modificare (lib/marketing/modificaNota); il database resta l'ultima
 * parola.
 */
import { useState, type ReactNode } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { dataOraNota, firmaNota, type ProfiloAutore } from "@/lib/marketing/autoreNota";
import { testoNotaDaSalvare } from "@/lib/marketing/modificaNota";
import { useModificaNota } from "@/hooks/useModificaNota";

export interface NotaDaMostrare {
  id: string;
  content: string | null;
  created_at: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  profiles?: ProfiloAutore | ProfiloAutore[] | null;
}

interface Props {
  nota: NotaDaMostrare;
  puoModificare: boolean;
  /** Pannello laterale stretto della scheda contatto. */
  compatta?: boolean;
  className?: string;
  /** Etichette sopra il testo (Opportunità, Contatto…). */
  intestazione?: ReactNode;
}

export function NotaModificabile({ nota, puoModificare, compatta = false, className, intestazione }: Props) {
  const [inModifica, setInModifica] = useState(false);
  const [testo, setTesto] = useState(nota.content ?? "");
  const modifica = useModificaNota();

  const apri = () => {
    setTesto(nota.content ?? "");
    setInModifica(true);
  };

  const salva = () => {
    const daSalvare = testoNotaDaSalvare(nota.content ?? "", testo);
    if (!daSalvare) {
      setInModifica(false);
      return;
    }
    modifica.mutate({ id: nota.id, content: daSalvare }, { onSuccess: () => setInModifica(false) });
  };

  const testoCls = compatta ? "text-[11px]" : "text-sm";
  const bottoneCls = compatta ? "h-6 px-2 text-[11px]" : "h-7";

  return (
    <div className={className}>
      {intestazione}
      {inModifica ? (
        <div className="space-y-1.5">
          <Textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            rows={compatta ? 3 : 4}
            className={testoCls}
            autoFocus
            aria-label="Testo della nota"
            onKeyDown={(e) => {
              if (e.key === "Escape") setInModifica(false);
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") salva();
            }}
          />
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={bottoneCls}
              onClick={() => setInModifica(false)}
              disabled={modifica.isPending}
            >
              Annulla
            </Button>
            <Button
              type="button"
              size="sm"
              className={bottoneCls}
              onClick={salva}
              disabled={modifica.isPending || !testo.trim()}
            >
              {modifica.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salva"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className={cn(testoCls, "flex-1 whitespace-pre-wrap break-words")}>{nota.content}</p>
          {puoModificare && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("shrink-0 text-muted-foreground hover:text-foreground", compatta ? "h-5 w-5" : "h-7 w-7")}
              onClick={apri}
              aria-label="Modifica nota"
              title="Modifica nota"
            >
              <Pencil className={compatta ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </Button>
          )}
        </div>
      )}
      {/* Chi l'ha scritta e quando; se corretta, anche quando. */}
      <p className={cn("text-muted-foreground", compatta ? "text-[10px]" : "mt-2 text-[11px]")}>
        {firmaNota(nota.created_at, nota.profiles)}
        {nota.updated_at ? ` · modificata ${dataOraNota(nota.updated_at)}` : ""}
      </p>
    </div>
  );
}
