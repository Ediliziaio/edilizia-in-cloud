/**
 * Costi → Utenze (15/11/2026): i contatori dell'azienda letti dalle bollette (POD luce, PDR gas;
 * dal 16/11 acqua e telefono col codice del gestore),
 * dove va il loro costo (sede, immobile o commessa, con la data da cui vale) e le bollette da
 * decidere (doppioni sospetti). Le bollette le legge da sé il giro del server; qui si collega
 * l'utenza e si decide sui dubbi. Le scritture passano da utenza_collega_destinazione e
 * bolletta_decidi, che ricontrollano azienda e permessi.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Droplet, Flame, Phone, Plug, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnnullaCostoDialog } from "@/components/costi/AnnullaCostoDialog";
import { motivoBolletta } from "@/lib/costi/annulloCosto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface Utenza { id: string; tipo: string; codice: string; fornitore_nome: string | null; indirizzo_fornitura: string | null; numero_contratto: string | null }
export interface Destinazione { id: string; utenza_id: string; destinazione_tipo: "sede" | "immobile" | "commessa"; sede_id: string | null; unita_id: string | null; order_id: string | null; valido_dal: string; valido_al: string | null }
export interface RigaBolletta { bolletta_id: string; utenza_id: string | null; periodo_dal: string | null; periodo_al: string | null; importo: number }
export interface Bolletta { id: string; numero: string | null; data: string | null; stato: string; tipo?: string | null; costo_esito: string | null; fattura_ricevuta_id?: string | null; avvisi: Array<{ codice: string; testo: string; costo_id?: string | null }> }
/** Il costo ancora nei conti di una bolletta scartata o doppia (16/11/2026): si annulla da qui. */
export interface CostoDaAnnullare { bolletta: Bolletta; costo: { id: string; name: string; amount: number } }
interface Scelta { id: string; nome: string }

const COSTO: Record<string, string> = {
  applicato: "costo sulla commessa", proposta: "proposta da confermare", generale: "costo generale",
  da_collegare: "da collegare", senza_costo: "fattura da contabilizzare", gia_assegnato: "costo già assegnato",
  misto: "da ripartire a mano", sospesa: "sospesa",
};
const Icona = ({ tipo }: { tipo: string }) =>
  tipo === "luce" ? <Zap className="h-4 w-4 text-amber-500" />
  : tipo === "gas" ? <Flame className="h-4 w-4 text-orange-600" />
  : tipo === "acqua" ? <Droplet className="h-4 w-4 text-sky-600" />
  : tipo === "telefono" ? <Phone className="h-4 w-4 text-violet-600" />
  : <Plug className="h-4 w-4 text-muted-foreground" />;
// La data di oggi in Italia, non in UTC: dopo mezzanotte italiana UTC è ancora «ieri».
const oggi = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

/** La destinazione che vale oggi (l'ultima aperta). */
export function destinazioneAttuale(dest: Destinazione[], utenzaId: string, data = oggi()): Destinazione | null {
  return dest
    .filter((d) => d.utenza_id === utenzaId && d.valido_dal <= data && (!d.valido_al || d.valido_al >= data))
    .sort((a, b) => b.valido_dal.localeCompare(a.valido_dal))[0] ?? null;
}

