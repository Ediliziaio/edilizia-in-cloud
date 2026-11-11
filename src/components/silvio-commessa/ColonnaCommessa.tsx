/**
 * «La commessa» nel popup di Silvio: le 14 aree nell'ordine del registro, con lo stato
 * (✓ ✋ ❓ ⚠), la ⓘ della fonte di ogni valore, la modifica a mano (sempre da `applica`), i
 * conflitti da scegliere con un tocco e il cliente da collegare.
 * Vedi docs/piano-silvio-commessa-ai.md, 3.2 e 3.4.
 *
 * In «Completa» quello che la commessa ha già si vede fatto e chiuso (🔒): niente matita,
 * si cambia dalla pagina della commessa.
 *
 * Fase 3: quello che la chat ha cambiato resta segnato («cambiato in chat») finché non lo
 * tocchi; la ⓘ di un valore letto da un documento apre il documento alla pagina citata
 * (anche quella di ognuna delle fonti in conflitto).
 *
 * Fase 4: persone, ditte, mezzi, ordini e bozze si vedono uno per uno, col motivo; chi non è
 * disponibile ha il ⚠ e il perché, e non entra. Il capomastro si legge per nome dallo staff.
 *
 * 01/11/2026, revisione dell'esperienza: in cima «Da decidere» raccoglie conflitti, ⚠,
 * domande e proposte, ognuno con la sua azione accanto («48.500 € · Contratto.pdf»,
 * «Toglilo», «Va bene a tutte»); chi non è disponibile si toglie anche dalla sua riga; le
 * righe che mancano stanno su una riga sola.
 */
import type { Autonomia } from "../../../shared/silvio-commessa/autonomia.ts";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, ChevronRight, FileSearch, Info, Lock, MessageSquare, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { AssignedToSelect } from "@/components/orders/AssignedToSelect";
import { SedeSelect } from "@/components/sedi/SedeSelect";
import { useCompanyCustomers, type CompanyCustomer } from "@/hooks/useCompanyCustomers";
import { emailVera } from "@/lib/preventivatore/selezionaCliente";
import { modificheSceltaCliente } from "@/lib/silvio-commessa/sceltaCliente";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useSediList } from "@/hooks/useSediAnalytics";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { cn } from "@/lib/utils";
import {
  AREE, type Area, type FaseDelPiano, type Fonte, type Modifica, type PianoCommessa, type RataDelPiano, type Stato, type Valore,
} from "../../../shared/silvio-commessa/piano.ts";
import { paginaCitata } from "./documentoCitato";
import type { Completezza } from "../../../shared/silvio-commessa/completezza.ts";
import { variabile as variabileDi, type Variabile } from "../../../shared/silvio-commessa/registro.ts";
import type { ContestoRisorse } from "../../../shared/silvio-commessa/risorse.ts";
import { giaNellaCommessa } from "@/lib/silvio-commessa/scrittura";
import {
  comeSiModifica, daConfermare, fattoDaSolo, NOMI_AREE, NOMI_STATI, nomeColonna, righeDellArea, SEGNI, statoArea, testoConferma, testoValore, tipoCampo,
  dataBreve, euro, SCELTE, type RigaArea, accettaProposte, minuscola, type DaDecidere, alternativePersona, sostituisciPersona,
  importoNascosto, importoRata, parlaDiCosti, quantitaMezzo, TESTO_IMPORTO_NASCOSTO, divisioneDaDecidere, titoloAltre, type NumeroDaControllare,
} from "./presentazione";
import { oggiInItalia } from "../../../shared/silvio-commessa/date.ts";
import { daFareSubito, eraDaFare, scadenzaPassata } from "../../../shared/silvio-commessa/partenza.ts";

const COLORI_STATO: Record<Stato, string> = {
  fatto: "text-emerald-700 bg-emerald-50 border-emerald-200",
  proposta: "text-amber-800 bg-amber-50 border-amber-200",
  manca: "text-slate-600 bg-slate-50 border-slate-200",
  attenzione: "text-red-700 bg-red-50 border-red-200",
};

function Segno({ stato }: { stato: Stato }) {
  return (
    <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs lg:text-[11px]", COLORI_STATO[stato])}
      title={NOMI_STATI[stato]}>
      <span aria-hidden>{SEGNI[stato]}</span>
      <span className="sr-only">{NOMI_STATI[stato]}</span>
    </span>
  );
}

/** «Apri il documento · pagina 4»: c'è solo se la fonte è un documento che si può riaprire. */
function ApriDocumento({ fonte, onApri }: { fonte: Fonte; onApri?: (() => void) | null }) {
  if (!onApri) return null;
  const pagina = paginaCitata(fonte.dove);
  return (
    <Button type="button" size="sm" variant="outline" className="mt-2 h-11 gap-1 bg-white text-xs lg:h-7 lg:text-[11px]" onClick={onApri}>
      <FileSearch className="h-3.5 w-3.5" aria-hidden />{pagina ? `Apri il documento a pagina ${pagina}` : "Apri il documento"}
    </Button>
  );
}

function DaDove({ v, onApri }: { v: Valore; onApri?: (() => void) | null }) {
  const f = v.fonte;
  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs lg:text-[11px] text-slate-700">
      <p><span className="font-medium">Da:</span> {f.etichetta}{f.dove ? `, ${f.dove}` : ""}</p>
      {f.citazione && <blockquote className="mt-1 border-l-2 border-orange-300 pl-2 italic">«{f.citazione}»</blockquote>}
      {f.tipo !== "persona" && <p className="mt-1 text-slate-500">Silvio ne è sicuro al {Math.round(v.fiducia * 100)} %</p>}
      {v.nota && <p className="mt-1 text-slate-500">{v.nota}</p>}
      <ApriDocumento fonte={f} onApri={onApri} />
    </div>
  );
}

// ── Modifica ────────────────────────────────────────────────────────────────

const valoreDelCampo = (tipo: ReturnType<typeof tipoCampo>, s: string | boolean): unknown => {
  if (tipo === "si_no") return s === true;
  const t = String(s).trim();
  if (!t) return null;
  if (tipo === "numero") return parseDecimalIT(t);
  return t;
};

