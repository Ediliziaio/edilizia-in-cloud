// Impostazioni → Acquisti e materiali → Numerazione ordini ai fornitori.
// Senza numerazione propria gli ordini prendono ODA-AAAA-NNNN, come sempre.
// Il numero vero lo dà il database (generate_oda_number); qui si vede in anteprima.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RigaInterruttore, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useAnteprimaNumeroOda, useNumerazioneOda, type NumerazioneOda } from "@/hooks/useNumerazioneOda";
import { erroreFormatoOda, erroreProssimoOda, formattaNumeroOda, FORMATO_ODA_PREDEFINITO } from "@/lib/acquisti/numerazioneOda";

export default function NumerazioneOrdiniConfig({ puoModificare }: { puoModificare: boolean }) {
  const { numerazione, isLoading, salva } = useNumerazioneOda();
  const anteprima = useAnteprimaNumeroOda(null);
  // Riparte dai valori salvati quando arrivano o cambiano.
  const chiave = numerazione ? `${numerazione.formato}-${numerazione.prossimo}` : "nessuna";
  return (
    <Modulo key={chiave} salvata={numerazione} isLoading={isLoading} salva={salva}
      anteprima={anteprima.data ?? null} puoModificare={puoModificare} />
  );
}

function Modulo({ salvata, isLoading, salva, anteprima, puoModificare }: {
  salvata: NumerazioneOda | null;
  isLoading: boolean;
  salva: ReturnType<typeof useNumerazioneOda>["salva"];
  anteprima: string | null;
  puoModificare: boolean;
}) {
  const [attiva, setAttiva] = useState(!!salvata);
  const [formato, setFormato] = useState(salvata?.formato ?? FORMATO_ODA_PREDEFINITO);
  const [prossimo, setProssimo] = useState(salvata ? String(salvata.prossimo) : "");
  const bloccato = !puoModificare || isLoading || salva.isPending;

  const accendi = (v: boolean) => {
    if (!v) {
      setAttiva(false);
      if (salvata) salva.mutate(null);
      return;
    }
    // Parte dal numero che l'ordine prenderebbe oggi: ODA-2026-0055 → 55.
    if (!prossimo) setProssimo(String(Number(anteprima?.match(/(\d+)$/)?.[1] ?? 0) || 1));
    setAttiva(true);
  };

  const erroreF = attiva ? erroreFormatoOda(formato) : null;
  const erroreP = attiva ? erroreProssimoOda(prossimo) : null;
  const modificata = attiva && (!salvata || salvata.formato !== formato.trim() || String(salvata.prossimo) !== prossimo.trim());
  // Finché non è salvata si vede il numero scritto; salvata, quello che darà il database
  // (salta i numeri già usati a mano).
  const prossimoNumero = modificata
    ? (!erroreF && !erroreP ? formattaNumeroOda(formato, Number(prossimo)) : null)
    : anteprima;

  return (
    <SezioneImpostazione
      id="numerazione-ordini"
      titolo="Numerazione ordini ai fornitori"
      descrizione="Come si numerano gli ordini ai fornitori. Un fornitore può avere la sua numerazione, dalla sua scheda."
    >
      <RigaInterruttore
        id="numerazione-ordini-propria"
        titolo="Numerazione scelta dall'azienda"
        descrizione={attiva
          ? "Acceso: gli ordini prendono il formato e il prossimo numero scritti qui."
          : "Spento: ODA-anno-numero, per esempio ODA-2026-0001."}
        checked={attiva}
        disabled={bloccato}
        onCheckedChange={accendi}
      >
        {attiva && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1">
              <Label htmlFor="numerazione-formato" className="text-xs">Formato</Label>
              <Input id="numerazione-formato" value={formato} maxLength={40} disabled={bloccato}
                aria-invalid={!!erroreF} aria-describedby="numerazione-formato-aiuto"
                onChange={(e) => setFormato(e.target.value)} />
              <p id="numerazione-formato-aiuto" className="text-[11px] text-muted-foreground">
                {"{n}"} il numero, {"{n:4}"} con gli zeri davanti, {"{anno}"} 2026, {"{aa}"} 26. Solo il numero: {"{n}"}.
              </p>
              {erroreF && <p role="alert" className="text-xs text-destructive">{erroreF}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="numerazione-prossimo" className="text-xs">Prossimo numero</Label>
              <Input id="numerazione-prossimo" inputMode="numeric" className="text-right tabular-nums" value={prossimo}
                disabled={bloccato} aria-invalid={!!erroreP} onChange={(e) => setProssimo(e.target.value)} />
              {erroreP && <p role="alert" className="text-xs text-destructive">{erroreP}</p>}
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-sm" aria-live="polite">
            Il prossimo ordine sarà: <span className="font-mono font-semibold">{prossimoNumero ?? "…"}</span>
          </p>
          {modificata && puoModificare && (
            <Button type="button" size="sm" className="ml-auto" disabled={bloccato || !!erroreF || !!erroreP}
              onClick={() => salva.mutate({ formato: formato.trim(), prossimo: Number(prossimo) })}>
              {salva.isPending ? "Salvataggio…" : "Salva numerazione"}
            </Button>
          )}
        </div>
      </RigaInterruttore>
    </SezioneImpostazione>
  );
}