export default function UtenzeTab() {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const permessi = usePermissions();
  const qc = useQueryClient();
  const puoDecidere = permessi.canViewCosts && !permessi.solaLettura;
  // Le date di riferimento si fissano all'apertura della scheda.
  const [annoFa] = useState(() => new Date(Date.now() - 365 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["utenze-bollette", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [u, d, r, b, sedi, commesse, unita] = await Promise.all([
        db.from("utenze").select("id, tipo, codice, fornitore_nome, indirizzo_fornitura, numero_contratto").eq("company_id", companyId).order("codice"),
        db.from("utenze_destinazioni").select("id, utenza_id, destinazione_tipo, sede_id, unita_id, order_id, valido_dal, valido_al").eq("company_id", companyId).eq("stato", "collegato"),
        db.from("bollette_righe").select("bolletta_id, utenza_id, periodo_dal, periodo_al, importo").eq("company_id", companyId).limit(5000),
        db.from("bollette").select("id, numero, data, stato, tipo, costo_esito, avvisi, fattura_ricevuta_id").eq("company_id", companyId).order("data", { ascending: false }).limit(5000),
        db.from("sedi").select("id, nome").eq("company_id", companyId).order("nome"),
        db.from("orders").select("id, order_code, description").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        db.from("unita_immobiliari").select("id, sigla, edificio").eq("company_id", companyId).order("sigla").limit(1000),
      ]);
      for (const x of [u, d, r, b]) if (x.error) throw x.error;
      // Bollette scartate o doppie col costo già registrato: il costo dalla decisione (avvisi.costo_id)
      // o dalla fattura; restano in elenco finché il costo non è annullato.
      const dubbie = ((b.data ?? []) as Bolletta[]).filter((x) => x.stato === "scartata" || x.stato === "doppione_sospetto");
      const daFattura = new Map<string, string>();
      const fattureIds = dubbie.map((x) => x.fattura_ricevuta_id).filter((x): x is string => !!x);
      if (fattureIds.length) {
        const f = await db.from("fatture_ricevute").select("id, company_cost_id").eq("company_id", companyId).in("id", fattureIds);
        for (const x of (f.data ?? []) as Array<{ id: string; company_cost_id: string | null }>) if (x.company_cost_id) daFattura.set(x.id, x.company_cost_id);
      }
      const costoDi = (x: Bolletta) => [...(x.avvisi ?? [])].reverse().find((a) => a.costo_id)?.costo_id ?? (x.fattura_ricevuta_id ? daFattura.get(x.fattura_ricevuta_id) : undefined) ?? null;
      const costiIds = [...new Set(dubbie.map(costoDi).filter((x): x is string => !!x))];
      let costiDaAnnullare: CostoDaAnnullare[] = [];
      if (costiIds.length) {
        const c = await db.from("company_costs").select("id, name, amount, annullato_il").eq("company_id", companyId).in("id", costiIds);
        const attivi = new Map(((c.data ?? []) as Array<{ id: string; name: string; amount: number; annullato_il: string | null }>)
          .filter((x) => !x.annullato_il).map((x) => [x.id, x]));
        costiDaAnnullare = dubbie.flatMap((x) => { const k = costoDi(x); const cc = k ? attivi.get(k) : undefined; return cc ? [{ bolletta: x, costo: { id: cc.id, name: cc.name, amount: Number(cc.amount) } }] : []; });
      }
      return {
        costiDaAnnullare,
        utenze: (u.data ?? []) as Utenza[], destinazioni: (d.data ?? []) as Destinazione[],
        righe: (r.data ?? []) as RigaBolletta[], bollette: (b.data ?? []) as Bolletta[],
        sedi: ((sedi.data ?? []) as Array<{ id: string; nome: string }>).map((s) => ({ id: s.id, nome: s.nome })),
        commesse: ((commesse.data ?? []) as Array<{ id: string; order_code: string | null; description: string | null }>).map((o) => ({ id: o.id, nome: [o.order_code, o.description].filter(Boolean).join(" · ") || "Commessa" })),
        unita: ((unita.data ?? []) as Array<{ id: string; sigla: string | null; edificio: string | null }>).map((x) => ({ id: x.id, nome: [x.edificio, x.sigla].filter(Boolean).join(" · ") || "Unità" })),
      };
    },
  });

  const aggiorna = () => { void qc.invalidateQueries({ queryKey: ["utenze-bollette", companyId] }); void qc.invalidateQueries({ queryKey: ["fattura-bolletta"] }); };
  const collega = useMutation({
    mutationFn: async (v: { utenza: string; tipo: string | null; dest: string | null; dal: string | null }) => {
      const { data: r, error } = await db.rpc("utenza_collega_destinazione", { p_utenza: v.utenza, p_tipo: v.tipo, p_destinazione: v.dest, p_valido_dal: v.dal });
      if (error) throw error;
      return r as { bollette_riviste: number };
    },
    onSuccess: (r) => { toast.success(r?.bollette_riviste ? t("Collegata: riviste {bollette_riviste} bollette", { bollette_riviste: String(r.bollette_riviste ?? "") }) : t("Collegata")); aggiorna(); },
    onError: (e: Error) => toast.error(t("Non collegata"), { description: e.message }),
  });
  const decidi = useMutation({
    mutationFn: async (v: { bolletta: string; decisione: "non_doppione" | "scarta" }) => {
      const { error } = await db.rpc("bolletta_decidi", { p_bolletta: v.bolletta, p_decisione: v.decisione });
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e: Error) => toast.error(t("Decisione non salvata"), { description: e.message }),
  });

  const daDecidere = (data?.bollette ?? []).filter((b) => b.stato === "doppione_sospetto");
  const [daAnnullare, setDaAnnullare] = useState<CostoDaAnnullare | null>(null);

  if (isLoading) return <p role="status" className="p-4 text-sm text-muted-foreground">{t("Caricamento utenze…")}</p>;
  if (isError || !data) return <div role="alert" className="rounded-lg border p-4 text-sm">{t("Utenze non disponibili.")} <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("Riprova")}</Button></div>;
  if (!data.utenze.length) {
    return <p className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">{t("Nessuna utenza ancora. Le utenze nascono da sole dalle bollette che arrivano: luce e gas dal POD o dal PDR, acqua e telefono dal codice del gestore nella fattura elettronica.")}</p>;
  }

  return (
    <div className="space-y-5">
      {daDecidere.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:bg-amber-950/20" aria-label={t("Bollette da decidere")}>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />{t("Bollette da decidere ({n})", { n: daDecidere.length })}</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {daDecidere.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{t("Bolletta {numero}", { numero: b.numero ?? t("senza numero") })}{b.data ? t(" del {data}", { data: formatDateShort(b.data) }) : ""}: {b.avvisi[0]?.testo ?? t("possibile doppione")}</span>
                {puoDecidere && (
                  <span className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={decidi.isPending} onClick={() => decidi.mutate({ bolletta: b.id, decisione: "non_doppione" })}>{t("Non è un doppione")}</Button>
                    <Button size="sm" variant="outline" disabled={decidi.isPending} onClick={() => decidi.mutate({ bolletta: b.id, decisione: "scarta" })}>{t("Scarta")}</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.costiDaAnnullare.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:bg-amber-950/20" aria-label={t("Costi da annullare")}>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />{t("Costi ancora nei conti ({n})", { n: data.costiDaAnnullare.length })}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("La bolletta è scartata o doppia, ma il suo costo era già registrato: annullalo, così esce da conti, commesse e cassa.")}</p>
          <ul className="mt-2 space-y-2 text-sm">
            {data.costiDaAnnullare.map((x) => (
              <li key={`${x.bolletta.id}-${x.costo.id}`} className="flex flex-wrap items-center justify-between gap-2">
                <span>{t("Bolletta {numero}", { numero: x.bolletta.numero ?? t("senza numero") })}{x.bolletta.data ? t(" del {data}", { data: formatDateShort(x.bolletta.data) }) : ""} ({x.bolletta.stato === "scartata" ? t("scartata") : t("possibile doppione")}): {t("costo «{nome}», {importo}", { nome: x.costo.name, importo: formatCurrency(x.costo.amount) })}</span>
                {puoDecidere && <Button size="sm" variant="outline" onClick={() => setDaAnnullare(x)}>{t("Annulla costo")}</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <AnnullaCostoDialog
        costId={daAnnullare?.costo.id ?? null}
        nome={daAnnullare?.costo.name}
        open={!!daAnnullare}
        onOpenChange={(o) => { if (!o) setDaAnnullare(null); }}
        motivoIniziale={motivoBolletta(daAnnullare?.bolletta.stato)}
        onFatto={aggiorna}
      />

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-2">{t("Utenza")}</th><th className="p-2">{t("Fornitore")}</th><th className="p-2">{t("Bollette")}</th><th className="p-2">{t("Ultimo periodo")}</th><th className="p-2 text-right">{t("Ultimi 12 mesi")}</th><th className="p-2">{t("Il costo va a")}</th></tr>
          </thead>
          <tbody>
            {data.utenze.map((u) => (
              <RigaUtenza key={u.id} utenza={u} dati={data} puoDecidere={puoDecidere} occupato={collega.isPending} annoFa={annoFa}
                onCollega={(tipo, dest, dal) => collega.mutate({ utenza: u.id, tipo, dest, dal })} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Il codice (POD o PDR) identifica il contatore anche se cambia il fornitore; l'indirizzo di fornitura è solo un aiuto. Collegando un'utenza, le sue bollette col costo non ancora assegnato vanno sulla commessa del periodo; quelle già assegnate a mano non si toccano.")}
      </p>
    </div>
  );
}

function RigaUtenza({ utenza: u, dati, puoDecidere, occupato, onCollega, annoFa }: {
  utenza: Utenza; puoDecidere: boolean; occupato: boolean; annoFa: string;
  dati: { destinazioni: Destinazione[]; righe: RigaBolletta[]; bollette: Bolletta[]; sedi: Scelta[]; commesse: Scelta[]; unita: Scelta[] };
  onCollega: (tipo: string | null, dest: string | null, dal: string | null) => void;
}) {
  const tr = useT();
  const [tipo, setTipo] = useState<"" | "sede" | "immobile" | "commessa">("");
  const [dal, setDal] = useState("");
  const righe = dati.righe.filter((r) => r.utenza_id === u.id);
  const ids = new Set(righe.map((r) => r.bolletta_id));
  const bollette = dati.bollette.filter((b) => ids.has(b.id));
  const ultimo = [...righe].sort((a, b) => (b.periodo_al ?? "").localeCompare(a.periodo_al ?? ""))[0];
  // Solo le bollette valide: un doppione sospetto o una scartata non sono una spesa.
  const valide = new Set(bollette.filter((b) => b.stato === "riconosciuta").map((b) => b.id));
  // Una nota di credito si sottrae, qualunque sia il segno scritto nella riga.
  const note = new Set(bollette.filter((b) => b.tipo === "nota_credito").map((b) => b.id));
  const anno = righe.filter((r) => valide.has(r.bolletta_id) && (r.periodo_al ?? "") >= annoFa)
    .reduce((t, r) => t + (note.has(r.bolletta_id) ? -Math.abs(Number(r.importo)) : Number(r.importo)), 0);
  const attuale = destinazioneAttuale(dati.destinazioni, u.id);
  const nomeDi = (d: Destinazione) => d.destinazione_tipo === "sede" ? `Sede · ${dati.sedi.find((s) => s.id === d.sede_id)?.nome ?? ""}`
    : d.destinazione_tipo === "immobile" ? `Immobile · ${dati.unita.find((s) => s.id === d.unita_id)?.nome ?? ""}`
    : `Commessa · ${dati.commesse.find((s) => s.id === d.order_id)?.nome ?? ""}`;
  const opzioni = tipo === "sede" ? dati.sedi : tipo === "immobile" ? dati.unita : tipo === "commessa" ? dati.commesse : [];
  const conteggio: Record<string, number> = {};
  for (const b of bollette) if (b.costo_esito) conteggio[b.costo_esito] = (conteggio[b.costo_esito] ?? 0) + 1;
  const esiti = Object.entries(conteggio).map(([k, n]) => `${n} ${COSTO[k] ? tr(COSTO[k]) : k}`).join(" · ");

  return (
    <tr className="border-t align-top">
      <td className="p-2">
        <span className="flex items-center gap-1.5 font-medium"><Icona tipo={u.tipo} />{u.codice}</span>
        {u.indirizzo_fornitura && <span className="block text-xs text-muted-foreground">{u.indirizzo_fornitura}</span>}
      </td>
      <td className="p-2">{u.fornitore_nome ?? "—"}{u.numero_contratto && <span className="block text-xs text-muted-foreground">{tr("Contratto {numero_contratto}", { numero_contratto: String(u.numero_contratto ?? "") })}</span>}</td>
      <td className="p-2">{bollette.length}{esiti && <span className="block text-xs text-muted-foreground">{esiti}</span>}</td>
      <td className="p-2">{ultimo?.periodo_dal ? `${formatDateShort(ultimo.periodo_dal)} – ${formatDateShort(ultimo.periodo_al ?? ultimo.periodo_dal)}` : "—"}</td>
      <td className="p-2 text-right tabular-nums">{formatCurrency(anno)}</td>
      <td className="p-2">
        <span className={attuale ? "font-medium" : "text-amber-700 dark:text-amber-400"}>{attuale ? nomeDi(attuale) : tr("Da collegare")}</span>
        {attuale && attuale.valido_dal > "1900-01-01" && <span className="block text-xs text-muted-foreground">{tr("dal {valido_dal}", { valido_dal: formatDateShort(attuale.valido_dal) })}</span>}
        {puoDecidere && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger className="h-7 w-28 text-xs" aria-label={tr("Destinazione di {codice}", { codice: String(u.codice ?? "") })}><SelectValue placeholder={attuale ? tr("Cambia…") : tr("Collega a…")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="commessa">{tr("Commessa")}</SelectItem>
                <SelectItem value="immobile">{tr("Immobile")}</SelectItem>
                <SelectItem value="sede">{tr("Sede")}</SelectItem>
              </SelectContent>
            </Select>
            {tipo && (
              <>
                <Select value="" onValueChange={(dest) => { onCollega(tipo, dest, attuale ? (dal || oggi()) : (dal || null)); setTipo(""); setDal(""); }} disabled={occupato}>
                  <SelectTrigger className="h-7 w-48 text-xs" aria-label={tr("Scegli {tipo} per {codice}", { tipo: String(tipo ?? ""), codice: String(u.codice ?? "") })}><SelectValue placeholder={tr("Scegli {tipo}…", { tipo: String(tipo ?? "") })} /></SelectTrigger>
                  <SelectContent>{opzioni.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="date" className="h-7 w-36 text-xs" value={dal} max={oggi()} onChange={(e) => setDal(e.target.value)}
                  aria-label={tr("Vale dal ({codice})", { codice: String(u.codice ?? "") })} title={attuale ? tr("Da quando vale la nuova destinazione (vuoto: da oggi)") : tr("Vuoto: vale per tutte le bollette")} />
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
