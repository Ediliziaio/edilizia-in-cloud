import { useEffect, useRef, useState } from "react";
import { AudioLines, Headphones } from "lucide-react";
import { VoiceActivity } from "@/components/ui/fish-agent-pipeline";
import { italianVoiceDate, italianVoiceTime, italianVoicePhone } from "../../../supabase/functions/_shared/fishItalianSpeech";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const defaultText = "Buongiorno, sono l’assistente virtuale della sua impresa. Come posso aiutarla?";
const giuliaText = "Buongiorno, sono Giulia, l’assistente virtuale. La chiamo per la sua richiesta sui serramenti. È un buon momento?";

export function FishVoicePreview({ companyId, agentId, ready, firstMessage, localPreview = false }: {
  companyId: string;
  agentId: string;
  ready: boolean;
  firstMessage?: string | null;
  localPreview?: boolean;
}) {
  const t = useT();
  const initialText = firstMessage?.trim() || (localPreview ? giuliaText : defaultText);
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function speak() {
    setBusy(true);
    setPlaying(false);
    setError("");
    setUrl("");
    try {
      const { audio_base64 } = await callFishAgent<{ audio_base64: string }>(companyId, agentId, "preview_voice", { text: text.trim() });
      if (!live.current) return;
      const bytes = Uint8Array.from(atob(audio_base64), char => char.charCodeAt(0));
      setUrl(URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })));
    } catch (cause) {
      if (live.current) setError(cause instanceof Error ? cause.message : t("Prova voce non disponibile."));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <section className="space-y-3" aria-label={t("Prova della voce Fish")}>
      <div className="space-y-1.5">
        <Label htmlFor={`fish-speech-${agentId}`}>{t("Testo da ascoltare")}</Label>
        <Textarea id={`fish-speech-${agentId}`} rows={3} maxLength={500} value={text} onChange={event => setText(event.target.value)} className="rounded-xl bg-muted/25" />
      </div>
      <div className="flex flex-wrap gap-2" aria-label={t("Esempi di pronuncia")}>
        <Button size="sm" variant="outline" onClick={() => setText(initialText)}>{t("Saluto")}</Button>
        <Button size="sm" variant="outline" onClick={() => setText(`Il sopralluogo è ${italianVoiceDate("2026-11-26")}, alle ${italianVoiceTime("10:30").replace(/^le /, "")}. Le torna?`)}>{t("Data e ora")}</Button>
        <Button size="sm" variant="outline" onClick={() => setText(`Il recapito di prova è ${italianVoicePhone("0200000001")}. È corretto?`)}>{t("Recapito")}</Button>
      </div>
      <details className="rounded-md border px-2.5 py-2">
        <summary className="cursor-pointer text-xs font-medium">{t("Pause e intonazione")}</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setText(value => ("[break] " + value).slice(0, 500))}>{t("Pausa breve")}</Button>
          <Button size="sm" variant="outline" onClick={() => setText(value => ("[sighing] " + value).slice(0, 500))}>{t("Sospiro")}</Button>
          <Button size="sm" variant="outline" onClick={() => setText(value => ("[chuckling] " + value).slice(0, 500))}>{t("Sorriso nella voce")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setText(value => value.replace(/\[[^\]]+\]\s*/g, ""))}>{t("Rimuovi effetti")}</Button>
        </div>
      </details>
      <Button disabled={!ready || busy || !text.trim()} onClick={speak} className="eic-motion-button gap-2">
        {busy ? <VoiceActivity /> : <AudioLines aria-hidden="true" className="size-4" />}
        {busy ? t("Preparazione audio…") : localPreview ? t("Genera audio con Drama 3") : t("Genera prova voce Fish")}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {url && (
        <div className="eic-workspace-header eic-motion-enter space-y-2 p-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-sky-950 dark:text-sky-100" role="status">
            {playing ? <VoiceActivity /> : <Headphones aria-hidden="true" className="size-4" />}
            {playing ? t("In riproduzione") : t("Audio pronto")}
          </div>
          <audio controls src={url} className="block w-full" aria-label={t("Audio di prova del centralino Fish")}
            onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onWaiting={() => setPlaying(false)} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {localPreview ? t("Fish Audio legge il testo di prova con Giulia e Drama 3. Usa dati fittizi.") : t("La prova usa la voce salvata e il credito API Fish.")}
      </p>
    </section>
  );
}
