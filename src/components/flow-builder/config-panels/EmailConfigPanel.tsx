import { forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VariablePicker } from "./VariablePicker";
import { EvidenzaObbligatoria, campoVuoto } from "./EvidenzaObbligatoria";
import { EmailBodyEditor, type EmailVariable } from "./EmailBodyEditor";
import { EmailPreviewActions } from "./EmailPreviewActions";
import { useModelliEmail } from "@/hooks/useModelliEmail";

/** Variabili lato azienda (contatto/opportunità) per il corpo email. */
const COMPANY_EMAIL_VARIABLES: EmailVariable[] = [
  { key: "contatto.first_name", label: "Nome contatto" },
  { key: "contatto.last_name", label: "Cognome contatto" },
  { key: "contatto.email", label: "Email contatto" },
  { key: "contatto.company_name", label: "Azienda contatto" },
  { key: "opportunita.name", label: "Nome opportunità" },
];

/**
 * Variabili di commessa: le risolve il motore quando l'automazione parte da
 * un evento di commessa (supabase/functions/_shared/variabiliCommessa.ts).
 */
const COMMESSA_EMAIL_VARIABLES: EmailVariable[] = [
  { key: "cliente.nome", label: "Nome cliente" },
  { key: "cliente.cognome", label: "Cognome cliente" },
  { key: "cliente.nome_completo", label: "Nome e cognome cliente" },
  { key: "commessa.codice", label: "Codice commessa" },
  { key: "commessa.descrizione", label: "Descrizione commessa" },
  { key: "commessa.fase", label: "Fase commessa" },
  { key: "commessa.importo", label: "Importo commessa" },
  { key: "commessa.acconto", label: "Acconto" },
  { key: "commessa.saldo", label: "Saldo" },
  { key: "commessa.data_installazione", label: "Data di posa (es. lunedì 12 ottobre 2026)" },
  { key: "commessa.indirizzo", label: "Indirizzo lavori" },
  { key: "azienda.nome", label: "Nome azienda" },
  { key: "azienda.iban", label: "IBAN azienda" },
  { key: "azienda.intestatario_conto", label: "Intestatario del conto" },
  { key: "azienda.telefono", label: "Telefono azienda" },
  { key: "azienda.email", label: "Email azienda" },
];

/** Trigger che fanno partire l'automazione da una commessa (entità "order"). */
const TRIGGER_COMMESSA = new Set([
  "ordine_creato", "ordine_stato_cambiato", "commessa_data_installazione", "cantiere_creato",
]);

const NESSUN_MODELLO = "__nessuno__";
/** L'email parte dal dominio di piattaforma, con il nome dell'azienda. */
const PIATTAFORMA = "__piattaforma__";

interface EmailConfigPanelProps {
  config: Record<string, any>;
  onChange: (field: string, value: any) => void;
  /** Scrittura di più campi in un colpo solo (collega/scollega il modello). */
  onPatch?: (patch: Record<string, any>) => void;
  triggerItemId?: string;
  companyId?: string;
}

