import { UniformSelect } from "@/components/ui/uniform-select";
// src/components/orders/generali/moduli/DatiScheda.tsx
// Scheda «Dati» della commessa generale (piano 2026-11-14-macro-commessa-per-tipologia, T1).
// Un posto solo per i dati dell'operazione: cliente, indirizzo, inizio e fine lavori, chi la segue,
// e le sezioni proprie della tipologia (figure dell'appalto; area, titolo edilizio e tecnici dello
// sviluppo; immobile acquistato, ristrutturazione e rivendita della compravendita). Ogni sezione si
// salva da sé: un dato si cambia qui e solo qui.
import { useState } from "react";
import { AlertTriangle, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { IntestazioneScheda } from "@/components/orders/generali/design/ElementiScheda";
import type { ModuloScheda, PropsScheda } from "@/components/orders/generali/tipiScheda";
import { messaggioGenerale, useSalvaDatiGenerale } from "@/hooks/useCommesseGenerali";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI } from "@/lib/orders/commesseGenerali";
import {
  SEZIONI_PER_MODELLO,
  datiMancanti,
  type CampoDati,
  type SezioneDati,
} from "@/lib/orders/generali/datiOperazione";

type Valori = Record<string, string>;

const testoDi = (v: unknown, tipo: CampoDati["tipo"]): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return tipo === "importo" ? v.toLocaleString("it-IT", { maximumFractionDigits: 2 }) : String(v).replace(".", ",");
  return String(v);
};

/** Il valore da mandare al database: testo, data, numero; vuoto = null. Un numero illeggibile è un errore. */
function valoreDi(testo: string, tipo: CampoDati["tipo"]): { ok: true; valore: string | number | null } | { ok: false } {
  const t = testo.trim();
  if (!t) return { ok: true, valore: null };
  if (tipo === "importo") {
    const n = leggiImporto(t);
    return n === null || n < 0 ? { ok: false } : { ok: true, valore: n };
  }
  if (tipo === "numero") {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? { ok: true, valore: n } : { ok: false };
  }
  return { ok: true, valore: t };
}

