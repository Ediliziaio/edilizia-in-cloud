/**
 * La testata del pannello di destra: due interruttori e il pulsante per
 * nasconderlo. Sotto va il contenuto: l'anteprima veloce o il PDF vero.
 *
 * - «Anteprima | PDF vero»: la veloce si ricalcola a ogni tasto; il PDF vero è il
 *   documento definitivo e pesa di più (solo dove il modulo lo sa mostrare).
 * - «Cliente | Impresa»: l'impresa vede costi e margine. Il pulsante compare
 *   SOLO a chi può vedere i margini (`puoVedereImpresa`): è la stessa regola
 *   della vista margini dello step Economia.
 */
import type { ReactNode } from "react";
import { PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VistaAnteprima } from "@/lib/preventivatore/anteprima";

export type ModalitaAnteprima = "veloce" | "pdf";

interface Props {
  children: ReactNode;
  modalita?: ModalitaAnteprima;
  onModalita?: (m: ModalitaAnteprima) => void;
  /** Il modulo sa mostrare il PDF vero dal vivo. */
  pdfDisponibile?: boolean;
  vista?: VistaAnteprima;
  onVista?: (v: VistaAnteprima) => void;
  puoVedereImpresa?: boolean;
  onNascondi?: () => void;
  /** Una riga sotto il contenuto: cosa è e cosa non è questa anteprima. */
  nota?: ReactNode;
  className?: string;
}

function Interruttore<T extends string>({
  valore, opzioni, onChange, etichetta,
}: {
  valore: T;
  opzioni: Array<{ v: T; label: string }>;
  onChange?: (v: T) => void;
  etichetta: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px] font-medium" role="group" aria-label={etichetta}>
      {opzioni.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={valore === o.v}
          onClick={() => onChange?.(o.v)}
          className={cn("tap-compact rounded px-2.5 py-1", valore === o.v ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PannelloAnteprima({
  children, modalita = "veloce", onModalita, pdfDisponibile, vista = "cliente", onVista, puoVedereImpresa, onNascondi, nota, className,
}: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {pdfDisponibile && (
          <Interruttore
            etichetta="Che anteprima vedere"
            valore={modalita}
            onChange={onModalita}
            opzioni={[{ v: "veloce", label: "Anteprima" }, { v: "pdf", label: "PDF vero" }]}
          />
        )}
        {puoVedereImpresa && modalita === "veloce" && (
          <Interruttore
            etichetta="Per chi è l'anteprima"
            valore={vista}
            onChange={onVista}
            opzioni={[{ v: "cliente", label: "Cliente" }, { v: "impresa", label: "Impresa" }]}
          />
        )}
        {onNascondi && (
          <button
            type="button"
            onClick={onNascondi}
            title="Nascondi l'anteprima"
            aria-label="Nascondi l'anteprima"
            className="tap-compact ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <PanelRightClose className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
      {nota && <p className="px-0.5 text-[11px] leading-snug text-slate-500">{nota}</p>}
    </div>
  );
}
