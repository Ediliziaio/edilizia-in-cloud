/**
 * Chi ha ritirato cosa, per quale cantiere (24/11/2026, richiesta del founder).
 *
 * I prelievi fatti dagli operai dall'app (`prelievi_campo`), di ogni stato: un elenco con chi, quando, per quale
 * cantiere e cosa, e i totali per materiale. Filtri per cantiere, persona e periodo. È la vista «Ritiri dal
 * cantiere» di Magazzino → Movimenti (prima un riquadro da aprire in cima a ogni pagina del magazzino).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { History, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { totaliRitiri, type RitiroCampo } from "@/lib/magazzino/ritiriCantiere";

const STATI: Record<string, { label: string; className: string }> = {
  consegnato: { label: "Consegnato", className: "bg-emerald-50 text-emerald-700" },
  richiesto: { label: "Da approvare", className: "bg-amber-50 text-amber-800" },
  rifiutato: { label: "Rifiutato", className: "bg-red-50 text-red-700" },
};
const PERIODI = [{ giorni: 7, label: "7 giorni" }, { giorni: 30, label: "30 giorni" }, { giorni: 90, label: "90 giorni" }] as const;

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

export function RitiriDalCantiere() {
  const { effectiveCompany, profile } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const [giorni, setGiorni] = useState<number>(30);
  const [cantiere, setCantiere] = useState("");
  const [persona, setPersona] = useState("");
  const [vista, setVista] = useState<"elenco" | "totali">("elenco");

  const dati = useQuery({
    queryKey: ["ritiri-dal-cantiere", companyId, giorni],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const dal = subDays(new Date(), giorni).toISOString();
      const { data, error } = await supabase.from("prelievi_campo")
        .select("id, data, righe, note, order_id, operaio_id, stato, documento_numero, motivo_rifiuto")
        .eq("company_id", companyId!).gte("data", dal).order("data", { ascending: false }).limit(500);
      if (error) throw error;
      const ritiri = (data ?? []) as unknown as RitiroCampo[];
      const persone = [...new Set(ritiri.map(r => r.operaio_id).filter((x): x is string => !!x))];
      const ordini = [...new Set(ritiri.map(r => r.order_id).filter((x): x is string => !!x))];
      const [p, o] = await Promise.all([
        persone.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", persone) : Promise.resolve({ data: [] }),
        ordini.length ? supabase.from("orders").select("id, order_code, description").in("id", ordini) : Promise.resolve({ data: [] }),
      ]);
      const nomi = new Map((p.data ?? []).map((x: { id: string; first_name: string | null; last_name: string | null }) =>
        [x.id, [x.first_name, x.last_name].filter(Boolean).join(" ") || "Operaio"]));
      const cantieri = new Map((o.data ?? []).map((x: { id: string; order_code: string | null; description: string | null }) =>
        [x.id, [x.order_code, x.description?.slice(0, 40)].filter(Boolean).join(" · ") || "Commessa"]));
      return { ritiri, nomi, cantieri };
    },
  });

  const ritiri = useMemo(() => (dati.data?.ritiri ?? []).filter(r =>
    (!cantiere || r.order_id === cantiere) && (!persona || r.operaio_id === persona)), [dati.data, cantiere, persona]);
  const totali = useMemo(() => totaliRitiri(ritiri), [ritiri]);
  const nomeCantiere = (id: string | null) => id ? dati.data?.cantieri.get(id) ?? "Commessa" : "Senza cantiere";
  const nomePersona = (id: string | null) => id ? dati.data?.nomi.get(id) ?? "Operaio" : "—";

  // 26/11/2026: non più un riquadro da aprire in cima a ogni pagina del magazzino, ma una vista di
  // «Movimenti» (Registro · Ritiri dal cantiere). Barra come le altre schede, un ritiro per riga.
  const scelta = "border-orange-200 bg-orange-50 text-orange-700";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cantiere || "tutti"} onValueChange={(v) => setCantiere(v === "tutti" ? "" : v)}>
          <SelectTrigger aria-label="Cantiere" className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i cantieri</SelectItem>
            {[...(dati.data?.cantieri ?? new Map<string, string>()).entries()].map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={persona || "tutte"} onValueChange={(v) => setPersona(v === "tutte" ? "" : v)}>
          <SelectTrigger aria-label="Persona" className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le persone</SelectItem>
            {[...(dati.data?.nomi ?? new Map<string, string>()).entries()].map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(giorni)} onValueChange={(v) => setGiorni(Number(v))}>
          <SelectTrigger aria-label="Periodo" className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODI.map(p => <SelectItem key={p.giorni} value={String(p.giorni)}>Ultimi {p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-1" role="radiogroup" aria-label="Vista">
          {(["elenco", "totali"] as const).map(v => (
            <Button key={v} type="button" size="sm" variant="outline" role="radio" aria-checked={vista === v}
              className={`h-8 px-2.5 text-xs ${vista === v ? scelta : ""}`} onClick={() => setVista(v)}>
              {v === "elenco" ? "Elenco" : "Totali per materiale"}
            </Button>
          ))}
        </div>
        <span className="ms-auto text-xs text-muted-foreground tabular-nums">
          {dati.isSuccess ? `${ritiri.length} ${ritiri.length === 1 ? "ritiro" : "ritiri"}` : ""}
        </span>
      </div>

      {dati.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico i ritiri…</p>}
      {dati.isError && <p role="alert" className="text-sm text-destructive">Non riesco a caricare i ritiri. <Button variant="link" className="h-auto p-0" onClick={() => void dati.refetch()}>Riprova</Button></p>}
      {dati.isSuccess && ritiri.length === 0 && (
        <Card><CardContent className="flex flex-col items-center gap-1 py-8 text-center">
          <History className="size-8 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-sm font-medium">Nessun ritiro nel periodo</p>
          <p className="text-xs text-muted-foreground">Qui compare chi ha preso cosa, per quale cantiere, dall’app degli operai.</p>
        </CardContent></Card>
      )}

      {ritiri.length > 0 && vista === "elenco" && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr className="[&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th>Quando</th><th>Chi</th><th>Cantiere</th><th>Materiale</th><th>DDT</th><th>Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ritiri.map(r => {
                const stato = STATI[r.stato] ?? STATI.richiesto;
                const righe = Array.isArray(r.righe) ? r.righe : [];
                const elenco = righe.map(riga => `${riga.name} ${nf.format(Number(riga.quantita))} ${riga.unita ?? ""}`.trim()).join(" · ");
                return (
                  <tr key={r.id} className="align-top [&>td]:px-3 [&>td]:py-1.5">
                    <td className="whitespace-nowrap text-xs text-muted-foreground">{format(new Date(r.data), "d MMM, HH:mm", { locale: it })}</td>
                    <td className="whitespace-nowrap font-medium">{nomePersona(r.operaio_id)}</td>
                    <td className="max-w-[220px] truncate" title={nomeCantiere(r.order_id)}>{nomeCantiere(r.order_id)}</td>
                    <td className="max-w-[360px]" title={elenco}>
                      <span className="line-clamp-1">{elenco || "—"}</span>
                      {r.note && <span className="line-clamp-1 text-xs text-muted-foreground">{r.note}</span>}
                      {r.motivo_rifiuto && <span className="block text-xs text-red-700">Rifiutato: {r.motivo_rifiuto}</span>}
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted-foreground">{r.documento_numero || "—"}</td>
                    <td><Badge variant="outline" className={`whitespace-nowrap border-transparent px-1.5 py-0 text-[11px] font-medium ${stato.className}`}>{stato.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ritiri.length > 0 && vista === "totali" && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 text-left font-medium">Materiale</th><th className="px-3 py-2 text-right font-medium">Consegnato</th><th className="px-3 py-2 text-right font-medium">Da approvare</th><th className="px-3 py-2 text-left font-medium">Chi</th></tr>
            </thead>
            <tbody className="divide-y">
              {totali.map(t => (
                <tr key={t.chiave} className="[&>td]:px-3 [&>td]:py-1.5">
                  <td>{t.nome}</td>
                  <td className="text-right font-semibold tabular-nums">{nf.format(t.consegnato)} {t.unita ?? ""}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{t.daApprovare ? `${nf.format(t.daApprovare)} ${t.unita ?? ""}` : "—"}</td>
                  <td className="text-xs text-muted-foreground">{t.persone.map(nomePersona).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