function ModificaCampi({ v, attuale, onSalva, onAnnulla }: {
  v: Variabile; attuale: unknown; onSalva: (valore: unknown) => void; onAnnulla: () => void;
}) {
  const colonne = v.colonne.filter((c) => !/_id$|_at$|_il$/.test(c) || /_date$/.test(c));
  const iniziale = (c: string): string | boolean => {
    const x = colonne.length === 1 ? attuale : (attuale as Record<string, unknown> | null)?.[c];
    if (tipoCampo(v.chiave, c) === "si_no") return x === true;
    if (typeof x === "number") return x.toLocaleString("it-IT", { maximumFractionDigits: 6, useGrouping: false });
    return typeof x === "string" ? x : "";
  };
  const [valori, setValori] = useState<Record<string, string | boolean>>(() => Object.fromEntries(colonne.map((c) => [c, iniziale(c)])));
  const base = useId();
  const salva = () => {
    if (colonne.length === 1) {
      onSalva(valoreDelCampo(tipoCampo(v.chiave, colonne[0]), valori[colonne[0]]));
      return;
    }
    const out: Record<string, unknown> = {};
    for (const c of colonne) {
      const x = valoreDelCampo(tipoCampo(v.chiave, c), valori[c]);
      if (x !== null && x !== "") out[c] = x;
    }
    onSalva(Object.keys(out).length ? out : null);
  };
  return (
    <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); salva(); }}>
      {colonne.map((c, i) => {
        const tipo = tipoCampo(v.chiave, c);
        const id = `${base}-${c}`;
        const etichetta = colonne.length === 1 ? v.etichetta : nomeColonna(c);
        if (tipo === "scelta") {
          return (
            <div key={c} className="space-y-1">
              <label htmlFor={id} className="text-xs lg:text-[11px] font-medium text-slate-600">{etichetta}</label>
              <select id={id} autoFocus={i === 0} value={String(valori[c])} onChange={(e) => setValori({ ...valori, [c]: e.target.value })}
                className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm lg:h-9 lg:text-[13px]">
                <option value="">Scegli…</option>
                {SCELTE[c].map((o) => <option key={o.valore} value={o.valore}>{o.nome}</option>)}
              </select>
            </div>
          );
        }
        if (tipo === "si_no") {
          return (
            <div key={c} className="flex items-center gap-2">
              <Switch id={id} checked={valori[c] === true} onCheckedChange={(x) => setValori({ ...valori, [c]: x })} />
              <label htmlFor={id} className="text-sm lg:text-[13px]">{etichetta}</label>
            </div>
          );
        }
        return (
          <div key={c} className="space-y-1">
            <label htmlFor={id} className="text-xs lg:text-[11px] font-medium text-slate-600">{etichetta}</label>
            {tipo === "testo_lungo"
              ? <Textarea id={id} autoFocus={i === 0} rows={3} value={String(valori[c])} onChange={(e) => setValori({ ...valori, [c]: e.target.value })} />
              : <Input id={id} autoFocus={i === 0} type={tipo === "data" ? "date" : "text"} inputMode={tipo === "numero" ? "decimal" : undefined}
                value={String(valori[c])} onChange={(e) => setValori({ ...valori, [c]: e.target.value })} className="h-11 lg:h-9" />}
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-11 lg:h-9">Salva</Button>
        <Button type="button" size="sm" variant="ghost" className="h-11 lg:h-9" onClick={onAnnulla}>Lascia com'era</Button>
      </div>
    </form>
  );
}

function ModificaFasi({ fasi, onSalva, onAnnulla }: { fasi: FaseDelPiano[]; onSalva: (f: FaseDelPiano[]) => void; onAnnulla: () => void }) {
  const [righe, setRighe] = useState<FaseDelPiano[]>(() => fasi.map((f) => ({ ...f })));
  const cambia = (i: number, p: Partial<FaseDelPiano>) => setRighe(righe.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); onSalva(righe.filter((r) => r.name.trim())); }}>
      <ol className="space-y-2">
        {righe.map((r, i) => (
          <li key={i} className="grid grid-cols-2 items-end gap-2 rounded-md border bg-white p-2 sm:grid-cols-[1fr_8.5rem_8.5rem_auto]">
            {/* Sul telefono il nome ha tutta la riga, e le due date dicono quale è quale. */}
            <div className="col-span-2 flex gap-2 sm:contents">
              <Input aria-label={`Nome della fase ${i + 1}`} value={r.name} onChange={(e) => cambia(i, { name: e.target.value })} className="h-11 min-w-0 flex-1 lg:h-9" />
              <Button type="button" size="icon" variant="ghost" className="h-11 w-11 shrink-0 sm:order-last lg:h-9 lg:w-9" aria-label={`Togli la fase ${i + 1}`}
                onClick={() => setRighe(righe.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="min-w-0 space-y-0.5 text-xs text-slate-600 lg:text-[11px]">
              <span aria-hidden>Inizio</span>
              <Input aria-label={`Inizio della fase ${i + 1}`} type="date" value={r.start_date ?? ""} className="h-11 px-2 lg:h-9"
                onChange={(e) => cambia(i, { start_date: e.target.value || null })} />
            </div>
            <div className="min-w-0 space-y-0.5 text-xs text-slate-600 lg:text-[11px]">
              <span aria-hidden>Fine</span>
              <Input aria-label={`Fine della fase ${i + 1}`} type="date" value={r.end_date ?? ""} className="h-11 px-2 lg:h-9"
                onChange={(e) => cambia(i, { end_date: e.target.value || null })} />
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="h-11 gap-1 lg:h-9" onClick={() => setRighe([...righe, { name: "" }])}>
          <Plus className="h-4 w-4" aria-hidden />Aggiungi una fase
        </Button>
        <Button type="submit" size="sm" className="h-11 lg:h-9">Salva</Button>
        <Button type="button" size="sm" variant="ghost" className="h-11 lg:h-9" onClick={onAnnulla}>Lascia com'era</Button>
      </div>
    </form>
  );
}

function ModificaRate({ rate, onSalva, onAnnulla }: { rate: RataDelPiano[]; onSalva: (r: RataDelPiano[]) => void; onAnnulla: () => void }) {
  const [righe, setRighe] = useState(() => rate.map((r) => ({ ...r, testo: r.amount ? r.amount.toLocaleString("it-IT", { useGrouping: false }) : "" })));
  const cambia = (i: number, p: Partial<(typeof righe)[number]>) => setRighe(righe.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const salva = () => onSalva(righe
    .map(({ testo, ...r }) => ({ ...r, amount: parseDecimalIT(testo) }))
    // Una rata in percentuale senza importo non si perde: l'importo arriva col totale.
    .filter((r) => r.label.trim() && (r.amount > 0 || r.percent != null)));
  return (
    <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); salva(); }}>
      <ol className="space-y-2">
        {righe.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2">
            <Input aria-label={`Nome della rata ${i + 1}`} value={r.label} onChange={(e) => cambia(i, { label: e.target.value })} className="col-span-2 h-11 max-sm:order-1 sm:col-span-1 lg:h-9" />
            <Input aria-label={`Importo della rata ${i + 1}`} inputMode="decimal" value={r.testo} placeholder={r.percent != null ? `${r.percent} %` : undefined}
              onChange={(e) => cambia(i, { testo: e.target.value })} className="col-span-3 h-11 max-sm:order-3 sm:col-span-1 lg:h-9" />
            <Button type="button" size="icon" variant="ghost" className="h-11 w-11 max-sm:order-2 lg:h-9 lg:w-9" aria-label={`Togli la rata ${i + 1}`}
              onClick={() => setRighe(righe.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            <label className="col-span-3 text-xs text-slate-600 max-sm:order-4">Scadenza della rata
              <Input type="date" aria-label={`Scadenza della rata ${i + 1}`} value={r.expected_date ?? ""}
                onChange={(e) => cambia(i, { expected_date: e.target.value || null })} className="mt-1 h-11 lg:h-9" />
            </label>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="h-11 gap-1 lg:h-9"
          onClick={() => setRighe([...righe, { label: `Rata ${righe.length + 1}`, type: "deposit", amount: 0, testo: "" }])}>
          <Plus className="h-4 w-4" aria-hidden />Aggiungi una rata
        </Button>
        <Button type="submit" size="sm" className="h-11 lg:h-9">Salva</Button>
        <Button type="button" size="sm" variant="ghost" className="h-11 lg:h-9" onClick={onAnnulla}>Lascia com'era</Button>
      </div>
    </form>
  );
}

/** Il cliente del gestionale: scelto dall'elenco o creato, coi dati che Silvio ha letto. */
export function SceltaCliente({ companyId, piano, onScegli }: {
  companyId: string; piano: PianoCommessa; onScegli: (id: string, nome: string, cliente?: CompanyCustomer) => void;
}) {
  const { data: clienti = [] } = useCompanyCustomers(companyId);
  const [nuovo, setNuovo] = useState(false);
  const id = useId();
  const scelto = piano.aree.cliente?.["cliente.customer_id"]?.valore;
  const nome = piano.aree.cliente?.["cliente.nome"]?.valore as Record<string, string> | undefined;
  const contatto = piano.aree.cliente?.["cliente.contatto"]?.valore as Record<string, string> | undefined;
  const indirizzo = piano.aree.cliente?.["cliente.client_address"]?.valore;
  return (
    <div className="mt-2 space-y-2">
      <label htmlFor={id} className="text-xs lg:text-[11px] font-medium text-slate-600">Cliente del gestionale</label>
      <div className="flex gap-2">
        <Select value={typeof scelto === "string" ? scelto : ""} onValueChange={(v) => {
          const c = clienti.find((x) => x.id === v);
          onScegli(v, c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "", c);
        }}>
          <SelectTrigger id={id} className="h-11 flex-1 lg:h-9"><SelectValue placeholder="Scegli un cliente" /></SelectTrigger>
          <SelectContent>
            {clienti.map((c) => (
              <SelectItem key={c.id} value={c.id}>{`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}{emailVera(c.email) ? ` (${emailVera(c.email)})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-11 gap-1 lg:h-9" onClick={() => setNuovo(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />Nuovo
        </Button>
      </div>
      {nuovo && (
        <CreateCustomerDialog open onOpenChange={setNuovo} defaultCreatePortalAccount={false}
          initialValues={{
            fullName: nome?.client_company || nome?.client_name || undefined,
            isBusiness: !!nome?.client_company,
            email: contatto?.client_email, phone: contatto?.client_phone,
            address: typeof indirizzo === "string" ? indirizzo : undefined,
          }}
          onCustomerCreated={(cid, cnome, cliente) => { onScegli(cid, cnome, cliente); setNuovo(false); }} />
      )}
    </div>
  );
}

function NomeCliente({ companyId, id }: { companyId: string; id: string }) {
  const { data: clienti = [] } = useCompanyCustomers(companyId);
  const c = clienti.find((x) => x.id === id);
  return <>{c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "cliente del gestionale collegato"}</>;
}

/** Il nome di una persona dello staff: mai da `profiles` grezzo, dove ci sono anche i clienti. */
export function NomeStaff({ companyId, id }: { companyId: string; id: string }) {
  const { data: staff = [] } = useCompanyStaffUsers(companyId);
  const p = staff.find((x) => x.id === id);
  return <>{p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email : "persona dello staff"}</>;
}

/** Il nome della sede scelta: il valore è il suo id. */
export function NomeSede({ id }: { id: string }) {
  const { data: sedi = [] } = useSediList();
  return <>{sedi.find((s) => s.id === id)?.nome ?? "sede scelta"}</>;
}

// ── Una riga ────────────────────────────────────────────────────────────────

/** Gli elenchi della fase 4: un elemento per riga, il motivo sotto, e il ⚠ con il perché. */
const ELENCHI_RISORSE = new Set(["persone.squadra", "ditte.assegnate", "mezzi.allocazioni", "materiali.acquisti", "ditte.contratti"]);

interface ElementoRisorsa {
  nome?: string; fornitore?: string; fase?: string | null; fasi?: string[]; motivo?: string; stato?: string; avviso?: string | null;
  dal?: string | null; al?: string | null; costo_previsto?: number; importo?: number; data_ordine?: string | null; quantita?: number | null;
  righe?: unknown[];
}

function rigaRisorsa(chiave: string, x: ElementoRisorsa, vedeCosti: boolean): { titolo: string; dettaglio: string } {
  const periodo = x.dal ? `${dataBreve(x.dal, false)}${x.al && x.al !== x.dal ? ` → ${dataBreve(x.al, false)}` : ""}` : "";
  switch (chiave) {
    case "persone.squadra": return { titolo: x.nome ?? "Persona", dettaglio: [x.fase, periodo].filter(Boolean).join(" · ") };
    case "ditte.assegnate": return { titolo: x.nome ?? "Ditta", dettaglio: [x.fase, vedeCosti && x.costo_previsto ? euro(x.costo_previsto) : ""].filter(Boolean).join(" · ") };
    case "mezzi.allocazioni": return { titolo: x.nome ?? "Mezzo", dettaglio: [(x.fasi ?? []).join(", "), periodo, quantitaMezzo(x)].filter(Boolean).join(" · ") };
    case "materiali.acquisti": return {
      titolo: x.fornitore ?? "Fornitore",
      dettaglio: [x.fase, `${x.righe?.length ?? 0} voci`, !x.data_ordine ? ""
        : scadenzaPassata(x.data_ordine, oggiInItalia()) ? `da ordinare subito: ${eraDaFare(x.data_ordine)}` : `ordinare entro ${dataBreve(x.data_ordine, false)}`].filter(Boolean).join(" · "),
    };
    default: return { titolo: x.nome ?? "Contratto", dettaglio: [(x.fasi ?? []).join(", "), vedeCosti && x.importo ? euro(x.importo) : "", periodo].filter(Boolean).join(" · ") };
  }
}

function Dettaglio({ chiave, valore, onTogli, vedeCosti }: { chiave: string; valore: unknown; onTogli?: (indice: number) => void; vedeCosti: boolean }) {
  if (ELENCHI_RISORSE.has(chiave) && Array.isArray(valore)) {
    return (
      <ul className="mt-1 space-y-1 text-xs lg:text-[11px]">
        {(valore as ElementoRisorsa[]).map((x, i) => {
          const r = rigaRisorsa(chiave, x, vedeCosti);
          const ko = x.stato === "attenzione";
          return (
            <li key={i} data-stato={ko ? "attenzione" : "proposta"} className={cn("rounded-md px-1.5 py-1", ko && "bg-red-50")}>
              {/* Il nome non si taglia mai: sul telefono il dettaglio va sotto. */}
              <p className="flex flex-wrap justify-between gap-x-2">
                <span className={cn("min-w-0 break-words font-medium", ko ? "text-red-800" : "text-slate-800")}>{ko ? "⚠ " : ""}{r.titolo}</span>
                <span className="text-slate-600">{r.dettaglio}</span>
              </p>
              {ko && (x.avviso || onTogli) && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {x.avviso && <p className="min-w-0 flex-1 text-red-700">{x.avviso}</p>}
                  {onTogli && (
                    <Button type="button" size="sm" variant="outline" className="h-11 border-red-200 bg-white text-xs lg:text-[11px] text-red-800 hover:bg-red-50 lg:h-7"
                      aria-label={`Togli ${r.titolo}`} onClick={(e) => { e.stopPropagation(); onTogli(i); }}>
                      {chiave === "persone.squadra" ? "Toglila dalla squadra" : "Toglila"}
                    </Button>
                  )}
                </div>
              )}
              {!ko && x.motivo && <p className="text-slate-500">{x.motivo}</p>}
              {!ko && x.avviso && <p className="text-amber-800">{x.avviso}</p>}
            </li>
          );
        })}
      </ul>
    );
  }
  if (chiave === "fasi.avvisi_meteo" && Array.isArray(valore)) {
    return (
      <ul className="mt-1 space-y-0.5 text-xs lg:text-[11px] text-amber-800">
        {(valore as { fase?: string; mesi?: string[]; motivo?: string }[]).map((a, i) => (
          <li key={i}>• <span className="font-medium">{a.fase}</span> ({(a.mesi ?? []).join(", ")}): {a.motivo}</li>
        ))}
        <li className="text-slate-500">Regola di stagione, non una previsione: mettilo in conto nei tempi.</li>
      </ul>
    );
  }
  if ((chiave === "sicurezza.pos_duvri" || chiave === "sicurezza.adempimenti") && Array.isArray(valore)) {
    return (
      <ul className="mt-1 space-y-0.5 text-xs lg:text-[11px] text-slate-600">
        {(valore as { titolo?: string; scadenza?: string | null; avviso?: string | null }[]).map((p, i) => {
          // Si guarda oggi, non il giorno in cui Silvio l'ha proposta: la bozza può restare aperta.
          if (p.scadenza && scadenzaPassata(p.scadenza, oggiInItalia())) {
            return <li key={i} className="break-words font-medium text-amber-800">⚠ {daFareSubito(p.titolo ?? "questo", p.scadenza)}</li>;
          }
          return (
            <li key={i}>
              <p className="flex justify-between gap-2">
                <span className="min-w-0 break-words">• {p.titolo}</span>
                {p.scadenza && <span className="shrink-0">entro {dataBreve(p.scadenza, false)}</span>}
              </p>
              {p.avviso && <p className="font-medium text-amber-800">⚠ {p.avviso}</p>}
            </li>
          );
        })}
      </ul>
    );
  }
  if (chiave === "comunicazione.avvio_cliente" && valore && typeof valore === "object") {
    const m = valore as { testo?: string; destinatario?: string | null; avviso?: string | null; scadenza?: string | null };
    return (
      <div className="mt-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 text-xs lg:text-[11px] text-slate-700">
        {m.destinatario && <p className="mb-1 text-slate-500">A: {m.destinatario}</p>}
        <p className="whitespace-pre-line">{m.testo}</p>
        {m.avviso && !(m.scadenza && scadenzaPassata(m.scadenza, oggiInItalia())) && <p className="mt-1 font-medium text-amber-800">⚠ {m.avviso}</p>}
        <p className="mt-1 font-medium text-slate-500">Bozza: Silvio non la manda. La trovi nelle attività della commessa.</p>
      </div>
    );
  }
  if (chiave === "fasi.order_work_phases" && Array.isArray(valore)) {
    return (
      <ol className="mt-1 space-y-0.5 text-xs lg:text-[11px] text-slate-600">
        {(valore as FaseDelPiano[]).map((f, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="min-w-0 break-words">{i + 1}. {f.name}{f.sottofasi?.length ? ` · ${f.sottofasi.length} voci` : ""}</span>
            <span className="shrink-0">{f.start_date && f.end_date ? `${dataBreve(f.start_date, false)} → ${dataBreve(f.end_date, false)}` : f.giorni ? `${f.giorni} gg` : ""}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (chiave === "pagamenti.rate" && Array.isArray(valore)) {
    return (
      <ul className="mt-1 space-y-0.5 text-xs lg:text-[11px] text-slate-600">
        {(valore as RataDelPiano[]).map((r, i) => (
          <li key={i} className="flex justify-between gap-2"><span className="min-w-0 break-words">{r.label}{r.expected_date ? ` · ${r.expected_date.split("-").reverse().join("/")}` : ""}</span><span className="shrink-0">{importoRata(r)}</span></li>
        ))}
      </ul>
    );
  }
  if (chiave === "economia.order_items" && Array.isArray(valore)) {
    const righe = valore as { name?: string }[];
    return (
      <ul className="mt-1 space-y-0.5 text-xs lg:text-[11px] text-slate-600">
        {righe.slice(0, 6).map((r, i) => <li key={i} className="break-words">• {r.name}</li>)}
        {righe.length > 6 && <li>e altre {righe.length - 6}</li>}
      </ul>
    );
  }
  return null;
}

interface RigaProps {
  riga: RigaArea;
  companyId: string;
  piano: PianoCommessa;
  evidenziata: boolean;
  aperta: boolean;
  onApri: (chiave: string | null) => void;
  onModifica: (m: Modifica | Modifica[]) => void;
  /** Cambiata dalla chat e non ancora guardata. */
  daGuardare?: boolean;
  onVisto?: (chiave: string) => void;
  /** Il documento di una fonte, se si può riaprire: null se no. */
  apriFonte?: (f: Fonte) => (() => void) | null;
  /** Fase 5: cosa fa Silvio da solo, per l'azienda. */
  autonomia?: Autonomia | null;
  /** Il permesso «Importi di vendita». */
  vedeImporti?: boolean;
  /** Il permesso sui costi. */
  vedeCosti?: boolean;
  /** La fine che la commessa prende dalle fasi, se la proposta non si conferma. */
  fineDalleFasi?: string | null;
  /** Il cliente letto non si ritrova nel gestionale: senza sceglierlo «Crea» non parte. */
  clienteDaScegliere?: boolean;
}

/** La nota che si legge sulla riga anche a valore confermato: l'inizio spostato su un giorno utile, le rate che aspettano (G3, G9, G20). */
const NOTE_SEMPRE_IN_VISTA: ReadonlySet<string> = new Set(["fasi.work_start_date", "pagamenti.rate"]);

function RigaVariabile({ riga, companyId, piano, evidenziata, aperta, onApri, onModifica, daGuardare, onVisto, apriFonte, autonomia = null, vedeImporti = true, vedeCosti = true, fineDalleFasi = null, clienteDaScegliere = false }: RigaProps) {
  const { variabile: v, valore, conflitto, stato } = riga;
  const [info, setInfo] = useState(false);
  const rif = useRef<HTMLLIElement>(null);
  const bloccata = giaNellaCommessa(piano, valore);
  const nascosto = importoNascosto(v.chiave, vedeImporti, vedeCosti);
  // Un elenco con le cifre si vede senza: nota e testo citato di un'offerta possono dirle.
  const senzaFonte = nascosto || parlaDiCosti(v.chiave, vedeCosti);
  const modo = bloccata || nascosto ? "no" : comeSiModifica(v);
  const idInfo = useId();
  useEffect(() => {
    if (aperta) rif.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [aperta]);
  const cambia = (x: unknown) => {
    onModifica(x == null ? { tipo: "togli", area: v.area, chiave: v.chiave } : { tipo: "cambia_valore", area: v.area, chiave: v.chiave, valore: x });
    onApri(null);
  };
  const testo = nascosto && stato !== "manca" ? TESTO_IMPORTO_NASCOSTO : valore && stato !== "manca"
    ? (v.chiave === "cliente.customer_id" && typeof valore.valore === "string"
      ? <NomeCliente companyId={companyId} id={valore.valore} />
      : (v.chiave === "persone.capomastro" || v.chiave === "persone.assigned_to") && typeof valore.valore === "string"
        ? <NomeStaff companyId={companyId} id={valore.valore} />
        : v.chiave === "identita.sede_id" && typeof valore.valore === "string"
          ? <NomeSede id={valore.valore} />
          : testoValore(v.chiave, valore.valore, vedeCosti))
    : v.chiave === "cliente.customer_id" && piano.aree.cliente?.["cliente.nome"]
      ? (clienteDaScegliere ? "non è nel gestionale: sceglilo o crealo" : "da collegare: alla creazione lo cerco per nome, oppure sceglilo tu")
      // La testata dice già la fine lavori: «manca» sulla stessa schermata sarebbe falso.
      : v.chiave === "fasi.work_end_date" && fineDalleFasi
        ? `${dataBreve(fineDalleFasi)} (segue le fasi)`
        : "manca";

  const apriDi = (f: Fonte) => apriFonte?.(f) ?? null;

  return (
    <li ref={rif} data-chiave={v.chiave} data-da-guardare={daGuardare || undefined}
      onClick={daGuardare ? () => onVisto?.(v.chiave) : undefined}
      onFocus={daGuardare ? () => onVisto?.(v.chiave) : undefined}
      className={cn("rounded-lg px-2 transition-colors duration-700 motion-reduce:transition-none", stato === "manca" && !aperta ? "py-1" : "py-1.5",
        evidenziata && "bg-amber-100/80", daGuardare && "bg-orange-50/70 ring-2 ring-orange-300",
        aperta && "bg-orange-50 ring-1 ring-orange-200")}>
      <div className="flex items-start gap-2">
        <Segno stato={stato} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1 text-xs lg:text-[11px] text-slate-500">
            {v.etichetta}
            {daGuardare && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 text-[11px] font-medium text-orange-800">
                <MessageSquare className="h-3 w-3" aria-hidden />cambiato in chat
              </span>
            )}
            {bloccata && (
              <span className="inline-flex items-center gap-0.5 text-slate-400" title="Già nella commessa: si cambia dalla sua pagina">
                <Lock className="h-3 w-3" aria-hidden /><span className="sr-only">(già nella commessa, non si cambia qui)</span>
              </span>
            )}
          </p>
          <p className={cn("break-words text-sm lg:text-[13px]", stato === "manca" ? "italic text-slate-500" : "font-medium text-slate-900")}>{testo}</p>
          {valore && stato !== "manca" && !aperta && !nascosto && (
            <Dettaglio chiave={v.chiave} valore={valore.valore} vedeCosti={vedeCosti}
              onTogli={bloccata ? undefined : (indice) => onModifica({ tipo: "togli", area: v.area, chiave: v.chiave, indice })} />
          )}
          {valore?.nota && NOTE_SEMPRE_IN_VISTA.has(v.chiave) && !senzaFonte && !aperta && !daConfermare(riga, autonomia) && (
            <p className="mt-0.5 text-xs lg:text-[11px] font-medium text-amber-800">⚠ {valore.nota}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          {valore && stato !== "manca" && !senzaFonte && (
            <button type="button" className="grid h-11 w-11 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:h-8 lg:w-8"
              aria-expanded={info} aria-controls={idInfo} aria-label={`Da dove viene «${v.etichetta}»`} onClick={() => setInfo(!info)}>
              <Info className="h-4 w-4" />
            </button>
          )}
          {modo !== "no" && !conflitto && (
            <button type="button" className="grid h-11 w-11 place-items-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:h-8 lg:w-8"
              aria-label={`Modifica «${v.etichetta}»`} aria-expanded={aperta} onClick={() => onApri(aperta ? null : v.chiave)}>
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {info && valore && <div id={idInfo}><DaDove v={valore} onApri={apriDi(valore.fonte)} /></div>}

      {conflitto && (
        <div className="mt-2 space-y-2" role="group" aria-label={`Scegli quale «${v.etichetta}» tenere`}>
          {conflitto.nota && !senzaFonte && <p className="text-xs lg:text-[11px] font-medium text-amber-800">{conflitto.nota}</p>}
          {conflitto.candidati.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-white p-2">
              <div className="min-w-0 flex-1">
                {!nascosto && <p className="text-sm lg:text-[13px] font-semibold text-slate-900">{testoValore(v.chiave, c.valore, vedeCosti)}</p>}
                <p className="text-xs lg:text-[11px] text-slate-500">{c.fonte.etichetta}{c.fonte.dove ? `, ${c.fonte.dove}` : ""}</p>
                {c.fonte.citazione && !senzaFonte && <p className="text-xs lg:text-[11px] italic text-slate-500">«{c.fonte.citazione}»</p>}
                {apriDi(c.fonte) && !senzaFonte && (
                  <button type="button" className="mt-0.5 inline-flex min-h-11 items-center gap-1 text-xs lg:min-h-0 lg:text-[11px] font-medium text-orange-700 underline-offset-2 hover:underline"
                    onClick={() => apriDi(c.fonte)?.()}>
                    <FileSearch className="h-3 w-3" aria-hidden />
                    {paginaCitata(c.fonte.dove) ? `Vedi a pagina ${paginaCitata(c.fonte.dove)}` : "Vedi nel documento"}
                  </button>
                )}
              </div>
              <Button type="button" size="sm" variant="outline" className="h-11 lg:h-8"
                onClick={() => onModifica({ tipo: "scegli_fonte", area: v.area, chiave: v.chiave, fonte: c.fonte.tipo, idFonte: c.fonte.id ?? null, etichettaFonte: c.fonte.etichetta })}>
                Tieni questo
              </Button>
            </div>
          ))}
        </div>
      )}

      {fattoDaSolo(riga, autonomia) && !aperta && (
        <p className="mt-2 text-xs lg:text-[11px] text-emerald-800">
          Silvio lo fa da solo: l'hai scelto in Impostazioni → Silvio e le commesse. Se non va, toglilo con la matita.
        </p>
      )}

      {daConfermare(riga, autonomia) && !aperta && !nascosto && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-xs lg:text-[11px] text-amber-900">{testoConferma(riga, autonomia, { fineDalleFasi, vedeCosti })}</p>
          <Button type="button" size="sm" className="h-11 bg-amber-700 text-white hover:bg-amber-800 lg:h-8"
            onClick={() => onModifica({ tipo: "cambia_valore", area: v.area, chiave: v.chiave, valore: valore!.valore })}>
            Va bene
          </Button>
        </div>
      )}

      {aperta && (() => {
        const chiudi = () => onApri(null);
        const attuale = stato === "manca" ? null : valore?.valore ?? null;
        switch (modo) {
          case "campi": return <ModificaCampi v={v} attuale={attuale} onSalva={cambia} onAnnulla={chiudi} />;
          case "fasi": return <ModificaFasi fasi={(attuale as FaseDelPiano[] | null) ?? []} onSalva={(f) => cambia(f.length ? f : null)} onAnnulla={chiudi} />;
          case "rate": return <ModificaRate rate={(attuale as RataDelPiano[] | null) ?? []} onSalva={(r) => cambia(r.length ? r : null)} onAnnulla={chiudi} />;
          case "cliente":
            return (
              <SceltaCliente companyId={companyId} piano={piano} onScegli={(id, nome, cliente) => {
                onModifica(modificheSceltaCliente(piano, id, nome, cliente?.email));
                chiudi();
              }} />
            );
          case "responsabile":
            return <div className="mt-2 max-lg:[&_[role=combobox]]:h-11"><AssignedToSelect value={typeof attuale === "string" ? attuale : ""} onChange={(x) => cambia(x || null)} /></div>;
          case "sede":
            return <div className="mt-2 max-lg:[&_[role=combobox]]:h-11"><SedeSelect value={typeof attuale === "string" ? attuale : null} onChange={(x) => cambia(x)} /></div>;
          case "elenco":
            return (
              <div className="mt-2 space-y-2">
                {Array.isArray(attuale) && (
                  <ul className="space-y-1">
                    {attuale.map((x, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs lg:text-[11px]">
                        <span className="min-w-0 flex-1 truncate">{(() => {
                          const e = (x ?? {}) as { name?: string; label?: string; nome?: string; fornitore?: string; titolo?: string; fase?: string | null };
                          const nome = e.name ?? e.label ?? e.nome ?? e.fornitore ?? e.titolo;
                          return nome ? `${nome}${e.fase && nome !== e.fase ? ` · ${e.fase}` : ""}` : e.fase ?? `Elemento ${i + 1}`;
                        })()}</span>
                        <Button type="button" size="sm" variant="ghost" className="h-11 lg:h-7" onClick={() => onModifica({ tipo: "togli", area: v.area, chiave: v.chiave, indice: i })}>Togli</Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  {attuale != null && <Button type="button" size="sm" variant="outline" className="h-11 lg:h-9" onClick={() => cambia(null)}>Togli tutto</Button>}
                  <Button type="button" size="sm" variant="ghost" className="h-11 lg:h-9" onClick={chiudi}>Chiudi</Button>
                </div>
              </div>
            );
          default: return null;
        }
      })()}
    </li>
  );
}

// ── Da controllare ──────────────────────────────────────────────────────────

/** Importo, IVA, rate, inizio e fine in una riga, col segno di quanto fidarsi: un tocco porta al dato. */
export function RiepilogoNumeri({ numeri, onTocca }: { numeri: readonly NumeroDaControllare[]; onTocca: (n: NumeroDaControllare) => void }) {
  if (!numeri.length) return null;
  return (
    <section aria-label="Da controllare" className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <h3 className="text-xs font-semibold text-slate-900 lg:text-[11px]">Da controllare</h3>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {numeri.map((n) => (
          <li key={n.chiave}>
            <button type="button" aria-label={`${n.testo}: ${n.come}`} onClick={() => onTocca(n)}
              className={cn("inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-sm font-medium lg:min-h-7 lg:text-xs", COLORI_STATO[n.stato], n.stato === "manca" && "border-dashed")}>
              <span aria-hidden>{SEGNI[n.stato]}</span>{n.testo}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-500 lg:text-[11px]">✓ letto dal documento con la prova · ✋ proposto: guardalo</p>
    </section>
  );
}

// ── Da decidere ─────────────────────────────────────────────────────────────

/**
 * In cima alla colonna: in evidenza solo quello che ferma «Crea» o cambia i soldi (cliente, importo,
 * conflitti, conti che non tornano, proposte su importo, IVA e rate). Il resto sta sotto, chiuso:
 * una ditta non libera non è come un cliente che manca. Un `<details>`: niente pannelli nuovi.
 */
function DaDecidereInCima({ d, piano, onModifica, onApri, onVai, contesto, vedeImporti, vedeCosti }: {
  d: DaDecidere; piano: PianoCommessa; onModifica: (m: Modifica | Modifica[]) => void;
  onApri: (chiave: string) => void; onVai: (chiave: string) => void; contesto: ContestoRisorse | null; vedeImporti: boolean; vedeCosti: boolean;
}) {
  if (!d.totale && !d.avvisi.length) return null;
  const div = divisioneDaDecidere(d);
  const tutte = accettaProposte(piano, div.altreProposte.map((p) => p.chiave));
  return (
    <section aria-labelledby="silvio-da-decidere" data-chiave="silvio-da-decidere"
      className={cn("rounded-xl border p-2.5 shadow-sm", div.subito ? "border-amber-300 bg-amber-50/70" : "border-slate-200 bg-white")}>
      <h3 id="silvio-da-decidere" className="flex items-center gap-2 text-sm lg:text-[13px] font-semibold text-slate-900">
        {div.subito > 0 && <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />}{div.subito ? "Da decidere" : d.totale ? "Niente di urgente" : "Da sapere"}
        {div.subito > 0 && <span className="rounded-full bg-amber-200 px-2 text-xs lg:text-[11px] font-semibold text-amber-900">{div.subito}</span>}
      </h3>
      {div.subito > 0 && (
        <ul className="mt-2 space-y-1.5">
          {d.conflitti.map((c) => {
            const v = REGISTRO_ETICHETTA(c.chiave);
            const nascosto = importoNascosto(c.chiave, vedeImporti, vedeCosti);
            return (
              <li key={`c-${c.chiave}`} className="rounded-lg bg-white px-2.5 py-2 text-sm lg:text-[13px]">
                <p className="text-slate-800"><strong>{v}</strong>: i documenti non sono d'accordo. Quale tengo?</p>
                {c.nota && !nascosto && !parlaDiCosti(c.chiave, vedeCosti) && <p className="mt-1 text-xs lg:text-[11px] font-medium text-amber-800">{c.nota}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.candidati.map((x, i) => (
                    <Button key={i} type="button" size="sm" variant="outline" className="h-auto min-h-11 whitespace-normal text-left lg:min-h-8"
                      onClick={() => onModifica({ tipo: "scegli_fonte", area: c.area, chiave: c.chiave, fonte: x.fonte.tipo, idFonte: x.fonte.id ?? null })}>
                      {nascosto
                        ? <span>{x.fonte.etichetta}</span>
                        : <span><strong>{testoValore(c.chiave, x.valore, vedeCosti)}</strong> <span className="font-normal text-slate-500">· {x.fonte.etichetta}</span></span>}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
          {d.nonTornano.map((n) => (
            <li key={`t-${n.chiave}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-sm lg:text-[13px]">
              <p className="min-w-0 flex-1 basis-full text-red-800"><span aria-hidden>⚠ </span>{n.testo} <strong>{n.etichetta}</strong> resta fuori finché non torna.</p>
              <Button type="button" size="sm" variant="outline" className="h-11 lg:h-8" onClick={() => onApri(n.chiave)}>Sistema</Button>
            </li>
          ))}
          {div.avvisiSoldi.map((a) => (
            <li key={`as-${a}`} className="break-words rounded-lg bg-white px-2.5 py-2 text-sm lg:text-[13px] text-red-800"><span aria-hidden>⚠ </span>{a}</li>
          ))}
          {div.domande.map((v) => <RigaDomanda key={`q-${v.chiave}`} v={v} onApri={onApri} />)}
          {div.proposte.map((p) => {
            const v = variabileDi(p.chiave);
            const x = v ? piano.aree[v.area]?.[p.chiave] : undefined;
            const conferma = accettaProposte(piano, [p.chiave]);
            return (
              <li key={`s-${p.chiave}`} className="rounded-lg bg-white px-2.5 py-2 text-sm lg:text-[13px]">
                <p className="text-slate-800"><strong>{p.etichetta}</strong>{x ? <>: {testoValore(p.chiave, x.valore, vedeCosti)}</> : null}</p>
                {x?.nota && <p className="mt-0.5 text-xs lg:text-[11px] text-amber-800">{x.nota}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {conferma.length > 0 && <Button type="button" size="sm" className="h-11 bg-amber-700 text-white hover:bg-amber-800 lg:h-8" onClick={() => onModifica(conferma)}>Va bene</Button>}
                  <Button type="button" size="sm" variant="ghost" className="h-11 gap-1 lg:h-8" onClick={() => onVai(p.chiave)}>Vedi<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {div.altre > 0 && (
        <details data-silvio-altre className="group mt-1.5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:min-h-8 lg:text-[13px] [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />{titoloAltre(div.altre)}
          </summary>
          <ul className="mt-1 space-y-1.5">
            {d.nonDisponibili.map((n) => (
              <li key={`n-${n.chiave}-${n.indice}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-sm lg:text-[13px]">
                <p className="min-w-0 flex-1 basis-full text-slate-800">
                  <strong>{n.nome}</strong>{n.avviso.startsWith(n.nome) ? n.avviso.slice(n.nome.length) : `: ${n.avviso}`}
                </p>
                {alternativePersona(piano, n, contesto).map((a) => (
                  <Button key={a.id} type="button" size="sm" variant="outline" className="h-11 lg:h-8"
                    onClick={() => onModifica(sostituisciPersona(piano, n, a))}>Metti {a.nome}</Button>
                ))}
                <Button type="button" size="sm" variant="outline" className="h-11 lg:h-8"
                  onClick={() => onModifica({ tipo: "togli", area: n.area, chiave: n.chiave, indice: n.indice })}>Toglilo</Button>
                <Button type="button" size="sm" variant="ghost" className="h-11 gap-1 lg:h-8" onClick={() => onVai(n.chiave)}>Vedi<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button>
              </li>
            ))}
            {div.altreDomande.map((v) => <RigaDomanda key={`q-${v.chiave}`} v={v} onApri={onApri} />)}
            {div.altreProposte.length > 0 && (
              <li className="rounded-lg bg-slate-50 px-2.5 py-2 text-sm lg:text-[13px]">
                <p className="text-slate-800">
                  {div.altreProposte.length === 1 ? "Una mia proposta aspetta un sì" : `${div.altreProposte.length} mie proposte aspettano un sì`}:
                  {" "}<span className="text-slate-600">{div.altreProposte.map((p) => minuscola(p.etichetta)).join(", ")}</span>.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tutte.length > 0 && (
                    <Button type="button" size="sm" variant="outline" className="h-11 lg:h-8" onClick={() => onModifica(tutte)}>
                      {div.altreProposte.length === 1 ? "Va bene" : `Va bene a tutte e ${div.altreProposte.length}`}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" className="h-11 gap-1 lg:h-8" onClick={() => onVai(div.altreProposte[0].chiave)}>
                    Guardale prima<ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            )}
            {div.altriAvvisi.map((a) => (
              <li key={`a-${a}`} className="break-words rounded-lg bg-slate-50 px-2.5 py-2 text-xs lg:text-[11px] text-slate-700">{a}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RigaDomanda({ v, onApri }: { v: Variabile; onApri: (chiave: string) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-sm lg:text-[13px]">
      <p className="min-w-0 flex-1 text-slate-800">Manca <strong>{v.chiave === "cliente.customer_id" ? "il cliente" : minuscola(v.etichetta)}</strong>.</p>
      <Button type="button" size="sm" variant="outline" className="h-11 lg:h-8" onClick={() => onApri(v.chiave)}>Aggiungi</Button>
    </li>
  );
}

const REGISTRO_ETICHETTA = (chiave: string) => variabileDi(chiave)?.etichetta ?? "Un valore";

// ── La colonna ──────────────────────────────────────────────────────────────

export interface ColonnaCommessaProps {
  companyId: string;
  piano: PianoCommessa;
  completezza: Completezza;
  evidenziate: string[];
  aperta: string | null;
  onApri: (chiave: string | null) => void;
  onModifica: (m: Modifica | Modifica[]) => void;
  /** Cambiate dalla chat e non ancora guardate. */
  daGuardare?: string[];
  onVisto?: (chiave: string) => void;
  /** Come si apre il documento di una fonte; null se non si può. */
  apriFonte?: (f: Fonte) => (() => void) | null;
  autonomia?: Autonomia | null;
  /** Le cose da decidere, in cima; null in «Completa» con niente da decidere. */
  daDecidere?: DaDecidere | null;
  /** Porta alla riga senza aprirla. */
  onVai?: (chiave: string) => void;
  /** Niente ancora caricato: al posto di 14 aree di ❓, una frase. */
  vuota?: boolean;
  /** I dati dell'azienda (dipendenti, impegni): per proporre chi prende il posto di chi non è libero. */
  contesto?: ContestoRisorse | null;
  /** Il permesso «Importi di vendita»: senza, gli importi non si vedono e non si cambiano. */
  vedeImporti?: boolean;
  /** Il permesso sui costi: senza, costi previsti e cifre delle ditte non si vedono. */
  vedeCosti?: boolean;
  /** La fine che la commessa prende dalle fasi, se la proposta non si conferma. */
  fineDalleFasi?: string | null;
  clienteDaScegliere?: boolean;
  /** Importo, IVA, rate, inizio e fine: il riepilogo in testa. */
  numeri?: readonly NumeroDaControllare[];
}

export function ColonnaCommessa({
  companyId, piano, completezza, evidenziate, aperta, onApri, onModifica, daGuardare = [], onVisto, apriFonte, autonomia = null,
  daDecidere = null, onVai, vuota = false, contesto = null, vedeImporti = true, vedeCosti = true, fineDalleFasi = null, clienteDaScegliere = false, numeri = [],
}: ColonnaCommessaProps) {
  const aree = useMemo(() => AREE.map((area) => {
    // Un importo che chi guarda non vede non si può nemmeno chiedere.
    const righe = righeDellArea(piano, area, completezza).filter((r) => r.stato !== "manca" || !importoNascosto(r.variabile.chiave, vedeImporti, vedeCosti));
    // In «Completa» un'area che la commessa ha già tutta si raccoglie in una riga: si guarda quello che manca.
    const chiusa = righe.length > 0 && righe.every((r) => giaNellaCommessa(piano, r.valore)) && !righe.some((r) => daGuardare.includes(r.variabile.chiave));
    return { area, righe, stato: statoArea(righe), chiusa };
  }), [piano, completezza, daGuardare, vedeImporti, vedeCosti]);
  const accese = new Set(evidenziate);
  const segnate = new Set(daGuardare);
  const vuote = aree.filter((a) => !a.righe.length);
  const [mostrate, setMostrate] = useState<Set<Area>>(() => new Set());

  if (vuota) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm lg:text-[13px] text-slate-600">
        <p className="font-medium text-slate-900">Qui si compone la commessa.</p>
        <p className="mt-1">Cliente, importo, fasi con le date, pagamenti, persone e ditte: si riempiono mentre Silvio legge. Tu controlli, correggi e crei.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <RiepilogoNumeri numeri={numeri} onTocca={(n) => (n.stato === "manca" ? onApri(n.chiave) : (onVai ?? onApri)(n.chiave))} />
      {daDecidere && (
        <DaDecidereInCima d={daDecidere} piano={piano} onModifica={onModifica} contesto={contesto} vedeImporti={vedeImporti} vedeCosti={vedeCosti} onApri={(c) => onApri(c)} onVai={(c) => (onVai ?? onApri)(c)} />
      )}
      {aree.filter((a) => a.righe.length).map(({ area, righe, stato, chiusa }) => chiusa && !mostrate.has(area) ? (
        <section key={area} aria-label={NOMI_AREE[area as Area]} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-sm lg:text-[13px] shadow-sm">
          <Segno stato="fatto" />
          <span className="font-semibold text-slate-900">{NOMI_AREE[area as Area]}</span>
          <span className="min-w-0 flex-1 truncate text-xs lg:text-[11px] text-slate-500">già nella commessa</span>
          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <button type="button" className="min-h-11 shrink-0 rounded px-1.5 py-1 text-xs lg:min-h-0 lg:text-[11px] font-medium text-slate-600 hover:bg-slate-100"
            aria-label={`Mostra ${NOMI_AREE[area as Area].toLowerCase()}`}
            onClick={() => setMostrate(new Set([...mostrate, area]))}>Mostra</button>
        </section>
      ) : (
        <section key={area} aria-label={NOMI_AREE[area as Area]}
          className={cn("rounded-xl border bg-white px-1.5 py-1 shadow-sm transition-colors duration-700 motion-reduce:transition-none",
            righe.some((r) => accese.has(r.variabile.chiave)) && "border-amber-300")}>
          <h3 id={`area-${area}`} className="flex items-center gap-2 px-2 pt-1 text-sm lg:text-[13px] font-semibold text-slate-900">
            {stato && <Segno stato={stato} />}
            {NOMI_AREE[area as Area]}
            <span className="ml-auto text-xs lg:text-[11px] font-normal text-slate-500">{righe.filter((r) => r.stato !== "manca").length}/{righe.length}</span>
          </h3>
          {/* Un'area ancora tutta da riempire sta su due righe: i nomi da toccare, non una pila di «manca». */}
          {righe.every((r) => r.stato === "manca") && !righe.some((r) => r.variabile.chiave === aperta) ? (
            <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1.5 pt-1 text-xs lg:text-[11px] text-slate-500">
              <span className="italic">manca</span>
              {righe.map((r) => (
                <button key={r.variabile.chiave} type="button" data-chiave={r.variabile.chiave} aria-label={`Modifica «${r.variabile.etichetta}»`}
                  onClick={() => onApri(r.variabile.chiave)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 text-slate-700 hover:border-orange-300 hover:bg-orange-50 lg:min-h-7">
                  <Plus className="h-3 w-3" aria-hidden />{r.variabile.etichetta}
                </button>
              ))}
            </div>
          ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {righe.map((r) => (
              <RigaVariabile key={r.variabile.chiave} riga={r} companyId={companyId} piano={piano}
                evidenziata={accese.has(r.variabile.chiave)} aperta={aperta === r.variabile.chiave}
                onApri={onApri} onModifica={onModifica}
                daGuardare={segnate.has(r.variabile.chiave)} onVisto={onVisto} apriFonte={apriFonte} autonomia={autonomia} vedeImporti={vedeImporti} vedeCosti={vedeCosti} fineDalleFasi={fineDalleFasi} clienteDaScegliere={clienteDaScegliere} />
            ))}
          </ul>
          )}
        </section>
      ))}
      {vuote.length > 0 && (
        <p className="px-2 text-xs lg:text-[11px] text-slate-500">
          Ancora niente su: {vuote.map((a) => minuscola(NOMI_AREE[a.area])).join(", ")}.
          {" "}Arrivano con le fonti, o dalle commesse passate quando ce ne sono di simili.
        </p>
      )}
    </div>
  );
}
