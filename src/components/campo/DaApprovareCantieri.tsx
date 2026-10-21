/**
 * Le cose del cantiere che aspettano una decisione dell'ufficio: rapportini e collaudi inviati,
 * timbrature dimenticate, bolle fotografate in cantiere. Sta in Attività di chi è autorizzato ad
 * approvarle (chi può modificare le commesse, o il titolare): l'elenco lo decide il database
 * (ufficio_da_approvare) con le commesse che quella persona vede. Approvata una cosa, sparisce per tutti.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Pesante (approvazione con verifica economica e delle fasi): caricato solo
// quando si apre il popup, per non appesantire la pagina Attività.
const OrdineRapportiniCampo = lazy(() => import("@/components/orders/OrdineRapportiniCampo").then((m) => ({ default: m.OrdineRapportiniCampo })));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface DaApprovare {
  rapportini: Array<{ id: string; order_id: string; codice: string | null; giorno: string; autore: string; collaudo: boolean; ore: number }>;
  correzioni: Array<{ id: string; order_id: string | null; codice: string | null; tipo: "entrata" | "uscita"; ora: string; motivo: string; persona: string }>;
  bolle: Array<{ id: string; order_id: string | null; codice: string | null; fornitore: string | null; numero: string | null; persona: string }>;
}

/** Chi decide: il titolare o chi può modificare le commesse (lo stesso controllo del database). */
export function usePuoApprovareCantiere() {
  const { role } = useAuth();
  const permissions = usePermissions();
  // Il commercialista non approva il cantiere (il database non gli mostra le approvazioni).
  if (role === "accountant") return false;
  return role === "company_admin" || role === "super_admin" || (!!permissions.canViewOrders && !!permissions.canEditOrders);
}

export function useDaApprovareCantieri(enabled = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["ufficio-da-approvare", companyId],
    enabled: enabled && !!companyId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<DaApprovare> => {
      const { data, error } = await db.rpc("ufficio_da_approvare");
      if (error) throw error;
      return data as DaApprovare;
    },
  });
}

export function totaleDaApprovare(a: DaApprovare | undefined) {
  return (a?.rapportini.length ?? 0) + (a?.correzioni.length ?? 0) + (a?.bolle.length ?? 0);
}

