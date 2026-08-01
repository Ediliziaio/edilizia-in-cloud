/**
 * ConsensiFirmaBlock — cosa il cliente accetta prima di firmare un preventivo.
 *
 * Chiede a `quote-sign` (action "requisiti") quali consensi servono per QUESTA
 * offerta e con quali testi: cambiano per azienda (clausole e testi suoi) e per
 * tipo di firmatario (un privato ha il ripensamento, un'impresa no).
 *
 * Le clausole vessatorie hanno una spunta SEPARATA: è il punto dell'art. 1341
 * c.c. c.2 — dentro un "accetto tutto" non sarebbero opponibili.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldAlert } from "lucide-react";
import type { ConsensoRaccolto, TipoFirmatario } from "../../../supabase/functions/_shared/quoteLegal";
import { CONSENSO } from "../../../supabase/functions/_shared/quoteLegal";

interface ClausolaVessatoria { codice: string; titolo: string; testo: string }

interface Requisiti {
  obbligatori: string[];
  facoltativi: string[];
  testi: Record<string, string>;
  clausole_vessatorie: ClausolaVessatoria[];
  condizioni_testo: string | null;
}

interface Props {
  token: string;
  tipoFirmatario: TipoFirmatario;
  /** Notifica al genitore i consensi correnti e se sono sufficienti per firmare. */
  onChange: (stato: { consensi: ConsensoRaccolto[]; completo: boolean }) => void;
  /** Testo chiaro su fondo scuro nella pagina pubblica. */
  scuro?: boolean;
}

export function ConsensiFirmaBlock({ token, tipoFirmatario, onChange, scuro = false }: Props) {
  const [req, setReq] = useState<Requisiti | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [spuntati, setSpuntati] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let annullato = false;
    setCaricamento(true);
    supabase.functions
      .invoke("quote-sign", { body: { token, action: "requisiti", tipo_firmatario: tipoFirmatario } })
      .then(({ data, error }) => {
        if (annullato) return;
        // Se i requisiti non arrivano non blocchiamo la firma: il backend
        // valida comunque, e un cliente non deve restare fermo per un errore
        // nostro. Resta la sola accettazione dell'offerta.
        setReq(error ? null : (data as Requisiti));
      })
      .finally(() => { if (!annullato) setCaricamento(false); });
    return () => { annullato = true; };
  }, [token, tipoFirmatario]);

  const obbligatori = useMemo(() => req?.obbligatori ?? [], [req]);
  const facoltativi = useMemo(() => req?.facoltativi ?? [], [req]);

  useEffect(() => {
    const consensi: ConsensoRaccolto[] = [...obbligatori, ...facoltativi]
      .filter((chiave) => spuntati[chiave])
      .map((chiave) => ({ chiave, accettato: true, testo: req?.testi?.[chiave] }));
    const completo = obbligatori.every((chiave) => spuntati[chiave]);
    onChange({ consensi, completo });
  }, [spuntati, obbligatori, facoltativi, req, onChange]);

  const spunta = useCallback((chiave: string, v: boolean) => {
    setSpuntati((prev) => ({ ...prev, [chiave]: v }));
  }, []);

  if (caricamento) {
    return (
      <p className={"flex items-center gap-2 text-sm " + (scuro ? "text-white/70" : "text-muted-foreground")}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Preparo i documenti da accettare…
      </p>
    );
  }

  if (!req) return null;

  const etichetta = (chiave: string) => req.testi?.[chiave] ?? chiave;
  const classeTesto = scuro ? "text-white/90" : "text-foreground";
  const classeNota = scuro ? "text-white/60" : "text-muted-foreground";

  return (
    <div className="space-y-3">
      {obbligatori.filter((c) => c !== CONSENSO.VESSATORIE).map((chiave) => (
        <label key={chiave} className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={!!spuntati[chiave]}
            onCheckedChange={(v) => spunta(chiave, !!v)}
            className="mt-0.5"
            aria-label={etichetta(chiave)}
          />
          <span className={"text-sm leading-relaxed whitespace-pre-line " + classeTesto}>
            {etichetta(chiave)}
          </span>
        </label>
      ))}

      {/* Approvazione SEPARATA delle clausole vessatorie: elencate una per una,
          perché il cliente deve poter vedere cosa sta approvando. */}
      {req.clausole_vessatorie.length > 0 && (
        <div className={"rounded-lg border p-3 " + (scuro ? "border-amber-400/40 bg-amber-400/10" : "border-amber-200 bg-amber-50")}>
          <p className={"mb-2 flex items-center gap-1.5 text-xs font-semibold " + (scuro ? "text-amber-200" : "text-amber-800")}>
            <ShieldAlert className="h-3.5 w-3.5" />
            Clausole che richiedono un'approvazione a parte
          </p>
          <ul className="mb-3 space-y-1.5">
            {req.clausole_vessatorie.map((c) => (
              <li key={c.codice} className={"text-xs leading-relaxed " + classeNota}>
                <span className={"font-medium " + classeTesto}>{c.titolo}</span> — {c.testo}
              </li>
            ))}
          </ul>
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={!!spuntati[CONSENSO.VESSATORIE]}
              onCheckedChange={(v) => spunta(CONSENSO.VESSATORIE, !!v)}
              className="mt-0.5"
              aria-label="Approvo specificamente le clausole elencate"
            />
            <span className={"text-sm leading-relaxed " + classeTesto}>
              Approvo specificamente le clausole elencate qui sopra.
            </span>
          </label>
        </div>
      )}

      {facoltativi.map((chiave) => (
        <label key={chiave} className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={!!spuntati[chiave]}
            onCheckedChange={(v) => spunta(chiave, !!v)}
            className="mt-0.5"
            aria-label={etichetta(chiave)}
          />
          <span className={"text-sm leading-relaxed whitespace-pre-line " + classeNota}>
            <span className="font-medium">Facoltativo — </span>{etichetta(chiave)}
          </span>
        </label>
      ))}
    </div>
  );
}
