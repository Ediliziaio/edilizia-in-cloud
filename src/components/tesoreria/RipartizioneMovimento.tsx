import { useMemo, useRef, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { combinazioneEsatta, fmtEur, leggiImporto } from "@/lib/finance/reconciliationAnalysis";

export interface CandidatoRipartizione {
  key: string;
  tipo: "documento" | "invoice" | "scadenza";
  id: string;
  titolo: string;
  sottotitolo?: string;
  residuo: number;
  etichetta?: string;
  motivi?: string[];
  punteggio?: number;
  affine?: boolean;
}

export interface RigaRipartizione {
  tipo: CandidatoRipartizione["tipo"];
  id: string;
  importo: number;
}

const inTesto = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * Un movimento su uno o più documenti: si spunta, l'importo si propone da solo
 * (il residuo del documento, fino a esaurire il movimento) e si può cambiare per
 * registrare un acconto. Quel che avanza si abbina dopo.
 */
export function RipartizioneMovimento({
  resto,
  candidati,
  inCorso,
  etichettaDocumenti,
  onConferma,
  onSearch,
  caricando = false,
}: {
  /** Quanto del movimento è ancora da abbinare. */
  resto: number;
  candidati: CandidatoRipartizione[];
  inCorso: boolean;
  etichettaDocumenti: string;
  onConferma: (righe: RigaRipartizione[], nota: string) => void;
  onSearch?: (value: string) => void;
  caricando?: boolean;
}) {
  const [importi, setImporti] = useState<Record<string, string>>({});
  const [cerca, setCerca] = useState("");
  const [nota, setNota] = useState("");

  // Keep selected rows when a new server search returns a different page.
  const archivio = useRef(new Map<string, CandidatoRipartizione>());
  candidati.forEach(c => archivio.current.set(c.key, c));
  const perChiave = archivio.current;
  const scelti = Object.keys(importi);

  const righe = scelti.map((key) => ({ candidato: perChiave.get(key)!, valore: leggiImporto(importi[key]) }));
  const somma = Math.round(righe.reduce((t, r) => t + (r.valore ?? 0), 0) * 100) / 100;
  const avanza = Math.round((resto - somma) * 100) / 100;
  const erroreRiga = righe.find((r) => r.valore === null || r.valore <= 0 || r.valore > r.candidato.residuo + 0.004);
  const troppo = avanza < 0;
  const valido = righe.length > 0 && !erroreRiga && !troppo;

  const combinazione = useMemo(
    () => combinazioneEsatta(resto, candidati.map((c) => ({ key: c.key, residuo: c.residuo, affine: c.affine }))),
    [resto, candidati],
  );

  const visibili = useMemo(() => {
    const q = onSearch ? "" : cerca.trim().toLowerCase();
    if (!q) return candidati;
    const importo = leggiImporto(q);
    return candidati.filter((c) =>
      c.titolo.toLowerCase().includes(q) || (c.sottotitolo ?? "").toLowerCase().includes(q)
      || (importo !== null && Math.abs(c.residuo - importo) < 0.005));
  }, [candidati, cerca, onSearch]);
  const elenco = [...scelti.filter(k => !visibili.some(c => c.key === k)).map(k => perChiave.get(k)!).filter(Boolean), ...visibili];

  const attiva = (c: CandidatoRipartizione) => {
    setImporti((prima) => {
      if (c.key in prima) {
        const { [c.key]: _tolto, ...resta } = prima;
        return resta;
      }
      const usato = Object.values(prima).reduce((t, v) => t + (leggiImporto(v) ?? 0), 0);
      const proposta = Math.max(0, Math.min(c.residuo, Math.round((resto - usato) * 100) / 100));
      return { ...prima, [c.key]: inTesto(proposta) };
    });
  };

  const applicaCombinazione = () => {
    if (!combinazione) return;
    setImporti(Object.fromEntries(combinazione.map((k) => [k, inTesto(perChiave.get(k)!.residuo)])));
  };

  const conferma = () => {
    if (!valido) return;
    onConferma(righe.map((r) => ({ tipo: r.candidato.tipo, id: r.candidato.id, importo: r.valore! })), nota.trim());
  };

  return (
    <div className="space-y-3">
      {combinazione && (
        <button
          type="button"
          onClick={applicaCombinazione}
          className="flex w-full items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs text-emerald-800 hover:bg-emerald-100"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span>
            {combinazione.length} {etichettaDocumenti} fanno esattamente {fmtEur(resto)}:{" "}
            <strong>{combinazione.map((k) => perChiave.get(k)!.titolo.split(" — ")[0]).join(", ")}</strong>. Clicca per sceglierle.
          </span>
        </button>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Cerca documenti da collegare" value={cerca} onChange={(e) => { setCerca(e.target.value); onSearch?.(e.target.value); }} placeholder="Cerca numero, nome o importo…" className="h-8 pl-9 text-sm" />
      </div>

      <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
        {caricando && <p role="status" className="text-sm text-muted-foreground">Ricerca in corso…</p>}
        {!caricando && elenco.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nessun risultato.</p>}
        {elenco.map((c) => {
          const scelto = c.key in importi;
          const valore = scelto ? leggiImporto(importi[c.key]) : null;
          const fuori = scelto && (valore === null || valore <= 0 || valore > c.residuo + 0.004);
          return (
            <div key={c.key} className={cn("rounded-md border p-2", scelto && "border-primary/40 bg-primary/5")}>
              <div className="flex items-start gap-2">
                <Checkbox checked={scelto} onCheckedChange={() => attiva(c)} aria-label={`Scegli ${c.titolo}`} className="mt-0.5" />
                <button type="button" onClick={() => attiva(c)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{c.titolo}</span>
                    {c.etichetta && <Badge variant="outline" className="shrink-0 text-[9px] font-normal text-muted-foreground">{c.etichetta}</Badge>}
                    {c.punteggio !== undefined && c.punteggio >= 60 && (
                      <Badge variant="outline" className="shrink-0 text-[9px] font-normal">{Math.min(c.punteggio, 100)}%</Badge>
                    )}
                  </span>
                  {(c.sottotitolo || c.motivi?.length) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.sottotitolo, ...(c.motivi ?? [])].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{fmtEur(c.residuo)}</p>
                  {scelto && (
                    <Input
                      value={importi[c.key]}
                      onChange={(e) => setImporti((p) => ({ ...p, [c.key]: e.target.value }))}
                      inputMode="decimal"
                      aria-label={`Importo per ${c.titolo}`}
                      aria-invalid={fuori}
                      className={cn("mt-1 h-7 w-28 text-right text-xs tabular-nums", fuori && "border-destructive")}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <Label className="text-xs">Nota (opzionale)</Label>
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="text-sm" />
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <p className={cn("text-xs", troppo || erroreRiga ? "text-destructive" : "text-muted-foreground")}>
          {erroreRiga
            ? `Importo non valido su ${erroreRiga.candidato.titolo.split(" — ")[0]}: al massimo ${fmtEur(erroreRiga.candidato.residuo)}.`
            : troppo
              ? `Stai abbinando ${fmtEur(-avanza)} più del movimento.`
              : righe.length === 0
                ? `Da abbinare: ${fmtEur(resto)}`
                : avanza > 0
                  ? `Abbinati ${fmtEur(somma)} · restano ${fmtEur(avanza)} da abbinare dopo`
                  : `Abbinati ${fmtEur(somma)} · movimento coperto`}
        </p>
        <Button size="sm" onClick={conferma} disabled={!valido || inCorso}>
          {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Conferma
        </Button>
      </div>
    </div>
  );
}