export function DaApprovareCantieri() {
  const puoApprovare = usePuoApprovareCantiere();
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const approvare = useDaApprovareCantieri(puoApprovare);
  // Commessa aperta nel popup «Apri e approva»: si approva lì senza lasciare Attività.
  const [commessaPopup, setCommessaPopup] = useState<{ id: string; titolo: string } | null>(null);
  const chiudiPopup = () => {
    setCommessaPopup(null);
    // Quello appena approvato sparisce dall'elenco.
    void qc.invalidateQueries({ queryKey: ["ufficio-da-approvare"] });
  };

  // Nome del cliente e indirizzo del cantiere al posto del solo codice commessa:
  // una lettura leggera sulle commesse coinvolte (chi approva può vederle).
  const orderIds = useMemo(() => {
    const d = approvare.data;
    if (!d) return [] as string[];
    const ids = [
      ...d.rapportini.map((r) => r.order_id),
      ...d.correzioni.map((c) => c.order_id),
      ...d.bolle.map((b) => b.order_id),
    ].filter((x): x is string => !!x);
    return [...new Set(ids)];
  }, [approvare.data]);
  const nomi = useQuery({
    queryKey: ["ufficio-da-approvare-nomi", effectiveCompany?.id, orderIds],
    enabled: orderIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, { nome: string; indirizzo: string | null; codice: string | null }>> => {
      const { data, error } = await db.from("orders").select("id, client_name, description, order_code, indirizzo_lavori").in("id", orderIds);
      if (error) throw error;
      const m = new Map<string, { nome: string; indirizzo: string | null; codice: string | null }>();
      for (const o of (data ?? []) as Array<{ id: string; client_name: string | null; description: string | null; order_code: string | null; indirizzo_lavori: string | null }>) {
        m.set(o.id, { nome: o.client_name || o.description || o.order_code || "Cantiere", indirizzo: o.indirizzo_lavori, codice: o.order_code });
      }
      return m;
    },
  });
  // Etichetta del cantiere: «Cliente · Indirizzo» (il codice resta come riferimento
  // piccolo). Finché i nomi non sono caricati, mostra il codice come prima.
  const etichetta = (orderId: string | null, codiceFallback: string | null) => {
    const i = orderId ? nomi.data?.get(orderId) : undefined;
    if (!i) return codiceFallback ?? "Cantiere";
    return i.indirizzo ? `${i.nome} · ${i.indirizzo}` : i.nome;
  };
  // Il codice come riferimento piccolo, SOLO quando il nome è già caricato
  // (altrimenti il nome stesso è il codice e non va ripetuto).
  const codiceDi = (orderId: string | null) => (orderId ? nomi.data?.get(orderId)?.codice ?? null : null);
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

  if (!puoApprovare) return null;
  // Azienda non ancora pronta o richiesta non partita: niente da mostrare.
  if (!approvare.data && !approvare.isLoading && !approvare.isError) return null;
  const a = approvare.data;
  const tot = totaleDaApprovare(a);
  // Niente in attesa: il riquadro non occupa posto in Attività.
  if (approvare.isSuccess && tot === 0) return null;

  return (
    <section aria-labelledby="da-approvare-titolo" className="rounded-xl border border-amber-200 bg-card">
      <h2 id="da-approvare-titolo" className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
        <ClipboardList className="h-4 w-4 text-amber-600" />Dal cantiere, da approvare
        {tot > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{tot}</span>}
      </h2>
      {approvare.isLoading ? <p className="p-4 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carico…</p>
        : approvare.isError ? <p role="alert" className="p-4 text-sm text-destructive">Non riesco a leggere le approvazioni. <button className="underline" onClick={() => void approvare.refetch()}>Riprova</button></p>
        : (
          <ul className="divide-y">
            {[...a!.rapportini].sort((x, y) => x.giorno.localeCompare(y.giorno)).map((r) => {
              const inRitardo = differenceInCalendarDays(new Date(), parseISO(r.giorno)) > 14;
              const codice = codiceDi(r.order_id);
              return (
                <li key={`r-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    {inRitardo && <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">in ritardo</span>}
                    {r.collaudo && <span className="font-semibold">Collaudo · </span>}
                    <strong>{etichetta(r.order_id, r.codice)}</strong> · {format(parseISO(r.giorno), "d MMM", { locale: it })} · {r.autore || "Cantiere"}{r.ore > 0 ? ` · ${r.ore} h` : ""}
                    {codice ? <span className="text-muted-foreground"> · {codice}</span> : null}
                  </span>
                  <button type="button" onClick={() => setCommessaPopup({ id: r.order_id, titolo: etichetta(r.order_id, r.codice) })} className="whitespace-nowrap font-medium text-primary underline underline-offset-4">Apri e approva</button>
                </li>
              );
            })}
            {a!.correzioni.map((c) => (
              <li key={`c-${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span><strong>Timbratura dimenticata</strong> · {c.persona || "Operaio"} · {c.tipo} del {format(parseISO(c.ora), "d MMM 'alle' HH:mm", { locale: it })} · {etichetta(c.order_id, c.codice)}{codiceDi(c.order_id) ? ` · ${codiceDi(c.order_id)}` : ""} · «{c.motivo}»</span>
                <span className="flex gap-2">
                  <Button size="sm" disabled={decidi.isPending} onClick={() => decidi.mutate({ id: c.id, approva: true })}>Approva</Button>
                  <Button size="sm" variant="outline" disabled={decidi.isPending} onClick={() => {
                    const motivo = window.prompt("Perché la respingi? Lo legge l’operaio.");
                    if (motivo?.trim()) decidi.mutate({ id: c.id, approva: false, risposta: motivo.trim() });
                  }}>Respingi</Button>
                </span>
              </li>
            ))}
            {a!.bolle.map((b) => (
              <li key={`b-${b.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span><strong>Bolla dal cantiere</strong> · {b.fornitore ?? "Fornitore"}{b.numero ? ` n. ${b.numero}` : ""}{(b.order_id || b.codice) ? ` · ${etichetta(b.order_id, b.codice)}` : ""}{codiceDi(b.order_id) ? ` · ${codiceDi(b.order_id)}` : ""} · {b.persona || "Operaio"}</span>
                <Link to={b.order_id ? `/azienda/ordini/${b.order_id}?tab=cantiere&vista_cantiere=diario#section-rapportini` : "/azienda/magazzino"} className="font-medium text-primary underline underline-offset-4">Verifica</Link>
              </li>
            ))}
          </ul>
        )}
      <Dialog open={!!commessaPopup} onOpenChange={(aperto) => { if (!aperto) chiudiPopup(); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Approva · {commessaPopup?.titolo}</DialogTitle>
          </DialogHeader>
          {commessaPopup && (
            <Suspense fallback={<p className="p-4 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carico il cantiere…</p>}>
              <OrdineRapportiniCampo orderId={commessaPopup.id} />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
