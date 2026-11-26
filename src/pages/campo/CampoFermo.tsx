/**
 * Fermo cantiere per maltempo (26/11/2026, piano campo completo, punto 2.6).
 *
 * Il capocantiere o il caposquadra segna il giorno, chi era fermo e quante ore; il meteo del giorno si allega
 * da solo come prova (stessa previsione del rapportino). In ufficio l'elenco si esporta per la domanda di cassa
 * integrazione. Risegnarlo per lo stesso giorno lo corregge (campo_fermo_registra).
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, CloudRain, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { useWeatherForecast, weatherCodeToLabel } from "@/hooks/useWeatherForecast";
import { senzaRete } from "@/lib/campo/timbra";
import { RIQUADRO } from "@/lib/campo/stileCampo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Persona { user_id: string | null; nome: string }
type Rpc = "campo_squadra_oggi" | "campo_fermo_registra";
const db = () => supabase as unknown as {
  rpc: (n: Rpc, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export default function CampoFermo() {
  const t = useT();
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const giorno = useCampoWorkDay();
  const [causa, setCausa] = useState<"maltempo" | "altro">("maltempo");
  const [ore, setOre] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [fatto, setFatto] = useState(false);

  const squadra = useQuery({
    queryKey: ["campo-fermo-squadra", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<Persona[]> => {
      const { data, error } = await db().rpc("campo_squadra_oggi", { p_order_id: orderId });
      if (error) throw error;
      return ((data ?? []) as Persona[]).map(p => ({ user_id: p.user_id, nome: p.nome }));
    },
  });
  const coord = useQuery({
    queryKey: ["campo-cantiere-coord", orderId],
    enabled: !!orderId,
    staleTime: 3600_000,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("work_lat, work_lng").eq("id", orderId!).maybeSingle();
      return data?.work_lat != null && data?.work_lng != null ? { lat: Number(data.work_lat), lng: Number(data.work_lng) } : null;
    },
  });
  const { data: previsioni } = useWeatherForecast(coord.data?.lat ?? 45.4654, coord.data?.lng ?? 9.1859, 1);
  const meteo = coord.data ? previsioni?.get(giorno) ?? null : null;

  const persone = squadra.data ?? [];
  const chiave = (p: Persona, i: number) => p.user_id ?? `senza-app-${i}`;
  const valori = useMemo(() => persone.map((p, i) => ({ p, k: chiave(p, i), ore: ore[chiave(p, i)] ?? "8" })), [persone, ore]);

  const invia = useMutation({
    mutationFn: async () => {
      if (senzaRete()) throw new Error(t("Sei senza rete: riprova quando torna il segnale."));
      const elenco = valori.map(v => ({ user_id: v.p.user_id, nome: v.p.nome, ore: Math.min(24, Math.max(0, Number(v.ore.replace(",", ".")) || 0)) }))
        .filter(v => v.ore > 0);
      const { error } = await db().rpc("campo_fermo_registra", {
        p_order_id: orderId, p_giorno: giorno, p_causa: causa, p_persone: elenco,
        p_meteo: meteo ? { ...meteo, label: weatherCodeToLabel(meteo.code), fonte: "previsione del giorno" } : null,
        p_note: note.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => setFatto(true),
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? e.message : t("Non sono riuscito a inviarlo. Riprova.")),
  });

  if (fatto) {
    return (
      <div className="mx-auto max-w-lg space-y-3 pb-24">
        <div role="status" className="space-y-1 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <p className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="size-5" aria-hidden="true" />{t("Fermo segnato")}</p>
          <p className="text-sm">{t("L'ufficio lo trova pronto per la cassa integrazione.")}</p>
        </div>
        <button type="button" onClick={() => navigate(-1)} className="min-h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground">{t("Fatto")}</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 pb-24">
      <h1 className="flex items-center gap-2 text-lg font-semibold"><CloudRain className="size-5 text-primary" aria-hidden="true" />{t("Fermo cantiere")}</h1>
      <div className={`${RIQUADRO} space-y-2`}>
        <div className="flex gap-2" role="radiogroup" aria-label={t("Causa")}>
          {(["maltempo", "altro"] as const).map(c => (
            <button key={c} type="button" role="radio" aria-checked={causa === c} onClick={() => setCausa(c)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${causa === c ? "border-primary bg-primary/10 text-primary" : ""}`}>
              {c === "maltempo" ? t("Maltempo") : t("Altro")}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {meteo ? t("Meteo di oggi: {meteo}, {mm} mm di pioggia", { meteo: t(weatherCodeToLabel(meteo.code)), mm: String(meteo.precip) }) : t("Il meteo del giorno non è disponibile: scrivilo nelle note.")}
        </p>
      </div>
      <div className={`${RIQUADRO} space-y-2`}>
        <p className="text-sm font-semibold">{t("Ore perse per persona")}</p>
        {squadra.isLoading ? <p className="text-sm text-muted-foreground">{t("Carico…")}</p>
          : squadra.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere la squadra. Riprova tra poco.")}</p>
          : valori.length === 0 ? <p className="text-sm text-muted-foreground">{t("Oggi qui non è previsto nessuno.")}</p>
          : valori.map(v => (
            <label key={v.k} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate" dir="auto">{v.p.nome}</span>
              <input value={v.ore} inputMode="decimal" maxLength={4} aria-label={t("Ore perse: {nome}", { nome: v.p.nome })}
                onChange={e => setOre(prima => ({ ...prima, [v.k]: e.target.value.replace(/[^\d.,]/g, "") }))}
                className="h-11 w-20 rounded-xl border bg-background px-2 text-end text-base tabular-nums" />
            </label>
          ))}
      </div>
      <label className={`${RIQUADRO} block space-y-1 text-sm font-medium`}>
        <span>{t("Note (facoltativo)")}</span>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} className="w-full rounded-xl border bg-background px-3 py-2 text-base" />
      </label>
      <button type="button" disabled={invia.isPending || squadra.isLoading} onClick={() => invia.mutate()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50">
        {invia.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{t("Segna il fermo")}
      </button>
    </div>
  );
}
