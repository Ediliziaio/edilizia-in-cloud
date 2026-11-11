import { italianVoiceDate,italianVoiceTime,italianVoicePhone } from "../../../supabase/functions/_shared/fishItalianSpeech";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { toast } from "sonner";

export function FishVoicePreview({ companyId, agentId, ready, firstMessage }: { companyId: string; agentId: string; ready: boolean; firstMessage?: string | null }) {
  const [text, setText] = useState(firstMessage || "Buongiorno, sono l'assistente virtuale della sua impresa. Posso aiutarla con un sopralluogo o con una richiesta sul suo lavoro?");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function speak() {
    setBusy(true);
    try {
      const data = await callFishAgent<{ audio_base64: string; mime_type: string }>(companyId, agentId, "preview_voice", { text });
      const bytes = Uint8Array.from(atob(data.audio_base64), char => char.charCodeAt(0));
      setUrl(URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Prova voce non disponibile"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t pt-4" aria-label="Prova della voce Fish">
    <h3 className="font-medium">Ascolta la voce dell’agente</h3>
    <Label htmlFor={`fish-speech-${agentId}`}>Messaggio di prova</Label>
    <Textarea id={`fish-speech-${agentId}`} maxLength={500} value={text} onChange={event => setText(event.target.value)} />
    <div className="flex flex-wrap gap-2" aria-label="Prove di pronuncia"><Button size="sm" variant="outline" onClick={()=>setText(`Il sopralluogo è ${italianVoiceDate("2026-11-18")}, alle ${italianVoiceTime("10:30").replace(/^le /, "")}. Preferisce questo orario oppure le tre del pomeriggio?`)}>Date e orari</Button><Button size="sm" variant="outline" onClick={()=>setText(`Le ripeto il numero di esempio: ${italianVoicePhone("3471234567")}. L’indirizzo fittizio è via Roma venticinque, a Brescia. È corretto?`)}>Telefono e indirizzo</Button></div>
    <div className="flex flex-wrap gap-2" aria-label="Indicazioni espressive"><Button size="sm" variant="outline" onClick={() => setText(value => ("[break] " + value).slice(0, 500))}>Pausa breve</Button><Button size="sm" variant="outline" onClick={() => setText(value => ("[sighing] " + value).slice(0, 500))}>Sospiro</Button><Button size="sm" variant="outline" onClick={() => setText(value => ("[chuckling] " + value).slice(0, 500))}>Sorriso nella voce</Button><Button size="sm" variant="ghost" onClick={() => setText(value => value.replace(/\[[^\]]+\]\s*/g, ""))}>Rimuovi indicazioni</Button></div><p className="text-xs leading-5 text-muted-foreground">Gli effetti dipendono dalla voce e dal contesto. Confrontali qui; nel dialogo la modalità espressiva gestisce l’intonazione senza aggiungere un sospiro a ogni risposta.</p>
    <Button variant="outline" disabled={!ready || busy || !text.trim()} onClick={speak}>{busy ? "Preparazione audio…" : "Genera prova voce Fish"}</Button>
    <p className="text-xs text-muted-foreground">La prova usa la voce configurata e il credito API Fish. Non effettua una telefonata. Puoi cambiare il testo per verificare nomi, date e pronuncia.</p>
    {url && <audio controls src={url} className="w-full" aria-label="Audio di prova del centralino Fish" />}
  </section>;
}
