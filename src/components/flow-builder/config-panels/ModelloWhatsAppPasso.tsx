/**
 * Passo «Invia WhatsApp» delle automazioni: il modello approvato da Meta
 * (24/09/2026).
 *
 * Prima il passo aveva solo il testo libero, che Meta consegna soltanto se il
 * cliente ha scritto nelle ultime 24 ore: a un lead nuovo non arrivava niente.
 * Qui si sceglie un modello dell'azienda; il motore lo rilegge a ogni invio
 * (process-automation → executeSendWhatsApp) e compila le variabili dal
 * contatto secondo la mappatura decisa alla creazione del modello. Le
 * variabili senza campo sono testo fisso e si scrivono qui.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { corpoDelModello } from "../../../../supabase/functions/_shared/modelloWhatsApp";
import { ETICHETTE_CAMPI } from "../../../../supabase/functions/_shared/variabiliModelloWhatsApp";

const TESTO_LIBERO = "__testo_libero__";
const NON_DISPONIBILE = "__non_disponibile__";

const STATI: Record<string, string> = {
  PENDING: "in attesa di approvazione",
  REJECTED: "rifiutato da Meta",
  PAUSED: "in pausa",
  DISABLED: "disattivato",
};

interface ModelloDelNumero {
  template_name: string;
  template_language: string;
  status: string;
  wa_number_id: string | null;
  variables_count: number | null;
  variable_mapping: Record<string, string> | null;
  components_json: unknown;
  numero: string | null;
}

const chiave = (m: Pick<ModelloDelNumero, "wa_number_id" | "template_name" | "template_language">) =>
  `${m.wa_number_id ?? ""}|${m.template_name}|${m.template_language}`;

interface Props {
  config: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  companyId?: string;
}

const stringa = (v: unknown) => (typeof v === "string" ? v : "");

export function ModelloWhatsAppPasso({ config, onPatch, companyId }: Props) {
  const { data: modelli = [], isLoading } = useQuery({
    queryKey: ["flow-wa-modelli", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ModelloDelNumero[]> => {
      const [{ data: righe, error }, { data: numeri }] = await Promise.all([
        supabase
          .from("wa_meta_templates")
          .select("template_name, template_language, status, wa_number_id, variables_count, variable_mapping, components_json")
          .eq("company_id", companyId!)
          .order("template_name"),
        supabase
          .from("ai_whatsapp_numbers")
          .select("id, display_name, numero")
          .eq("company_id", companyId!)
          .is("deleted_at", null),
      ]);
      if (error) throw error;
      const nomeNumero = new Map((numeri ?? []).map((n) => [n.id, [n.display_name, n.numero].filter(Boolean).join(" · ")]));
      return (righe ?? []).map((r) => ({
        template_name: r.template_name,
        template_language: r.template_language,
        status: String(r.status ?? "").toUpperCase(),
        wa_number_id: r.wa_number_id,
        variables_count: r.variables_count,
        variable_mapping: (r.variable_mapping ?? null) as Record<string, string> | null,
        components_json: r.components_json,
        numero: r.wa_number_id ? nomeNumero.get(r.wa_number_id) ?? null : null,
      }));
    },
  });

  const nomeScelto = stringa(config.modello_whatsapp);
  const numeroScelto = stringa(config.modello_whatsapp_numero);
  const linguaScelta = stringa(config.modello_whatsapp_lingua);
  const scelto = nomeScelto
    ? modelli.find((m) =>
      m.template_name === nomeScelto
      && (!numeroScelto || m.wa_number_id === numeroScelto)
      && (!linguaScelta || m.template_language === linguaScelta))
    : undefined;
  // Scelto ma non più tra i modelli del numero (cancellato, numero scollegato):
  // va detto qui, non scoperto quando il passo fallisce.
  const nonPiuDisponibile = !!nomeScelto && !isLoading && !scelto;
  const piuNumeri = new Set(modelli.map((m) => m.wa_number_id)).size > 1;
  const valori = (config.modello_whatsapp_valori && typeof config.modello_whatsapp_valori === "object"
    ? config.modello_whatsapp_valori
    : {}) as Record<string, string>;

  const scegli = (valore: string) => {
    if (valore === NON_DISPONIBILE) return;
    if (valore === TESTO_LIBERO) {
      onPatch({ modello_whatsapp: "", modello_whatsapp_lingua: "", modello_whatsapp_numero: "", modello_whatsapp_valori: {} });
      return;
    }
    const m = modelli.find((x) => chiave(x) === valore);
    if (!m) return;
    onPatch({
      modello_whatsapp: m.template_name,
      modello_whatsapp_lingua: m.template_language,
      modello_whatsapp_numero: m.wa_number_id ?? "",
      modello_whatsapp_valori: {},
    });
  };

  const corpo = scelto ? corpoDelModello(scelto.components_json) : null;
  const posizioni = scelto ? Array.from({ length: Math.max(0, scelto.variables_count ?? 0) }, (_, i) => String(i + 1)) : [];

  return (
    <div className="space-y-2">
      <Select
        value={scelto ? chiave(scelto) : nomeScelto ? NON_DISPONIBILE : TESTO_LIBERO}
        onValueChange={scegli}
      >
        <SelectTrigger className="h-9 text-sm" aria-label="Modello WhatsApp">
          <SelectValue placeholder="Nessun modello" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TESTO_LIBERO}>Nessun modello: testo libero (solo entro 24 ore)</SelectItem>
          {modelli.map((m) => (
            <SelectItem key={chiave(m)} value={chiave(m)} disabled={m.status !== "APPROVED"}>
              {m.template_name} · {m.template_language}
              {piuNumeri && m.numero ? ` · ${m.numero}` : ""}
              {m.status !== "APPROVED" ? ` (${STATI[m.status] ?? m.status.toLowerCase()})` : ""}
            </SelectItem>
          ))}
          {nonPiuDisponibile && (
            <SelectItem value={NON_DISPONIBILE} disabled>{nomeScelto} (non più disponibile)</SelectItem>
          )}
        </SelectContent>
      </Select>

      {!nomeScelto && (
        <p className="text-[11px] text-muted-foreground">
          Senza modello il messaggio parte solo se il cliente ha scritto nelle ultime 24 ore: a un contatto nuovo serve un modello approvato.
        </p>
      )}
      {nonPiuDisponibile && (
        <p className="text-[11px] font-medium text-destructive">
          Il modello «{nomeScelto}» non c'è più tra quelli dei tuoi numeri: scegline un altro.
        </p>
      )}
      {scelto && scelto.status !== "APPROVED" && (
        <p className="text-[11px] font-medium text-destructive">
          Il modello è {STATI[scelto.status] ?? scelto.status.toLowerCase()}: il passo non invia finché Meta non lo approva.
        </p>
      )}

      {corpo && (
        <p className="whitespace-pre-wrap rounded-md border bg-muted/40 px-2.5 py-2 text-xs">{corpo}</p>
      )}

      {posizioni.map((n) => {
        const campo = scelto?.variable_mapping?.[n];
        if (campo) {
          return (
            <p key={n} className="text-[11px] text-muted-foreground">
              {`{{${n}}}`} = {ETICHETTE_CAMPI[campo] ?? (campo.startsWith("cf:") ? "campo personalizzato" : campo)} del contatto
            </p>
          );
        }
        return (
          <div key={n} className="space-y-1">
            <p className="text-[11px] text-muted-foreground">{`{{${n}}}`} è testo fisso: scrivilo qui</p>
            <Input
              className="h-8 text-xs"
              aria-label={`Testo per {{${n}}}`}
              value={valori[n] ?? ""}
              placeholder="Es. il nostro consulente, oppure {{contatto.city}}"
              onChange={(e) => onPatch({ modello_whatsapp_valori: { ...valori, [n]: e.target.value } })}
            />
          </div>
        );
      })}
    </div>
  );
}