function Riquadro({ titolo, descrizione, children, salva, inSalvataggio, cambiato, puoModificare }: {
  titolo: string;
  descrizione: string;
  children: React.ReactNode;
  salva: () => void;
  inSalvataggio: boolean;
  cambiato: boolean;
  puoModificare: boolean;
}) {
  return (
    <section aria-label={titolo} className="generale-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{titolo}</h3>
          <p className="text-xs text-muted-foreground">{descrizione}</p>
        </div>
        {puoModificare && (
          <Button size="sm" onClick={salva} disabled={!cambiato || inSalvataggio}>
            {inSalvataggio && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Salva
          </Button>
        )}
      </header>
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Campo({ id, campo, valore, onCambia, disabilitato }: { id: string; campo: CampoDati; valore: string; onCambia: (v: string) => void; disabilitato: boolean }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {campo.etichetta}
        {campo.unita && <span className="font-normal text-muted-foreground"> ({campo.unita})</span>}
        {campo.tipo === "importo" && <span className="font-normal text-muted-foreground"> (€, al netto dell'IVA)</span>}
      </Label>
      {campo.tipo === "scelta" ? (
        <UniformSelect
          id={id}
          value={valore}
          disabled={disabilitato}
          onChange={(e) => onCambia(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="">—</option>
          {campo.opzioni?.map((o) => <option key={o} value={o}>{o}</option>)}
        </UniformSelect>
      ) : (
        <Input
          id={id}
          type={campo.tipo === "data" ? "date" : "text"}
          inputMode={campo.tipo === "importo" || campo.tipo === "numero" ? "decimal" : undefined}
          value={valore}
          placeholder={campo.esempio}
          disabled={disabilitato}
          onChange={(e) => onCambia(e.target.value)}
          className="h-9"
        />
      )}
    </div>
  );
}

function SezioneTipologia({ generaleId, sezione, iniziali, puoModificare }: { generaleId: string; sezione: SezioneDati; iniziali: Record<string, unknown>; puoModificare: boolean }) {
  const partenza = (): Valori => Object.fromEntries(sezione.campi.map((c) => [c.chiave, testoDi(iniziali[c.chiave], c.tipo)]));
  const [valori, setValori] = useState<Valori>(partenza);
  const salva = useSalvaDatiGenerale(generaleId);
  const cambiato = sezione.campi.some((c) => (valori[c.chiave] ?? "") !== testoDi(iniziali[c.chiave], c.tipo));

  const conferma = () => {
    const fuori: Record<string, string | number | null> = {};
    for (const c of sezione.campi) {
      const v = valoreDi(valori[c.chiave] ?? "", c.tipo);
      if (!v.ok) {
        toast.error(`${c.etichetta}: scrivi un numero, ad esempio 250 o 1.250,50.`);
        return;
      }
      fuori[c.chiave] = v.valore;
    }
    salva.mutate({ [sezione.id]: fuori }, {
      onSuccess: () => toast.success(`${sezione.titolo}: salvato`),
      onError: (e) => toast.error(messaggioGenerale(e, sezione.titolo.toLowerCase())),
    });
  };

  return (
    <Riquadro titolo={sezione.titolo} descrizione={sezione.descrizione} salva={conferma} inSalvataggio={salva.isPending} cambiato={cambiato} puoModificare={puoModificare}>
      {sezione.campi.map((c) => (
        <Campo
          key={c.chiave}
          id={`dati-${sezione.id}-${c.chiave}`}
          campo={c}
          valore={valori[c.chiave] ?? ""}
          onCambia={(v) => setValori((x) => ({ ...x, [c.chiave]: v }))}
          disabilitato={!puoModificare || salva.isPending}
        />
      ))}
    </Riquadro>
  );
}

function SezioneComune({ riepilogo, puoModificare }: PropsScheda) {
  const g = riepilogo.generale;
  const def = DEFINIZIONI_MODELLI[g.modello];
  const iniziali = {
    cliente: g.clienteId ?? null,
    indirizzo: g.indirizzo ?? "",
    inizio: g.inizio?.slice(0, 10) ?? "",
    fine: g.fine?.slice(0, 10) ?? "",
    responsabile: g.dati?.responsabile ?? "",
    note: g.dati?.note ?? "",
  };
  const [v, setV] = useState(iniziali);
  const salva = useSalvaDatiGenerale(g.id);
  const cambiati = (Object.keys(iniziali) as (keyof typeof iniziali)[]).filter((k) => (v[k] ?? "") !== (iniziali[k] ?? ""));
  const dateSbagliate = !!v.inizio && !!v.fine && v.fine < v.inizio;

  const conferma = () => {
    if (dateSbagliate) {
      toast.error("La fine dei lavori viene prima dell'inizio.");
      return;
    }
    const fuori: Record<string, unknown> = {};
    for (const k of cambiati) {
      const x = typeof v[k] === "string" ? (v[k] as string).trim() : v[k];
      fuori[k === "cliente" ? "cliente_id" : k] = x === "" ? null : x;
    }
    salva.mutate(fuori, {
      onSuccess: () => toast.success("Dati salvati"),
      onError: (e) => toast.error(messaggioGenerale(e, "i dati")),
    });
  };
  const disab = !puoModificare || salva.isPending;
  const luogo = g.modello === "compravendita" ? "Indirizzo dell'immobile" : g.modello === "sviluppo" ? "Indirizzo dell'area" : "Indirizzo del cantiere";

  return (
    <Riquadro titolo="La commessa" descrizione="Per chi è, dove, quando e chi la segue." salva={conferma} inSalvataggio={salva.isPending} cambiato={cambiati.length > 0} puoModificare={puoModificare}>
      <div className="space-y-1">
        <Label htmlFor="dati-cliente" className="text-xs">{def.cliente.etichetta}</Label>
        {puoModificare
          ? <ScegliCliente id="dati-cliente" valore={v.cliente} onCambia={(c) => setV((x) => ({ ...x, cliente: c }))} />
          : <p className="text-sm">{g.cliente ?? "—"}</p>}
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="dati-indirizzo" className="text-xs">{luogo}</Label>
        <CampoIndirizzo id="dati-indirizzo" className="h-9" value={v.indirizzo} disabled={disab} placeholder="Via, numero, comune" onChange={(t) => setV((x) => ({ ...x, indirizzo: t }))} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dati-inizio" className="text-xs">Inizio lavori</Label>
        <Input id="dati-inizio" type="date" className="h-9" value={v.inizio} disabled={disab} onChange={(e) => setV((x) => ({ ...x, inizio: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="dati-fine" className="text-xs">Fine lavori prevista</Label>
        <Input id="dati-fine" type="date" className="h-9" value={v.fine} disabled={disab} aria-invalid={dateSbagliate || undefined} onChange={(e) => setV((x) => ({ ...x, fine: e.target.value }))} />
        {dateSbagliate && <p className="text-xs text-destructive">Viene prima dell'inizio.</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="dati-responsabile" className="text-xs">Chi la segue</Label>
        <Input id="dati-responsabile" className="h-9" value={v.responsabile} disabled={disab} placeholder="es. Mario Rossi" onChange={(e) => setV((x) => ({ ...x, responsabile: e.target.value }))} />
      </div>
      <div className="space-y-1 sm:col-span-2 lg:col-span-3">
        <Label htmlFor="dati-note" className="text-xs">Note</Label>
        <Textarea id="dati-note" rows={2} value={v.note} disabled={disab} onChange={(e) => setV((x) => ({ ...x, note: e.target.value }))} />
      </div>
    </Riquadro>
  );
}

export function SchedaDati(props: PropsScheda) {
  const g = props.riepilogo.generale;
  const mancanti = datiMancanti({
    modello: g.modello,
    clienteId: g.clienteId,
    indirizzo: g.indirizzo ?? null,
    inizio: g.inizio ?? null,
    fine: g.fine ?? null,
    dati: g.dati ?? {},
  });
  return (
    <section aria-label="Dati della commessa generale" className="generale-sheet space-y-4">
      <IntestazioneScheda
        icona={ClipboardList}
        titolo={g.modello === "appalto" ? "Dati dell'appalto" : "Dati dell'operazione"}
        descrizione="Ogni dato si scrive qui, una volta: liste, calendario, documenti e piano lo leggono da qui."
      />
      {mancanti.length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Mancano {mancanti.map((m) => m.testo).join(", ")}.</span>
        </p>
      )}
      {/* La chiave rimonta le sezioni quando arrivano dati nuovi dal database. */}
      <SezioneComune key={`comune-${g.clienteId}-${g.indirizzo}-${g.inizio}-${g.fine}-${g.dati?.responsabile}-${g.dati?.note}`} {...props} />
      {SEZIONI_PER_MODELLO[g.modello].map((s) => (
        <SezioneTipologia
          key={`${s.id}-${JSON.stringify(g.dati?.[s.id] ?? {})}`}
          generaleId={g.id}
          sezione={s}
          iniziali={(g.dati?.[s.id] ?? {}) as Record<string, unknown>}
          puoModificare={props.puoModificare}
        />
      ))}
    </section>
  );
}

export const modulo: ModuloScheda = {
  pronto: true,
  titolo: "Dati",
  // Da telefono si leggono: indirizzo e figure servono anche in cantiere.
  telefono: true,
  Scheda: SchedaDati,
};
