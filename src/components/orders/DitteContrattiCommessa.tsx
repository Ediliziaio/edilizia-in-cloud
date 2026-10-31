/**
 * Ditte, listino e contratti della commessa (31/10/2026, Dimora Torino).
 *
 * In un posto solo, fase per fase:
 *   · le voci del lavoro (dal computo, dal preventivo o aggiunte dal listino
 *     manodopera quando la fase è nata a mano) e quanto costano;
 *   · la ditta: quella assegnata, o quella proposta dalle commesse passate
 *     (chi ha sempre fatto quel lavoro), col costo previsto dalle voci;
 *   · per ogni ditta, il contratto di subappalto con l'elenco dei lavori
 *     (Allegato A) e gli importi da accettare, in PDF.
 * Il contratto nasce in bozza: firma, SAL e pagamenti restano nella scheda del
 * subappaltatore, dove c'erano già.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSignature, FileText, Loader2, Plus, Trash2, Users, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { chiaveVociPreviste, useVociPrevisteFasi } from "@/hooks/useVociPrevisteFasi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { costoTariffa, unitaTariffa } from "@/lib/listino/costoTariffa";
import { conIva, type VarianteCostoDitta } from "@/lib/orders/costoDitta";
import {
  contrattoDellaDitta, costoFaseDitta, dittaProposta, elencoDaSalvare, elencoLavoriDitta, periodoFasi, prezzoListinoPerDitta,
  rigaElencoRicalcolata, schedeSicurezzaDitta,
  type FaseStorica, type SchedaSicurezza,
} from "@/lib/orders/ditteLavori";
import { vesteContratto } from "@/lib/subappaltatori/vesteContratto";
import { totaleElencoLavori, type DatiContrattoSubappalto, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

// Tabelle recenti, non ancora tutte nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Fase { id: string; name: string; position: number | null; start_date: string | null; end_date: string | null }
interface Assegnazione { id: string; external_team_id: string | null; phase_id: string | null; cost_preventivo: number | null; vat_rate: number | null }
interface Ditta { id: string; name: string; vat_rate: number | null; subappaltatore_id: string | null }
interface Tariffa { id: string; nome: string; codice: string | null; unita: string; costo: number }
interface Contratto { id: string; subappaltatore_id: string; stato: string; numero_contratto: string | null; importo_contrattuale: number; firmato_il: string | null; elenco_lavori: unknown }
/** La scheda sicurezza della ditta: è lei che il contratto nomina, e ha i dati per il PDF. */
interface SchedaSic extends SchedaSicurezza { ragione_sociale: string; piva: string | null; indirizzo: string | null; email: string | null; pec: string | null }
const COLONNE_SCHEDA = "id, campo_subappaltatore_id, order_id, created_at, ragione_sociale, piva, indirizzo, email, pec";
const COLONNE_SCHEDA_PDF = "ragione_sociale, piva, codice_fiscale, indirizzo, email, pec, telefono, responsabile";

const oggi = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

