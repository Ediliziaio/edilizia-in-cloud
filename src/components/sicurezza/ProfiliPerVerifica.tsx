import { useState } from "react";
import { useProfiliRequisiti } from "@/hooks/useProfiliRequisiti";
import {
  cercaProfili,
  criteriDaProfilo,
  erroreCaricamentoProfilo,
} from "@/lib/sicurezza/profiliRequisiti";
import type { CriterioItp } from "@/lib/sicurezza/itp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function ProfiliPerVerifica({
  companyId,
  criteri,
  onChange,
  onError,
}: {
  companyId: string;
  criteri: readonly CriterioItp[];
  onChange: (c: CriterioItp[]) => void;
  onError: (message: string) => void;
}) {
  const q = useProfiliRequisiti(companyId);
  const [cerca, setCerca] = useState("");
  const [scelta, setScelta] = useState("");
  const scelto = q.data?.find((p) => p.id === scelta);
  const usati = [
    ...new Map(
      criteri
        .filter((c) => c.profilo_snapshot)
        .map((c) => [c.profilo_id, c.profilo_snapshot!]),
    ).values(),
  ];
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <h4 className="font-medium">Parti da un profilo aziendale</h4>
      <p className="text-xs text-muted-foreground">
        Controlla attività, ruoli e limiti della versione scelta. Il caricamento
        mantiene tutti i criteri da valutare; non seleziona persone, file o
        esiti.
      </p>
      {q.isError ? (
        <p role="alert">
          Libreria profili non disponibile.{" "}
          <Button variant="link" onClick={() => void q.refetch()}>
            Riprova
          </Button>
        </p>
      ) : (
        <>
          <Input
            aria-label="Cerca profilo da applicare"
            placeholder="Cerca per attività o ruolo…"
            value={cerca}
            onChange={(e) => {
              setCerca(e.target.value);
              setScelta("");
            }}
          />
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Profilo requisiti da caricare"
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              value={scelta}
              onChange={(e) => setScelta(e.target.value)}
            >
              <option value="">
                {q.isLoading
                  ? "Caricamento profili…"
                  : "Scegli una versione del profilo…"}
              </option>
              {cercaProfili(q.data ?? [], cerca)
                .filter((v) => !v.archiviato || v.id === scelta)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome} · v{v.versione}
                    {v.archiviato ? " · archiviato" : ""}
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              disabled={!scelto || q.isLoading}
              onClick={() => {
                if (!scelto) return;
                const errore = erroreCaricamentoProfilo(scelto, criteri);
                if (errore) {
                  onError(errore);
                  return;
                }
                onChange([...criteri, ...criteriDaProfilo(scelto)]);
                setScelta("");
                onError("");
              }}
            >
              Carica criteri del profilo
            </Button>
          </div>
          {!q.isLoading && !q.data?.some((v) => !v.archiviato) && (
            <p className="text-xs text-muted-foreground">
              Nessun profilo attivo. Puoi definirlo dalla libreria aziendale
              oppure compilare i criteri del caso.
            </p>
          )}
        </>
      )}
      {scelto && (
        <div className="text-sm">
          <p>
            <strong>Attività:</strong> {scelto.attivita}
          </p>
          <p>
            <strong>Ruoli:</strong> {scelto.ruoli}
          </p>
          <p>
            <strong>Limiti:</strong> {scelto.limiti}
          </p>
          <p>{scelto.criteri.length} criteri da esaminare</p>
        </div>
      )}
      {usati.map((v) => (
        <div
          key={v.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background p-2 text-sm"
        >
          <span>
            {v.nome} · v{v.versione}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange(criteri.filter((c) => c.profilo_id !== v.id))
            }
          >
            Rimuovi intero profilo {v.nome}
          </Button>
        </div>
      ))}
    </div>
  );
}
