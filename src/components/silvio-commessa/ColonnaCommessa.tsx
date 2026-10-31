/**
 * «La commessa» nel popup di Silvio: le 14 aree nell'ordine del registro, con lo stato
 * (✓ ✋ ❓ ⚠), la ⓘ della fonte di ogni valore, la modifica a mano (sempre da `applica`), i
 * conflitti da scegliere con un tocco e il cliente da collegare.
 * Vedi docs/piano-silvio-commessa-ai.md, 3.2 e 3.4.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Info, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { AssignedToSelect } from "@/components/orders/AssignedToSelect";
import { SedeSelect } from "@/components/sedi/SedeSelect";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { cn } from "@/lib/utils";
import {
  AREE, type Area, type FaseDelPiano, type Modifica, type PianoCommessa, type RataDelPiano, type Stato, type Valore,
} from "../../../shared/silvio-commessa/piano.ts";
import type { Completezza } from "../../../shared/silvio-commessa/completezza.ts";
import type { Variabile } from "../../../shared/silvio-commessa/registro.ts";
import {
  comeSiModifica, daConfermare, NOMI_AREE, NOMI_STATI, nomeColonna, righeDellArea, SEGNI, statoArea, testoValore, tipoCampo,
  dataBreve, euro, SCELTE, type RigaArea,
} from "./presentazione";

const COLORI_STATO: Record<Stato, string> = {
  fatto: "text-emerald-700 bg-emerald-50 border-emerald-200",
  proposta: "text-amber-800 bg-amber-50 border-amber-200",
  manca: "text-slate-600 bg-slate-50 border-slate-200",
  attenzione: "text-red-700 bg-red-50 border-red-200",
};

function Segno({ stato }: { stato: Stato }) {
  return (
    <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs", COLORI_STATO[stato])}
      title={NOMI_STATI[stato]}>
      <span aria-hidden>{SEGNI[stato]}</span>
      <span className="sr-only">{NOMI_STATI[stato]}</span>
    </span>
  );
}

function DaDove({ v }: { v: Valore }) {
  const f = v.fonte;
  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
      <p><span className="font-medium">Da:</span> {f.etichetta}{f.dove ? `, ${f.dove}` : ""}</p>
      {f.citazione && <blockquote className="mt-1 border-l-2 border-orange-300 pl-2 italic">«{f.citazione}»</blockquote>}
      {f.tipo !== "persona" && <p className="mt-1 text-slate-500">Sicurezza di Silvio: {Math.round(v.fiducia * 100)} %</p>}
      {v.nota && <p className="mt-1 text-slate-500">{v.nota}</p>}
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
              <label htmlFor={id} className="text-xs font-medium text-slate-600">{etichetta}</label>
              <select id={id} autoFocus={i === 0} value={String(valori[c])} onChange={(e) => setValori({ ...valori, [c]: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
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
              <label htmlFor={id} className="text-sm">{etichetta}</label>
            </div>
          );
        }
        return (
          <div key={c} className="space-y-1">
            <label htmlFor={id} className="text-xs font-medium text-slate-600">{etichetta}</label>
            {tipo === "testo_lungo"
              ? <Textarea id={id} autoFocus={i === 0} rows={3} value={String(valori[c])} onChange={(e) => setValori({ ...valori, [c]: e.target.value })} />
              : <Input id={id} autoFocus={i === 0} type={tipo === "data" ? "date" : "text"} inputMode={tipo === "numero" ? "decimal" : undefined}
                value={String(valori[c])} onChange={(e) => setValori({ ...valori, [c]: e.target.value })} className="h-9" />}
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button type="submit" size="sm">Salva</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onAnnulla}>Lascia com'era</Button>
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
          <li key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border bg-white p-2 sm:grid-cols-[1fr_8.5rem_8.5rem_auto]">
            <Input aria-label={`Nome della fase ${i + 1}`} value={r.name} onChange={(e) => cambia(i, { name: e.target.value })} className="h-9" />
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 sm:order-last" aria-label={`Togli la fase ${i + 1}`}
              onClick={() => setRighe(righe.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            <Input aria-label={`Inizio della fase ${i + 1}`} type="date" value={r.start_date ?? ""} className="h-9"
              onChange={(e) => cambia(i, { start_date: e.target.value || null })} />
            <Input aria-label={`Fine della fase ${i + 1}`} type="date" value={r.end_date ?? ""} className="h-9"
              onChange={(e) => cambia(i, { end_date: e.target.value || null })} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setRighe([...righe, { name: "" }])}>
          <Plus className="h-4 w-4" aria-hidden />Aggiungi una fase
        </Button>
        <Button type="submit" size="sm">Salva</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onAnnulla}>Lascia com'era</Button>
      </div>
    </form>
  );
}

function ModificaRate({ rate, onSalva, onAnnulla }: { rate: RataDelPiano[]; onSalva: (r: RataDelPiano[]) => void; onAnnulla: () => void }) {
  const [righe, setRighe] = useState(() => rate.map((r) => ({ ...r, testo: r.amount.toLocaleString("it-IT", { useGrouping: false }) })));
  const cambia = (i: number, p: Partial<(typeof righe)[number]>) => setRighe(righe.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const salva = () => onSalva(righe
    .map(({ testo, ...r }) => ({ ...r, amount: parseDecimalIT(testo) }))
    .filter((r) => r.label.trim() && r.amount > 0));
  return (
    <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); salva(); }}>
      <ol className="space-y-2">
        {righe.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2">
            <Input aria-label={`Nome della rata ${i + 1}`} value={r.label} onChange={(e) => cambia(i, { label: e.target.value })} className="h-9" />
            <Input aria-label={`Importo della rata ${i + 1}`} inputMode="decimal" value={r.testo} onChange={(e) => cambia(i, { testo: e.target.value })} className="h-9" />
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9" aria-label={`Togli la rata ${i + 1}`}
              onClick={() => setRighe(righe.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1"
          onClick={() => setRighe([...righe, { label: `Rata ${righe.length + 1}`, type: "deposit", amount: 0, testo: "" }])}>
          <Plus className="h-4 w-4" aria-hidden />Aggiungi una rata
        </Button>
        <Button type="submit" size="sm">Salva</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onAnnulla}>Lascia com'era</Button>
      </div>
    </form>
  );
}

/** Il cliente del gestionale: scelto dall'elenco o creato, coi dati che Silvio ha letto. */
export function SceltaCliente({ companyId, piano, onScegli }: {
  companyId: string; piano: PianoCommessa; onScegli: (id: string, nome: string) => void;
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
      <label htmlFor={id} className="text-xs font-medium text-slate-600">Cliente del gestionale</label>
      <div className="flex gap-2">
        <Select value={typeof scelto === "string" ? scelto : ""} onValueChange={(v) => {
          const c = clienti.find((x) => x.id === v);
          onScegli(v, c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "");
        }}>
          <SelectTrigger id={id} className="h-9 flex-1"><SelectValue placeholder="Scegli un cliente" /></SelectTrigger>
          <SelectContent>
            {clienti.map((c) => (
              <SelectItem key={c.id} value={c.id}>{`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}{c.email ? ` (${c.email})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={() => setNuovo(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />Nuovo
        </Button>
      </div>
      {nuovo && (
        <CreateCustomerDialog open onOpenChange={setNuovo} defaultCreatePortalAccount={false}
          initialValues={{
            fullName: nome?.client_name || nome?.client_company || undefined,
            isBusiness: !nome?.client_name && !!nome?.client_company,
            email: contatto?.client_email, phone: contatto?.client_phone,
            address: typeof indirizzo === "string" ? indirizzo : undefined,
          }}
          onCustomerCreated={(cid, cnome) => { onScegli(cid, cnome); setNuovo(false); }} />
      )}
    </div>
  );
}

function NomeCliente({ companyId, id }: { companyId: string; id: string }) {
  const { data: clienti = [] } = useCompanyCustomers(companyId);
  const c = clienti.find((x) => x.id === id);
  return <>{c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "cliente del gestionale collegato"}</>;
}

// ── Una riga ────────────────────────────────────────────────────────────────

function Dettaglio({ chiave, valore }: { chiave: string; valore: unknown }) {
  if (chiave === "fasi.order_work_phases" && Array.isArray(valore)) {
    return (
      <ol className="mt-1 space-y-0.5 text-xs text-slate-600">
        {(valore as FaseDelPiano[]).map((f, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">{i + 1}. {f.name}{f.sottofasi?.length ? ` · ${f.sottofasi.length} voci` : ""}</span>
            <span className="shrink-0">{f.start_date && f.end_date ? `${dataBreve(f.start_date, false)} → ${dataBreve(f.end_date, false)}` : f.giorni ? `${f.giorni} gg` : ""}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (chiave === "pagamenti.rate" && Array.isArray(valore)) {
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
        {(valore as RataDelPiano[]).map((r, i) => (
          <li key={i} className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="shrink-0">{euro(Number(r.amount) || 0)}</span></li>
        ))}
      </ul>
    );
  }
  if (chiave === "economia.order_items" && Array.isArray(valore)) {
    const righe = valore as { name?: string }[];
    return (
      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
        {righe.slice(0, 6).map((r, i) => <li key={i} className="truncate">• {r.name}</li>)}
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
}

function RigaVariabile({ riga, companyId, piano, evidenziata, aperta, onApri, onModifica }: RigaProps) {
  const { variabile: v, valore, conflitto, stato } = riga;
  const [info, setInfo] = useState(false);
  const rif = useRef<HTMLLIElement>(null);
  const modo = comeSiModifica(v);
  const idInfo = useId();
  useEffect(() => {
    if (aperta) rif.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [aperta]);
  const cambia = (x: unknown) => {
    onModifica(x == null ? { tipo: "togli", area: v.area, chiave: v.chiave } : { tipo: "cambia_valore", area: v.area, chiave: v.chiave, valore: x });
    onApri(null);
  };
  const testo = valore && stato !== "manca"
    ? (v.chiave === "cliente.customer_id" && typeof valore.valore === "string"
      ? <NomeCliente companyId={companyId} id={valore.valore} />
      : testoValore(v.chiave, valore.valore))
    : v.chiave === "cliente.customer_id" && piano.aree.cliente?.["cliente.nome"]
      ? "da collegare: alla creazione lo cerco per nome, oppure sceglilo tu"
      : "manca";

  return (
    <li ref={rif} data-chiave={v.chiave}
      className={cn("rounded-lg px-2 py-2 transition-colors duration-700 motion-reduce:transition-none",
        evidenziata && "bg-amber-100/80", aperta && "bg-orange-50 ring-1 ring-orange-200")}>
      <div className="flex items-start gap-2">
        <Segno stato={stato} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{v.etichetta}</p>
          <p className={cn("break-words text-sm", stato === "manca" ? "italic text-slate-400" : "font-medium text-slate-900")}>{testo}</p>
          {valore && stato !== "manca" && !aperta && <Dettaglio chiave={v.chiave} valore={valore.valore} />}
        </div>
        <div className="flex shrink-0 items-center">
          {valore && stato !== "manca" && (
            <button type="button" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-expanded={info} aria-controls={idInfo} aria-label={`Da dove viene «${v.etichetta}»`} onClick={() => setInfo(!info)}>
              <Info className="h-4 w-4" />
            </button>
          )}
          {modo !== "no" && !conflitto && (
            <button type="button" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={`Modifica «${v.etichetta}»`} aria-expanded={aperta} onClick={() => onApri(aperta ? null : v.chiave)}>
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {info && valore && <div id={idInfo}><DaDove v={valore} /></div>}

      {conflitto && (
        <div className="mt-2 space-y-2" role="group" aria-label={`Scegli quale «${v.etichetta}» tenere`}>
          {conflitto.candidati.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-white p-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{testoValore(v.chiave, c.valore)}</p>
                <p className="text-xs text-slate-500">{c.fonte.etichetta}{c.fonte.dove ? `, ${c.fonte.dove}` : ""}</p>
                {c.fonte.citazione && <p className="text-xs italic text-slate-500">«{c.fonte.citazione}»</p>}
              </div>
              <Button type="button" size="sm" variant="outline" className="h-8"
                onClick={() => onModifica({ tipo: "scegli_fonte", area: v.area, chiave: v.chiave, fonte: c.fonte.tipo, idFonte: c.fonte.id ?? null })}>
                Tieni questo
              </Button>
            </div>
          ))}
        </div>
      )}

      {daConfermare(riga) && !aperta && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-amber-800">{valore?.nota ?? "Proposta di Silvio: entra nella commessa se la confermi."}</p>
          <Button type="button" size="sm" variant="outline" className="h-8"
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
              <SceltaCliente companyId={companyId} piano={piano} onScegli={(id, nome) => {
                const m: Modifica[] = [{ tipo: "cambia_valore", area: "cliente", chiave: "cliente.customer_id", valore: id }];
                if (nome && !piano.aree.cliente?.["cliente.nome"]) m.push({ tipo: "cambia_valore", area: "cliente", chiave: "cliente.nome", valore: { client_name: nome } });
                onModifica(m);
                chiudi();
              }} />
            );
          case "responsabile":
            return <div className="mt-2"><AssignedToSelect value={typeof attuale === "string" ? attuale : ""} onChange={(x) => cambia(x || null)} /></div>;
          case "sede":
            return <div className="mt-2"><SedeSelect value={typeof attuale === "string" ? attuale : null} onChange={(x) => cambia(x)} /></div>;
          case "elenco":
            return (
              <div className="mt-2 space-y-2">
                {Array.isArray(attuale) && (
                  <ul className="space-y-1">
                    {attuale.map((x, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">{(x as { name?: string; label?: string; fase?: string })?.name
                          ?? (x as { label?: string })?.label ?? (x as { fase?: string })?.fase ?? `Elemento ${i + 1}`}</span>
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => onModifica({ tipo: "togli", area: v.area, chiave: v.chiave, indice: i })}>Togli</Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  {attuale != null && <Button type="button" size="sm" variant="outline" onClick={() => cambia(null)}>Togli tutto</Button>}
                  <Button type="button" size="sm" variant="ghost" onClick={chiudi}>Chiudi</Button>
                </div>
              </div>
            );
          default: return null;
        }
      })()}
    </li>
  );
}

// ── La colonna ──────────────────────────────────────────────────────────────

export interface ColonnaCommessaProps {
  companyId: string;
  piano: PianoCommessa;
  completezza: Completezza;
  evidenziate: string[];
  aperta: string | null;
  onApri: (chiave: string | null) => void;
  onModifica: (m: Modifica | Modifica[]) => void;
}

export function ColonnaCommessa({ companyId, piano, completezza, evidenziate, aperta, onApri, onModifica }: ColonnaCommessaProps) {
  const aree = useMemo(() => AREE.map((area) => {
    const righe = righeDellArea(piano, area, completezza);
    return { area, righe, stato: statoArea(righe) };
  }), [piano, completezza]);
  const accese = new Set(evidenziate);
  const vuote = aree.filter((a) => !a.righe.length);

  return (
    <div className="space-y-3">
      {aree.filter((a) => a.righe.length).map(({ area, righe, stato }) => (
        <section key={area} aria-label={NOMI_AREE[area as Area]}
          className={cn("rounded-xl border bg-white p-2 shadow-sm transition-colors duration-700 motion-reduce:transition-none",
            righe.some((r) => accese.has(r.variabile.chiave)) && "border-amber-300")}>
          <h3 id={`area-${area}`} className="flex items-center gap-2 px-2 pt-1 text-sm font-semibold text-slate-900">
            {stato && <Segno stato={stato} />}
            {NOMI_AREE[area as Area]}
            <span className="ml-auto text-xs font-normal text-slate-500">{righe.filter((r) => r.stato !== "manca").length}/{righe.length}</span>
          </h3>
          <ul className="mt-1 divide-y divide-slate-100">
            {righe.map((r) => (
              <RigaVariabile key={r.variabile.chiave} riga={r} companyId={companyId} piano={piano}
                evidenziata={accese.has(r.variabile.chiave)} aperta={aperta === r.variabile.chiave}
                onApri={onApri} onModifica={onModifica} />
            ))}
          </ul>
        </section>
      ))}
      {vuote.length > 0 && (
        <p className="px-2 text-xs text-slate-500">
          Ancora niente su: {vuote.map((a) => NOMI_AREE[a.area].toLowerCase()).join(", ")}.
          {" "}Arrivano con le fonti, o con le prossime fasi di Silvio.
        </p>
      )}
    </div>
  );
}
