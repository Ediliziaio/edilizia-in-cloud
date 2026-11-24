/**
 * «Descrivilo all'AI»: un modello di sopralluogo da una descrizione (piano sopralluoghi, lotto 6).
 * L'AI scrive il modello (`ai-genera-modello-sopralluogo`, addebitata all'azienda), qui si vede
 * l'anteprima con quello che è stato corretto; il modello si crea solo confermando, e poi si
 * rifinisce nell'editor come gli altri.
 */
import { useState } from "react";
import { Camera, Loader2, Sparkles, X } from "lucide-react";
import { riduciFile } from "@/lib/commesse/riduciFoto";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateSchema } from "@/types/surveys";

interface Esito { schema: TemplateSchema; avvisi: string[] }

/** Le foto del foglio che si mandano all'AI: al massimo 4, immagini o PDF (lotto 7). */
const TIPI_FOGLIO = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FOGLI = 4;

async function inBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binario = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binario += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return btoa(binario);
}

export function GeneraModelloAi({ categoria, esito, onEsito }: {
  categoria: string;
  esito: Esito | null;
  onEsito: (e: Esito | null) => void;
}) {
  const companyId = useEffectiveCompanyId();
  const [descrizione, setDescrizione] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [fogli, setFogli] = useState<File[]>([]);

  const aggiungiFogli = async (lista: FileList | null) => {
    const scelti = Array.from(lista ?? []);
    const validi = scelti.filter((f) => TIPI_FOGLIO.includes(f.type));
    if (validi.length < scelti.length) setErrore("Solo foto (JPG, PNG, WebP) o PDF del foglio.");
    // Le foto del telefono pesano 3-6 MB: si riducono prima di mandarle (restano leggibili).
    const ridotti = await Promise.all(validi.map(async (f) => (await riduciFile(f)).file));
    setFogli((prima) => [...prima, ...ridotti].slice(0, MAX_FOGLI));
  };

  const genera = async () => {
    if (inCorso || !companyId) return;
    setInCorso(true);
    setErrore("");
    onEsito(null);
    try {
      const allegati = await Promise.all(fogli.map(async (f) => ({ media_type: f.type, data: await inBase64(f) })));
      const { data, error } = await supabase.functions.invoke("ai-genera-modello-sopralluogo", {
        body: { company_id: companyId, descrizione, categoria, ...(allegati.length ? { allegati } : {}) },
      });
      const risposta = data as { ok?: boolean; error?: string; schema?: TemplateSchema; avvisi?: string[] } | null;
      if (error || !risposta?.ok || !risposta.schema) {
        // supabase-js mette il corpo dell'errore nel contesto: si mostra il messaggio della funzione.
        const corpo = await (error as { context?: Response } | null)?.context?.json?.().catch((): null => null) as { error?: string } | null | undefined;
        throw new Error(risposta?.error || corpo?.error || "Modello non generato. Riprova.");
      }
      onEsito({ schema: risposta.schema, avvisi: risposta.avvisi ?? [] });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setInCorso(false);
    }
  };

  const tipi = esito?.schema.element_types ?? [];
  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor="modello-ai-descrizione" className="text-xs">Cosa deve rilevare il sopralluogo</Label>
        <Textarea
          id="modello-ai-descrizione"
          rows={4}
          value={descrizione}
          maxLength={4000}
          onChange={(e) => setDescrizione(e.target.value)}
          placeholder="Facoltativa se carichi il foglio. Es. Rifacimento bagno: misure della stanza, sanitari da togliere e da mettere, piatto doccia, rivestimenti a mq, posizione degli scarichi, stato dell'impianto elettrico."
        />
      </div>
      <div className="space-y-1.5">
        <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 text-sm hover:bg-muted/40">
          <Camera className="h-4 w-4" />
          {fogli.length ? "Aggiungi altre foto del foglio" : "Oppure: foto o PDF del vostro modulo su carta"}
          <input type="file" className="sr-only" accept={TIPI_FOGLIO.join(",")} multiple capture="environment"
            aria-label="Foto o PDF del modulo su carta" disabled={inCorso || fogli.length >= MAX_FOGLI}
            onChange={(e) => { void aggiungiFogli(e.target.files); e.target.value = ""; }} />
        </label>
        {fogli.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Fogli da leggere">
            {fogli.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                <span className="max-w-40 truncate">{f.name}</span>
                <button type="button" aria-label={`Togli ${f.name}`} onClick={() => setFogli((x) => x.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button type="button" variant="outline" className="w-full gap-2" disabled={inCorso || (descrizione.trim().length < 15 && !fogli.length)} onClick={genera}>
        {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {inCorso ? "Scrivo il modello… (fino a un minuto)" : esito ? "Rigenera" : "Genera l'anteprima"}
      </Button>
      <p className="text-[11px] text-muted-foreground">Usa il credito AI dell'azienda. Il modello si crea solo quando confermi.</p>
      {errore && <p role="alert" className="text-xs text-rose-700">{errore}</p>}
      {esito && (
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-2 text-xs" aria-label="Anteprima del modello">
          <p className="font-medium">
            {tipi.length} {tipi.length === 1 ? "tipo di elemento" : "tipi di elemento"} · {esito.schema.area_definition?.label_plural ?? "Ambienti"}
          </p>
          <ul className="space-y-0.5">
            {tipi.map((t) => {
              const campi = (t.sections ?? []).flatMap((s) => s.fields ?? []);
              const tecnici = campi.filter((f) => f.solo_tecnico).length;
              return (
                <li key={t.key}>
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground"> — {campi.length} campi{tecnici ? `, ${tecnici} solo per il tecnico` : ""}{esito.schema.output_mapping?.estimate_lines?.[t.key] ? ", riga di preventivo" : ""}</span>
                </li>
              );
            })}
          </ul>
          {esito.avvisi.length > 0 && (
            <details>
              <summary className="cursor-pointer text-amber-800">{esito.avvisi.length} correzioni fatte alla risposta dell'AI</summary>
              <ul className="mt-1 list-disc pl-4 text-amber-900">{esito.avvisi.map((a) => <li key={a}>{a}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
