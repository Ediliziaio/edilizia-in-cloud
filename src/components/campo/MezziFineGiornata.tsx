/**
 * Mezzi e attrezzi di oggi, dentro il rapportino (26/09/2026, richiesta del
 * founder: «a fine giornata consegna le attrezzature»).
 *
 * L'operaio segna cosa ha usato e dove resta stasera ogni attrezzo (in
 * cantiere, sul furgone, in magazzino, lo tengo io); per il furgone o l'auto i
 * km a fine giornata. Si salva insieme al rapportino (campo_mezzi_fine_giornata)
 * e in ufficio si vede subito dov'è ogni cosa.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type DoveStasera = "cantiere" | "magazzino" | "furgone" | "con_me" | "invariato";

export interface RigaMezzoGiornata {
  usato: boolean;
  dove: DoveStasera;
  su_mezzo_id?: string | null;
  contatore?: string;
}

export interface MezzoDellaGiornata {
  id: string;
  nome: string;
  tipo: string;
  targa: string | null;
  veicolo: boolean;
  contatore: number | null;
  contatore_unita: string | null;
  /** Dove sta adesso: con te, sul tuo furgone, sul cantiere. */
  dove_ora: "con_te" | "a_bordo" | "cantiere";
  su_mezzo: string | null;
  segnato_oggi: boolean;
}

export function useMezziDellaGiornata(orderId: string | undefined) {
  return useQuery<MezzoDellaGiornata[]>({
    queryKey: ["campo-mezzi-giornata", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_mezzi_giornata", { p_order_id: orderId! });
      if (error) throw error;
      return (data ?? []) as unknown as MezzoDellaGiornata[];
    },
  });
}

/** Le righe da salvare: solo quello che l'operaio ha toccato. */
export function righeDaSalvare(valori: Record<string, RigaMezzoGiornata>) {
  return Object.entries(valori)
    .filter(([, v]) => v.usato || v.dove !== "invariato" || !!v.contatore?.trim())
    .map(([mezzo_id, v]) => ({
      mezzo_id,
      usato: v.usato,
      dove: v.dove,
      ...(v.su_mezzo_id ? { su_mezzo_id: v.su_mezzo_id } : {}),
      ...(v.contatore?.trim() ? { contatore: v.contatore.trim() } : {}),
    }));
}

const QUI: Record<MezzoDellaGiornata["dove_ora"], DoveStasera> = { cantiere: "cantiere", a_bordo: "furgone", con_te: "con_me" };
const ORA: Record<MezzoDellaGiornata["dove_ora"], string> = { cantiere: "sul cantiere", a_bordo: "sul furgone", con_te: "con te" };
const kmIt = (n: number | null) => (n == null ? null : n.toLocaleString("it-IT", { maximumFractionDigits: 0 }));

export function MezziFineGiornata({
  orderId,
  valori,
  onChange,
}: {
  orderId: string;
  valori: Record<string, RigaMezzoGiornata>;
  onChange: (v: Record<string, RigaMezzoGiornata>) => void;
}) {
  const { data: mezzi = [] } = useMezziDellaGiornata(orderId);
  if (mezzi.length === 0) return null;

  const mieiVeicoli = mezzi.filter((m) => m.veicolo && m.dove_ora === "con_te");
  const veicoli = mezzi.filter((m) => m.veicolo);
  const attrezzi = mezzi.filter((m) => !m.veicolo);
  const riga = (m: MezzoDellaGiornata): RigaMezzoGiornata => valori[m.id] ?? { usato: false, dove: "invariato" };
  const cambia = (m: MezzoDellaGiornata, patch: Partial<RigaMezzoGiornata>) =>
    onChange({ ...valori, [m.id]: { ...riga(m), ...patch } });

  const opzioni = (m: MezzoDellaGiornata) => [
    { key: "cantiere" as const, label: "In cantiere" },
    ...(mieiVeicoli.length > 0 ? [{ key: "furgone" as const, label: m.dove_ora === "a_bordo" && m.su_mezzo ? `Sul ${m.su_mezzo}` : "Sul furgone" }] : []),
    { key: "magazzino" as const, label: "In magazzino" },
    { key: "con_me" as const, label: "Lo tengo io" },
  ];

  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Mezzi e attrezzi di oggi</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Segna cosa hai usato e dove resta stasera: così in ufficio sanno sempre dov'è.
      </p>

      <div className="space-y-2">
        {veicoli.map((m) => {
          const r = riga(m);
          return (
            <div key={m.id} className="rounded-xl border bg-muted/30 p-3">
              <button
                type="button"
                aria-pressed={r.usato}
                onClick={() => cambia(m, { usato: !r.usato })}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-left text-sm",
                  r.usato ? "font-semibold text-teal-800" : "text-foreground",
                )}
              >
                <span className="min-w-0 truncate">{m.nome}{m.targa ? ` · ${m.targa}` : ""}</span>
                <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs",
                  r.usato ? "border-teal-300 bg-teal-50 text-teal-800" : "text-muted-foreground")}>
                  {r.usato ? "Usato oggi" : "Non usato"}
                </span>
              </button>
              {r.usato && (
                <label className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{m.contatore_unita === "ore" ? "Ore motore" : "Km"} a fine giornata</span>
                  <input
                    inputMode="numeric"
                    value={r.contatore ?? ""}
                    placeholder={kmIt(m.contatore) ?? ""}
                    onChange={(e) => cambia(m, { contatore: e.target.value })}
                    className="h-11 w-32 rounded-lg border bg-background px-2 text-right text-base tabular-nums"
                    aria-label={`${m.contatore_unita === "ore" ? "Ore motore" : "Km"} di ${m.nome} a fine giornata`}
                  />
                </label>
              )}
            </div>
          );
        })}

        {attrezzi.map((m) => {
          const r = riga(m);
          const scelto = r.dove === "invariato" ? QUI[m.dove_ora] : r.dove;
          return (
            <div key={m.id} className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-sm">
                  <span className="font-semibold">{m.nome}</span>
                  <span className="text-muted-foreground"> · ora {ORA[m.dove_ora]}</span>
                </p>
                <button
                  type="button"
                  aria-pressed={r.usato}
                  onClick={() => cambia(m, { usato: !r.usato })}
                  className={cn("min-h-9 shrink-0 rounded-full border px-3 text-xs",
                    r.usato ? "border-teal-300 bg-teal-50 font-semibold text-teal-800" : "text-muted-foreground")}
                >
                  {r.usato ? "Usato oggi" : "Usato?"}
                </button>
              </div>
              <p className="mb-1.5 mt-2 text-xs text-muted-foreground">Stasera resta:</p>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`Dove resta ${m.nome} stasera`}>
                {opzioni(m).map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={scelto === o.key}
                    onClick={() => cambia(m, {
                      dove: o.key === QUI[m.dove_ora] ? "invariato" : o.key,
                      su_mezzo_id: o.key === "furgone" ? mieiVeicoli[0]?.id ?? null : null,
                    })}
                    className={cn("min-h-11 rounded-lg border px-2 text-sm",
                      scelto === o.key ? "border-teal-400 bg-teal-50 font-semibold text-teal-800" : "bg-background text-foreground")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
