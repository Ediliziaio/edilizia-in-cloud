/**
 * Cantieri oggi — tutti i cantieri aperti in una pagina.
 * In alto quello che aspetta l'ufficio (rapportini, timbrature dimenticate, bolle) di tutta
 * l'azienda; sotto una riga per cantiere: chi c'è, se è arrivato il rapportino, cosa c'è da
 * approvare, da quanto tace. Clic → la commessa. Dati: ufficio_cantieri_oggi / ufficio_da_approvare.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface RigaCantiere {
  id: string; codice: string | null; descrizione: string | null; indirizzo: string | null; stato: string | null;
  responsabile: string | null; previste: number; timbrate: number; rapportini_oggi: number;
  rapportini_da_approvare: number; correzioni: number; bolle: number;
  ultimo_segnale: string | null; giorni_senza_segnale: number | null;
}
interface DaApprovare {
  rapportini: Array<{ id: string; order_id: string; codice: string | null; giorno: string; autore: string; collaudo: boolean; ore: number }>;
  correzioni: Array<{ id: string; order_id: string | null; codice: string | null; tipo: "entrata" | "uscita"; ora: string; motivo: string; persona: string }>;
  bolle: Array<{ id: string; order_id: string | null; codice: string | null; fornitore: string | null; numero: string | null; persona: string }>;
}

/** Fermo: nessun segnale dal cantiere da almeno 3 giorni, pur con persone previste. */
export const GIORNI_FERMO = 3;
export function statoCantiere(r: RigaCantiere): { testo: string; tono: "ok" | "attenzione" | "neutro" } {
  if (r.previste > 0 && r.timbrate === 0 && r.rapportini_oggi === 0) {
    if (r.giorni_senza_segnale != null && r.giorni_senza_segnale >= GIORNI_FERMO) return { testo: `Fermo da ${r.giorni_senza_segnale} giorni`, tono: "attenzione" };
    return { testo: "Nessuno ancora oggi", tono: "attenzione" };
  }
  if (r.timbrate > 0 && r.rapportini_oggi === 0) return { testo: "Al lavoro, rapportino non arrivato", tono: "neutro" };
  if (r.rapportini_oggi > 0) return { testo: "Rapportino arrivato", tono: "ok" };
  return { testo: r.giorni_senza_segnale == null ? "Nessun segnale" : `Ultimo segnale ${r.giorni_senza_segnale === 0 ? "oggi" : `${r.giorni_senza_segnale} gg fa`}`, tono: "neutro" };
}

