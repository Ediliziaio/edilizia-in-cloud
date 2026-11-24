// Commessa e riferimenti PA della fattura (lotto 4, 15/11/2026).
//
// Dall'editor del modulo Fatturazione si sceglie e si cambia la commessa; scegliendola si
// propongono i suoi riferimenti (contratto, ordine, convenzione, CIG, CUP) e l'ufficio. Se sulla
// fattura ci sono già valori diversi, si mostra il conflitto e si sceglie. Cambiando commessa i
// riferimenti della precedente si tolgono, con avviso. Senza commessa i riferimenti si scrivono a
// mano. Fattura su più commesse: ogni riferimento dice a quali righe si applica.
// Sulle bozze «Aggiorna dalla commessa» mostra le differenze e non sovrascrive ciò che è stato
// cambiato a mano. Le fatture emesse non si toccano (sezione in sola lettura). Niente di quello
// che si fa qui scrive sulla commessa o sull'anagrafica.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ExternalLink, FileSignature, Plus, RefreshCw, Replace, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useSearchOrders } from "@/hooks/billing/useFatturaOrdineLink";
import { leggiRiferimentiPa } from "@/hooks/useRiferimentiPaCommessa";
import { useUfficiPa } from "@/hooks/useUfficiPa";
import { SelettoreUfficioPa } from "@/components/clients/SelettoreUfficioPa";
import { RiferimentiPaFatturaEditor } from "@/components/fatturazione/RiferimentiPaFatturaEditor";
import { scegliUfficio } from "@/lib/fatturazione/fatturaPaDaCommessa";
import {
  aggiornaDallaCommessa, collegaCommessa, conflittiCollegamento, etichettaRiferimento, normalizzaRiferimenti,
  proponiDallaCommessa, riferimentoManuale, togliCommessa, codice,
  type CambioRiferimento, type ConflittoRiferimento, type RiferimentoPaFattura,
} from "../../../../../supabase/functions/_shared/riferimentiPaFattura";
import type { EditorState } from "./useEditorState";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

/** Evento che apre la sezione (dal riepilogo: «manca il CIG» porta qui). */
export const APRI_RIFERIMENTI_PA = "editor-apri-riferimenti-pa";

interface CommessaBreve { id: string; order_code: string | null; description: string | null; customer_id: string | null }

const ETICHETTA_CAMPO: Record<string, string> = {
  tipo: "tipo", numero: "numero", data: "data", num_item: "lotto", codice_commessa_convenzione: "codice commessa/convenzione",
  cig: "CIG", cig_non_dovuto: "CIG non dovuto", cup: "CUP", cup_non_dovuto: "CUP non dovuto",
};
const mostra = (v: unknown) => (v === true ? "sì" : v === false || v == null || v === "" ? "—" : String(v));

/** Proposte di una commessa per la fattura (righe della commessa, poi fonti vecchie, poi anagrafica). */
async function propostePer(commessa: CommessaBreve, anagraficaId: string | null | undefined) {
  const dati = await leggiRiferimentiPa(commessa.id);
  let anagrafica: { id: string; cig: string | null; cup: string | null } | null = null;
  if (anagraficaId) {
    const { data } = await supabase.from("anagrafiche_native").select("id, cig, cup").eq("id", anagraficaId).maybeSingle();
    anagrafica = data ?? null;
  }
  const fonti = dati.fonti.filter((f) => !f.giaPresente).map((f) => ({ fonte: f.fonte, fonte_id: f.fonte_id, cig: f.cig, cup: f.cup, numero: f.numero, data: f.data }));
  return {
    proposti: proponiDallaCommessa({ id: commessa.id, codice: commessa.order_code }, dati.righe, fonti, anagrafica),
    righeCommessa: dati.righe,
  };
}

