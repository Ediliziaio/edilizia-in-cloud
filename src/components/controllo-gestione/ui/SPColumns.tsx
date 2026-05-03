import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { SPAttivo, SPPassivo } from "@/hooks/controlloGestione/useStatoPatrimoniale";

interface SPColumnsProps {
  attivo: SPAttivo;
  passivo: SPPassivo;
}

interface Riga {
  label: string;
  valore: number;
  livello: "voce" | "subtot" | "totale";
}

function buildAttivo(a: SPAttivo): Riga[] {
  return [
    { label: "Immobilizzazioni immateriali", valore: a.imm_immateriali, livello: "voce" },
    { label: "Immobilizzazioni materiali", valore: a.imm_materiali, livello: "voce" },
    { label: "Immobilizzazioni finanziarie", valore: a.imm_finanziarie, livello: "voce" },
    { label: "Attivo fisso", valore: a.attivo_fisso, livello: "subtot" },
    { label: "Rimanenze", valore: a.rimanenze, livello: "voce" },
    { label: "Crediti verso clienti", valore: a.crediti_clienti, livello: "voce" },
    { label: "Crediti tributari", valore: a.crediti_tributari, livello: "voce" },
    { label: "Anticipi a fornitori", valore: a.anticipi_fornitori, livello: "voce" },
    { label: "Liquidità differite", valore: a.liquidita_differite, livello: "subtot" },
    { label: "Cassa", valore: a.cassa, livello: "voce" },
    { label: "Banche (saldi positivi)", valore: a.banche_positive, livello: "voce" },
    { label: "Liquidità immediate", valore: a.liquidita_immediate, livello: "subtot" },
    { label: "Attivo circolante", valore: a.attivo_circolante, livello: "subtot" },
    { label: "Totale Impieghi", valore: a.totale, livello: "totale" },
  ];
}

function buildPassivo(p: SPPassivo): Riga[] {
  return [
    { label: "Capitale sociale", valore: p.capitale_sociale, livello: "voce" },
    { label: "Riserve", valore: p.riserve, livello: "voce" },
    { label: "Utile d'esercizio", valore: p.utile_esercizio, livello: "voce" },
    { label: "Mezzi propri", valore: p.mezzi_propri, livello: "subtot" },
    { label: "Fondo TFR", valore: p.fondo_tfr, livello: "voce" },
    { label: "Fondi rischi", valore: p.fondi_rischi, livello: "voce" },
    { label: "Mutui M/L termine", valore: p.mutui_mlt, livello: "voce" },
    { label: "Passività consolidate", valore: p.pas_consolidato, livello: "subtot" },
    { label: "Banche (saldi negativi)", valore: p.banche_negative, livello: "voce" },
    { label: "Debiti verso fornitori", valore: p.debiti_fornitori, livello: "voce" },
    { label: "Debiti tributari", valore: p.debiti_tributari, livello: "voce" },
    { label: "Debiti verso personale", valore: p.debiti_personale, livello: "voce" },
    { label: "Debiti previdenziali", valore: p.debiti_previdenziali, livello: "voce" },
    { label: "Passività correnti", valore: p.pas_corrente, livello: "subtot" },
    { label: "Totale Fonti", valore: p.totale, livello: "totale" },
  ];
}

function ColumnSP({ titolo, righe }: { titolo: string; righe: Riga[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b bg-muted/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold">{titolo}</h3>
      </div>
      <div className="divide-y">
        {righe.map((r, i) => {
          const negativo = r.valore < 0;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-2 text-sm",
                r.livello === "subtot" && "bg-muted/50 font-semibold",
                r.livello === "totale" && "bg-primary/5 font-bold",
              )}
            >
              <span className="truncate">{r.label}</span>
              <span
                className={cn(
                  "tabular-nums shrink-0",
                  negativo && "text-destructive",
                )}
              >
                {formatCurrency(r.valore)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SPColumns({ attivo, passivo }: SPColumnsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ColumnSP titolo="Attivo (Impieghi)" righe={buildAttivo(attivo)} />
      <ColumnSP titolo="Passivo (Fonti)" righe={buildPassivo(passivo)} />
    </div>
  );
}
