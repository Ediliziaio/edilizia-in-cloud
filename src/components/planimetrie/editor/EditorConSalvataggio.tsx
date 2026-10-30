/**
 * L'editor dentro una pagina dell'app: testata con «Salva», avvisi, conflitto di
 * versione. La pianta si crea al primo salvataggio (se non esiste ancora), poi ogni
 * salvataggio è una versione nuova; alla fine si torna alla scheda della pianta.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Info, Loader2, RotateCcw, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { chiaviPlanimetrie, creaPlanimetria, salvaNuovaVersione, type OrigineVersione } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import EditorPlanimetria from "./EditorPlanimetria";
import type { Planimetria } from "./adattatore";
import { salvaPianta } from "./salvataggio";

interface Props {
  companyId: string;
  titoloPagina: string;
  indietro: string;
  /** La pianta da aprire; senza, una pianta vuota. */
  iniziale?: Planimetria;
  /** Pianta già salvata: si aggiunge una versione. Senza: si crea al primo salvataggio. */
  planimetriaId?: string;
  versioneAttesa?: number;
  /** Per una pianta nuova: il nome proposto. */
  titoloProposto?: string;
  /** Da dove viene la pianta (per la prima versione salvata). */
  origine?: OrigineVersione;
  /** Frasi da mostrare sopra il disegno (es. «controlla le misure del bagno»). */
  avvisi?: string[];
  /** Un riquadro sopra il disegno, per esempio la conferma della scala. */
  sopra?: ReactNode;
}

export function EditorConSalvataggio({
  companyId,
  titoloPagina,
  indietro,
  iniziale,
  planimetriaId,
  versioneAttesa,
  titoloProposto = "",
  origine = "manuale",
  avvisi = [],
  sopra,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [titolo, setTitolo] = useState(titoloProposto);
  const [salvando, setSalvando] = useState(false);
  const [conflitto, setConflitto] = useState<string | null>(null);
  const documento = useRef<Planimetria | null>(null);
  const cambi = useRef(0);
  const [modificata, setModificata] = useState(!planimetriaId && !!iniziale);

  const nuova = !planimetriaId;

  const suCambio = useCallback((p: Planimetria) => {
    documento.current = p;
    // il primo arriva all'apertura: non è una modifica
    cambi.current += 1;
    if (cambi.current > 1) setModificata(true);
  }, []);

  // Uscendo con modifiche non salvate, il browser chiede conferma.
  useEffect(() => {
    if (!modificata) return;
    const avvisa = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avvisa);
    return () => window.removeEventListener("beforeunload", avvisa);
  }, [modificata]);

  const salva = async () => {
    if (!documento.current) return;
    setSalvando(true);
    const esito = await salvaPianta(
      { crea: creaPlanimetria, salva: salvaNuovaVersione },
      {
        companyId,
        documento: documento.current,
        planimetriaId,
        titolo,
        versioneAttesa,
        // la prima versione dice da dove viene la pianta (a mano, dall'AI…); le successive sono modifiche a mano
        origine: nuova ? origine : "manuale",
      },
    );
    setSalvando(false);
    if (esito.ok === false) {
      if (esito.conflitto) setConflitto(esito.messaggio);
      else toast.error(esito.messaggio);
      return;
    }
    setModificata(false);
    await queryClient.invalidateQueries({ queryKey: chiaviPlanimetrie.tutte });
    toast.success(esito.creata ? "Pianta salvata" : `Pianta salvata (versione ${esito.versione})`);
    navigate(percorsiPlanimetrie.pianta(esito.id));
  };

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col gap-3 pb-2">
      <TestataPlanimetrie
        indietro={indietro}
        titolo={titoloPagina}
        sottotitolo={modificata ? "Ci sono modifiche da salvare." : nuova ? undefined : "Nessuna modifica da salvare."}
        azioni={
          <>
            {nuova && (
              <Input
                aria-label="Nome della pianta"
                value={titolo}
                maxLength={200}
                placeholder="Nome, es. Appartamento Rossi"
                className="h-9 w-64 max-md:w-44"
                onChange={(e) => setTitolo(e.target.value)}
              />
            )}
            <Button onClick={salva} disabled={salvando || (!modificata && !nuova) || (nuova && !titolo.trim())} className="bg-purple-600 hover:bg-purple-700">
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salva
            </Button>
          </>
        }
      />

      {conflitto && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{conflitto}</span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            <RotateCcw className="mr-2 h-4 w-4" /> Ricarica
          </Button>
        </div>
      )}

      {avvisi.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="space-y-0.5">
            {avvisi.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {sopra}

      <EditorPlanimetria className="min-h-0 flex-1" piantaIniziale={iniziale} onChange={suCambio} />
    </div>
  );
}
