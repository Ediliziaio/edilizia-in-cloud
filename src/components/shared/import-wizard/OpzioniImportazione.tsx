import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Tag, UserCheck, Workflow, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { AutomazioneScelta, PersonaScelta } from "@/lib/importazione/tipi";
import { useCompanyStaff } from "@/hooks/useOpportunitiesData";
import {
  PROGRAMMAZIONE_PREDEFINITA, descriviProgrammazione, fineStimata, formatoData, type Programmazione,
} from "@/lib/importazione/programmata";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export type { AutomazioneScelta } from "@/lib/importazione/tipi";

const GIORNI = ["L", "M", "M", "G", "V", "S", "D"];
const NOMI_GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

/** «2026-11-23T09:30» nel fuso del browser, per il campo data e ora. */
const perCampo = (d: Date) => {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};

/** Subito, oppure a scaglioni: quanti per volta, ogni quanto, da quando, in che orari e giorni. */
function QuandoImportare({ programmazione, onChange, totale }: {
  programmazione: Programmazione | null;
  onChange: (p: Programmazione | null) => void;
  totale?: number;
}) {
  const tr = useT();
  const p = programmazione;
  const cambia = (parziale: Partial<Programmazione>) => p && onChange({ ...p, ...parziale });
  const fine = p && totale ? fineStimata(totale, p) : null;
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4 text-primary" /> {tr("Quando importare")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {[{ v: false, t: tr("Subito, tutti insieme") }, { v: true, t: tr("A scaglioni, programmati") }].map(({ v, t }) => (
          <button
            key={t} type="button" aria-pressed={!!p === v}
            onClick={() => onChange(v ? (p ?? PROGRAMMAZIONE_PREDEFINITA()) : null)}
            className={`rounded-md border px-3 py-1.5 text-sm ${!!p === v ? "border-primary bg-primary/10 font-medium text-primary" : "bg-background"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {p && (
        <div className="mt-3 space-y-3 rounded-md border bg-background p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>{tr("Importa")}</span>
            <Input aria-label={tr("Quanti per volta")} type="number" min={1} max={500} className="h-8 w-20"
              value={p.perGiro} onChange={(e) => cambia({ perGiro: Math.min(500, Math.max(1, Number(e.target.value) || 1)) })} />
            <span>{tr("ogni")}</span>
            <select aria-label={tr("Ogni quanti minuti")} className="h-8 rounded-md border bg-background px-2"
              value={p.ogniMinuti} onChange={(e) => cambia({ ogniMinuti: Number(e.target.value) })}>
              {[1, 5, 10, 15, 30, 60, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? tr("{n} minuti", { n: m }) : tr(m === 60 ? "{n} ora" : "{n} ore", { n: m / 60 })}</option>)}
            </select>
          </div>
          <label className="flex flex-wrap items-center gap-2">
            <span>{tr("A partire da")}</span>
            <Input aria-label={tr("A partire da")} type="datetime-local" className="h-8 w-56"
              value={perCampo(p.inizio)} onChange={(e) => e.target.value && cambia({ inizio: new Date(e.target.value) })} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <Checkbox checked={!!p.fasciaDa} aria-label={tr("Solo in una fascia oraria")}
                onCheckedChange={(v) => cambia(v ? { fasciaDa: "09:00", fasciaA: "18:00" } : { fasciaDa: undefined, fasciaA: undefined })} />
              <span>{tr("Solo dalle")}</span>
            </label>
            <Input aria-label={tr("Dalle")} type="time" className="h-8 w-28" disabled={!p.fasciaDa} value={p.fasciaDa ?? ""} onChange={(e) => cambia({ fasciaDa: e.target.value })} />
            <span>{tr("alle")}</span>
            <Input aria-label={tr("Alle")} type="time" className="h-8 w-28" disabled={!p.fasciaA} value={p.fasciaA ?? ""} onChange={(e) => cambia({ fasciaA: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1">{tr("Nei giorni")}</span>
            {GIORNI.map((g, i) => {
              const n = i + 1;
              const attivo = p.giorni.includes(n);
              return (
                <button key={n} type="button" aria-pressed={attivo} aria-label={tr(NOMI_GIORNI[i])}
                  onClick={() => cambia({ giorni: attivo ? p.giorni.filter((x) => x !== n) : [...p.giorni, n].sort() })}
                  className={`h-8 w-8 rounded-full border text-xs font-medium ${attivo ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                  {g}
                </button>
              );
            })}
          </div>
          <p className="rounded bg-primary/5 px-2 py-1.5 text-xs text-primary">
            {p.giorni.length === 0 ? tr("Scegli almeno un giorno.")
              : p.fasciaDa && p.fasciaA && p.fasciaDa >= p.fasciaA ? tr("L'orario di fine deve venire dopo quello di inizio, nello stesso giorno.")
              : <>{descriviProgrammazione(p)}{fine ? <>. {tr("Finisce verso")} <strong>{formatoData(fine)}</strong></> : null}.</>}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Cosa fare ai contatti appena importati: etichette da aggiungere a tutti e
 * automazioni in cui farli entrare. Solo i flussi pubblicati: gli altri non partono.
 */
