import { Construction, Truck, Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ViaggioDialog } from "@/components/mezzi/ViaggioDialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { leggiRilevazioneMezzo, mezzoDaCantiere, RILEVAZIONI_MEZZI, type OpzioniRilevazioniMezzi, type TestiRilevazioniMezzi } from "@/lib/campo/rilevazioniMezzi";

export type DoveStasera = "cantiere" | "magazzino" | "furgone" | "con_me" | "invariato";

export interface RigaMezzoGiornata extends TestiRilevazioniMezzi {
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
  const { user, profile, effectiveCompany } = useAuth();
  return useQuery<MezzoDellaGiornata[]>({
    queryKey: ["campo-mezzi-giornata", orderId, effectiveCompany?.id ?? profile?.company_id, user?.id],
    enabled: !!orderId && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_mezzi_giornata", { p_order_id: orderId! });
      if (error) throw error;
      return (data ?? []) as unknown as MezzoDellaGiornata[];
    },
  });
}

/** Le righe da salvare: solo quello che l'operaio ha toccato. */
export function righeDaSalvare(valori: Record<string, RigaMezzoGiornata>, rilevazioni: OpzioniRilevazioniMezzi = {}) {
  if (Object.values(valori).some(v => v.dove === "furgone" && !v.su_mezzo_id)) {
    throw new Error("Scegli il mezzo su cui caricare ogni attrezzatura.");
  }
  return Object.entries(valori)
    .filter(([, v]) => v.usato || v.dove !== "invariato" || !!v.contatore?.trim() || RILEVAZIONI_MEZZI.some(campo => v[campo.campo] !== undefined))
    .map(([mezzo_id, v]) => ({
      mezzo_id,
      usato: v.usato,
      dove: v.dove,
      ...(v.su_mezzo_id ? { su_mezzo_id: v.su_mezzo_id } : {}),
      ...(v.contatore?.trim() ? { contatore: v.contatore.trim() } : {}),
      ...Object.fromEntries(RILEVAZIONI_MEZZI.flatMap(campo => {
        const testo = v[campo.campo];
        return rilevazioni[campo.chiave] && testo !== undefined
          ? [[campo.campo, v.usato ? leggiRilevazioneMezzo(testo, campo) : null]] : [];
      })),
    }));
}

const QUI: Record<MezzoDellaGiornata["dove_ora"], DoveStasera> = { cantiere: "cantiere", a_bordo: "furgone", con_te: "con_me" };
const ORA: Record<MezzoDellaGiornata["dove_ora"], string> = { cantiere: "sul cantiere", a_bordo: "sul furgone", con_te: "con te" };
const kmIt = (n: number | null) => (n == null ? null : n.toLocaleString(intlCampo(), { maximumFractionDigits: 0 }));

