/**
 * Scheda subappaltatore → «Listino» (10/11/2026, lotto 2 di docs/piano-subappalto-computo-listino.md).
 *
 * Le voci di manodopera e servizi dell'azienda con accanto il prezzo che chiede questa ditta, più
 * le voci che ha solo lei. Si scrive una volta e vale per tutte le commesse: «Ditte e contratti» e
 * «Aggiungi manodopera» propongono questi prezzi. Il salvataggio passa da `listino_ditta_salva`:
 * un prezzo che valeva già si chiude e se ne apre uno nuovo dalla data scelta, così la storia resta
 * e i contratti già fatti non cambiano.
 * Si vede solo col permesso sui costi; si modifica col permesso sul listino.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Loader2, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { costoTariffa, unitaTariffa } from "@/lib/listino/costoTariffa";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { parseAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import { vociListinoPerDitta } from "@/lib/orders/costoDitta";
import { prezziPerVoce, righeDaSalvare, scartoDalCosto, type PrezzoDitta } from "@/lib/subappaltatori/listinoDitta";
import { oggiInItalia } from "../../../shared/silvio-commessa/date.ts";

// Colonne recenti (subappaltatore_id): passiamo dal client non tipizzato come il resto del modulo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface VoceListino {
  id: string; nome: string; codice: string | null; tipo: string; unita: string; costo: number | null;
  external_team_id: string | null; subappaltatore_id: string | null;
}

/** Le unità di una voce nuova: quella di fatturazione e la colonna vecchia `unita` che il database vuole. */
const UNITA_VOCE_NUOVA = [
  { valore: "mq", legacy: "mq", nome: "mq" }, { valore: "ml", legacy: "ml", nome: "ml" },
  { valore: "mc", legacy: "mc", nome: "mc" }, { valore: "pz", legacy: "pz", nome: "pezzo" },
  { valore: "h", legacy: "h", nome: "ora" }, { valore: "a_corpo", legacy: "fisso", nome: "a corpo" },
] as const;

const data = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
const unitaBreve = (u: string) => (u === "a_corpo" ? "a corpo" : u);
/** «38,00», «14,5550»: due decimali almeno, senza punto delle migliaia (la casella si riscrive). */
const prezzoInCasella = (n: number) => Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false });

