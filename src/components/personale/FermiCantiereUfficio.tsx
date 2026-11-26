/**
 * Fermi cantiere segnati dall'app (26/11/2026, piano campo completo, punto 2.6), per la domanda di cassa
 * integrazione: giorno, cantiere, causa, persone con le ore perse, meteo del giorno. Esportazione in CSV.
 * Legge campo_fermi (lettura: amministratore). Senza fermi nel periodo non occupa posto.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { CloudRain, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Fermo {
  id: string; order_id: string; giorno: string; causa: string; ore_perse: number; note: string | null;
  persone: Array<{ nome?: string; ore?: number }>; meteo: { label?: string; precip?: number } | null;
}

const csvCella = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function FermiCantiereUfficio() {
  const t = useT();
  const { effectiveCompany, profile } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const [giorni, setGiorni] = useState(60);
  const q = useQuery({
    queryKey: ["ufficio-fermi-cantiere", companyId, giorni],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const dal = format(subDays(new Date(), giorni), "yyyy-MM-dd");
      const { data, error } = await (supabase as unknown as { from: (t: "campo_fermi") => any }).from("campo_fermi")
        .select("id, order_id, giorno, causa, ore_perse, note, persone, meteo")
        .eq("company_id", companyId).gte("giorno", dal).order("giorno", { ascending: false }).limit(500);
      if (error) throw error;
      const fermi = (data ?? []) as Fermo[];
      const ids = [...new Set(fermi.map(f => f.order_id))];
      const { data: ordini } = ids.length
        ? await supabase.from("orders").select("id, order_code, description").in("id", ids)
        : { data: [] as Array<{ id: string; order_code: string | null; description: string | null }> };
      const nomi = new Map((ordini ?? []).map(o => [o.id, [o.order_code, o.description?.slice(0, 40)].filter(Boolean).join(" · ")]));
      return fermi.map(f => ({ ...f, cantiere: nomi.get(f.order_id) ?? "Cantiere" }));
    },
  });
  const fermi = q.data ?? [];
  if (q.isSuccess && fermi.length === 0) return null;

  const esporta = () => {
    const righe = [["Giorno", "Cantiere", "Causa", "Persona", "Ore perse", "Meteo", "Pioggia mm", "Note"].map(csvCella).join(";")];
    for (const f of fermi) for (const p of f.persone.length ? f.persone : [{ nome: "", ore: f.ore_perse }]) {
      righe.push([f.giorno, f.cantiere, f.causa, p.nome ?? "", String(p.ore ?? "").replace(".", ","), f.meteo?.label ?? "",
        f.meteo?.precip ?? "", f.note ?? ""].map(csvCella).join(";"));
    }
    const blob = new Blob(["﻿" + righe.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fermi-cantiere-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><CloudRain className="size-4 text-primary" aria-hidden="true" />{t("Fermi cantiere")}</CardTitle>
        <div className="flex items-center gap-2">
          <select aria-label={t("Periodo")} value={giorni} onChange={e => setGiorni(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
            {[30, 60, 180].map(g => <option key={g} value={g}>{t("Ultimi {n} giorni", { n: g })}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={esporta} disabled={!fermi.length}><Download className="mr-1 size-4" />CSV</Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere i fermi.")}</p> : (
          <ul className="divide-y text-sm">
            {fermi.map(f => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2">
                <span className="font-semibold">{format(parseISO(f.giorno), "d MMM yyyy", { locale: it })}</span>
                <span className="text-muted-foreground">{f.cantiere}</span>
                <span className="ms-auto tabular-nums">{t("{ore} ore perse", { ore: String(f.ore_perse).replace(".", ",") })} · {f.persone.length} {t("persone")}</span>
                {f.meteo?.label && <span className="w-full text-xs text-muted-foreground">{f.meteo.label}{f.meteo.precip != null ? ` · ${f.meteo.precip} mm` : ""}{f.note ? ` · ${f.note}` : ""}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