export function MezziFineGiornata({
  orderId,
  valori,
  onChange,
  companyId,
  rilevazioni = {},
}: {
  orderId: string;
  valori: Record<string, RigaMezzoGiornata>;
  onChange: (v: Record<string, RigaMezzoGiornata>) => void;
  companyId?: string;
  rilevazioni?: OpzioniRilevazioniMezzi;
}) {
  const t = useT();
  const [viaggioMezzo,setViaggioMezzo]=useState<string|null>(null);
  const { data: mezzi = [], isPending, isError, refetch } = useMezziDellaGiornata(orderId);
  if (isPending) return <p role="status" className="py-2 text-xs text-muted-foreground">{t("Caricamento mezzi assegnati…")}</p>;
  if (isError) return <p className="py-2 text-sm">{t("Mezzi temporaneamente indisponibili.")} <button type="button" className="underline" onClick={() => void refetch()}>{t("Riprova")}</button></p>;
  // Prima, senza niente assegnato, il riquadro spariva senza dire niente: l'operaio non sapeva dove segnare
  // l'escavatore o il trapano (collaudo 24/11/2026). Ora i tre gruppi ci sono sempre e dicono chi li assegna.

  const mieiVeicoli = mezzi.filter((m) => m.veicolo && m.dove_ora === "con_te");
  const veicoli = mezzi.filter((m) => m.veicolo);
  const macchine = mezzi.filter(m => !m.veicolo && mezzoDaCantiere(m.tipo, m.contatore_unita));
  const attrezzi = mezzi.filter(m => !m.veicolo && !mezzoDaCantiere(m.tipo, m.contatore_unita));
  const campiAttivi = RILEVAZIONI_MEZZI.filter(c => rilevazioni[c.chiave]);
  const riga = (m: MezzoDellaGiornata): RigaMezzoGiornata => valori[m.id] ?? { usato: false, dove: "invariato" };
  const cambia = (m: MezzoDellaGiornata, patch: Partial<RigaMezzoGiornata>) =>
    onChange({ ...valori, [m.id]: { ...riga(m), ...patch } });

  const opzioni = (m: MezzoDellaGiornata) => [
    { key: "cantiere" as const, label: t("In cantiere") },
    ...(mieiVeicoli.length > 0 || m.dove_ora === "a_bordo" ? [{ key: "furgone" as const, label: t("A bordo di un mezzo") }] : []),
    { key: "magazzino" as const, label: t("In magazzino") },
    { key: "con_me" as const, label: t("Lo tengo io") },
  ];

  const gruppi = [
    { titolo: t("Mezzi in cantiere"), risorse: macchine, icona: Construction, rileva: true, vuoto: t("Escavatori, sollevatori, betoniere… Nessuno assegnato a te o a questo cantiere.") },
    { titolo: t("Attrezzature"), risorse: attrezzi, icona: Wrench, rileva: false, vuoto: t("Trapani, demolitori, ponteggi… Nessuna assegnata a te o a questo cantiere.") },
  ];

  return (
    <div className="rounded-xl border bg-background p-4 shadow-sm">
      <p className="text-[15px] font-semibold text-foreground">{t("Mezzi e attrezzature di oggi")}</p>
      <p className="mb-3 text-xs text-muted-foreground">{t("Tocca quelli usati e dove restano stasera.")}</p>

      <div className="space-y-2">
        {veicoli.length > 0 && <div className="divide-y rounded-lg border">
          <p className="flex items-center gap-2 bg-muted/40 px-3 py-2 text-xs font-semibold"><Truck className="size-4" /> {t("Mezzi di trasporto · km a fine giornata")}</p>
          {veicoli.map((m) => {
          const r = riga(m);
          return (
            <div key={m.id} className="px-3 py-1">
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
                  {r.usato ? t("Usato oggi") : t("Non usato")}
                </span>
              </button>
              {r.usato && <>
                <label className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{m.contatore_unita === "ore" ? "Ore motore" : "Km"} a fine giornata</span>
                  <input
                    inputMode="numeric"
                    value={r.contatore ?? ""}
                    placeholder={kmIt(m.contatore) ?? ""}
                    onChange={(e) => cambia(m, { contatore: e.target.value })}
                    className="h-11 w-32 rounded-lg border bg-background px-2 text-right text-base tabular-nums"
                    aria-label={t(m.contatore_unita === "ore" ? "Ore motore di {nome} a fine giornata" : "Km di {nome} a fine giornata", { nome: m.nome })}
                  />
                </label>
                {companyId && m.veicolo && m.contatore_unita==="km" && m.dove_ora==="con_te" && <button type="button" className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-blue-200 px-3 text-xs font-semibold text-blue-900" onClick={()=>setViaggioMezzo(m.id)}>{t("Registra viaggio e tappe")}</button>}
              </>}
            </div>
          );
          })}
        </div>}

        {gruppi.map(({ titolo, risorse, icona: Icona, rileva, vuoto }) => (
          <div key={titolo} className="divide-y rounded-lg border">
            <p className="flex items-center gap-2 bg-muted/40 px-3 py-2 text-xs font-semibold"><Icona className="size-4" /> {titolo}</p>
            {risorse.length === 0 && <p className="px-3 py-2.5 text-xs text-muted-foreground">{vuoto} {t("Li assegna l'ufficio dalla scheda Mezzi.")}</p>}
            {risorse.map(m => {
              const r = riga(m);
              const ubicazione = r.dove === "invariato" ? QUI[m.dove_ora] : r.dove;
              return <div key={m.id} className="space-y-2 px-3 py-2">
                <div className="flex min-h-10 items-center justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <p className="break-words font-medium">{m.nome}</p>
                    {r.dove === "invariato" && <p className="text-xs text-muted-foreground">{m.su_mezzo ? t("A bordo di {mezzo}", { mezzo: m.su_mezzo }) : t("Ora {dove}", { dove: t(ORA[m.dove_ora]) })}</p>}
                  </div>
                  <button type="button" aria-pressed={r.usato} aria-label={t("Usato oggi · {nome}", { nome: m.nome })}
                    onClick={() => cambia(m, { usato: !r.usato })}
                    className={cn("min-h-10 shrink-0 rounded-full border px-3 text-xs",
                      r.usato ? "border-teal-300 bg-teal-50 font-semibold text-teal-800" : "text-muted-foreground")}>
                    {r.usato ? t("Usato oggi") : t("Usato?")}
                  </button>
                </div>
                {r.usato && rileva && campiAttivi.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
                  {campiAttivi.map(campo => {
                    const valore = r[campo.campo] ?? "";
                    let errore: string | undefined;
                    try { leggiRilevazioneMezzo(valore, campo); }
                    catch (e) { errore = (e as Error).message; }
                    const erroreId = `${m.id}-${campo.campo}-errore`;
                    return <label key={campo.chiave} className="min-w-0 text-xs font-medium">
                      {campo.etichetta}
                      <span className="relative mt-1 block">
                        <input inputMode="decimal" aria-label={`${campo.etichetta} · ${m.nome}`} aria-invalid={!!errore}
                          aria-describedby={errore ? erroreId : undefined} value={valore} placeholder={t("Facoltativo")}
                          onChange={e => cambia(m, { [campo.campo]: e.target.value })}
                          className="h-10 w-full rounded-md border bg-background pl-2 pr-8 text-base tabular-nums aria-invalid:border-destructive" />
                        <span className="pointer-events-none absolute right-2 top-3 text-muted-foreground">{campo.unita}</span>
                      </span>
                      {errore && <span id={erroreId} className="mt-1 block text-destructive">{errore}</span>}
                    </label>;
                  })}
                </div>}
                {/* «Dove resta» a bottoni (24/11/2026): un tocco invece di due tendine. Toccare il posto dove sta già
                    non sposta niente. */}
                {(() => {
                  const scelte: { key: string; label: string; dove: DoveStasera; su?: string | null }[] = [
                    { key: "cantiere", label: t("In cantiere"), dove: "cantiere" },
                    ...(m.dove_ora === "a_bordo" && m.su_mezzo && !mieiVeicoli.some(v => v.nome === m.su_mezzo)
                      ? [{ key: "a_bordo", label: t("Sul {mezzo}", { mezzo: m.su_mezzo }), dove: "furgone" as const, su: null }] : []),
                    ...mieiVeicoli.map(v => ({ key: `su:${v.id}`, label: t("Sul {mezzo}", { mezzo: v.nome }), dove: "furgone" as const, su: v.id })),
                    { key: "magazzino", label: t("In magazzino"), dove: "magazzino" },
                    { key: "con_me", label: t("Lo tengo io"), dove: "con_me" },
                  ];
                  const attuale = r.dove === "invariato"
                    ? (m.dove_ora === "a_bordo" ? (mieiVeicoli.find(v => v.nome === m.su_mezzo) ? `su:${mieiVeicoli.find(v => v.nome === m.su_mezzo)!.id}` : "a_bordo") : QUI[m.dove_ora] === "con_me" ? "con_me" : "cantiere")
                    : r.dove === "furgone" ? (r.su_mezzo_id ? `su:${r.su_mezzo_id}` : "a_bordo") : r.dove;
                  const giaQui = (k: string) => r.dove === "invariato" ? k === attuale
                    : (m.dove_ora === "cantiere" && k === "cantiere") || (m.dove_ora === "con_te" && k === "con_me")
                      || (m.dove_ora === "a_bordo" && (k === "a_bordo" || (k.startsWith("su:") && mieiVeicoli.find(v => `su:${v.id}` === k)?.nome === m.su_mezzo)));
                  return (
                    <div role="radiogroup" aria-label={t("Dove resta {nome} stasera", { nome: m.nome })} className="flex flex-wrap gap-1.5">
                      {scelte.map(o => (
                        <button key={o.key} type="button" role="radio" aria-checked={attuale === o.key}
                          onClick={() => cambia(m, giaQui(o.key) ? { dove: "invariato", su_mezzo_id: null } : { dove: o.dove, su_mezzo_id: o.su ?? null })}
                          className={cn("min-h-9 rounded-full border px-3 text-xs font-semibold",
                            attuale === o.key ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground")}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>;
            })}
          </div>
        ))}
      </div>
      {companyId && viaggioMezzo && <ViaggioDialog companyId={companyId} mezzoId={viaggioMezzo} defaultOrderId={orderId} onClose={()=>setViaggioMezzo(null)} />}
    </div>
  );
}
