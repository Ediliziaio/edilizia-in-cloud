/**
 * «Hai dimenticato di timbrare?» — l'operaio chiede all'ufficio di registrare
 * un'entrata o un'uscita mancata. La timbratura entra nel registro solo quando
 * l'ufficio approva (campo_timbratura_correzione_decidi), dalla commessa.
 * Fino a quanti giorni indietro lo decide l'azienda, come per il rapportino.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useRegoleCampoOrdine } from "@/hooks/useRegoleCampo";
import { cantieriAperti } from "@/lib/campo/cantieriAperti";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { campoWorkDay, giorniSceglibili, istanteRoma, shiftWorkDay } from "@/lib/campo/workDay";
import { cn } from "@/lib/utils";

// La tabella e le due RPC non sono ancora nei tipi generati: contratto locale.
type Rpc = (nome: "campo_timbratura_correzione_chiedi", args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface CorrezioneRiga {
  id: string;
  tipo: "entrata" | "uscita";
  ora_richiesta: string;
  motivo: string;
  stato: "in_attesa" | "approvata" | "respinta";
  motivo_risposta: string | null;
}

const STATO: Record<CorrezioneRiga["stato"], { testo: string; classe: string }> = {
  in_attesa: { testo: "In attesa dell’ufficio", classe: "bg-amber-100 text-amber-800" },
  approvata: { testo: "Approvata", classe: "bg-green-100 text-green-800" },
  respinta: { testo: "Respinta", classe: "bg-red-100 text-red-800" },
};

/** «HH:MM» del giorno (ora italiana) → istante. */
export function istanteDaGiornoEOra(giorno: string, ora: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(ora.trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return istanteRoma(giorno, h, min);
}

export function CorrezioneTimbratura({ preferOrderId }: { preferOrderId?: string | null }) {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const qc = useQueryClient();
  const assegnazioni = useCampoAssignments();
  const cantieri = cantieriAperti(assegnazioni.data ?? []);
  const [orderId, setOrderId] = useState<string>("");
  const cantiere = orderId || (preferOrderId && cantieri.some(c => c.order_id === preferOrderId) ? preferOrderId : cantieri[0]?.order_id) || "";
  const regole = useRegoleCampoOrdine(cantiere || undefined);
  const giorni = giorniSceglibili(undefined, regole.data?.giorniIndietro ?? 1);
  const oggi = campoWorkDay();
  const [tipo, setTipo] = useState<"entrata" | "uscita">("uscita");
  const [giorno, setGiorno] = useState<string>(oggi);
  const [ora, setOra] = useState("");
  const [motivo, setMotivo] = useState("");
  const giornoValido = giorni.includes(giorno) ? giorno : giorni[0];

  const elenco = useQuery({
    queryKey: ["campo-correzioni-timbrature", companyId, user?.id],
    enabled: !!user?.id && !!companyId,
    queryFn: async (): Promise<CorrezioneRiga[]> => {
      const { data, error } = await db
        .from("campo_timbrature_correzioni")
        .select("id, tipo, ora_richiesta, motivo, stato, motivo_risposta")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as CorrezioneRiga[];
    },
  });

  const chiedi = useMutation({
    mutationFn: async () => {
      const istante = istanteDaGiornoEOra(giornoValido, ora);
      if (!istante) throw new Error("Scrivi l’ora, per esempio 17:30");
      if (istante.getTime() > Date.now()) throw new Error("L’ora non può essere nel futuro");
      if (motivo.trim().length < 3) throw new Error("Scrivi in due parole cosa è successo");
      const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
      const { error } = await rpc("campo_timbratura_correzione_chiedi", {
        p_order_id: cantiere || null, p_tipo: tipo, p_ora: istante.toISOString(), p_motivo: motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta mandata: l’ufficio la vede nella commessa");
      setOra(""); setMotivo("");
      void qc.invalidateQueries({ queryKey: ["campo-correzioni-timbrature"] });
    },
    onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito a mandare la richiesta. Riprova.")),
  });

  const righe = elenco.data ?? [];
  const inAttesa = righe.filter(r => r.stato === "in_attesa").length;

  return (
    <details className="rounded-2xl border border-border bg-background p-4" open={inAttesa > 0 ? true : undefined}>
      <summary className="min-h-11 cursor-pointer text-sm font-semibold">
        Hai dimenticato di timbrare?{inAttesa > 0 ? ` · ${inAttesa} in attesa` : ""}
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => { e.preventDefault(); if (!chiedi.isPending) chiedi.mutate(); }}
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cosa hai dimenticato">
          {(["entrata", "uscita"] as const).map((t) => (
            <button
              key={t} type="button" role="radio" aria-checked={tipo === t}
              onClick={() => setTipo(t)}
              className={cn("min-h-12 rounded-xl border text-sm font-semibold", tipo === t ? "border-primary bg-primary/10 text-primary" : "bg-muted/40")}
            >
              {t === "entrata" ? "L’entrata" : "L’uscita"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Giorno</span>
            <select value={giornoValido} onChange={(e) => setGiorno(e.target.value)} className="h-12 w-full rounded-lg border bg-background px-3 text-base">
              {giorni.map((g) => (
                <option key={g} value={g}>
                  {g === oggi ? "Oggi" : g === shiftWorkDay(oggi, -1) ? "Ieri" : format(parseISO(g), "EEE d MMM", { locale: it })}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Ora</span>
            <input type="time" value={ora} onChange={(e) => setOra(e.target.value)} required
              className="h-12 w-full rounded-lg border bg-background px-3 text-base" />
          </label>
        </div>
        {cantieri.length > 1 && (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Cantiere</span>
            <select value={cantiere} onChange={(e) => setOrderId(e.target.value)} className="h-12 w-full rounded-lg border bg-background px-3 text-base">
              {cantieri.map((c) => (
                <option key={c.order_id} value={c.order_id}>{c.order?.order_code ?? "Cantiere"}{c.order?.description ? ` · ${c.order.description}` : ""}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Cosa è successo</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} required
            placeholder="Es. telefono scarico, ero già in macchina"
            className="h-12 w-full rounded-lg border bg-background px-3 text-base" />
        </label>
        <button type="submit" disabled={chiedi.isPending}
          className="min-h-12 w-full rounded-xl bg-primary px-3 text-base font-bold text-primary-foreground disabled:opacity-50">
          {chiedi.isPending ? "Mando…" : "Chiedi la correzione all’ufficio"}
        </button>
        <p className="text-xs text-muted-foreground">La timbratura entra nelle tue ore quando l’ufficio la approva.</p>
      </form>

      {righe.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Le tue richieste">
          {righe.map((r) => (
            <li key={r.id} className="rounded-xl border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {r.tipo === "entrata" ? "Entrata" : "Uscita"} · {format(parseISO(r.ora_richiesta), "EEE d MMM HH:mm", { locale: it })}
                </span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", STATO[r.stato].classe)}>{STATO[r.stato].testo}</span>
              </div>
              {r.stato === "respinta" && r.motivo_risposta && <p className="mt-1 text-xs text-red-800">{r.motivo_risposta}</p>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
