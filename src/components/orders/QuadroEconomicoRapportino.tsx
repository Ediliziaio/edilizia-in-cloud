/**
 * I soldi del rapportino: per persona ore, costo orario e costo; per i mezzi ore × costo orario; le voci
 * aggiunte dall'ufficio col prezzo del listino. Il permesso lo controlla il database.
 *
 * 14/11/2026 (piano rapportini/listini, Fasi 2 e 3):
 * - «Aggiungi voce» cerca nel listino generale (codice, descrizione, categoria, unità) e propone il prezzo
 *   della regola: eccezione di cantiere, listino del committente, listino generale, altrimenti «da definire».
 *   Il rapportino salva prezzo, provenienza e modifica a mano: cambiare il listino dopo non lo tocca.
 * - Un costo orario mancante (operaio o mezzo) non vale 0 €: «costo da completare», margine incompleto.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useCatalogoVociRapportino } from "@/hooks/useCatalogoVociRapportino";
import { formatCurrency } from "@/lib/formatters";
import {
  etichettaPrezzo, prezzoModificatoAMano, totaliQuadro,
  type FontePrezzo, type MancanzaCosto, type VoceListino,
} from "@/lib/campo/prezzoVoceRapportino";

interface Riga {
  emp: string | null; nome: string; ditta: boolean; ore: number; costo_orario: number | null; costo: number | null;
  unita: string | null; quantita: number | null; prezzo: number | null; ricavo: number | null;
}
interface Voce {
  id: string; descrizione: string; quantita: number; unita: string; costo_unitario: number | null; vendita_unitaria: number | null;
  codice?: string | null; prezzo_fonte?: FontePrezzo | null; vendita_proposta?: number | null; prezzo_a_mano?: boolean | null;
}
interface Mezzo { mezzo_id: string; nome: string | null; noleggio: boolean; ore: number; ore_stimate: boolean; costo_orario: number | null; importo: number | null }
interface Quadro {
  personale_aggregato?: { costo: number | null }; persone: Riga[]; voci?: Voce[]; mezzi?: Mezzo[];
  costo_da_completare?: MancanzaCosto[]; appalto: boolean; a_corpo: boolean; registrato: boolean;
}

const ore = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
const euro = (n: number | null | undefined) => (n == null ? "—" : formatCurrency(Number(n)));
const UNITA: Record<string, string> = { ora: "/h", giornata: "/giorno", uomo_giorno: "/giorno" };
const COLORE_FONTE: Record<FontePrezzo, string> = {
  cantiere: "text-violet-700", committente: "text-blue-800", generale: "text-slate-600", mancante: "text-amber-700",
};

const numero = (v: string) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const testoNumero = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
type Bozza = { descrizione: string; quantita: string; unita: string; costo: string; vendita: string; voce: VoceListino | null };
const VUOTA: Bozza = { descrizione: "", quantita: "1", unita: "cad", costo: "", vendita: "", voce: null };

// Le funzioni nuove non sono ancora nei tipi generati.
const rpc = (supabase as unknown as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: Error | null }> }).rpc.bind(supabase);

/** Cerca nel listino generale dell'azienda, col prezzo già deciso dalla regola per la commessa del rapportino. */
function CercaNelListino({ rapportinoId, onScegli }: { rapportinoId: string; onScegli: (v: VoceListino) => void }) {
  const [testo, setTesto] = useState("");
  const [cercato, setCercato] = useState("");
  useEffect(() => { const t = setTimeout(() => setCercato(testo.trim()), 250); return () => clearTimeout(t); }, [testo]);
  const { data, isFetching, error } = useQuery({
    queryKey: ["rapportino-listino-cerca", rapportinoId, cercato],
    enabled: cercato.length >= 2,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await rpc("rapportino_listino_cerca", { p_rapportino_id: rapportinoId, p_testo: cercato, p_limite: 20 });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as VoceListino[];
    },
  });
  return (
    <div className="col-span-6 space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Cerca nel listino" placeholder="Cerca nel listino: codice, descrizione, categoria" className="h-8 pl-7 text-[13px]"
          value={testo} onChange={(e) => setTesto(e.target.value)} />
      </div>
      {cercato.length >= 2 && (
        <ul aria-label="Voci del listino" className="max-h-48 divide-y overflow-y-auto rounded-md border bg-background">
          {error && <li className="px-2 py-1.5 text-xs text-destructive">{error instanceof Error ? error.message : "Ricerca non riuscita"}</li>}
          {!error && !isFetching && (data ?? []).length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Nessuna voce del listino con «{cercato}»</li>}
          {(data ?? []).map((v) => (
            <li key={v.tariffa_id}>
              <button type="button" onClick={() => { onScegli(v); setTesto(""); setCercato(""); }}
                className="tap-compact grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-2 py-1.5 text-left hover:bg-muted/50">
                <span className="min-w-0 truncate text-[13px] font-medium">{v.codice ? <span className="mr-1 font-mono text-xs text-muted-foreground">{v.codice}</span> : null}{v.descrizione}</span>
                <span className="text-right text-[13px] tabular-nums">{"prezzo" in v ? (v.prezzo == null ? "—" : `${euro(v.prezzo)}/${v.unita}`) : v.unita}</span>
                <span className="truncate text-[11px] text-muted-foreground">{v.categoria ?? ""}</span>
                <span className={`text-right text-[11px] ${COLORE_FONTE[v.fonte]}`}>{etichettaPrezzo(v.fonte).replace("Prezzo applicato: ", "")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuadroEconomicoRapportino({ rapportinoId, puoModificare = false }: { rapportinoId: string; puoModificare?: boolean }) {
  const qc = useQueryClient();
  const permissions = usePermissions();
  const [nuova, setNuova] = useState<Bozza | null>(null);
  const chiave = ["rapportino-quadro-economico", rapportinoId];
  const db = supabase as unknown as { from: (t: string) => { insert: (r: object) => Promise<{ error: Error | null }>; delete: () => { eq: (c: string, v: string) => Promise<{ error: Error | null }> } } };
  const aggiorna = () => {
    void qc.invalidateQueries({ queryKey: chiave });
    void qc.invalidateQueries({ queryKey: ["appalto-rendiconto"] });
    void qc.invalidateQueries({ queryKey: ["commessa-costi-da-completare"] });
  };
  const aggiungi = useMutation({
    mutationFn: async (v: Bozza) => {
      // Dal listino: il prezzo proposto lo rifà il database; mandiamo solo quello scritto, se c'è.
      const { error } = await db.from("rapportino_voci_libere").insert({
        rapportino_id: rapportinoId, descrizione: v.descrizione.trim(), quantita: numero(v.quantita) || 1, unita: v.unita.trim() || "cad",
        costo_unitario: v.costo.trim() ? numero(v.costo) : null, vendita_unitaria: v.vendita.trim() ? numero(v.vendita) : null,
        ...(v.voce ? { tariffa_id: v.voce.tariffa_id } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => { setNuova(null); aggiorna(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Voce non salvata"),
  });
  const togli = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("rapportino_voci_libere").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Voce non tolta"),
  });
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data: catalogo } = useCatalogoVociRapportino(companyId, puoModificare);
  const vociPronte = Array.isArray(catalogo?.voci) ? catalogo!.voci : [];
  const aMano = catalogo?.aMano ?? true;
  const puoAggiungere = puoModificare;
  const vedeImporti = permissions.canViewOrderAmounts;
  const { data } = useQuery({
    queryKey: chiave,
    queryFn: async () => {
      const { data, error } = await rpc("rapportino_quadro_economico", { p_rapportino_id: rapportinoId });
      if (error) throw error;
      return data as Quadro | null;
    },
    retry: false,
  });
  if (!data || !Array.isArray(data.persone) || (!data.persone.length && !data.voci?.length && !data.personale_aggregato && !puoModificare)) return null;

  const voci = data.voci ?? [];
  const mezzi = Array.isArray(data.mezzi) ? data.mezzi : [];
  const mancanze = Array.isArray(data.costo_da_completare) ? data.costo_da_completare : [];
  const conVendita = vedeImporti && ((data.appalto && !data.a_corpo) || voci.some((v) => Number(v.vendita_unitaria ?? 0) > 0 || v.prezzo_fonte));
  const costoVoce = (v: Voce) => (v.costo_unitario == null ? null : Number(v.quantita) * Number(v.costo_unitario));
  const ricavoVoce = (v: Voce) => (v.vendita_unitaria == null ? null : Number(v.quantita) * Number(v.vendita_unitaria));
  const tot = totaliQuadro({
    persone: data.persone, mezzi, voci,
    personaleAggregato: data.personale_aggregato?.costo ?? null, costoDaCompletare: mancanze,
  });
  const totOre = data.persone.reduce((s, r) => s + Number(r.ore), 0);
  const margine = (r: Riga) => (r.ricavo == null || r.costo == null ? null : Number(r.ricavo) - Number(r.costo));

  const scegliDalListino = (v: VoceListino) => setNuova((n) => ({
    ...(n ?? VUOTA), voce: v, descrizione: v.descrizione, unita: v.unita,
    costo: testoNumero(v.costo_unitario), vendita: testoNumero(v.prezzo),
  }));
  const venditaScritta = nuova && nuova.vendita.trim() ? numero(nuova.vendita) : null;
  const aManoNuova = !!nuova?.voce && "prezzo" in nuova.voce && venditaScritta != null && prezzoModificatoAMano(venditaScritta, nuova.voce.prezzo ?? null);

  return (
    <section aria-label="Costi del rapportino" className="rounded-lg border text-[13px]">
      <h3 className="border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {data.registrato ? "Costi registrati" : "Costi stimati"}
      </h3>
      {mancanze.length > 0 && (
        <div role="status" className="flex gap-2 border-b bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p><strong>Costo da completare</strong>: {mancanze.map((m) => `${m.nome} (${m.motivo})`).join(", ")}. Il costo del giorno è parziale e il margine non si calcola.</p>
        </div>
      )}
      {data.personale_aggregato && <p className="flex justify-between border-b px-3 py-2"><span>Personale interno · costo aggregato</span><strong>{euro(data.personale_aggregato.costo)}</strong></p>}
      <ul className="divide-y">
        {data.persone.map((r, i) => (
          <li key={`${r.emp ?? r.nome}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-1.5">
            <span className="min-w-0 truncate font-medium text-slate-900">{r.nome}</span>
            <span className={`text-right tabular-nums font-semibold ${!r.ditta && r.costo == null ? "text-amber-700" : ""}`}>
              {r.ditta ? "Da contratto" : r.costo == null ? "Costo da completare" : euro(r.costo)}
            </span>
            <span className="text-xs text-muted-foreground">
              {ore(Number(r.ore))}{r.costo_orario ? ` × ${euro(r.costo_orario)}/h` : r.ditta ? "" : r.emp ? " · costo orario mancante" : " · senza scheda dipendente"}
            </span>
            <span className="text-right text-xs text-muted-foreground">costo</span>
            {conVendita && (
              <>
                <span className="text-xs text-blue-800">
                  {r.prezzo != null ? `Vendita ${euro(r.prezzo)}${UNITA[r.unita ?? ""] ?? ""} · ricavo ${euro(r.ricavo)}` : "Vendita da impostare"}
                </span>
                <span className={`text-right text-xs font-semibold tabular-nums ${(margine(r) ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {!permissions.canViewMargins || margine(r) == null ? "" : `margine ${euro(margine(r))}`}
                </span>
              </>
            )}
          </li>
        ))}
        {mezzi.map((m) => (
          <li key={m.mezzo_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-1.5">
            <span className="min-w-0 truncate font-medium text-slate-900">{m.nome ?? "Mezzo"}</span>
            <span className={`text-right tabular-nums font-semibold ${!m.noleggio && m.importo == null ? "text-amber-700" : ""}`}>
              {m.noleggio ? "Da fattura" : m.importo == null ? "Costo da completare" : euro(m.importo)}
            </span>
            <span className="text-xs text-muted-foreground">
              {ore(Number(m.ore))}{m.ore_stimate ? " stimate" : ""}{m.noleggio ? " · noleggio" : m.costo_orario != null ? ` × ${euro(m.costo_orario)}/h` : " · costo orario mancante"}
            </span>
            <span className="text-right text-xs text-muted-foreground">{m.noleggio ? "" : "quota interna"}</span>
          </li>
        ))}
        {voci.map((v) => (
          <li key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-1.5">
            <span className="min-w-0 truncate font-medium text-slate-900">
              {v.codice ? <span className="mr-1 font-mono text-xs text-muted-foreground">{v.codice}</span> : null}{v.descrizione}
            </span>
            <span className="flex items-center justify-end gap-1 tabular-nums font-semibold">
              {costoVoce(v) == null ? <span className="font-normal text-muted-foreground">costo —</span> : euro(costoVoce(v))}
              {puoModificare && (
                <button type="button" aria-label={`Togli ${v.descrizione}`} disabled={togli.isPending} onClick={() => togli.mutate(v.id)}
                  className="tap-compact rounded p-0.5 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{Number(v.quantita).toLocaleString("it-IT")} {v.unita}{v.costo_unitario != null ? ` × ${euro(v.costo_unitario)}` : ""}</span>
            <span className="text-right text-xs text-blue-800">{ricavoVoce(v) != null && vedeImporti ? `ricavo ${euro(ricavoVoce(v))}` : ""}</span>
            {vedeImporti && v.prezzo_fonte !== undefined && (
              <span className={`col-span-2 text-[11px] ${v.prezzo_fonte ? COLORE_FONTE[v.prezzo_fonte] : "text-muted-foreground"}`}>
                {v.prezzo_fonte === "mancante" && v.vendita_unitaria == null ? "Prezzo da definire" : etichettaPrezzo(v.prezzo_fonte)}
                {v.prezzo_a_mano && v.prezzo_fonte ? ` · modificato a mano${v.vendita_proposta != null ? ` (listino ${euro(v.vendita_proposta)})` : ""}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      {puoAggiungere && (nuova ? (
        <form className="grid grid-cols-6 gap-1.5 border-t p-2" onSubmit={(e) => { e.preventDefault(); if (nuova.descrizione.trim()) aggiungi.mutate(nuova); }}>
          <CercaNelListino rapportinoId={rapportinoId} onScegli={scegliDalListino} />
          {nuova.voce && (
            <p className="col-span-6 flex flex-wrap items-center gap-x-2 text-xs">
              <span className="font-medium">{nuova.voce.codice ? `${nuova.voce.codice} · ` : ""}{nuova.voce.descrizione}</span>
              {vedeImporti && <span className={COLORE_FONTE[nuova.voce.fonte]}>{etichettaPrezzo(nuova.voce.fonte)}{nuova.voce.prezzo != null ? ` ${euro(nuova.voce.prezzo)}` : ""}</span>}
              {aManoNuova && <span className="text-amber-700">· prezzo modificato a mano</span>}
              <button type="button" className="text-muted-foreground underline" onClick={() => setNuova({ ...VUOTA })}>cambia</button>
            </p>
          )}
          {!nuova.voce && vociPronte.length > 0 && (
            <select aria-label="Scegli la voce" className="col-span-6 h-8 rounded-md border bg-background px-2 text-[13px]" value={vociPronte.find((v) => v.nome === nuova.descrizione)?.id ?? ""}
              onChange={(e) => { const v = vociPronte.find((x) => x.id === e.target.value); setNuova(v ? { ...nuova, descrizione: v.nome, unita: v.unita, costo: v.costo_unitario?.toString() ?? "", vendita: v.vendita_unitaria?.toString() ?? "" } : { ...nuova, descrizione: "" }); }}>
              <option value="">{aMano ? "Voci del rapportino, o scrivila sotto" : "Voci del rapportino"}</option>
              {vociPronte.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          )}
          {!nuova.voce && aMano && <Input aria-label="Descrizione voce" placeholder="Oppure scrivi la voce (es. trasporto, nolo)" className="col-span-6 h-8 text-[13px]" value={nuova.descrizione} onChange={(e) => setNuova({ ...nuova, descrizione: e.target.value })} />}
          <Input aria-label="Quantità" inputMode="decimal" placeholder="Q.tà" className="col-span-1 h-8 px-1.5 text-[13px]" value={nuova.quantita} onChange={(e) => setNuova({ ...nuova, quantita: e.target.value })} />
          <Input aria-label="Unità" placeholder="Unità" className="col-span-1 h-8 px-1.5 text-[13px]" value={nuova.unita} onChange={(e) => setNuova({ ...nuova, unita: e.target.value })} />
          <Input aria-label="Costo unitario" inputMode="decimal" placeholder="Costo €" className="col-span-2 h-8 text-[13px]" value={nuova.costo} onChange={(e) => setNuova({ ...nuova, costo: e.target.value })} />
          {vedeImporti ? (
            <Input aria-label="Vendita unitaria" inputMode="decimal" placeholder={nuova.voce?.fonte === "mancante" ? "Prezzo da definire" : "Vendita €"} className="col-span-2 h-8 text-[13px]" value={nuova.vendita} onChange={(e) => setNuova({ ...nuova, vendita: e.target.value })} />
          ) : <span className="col-span-2 self-center text-[11px] text-muted-foreground">{nuova.voce ? "Prezzo dal listino" : ""}</span>}
          <div className="col-span-6 flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setNuova(null)}>Annulla</Button>
            <Button type="submit" size="sm" className="h-7" disabled={aggiungi.isPending || !nuova.descrizione.trim() || (!nuova.voce && !aMano && !vociPronte.some((v) => v.nome === nuova.descrizione))}>Aggiungi</Button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setNuova({ ...VUOTA })} className="tap-compact flex w-full items-center gap-1 border-t px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-muted/40">
          <Plus className="h-3.5 w-3.5" /> Aggiungi voce
        </button>
      ))}
      <dl className={`grid gap-2 border-t bg-muted/40 px-3 py-1.5 tabular-nums ${conVendita ? "grid-cols-4" : "grid-cols-2"}`}>
        <div><dt className="text-[11px] text-muted-foreground">Ore</dt><dd className="font-semibold">{ore(totOre)}</dd></div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Costo{tot.completo ? "" : " (parziale)"}</dt>
          <dd className={`font-semibold ${tot.completo ? "" : "text-amber-700"}`}>{euro(tot.costo)}</dd>
        </div>
        {conVendita && <div><dt className="text-[11px] text-muted-foreground">Ricavo</dt><dd className="font-semibold">{euro(tot.ricavo)}</dd></div>}
        {conVendita && permissions.canViewMargins && (
          <div>
            <dt className="text-[11px] text-muted-foreground">Margine</dt>
            {tot.margine == null
              ? <dd className="text-xs font-semibold text-amber-700">Incompleto: mancano {tot.mancano} costi</dd>
              : <dd className={`font-semibold ${tot.margine < 0 ? "text-red-700" : "text-emerald-700"}`}>{euro(tot.margine)}</dd>}
          </div>
        )}
      </dl>
    </section>
  );
}
