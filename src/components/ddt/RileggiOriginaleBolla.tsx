/**
 * «Rileggi l'originale» (23/11/2026): una bolla scritta a mano con l'originale allegato può farsi
 * leggere dopo. L'AI legge il file e qui si propone SOLO quello che manca — righe mai scritte,
 * targa, autista, vettore — da spuntare. Niente si sovrascrive: chi ha scritto ha ragione.
 * Consuma credito AI come la lettura della bolla nuova (ddt-ai-extract).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useDDTRighe, useDDTRigheMutations } from "@/hooks/useDDTRicezione";
import { queryKeys } from "@/lib/queryKeys";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";
import { completaBolla, type Completamento, type TestataBolla } from "@/lib/ddt/rileggiBolla";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

const ETICHETTE: Record<keyof TestataBolla, string> = {
  targa_mezzo: "Targa", autista_nome: "Autista", corriere: "Vettore", trasporto_a_cura_di: "Chi l'ha portata", porto: "Porto",
};
const TRASPORTO: Record<string, string> = { fornitore: "il fornitore", noi: "noi (ritiro)", terzi: "un corriere" };

async function inBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function RileggiOriginaleBolla({ ddt, fileUrl }: {
  ddt: TestataBolla & { id: string; company_id: string; ddt_file_name?: string | null; ddt_file_mime?: string | null };
  fileUrl: string | null | undefined;
}) {
  const t = useT();
  const p = usePermissions();
  const qc = useQueryClient();
  const righe = useDDTRighe(ddt.id);
  const { aggiungiRighe } = useDDTRigheMutations(ddt.id);
  const [stato, setStato] = useState<"pronto" | "leggo" | "proposta" | "salvo">("pronto");
  const [proposta, setProposta] = useState<Completamento | null>(null);
  const [togliRighe, setTogliRighe] = useState<Set<number>>(new Set());
  const [togliCampi, setTogliCampi] = useState<Set<string>>(new Set());
  if (!fileUrl || p.solaLettura) return null;

  const leggi = async () => {
    setStato("leggo");
    try {
      const file = await fetch(fileUrl).then((r) => { if (!r.ok) throw new Error(t("Originale non scaricabile")); return r.blob(); });
      if (file.size > 18 * 1024 * 1024) throw new Error(t("Originale troppo grande per la lettura (max 18 MB)"));
      const { data, error } = await supabase.functions.invoke("ddt-ai-extract", {
        body: { image_base64: await inBase64(file), mime_type: file.type || ddt.ddt_file_mime || "application/pdf", file_name: ddt.ddt_file_name ?? "bolla", company_id: ddt.company_id },
      });
      if (error) throw new Error(await edgeErrorMessage(error, t("Lettura non riuscita")));
      if (!data?.success) throw new Error(data?.error ?? t("Lettura non riuscita"));
      setProposta(completaBolla(leggiDDTdaAI(data.ddt ?? {}), righe.data ?? [], ddt));
      setTogliRighe(new Set());
      setTogliCampi(new Set());
      setStato("proposta");
    } catch (e) {
      toast.error(t("Lettura non riuscita"), { description: messaggioErrore(e) });
      setStato("pronto");
    }
  };

  const aggiungi = async () => {
    if (!proposta) return;
    setStato("salvo");
    try {
      const nuove = proposta.righe.filter((r) => !togliRighe.has(r.posizione));
      if (nuove.length) await aggiungiRighe.mutateAsync(nuove);
      const campi = Object.fromEntries(Object.entries(proposta.campi).filter(([k]) => !togliCampi.has(k)));
      if (Object.keys(campi).length) {
        const { data, error } = await supabase.from("ddt_ricezione").update(campi as never).eq("id", ddt.id).eq("company_id", ddt.company_id).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error(t("Non hai il permesso di modificare questa bolla"));
      }
      toast.success(t("Bolla completata dall'originale"));
      void qc.invalidateQueries({ queryKey: queryKeys.ddtRicezione.detail(ddt.id) });
      refreshMaterialQueries(qc);
      setProposta(null);
      setStato("pronto");
    } catch (e) {
      toast.error(t("Bolla non completata"), { description: messaggioErrore(e) });
      setStato("proposta");
    }
  };

  const vuota = proposta && proposta.righe.length === 0 && Object.keys(proposta.campi).length === 0;
  return (
    <section aria-label={t("Rileggi l'originale")} className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("L'AI legge la bolla allegata e propone solo quello che manca. Consuma credito AI.")}</p>
        {stato !== "proposta" && (
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={stato !== "pronto" || righe.isLoading} onClick={() => void leggi()}>
            {stato === "leggo" || stato === "salvo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {stato === "leggo" ? t("Leggo…") : t("Rileggi l'originale")}
          </Button>
        )}
      </div>
      {proposta && vuota && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{t("Sulla bolla c'è già tutto quello che l'AI ha letto.")}</p>}
      {proposta && !vuota && (
        <div className="space-y-2">
          {proposta.righe.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium">{t("Righe sull'originale che mancano")}</legend>
              {proposta.righe.map((r) => (
                <label key={r.posizione} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={!togliRighe.has(r.posizione)}
                    onChange={(e) => { const s = new Set(togliRighe); if (e.target.checked) s.delete(r.posizione); else s.add(r.posizione); setTogliRighe(s); }} />
                  {r.descrizione}{r.quantita != null ? ` · ${r.quantita.toLocaleString(intlCampo())}${r.unita_misura ? ` ${r.unita_misura}` : ""}` : ""}
                </label>
              ))}
            </fieldset>
          )}
          {Object.keys(proposta.campi).length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium">{t("Trasporto")}</legend>
              {(Object.entries(proposta.campi) as Array<[keyof TestataBolla, string]>).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={!togliCampi.has(k)}
                    onChange={(e) => { const s = new Set(togliCampi); if (e.target.checked) s.delete(k); else s.add(k); setTogliCampi(s); }} />
                  {t(ETICHETTE[k])}: {k === "trasporto_a_cura_di" ? (TRASPORTO[v] ? t(TRASPORTO[v]) : v) : v}
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-8" disabled={stato === "salvo"} onClick={() => void aggiungi()}>
              {stato === "salvo" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("Aggiungi alla bolla")}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setProposta(null); setStato("pronto"); }}>{t("Lascia com'è")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
