/**
 * Lavoro extra chiesto dal cliente in cantiere (26/11/2026, piano campo completo, punto 2.1).
 *
 * Tre righe e si manda: che lavoro è, chi l'ha chiesto, quanti giorni in più se si sanno. Nasce una bozza di
 * ordine di variazione nella commessa (campo_lavoro_extra_crea); l'ufficio la trova in «Da approvare», mette il
 * prezzo e la manda al cliente in firma. Il prezzo qui non si scrive. Le foto si fanno da «Foto» del cantiere.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { senzaRete } from "@/lib/campo/timbra";
import { RIQUADRO } from "@/lib/campo/stileCampo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export default function CampoLavoroExtra() {
  const t = useT();
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [titolo, setTitolo] = useState("");
  const [dettagli, setDettagli] = useState("");
  const [chi, setChi] = useState("");
  const [giorni, setGiorni] = useState("");
  const [fatto, setFatto] = useState(false);

  const invia = useMutation({
    mutationFn: async () => {
      if (senzaRete()) throw new Error(t("Sei senza rete: riprova quando torna il segnale."));
      const g = giorni.trim() ? Number(giorni) : null;
      const { error } = await (supabase as unknown as {
        rpc: (n: "campo_lavoro_extra_crea", a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
      }).rpc("campo_lavoro_extra_crea", {
        p_order_id: orderId, p_titolo: titolo.trim(), p_descrizione: dettagli.trim() || null,
        p_richiesto_da: chi.trim() || null, p_giorni: g != null && Number.isFinite(g) ? Math.round(g) : null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => setFatto(true),
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? e.message : t("Non sono riuscito a inviarlo. Riprova.")),
  });

  if (fatto) {
    return (
      <div className="mx-auto max-w-lg space-y-3 pb-24">
        <div role="status" className="space-y-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <p className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="size-5" aria-hidden="true" />{t("Lavoro extra segnalato")}</p>
          <p className="text-sm">{t("L'ufficio mette il prezzo e lo manda al cliente da firmare. Non iniziarlo prima della firma, se non te lo dicono.")}</p>
        </div>
        <button type="button" onClick={() => navigate(`/campo/lavoro/${orderId}`)} className="min-h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground">
          {t("Fatto")}
        </button>
      </div>
    );
  }

  const valido = titolo.trim().length >= 3;
  return (
    <div className="mx-auto max-w-lg space-y-3 pb-24">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><PlusCircle className="size-5 text-primary" aria-hidden="true" />{t("Lavoro extra")}</h1>
      <p className="text-sm text-muted-foreground">{t("Il cliente chiede un lavoro in più? Scrivilo qui: l'ufficio lo prezza e glielo fa firmare.")}</p>
      <div className={`${RIQUADRO} space-y-3`}>
        <label className="block space-y-1 text-sm font-medium">
          <span>{t("Che lavoro è")}</span>
          <input value={titolo} onChange={e => setTitolo(e.target.value)} maxLength={160} placeholder={t("Es. spostare la presa del bagno")}
            className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>{t("Dettagli (facoltativo)")}</span>
          <textarea value={dettagli} onChange={e => setDettagli(e.target.value)} rows={3} maxLength={2000}
            className="w-full rounded-xl border bg-background px-3 py-2 text-base" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>{t("Chi l'ha chiesto")}</span>
          <input value={chi} onChange={e => setChi(e.target.value)} maxLength={120} placeholder={t("Es. il proprietario")}
            className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>{t("Giorni in più (se li sai)")}</span>
          <input value={giorni} onChange={e => setGiorni(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" maxLength={3}
            className="h-12 w-28 rounded-xl border bg-background px-3 text-base" />
        </label>
      </div>
      <button type="button" disabled={!valido || invia.isPending} onClick={() => invia.mutate()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50">
        {invia.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{t("Manda all'ufficio")}
      </button>
    </div>
  );
}
