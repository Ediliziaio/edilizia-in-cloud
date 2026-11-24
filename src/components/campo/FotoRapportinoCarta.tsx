/**
 * «Hai il rapportino di carta? Fotografalo» (24/11/2026, richiesta del founder). Il capo squadra che scrive ancora
 * sul foglio scatta la foto: l'AI la legge con le fasi, le persone, i mezzi e i materiali di QUESTO cantiere
 * (`ai-rapportini-da-documento`, la stessa lettura dei documenti dell'ufficio) e il rapportino si compila.
 * Non si salva niente finché non si manda: si controlla come ogni rapportino.
 */
import { useState } from "react";
import { FileImage, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/campo/compressImage";
import { cn } from "@/lib/utils";
import { PILLOLA } from "@/lib/campo/stileCampo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { RapportinoLetto } from "../../../supabase/functions/ai-rapportini-da-documento/mappa";

const inBase64 = (b: Blob) => new Promise<string>((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => ko(r.error);
  r.readAsDataURL(b);
});

/** Il rapportino della giornata scelta, se il foglio ne ha più di uno; altrimenti il primo. */
export function rapportinoDelGiorno(letti: RapportinoLetto[], giorno: string): RapportinoLetto | null {
  return letti.find(r => r.data === giorno) ?? letti[0] ?? null;
}

export function FotoRapportinoCarta({ orderId, companyId, workDay, disabilitato, onLetto }: {
  orderId: string;
  companyId: string;
  workDay: string;
  disabilitato?: boolean;
  onLetto: (r: RapportinoLetto, avvisi: string[]) => void;
}) {
  const t = useT();
  const [legge, setLegge] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const leggi = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setErrore(null);
    setLegge(true);
    try {
      const blob = (await compressImage(f, 2000, 0.8).catch((): null => null)) ?? f;
      const { data, error } = await supabase.functions.invoke("ai-rapportini-da-documento", {
        body: { order_id: orderId, company_id: companyId, files: [{ base64: await inBase64(blob), mime: blob === f ? f.type : "image/jpeg", name: f.name }] },
      });
      if (error) throw error;
      const letti = ((data as { rapportini?: RapportinoLetto[] })?.rapportini ?? []);
      const r = rapportinoDelGiorno(letti, workDay);
      if (!r) { setErrore(t("Non riesco a leggere il foglio. Rifai la foto dall'alto, con il foglio intero e ben illuminato.")); return; }
      onLetto(r, ((data as { avvisi?: string[] })?.avvisi ?? []));
    } catch {
      setErrore(t("Lettura non riuscita. Riprova, o scrivi il rapportino."));
    } finally {
      setLegge(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className={cn(PILLOLA, "relative w-full cursor-pointer", (disabilitato || legge) && "pointer-events-none opacity-60")}>
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={disabilitato || legge}
          aria-label={t("Fotografa il rapportino di carta")}
          onChange={e => { void leggi(e.target.files); e.target.value = ""; }} />
        {legge ? <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : <FileImage className="size-4 shrink-0" aria-hidden="true" />}
        {legge ? t("Leggo il foglio…") : t("Hai il foglio di carta? Fotografalo")}
      </label>
      {errore && <p role="alert" className="rounded-xl bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{errore}</p>}
    </div>
  );
}
