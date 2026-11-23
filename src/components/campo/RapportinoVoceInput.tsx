import { ArrowLeft, Check, ClipboardList, Loader2, Mic, WifiOff } from "lucide-react";
import CampoAudioRecorder from "@/components/campo/CampoAudioRecorder";
import { useRapportinoVocale, type MaterialeUsato } from "@/hooks/campo/useRapportinoVocale";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { oreInTesto } from "@/lib/campo/regoleCampo";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export interface PropostaRapportino {
  descrizione: string;
  ore: number | null;
  materiali: MaterialeUsato[];
}

interface Props {
  orderId: string;
  workDay: string;
  proponiOre: boolean;
  proponiMateriali: boolean;
  onApply: (proposta: PropostaRapportino) => void;
  onClose: () => void;
}

export function RapportinoVoceInput({ orderId, workDay, proponiOre, proponiMateriali, onApply, onClose }: Props) {
  const t = useT();
  const { processAudio, uploading, transcribing, draft, resetDraft, error } = useRapportinoVocale();
  const online = useNetworkStatus();
  const occupato = uploading || transcribing;

  const estratti = draft?.dati_estratti;
  const ore = estratti?.ore_lavorate;
  const proposta = draft && {
    descrizione: [estratti?.lavorazione, estratti?.note].filter(Boolean).join(" — ") || draft.trascrizione,
    ore: proponiOre && typeof ore === "number" && Number.isFinite(ore) && ore >= 0 && ore <= 24 ? ore : null,
    materiali: proponiMateriali
      ? (estratti?.materiali ?? []).filter(m => m.nome?.trim() && Number.isFinite(m.quantita) && m.quantita > 0)
      : [],
  };

  return (
    <section aria-label={t("Compila parlando")} className="campo-audio-entrata space-y-3 rounded-2xl border border-primary/20 bg-background p-3 shadow-sm sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {proposta ? <ClipboardList className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{proposta ? t("Controlla la proposta vocale") : t("Racconta la giornata")}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {proposta ? t("Scegli se inserire questi dati e rivedili nel modulo prima di inviare.")
              : t("Descrivi i lavori svolti. Dopo il riascolto puoi farti proporre i campi da inserire.")}
          </p>
        </div>
      </div>

      {proposta ? (
        <>
          <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border bg-muted/35 p-3 text-sm">
            {proposta.descrizione && <div>
              <p className="font-semibold text-foreground">{t("Descrizione da aggiungere")}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{proposta.descrizione}</p>
            </div>}
            {proposta.ore !== null && <p>{t("Ore proposte")} <strong className="ml-1">{oreInTesto(proposta.ore)}</strong></p>}
            {proposta.materiali.length > 0 && <div>
              <p className="font-semibold text-foreground">{t("Materiali proposti")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {proposta.materiali.map((m, i) => <li key={`${m.nome}-${i}`}>{m.nome} · {m.quantita.toLocaleString(intlCampo())} {m.unita}</li>)}
              </ul>
            </div>}
          </div>
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground motion-safe:transition-transform motion-safe:active:scale-[0.98]"
            onClick={() => onApply(proposta)}
          >
            <Check className="size-4" aria-hidden="true" /> {t("Inserisci nel rapportino")}
          </button>
        </>
      ) : (
        <>
          <CampoAudioRecorder
            onConfirm={async (blob, durata, mime) => { await processAudio(blob, durata, mime, orderId, workDay); }}
            disabled={occupato}
            confirmAvailable={online}
            confirmLabel={t("Trascrivi audio")}
          />
          {!online && <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-2.5 text-sm text-foreground">
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("Puoi registrare e riascoltare qui. Torna online per trascrivere.")}
          </p>}
          {occupato && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            {uploading ? t("Caricamento dell’audio…") : t("Preparazione della proposta…")}
          </p>}
          {error && <p role="alert" className="rounded-xl bg-destructive/5 p-2.5 text-sm text-destructive">{error}</p>}
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <button type="button" disabled={occupato} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary disabled:opacity-50" onClick={onClose}>
          <ArrowLeft className="size-4" aria-hidden="true" /> {t("Torna a scrivere")}
        </button>
        {proposta && <button type="button" className="min-h-11 text-sm font-semibold text-primary" onClick={resetDraft}>{t("Registra di nuovo")}</button>}
      </div>
    </section>
  );
}