export function DitteContrattiCommessa({ orderId, aperto: apertoFuori, onAperto }: {
  orderId: string;
  /** Aperto da fuori: Silvio delle fasi porta qui per ditte, costi e voci dal listino. */
  aperto?: boolean; onAperto?: (v: boolean) => void;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canEditOrders, canViewCosts } = usePermissions();
  const [apertoDentro, setApertoDentro] = useState(false);
  const aperto = apertoFuori ?? apertoDentro;
  const setAperto = (v: boolean) => { setApertoDentro(v); onAperto?.(v); };
  if (!canEditOrders || !canViewCosts) return null;
  return (
    <>
      <Button variant="ghost" size="sm" className="h-8" onClick={() => setAperto(true)}>
        <Users className="mr-1.5 h-4 w-4" />Ditte e contratti
      </Button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Ditte, listino e contratti</DialogTitle>
            <DialogDescription>
              Per ogni fase: i lavori dal listino, chi li fa e quanto costano. Poi, per ogni ditta, il contratto con l’elenco dei lavori.
            </DialogDescription>
          </DialogHeader>
          {aperto && companyId && <Contenuto orderId={orderId} companyId={companyId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Contenuto({ orderId, companyId }: { orderId: string; companyId: string }) {
  const qc = useQueryClient();
  const voci = useVociPrevisteFasi(orderId, true);
  const dati = useQuery({
    queryKey: ["ditte-contratti-commessa", companyId, orderId],
    queryFn: async () => {
      const [fasi, assegnazioni, ditte, storico, varianti, contratti, schede] = await Promise.all([
        db.from("order_work_phases").select("id, name, position, start_date, end_date").eq("order_id", orderId).eq("company_id", companyId).order("position"),
        db.from("order_external_teams").select("id, external_team_id, phase_id, cost_preventivo, vat_rate").eq("order_id", orderId),
        db.from("external_teams").select("id, name, vat_rate, subappaltatore_id, kind, is_active").eq("company_id", companyId).eq("is_active", true).order("name"),
        // Le fasi date alle ditte nelle altre commesse: chi fa sempre quel lavoro.
        db.from("order_external_teams").select("external_team_id, fase:order_work_phases(name), ordine:orders!inner(company_id)")
          .eq("ordine.company_id", companyId).neq("order_id", orderId).not("phase_id", "is", null).limit(3000),
        db.from("tariffa_costi_varianti").select("tariffa_id, external_team_id, costo, is_default, attivo, sort_order").eq("company_id", companyId),
        db.from("contratti_subappalto").select("id, subappaltatore_id, stato, numero_contratto, importo_contrattuale, firmato_il, elenco_lavori").eq("order_id", orderId).eq("company_id", companyId),
        db.from("subappaltatori_sicurezza").select(COLONNE_SCHEDA).eq("company_id", companyId).not("campo_subappaltatore_id", "is", null),
      ]);
      for (const r of [fasi, assegnazioni, ditte, storico, varianti, contratti, schede]) if (r.error) throw r.error;
      return {
        fasi: (fasi.data ?? []) as Fase[],
        assegnazioni: (assegnazioni.data ?? []) as Assegnazione[],
        ditte: ((ditte.data ?? []) as Array<Ditta & { kind: string }>).filter((d) => d.kind !== "interna"),
        storico: ((storico.data ?? []) as Array<{ external_team_id: string | null; fase: { name: string } | null }>)
          .filter((s) => s.external_team_id && s.fase?.name)
          .map((s) => ({ external_team_id: s.external_team_id!, fase: s.fase!.name })) as FaseStorica[],
        varianti: (varianti.data ?? []) as VarianteCostoDitta[],
        contratti: (contratti.data ?? []) as Contratto[],
        schede: (schede.data ?? []) as SchedaSic[],
      };
    },
  });
  const tariffe = useQuery({
    queryKey: ["listino-manodopera-voci", companyId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Tariffa[]> => {
      const { data, error } = await db.from("tariffe_aziendali")
        .select("id, nome, codice, unita, unita_fatturazione, prezzo_costo, costo_interno, costo_default, attiva, attivo")
        .eq("company_id", companyId).order("nome").limit(5000);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>)
        .filter((t) => t.attiva !== false && t.attivo !== false)
        .map((t) => ({
          id: t.id as string, nome: (t.nome as string) ?? "", codice: (t.codice as string | null) ?? null,
          unita: unitaTariffa(t as never), costo: costoTariffa(t as never) ?? 0,
        }));
    },
  });

  const [scelte, setScelte] = useState<Record<string, string>>({});
  const [vociAperte, setVociAperte] = useState<string | null>(null);
  const invalida = () => {
    void qc.invalidateQueries({ queryKey: ["ditte-contratti-commessa", companyId, orderId] });
    void qc.invalidateQueries({ queryKey: chiaveVociPreviste(companyId, orderId) });
    void qc.invalidateQueries({ queryKey: ["order-work-phases"] });
    void qc.invalidateQueries({ queryKey: ["order-assignments"] });
  };

  const d = dati.data;
  const listaVoci = useMemo(() => voci.data ?? [], [voci.data]);
  const nomeDitta = (id: string | null) => d?.ditte.find((x) => x.id === id)?.name ?? "Ditta";

  // Fase per fase: ditte assegnate, ditta proposta e costo previsto dalle voci.
  const righe = useMemo(() => (d ? d.fasi.map((f) => {
    const assegnate = d.assegnazioni.filter((a) => a.phase_id === f.id && a.external_team_id);
    const proposta = assegnate.length ? null : dittaProposta(f.name, d.storico);
    const dittaId = assegnate[0]?.external_team_id ?? scelte[f.id] ?? proposta?.external_team_id ?? "";
    const costo = costoFaseDitta(f.id, listaVoci, dittaId || null, d.varianti);
    const nVoci = listaVoci.filter((v) => v.phase_id === f.id).length;
    // Assegnata ma senza previsto: lo si può prendere dalle voci.
    const senzaPrevisto = assegnate.filter((a) => !Number(a.cost_preventivo));
    return { f, assegnate, proposta, dittaId, costo, nVoci, senzaPrevisto };
  }) : []), [d, listaVoci, scelte]);

  const daApplicare = righe.filter((r) => (!r.assegnate.length && r.dittaId) || (r.senzaPrevisto.length === 1 && r.assegnate.length === 1 && r.costo > 0));

  const applica = useMutation({
    mutationFn: async () => {
      for (const r of daApplicare) {
        const ditta = d!.ditte.find((x) => x.id === r.dittaId);
        const previsto = r.costo > 0 ? conIva(r.costo, ditta?.vat_rate ?? 0) : 0;
        if (!r.assegnate.length) {
          const { error } = await db.from("order_external_teams").insert({
            order_id: orderId, external_team_id: r.dittaId, phase_id: r.f.id, total_cost: 0, cost_preventivo: previsto, is_paid: false,
            ...(previsto > 0 ? { costo_origine: "preventivo" } : {}),
          });
          if (error) throw error;
        } else {
          const { error } = await db.from("order_external_teams").update({ cost_preventivo: previsto, costo_origine: "preventivo" }).eq("id", r.senzaPrevisto[0].id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => { toast.success("Ditte e costi previsti assegnati"); setScelte({}); invalida(); },
    onError: (e: Error) => toast.error(`Non ho assegnato le ditte: ${e.message}`),
  });

  if (dati.isLoading || voci.isLoading) return <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin" />;
  if (dati.isError || voci.isError || !d)
    return <p role="alert" className="text-sm text-destructive">Non riesco a caricare fasi e ditte. <button className="underline" onClick={() => { void dati.refetch(); void voci.refetch(); }}>Riprova</button></p>;
  if (!d.fasi.length) return <p className="text-sm text-muted-foreground">La commessa non ha ancora fasi.</p>;

  // Le ditte della commessa, per i contratti.
  const ditteCommessa = [...new Set(d.assegnazioni.map((a) => a.external_team_id).filter((x): x is string => !!x))]
    .map((id) => ({ id, fasi: d.assegnazioni.filter((a) => a.external_team_id === id && a.phase_id).map((a) => a.phase_id!) }));

  return (
    <div className="space-y-5">
      <section aria-label="Fasi, voci e ditte" className="space-y-2">
        <ul className="divide-y rounded-lg border">
          {righe.map((r) => (
            <li key={r.f.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.f.name}</p>
                  <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => setVociAperte(vociAperte === r.f.id ? null : r.f.id)}>
                    {r.nVoci ? `${r.nVoci} ${r.nVoci === 1 ? "voce" : "voci"} · lavoro ${formatCurrency(r.costo)}` : "Nessuna voce: aggiungile dal listino"}
                  </button>
                </div>
                <div className="flex min-w-[16rem] flex-wrap items-center justify-end gap-2">
                  {r.assegnate.length ? (
                    <div className="text-right text-xs">
                      {r.assegnate.map((a) => (
                        <p key={a.id}>
                          <span className="font-medium">{nomeDitta(a.external_team_id)}</span>
                          {" · "}{Number(a.cost_preventivo) ? `previsto ${formatCurrency(Number(a.cost_preventivo))}` : <span className="text-amber-800">senza previsto{r.costo > 0 && r.assegnate.length === 1 ? ` → ${formatCurrency(r.costo)}` : ""}</span>}
                          {/* Previsto scritto diverso dalle voci: resta quello scritto, un pallino lo segnala. */}
                          {r.assegnate.length === 1 && Number(a.cost_preventivo) > 0 && r.costo > 0
                            && Math.abs(conIva(r.costo, a.vat_rate ?? 0) - Number(a.cost_preventivo)) > Math.max(1, r.costo * 0.01) && (
                            <span role="img" aria-label={`Diverso dalle voci: a listino ${formatCurrency(r.costo)}`} title={`Le voci valgono ${formatCurrency(r.costo)} a listino: resta il previsto scritto`}
                              className="ml-1 inline-block h-2 w-2 rounded-full bg-red-600 align-middle" />
                          )}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <>
                      <select
                        aria-label={`Ditta per ${r.f.name}`}
                        className="h-9 max-w-[14rem] rounded-md border bg-background px-2 text-sm"
                        value={r.dittaId}
                        onChange={(e) => setScelte((s) => ({ ...s, [r.f.id]: e.target.value }))}
                      >
                        <option value="">Nessuna ditta</option>
                        {d.ditte.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      {r.proposta && r.dittaId === r.proposta.external_team_id && (
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[11px] text-sky-900" title={`Ha fatto «${r.proposta.come}» in altre commesse`}>
                          <Wand2 className="mr-1 h-3 w-3" />come in «{r.proposta.come}»
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </div>
              {vociAperte === r.f.id && (
                <VociFase orderId={orderId} companyId={companyId} fase={r.f} voci={listaVoci.filter((v) => v.phase_id === r.f.id)} tariffe={tariffe.data ?? []} caricoTariffe={tariffe.isLoading} onCambio={invalida} />
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Il costo previsto è quantità × prezzo del listino (o della variante della ditta), senza IVA: il subappalto è in reverse charge.
          </p>
          <Button size="sm" disabled={!daApplicare.length || applica.isPending} onClick={() => applica.mutate()}>
            {applica.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
            {daApplicare.length ? `Assegna ditte e costi (${daApplicare.length})` : "Ditte e costi già a posto"}
          </Button>
        </div>
      </section>

      <section aria-label="Contratti delle ditte" className="space-y-2">
        <h3 className="text-sm font-semibold">Contratti di subappalto</h3>
        {!ditteCommessa.length ? (
          <p className="text-sm text-muted-foreground">Assegna prima le ditte alle fasi.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {ditteCommessa.map((x) => (
              <ContrattoDitta
                key={x.id}
                orderId={orderId}
                companyId={companyId}
                ditta={d.ditte.find((t) => t.id === x.id) ?? { id: x.id, name: nomeDitta(x.id), vat_rate: 0, subappaltatore_id: null }}
                elenco={elencoLavoriDitta(d.fasi, listaVoci, x.fasi, x.id, d.varianti)}
                periodo={periodoFasi(d.fasi, x.fasi)}
                nomiFasi={d.fasi.filter((f) => x.fasi.includes(f.id)).map((f) => f.name)}
                contratto={contrattoDellaDitta(d.ditte.find((t) => t.id === x.id)?.subappaltatore_id ?? null, d.contratti, d.schede)}
                schede={schedeSicurezzaDitta(d.ditte.find((t) => t.id === x.id)?.subappaltatore_id ?? null, d.schede, orderId)}
                tariffe={tariffe.data ?? []}
                varianti={d.varianti}
                onCambio={invalida}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Le voci di una fase, con l'aggiunta dal listino manodopera. */
function VociFase({ orderId, companyId, fase, voci, tariffe, caricoTariffe, onCambio }: {
  orderId: string; companyId: string; fase: Fase;
  voci: Array<{ id: string; descrizione: string; unita: string | null; quantita: number; costo_manodopera: number; origine: string; origine_codice: string | null }>;
  tariffe: Tariffa[]; caricoTariffe: boolean; onCambio: () => void;
}) {
  const [cerca, setCerca] = useState("");
  const [scelta, setScelta] = useState<Tariffa | null>(null);
  const [quantita, setQuantita] = useState("1");
  const trovate = cerca.trim().length < 2 ? [] : tariffe
    .filter((t) => `${t.codice ?? ""} ${t.nome}`.toLowerCase().includes(cerca.trim().toLowerCase())).slice(0, 8);
  const q = Number(quantita.replace(",", "."));
  const aggiungi = useMutation({
    mutationFn: async () => {
      if (!scelta || !(q > 0)) throw new Error("Scegli la voce e la quantità");
      const { error } = await db.from("order_work_phase_voci").insert({
        company_id: companyId, order_id: orderId, phase_id: fase.id, position: voci.length + 1,
        descrizione: scelta.nome, unita: scelta.unita, quantita: q, costo_manodopera: scelta.costo, costo_materiali: 0,
        tariffa_id: scelta.id, origine: "listino", origine_id: crypto.randomUUID(), origine_codice: scelta.codice,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Voce aggiunta dal listino"); setScelta(null); setCerca(""); setQuantita("1"); onCambio(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const togli = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_work_phase_voci").delete().eq("id", id).eq("origine", "listino");
      if (error) throw error;
    },
    onSuccess: onCambio,
    onError: (e: Error) => toast.error(`Voce non tolta: ${e.message}`),
  });
  return (
    <div className="space-y-2 rounded-lg bg-muted/30 p-2.5">
      {voci.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {voci.map((v) => (
              <tr key={v.id} className="border-b last:border-0">
                <td className="py-1 pr-2">{v.origine_codice ? <span className="text-muted-foreground">{v.origine_codice} · </span> : null}{v.descrizione}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums">{v.quantita.toLocaleString("it-IT", { maximumFractionDigits: 3 })} {v.unita ?? ""}</td>
                <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums">{formatCurrency(v.costo_manodopera)}</td>
                <td className="whitespace-nowrap py-1 text-right tabular-nums">{formatCurrency(v.quantita * v.costo_manodopera)}</td>
                <td className="w-7 py-1 text-right">
                  {v.origine === "listino" && (
                    <button type="button" aria-label={`Togli ${v.descrizione}`} className="text-muted-foreground hover:text-destructive" disabled={togli.isPending} onClick={() => togli.mutate(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Input aria-label={`Cerca nel listino per ${fase.name}`} placeholder={caricoTariffe ? "Carico il listino…" : "Cerca nel listino (nome o codice)"} value={scelta ? `${scelta.codice ? `${scelta.codice} · ` : ""}${scelta.nome}` : cerca}
            onChange={(e) => { setScelta(null); setCerca(e.target.value); }} className="h-9" />
          {!scelta && trovate.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover text-sm shadow" role="listbox">
              {trovate.map((t) => (
                <li key={t.id} role="option" aria-selected={false}>
                  <button type="button" className="flex w-full justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted" onClick={() => setScelta(t)}>
                    <span className="min-w-0 truncate">{t.codice ? `${t.codice} · ` : ""}{t.nome}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(t.costo)}/{t.unita}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Input aria-label="Quantità" className="h-9 w-24" inputMode="decimal" value={quantita} onChange={(e) => setQuantita(e.target.value)} />
        <Button size="sm" variant="outline" className="h-9" disabled={!scelta || !(q > 0) || aggiungi.isPending} onClick={() => aggiungi.mutate()}>
          <Plus className="mr-1 h-4 w-4" />Aggiungi{scelta && q > 0 ? ` · ${formatCurrency(scelta.costo * q)}` : ""}
        </Button>
      </div>
    </div>
  );
}

/** Il contratto di una ditta: crearlo in bozza con l'elenco dei lavori, aggiornarlo, scaricare il PDF. */
function ContrattoDitta({ orderId, companyId, ditta, elenco, periodo, nomiFasi, contratto, schede, tariffe, varianti, onCambio }: {
  orderId: string; companyId: string; ditta: Ditta; elenco: RigaElencoLavori[];
  periodo: { dal: string | null; al: string | null }; nomiFasi: string[]; contratto: Contratto | null; schede: SchedaSic[];
  tariffe: Tariffa[]; varianti: VarianteCostoDitta[]; onCambio: () => void;
}) {
  const totale = totaleElencoLavori(elenco);
  const modificabile = !contratto || (contratto.stato === "bozza" && !contratto.firmato_il);
  // Un contratto già attivo ma non firmato: l'elenco dei lavori si può ancora rivedere, l'importo pattuito no.
  const senzaElenco = !!contratto && !modificabile && !contratto.firmato_il;
  const elencoSalvato = contratto && Array.isArray(contratto.elenco_lavori) ? (contratto.elenco_lavori as RigaElencoLavori[]) : [];
  // L'elenco si rivede prima di salvarlo (Dimora, 31/10/2026): null = finestra chiusa.
  const [bozzaElenco, setBozzaElenco] = useState<RigaElencoLavori[] | null>(null);
  const apriElenco = () => setBozzaElenco((elencoSalvato.length ? elencoSalvato : elenco).map(conChiave));
  /** La scheda sicurezza per un contratto nuovo: se la ditta non ce l'ha, la si crea dalla scheda del campo. */
  const schedaPerContratto = async (): Promise<string> => {
    if (schede[0]) return schede[0].id;
    const { data: campo, error } = await db.from("subappaltatori")
      .select("ragione_sociale, piva, indirizzo, email, telefono, responsabile").eq("id", ditta.subappaltatore_id).maybeSingle();
    if (error) throw error;
    const { data: nuova, error: errNuova } = await db.from("subappaltatori_sicurezza").insert({
      company_id: companyId, campo_subappaltatore_id: ditta.subappaltatore_id,
      ragione_sociale: campo?.ragione_sociale || ditta.name, piva: campo?.piva ?? null, indirizzo: campo?.indirizzo ?? null,
      email: campo?.email ?? null, telefono: campo?.telefono ?? null, responsabile: campo?.responsabile ?? null,
    }).select("id").single();
    if (errNuova) throw errNuova;
    return nuova.id as string;
  };
  /** Numero proposto per un contratto nuovo: codice commessa e progressivo (es. O-0001/S02). Si cambia da «Modifica». */
  const numeroNuovoContratto = async (): Promise<string | null> => {
    const [{ data: ord }, { count }] = await Promise.all([
      db.from("orders").select("order_code").eq("id", orderId).maybeSingle(),
      db.from("contratti_subappalto").select("id", { count: "exact", head: true }).eq("order_id", orderId).eq("company_id", companyId),
    ]);
    return ord?.order_code ? `${ord.order_code}/S${String((count ?? 0) + 1).padStart(2, "0")}` : null;
  };
  const salva = useMutation({
    mutationFn: async (righeScelte: RigaElencoLavori[]) => {
      if (!ditta.subappaltatore_id) throw new Error("La ditta non è collegata a un subappaltatore: collegala dalla sua scheda.");
      const righe = elencoDaSalvare(righeScelte);
      if (!righe.length) throw new Error("L'elenco è vuoto: aggiungi almeno un lavoro con quantità e descrizione.");
      const campi = {
        descrizione_lavori: `Lavorazioni delle fasi: ${nomiFasi.join(", ")}.`,
        importo_contrattuale: totaleElencoLavori(righe), elenco_lavori: righe,
        data_inizio: periodo.dal, data_fine_prevista: periodo.al,
      };
      // Con una base lavori già registrata (quadro) l'importo non si tocca: il database lo vieta, serve una variante.
      let baseRegistrata = false;
      if (contratto && !senzaElenco) {
        const { count } = await db.from("subappalto_quadri_lavori").select("id", { count: "exact", head: true }).eq("contratto_id", contratto.id);
        baseRegistrata = (count ?? 0) > 0;
      }
      const soloElenco = senzaElenco || baseRegistrata;
      const q = contratto
        ? soloElenco
          ? db.from("contratti_subappalto").update(baseRegistrata ? { elenco_lavori: righe, data_inizio: periodo.dal, data_fine_prevista: periodo.al } : { elenco_lavori: righe }).eq("id", contratto.id).is("firmato_il", null)
          : db.from("contratti_subappalto").update(campi).eq("id", contratto.id).eq("stato", "bozza").is("firmato_il", null)
        : db.from("contratti_subappalto").insert({
            ...campi, company_id: companyId, subappaltatore_id: await schedaPerContratto(), order_id: orderId,
            numero_contratto: await numeroNuovoContratto(),
            stato: "bozza", ritenuta_garanzia_pct: 5, durata_garanzia_mesi: 12, oneri_sicurezza: 0, data_stipula: oggi(),
          });
      const { data: toccate, error } = await (contratto ? (q as { select: (c: string) => Promise<{ data: unknown[] | null; error: { message: string; code?: string } | null }> }).select("id") : q);
      if (error) throw new Error(error.code === "23514" ? "Il contratto ha una base lavori registrata: l'importo si cambia con «Variante», da «Condizioni e firma»." : error.message);
      if (contratto && !(toccate as unknown[] | null)?.length) throw new Error("Il contratto è cambiato nel frattempo (firmato o non più in bozza): ricarica la pagina e riprova.");
      return { baseRegistrata };
    },
    onSuccess: (esito) => {
      toast.success(!contratto ? "Contratto creato in bozza" : senzaElenco || esito?.baseRegistrata ? "Elenco dei lavori aggiornato (l'importo pattuito non cambia)" : "Contratto aggiornato con l'elenco dei lavori");
      setBozzaElenco(null);
      onCambio();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const scarica = useMutation({
    mutationFn: async () => {
      if (!contratto) return;
      const [{ data: c, error }, { data: sub }, { data: az }, veste] = await Promise.all([
        db.from("contratti_subappalto").select("*, commessa:orders!contratti_subappalto_order_id_fkey(order_code, description, work_address, client_name, client_company)").eq("id", contratto.id).single(),
        // I dati della ditta dalla scheda sicurezza del contratto (P.IVA, PEC): quella del campo spesso non li ha.
        db.from("subappaltatori_sicurezza").select(COLONNE_SCHEDA_PDF).eq("id", contratto.subappaltatore_id).maybeSingle(),
        db.from("anagrafica_azienda").select("ragione_sociale, partita_iva, codice_fiscale, telefono, email, indirizzo_via, indirizzo_numero_civico, indirizzo_cap, indirizzo_comune, indirizzo_provincia").eq("company_id", companyId).maybeSingle(),
        vesteContratto(companyId),
      ]);
      if (error) throw error;
      const indirizzo = az ? [[az.indirizzo_via, az.indirizzo_numero_civico].filter(Boolean).join(" "), [az.indirizzo_cap, az.indirizzo_comune, az.indirizzo_provincia ? `(${az.indirizzo_provincia})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
      const dati: DatiContrattoSubappalto = {
        numero: c.numero_contratto, dataStipula: c.data_stipula,
        committente: { ragioneSociale: az?.ragione_sociale ?? "", partitaIva: az?.partita_iva ?? "", indirizzo, rappresentante: c.responsabile_impresa ?? "",
          codiceFiscale: az?.codice_fiscale ?? "", telefono: az?.telefono ?? "", email: az?.email ?? "" },
        subappaltatore: { ragioneSociale: sub?.ragione_sociale ?? ditta.name, partitaIva: sub?.piva ?? "", indirizzo: sub?.indirizzo ?? "", email: sub?.email ?? "", pec: sub?.pec ?? "",
          codiceFiscale: sub?.codice_fiscale ?? "", telefono: sub?.telefono ?? "", responsabile: sub?.responsabile ?? "" },
        ivaPct: Number(ditta.vat_rate) || 0, veste,
        commessa: { codice: c.commessa?.order_code ?? "", descrizione: c.commessa?.description ?? "", indirizzoCantiere: c.commessa?.work_address ?? "", cliente: c.commessa?.client_company || c.commessa?.client_name || "" },
        descrizioneLavori: c.descrizione_lavori, importo: Number(c.importo_contrattuale) || 0, oneriSicurezza: Number(c.oneri_sicurezza) || 0,
        ritenutaPct: Number(c.ritenuta_garanzia_pct) || 0, dataInizio: c.data_inizio, dataFinePrevista: c.data_fine_prevista,
        responsabileImpresa: c.responsabile_impresa, referenteSubappaltatore: c.referente_subappaltatore, obblighi: c.obblighi,
        modalitaPagamento: c.modalita_pagamento, penali: c.penali, garanzie: c.garanzie, durataGaranziaMesi: Number(c.durata_garanzia_mesi) || 12,
        note: c.note, elencoLavori: Array.isArray(c.elenco_lavori) ? c.elenco_lavori : [],
      };
      const { generaPdfContrattoSubappalto } = await import("@/components/subappaltatori/ContrattoSubappaltoPDF");
      const blob = await generaPdfContrattoSubappalto(dati);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contratto subappalto ${ditta.name} ${dati.commessa.codice}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onError: (e: Error) => toast.error(`PDF non generato: ${e.message}`),
  });
  /** L'elenco dei lavori senza cifre, da lasciare in cantiere (Dimora Torino, 31/10/2026). */
  const scaricaCantiere = useMutation({
    mutationFn: async () => {
      const righe = (elencoSalvato.length ? elencoSalvato : elenco);
      if (!righe.length) throw new Error("Non ci sono lavori da elencare.");
      const { generaPdfElencoCantiere } = await import("@/components/subappaltatori/ContrattoSubappaltoPDF");
      const [{ data: ord }, { data: az }] = await Promise.all([
        db.from("orders").select("order_code, work_address").eq("id", orderId).maybeSingle(),
        db.from("anagrafica_azienda").select("ragione_sociale").eq("company_id", companyId).maybeSingle(),
      ]);
      const blob = await generaPdfElencoCantiere({ committente: { ragioneSociale: az?.ragione_sociale ?? "", partitaIva: "", indirizzo: "", rappresentante: "" },
        subappaltatore: { ragioneSociale: ditta.name, partitaIva: "", indirizzo: "", email: "", pec: "" },
        commessa: { codice: ord?.order_code ?? "", descrizione: "", indirizzoCantiere: ord?.work_address ?? "", cliente: "" }, elencoLavori: righe,
        numero: null, dataStipula: null, descrizioneLavori: "", importo: 0, oneriSicurezza: 0, ritenutaPct: 0, dataInizio: null, dataFinePrevista: null,
        responsabileImpresa: null, referenteSubappaltatore: null, obblighi: null, modalitaPagamento: null, penali: null, garanzie: null, durataGaranziaMesi: 12, note: null });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Elenco lavori ${ditta.name}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onError: (e: Error) => toast.error(`PDF non generato: ${e.message}`),
  });
  const diverso = contratto && (modificabile || senzaElenco) && Math.abs(Number(contratto.importo_contrattuale) - totale) > 0.005;
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{ditta.name}</p>
        <p className="text-xs text-muted-foreground">
          {nomiFasi.join(", ")} · {elenco.length} {elenco.length === 1 ? "lavoro" : "lavori"} · {formatCurrency(totale)}
        </p>
        {contratto && (
          <p className="mt-0.5 text-xs">
            <Badge variant="outline" className="mr-1 text-[11px]">{contratto.firmato_il ? "Firmato" : contratto.stato === "bozza" ? "Bozza" : contratto.stato}</Badge>
            {formatCurrency(Number(contratto.importo_contrattuale) || 0)}
            {diverso && <span className="ml-1 text-amber-800">· i lavori ora valgono {formatCurrency(totale)}</span>}
          </p>
        )}
        {contratto?.firmato_il && <p className="mt-0.5 text-xs text-muted-foreground">Contratto firmato: lavori e prezzi non si modificano più. Per cambiare l'importo usa «Variante» da «Condizioni e firma».</p>}
        {!ditta.subappaltatore_id && <p className="mt-0.5 text-xs text-amber-800">Collega la ditta a un subappaltatore per fare il contratto.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {(modificabile || senzaElenco) && (
          <Button size="sm" variant={contratto ? "outline" : "default"} disabled={!ditta.subappaltatore_id || salva.isPending} onClick={apriElenco}
            title={senzaElenco ? "Rivedi l'elenco dei lavori allegato. L'importo pattuito non cambia." : "Rivedi lavori, quantità e prezzi prima di salvare il contratto."}>
            {salva.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSignature className="mr-1 h-4 w-4" />}
            {!contratto ? "Crea contratto…" : "Lavori e prezzi…"}
          </Button>
        )}
        {contratto && (
          <Button size="sm" variant="outline" disabled={scarica.isPending} onClick={() => scarica.mutate()}>
            {scarica.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}PDF
          </Button>
        )}
        {elenco.length > 0 && (
          <Button size="sm" variant="outline" disabled={scaricaCantiere.isPending} onClick={() => scaricaCantiere.mutate()}
            title="Lavori e quantità, senza prezzi: da lasciare in cantiere">
            {scaricaCantiere.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}Elenco cantiere
          </Button>
        )}
        {contratto && (
          <Button asChild size="sm" variant="ghost">
            {/* La scheda della sicurezza, quella del contratto: non la ditta del campo. */}
            <Link to={`/azienda/subappaltatori/${contratto.subappaltatore_id}?tab=contratto&contratto=${contratto.id}`}>Condizioni e firma</Link>
          </Button>
        )}
      </div>
      {bozzaElenco && (
        <ElencoLavoriDialog
          titolo={`${contratto ? "Lavori e prezzi del contratto" : "Nuovo contratto"} · ${ditta.name}`}
          righe={bozzaElenco}
          onRighe={setBozzaElenco}
          dalleVoci={elenco}
          fasi={nomiFasi}
          tariffe={tariffe}
          dittaId={ditta.id}
          varianti={varianti}
          importoPattuito={senzaElenco ? Number(contratto?.importo_contrattuale) || 0 : null}
          salvando={salva.isPending}
          etichettaSalva={!contratto ? "Crea il contratto in bozza" : "Salva l'elenco"}
          onSalva={() => salva.mutate(bozzaElenco)}
          onChiudi={() => !salva.isPending && setBozzaElenco(null)}
        />
      )}
    </li>
  );
}

// Una chiave fissa per riga nella finestra: senza, togliere una riga o scrivere nella descrizione
// rimontava gli input. Non si salva: elencoDaSalvare tiene solo i campi del contratto.
const chiavi = new WeakMap<RigaElencoLavori, string>();
let contaChiavi = 0;
const conChiave = (r: RigaElencoLavori): RigaElencoLavori => { const c = { ...r }; chiavi.set(c, `r${++contaChiavi}`); return c; };
const chiaveRiga = (r: RigaElencoLavori) => chiavi.get(r) ?? "";

/**
 * L'elenco dei lavori del contratto, da rivedere prima di salvarlo (Dimora Torino, 31/10/2026): parte dalle
 * voci delle fasi affidate alla ditta; si cambiano descrizioni, quantità e prezzi, si tolgono righe, se ne
 * aggiungono dal listino (col prezzo concordato con la ditta, se c'è, altrimenti il costo del listino) o a
 * mano. Le voci della commessa non cambiano: l'elenco è quello del contratto.
 */
export function ElencoLavoriDialog({ titolo, righe, onRighe, dalleVoci, fasi, tariffe, dittaId, varianti, importoPattuito, salvando, etichettaSalva, onSalva, onChiudi }: {
  titolo: string; righe: RigaElencoLavori[]; onRighe: (r: RigaElencoLavori[]) => void; dalleVoci: RigaElencoLavori[];
  fasi: string[]; tariffe: Tariffa[]; dittaId: string; varianti: VarianteCostoDitta[];
  importoPattuito: number | null; salvando: boolean; etichettaSalva: string; onSalva: () => void; onChiudi: () => void;
}) {
  const [cerca, setCerca] = useState("");
  const [faseNuova, setFaseNuova] = useState(fasi[0] ?? "Altri lavori");
  const trovate = cerca.trim().length < 2 ? [] : tariffe
    .filter((t) => `${t.codice ?? ""} ${t.nome}`.toLowerCase().includes(cerca.trim().toLowerCase())).slice(0, 8);
  const cambia = (i: number, patch: Partial<RigaElencoLavori>) =>
    onRighe(righe.map((r, j) => {
      if (j !== i) return r;
      const nuova = rigaElencoRicalcolata({ ...r, ...patch });
      chiavi.set(nuova, chiaveRiga(r));
      return nuova;
    }));
  // «1.234,5» all'italiana; «14.5» col punto resta 14,5 (non 145).
  const numero = (v: string) => {
    const t = v.trim().replace(/\s|€/g, "");
    return Math.max(0, Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0);
  };
  const aggiungiDalListino = (t: Tariffa) => {
    const { prezzo } = prezzoListinoPerDitta(t, dittaId, varianti);
    onRighe([...righe, conChiave(rigaElencoRicalcolata({ fase: faseNuova, descrizione: t.nome, unita: t.unita, quantita: 1, prezzo, importo: 0, codice: t.codice }))]);
    setCerca("");
  };
  const totale = totaleElencoLavori(elencoDaSalvare(righe));
  const fasiScelta = [...new Set([...fasi, ...righe.map((r) => r.fase), "Altri lavori"])];
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onChiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>
            Lavori, quantità e prezzi che la ditta accetta (Allegato A del contratto), senza IVA. Le voci della commessa non cambiano.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Lavorazione e descrizione</th>
                <th className="w-16 px-1 py-1.5 text-left font-medium">U.M.</th>
                <th className="w-24 px-1 py-1.5 text-right font-medium">Quantità</th>
                <th className="w-28 px-1 py-1.5 text-right font-medium">Prezzo €</th>
                <th className="w-28 px-2 py-1.5 text-right font-medium">Importo</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr key={chiaveRiga(r)} className="border-t align-top">
                  <td className="px-2 py-1.5">
                    <select aria-label={`Lavorazione della riga ${i + 1}`} value={r.fase} onChange={(e) => cambia(i, { fase: e.target.value })}
                      className="mb-1 h-7 max-w-full rounded border bg-background px-1 text-xs text-muted-foreground">
                      {fasiScelta.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <Input aria-label={`Descrizione della riga ${i + 1}`} value={r.descrizione} onChange={(e) => cambia(i, { descrizione: e.target.value })} className="h-8" />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input aria-label={`Unità della riga ${i + 1}`} value={r.unita ?? ""} onChange={(e) => cambia(i, { unita: e.target.value || null })} className="mt-8 h-8" />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input aria-label={`Quantità della riga ${i + 1}`} inputMode="decimal" defaultValue={String(r.quantita).replace(".", ",")}
                      onBlur={(e) => cambia(i, { quantita: numero(e.target.value) })} className="mt-8 h-8 text-right tabular-nums" />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input aria-label={`Prezzo della riga ${i + 1}`} inputMode="decimal" defaultValue={String(r.prezzo).replace(".", ",")}
                      onBlur={(e) => cambia(i, { prezzo: numero(e.target.value) })} className="mt-8 h-8 text-right tabular-nums" />
                  </td>
                  <td className="whitespace-nowrap px-2 pt-10 text-right tabular-nums">{formatCurrency(r.importo)}</td>
                  <td className="pt-9 text-right">
                    <button type="button" aria-label={`Togli ${r.descrizione || `la riga ${i + 1}`}`} className="p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => onRighe(righe.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!righe.length && (
                <tr><td colSpan={6} className="px-2 py-4 text-center text-sm text-muted-foreground">Nessun lavoro: aggiungili dal listino o a mano.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Aggiungi a
            <select aria-label="Lavorazione delle righe nuove" value={faseNuova} onChange={(e) => setFaseNuova(e.target.value)} className="ml-1 h-9 rounded-md border bg-background px-2 text-sm text-foreground">
              {fasiScelta.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="relative min-w-[16rem] flex-1">
            <Input aria-label="Cerca nel listino per il contratto" placeholder="Cerca nel listino (nome o codice)" value={cerca} onChange={(e) => setCerca(e.target.value)} className="h-9" />
            {trovate.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover text-sm shadow" role="listbox">
                {trovate.map((t) => {
                  const p = prezzoListinoPerDitta(t, dittaId, varianti);
                  return (
                    <li key={t.id} role="option" aria-selected={false}>
                      <button type="button" className="flex w-full justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted" onClick={() => aggiungiDalListino(t)}>
                        <span className="min-w-0 truncate">{t.codice ? `${t.codice} · ` : ""}{t.nome}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(p.prezzo)}/{t.unita}{p.concordato ? " · concordato" : ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onRighe([...righe, conChiave({ fase: faseNuova, descrizione: "", unita: "a corpo", quantita: 1, prezzo: 0, importo: 0 })])}>
            <Plus className="mr-1 h-4 w-4" />Riga a mano
          </Button>
          <Button type="button" size="sm" variant="outline" title="Una voce sola per tutta la fase scelta, a corpo: scrivi solo l'importo"
            onClick={() => onRighe([...righe, conChiave({ fase: faseNuova, descrizione: `${faseNuova}: lavori a corpo`, unita: "a corpo", quantita: 1, prezzo: 0, importo: 0 })])}>
            <Plus className="mr-1 h-4 w-4" />Computo a corpo
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onRighe(dalleVoci.map(conChiave))}
            title="Rimette le voci delle fasi affidate alla ditta, coi prezzi del listino. Le modifiche fatte qui si perdono.">
            Riprendi le voci delle fasi
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-sm">
            Totale lavori <strong className="tabular-nums">{formatCurrency(totale)}</strong> senza IVA
            {importoPattuito != null && Math.abs(importoPattuito - totale) > 0.005 && (
              <span className="ml-2 text-xs text-amber-800">· l'importo pattuito resta {formatCurrency(importoPattuito)} (contratto già attivo)</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={salvando} onClick={onChiudi}>Annulla</Button>
            <Button disabled={salvando || !elencoDaSalvare(righe).length} onClick={onSalva}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{etichettaSalva}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