export default function CantieriOggi() {
  const { effectiveCompany, role } = useAuth();
  const permissions = usePermissions();
  const puoDecidere = role === "company_admin" || role === "super_admin" || !!permissions.canEditOrders;
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
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
  const approvare = useQuery({
    queryKey: ["ufficio-da-approvare", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<DaApprovare> => {
      const { data, error } = await db.rpc("ufficio_da_approvare");
      if (error) throw error;
      return data as DaApprovare;
    },
  });
  const decidi = useMutation({
    mutationFn: async (v: { id: string; approva: boolean; risposta?: string }) => {
      const { error } = await db.rpc("campo_timbratura_correzione_decidi", { p_id: v.id, p_approva: v.approva, p_risposta: v.risposta ?? null });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approva ? "Approvata: la timbratura è nel registro" : "Respinta: l’operaio è avvisato");
      void qc.invalidateQueries({ queryKey: ["ufficio-da-approvare"] });
      void qc.invalidateQueries({ queryKey: ["ufficio-cantieri-oggi"] });
    },
    onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito a salvare la decisione.")),
  });

  const righe = useMemo(() => {
    const t = cerca.trim().toLowerCase();
    return (cantieri.data ?? []).filter((r) => {
      if (t && ![r.codice, r.descrizione, r.indirizzo, r.responsabile].some((v) => (v ?? "").toLowerCase().includes(t))) return false;
      if (soloAttenzione && statoCantiere(r).tono !== "attenzione" && r.rapportini_da_approvare + r.correzioni + r.bolle === 0) return false;
      return true;
    });
  }, [cantieri.data, cerca, soloAttenzione]);

  const a = approvare.data;
  const totApprovare = (a?.rapportini.length ?? 0) + (a?.correzioni.length ?? 0) + (a?.bolle.length ?? 0);
  const fermi = (cantieri.data ?? []).filter((r) => statoCantiere(r).tono === "attenzione").length;
  const oggi = format(new Date(), "EEEE d MMMM", { locale: it });

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-3 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cantieri oggi</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{oggi} · {cantieri.data?.length ?? 0} cantieri aperti</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { void cantieri.refetch(); void approvare.refetch(); }}>
          <RefreshCcw className="h-4 w-4" />Aggiorna
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
        {[["Da approvare", totApprovare, totApprovare > 0], ["Da guardare", fermi, fermi > 0], ["Cantieri aperti", cantieri.data?.length ?? 0, false]].map(([t, n, evidenza]) => (
          <div key={String(t)} className={`rounded-xl border p-3 ${evidenza ? "border-amber-300 bg-amber-50" : "bg-card"}`}>
            <p className="text-xs text-muted-foreground">{t}</p><p className="mt-1 text-2xl font-bold tabular-nums">{String(n)}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="da-approvare-titolo" className="rounded-xl border bg-card">
        <h2 id="da-approvare-titolo" className="flex items-center gap-2 border-b px-4 py-3 font-semibold"><ClipboardList className="h-5 w-5 text-primary" />Da approvare</h2>
        {approvare.isLoading ? <p className="p-4 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carico…</p>
          : approvare.isError ? <p role="alert" className="p-4 text-sm text-destructive">Non riesco a leggere le approvazioni. <button className="underline" onClick={() => void approvare.refetch()}>Riprova</button></p>
          : totApprovare === 0 ? <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Niente in attesa: il cantiere non aspetta l’ufficio.</p>
          : (
            <ul className="divide-y">
              {a!.rapportini.map((r) => (
                <li key={`r-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span><strong>{r.collaudo ? "Collaudo" : "Rapportino"}</strong> · {r.codice ?? "—"} · {format(parseISO(r.giorno), "d MMM", { locale: it })} · {r.autore || "Cantiere"}{r.ore > 0 ? ` · ${r.ore} h` : ""}</span>
                  <Link to={`/azienda/ordini/${r.order_id}?tab=cantiere&vista_cantiere=diario#section-rapportini`} className="font-medium text-primary underline underline-offset-4">Apri e approva</Link>
                </li>
              ))}
              {a!.correzioni.map((c) => (
                <li key={`c-${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span><strong>Timbratura dimenticata</strong> · {c.persona || "Operaio"} · {c.tipo} del {format(parseISO(c.ora), "d MMM 'alle' HH:mm", { locale: it })}{c.codice ? ` · ${c.codice}` : ""} · «{c.motivo}»</span>
                  {puoDecidere && <span className="flex gap-2">
                    <Button size="sm" disabled={decidi.isPending} onClick={() => decidi.mutate({ id: c.id, approva: true })}>Approva</Button>
                    <Button size="sm" variant="outline" disabled={decidi.isPending} onClick={() => {
                      const motivo = window.prompt("Perché la respingi? Lo legge l’operaio.");
                      if (motivo?.trim()) decidi.mutate({ id: c.id, approva: false, risposta: motivo.trim() });
                    }}>Respingi</Button>
                  </span>}
                </li>
              ))}
              {a!.bolle.map((b) => (
                <li key={`b-${b.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span><strong>Bolla dal cantiere</strong> · {b.fornitore ?? "Fornitore"}{b.numero ? ` n. ${b.numero}` : ""}{b.codice ? ` · ${b.codice}` : ""} · {b.persona || "Operaio"}</span>
                  <Link to={b.order_id ? `/azienda/ordini/${b.order_id}?tab=cantiere&vista_cantiere=diario#section-rapportini` : "/azienda/magazzino"} className="font-medium text-primary underline underline-offset-4">Verifica</Link>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section aria-labelledby="cantieri-titolo" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cantieri-titolo" className="font-semibold">I cantieri</h2>
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
        <p className="text-xs text-muted-foreground">Persone oggi = timbrate / previste dalle assegnazioni delle fasi. «Fermo» = nessun segnale dal cantiere da {GIORNI_FERMO} giorni con persone previste.</p>
      </section>
    </div>
  );
}
