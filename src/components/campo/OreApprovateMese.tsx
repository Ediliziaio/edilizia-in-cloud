/**
 * «Le mie ore del mese» (26/11/2026, piano campo completo, punto 1.3).
 *
 * Le stesse ore che vede l'ufficio (RPC campo_mie_ore, stesse regole di lib/orders/dailyHours.ts), giorno per
 * giorno con lo stato: approvate, da approvare, respinte. Serve a confrontare il cedolino senza discussioni.
 * I conteggi delle timbrature restano sopra, nel calendario: questo è il registro, non la presenza.
 */
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CHIP } from "@/lib/campo/stileCampo";
import { oreBrevi } from "@/lib/campo/numeriItaliani";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export interface GiornoOre { giorno: string; approvate: number; da_approvare: number; respinte: number; cantieri: string[] }
export interface MieOre { mese: string; totale_approvate: number; totale_da_approvare: number; giorni: GiornoOre[] }

export function useMieOre(mese: Date) {
  const { user } = useAuth();
  const chiave = format(mese, "yyyy-MM");
  return useQuery({
    queryKey: ["campo-mie-ore", user?.id, chiave],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<MieOre> => {
      const { data, error } = await (supabase as unknown as {
        rpc: (n: "campo_mie_ore", a: { p_mese: string }) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      }).rpc("campo_mie_ore", { p_mese: `${chiave}-01` });
      if (error) throw error;
      const d = (data ?? {}) as Partial<MieOre>;
      return {
        mese: d.mese ?? chiave, totale_approvate: Number(d.totale_approvate ?? 0), totale_da_approvare: Number(d.totale_da_approvare ?? 0),
        giorni: (d.giorni ?? []).map(g => ({ ...g, approvate: Number(g.approvate), da_approvare: Number(g.da_approvare), respinte: Number(g.respinte) })),
      };
    },
  });
}

export function OreApprovateMese({ mese }: { mese: Date }) {
  const t = useT();
  const q = useMieOre(mese);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("Le mie ore del mese")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("Quelle che vede l'ufficio: le approvate vanno in busta paga.")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isError ? (
          <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere le ore. Riprova tra poco.")}</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("Carico le ore…")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border bg-emerald-50 p-3">
                <p className="text-xs text-emerald-900">{t("Approvate")}</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-700">{oreBrevi(q.data!.totale_approvate)}</p>
              </div>
              <div className="rounded-xl border bg-amber-50 p-3">
                <p className="text-xs text-amber-900">{t("Da approvare")}</p>
                <p className="text-2xl font-bold tabular-nums text-amber-700">{oreBrevi(q.data!.totale_da_approvare)}</p>
              </div>
            </div>
            {q.data!.giorni.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Nessuna ora registrata in questo mese.")}</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {q.data!.giorni.map(g => (
                  <li key={g.giorno} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-20 shrink-0 capitalize">{format(parseISO(g.giorno), "EEE d", { locale: dateFnsCampo() })}</span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{g.cantieri.join(", ")}</span>
                    {g.approvate > 0 && <span className={cn(CHIP, "bg-emerald-100 text-emerald-800")}>{oreBrevi(g.approvate)} {t("approvate")}</span>}
                    {g.da_approvare > 0 && <span className={cn(CHIP, "bg-amber-100 text-amber-900")}>{oreBrevi(g.da_approvare)} {t("da approvare")}</span>}
                    {g.respinte > 0 && <span className={cn(CHIP, "bg-red-100 text-red-800")}>{oreBrevi(g.respinte)} {t("respinte")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
