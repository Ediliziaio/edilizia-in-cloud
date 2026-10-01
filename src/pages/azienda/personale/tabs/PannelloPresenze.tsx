import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LiveStatusProfilo } from "@/hooks/useTimbratura";
import { ETICHETTA_STATO, statoPresenza, valoriDistinti, type StatoPresenza } from "@/lib/personale/timbrature";

type Gruppo = StatoPresenza | "assente_giustificato";

const ETICHETTA: Record<Gruppo, string> = { ...ETICHETTA_STATO, assente_giustificato: "Ferie / permessi" };
const COLORE: Record<Gruppo, { punto: string; testo: string }> = {
  in_azienda: { punto: "bg-emerald-500", testo: "text-emerald-700" },
  in_pausa: { punto: "bg-amber-500", testo: "text-amber-700" },
  uscito: { punto: "bg-slate-400", testo: "text-slate-600" },
  non_timbrato: { punto: "bg-red-400", testo: "text-red-700" },
  assente_giustificato: { punto: "bg-sky-500", testo: "text-sky-700" },
};
const ORDINE: Gruppo[] = ["in_azienda", "in_pausa", "uscito", "non_timbrato", "assente_giustificato"];
const TUTTI = "__tutti__";

/**
 * «Chi è in azienda oggi», come colpo d'occhio (01/10/2026). Prima erano 23 riquadri
 * tutti uguali («Non timbrato»): ora i numeri per stato in alto, e sotto solo le persone
 * dello stato scelto, con filtro per reparto. Chi ha ferie o un permesso approvato oggi
 * non risulta più «assente senza motivo».
 */
export function PannelloPresenze({
  persone,
  assentiGiustificati,
}: {
  persone: LiveStatusProfilo[];
  /** profilo_id → «In ferie», «In permesso»… per chi ha una richiesta approvata che copre oggi. */
  assentiGiustificati: Record<string, string>;
}) {
  const [reparto, setReparto] = useState(TUTTI);
  const [scelto, setScelto] = useState<Gruppo | null>(null);

  const reparti = useMemo(() => valoriDistinti(persone, "reparto"), [persone]);
  const visibili = useMemo(
    () => persone.filter((p) => reparto === TUTTI || ((p.reparto ?? "").trim() || "(non indicato)") === reparto),
    [persone, reparto],
  );

  const gruppoDi = (p: LiveStatusProfilo): Gruppo => {
    const stato = statoPresenza(p.last_tipo);
    if (stato === "non_timbrato" && assentiGiustificati[p.id]) return "assente_giustificato";
    return stato;
  };

  const perGruppo = useMemo(() => {
    const m = new Map<Gruppo, LiveStatusProfilo[]>(ORDINE.map((g) => [g, []]));
    for (const p of visibili) m.get(gruppoDi(p))!.push(p);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibili, assentiGiustificati]);

  const inAzienda = (perGruppo.get("in_azienda")?.length ?? 0) + (perGruppo.get("in_pausa")?.length ?? 0);
  // Di serie: chi è in azienda; se non c'è nessuno, chi non ha timbrato.
  const attivo: Gruppo = scelto ?? ((perGruppo.get("in_azienda")?.length ?? 0) > 0 ? "in_azienda" : "non_timbrato");
  const elenco = perGruppo.get(attivo) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Chi è in azienda oggi
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              {inAzienda} su {visibili.length}
            </span>
          </CardTitle>
          {reparti.length > 1 && (
            <Select value={reparto} onValueChange={setReparto}>
              <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Reparto"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TUTTI}>Tutti i reparti</SelectItem>
                {reparti.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {persone.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun profilo HR attivo</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Stato delle persone">
              {ORDINE.map((g) => {
                const n = perGruppo.get(g)?.length ?? 0;
                if (n === 0 && g !== "in_azienda" && g !== "non_timbrato") return null;
                return (
                  <button
                    key={g}
                    type="button"
                    role="tab"
                    aria-selected={attivo === g}
                    onClick={() => setScelto(g)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors hover:bg-muted/50",
                      attivo === g && "border-primary bg-primary/5",
                    )}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full", COLORE[g].punto)} aria-hidden="true" />
                    <span className="text-lg font-semibold leading-none tabular-nums">{n}</span>
                    <span className="text-xs text-muted-foreground">{ETICHETTA[g]}</span>
                  </button>
                );
              })}
            </div>

            {elenco.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nessuno in questo stato{reparto !== TUTTI ? ` nel reparto ${reparto}` : ""}.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                {elenco.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: p.colore_avatar || "#0EA5E9" }}
                    >
                      {p.nome?.[0]}{p.cognome?.[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.nome} {p.cognome}</p>
                      <p className={cn("truncate text-xs", COLORE[attivo].testo)}>
                        {attivo === "assente_giustificato"
                          ? assentiGiustificati[p.id]
                          : p.last_ora ? `${ETICHETTA[attivo]} · ${p.last_ora}` : ETICHETTA[attivo]}
                        {p.mansione ? <span className="text-muted-foreground"> · {p.mansione}</span> : null}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