/** A chi vanno i contatti nuovi: nessuno (come oggi), una persona, o più persone a turno. */
function AChiAssegnarli({ assegnatari, onChange, opportunita }: { assegnatari: PersonaScelta[]; onChange: (v: PersonaScelta[]) => void; opportunita: boolean }) {
  const t = useT();
  const { data: persone = [], isLoading } = useCompanyStaff();
  const scelte = new Set(assegnatari.map((a) => a.id));
  const nomi = assegnatari.map((a) => a.nome).join(", ");
  const spiegazione = opportunita
    ? assegnatari.length === 0
      ? t("Le opportunità restano senza nessuno assegnato, come oggi.")
      : assegnatari.length === 1
        ? t("Le opportunità vanno tutti a {nome}.", { nome: nomi })
        : t("Le opportunità vanno a turno, uno a testa, tra {nomi}.", { nomi })
    : assegnatari.length === 0
      ? t("I contatti nuovi restano senza nessuno assegnato, come oggi.")
      : assegnatari.length === 1
        ? t("I contatti nuovi vanno tutti a {nome}.", { nome: nomi })
        : t("I contatti nuovi vanno a turno, uno a testa, tra {nomi}.", { nomi });
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium"><UserCheck className="h-4 w-4 text-primary" /> {t("A chi assegnarli")}</p>
      <p className="mb-2 text-xs text-muted-foreground">
        {spiegazione} {opportunita ? t("Un contatto nuovo va alla stessa persona della sua opportunità.") : t("I contatti che c'erano già tengono chi hanno.")}
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("Caricamento delle persone…")}</p>
      ) : (
        <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {persone.filter((p) => p.name).map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:border-primary/50">
              <Checkbox
                checked={scelte.has(p.id)}
                onCheckedChange={(v) => onChange(v ? [...assegnatari, { id: p.id, nome: p.name }] : assegnatari.filter((a) => a.id !== p.id))}
              />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function OpzioniImportazione({ etichette, onEtichetteChange, automazioni, onAutomazioniChange, programmazione, onProgrammazioneChange, totale, assegnatari, onAssegnatariChange, opportunita = false }: {
  etichette: string[];
  onEtichetteChange: (v: string[]) => void;
  automazioni: AutomazioneScelta[];
  onAutomazioniChange: (v: AutomazioneScelta[]) => void;
  programmazione?: Programmazione | null;
  onProgrammazioneChange?: (p: Programmazione | null) => void;
  /** Quante righe entreranno: serve a dire quando finisce. */
  totale?: number;
  assegnatari?: PersonaScelta[];
  onAssegnatariChange?: (v: PersonaScelta[]) => void;
  /** Si importano opportunità (cambia solo come lo si dice). */
  opportunita?: boolean;
}) {
  const tr = useT();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [testo, setTesto] = useState("");
  const { data: flussi = [], isLoading } = useQuery({
    queryKey: ["automation-flows-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_flows")
        .select("id, name, status, version")
        .eq("company_id", companyId!)
        .eq("status", "published")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const aggiungi = () => {
    const nuove = testo.split(",").map((t) => t.trim()).filter((t) => t && !etichette.includes(t));
    if (nuove.length) onEtichetteChange([...etichette, ...nuove]);
    setTesto("");
  };
  const scelta = new Set(automazioni.map((a) => a.id));

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      {onProgrammazioneChange && (
        <QuandoImportare programmazione={programmazione ?? null} onChange={onProgrammazioneChange} totale={totale} />
      )}

      {onAssegnatariChange && (
        <AChiAssegnarli assegnatari={assegnatari ?? []} onChange={onAssegnatariChange} opportunita={opportunita} />
      )}

      <div>
        <p className="flex items-center gap-2 text-sm font-medium"><Tag className="h-4 w-4 text-primary" /> {tr("Etichette da aggiungere")}</p>
        <p className="mb-2 text-xs text-muted-foreground">{tr("Vanno su tutti i contatti importati, insieme a quelle già nel file.")}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {etichette.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {e}
              <button type="button" aria-label={tr("Togli l'etichetta {e}", { e: String(e ?? "") })} onClick={() => onEtichetteChange(etichette.filter((x) => x !== e))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Input
            aria-label={tr("Nuova etichetta")}
            value={testo}
            onChange={(ev) => setTesto(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === ",") { ev.preventDefault(); aggiungi(); } }}
            onBlur={aggiungi}
            placeholder={etichette.length ? tr("Aggiungi un'altra…") : tr("Scrivi un'etichetta e premi Invio")}
            className="h-8 w-56 text-sm"
          />
        </div>
      </div>

      <div>
        <p className="flex items-center gap-2 text-sm font-medium"><Workflow className="h-4 w-4 text-primary" /> {tr("Automazioni in cui farli entrare")}</p>
        <p className="mb-2 text-xs text-muted-foreground">
          {programmazione
            ? tr("Ogni contatto entra nelle automazioni scelte appena viene importato, con il suo scaglione.")
            : tr("I contatti importati partono subito dal primo passaggio di ogni automazione scelta.")}
        </p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">{tr("Caricamento delle automazioni…")}</p>
        ) : flussi.length === 0 ? (
          <p className="text-xs text-muted-foreground">{tr("Non ci sono automazioni attive.")}</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {flussi.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:border-primary/50">
                <Checkbox
                  checked={scelta.has(f.id)}
                  onCheckedChange={(v) => onAutomazioniChange(v ? [...automazioni, { id: f.id, nome: f.name }] : automazioni.filter((a) => a.id !== f.id))}
                />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