export const EmailConfigPanel = forwardRef<HTMLDivElement, EmailConfigPanelProps>(function EmailConfigPanel({ config, onChange, onPatch, triggerItemId, companyId }, ref) {
  const { data: modelli = [] } = useModelliEmail(companyId);
  const suCommessa = !!triggerItemId && TRIGGER_COMMESSA.has(triggerItemId);
  const variabili = suCommessa ? [...COMMESSA_EMAIL_VARIABLES, ...COMPANY_EMAIL_VARIABLES] : COMPANY_EMAIL_VARIABLES;

  // Caselle collegate dall'azienda: l'email può partire da una di queste e
  // restare nella sua posta inviata, invece che dal dominio di piattaforma.
  const { data: caselle = [] } = useQuery({
    queryKey: ["flow-email-caselle", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_oauth_connections")
        .select("id, email_address, status")
        .eq("company_id", companyId!)
        .order("email_address");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; email_address: string; status: string }>;
    },
  });
  const casellaId: string = config.casella_id || "";
  const casella = caselle.find((c) => c.id === casellaId);
  const modelloId: string = config.modello_id || "";
  const modello = modelli.find((m) => m.id === modelloId);
  // Modello scelto ma non più in elenco (cancellato, o azienda diversa):
  // va detto qui, non scoperto quando il motore non trova più il testo.
  const modelloMancante = !!modelloId && modelli.length > 0 && !modello;

  const patch = (p: Record<string, any>) => {
    if (onPatch) { onPatch(p); return; }
    for (const [k, v] of Object.entries(p)) onChange(k, v);
  };

  const scegliModello = (valore: string) => {
    if (valore === NESSUN_MODELLO) {
      // Scollega: il testo del modello resta nel nodo, così non si perde
      // niente e da qui in poi si modifica solo questa email.
      patch({
        modello_id: "",
        modello_nome: "",
        oggetto: config.oggetto || modello?.subject || "",
        corpo: config.corpo || modello?.html_content || "",
      });
      return;
    }
    const scelto = modelli.find((m) => m.id === valore);
    patch({ modello_id: valore, modello_nome: scelto?.name ?? "" });
  };

  return (
    <div ref={ref} className="space-y-4">
      {/* Modello salvato: oggetto e testo arrivano da lì a ogni invio */}
      <div className="space-y-1.5 rounded-md border p-2.5">
        <Label className="text-xs">Modello salvato</Label>
        <Select value={modelloId || NESSUN_MODELLO} onValueChange={scegliModello}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Nessun modello" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NESSUN_MODELLO}>Nessun modello — scrivo il testo qui</SelectItem>
            {modelli.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modello && (
          <p className="text-[11px] text-muted-foreground">
            Oggetto: «{modello.subject}». Modificando il modello cambiano tutte le email che lo usano.
          </p>
        )}
        {modelloMancante && (
          <p className="text-[11px] font-medium text-destructive">
            Il modello collegato non esiste più: scegline un altro o scrivi il testo qui.
          </p>
        )}
        {!modelloId && modelli.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Nessun modello salvato: scrivi il testo qui sotto, oppure creane uno in Email Marketing → Modelli.
          </p>
        )}
      </div>

      {/* Da dove parte: casella dell'azienda o dominio di piattaforma */}
      <div className="space-y-1.5">
        <Label className="text-xs">Invia da</Label>
        <Select
          value={casellaId || PIATTAFORMA}
          onValueChange={(v) => onChange("casella_id", v === PIATTAFORMA ? "" : v)}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={PIATTAFORMA}>Email di sistema, con il nome dell'azienda</SelectItem>
            {caselle.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.email_address}{c.status !== "active" ? " — da ricollegare" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {casellaId && !casella && caselle.length > 0 && (
          <p className="text-[11px] font-medium text-destructive">La casella scelta non è più collegata: scegline un'altra.</p>
        )}
        {casella && casella.status !== "active" && (
          <p className="text-[11px] font-medium text-destructive">
            {casella.email_address} è scollegata: finché non la ricolleghi da Impostazioni › Posta le email non partono.
          </p>
        )}
        {casella?.status === "active" && (
          <p className="text-[11px] text-muted-foreground">Parte da {casella.email_address} e la trovi nella sua posta inviata.</p>
        )}
        {caselle.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Per inviare dalla casella dell'azienda collegala prima in Impostazioni › Posta.
          </p>
        )}
      </div>

      {/* Mittente personalizzato: solo per l'email di sistema. Dalla casella
          collegata il mittente è la casella stessa. */}
      {!casellaId && (
      <div className="space-y-1.5">
        <Label className="text-xs">Da (mittente)</Label>
        <Input
          value={config.da_nome || ""}
          onChange={e => onChange("da_nome", e.target.value)}
          placeholder="Nome mittente"
          className="h-8 text-xs"
        />
        <Input
          value={config.da_email || ""}
          onChange={e => onChange("da_email", e.target.value)}
          placeholder="email@azienda.it"
          className="h-8 text-xs"
        />
      </div>
      )}

      {/* Recipient */}
      <EvidenzaObbligatoria mostra={campoVuoto(config.destinatario)}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Destinatario</Label>
          <VariablePicker onInsert={v => onChange("destinatario", (config.destinatario || "") + v)} />
        </div>
        <Input
          value={config.destinatario || ""}
          onChange={e => onChange("destinatario", e.target.value)}
          placeholder={suCommessa ? "{{cliente.email}}" : "{{contatto.email}}"}
          className="h-8 text-xs"
        />
        {suCommessa && (
          <p className="text-[11px] text-muted-foreground">
            {"{{cliente.email}}"} = il cliente della commessa.
          </p>
        )}
      </div>
      </EvidenzaObbligatoria>

      {/* Fattura in allegato: solo sulle automazioni di commessa */}
      {suCommessa && (
        <div className="flex items-start justify-between gap-3 rounded-md border p-2.5">
          <div className="min-w-0">
            <Label className="text-xs">Allega la fattura della commessa</Label>
            <p className="text-[11px] text-muted-foreground">
              L'ultima caricata nella cartella «Fatture e pagamenti» della commessa (se ci sono anche ricevute, vince
              il file con «fattura» nel nome). Se non c'è, l'email non parte e l'errore resta nello storico.
            </p>
          </div>
          <Switch
            checked={config.allega_fattura_commessa === true}
            onCheckedChange={(v) => onChange("allega_fattura_commessa", v)}
            aria-label="Allega la fattura della commessa"
          />
        </div>
      )}

      {/* CC */}
      <div className="space-y-1.5">
        <Label className="text-xs">CC (opzionale)</Label>
        <Input
          value={config.cc || ""}
          onChange={e => onChange("cc", e.target.value)}
          placeholder="cc@azienda.it"
          className="h-8 text-xs"
        />
      </div>

      {/* Con un modello collegato oggetto e testo NON stanno nel nodo: si
          modificano nel modello. Mostrarli qui vuoti (o peggio modificabili
          senza effetto) è il modo più veloce per far credere di aver
          cambiato un'email che parte invece identica a prima. */}
      {modelloId ? (
        <div className="space-y-2 rounded-md border bg-muted/40 p-2.5">
          <p className="text-[11px] text-muted-foreground">
            Oggetto e testo arrivano dal modello{modello ? ` «${modello.name}»` : ""}.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => scegliModello(NESSUN_MODELLO)}
          >
            Scrivi il testo qui
          </Button>
        </div>
      ) : (
      <>
      {/* Subject */}
      <EvidenzaObbligatoria mostra={campoVuoto(config.oggetto)}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Oggetto</Label>
          <VariablePicker onInsert={v => onChange("oggetto", (config.oggetto || "") + v)} />
        </div>
        <Input
          value={config.oggetto || ""}
          onChange={e => onChange("oggetto", e.target.value)}
          placeholder="Es: Conferma appuntamento - {{appuntamento.appointment_date}}"
          className="h-8 text-xs"
        />
      </div>
      </EvidenzaObbligatoria>

      {/* Test A/B sull'oggetto: la leva che rende di più a parità di lavoro.
          Metà dei destinatari riceve l'oggetto A, metà il B, e il registro
          segna quale ha ricevuto chi. La scelta è stabile: se l'invio viene
          ritentato la stessa persona riceve la stessa versione. */}
      <div className="space-y-1.5 rounded-md border p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Label className="text-xs">Prova un secondo oggetto</Label>
            <p className="text-[11px] text-muted-foreground">
              Metà dei contatti riceve questo al posto del primo.
            </p>
          </div>
          <Switch
            checked={!!config.oggetto_b && config.ab_attivo !== false}
            onCheckedChange={(v) => onChange("ab_attivo", v)}
            aria-label="Prova un secondo oggetto"
            disabled={!config.oggetto_b}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">Oggetto B</Label>
          <VariablePicker onInsert={v => onChange("oggetto_b", (config.oggetto_b || "") + v)} />
        </div>
        <Input
          value={config.oggetto_b || ""}
          onChange={e => onChange("oggetto_b", e.target.value)}
          placeholder="Lo stesso messaggio, detto in un altro modo"
          className="h-8 text-xs"
        />
        {config.oggetto_b && config.ab_attivo === false && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            Secondo oggetto scritto ma spento: parte solo il primo.
          </p>
        )}
      </div>

      {/* Body — editor visuale (niente HTML a mano) */}
      <EvidenzaObbligatoria mostra={campoVuoto(config.corpo)}>
      <div className="space-y-1.5">
        <Label className="text-xs">Corpo email</Label>
        <EmailBodyEditor
          value={config.corpo}
          onChange={(html) => onChange("corpo", html)}
          variables={variabili}
          triggerItemId={triggerItemId}
        />
      </div>
      </EvidenzaObbligatoria>
      </>
      )}

      {/* Send delay */}
      <div className="space-y-1.5">
        <Label className="text-xs">Ritardo invio</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            value={config.ritardo_valore || 0}
            onChange={e => onChange("ritardo_valore", parseInt(e.target.value) || 0)}
            className="h-8 text-xs w-20"
          />
          <Select value={config.ritardo_unita || "minuti"} onValueChange={v => onChange("ritardo_unita", v)}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minuti">Minuti</SelectItem>
              <SelectItem value="ore">Ore</SelectItem>
              <SelectItem value="giorni">Giorni</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Anteprima + invio di prova — col modello si prova il testo del modello */}
      <EmailPreviewActions
        oggetto={modello?.subject ?? config.oggetto}
        corpo={modello?.html_content ?? config.corpo}
        mittenteNome={config.da_nome}
      />
    </div>
  );
});
