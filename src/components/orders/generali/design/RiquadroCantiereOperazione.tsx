// src/components/orders/generali/design/RiquadroCantiereOperazione.tsx
// Il cantiere in Panoramica (lotto 5 del piano 2026-11-14-operazione-immobiliare-piano-completo).
// Un'operazione immobiliare, finché costruisce, si segue dal cantiere: quali fasi sono in corso,
// quanto si è speso questo mese contro quanto prevedeva il piano, gli ultimi costi arrivati.
// Prima la Panoramica parlava solo di vendite (la tabella delle unità) a chi stava costruendo.
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useGeneralePianoNumeri } from "@/hooks/useGeneralePiano";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";
import { dataBreve, euro, nomeMese } from "../piano/formato";

interface Fase {
  id: string;
  name: string;
  status: string;
  percentuale: number;
  start_date: string | null;
  end_date: string | null;
}

const FINITA = (f: Fase) => f.status === "completata" || f.percentuale >= 100;
const IN_CORSO = (f: Fase) => !FINITA(f) && (f.status === "in_corso" || f.percentuale > 0);

export function RiquadroCantiereOperazione({ riepilogo }: { riepilogo: RiepilogoGenerale }) {
  const generaleId = riepilogo.generale.id;
  const [parametri, setParametri] = useSearchParams();
  const telefono = useIsMobile();
  const n = useGeneralePianoNumeri(riepilogo);
  const fasi = useQuery({
    queryKey: ["generale-cantiere-fasi", generaleId],
    staleTime: 60_000,
    queryFn: async (): Promise<Fase[]> => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id, name, status, percentuale, start_date, end_date")
        .eq("order_id", generaleId)
        .order("position")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Fase[];
    },
  });

  const apri = (vista?: string) => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", "cantiere");
    if (vista) dopo.set("vista-cantiere", vista);
    setParametri(dopo, { replace: true });
  };

  // Il riquadro vive nella Panoramica: qualunque cosa arrivi, non deve farla cadere.
  const elenco = Array.isArray(fasi.data) ? fasi.data : [];
  const finite = elenco.filter(FINITA).length;
  const inCorso = elenco.filter(IN_CORSO);
  const prossime = elenco.filter((f) => !FINITA(f) && !IN_CORSO(f)).slice(0, 2);
  const avanzamento = elenco.length ? Math.round(elenco.reduce((t, f) => t + Math.min(100, f.percentuale), 0) / elenco.length) : 0;

  // Il mese di oggi: registrato contro previsto dal calendario del piano.
  const vedeCosti = riepilogo.permessi.costi;
  const oggi = typeof n.reale?.oggi === "string" ? n.reale.oggi.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const righe = (Array.isArray(n.reale?.righe) ? n.reale!.righe : []).filter((r) => r.tipo === "costo");
  const delMese = righe.filter((r) => r.data?.startsWith(oggi)).reduce((t, r) => t + r.importo, 0);
  const previstoMese = (Array.isArray(n.piano?.cassa?.previsto) ? n.piano!.cassa.previsto : []).find((m) => m.mese === oggi)?.uscite ?? null;
  const ultimi = [...righe]
    .filter((r) => r.data && r.data < "9999")
    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
    .slice(0, 4);

  return (
    <section aria-labelledby="cantiere-operazione" className="generale-panel overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <h2 id="cantiere-operazione" className="flex items-center gap-2 text-sm font-semibold">
            <span className="generale-section-icon"><HardHat aria-hidden="true" /></span>Cantiere
          </h2>
        </div>
        {!telefono && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => apri()}>
            Apri il cantiere <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}
      </header>
      <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
        {/* Le fasi */}
        <div className="min-w-0 px-4 py-3">
          <p className="text-xs text-muted-foreground">Lavori</p>
          {fasi.isLoading ? (
            <p className="mt-1 text-sm text-muted-foreground">…</p>
          ) : elenco.length === 0 ? (
            <>
              <p className="mt-0.5 text-sm font-medium">Nessuna fase</p>
              <p className="text-xs text-muted-foreground">Dividi il lavoro in fasi, con le date e chi le fa.</p>
              {!telefono && (
                <button type="button" onClick={() => apri("lavorazioni")} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-800 dark:text-orange-300">
                  Imposta le fasi <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </>
          ) : (
            <>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{avanzamento}%</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${avanzamento}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {finite} di {elenco.length} fasi finite{inCorso.length > 0 && <> · in corso: <span className="text-foreground">{inCorso.map((f) => f.name).join(", ")}</span></>}
              </p>
              {prossime.length > 0 && (
                <p className="truncate text-xs text-muted-foreground" title={prossime.map((f) => f.name).join(", ")}>
                  Poi: {prossime.map((f) => `${f.name}${f.start_date ? ` (${dataBreve(f.start_date)})` : ""}`).join(", ")}
                </p>
              )}
            </>
          )}
        </div>

        {/* Il mese */}
        <div className="min-w-0 px-4 py-3">
          <p className="text-xs text-muted-foreground">Uscite di {nomeMese(oggi)}</p>
          {!vedeCosti ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Riservato</p>
          ) : (
            <>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{euro(delMese)}</p>
              <p className={cn("text-xs text-muted-foreground", previstoMese !== null && delMese > previstoMese + 0.5 && "text-destructive")}>
                {previstoMese === null
                  ? "registrate; il piano non ha uscite per questo mese"
                  : `registrate su ${euro(previstoMese)} previste dal piano`}
              </p>
            </>
          )}
        </div>

        {/* Gli ultimi costi */}
        <div className="min-w-0 px-4 py-3">
          <p className="text-xs text-muted-foreground">Ultimi costi registrati</p>
          {!vedeCosti ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Riservato</p>
          ) : ultimi.length === 0 ? (
            <p className="mt-0.5 text-sm text-muted-foreground">Ancora nessuno</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {ultimi.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate" title={r.descrizione}>
                    <span className="tabular-nums text-muted-foreground">{dataBreve(r.data)}</span> {r.descrizione.split(" · ")[1] ?? r.descrizione.split(" · ")[0]}
                  </span>
                  <span className="shrink-0 tabular-nums">{euro(r.importo)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