export function ListinoDitta({ companyId, anagraficaId, nomeDitta }: { companyId: string; anagraficaId: string; nomeDitta: string }) {
  const { canViewCosts, canEditSettingsPricing, solaLettura } = usePermissions();
  const puoScrivere = canViewCosts && canEditSettingsPricing && !solaLettura;
  const qc = useQueryClient();
  const oggi = oggiInItalia();

  const chiave = ["listino-ditta", companyId, anagraficaId];
  const dati = useQuery({
    queryKey: chiave,
    enabled: canViewCosts && !!companyId && !!anagraficaId,
    queryFn: async () => {
      const [voci, prezzi, squadre] = await Promise.all([
        loadCatalogPages<Record<string, unknown> & { id: string }>((from, to) => db.from("tariffe_aziendali")
          .select("id, nome, codice, tipo, unita, unita_fatturazione, prezzo_costo, costo_interno, costo_default, attivo, external_team_id, subappaltatore_id")
          .eq("company_id", companyId).order("nome").order("id").range(from, to)),
        db.from("tariffa_costi_varianti")
          .select("id, tariffa_id, nome, costo, is_default, attivo, sort_order, valid_from, valid_to, created_at")
          .eq("company_id", companyId).eq("subappaltatore_id", anagraficaId),
        db.from("external_teams").select("id").eq("company_id", companyId).eq("subappaltatore_id", anagraficaId),
      ]);
      if (prezzi.error) throw prezzi.error;
      if (squadre.error) throw squadre.error;
      const tutte: VoceListino[] = voci
        .filter((t) => t.attivo !== false)
        .map((t) => ({
          id: t.id, nome: String(t.nome ?? ""), codice: (t.codice as string | null) ?? null, tipo: String(t.tipo ?? ""),
          unita: unitaTariffa(t as never), costo: costoTariffa(t as never),
          external_team_id: (t.external_team_id as string | null) ?? null, subappaltatore_id: (t.subappaltatore_id as string | null) ?? null,
        }));
      const squadraId = ((squadre.data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
      // Le voci aziendali e quelle di questa ditta; mai le voci proprie delle altre ditte.
      const proprie = vociListinoPerDitta(tutte, { squadraId, anagraficaId });
      return { voci: proprie, prezzi: (prezzi.data ?? []) as PrezzoDitta[] };
    },
  });

  const [modifiche, setModifiche] = useState<Record<string, string>>({});
  const [validoDal, setValidoDal] = useState(oggi);
  const [cerca, setCerca] = useState("");
  const [soloConPrezzo, setSoloConPrezzo] = useState(false);
  const [storiaAperta, setStoriaAperta] = useState(false);
  const [voceNuova, setVoceNuova] = useState(false);

  // I prezzi del giorno da cui valgono le modifiche: è lo stesso giorno su cui ragiona listino_ditta_salva.
  const perVoce = useMemo(() => prezziPerVoce(dati.data?.prezzi ?? [], validoDal), [dati.data, validoDal]);
  const { righe: daSalvare, errori } = useMemo(() => righeDaSalvare(modifiche, perVoce), [modifiche, perVoce]);
  const conPrezzo = useMemo(() => [...perVoce.values()].filter((v) => v.principale).length, [perVoce]);
  const storia = useMemo(() => (dati.data?.voci ?? []).flatMap((v) => (perVoce.get(v.id)?.storia ?? []).map((p) => ({ voce: v, p }))), [dati.data, perVoce]);

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return (dati.data?.voci ?? [])
      .filter((v) => !soloConPrezzo || perVoce.get(v.id)?.principale || modifiche[v.id]?.trim())
      .filter((v) => !q || `${v.codice ?? ""} ${v.nome}`.toLowerCase().includes(q))
      // Prima le voci della ditta, poi quelle con un suo prezzo, poi le altre.
      .sort((a, b) => Number(!!b.subappaltatore_id || !!b.external_team_id) - Number(!!a.subappaltatore_id || !!a.external_team_id)
        || Number(!!perVoce.get(b.id)?.principale) - Number(!!perVoce.get(a.id)?.principale)
        || a.nome.localeCompare(b.nome, "it"));
  }, [dati.data, cerca, soloConPrezzo, perVoce, modifiche]);

  const salva = useMutation({
    mutationFn: async () => {
      if (errori.length) throw new Error("Alcuni prezzi non si leggono: correggili prima di salvare.");
      if (!daSalvare.length) return null;
      const { data: esito, error } = await db.rpc("listino_ditta_salva", { p_subappaltatore: anagraficaId, p_valido_dal: validoDal, p_righe: daSalvare });
      if (error) throw error;
      return esito as { nuovi: number; corretti: number; chiusi: number } | null;
    },
    onSuccess: (esito) => {
      setModifiche({});
      void qc.invalidateQueries({ queryKey: chiave });
      void qc.invalidateQueries({ queryKey: ["tariffa-costi-varianti", companyId] });
      void qc.invalidateQueries({ queryKey: ["ditte-contratti-commessa", companyId] });
      if (esito) toast.success(`Listino di ${nomeDitta} salvato: ${esito.nuovi + esito.corretti} prezzi scritti${esito.chiusi ? `, ${esito.chiusi} tolti` : ""}.`);
    },
    onError: (e: Error) => toast.error(e.message || "Salvataggio non riuscito."),
  });

  if (!canViewCosts) return <p className="text-sm text-muted-foreground">Il listino della ditta si vede con il permesso sui costi.</p>;
  if (dati.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Caricamento del listino…</p>;
  if (dati.isError) return <p role="alert" className="text-sm text-destructive">Listino non disponibile. <Button variant="link" className="h-auto p-0" onClick={() => void dati.refetch()}>Riprova</Button></p>;

  const voci = dati.data?.voci ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Listino di {nomeDitta}</h3>
          <p className="text-xs text-muted-foreground">
            {conPrezzo} voci con un prezzo della ditta su {voci.length}{validoDal !== oggi ? ` (prezzi al ${data(validoDal)})` : ""}. I prezzi valgono per tutte le commesse: li propongono «Ditte e contratti» e «Aggiungi manodopera». I contratti già fatti non cambiano.
          </p>
        </div>
        {puoScrivere && (
          <Button size="sm" variant="outline" onClick={() => setVoceNuova(true)}><Plus className="mr-1 h-4 w-4" />Voce sua</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca voce o codice" className="h-9 pl-8" aria-label="Cerca nel listino" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={soloConPrezzo} onCheckedChange={setSoloConPrezzo} aria-label="Solo le voci con un prezzo della ditta" />Solo con prezzo
        </label>
        {storia.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setStoriaAperta((x) => !x)}><History className="mr-1 h-4 w-4" />Prezzi passati ({storia.length})</Button>
        )}
      </div>

      {storiaAperta && storia.length > 0 && (
        <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
          {storia.map(({ voce, p }) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2">
              <span className="min-w-0 truncate">{voce.nome}{p.nome && !p.nome.startsWith(nomeDitta) ? ` · ${p.nome}` : ""}</span>
              <span className="tabular-nums text-muted-foreground">{formatCurrency(p.costo)}/{unitaBreve(voce.unita)} · dal {data(p.valid_from)}{p.valid_to ? ` al ${data(p.valid_to)}` : ""}</span>
            </li>
          ))}
        </ul>
      )}

      {voci.length === 0 ? (
        <p className="text-sm text-muted-foreground">Il listino di manodopera e servizi dell'azienda è vuoto: aggiungi le voci in Impostazioni → Listino manodopera, oppure una voce sua di questa ditta.</p>
      ) : (
        <div className="divide-y rounded-md border">
          <div className="hidden grid-cols-[minmax(0,1fr)_4rem_6.5rem_8rem] gap-2 bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground sm:grid">
            <span>Voce</span><span>U.M.</span><span className="text-right">Costo nostro</span><span className="text-right">Prezzo della ditta</span>
          </div>
          {visibili.map((v) => {
            const pv = perVoce.get(v.id);
            const valore = modifiche[v.id] ?? (pv?.principale ? prezzoInCasella(pv.principale.costo) : "");
            const numero = modifiche[v.id] != null ? parseAssignmentAmount(modifiche[v.id], 4) : pv?.principale?.costo ?? null;
            const scarto = scartoDalCosto(modifiche[v.id]?.trim() === "" ? null : numero, v.costo);
            const sbagliato = errori.includes(v.id);
            return (
              <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_4rem_6.5rem_8rem]">
                <div className="min-w-0">
                  <p className="truncate text-sm">{v.codice && <span className="mr-1 text-xs text-muted-foreground">{v.codice}</span>}{v.nome}</p>
                  <div className="flex flex-wrap gap-1">
                    {(v.subappaltatore_id || v.external_team_id) && <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">Voce sua</Badge>}
                    {pv && pv.altri.length > 0 && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal" title={pv.altri.map((a) => `${a.nome}: ${formatCurrency(a.costo)}`).join(" · ")}>
                        +{pv.altri.length} {pv.altri.length === 1 ? "altro prezzo" : "altri prezzi"}
                      </Badge>
                    )}
                    {pv?.principale?.valid_from && (
                      <span className="text-[10px] text-muted-foreground">dal {data(pv.principale.valid_from)}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground sm:hidden">{unitaBreve(v.unita)} · nostro {v.costo != null ? formatCurrency(v.costo) : "—"}</span>
                  </div>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">{unitaBreve(v.unita)}</span>
                <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{v.costo != null ? formatCurrency(v.costo) : "—"}</span>
                <div className="text-right">
                  <Input
                    value={valore}
                    disabled={!puoScrivere || salva.isPending}
                    onChange={(e) => setModifiche((m) => ({ ...m, [v.id]: e.target.value }))}
                    inputMode="decimal" placeholder="—"
                    aria-label={`Prezzo di ${nomeDitta} per ${v.nome}`}
                    aria-invalid={sbagliato}
                    className={`h-8 text-right tabular-nums ${sbagliato ? "border-destructive" : ""}`}
                  />
                  {sbagliato ? <span className="text-[10px] text-destructive">Numero non valido</span>
                    : scarto != null && <span className={`text-[10px] ${scarto > 0 ? "text-destructive" : "text-muted-foreground"}`}>{scarto > 0 ? "+" : ""}{scarto.toLocaleString("it-IT")}% sul nostro</span>}
                </div>
              </div>
            );
          })}
          {visibili.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Nessuna voce con questi filtri.</p>}
        </div>
      )}

      {puoScrivere && (Object.keys(modifiche).length > 0) && (
        <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 shadow-sm">
          <span className="text-sm">{daSalvare.length} {daSalvare.length === 1 ? "prezzo cambiato" : "prezzi cambiati"}</span>
          <span className="flex items-center gap-2 sm:ml-auto">
            <Label htmlFor="listino-valido-dal" className="text-xs text-muted-foreground">Valgono dal</Label>
            <Input id="listino-valido-dal" type="date" value={validoDal} onChange={(e) => setValidoDal(e.target.value || oggi)} className="h-8 w-auto" />
          </span>
          <Button size="sm" variant="ghost" disabled={salva.isPending} onClick={() => setModifiche({})}>Annulla</Button>
          <Button size="sm" disabled={salva.isPending || errori.length > 0 || daSalvare.length === 0} onClick={() => salva.mutate()}>
            {salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva il listino
          </Button>
        </div>
      )}

      {voceNuova && (
        <VoceSuaDialog companyId={companyId} anagraficaId={anagraficaId} nomeDitta={nomeDitta} validoDal={validoDal}
          onChiudi={() => setVoceNuova(false)}
          onCreata={() => { setVoceNuova(false); void qc.invalidateQueries({ queryKey: chiave }); void qc.invalidateQueries({ queryKey: ["tariffe-manodopera", companyId] }); void qc.invalidateQueries({ queryKey: ["listino-manodopera-voci", companyId] }); }} />
      )}
    </div>
  );
}

/** Una voce che ha solo questa ditta (il «punto luce» dell'elettricista): nasce nel listino aziendale, sua, col suo prezzo. */
function VoceSuaDialog({ companyId, anagraficaId, nomeDitta, validoDal, onChiudi, onCreata }: {
  companyId: string; anagraficaId: string; nomeDitta: string; validoDal: string; onChiudi: () => void; onCreata: () => void;
}) {
  const [nome, setNome] = useState("");
  const [unita, setUnita] = useState<(typeof UNITA_VOCE_NUOVA)[number]["valore"]>("mq");
  const [prezzo, setPrezzo] = useState("");
  const costo = prezzo.trim() ? parseAssignmentAmount(prezzo, 4) : null;
  const errore = !nome.trim() ? "Scrivi il nome della voce." : costo == null ? "Scrivi un prezzo valido." : null;

  const crea = useMutation({
    mutationFn: async () => {
      if (errore || costo == null) throw new Error(errore ?? "Dati mancanti.");
      const u = UNITA_VOCE_NUOVA.find((x) => x.valore === unita)!;
      const { data: voce, error } = await db.from("tariffe_aziendali").insert({
        company_id: companyId, tipo: "manodopera", nome: nome.trim(), unita: u.legacy, unita_fatturazione: u.valore,
        // Il costo per l'azienda è il prezzo della ditta: la voce esiste solo per lei.
        prezzo_costo: costo, costo_interno: costo, costo_default: costo, subappaltatore_id: anagraficaId,
      }).select("id").single();
      if (error) throw error;
      const { error: errPrezzo } = await db.rpc("listino_ditta_salva", {
        p_subappaltatore: anagraficaId, p_valido_dal: validoDal, p_righe: [{ tariffa_id: voce.id, costo }],
      });
      if (errPrezzo) {
        // Senza il prezzo la voce sarebbe una voce della ditta a zero: si toglie.
        await db.from("tariffe_aziendali").delete().eq("id", voce.id).eq("company_id", companyId);
        throw errPrezzo;
      }
    },
    onSuccess: () => { toast.success(`Voce aggiunta al listino di ${nomeDitta}.`); onCreata(); },
    onError: (e: Error) => toast.error(e.message || "Voce non creata."),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !crea.isPending && onChiudi()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Voce di {nomeDitta}</DialogTitle>
          <DialogDescription>Una lavorazione che ha solo questa ditta. Si propone solo per lei, mai per le altre.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="voce-sua-nome">Nome</Label>
            <Input id="voce-sua-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Punto luce" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Unità</Label>
              <Select value={unita} onValueChange={(v) => setUnita(v as typeof unita)}>
                <SelectTrigger aria-label="Unità di misura"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITA_VOCE_NUOVA.map((u) => <SelectItem key={u.valore} value={u.valore}>{u.nome}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label htmlFor="voce-sua-prezzo">Prezzo della ditta</Label>
              <Input id="voce-sua-prezzo" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} inputMode="decimal" placeholder="0,00" className="text-right" /></div>
          </div>
          {errore && (nome || prezzo) && <p className="text-xs text-destructive">{errore}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={crea.isPending} onClick={onChiudi}>Annulla</Button>
          <Button disabled={!!errore || crea.isPending} onClick={() => crea.mutate()}>{crea.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Aggiungi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
