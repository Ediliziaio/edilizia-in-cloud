/**
 * Ferie e Permessi dell'operaio — visualizza richieste e invia nuove.
 * Simile alla sezione HR dell'ufficio ma limitata all'utente loggato.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, CalendarDays, Loader2, CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assertBalanceAvailable, assertNoOverlappingRequest } from "@/hooks/useRichieste";
import { useAuth } from "@/contexts/AuthContext";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const TIPI_RICHIESTA = [
  { value: "ferie", label: "Ferie" },
  { value: "permesso", label: "Permesso" },
  { value: "malattia", label: "Malattia" },
  { value: "rol", label: "ROL" },
  { value: "straordinario", label: "Straordinario" },
  { value: "smart_working", label: "Smart Working" },
  { value: "trasferta", label: "Trasferta" },
  { value: "altro", label: "Altro" },
];

const STATO_CONFIG: Record<string, { label: string; icon: any; color: string; badgeClass: string }> = {
  in_attesa: { label: "In attesa", icon: AlertCircle, color: "text-amber-500", badgeClass: "bg-amber-100 text-amber-700" },
  approvata: { label: "Approvata", icon: CheckCircle, color: "text-green-600", badgeClass: "bg-green-100 text-green-700" },
  rifiutata: { label: "Rifiutata", icon: XCircle, color: "text-red-500", badgeClass: "bg-red-100 text-red-700" },
};

export default function CampoFerie() {
  const tr = useT();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  // Profilo HR: la lista dell'ufficio joina hr_profili via profilo_id — senza,
  // la richiesta compariva in HR senza nome del dipendente.
  const { data: hrProfilo } = useMyHrProfilo();

  // Form state
  const [tipo, setTipo] = useState("ferie");
  const [dataInizio, setDataInizio] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dataFine, setDataFine] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  // Permesso o ROL a ore (24/11): «2 ore domani mattina» è la richiesta più comune in cantiere.
  const [ore, setOre] = useState<number | null>(null);
  const aOre = tipo === "permesso" || tipo === "rol";
  const giorno = (spostamento: number) => format(new Date(Date.now() + spostamento * 86_400_000), "yyyy-MM-dd");

  // Le mie richieste
  const { data: richieste = [], isLoading } = useQuery({
    queryKey: ["campo-mie-richieste", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_richieste")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Invia nuova richiesta
  const { mutate: inviaRichiesta, isPending: submitting } = useMutation({
    mutationFn: async () => {
      if (!dataInizio || !dataFine) throw new Error(tr("Seleziona le date"));
      if (dataFine < dataInizio) throw new Error(tr("La data fine deve essere dopo la data inizio"));

      // STESSE regole dell'ufficio (prima questo form le bypassava: si
      // potevano chiedere ferie oltre il saldo o sovrapposte a richieste
      // già approvate, e l'ufficio se ne accorgeva solo a mano).
      const companyIdCampo = (profile as any)?.company_id as string | undefined;
      if (hrProfilo?.id && companyIdCampo) {
        const { data: saldi } = await supabase
          .from("hr_profili")
          .select("ferie_residue, permessi_residui_ore, rol_residuo_ore, ore_giornaliere")
          .eq("id", hrProfilo.id)
          .maybeSingle();
        if (saldi) {
          assertBalanceAvailable(
            { tipo: tipo as any, data_inizio: dataInizio, data_fine: dataFine, ore_richieste: aOre && ore ? ore : null },
            saldi as any,
          );
        }
        await assertNoOverlappingRequest({
          companyId: companyIdCampo,
          profiloId: hrProfilo.id,
          tipo: tipo as any,
          dataInizio,
          dataFine,
          stati: ["in_attesa", "approvata"] as any,
        });
      }

      const { error } = await supabase.from("hr_richieste").insert({
        user_id: user!.id,
        company_id: (profile as any)?.company_id,
        profilo_id: hrProfilo?.id ?? null,
        tipo,
        data_inizio: dataInizio,
        data_fine: dataFine,
        motivo: note.trim() || null,
        ore_richieste: aOre && ore ? ore : null,
        stato: "in_attesa",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Richiesta inviata! L'ufficio ti notifichera."));
      queryClient.invalidateQueries({ queryKey: ["campo-mie-richieste"] });
      setShowForm(false);
      setNote("");
      setOre(null);
    },
    onError: (err: any) => toast.error(err.message ?? tr("Errore nell'invio")),
  });

  // KPI
  const inAttesa = richieste.filter((r: any) => r.stato === "in_attesa").length;
  const approvate = richieste.filter((r: any) => r.stato === "approvata").length;
  const rifiutate = richieste.filter((r: any) => r.stato === "rifiutata").length;

  return (
    <div className="space-y-4 md:space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-semibold tracking-tight">{tr("Ferie e permessi")}</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{tr("Chiedi ferie e permessi e vedi le risposte")}</p>
        </div>
        {/* Col modulo aperto il pulsante sparisce: un'azione piena sola in vista, «Invia richiesta» (collaudo 23/11). */}
        {!showForm && <Button onClick={() => setShowForm(true)} size="sm" className="shrink-0">
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">{tr("Nuova richiesta")}</span>
          <span className="sm:hidden">{tr("Nuova")}</span>
        </Button>}
      </div>

      {/* KPI — solo se c'è qualcosa da contare: tre zeri occupavano una riga senza dire niente. */}
      {inAttesa + approvate + rifiutate > 0 && <div className="grid grid-cols-3 gap-3">
        {[
          { label: tr("In attesa"), value: inAttesa, color: "text-amber-500" },
          { label: tr("Approvate"), value: approvate, color: "text-green-600" },
          { label: tr("Rifiutate"), value: rifiutate, color: "text-red-500" },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={cn("text-2xl font-bold mt-1", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>}

      {/* Form nuova richiesta */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{tr("Nuova richiesta")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">{tr("Tipo")}</label>
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                {TIPI_RICHIESTA.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTipo(t.value)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-sm font-medium border transition-all active:scale-95",
                      tipo === t.value
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {tr(t.label)}
                  </button>
                ))}
              </div>
            </div>

            {/* Le date più chieste a un tocco; il calendario resta sotto per tutto il resto. */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr("Quando")}>
              {[{ label: "Oggi", d: 0 }, { label: "Domani", d: 1 }, { label: "Dopodomani", d: 2 }].map(q => {
                const attivo = dataInizio === giorno(q.d) && dataFine === giorno(q.d);
                return (
                  <button key={q.label} type="button" aria-pressed={attivo}
                    onClick={() => { setDataInizio(giorno(q.d)); setDataFine(giorno(q.d)); }}
                    className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold",
                      attivo ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
                    {tr(q.label)}
                  </button>
                );
              })}
            </div>

            {aOre && (
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">{tr("Quante ore")}</label>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr("Quante ore")}>
                  {[1, 2, 3, 4].map(h => (
                    <button key={h} type="button" aria-pressed={ore === h} onClick={() => setOre(ore === h ? null : h)}
                      className={cn("min-h-11 min-w-14 rounded-full border px-4 text-sm font-semibold",
                        ore === h ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
                      {h} h
                    </button>
                  ))}
                  <button type="button" aria-pressed={ore === null} onClick={() => setOre(null)}
                    className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold",
                      ore === null ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
                    {tr("Tutto il giorno")}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">{tr("Data inizio")}</label>
                <input
                  type="date"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-foreground"
                  value={dataInizio}
                  onChange={e => {
                    const v = e.target.value;
                    setDataInizio(v);
                    // La fine segue l'inizio: evita il giro errore-al-submit
                    if (dataFine < v) setDataFine(v);
                  }}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">{tr("Data fine")}</label>
                <input
                  type="date"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-foreground"
                  value={dataFine}
                  min={dataInizio}
                  onChange={e => setDataFine(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">{tr("Note (opzionale)")}</label>
              <textarea
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-foreground resize-none placeholder:text-muted-foreground"
                rows={2}
                placeholder={tr("Motivo della richiesta...")}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                {tr("Annulla")}
              </Button>
              <Button onClick={() => inviaRichiesta()} disabled={submitting} className="flex-1">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {tr("Invia richiesta")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista richieste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tr("Le mie richieste")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : richieste.length === 0 ? (
            <div className="text-center py-8">
              <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">{tr("Nessuna richiesta inviata")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {richieste.map((r: any) => {
                const statoConf = STATO_CONFIG[r.stato] || STATO_CONFIG.in_attesa;
                const Icon = statoConf.icon;
                return (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-xl"
                  >
                    <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", statoConf.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground capitalize">{(() => { const etichetta = TIPI_RICHIESTA.find(x => x.value === r.tipo)?.label; return etichetta ? tr(etichetta) : r.tipo; })()}</span>
                        <Badge className={cn("text-[10px]", statoConf.badgeClass)}>
                          {tr(statoConf.label)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.data_inizio === r.data_fine
                          ? format(new Date(r.data_inizio), "d MMMM yyyy", { locale: dateFnsCampo() })
                          : <>{format(new Date(r.data_inizio), "d MMM", { locale: dateFnsCampo() })} — {format(new Date(r.data_fine), "d MMM yyyy", { locale: dateFnsCampo() })}</>}
                      </p>
                      {r.ore_richieste ? <p className="text-xs text-muted-foreground">{tr("{n} ore", { n: Number(r.ore_richieste) })}</p> : null}
                      {r.motivo && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2" dir="auto">{r.motivo}</p>
                      )}
                      {/* La risposta dell'ufficio: prima si vedeva solo lo stato, il perché no. */}
                      {r.note_risposta && (
                        <p className="mt-1.5 rounded-lg bg-background px-2 py-1.5 text-xs" dir="auto">
                          <span className="font-semibold">{tr("Ufficio:")}</span> {r.note_risposta}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
