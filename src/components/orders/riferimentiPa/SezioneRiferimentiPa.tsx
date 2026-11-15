/**
 * Sezione «Dati appalto e fatturazione PA» dentro la creazione e la modifica della commessa.
 * Si vede da sola se il cliente è una PA; per privati e aziende si accende a mano (es. un
 * finanziamento pubblico con CUP). Le righe si salvano col modulo, con salvaRiferimentiPa.
 */
import { Landmark } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BozzaRiferimentoPa, FonteRiferimentoEsistente } from "@/lib/orders/riferimentiPa";
import { RiferimentiPaEditor } from "./RiferimentiPaEditor";

interface Props {
  clientePa: boolean;
  attivo: boolean;
  onAttivoChange: (v: boolean) => void;
  bozze: BozzaRiferimentoPa[];
  onChange: (b: BozzaRiferimentoPa[]) => void;
  fonti?: FonteRiferimentoEsistente[];
  disabilitato?: boolean;
}

export function SezioneRiferimentiPa({ clientePa, attivo, onAttivoChange, bozze, onChange, fonti, disabilitato }: Props) {
  const visibile = clientePa || attivo;
  return (
    <section aria-labelledby="sezione-riferimenti-pa" className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Landmark className="h-4 w-4 text-slate-600" aria-hidden="true" />
        <h2 id="sezione-riferimenti-pa" className="text-base font-semibold">Dati appalto e fatturazione PA</h2>
        {clientePa ? (
          <span className="ml-auto rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-900">Cliente Pubblica Amministrazione</span>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="riferimenti-pa-attivi" className="text-sm">{attivo ? "Attivi" : "Spenti"}</Label>
            <Switch id="riferimenti-pa-attivi" checked={attivo} disabled={disabilitato} onCheckedChange={onAttivoChange} aria-label="Usa i dati appalto e fatturazione PA" />
          </div>
        )}
      </div>
      {!visibile ? (
        <p className="text-sm text-muted-foreground">Per privati e aziende servono solo in casi particolari, per esempio un lavoro con finanziamento pubblico che chiede il CUP in fattura.</p>
      ) : (
        <RiferimentiPaEditor bozze={bozze} onChange={onChange} fonti={fonti} disabilitato={disabilitato} />
      )}
    </section>
  );
}
