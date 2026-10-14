/** La voce propone campi: non invia rapportini, ore, materiali o avanzamenti. */
import { useState } from "react";
import CampoAudioRecorder from "@/components/campo/CampoAudioRecorder";
import { useRapportinoVocale, type RapportinoVocaleDraft } from "@/hooks/campo/useRapportinoVocale";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";

export function RapportinoVoceInput({ orderId, workDay, onApply, onClose }: {
  orderId: string; workDay: string; onApply: (draft: RapportinoVocaleDraft) => void; onClose: () => void;
}) {
  const { processAudio, uploading, transcribing, error } = useRapportinoVocale();
  const online = useNetworkStatus();
  const [erroreLocale, setErroreLocale] = useState("");
  return <section aria-label="Compila parlando" className="space-y-3 rounded-xl border bg-background p-3">
    <p className="text-sm">Racconta la giornata. L’AI propone i campi; poi li controlli nel rapportino prima di inviarli.</p>
    {!online ? <p role="status" className="text-sm text-amber-800">La trascrizione richiede internet. Puoi scrivere il rapportino e conservarlo come bozza sul telefono.</p> :
      <CampoAudioRecorder onConfirm={async (blob, durata, mime) => {
        setErroreLocale("");
        try {
          const draft = await processAudio(blob, durata, mime, orderId, workDay);
          if (draft) onApply(draft);
          else setErroreLocale("Non riesco a trascrivere. Puoi riprovare oppure scrivere.");
        } catch { setErroreLocale("Non riesco a trascrivere. Puoi riprovare oppure scrivere."); }
      }} disabled={uploading || transcribing} />}
    {(uploading || transcribing) && <p role="status">Trascrivo la registrazione…</p>}
    {(erroreLocale || error) && <p role="alert" className="text-sm text-destructive">{erroreLocale || error}</p>}
    <button type="button" disabled={uploading || transcribing} className="min-h-11 text-primary underline" onClick={onClose}>Torna a scrivere</button>
  </section>;
}
