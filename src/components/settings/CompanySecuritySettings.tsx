/**
 * Regole di sicurezza dell'azienda (dentro «Il mio profilo» → Sicurezza, solo per gli amministratori).
 *
 * Restano le due che qualcuno applica davvero, entrambe lette da `check-login-security` alla schermata di
 * accesso: il blocco dopo troppi tentativi sbagliati (con la sua durata) e l'elenco degli indirizzi da cui si
 * può entrare. Prima c'erano tredici comandi: 2FA obbligatoria (per tutti e per ruolo), scadenza e regole della
 * password e tre avvisi di sicurezza non li leggeva nessun codice, quindi promettevano protezioni che non
 * c'erano. Le colonne restano nel database, la pagina non le mostra e non le scrive più.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AmbitoImpostazione, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessaggioPerUtente, motivoDelRifiuto, righeToccate } from "@/lib/impostazioni/erroriPerUtente";
import {
  DURATE_BLOCCO,
  TENTATIVI_MASSIMI,
  TENTATIVI_MINIMI,
  elencoIndirizzi,
  etichettaDurata,
  indirizzoNonValido,
  indirizzoNellElenco,
  indirizzoSenzaMaschera,
  rischiaDiRestareFuori,
} from "@/lib/impostazioni/regoleSicurezzaAzienda";

interface RegoleAzienda {
  allowed_ips: string[] | null;
  max_failed_attempts: number | null;
  lockout_duration_minutes: number | null;
}

const NUMERI_TENTATIVI = Array.from({ length: TENTATIVI_MASSIMI - TENTATIVI_MINIMI + 1 }, (_, i) => TENTATIVI_MINIMI + i);

export function CompanySecuritySettings() {
  const { effectiveCompany, role, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const isAdmin = role === "company_admin" || role === "super_admin";

  const { data: regole, isError, refetch } = useQuery({
    queryKey: ["company-security", companyId],
    enabled: !!companyId && isAdmin,
    // Il modulo riparte dai dati salvati: una rilettura al ritorno sulla scheda non deve cancellare una bozza.
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RegoleAzienda> => {
      const { data, error } = await supabase
        .from("companies")
        .select("allowed_ips, max_failed_attempts, lockout_duration_minutes")
        .eq("id", companyId!)
        .single();
      if (error) throw error;
      return data as RegoleAzienda;
    },
  });

  // L'indirizzo da cui è partito l'ultimo accesso di chi guarda: è quello che la schermata di accesso ha visto,
  // lo stesso con cui confronterà l'elenco. Serve a non chiudere fuori sé stessi. Se non si legge, si va avanti senza.
  const { data: mioIndirizzo = null } = useQuery({
    queryKey: ["mio-ultimo-accesso", user?.id],
    enabled: !!user?.id && isAdmin,
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("login_attempts")
        .select("ip_address")
        .eq("user_id", user!.id)
        .eq("success", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return indirizzoSenzaMaschera(data?.ip_address);
    },
  });

  if (!isAdmin || !companyId) return null;

  if (isError) {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Non riesco a leggere le regole di sicurezza. Nessuna modifica verrà salvata.
          <Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!regole) {
    return (
      <SezioneImpostazione id="regole-azienda" titolo="Regole di sicurezza dell'azienda" descrizione="Valgono per tutte le persone dell'azienda quando entrano.">
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
        </p>
      </SezioneImpostazione>
    );
  }

  // Il modulo riparte dai dati salvati ogni volta che cambiano (anche dopo un salvataggio).
  return <FormRegole key={JSON.stringify(regole)} companyId={companyId} salvate={regole} mioIndirizzo={mioIndirizzo} />;
}

function FormRegole({ companyId, salvate, mioIndirizzo }: { companyId: string; salvate: RegoleAzienda; mioIndirizzo: string | null }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { evidenziata } = useVaiASezione(true);

  const [tentativi, setTentativi] = useState(String(salvate.max_failed_attempts ?? 5));
  const [durata, setDurata] = useState(String(salvate.lockout_duration_minutes ?? 30));
  const [testoIndirizzi, setTestoIndirizzi] = useState((salvate.allowed_ips ?? []).join("\n"));

  const elenco = useMemo(() => elencoIndirizzi(testoIndirizzi), [testoIndirizzi]);
  const nonValidi = elenco.filter(indirizzoNonValido);

  const modifiche: Record<string, unknown> = {};
  if (Number(tentativi) !== (salvate.max_failed_attempts ?? 5)) modifiche.max_failed_attempts = Number(tentativi);
  if (Number(durata) !== (salvate.lockout_duration_minutes ?? 30)) modifiche.lockout_duration_minutes = Number(durata);
  if (elenco.join("|") !== (salvate.allowed_ips ?? []).join("|")) modifiche.allowed_ips = elenco.length > 0 ? elenco : null;
  const dirty = Object.keys(modifiche).length > 0;

  const salva = useMutation({
    mutationFn: async () => {
      // L'aggiornamento non dà errore quando le regole di accesso gli lasciano toccare zero righe.
      const { data, error } = await supabase.from("companies").update(modifiche as never).eq("id", companyId).select("id");
      if (error) throw error;
      if (righeToccate(data) === 0) throw new MessaggioPerUtente("Il tuo utente non può modificare le regole di sicurezza dell'azienda.");
    },
    onSuccess: () => {
      toast.success("Regole di sicurezza salvate");
      // Subito nella copia in memoria: il modulo riparte da qui, senza aspettare la rilettura.
      queryClient.setQueryData(["company-security", companyId], { ...salvate, ...modifiche });
      void queryClient.invalidateQueries({ queryKey: ["company-security", companyId] });
    },
    onError: (errore) => toast.error("Regole non salvate", { description: motivoDelRifiuto(errore, "Riprova tra poco.") }),
  });
  useSettingsDraftGuard(dirty || salva.isPending);

  const avviaSalvataggio = async () => {
    if (!dirty || salva.isPending || nonValidi.length > 0) return;
    if (modifiche.allowed_ips && rischiaDiRestareFuori(elenco, mioIndirizzo)) {
      const ok = await confirm({
        title: "Il tuo indirizzo potrebbe restare fuori",
        description: mioIndirizzo && indirizzoNellElenco(mioIndirizzo, elenco) === false
          ? `Dopo il salvataggio si entra solo dagli indirizzi scritti. Il tuo ultimo accesso è partito da ${mioIndirizzo}, che nell'elenco non c'è: rischi di non poter più entrare. Salvare lo stesso?`
          : "Dopo il salvataggio si entra solo dagli indirizzi scritti. Se il tuo non c'è, non potrai più entrare. Salvare lo stesso?",
        confirmLabel: "Salva lo stesso",
        variant: "destructive",
      });
      if (!ok) return;
    }
    salva.mutate();
  };

  const mioIndirizzoManca = mioIndirizzo !== null && !elenco.includes(mioIndirizzo);
  const aggiungiMioIndirizzo = () => {
    if (!mioIndirizzo) return;
    setTestoIndirizzi((testo) => (testo.trim() ? `${testo.trimEnd()}\n${mioIndirizzo}` : mioIndirizzo));
  };

  return (
    <SezioneImpostazione
      id="regole-azienda"
      titolo="Regole di sicurezza dell'azienda"
      descrizione="Valgono per tutte le persone dell'azienda quando entrano."
      ambito={<AmbitoImpostazione>Tutta l'azienda</AmbitoImpostazione>}
      evidenziata={evidenziata === "regole-azienda"}
    >
      <fieldset disabled={salva.isPending} className="m-0 min-w-0 divide-y border-0 p-0">
        <div className="space-y-3 px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold">Troppi tentativi sbagliati</h3>
            <p className="text-xs text-muted-foreground">Dopo troppe password sbagliate di fila l'account si ferma da solo, per un po'.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sicurezza-tentativi">Blocca l'account dopo</Label>
              <Select value={tentativi} onValueChange={setTentativi}>
                <SelectTrigger id="sicurezza-tentativi"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NUMERI_TENTATIVI.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} password sbagliate</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sicurezza-durata">Quanto resta bloccato</Label>
              <Select value={durata} onValueChange={setDurata}>
                <SelectTrigger id="sicurezza-durata"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATE_BLOCCO.map((d) => (
                    <SelectItem key={d.valore} value={d.valore}>{d.etichetta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {durata === "0"
              ? "L'account resta bloccato finché non lo sblocca un amministratore."
              : `L'account si sblocca da solo dopo ${etichettaDurata(durata)}.`}
          </p>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold">Indirizzi autorizzati</h3>
            <p id="sicurezza-indirizzi-aiuto" className="text-xs text-muted-foreground">
              Se scrivi degli indirizzi, si entra solo da quelli. Lascia vuoto per entrare da dove si vuole.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sicurezza-indirizzi">Indirizzi da cui si può entrare, uno per riga</Label>
            <Textarea
              id="sicurezza-indirizzi"
              value={testoIndirizzi}
              onChange={(e) => setTestoIndirizzi(e.target.value)}
              rows={4}
              placeholder={"203.0.113.25\n198.51.100.7"}
              className="font-mono text-sm"
              aria-describedby="sicurezza-indirizzi-aiuto"
              aria-invalid={nonValidi.length > 0}
            />
          </div>
          {mioIndirizzo && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>L'ultimo accesso con il tuo account è partito da <strong className="font-mono text-foreground">{mioIndirizzo}</strong>.</span>
              {mioIndirizzoManca && (
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={aggiungiMioIndirizzo}>
                  <Plus className="h-3.5 w-3.5" /> Aggiungilo all'elenco
                </Button>
              )}
            </div>
          )}
          {nonValidi.length > 0 && (
            <p role="alert" className="text-xs text-destructive">
              «{nonValidi[0]}» non sembra un indirizzo: scrivi per esempio 203.0.113.25.
            </p>
          )}
          <Alert role="note" className="border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Attenzione: se sbagli, nessuno potrà entrare, nemmeno tu.
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p role="status" className={dirty && !salva.isPending ? "text-xs font-medium text-amber-700 dark:text-amber-400" : "text-xs text-muted-foreground"}>
            {salva.isPending ? "Salvataggio…" : dirty ? "Modifiche non salvate" : "Nessuna modifica da salvare"}
          </p>
          <Button size="sm" onClick={avviaSalvataggio} disabled={!dirty || salva.isPending || nonValidi.length > 0}>
            {salva.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salva regole
          </Button>
        </div>
      </fieldset>
    </SezioneImpostazione>
  );
}
