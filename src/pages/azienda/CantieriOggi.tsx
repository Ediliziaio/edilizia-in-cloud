/**
 * Cantieri oggi — scheda «Oggi» dentro Commesse: una riga per cantiere aperto con chi c'è, se è
 * arrivato il rapportino, quante cose aspettano l'ufficio, da quanto tace. Clic → la commessa.
 * Le cose da approvare stanno in Attività di chi è autorizzato (DaApprovareCantieri).
 * Dati: ufficio_cantieri_oggi / ufficio_da_approvare.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, ChevronRight, Loader2, RefreshCcw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { totaleDaApprovare, useDaApprovareCantieri, usePuoApprovareCantiere } from "@/components/campo/DaApprovareCantieri";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface RigaCantiere {
  id: string; codice: string | null; descrizione: string | null; indirizzo: string | null; stato: string | null;
  responsabile: string | null; previste: number; timbrate: number; rapportini_oggi: number;
  rapportini_da_approvare: number; correzioni: number; bolle: number;
  ultimo_segnale: string | null; giorni_senza_segnale: number | null;
}
/** Fermo: nessun segnale dal cantiere da almeno 3 giorni lavorativi, pur con persone previste. */
export const GIORNI_FERMO = 3;

/** Giorni lavorativi (lun-ven) passati dall'ultimo segnale a oggi: il fine settimana non conta. */
export function giorniLavorativiDa(ultimo: string, oggi = new Date()): number {
  const d = new Date(ultimo);
  if (Number.isNaN(d.getTime())) return 0;
  const giorno = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fine = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  let n = 0;
  for (giorno.setDate(giorno.getDate() + 1); giorno <= fine; giorno.setDate(giorno.getDate() + 1)) {
    const g = giorno.getDay();
    if (g !== 0 && g !== 6) n += 1;
  }
  return n;
}

export function statoCantiere(r: RigaCantiere, oggi = new Date()): { testo: string; tono: "ok" | "attenzione" | "neutro" } {
  if (r.previste > 0 && r.timbrate === 0 && r.rapportini_oggi === 0) {
    if (r.ultimo_segnale) {
      const lavorativi = giorniLavorativiDa(r.ultimo_segnale, oggi);
      if (lavorativi >= GIORNI_FERMO) return { testo: `Fermo da ${lavorativi} giorni lavorativi`, tono: "attenzione" };
    } else if (r.giorni_senza_segnale != null && r.giorni_senza_segnale >= GIORNI_FERMO) return { testo: `Fermo da ${r.giorni_senza_segnale} giorni`, tono: "attenzione" };
    // Sabato e domenica nessuno è atteso: non è un cantiere da guardare.
    if (oggi.getDay() === 0 || oggi.getDay() === 6) return { testo: "Fine settimana", tono: "neutro" };
    return { testo: "Nessuno ancora oggi", tono: "attenzione" };
  }
  if (r.timbrate > 0 && r.rapportini_oggi === 0) return { testo: "Al lavoro, rapportino non arrivato", tono: "neutro" };
  if (r.rapportini_oggi > 0) return { testo: "Rapportino arrivato", tono: "ok" };
  return { testo: r.giorni_senza_segnale == null ? "Nessun segnale" : `Ultimo segnale ${r.giorni_senza_segnale === 0 ? "oggi" : `${r.giorni_senza_segnale} gg fa`}`, tono: "neutro" };
}

export default function CantieriOggi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const puoApprovare = usePuoApprovareCantiere();
  const [cerca, setCerca] = useState("");
  const [soloAttenzione, setSoloAttenzione] = useState(false);

  const cantieri = useQuery({
    queryKey: ["ufficio-cantieri-oggi", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<RigaCantiere[]> => {
      const { data, error } = await db.rpc("ufficio_cantieri_oggi");
      if (error) throw error;
      return (data ?? []) as RigaCantiere[];
    },
  });
  const approvare = useDaApprovareCantieri(puoApprovare);

  const righe = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    return (cantieri.data ?? []).filter((r) => {
      if (t && ![r.codice, r.descrizione, r.indirizzo, r.responsabile].some((v) => (v ?? "").toLowerCase().includes(t))) return false;
      if (soloAttenzione && statoCantiere(r).tono !== "attenzione" && r.rapportini_da_approvare + r.correzioni + r.bolle === 0) return false;
      return true;
    });
  }, [cantieri.data, cerca, soloAttenzione]);

  const totApprovare = totaleDaApprovare(approvare.data);
  const fermi = (cantieri.data ?? []).filter((r) => statoCantiere(r).tono === "attenzione").length;
  const oggi = format(new Date(), "EEEE d MMMM", { locale: it });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{oggi} · {cantieri.data?.length ?? 0} cantieri aperti{fermi > 0 ? ` · ${fermi} da guardare` : ""}</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { void cantieri.refetch(); void approvare.refetch(); }}>
          <RefreshCcw className="h-4 w-4" />Aggiorna
        </Button>
      </div>

      {puoApprovare && totApprovare > 0 && (
        <Link to="/azienda/attivita" className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm hover:bg-amber-100">
          <span><strong>{totApprovare}</strong> {totApprovare === 1 ? "cosa aspetta" : "cose aspettano"} la tua approvazione: le trovi in Attività</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      <section aria-labelledby="cantieri-titolo" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cantieri-titolo" className="sr-only">I cantieri</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soloAttenzione} onChange={(e) => setSoloAttenzione(e.target.checked)} />Solo da guardare</label>
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca cantiere" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca codice, cliente, via…" className="h-9 w-64 pl-8" /></div>
          </div>
        </div>
        {cantieri.isLoading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carico i cantieri…</p>
          : cantieri.isError ? <p role="alert" className="text-sm text-destructive">Non riesco a leggere i cantieri. <button className="underline" onClick={() => void cantieri.refetch()}>Riprova</button></p>
          : righe.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nessun cantiere da mostrare.</p>
          : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr className="border-b">
                  <th className="px-3 py-2 font-medium">Cantiere</th>
                  <th className="px-3 py-2 text-right font-medium">Persone oggi</th>
                  <th className="px-3 py-2 font-medium">Com’è</th>
                  <th className="px-3 py-2 text-right font-medium">Da approvare</th>
                  <th className="px-3 py-2 font-medium">Responsabile</th>
                </tr></thead>
                <tbody>
                  {righe.map((r) => {
                    const s = statoCantiere(r);
                    const attese = r.rapportini_da_approvare + r.correzioni + r.bolle;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <Link to={`/azienda/ordini/${r.id}`} className="font-semibold text-primary hover:underline">{r.codice ?? "Commessa"}</Link>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{r.descrizione ?? ""}{r.indirizzo ? ` · ${r.indirizzo}` : ""}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.timbrate}<span className="text-muted-foreground"> / {r.previste}</span></td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.tono === "attenzione" ? "bg-amber-100 text-amber-800" : s.tono === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                            {s.tono === "attenzione" && <AlertTriangle className="h-3 w-3" />}{s.testo}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">{attese > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{attese}</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.responsabile ?? "Non assegnato"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <p className="text-xs text-muted-foreground">Persone oggi = presenti (hanno timbrato o sono nel rapportino di oggi) / previste dalle assegnazioni. «Fermo» = nessun segnale dal cantiere da {GIORNI_FERMO} giorni lavorativi con persone previste.</p>
      </section>
    </div>
  );
}
