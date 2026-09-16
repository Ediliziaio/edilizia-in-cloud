/**
 * Scelta dei documenti personali mentre si crea il cliente: per ogni tipo si
 * aggiungono quanti file servono (fronte e retro), nessuno obbligatorio.
 * Si caricano quando il cliente viene creato.
 */
import { Button } from "@/components/ui/button";
import { Paperclip, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ACCEPT_INPUT } from "@/lib/commesse/documentiCommessa";
import {
  TIPI_DOCUMENTO_CLIENTE,
  aggiungiFileCliente,
  togliFileCliente,
  type FileDocumentiCliente,
} from "@/lib/clienti/documentiCliente";
import { fmtBytes } from "@/components/orders/filePreviewUtils";

export function DocumentiClienteInput({
  value,
  onChange,
  idPrefisso,
  compatto = false,
}: {
  value: FileDocumentiCliente;
  onChange: (v: FileDocumentiCliente) => void;
  /** Prefisso per gli id degli input (due istanze nella stessa pagina). */
  idPrefisso: string;
  compatto?: boolean;
}) {
  return (
    <div className="space-y-2">
      {TIPI_DOCUMENTO_CLIENTE.map(({ tipo, etichetta, aiuto }) => {
        const lista = value[tipo] ?? [];
        const id = `${idPrefisso}-${tipo}`;
        return (
          <div key={tipo} className={`rounded-md border bg-background ${compatto ? "p-2" : "p-3"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`${compatto ? "text-xs" : "text-sm"} font-medium`}>
                  {etichetta}
                  {lista.length > 0 && <span className="ml-1.5 text-muted-foreground tabular-nums">({lista.length})</span>}
                </p>
                {!compatto && <p className="text-xs text-muted-foreground">{aiuto}</p>}
              </div>
              <input
                id={id}
                type="file"
                multiple
                accept={ACCEPT_INPUT}
                className="hidden"
                onChange={(e) => {
                  const { valore, scartati } = aggiungiFileCliente(value, tipo, Array.from(e.target.files ?? []));
                  scartati.forEach((s) => toast.error("File escluso", { description: s }));
                  onChange(valore);
                  e.target.value = "";
                }}
              />
              <Button asChild type="button" variant="outline" size="sm" className={compatto ? "h-8 px-2 text-xs shrink-0" : "shrink-0"}>
                <label htmlFor={id} className="cursor-pointer">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                </label>
              </Button>
            </div>
            {lista.length > 0 && (
              <ul className="mt-2 space-y-1">
                {lista.map((f, i) => (
                  <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 text-xs">
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 min-w-0" title={f.name}>{f.name}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{fmtBytes(f.size)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => onChange(togliFileCliente(value, tipo, i))}
                      aria-label={`Togli ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