export function EditorCommessaRiferimentiSection({ state, dispatch, disabled }: Props) {
  const tr = useT();
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const fatturaId = state.id;
  const snap = state.cliente_snapshot;
  const isPA = snap?.tipo_cliente === "PA";
  const isBozza = state.stato === "bozza";
  const riferimenti = useMemo(() => normalizzaRiferimenti(state.riferimenti_pa), [state.riferimenti_pa]);

  // Commesse collegate: la principale (ordine_id) e le altre (fattura_ordine).
  const { data: altreLegate = [] } = useQuery({
    queryKey: ["fattura-ordini-pa", fatturaId, companyId],
    enabled: !!fatturaId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("fattura_ordine").select("ordine_id").eq("fattura_id", fatturaId!).eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []).map((l) => l.ordine_id);
    },
  });
  const idsCommesse = useMemo(() => [...new Set([state.ordine_id, ...altreLegate].filter((x): x is string => !!x))], [state.ordine_id, altreLegate]);
  const { data: commesse = [] } = useQuery({
    queryKey: ["fattura-commesse-pa", idsCommesse.join(","), companyId],
    enabled: idsCommesse.length > 0 && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id, order_code, description, customer_id").in("id", idsCommesse).eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as CommessaBreve[];
    },
  });
  const principale = commesse.find((c) => c.id === state.ordine_id) ?? null;

  // Ricerca commesse
  const [cerca, setCerca] = useState("");
  const [popover, setPopover] = useState<null | "cambia" | "aggiungi">(null);
  const { data: risultati = [] } = useSearchOrders(companyId, cerca);

  // Dialoghi
  const [conflitti, setConflitti] = useState<null | { commessa: CommessaBreve; proposti: RiferimentoPaFattura[]; lista: ConflittoRiferimento[]; base: RiferimentoPaFattura[]; principale: boolean; avvisoCliente: string | null }>(null);
  const [tieni, setTieni] = useState<string[]>([]);
  const [aggiornamento, setAggiornamento] = useState<null | { commessa: CommessaBreve; risultato: RiferimentoPaFattura[]; cambi: CambioRiferimento[] }>(null);
  const [lavoro, setLavoro] = useState(false);

  // Uffici dell'ente: il predefinito si propone da solo se la fattura non ne ha uno e il codice
  // scritto è vuoto o è già il suo (un codice scritto a mano diverso non si sovrascrive).
  const { tutti: uffici } = useUfficiPa(isPA ? state.anagrafica_id ?? null : null);
  useEffect(() => {
    if (disabled || !isPA || state.ufficio_pa_id || snap?.ufficio_pa || !uffici.length) return;
    const { ufficio } = scegliUfficio({ anagrafica: null, righeCommessa: [], uffici, tipoCliente: "PA" });
    if (!ufficio) return;
    const scritto = codice(snap?.codice_sdi);
    if (scritto && scritto !== ufficio.codice) return;
    dispatch({ type: "SET_UFFICIO_PA", ufficio });
  }, [disabled, isPA, state.ufficio_pa_id, snap?.ufficio_pa, snap?.codice_sdi, uffici, dispatch]);

  async function clienteDellaCommessa(c: CommessaBreve): Promise<string | null> {
    if (!c.customer_id || !companyId) return null;
    const { data } = await supabase.from("anagrafiche_native").select("id, ragione_sociale").eq("company_id", companyId).eq("cliente_id", c.customer_id).maybeSingle();
    if (!data || !state.anagrafica_id || data.id === state.anagrafica_id) return null;
    return tr("La commessa {commessa} è intestata a {cliente}, la fattura a {destinatario}. Se non è voluto, cambia il cliente o scegli un'altra commessa.", { commessa: c.order_code ?? "", cliente: data.ragione_sociale ?? tr("un altro cliente"), destinatario: snap?.ragione_sociale ?? tr("un altro") });
  }

  /** Sceglie la commessa (principale) o ne aggiunge un'altra. */
  async function scegli(c: CommessaBreve, comePrincipale: boolean) {
    setPopover(null);
    setCerca("");
    setLavoro(true);
    try {
      const { proposti, righeCommessa } = await propostePer(c, state.anagrafica_id);
      const avvisoCliente = await clienteDellaCommessa(c);
      let base = riferimenti;
      if (comePrincipale && state.ordine_id && state.ordine_id !== c.id) {
        const { risultato, tolti } = togliCommessa(base, state.ordine_id);
        base = risultato;
        if (tolti.length) {
          toast.warning(tolti.length === 1 ? tr("Tolti il riferimento della commessa {commessa}", { commessa: principale?.order_code ?? tr("precedente") }) : tr("Tolti {n} riferimenti della commessa {commessa}", { n: tolti.length, commessa: principale?.order_code ?? tr("precedente") }), {
            description: tolti.map(etichettaRiferimento).join(" — "),
          });
        }
      }
      // Ufficio indicato sulla commessa (se è di questo ente): diventa quello della fattura.
      if (isPA && comePrincipale) {
        const { ufficio } = scegliUfficio({ anagrafica: { id: state.anagrafica_id ?? null }, righeCommessa, uffici, tipoCliente: "PA" });
        if (ufficio && ufficio.origine === "commessa") dispatch({ type: "SET_UFFICIO_PA", ufficio });
      }
      const lista = conflittiCollegamento(base, proposti, c.id);
      if (lista.length || avvisoCliente) {
        setTieni([]);
        setConflitti({ commessa: c, proposti, lista, base, principale: comePrincipale, avvisoCliente });
        return;
      }
      await applica(c, comePrincipale, collegaCommessa(base, proposti, c.id));
    } catch (e) {
      toast.error(tr("Non riesco a leggere i riferimenti della commessa"), { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLavoro(false);
    }
  }

  async function applica(c: CommessaBreve, comePrincipale: boolean, nuovi: RiferimentoPaFattura[]) {
    if (comePrincipale) {
      const precedente = state.ordine_id;
      dispatch({ type: "SET_COMMESSA", ordine_id: c.id, riferimenti: nuovi });
      // La precedente collegata anche come «altra commessa»: si scollega.
      if (precedente && precedente !== c.id && fatturaId && altreLegate.includes(precedente)) {
        await supabase.from("fattura_ordine").delete().eq("fattura_id", fatturaId).eq("ordine_id", precedente);
      }
    } else {
      if (fatturaId && companyId && !idsCommesse.includes(c.id)) {
        const { error } = await supabase.from("fattura_ordine").insert({ company_id: companyId, fattura_id: fatturaId, ordine_id: c.id });
        if (error) { toast.error(tr("Collegamento non riuscito"), { description: error.message }); return; }
      }
      dispatch({ type: "SET_RIFERIMENTI_PA", riferimenti: nuovi });
      if (nuovi.some((r) => r.order_id === c.id)) {
        toast.info(tr("Fattura su più commesse"), { description: tr("Indica in ogni riferimento a quali righe si applica (Vale per…): altrimenti vale per tutta la fattura.") });
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["fattura-ordini-pa", fatturaId] });
    void queryClient.invalidateQueries({ queryKey: ["fattura-ordini", fatturaId] });
    void queryClient.invalidateQueries({ queryKey: ["contesto-controlli-pa"] });
  }

  async function scollega(id: string) {
    const { risultato, tolti } = togliCommessa(riferimenti, id);
    if (id === state.ordine_id) dispatch({ type: "SET_COMMESSA", ordine_id: null, riferimenti: risultato });
    else dispatch({ type: "SET_RIFERIMENTI_PA", riferimenti: risultato });
    if (fatturaId && altreLegate.includes(id)) await supabase.from("fattura_ordine").delete().eq("fattura_id", fatturaId).eq("ordine_id", id);
    if (tolti.length) toast.warning(tr("Tolti i riferimenti della commessa {order_code}", { order_code: String(commesse.find((c) => c.id === id)?.order_code ?? "") }), { description: tolti.map(etichettaRiferimento).join(" — ") });
    void queryClient.invalidateQueries({ queryKey: ["fattura-ordini-pa", fatturaId] });
    void queryClient.invalidateQueries({ queryKey: ["contesto-controlli-pa"] });
  }

  async function aggiorna(c: CommessaBreve) {
    setLavoro(true);
    try {
      const { proposti } = await propostePer(c, state.anagrafica_id);
      const esito = aggiornaDallaCommessa(riferimenti, proposti, c.id);
      setAggiornamento({ commessa: c, ...esito });
    } catch (e) {
      toast.error(tr("Non riesco a leggere la commessa"), { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLavoro(false);
    }
  }

  // Da «Crea fattura» di una commessa (…?ordine_link=): la commessa diventa quella della fattura.
  const autoLink = useRef(false);
  const ordineLink = searchParams.get("ordine_link");
  useEffect(() => {
    if (autoLink.current || disabled || !ordineLink || !companyId || state.ordine_id === ordineLink || idsCommesse.includes(ordineLink)) return;
    autoLink.current = true;
    void (async () => {
      const { data } = await supabase.from("orders").select("id, order_code, description, customer_id").eq("id", ordineLink).eq("company_id", companyId).maybeSingle();
      if (data) await scegli(data as CommessaBreve, !state.ordine_id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordineLink, companyId, disabled, state.ordine_id]);

  // Si vede per intero quando serve: cliente PA, fattura su una commessa, riferimenti già
  // scritti. Altrimenti resta un pulsante: chi fattura a un privato non deve scorrerla.
  const [aperta, setAperta] = useState(false);
  useEffect(() => {
    const apri = () => setAperta(true);
    window.addEventListener(APRI_RIFERIMENTI_PA, apri);
    return () => window.removeEventListener(APRI_RIFERIMENTI_PA, apri);
  }, []);

  const legacy = !riferimenti.length && (state.cig || state.cup || state.codice_commessa_convenzione || (Array.isArray(state.riferimenti_ordine) && state.riferimenti_ordine.length > 0));
  function convertiLegacy() {
    const ordini = (Array.isArray(state.riferimenti_ordine) ? state.riferimenti_ordine : []) as Array<Record<string, unknown>>;
    const base = { cig: state.cig ?? null, cup: state.cup ?? null, codice_commessa_convenzione: state.codice_commessa_convenzione ?? null };
    const nuovi = ordini.length
      ? ordini.map((o) => ({ ...riferimentoManuale("ordine_acquisto"), ...base, numero: String(o.IdDocumento ?? o.id_documento ?? o.numero ?? "") || null, data: String(o.Data ?? o.data ?? "").slice(0, 10) || null }))
      : [{ ...riferimentoManuale("contratto"), ...base }];
    dispatch({ type: "SET_RIFERIMENTI_PA", riferimenti: normalizzaRiferimenti(nuovi) });
  }

  const righe = (state.righe ?? []).map((r) => ({ id: r.id, descrizione: r.descrizione }));
  const ricerca = (modo: "cambia" | "aggiungi", etichetta: string) => (
    <Popover open={popover === modo} onOpenChange={(o) => setPopover(o ? modo : null)}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={lavoro}>
          {modo === "cambia" ? (state.ordine_id ? <Replace className="mr-1 h-3 w-3" /> : <Search className="mr-1 h-3 w-3" />) : <Plus className="mr-1 h-3 w-3" />}
          {etichetta}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input placeholder={tr("Cerca per codice o descrizione…")} value={cerca} onChange={(e) => setCerca(e.target.value)} className="mb-2 h-8 text-xs" autoFocus />
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {risultati.filter((o) => !idsCommesse.includes(o.id)).map((o) => (
            <button key={o.id} type="button" className="w-full space-y-0.5 rounded-md p-2 text-left text-xs hover:bg-accent"
              onClick={() => void scegli({ id: o.id, order_code: o.order_code, description: o.description, customer_id: o.customer?.id ?? null }, modo === "cambia")}>
              <span className="font-medium">{o.order_code ?? tr("Senza codice")}</span>
              <p className="truncate text-muted-foreground">{o.description?.slice(0, 60)}</p>
              {o.customer && <p className="text-muted-foreground">{o.customer.first_name} {o.customer.last_name}</p>}
            </button>
          ))}
          {risultati.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">{cerca ? tr("Nessuna commessa trovata") : tr("Scrivi per cercare")}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );

  if (!fatturaId) return null;

  // Si apre da sola quando serve: cliente PA, commessa collegata, riferimenti già scritti.
  const serve = isPA || !!state.ordine_id || idsCommesse.length > 0 || riferimenti.length > 0 || !!legacy || !!ordineLink;
  const inVista = serve || aperta;
  if (!serve && disabled) return null;
  const quante = (idsCommesse.length ? 1 : 0) + riferimenti.length;

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm" id="ed-riferimenti-pa" data-testid="sezione-commessa-riferimenti">
      <Collapsible open={inVista} onOpenChange={(o) => setAperta(o || serve)}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-accent/30">
            <div className="flex flex-wrap items-center gap-2">
              <FileSignature className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600/80 dark:text-blue-400/80">
                {tr("Commessa e riferimenti PA")}
              </span>
              {quante > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-100 px-1 text-[9px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {quante}
                </span>
              )}
              {!isBozza && <Badge variant="outline" className="text-[10px]">{tr("fattura emessa: non si modifica")}</Badge>}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${inVista ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t px-4 pb-4 pt-3">

      {/* Commesse */}
      <div className="space-y-1.5">
        {commesse.length === 0 && !state.ordine_id && (
          <p className="text-xs text-muted-foreground">{tr("Nessuna commessa collegata: i riferimenti si scrivono qui sotto, a mano.")}</p>
        )}
        {[...commesse].sort((a, b) => (a.id === state.ordine_id ? -1 : b.id === state.ordine_id ? 1 : 0)).map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs">
            <Badge variant="outline">{c.order_code ?? "—"}</Badge>
            <span className="min-w-0 flex-1 truncate">{c.description}</span>
            {c.id === state.ordine_id && commesse.length > 1 && <span className="text-[10px] text-muted-foreground">{tr("principale")}</span>}
            {isBozza && !disabled && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={lavoro} onClick={() => void aggiorna(c)}>
                <RefreshCw className="mr-1 h-3 w-3" /> {tr("Aggiorna dalla commessa")}
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" asChild aria-label={tr("Apri la commessa")}>
              <Link to={`/azienda/ordini/${c.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
            </Button>
            {!disabled && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={tr("Scollega la commessa {order_code}", { order_code: String(c.order_code ?? "") })} onClick={() => void scollega(c.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            {ricerca("cambia", state.ordine_id ? tr("Cambia commessa") : tr("Scegli la commessa"))}
            {state.ordine_id && ricerca("aggiungi", tr("Aggiungi un'altra commessa"))}
          </div>
        )}
      </div>

      {/* Ufficio PA */}
      {isPA && state.anagrafica_id && (
        <div className="space-y-1">
          <Label htmlFor="ed-ufficio-pa" className="text-[11px] text-muted-foreground">{tr("Ufficio destinatario (Codice Univoco Ufficio)")}</Label>
          <SelettoreUfficioPa
            id="ed-ufficio-pa"
            anagraficaId={state.anagrafica_id}
            value={state.ufficio_pa_id ?? snap?.ufficio_pa?.id ?? null}
            proponiPredefinito={false}
            disabled={disabled}
            onChange={(id, u) => dispatch({
              type: "SET_UFFICIO_PA",
              ufficio: u ? { id, codice: codice(u.codice_univoco_ufficio), descrizione: u.descrizione, anagrafica_id: u.anagrafica_id, origine: "manuale" } : null,
            })}
            className="h-8 text-xs"
          />
          {snap?.ufficio_pa && (
            <p className="text-[11px] text-muted-foreground" data-testid="origine-ufficio">
              {tr("Codice")} <span className="font-mono">{snap.ufficio_pa.codice}</span> ·{" "}
              {snap.ufficio_pa.origine === "manuale" ? tr("scelto qui") : snap.ufficio_pa.origine === "commessa" ? tr("dalla commessa") : tr("dall'anagrafica (predefinito)")}
              {codice(snap.codice_sdi) !== snap.ufficio_pa.codice && <span className="text-amber-700"> {tr("— il codice destinatario scritto è {codice}", { codice: codice(snap.codice_sdi) || tr("vuoto") })}</span>}
            </p>
          )}
        </div>
      )}

      {/* Colonne vecchie */}
      {legacy && (
        <div className="rounded-md border border-dashed p-2 text-xs">
          <p>
            {tr("Questa fattura usa i campi di prima: {campi}. L'XML li scrive come sempre.", { campi: [state.cig && `CIG ${state.cig}`, state.cup && `CUP ${state.cup}`, state.codice_commessa_convenzione && tr("codice {codice}", { codice: state.codice_commessa_convenzione })].filter(Boolean).join(", ") || tr("riferimenti d'ordine") })}
          </p>
          {!disabled && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={convertiLegacy}>
              {tr("Trasformali in riferimenti (contratto, ordine, righe)")}
            </Button>
          )}
        </div>
      )}

      <RiferimentiPaFatturaEditor
        value={riferimenti}
        onChange={(next) => dispatch({ type: "SET_RIFERIMENTI_PA", riferimenti: next })}
        righe={righe}
        disabled={disabled}
        vuoto={state.ordine_id ? tr("La commessa non ha riferimenti PA. Aggiungili qui (valgono solo per questa fattura) o nella Panoramica della commessa, poi «Aggiorna dalla commessa».") : undefined}
      />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Conflitti al collegamento */}
      <Dialog open={!!conflitti} onOpenChange={(o) => !o && setConflitti(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("Commessa {order_code}: controlla prima di collegarla", { order_code: String(conflitti?.commessa.order_code ?? "") })}</DialogTitle>
            <DialogDescription>{tr("Niente si sostituisce da solo. Scegli quali riferimenti tenere.")}</DialogDescription>
          </DialogHeader>
          {conflitti?.avvisoCliente && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{conflitti.avvisoCliente}</p>}
          <div className="space-y-2">
            {conflitti?.lista.map((c) => (
              <div key={c.fattura.chiave} className="space-y-1 rounded-md border p-2 text-xs" data-testid="conflitto-riferimento">
                <p>{tr("Sulla fattura:")} <b>{etichettaRiferimento(c.fattura)}</b></p>
                <p>{tr("Dalla commessa:")} <b>{etichettaRiferimento(c.commessa)}</b></p>
                <label className="flex items-center gap-2">
                  <Checkbox checked={tieni.includes(c.fattura.chiave)} onCheckedChange={(v) => setTieni((t) => (v ? [...t, c.fattura.chiave] : t.filter((k) => k !== c.fattura.chiave)))} />
                  {tr("Tieni anche quello della fattura (altrimenti vale quello della commessa)")}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflitti(null)}>{tr("Annulla")}</Button>
            <Button onClick={() => {
              if (!conflitti) return;
              void applica(conflitti.commessa, conflitti.principale, collegaCommessa(conflitti.base, conflitti.proposti, conflitti.commessa.id, tieni));
              setConflitti(null);
            }}>{tr("Collega la commessa")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aggiorna dalla commessa */}
      <Dialog open={!!aggiornamento} onOpenChange={(o) => !o && setAggiornamento(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("Aggiorna dalla commessa {order_code}", { order_code: String(aggiornamento?.commessa.order_code ?? "") })}</DialogTitle>
            <DialogDescription>{tr("Ciò che hai cambiato a mano su questa fattura resta com'è.")}</DialogDescription>
          </DialogHeader>
          {aggiornamento && aggiornamento.cambi.length === 0 && <p className="text-sm">{tr("Nessuna differenza: la fattura dice già quello che dice la commessa.")}</p>}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {aggiornamento?.cambi.map((c) => (
              <div key={c.chiave} className="rounded-md border p-2 text-xs" data-testid="cambio-riferimento">
                <p className="font-medium">
                  {c.esito === "aggiunto" ? tr("Si aggiunge") : c.esito === "tolto" ? tr("Si toglie (non c'è più sulla commessa)") : c.esito === "aggiornato" ? tr("Si aggiorna") : tr("Resta com'è (cambiato a mano qui)")}: {c.etichetta}
                </p>
                {c.differenze.map((d) => (
                  <p key={d.campo} className="text-muted-foreground">{tr("{valore}: fattura {fattura} → commessa {commessa}", { valore: ETICHETTA_CAMPO[d.campo] ? tr(ETICHETTA_CAMPO[d.campo]) : d.campo, fattura: String(mostra(d.fattura) ?? ""), commessa: String(mostra(d.commessa) ?? "") })}</p>
                ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAggiornamento(null)}>{tr("Annulla")}</Button>
            <Button disabled={!aggiornamento?.cambi.some((c) => c.esito !== "tenuto_modificato")} onClick={() => {
              if (aggiornamento) dispatch({ type: "SET_RIFERIMENTI_PA", riferimenti: aggiornamento.risultato });
              setAggiornamento(null);
            }}>{tr("Applica")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
