import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { SPAttivo, SPPassivo } from "@/hooks/controlloGestione/useStatoPatrimoniale";

interface SPColumnsProps {
  attivo: SPAttivo;
  passivo: SPPassivo;
  /** Voci senza fonte nel gestionale: a zero si legge «da inserire», non 0,00 €. */
  vociManuali?: Set<string>;
  /** Attivo − passivo: se diversa da zero compare in fondo alle fonti. */
  differenza?: number;
}

interface Riga {
  chiave: string;
  label: string;
  valore: number;
  livello: "voce" | "subtot" | "totale";
  spiegazione?: string;
}

function buildAttivo(a: SPAttivo): Riga[] {
  return [
    { chiave: "imm_immateriali", label: "Immobilizzazioni immateriali", valore: a.imm_immateriali, livello: "voce", spiegazione: "Software, licenze, marchi." },
    { chiave: "imm_materiali", label: "Immobilizzazioni materiali", valore: a.imm_materiali, livello: "voce", spiegazione: "Mezzi, attrezzature, immobili: valore residuo dopo gli ammortamenti." },
    { chiave: "imm_finanziarie", label: "Immobilizzazioni finanziarie", valore: a.imm_finanziarie, livello: "voce" },
    { chiave: "attivo_fisso", label: "Attivo fisso", valore: a.attivo_fisso, livello: "subtot", spiegazione: "Quello che resta in azienda per più anni." },
    { chiave: "rimanenze", label: "Rimanenze di magazzino", valore: a.rimanenze, livello: "voce" },
    { chiave: "crediti_clienti", label: "Crediti verso clienti", valore: a.crediti_clienti, livello: "voce", spiegazione: "Fatture emesse non ancora incassate, IVA compresa." },
    { chiave: "crediti_tributari", label: "Crediti tributari", valore: a.crediti_tributari, livello: "voce", spiegazione: "IVA a credito e acconti d'imposta." },
    { chiave: "anticipi_fornitori", label: "Anticipi a fornitori", valore: a.anticipi_fornitori, livello: "voce" },
    { chiave: "liquidita_differite", label: "Crediti a breve", valore: a.liquidita_differite, livello: "subtot" },
    { chiave: "cassa", label: "Cassa contanti", valore: a.cassa, livello: "voce" },
    { chiave: "banche_positive", label: "Conti in attivo", valore: a.banche_positive, livello: "voce", spiegazione: "Saldo di oggi dei conti con saldo positivo." },
    { chiave: "liquidita_immediate", label: "Liquidità", valore: a.liquidita_immediate, livello: "subtot" },
    { chiave: "attivo_circolante", label: "Attivo circolante", valore: a.attivo_circolante, livello: "subtot", spiegazione: "Quello che diventa denaro entro un anno." },
    { chiave: "totale", label: "Totale impieghi", valore: a.totale, livello: "totale" },
  ];
}

function buildPassivo(p: SPPassivo): Riga[] {
  return [
    { chiave: "capitale_sociale", label: "Capitale sociale", valore: p.capitale_sociale, livello: "voce" },
    { chiave: "riserve", label: "Riserve e utili degli anni passati", valore: p.riserve, livello: "voce" },
    { chiave: "utile_esercizio", label: "Utile dell'anno", valore: p.utile_esercizio, livello: "voce", spiegazione: "Dal conto economico dell'anno intero." },
    { chiave: "mezzi_propri", label: "Patrimonio netto", valore: p.mezzi_propri, livello: "subtot", spiegazione: "I soldi dei soci nell'azienda." },
    { chiave: "fondo_tfr", label: "Fondo TFR", valore: p.fondo_tfr, livello: "voce" },
    { chiave: "fondi_rischi", label: "Fondi rischi", valore: p.fondi_rischi, livello: "voce" },
    { chiave: "mutui_mlt", label: "Mutui e finanziamenti", valore: p.mutui_mlt, livello: "voce", spiegazione: "Capitale residuo dei finanziamenti attivi." },
    { chiave: "pas_consolidato", label: "Debiti a lungo termine", valore: p.pas_consolidato, livello: "subtot" },
    { chiave: "banche_negative", label: "Conti in rosso", valore: p.banche_negative, livello: "voce", spiegazione: "Saldo di oggi dei conti con saldo negativo (scoperti, anticipi)." },
    { chiave: "debiti_fornitori", label: "Debiti verso fornitori", valore: p.debiti_fornitori, livello: "voce", spiegazione: "Pagamenti a fornitori ancora aperti nello scadenzario." },
    { chiave: "debiti_tributari", label: "Debiti tributari", valore: p.debiti_tributari, livello: "voce", spiegazione: "F24 e scadenze fiscali ancora da pagare." },
    { chiave: "debiti_personale", label: "Debiti verso il personale", valore: p.debiti_personale, livello: "voce", spiegazione: "Stipendi emessi e non ancora pagati." },
    { chiave: "debiti_previdenziali", label: "Debiti previdenziali", valore: p.debiti_previdenziali, livello: "voce", spiegazione: "Contributi INPS e INAIL da versare." },
    { chiave: "pas_corrente", label: "Debiti a breve", valore: p.pas_corrente, livello: "subtot" },
    { chiave: "totale", label: "Totale fonti", valore: p.totale, livello: "totale" },
  ];
}

function ColumnSP({
  titolo, righe, vociManuali, differenza,
}: {
  titolo: string;
  righe: Riga[];
  vociManuali?: Set<string>;
  differenza?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-muted/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold">{titolo}</h3>
      </div>
      <div className="divide-y">
        {righe.map((r) => {
          const negativo = r.valore < 0;
          const daInserire = r.livello === "voce" && r.valore === 0 && vociManuali?.has(r.chiave);
          return (
            <div
              key={r.chiave}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-2 text-sm",
                r.livello === "voce" && "pl-7",
                r.livello === "subtot" && "border-t-2 border-muted bg-muted/50 font-semibold",
                r.livello === "totale" && "bg-primary/10 py-3 text-base font-bold",
              )}
            >
              <span className={cn("min-w-0", r.spiegazione && "cursor-help")} title={r.spiegazione}>
                {r.label}
              </span>
              {daInserire ? (
                <span className="shrink-0 text-xs italic text-muted-foreground" title="Il gestionale non ha ancora una fonte per questa voce: chiedi il dato al commercialista.">
                  da inserire a mano
                </span>
              ) : (
                <span className={cn("shrink-0 tabular-nums", negativo && "text-destructive")}>
                  {formatCurrency(r.valore)}
                </span>
              )}
            </div>
          );
        })}
        {differenza != null && Math.abs(differenza) >= 1 && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">
            <span title="Impieghi meno fonti: quello che il gestionale non riesce ancora a spiegare.">
              {differenza > 0 ? "Fonti mancanti (differenza)" : "Impieghi mancanti (differenza)"}
            </span>
            <span className="shrink-0 tabular-nums">{formatCurrency(Math.abs(differenza))}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SPColumns({ attivo, passivo, vociManuali, differenza }: SPColumnsProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <ColumnSP
        titolo="Impieghi: dove sono i soldi"
        righe={buildAttivo(attivo)}
        vociManuali={vociManuali}
        differenza={differenza != null && differenza < 0 ? differenza : undefined}
      />
      <ColumnSP
        titolo="Fonti: da dove vengono"
        righe={buildPassivo(passivo)}
        vociManuali={vociManuali}
        differenza={differenza != null && differenza > 0 ? differenza : undefined}
      />
    </div>
  );
}
