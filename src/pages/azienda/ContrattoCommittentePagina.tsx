/**
 * Il contratto col committente, a pagina intera (09/11/2026).
 *
 * Florin, sul popup di prima: «devo definire bene anche le tariffe concordate col committente, e quando creo un nuovo
 * contratto devo inserire luogo e tutto quello che serve». Tre passi, col PDF vero sempre a destra:
 *   1. i lavori: cosa si fa, dove, per quanto, chi firma;
 *   2. le tariffe concordate, in tabella, e come si paga;
 *   3. le condizioni, dal modello di «Contratti e condizioni».
 */
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useCondizioniArchivio } from "@/hooks/useCondizioniArchivio";
import { useToast } from "@/hooks/use-toast";
import { oggiISO } from "@/lib/appalto/contratti";
import { datiDaAccordo } from "@/lib/contratti/contrattoCliente";
import { testoDelModello } from "@/lib/condizioni/archivio";
import { formatDecimalIT, parseDecimalIT } from "@/lib/parseDecimalIT";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { puoRiscrivereLeCondizioni } from "@/lib/preventivi/condizioniDelPreventivo";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { caricaDatiSocietari } from "../../../supabase/functions/_shared/datiSocietari";

// I tipi generati non conoscono le tabelle dell'appalto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const TIPI = [["manodopera", "Manodopera"], ["trasporto", "Trasporto"], ["lavorazione", "Lavorazione"], ["nolo", "Nolo"], ["materiale", "Materiale"], ["forfait", "Forfait"]] as const;
const UNITA = [["ora", "ora"], ["giornata", "giornata"], ["uomo_giorno", "uomo/giorno"], ["viaggio", "viaggio"], ["km", "km"], ["mq", "m²"], ["ml", "m"], ["mc", "m³"], ["kg", "kg"], ["cad", "cad"], ["corpo", "a corpo"]] as const;
const PASSI = ["Lavori", "Tariffe e pagamento", "Condizioni"] as const;

interface Bozza {
  nome: string; oggetto_lavori: string; luogo_lavori: string; firmatario_committente: string;
  valido_dal: string; valido_al: string; riferimento_committente: string;
  giorni_pagamento: string; ritenuta_pct: string; maggiorazione_straordinario_pct: string; maggiorazione_festivo_pct: string;
  modo_fatturazione: string; regime_iva: string; include_fornitura: boolean; condizioni: string;
}
// tariffa_id: la voce del listino generale che questa tariffa sostituisce per il committente (14/11/2026).
// Il prezzo nei rapportini la trova per id, mai per descrizione somigliante.
interface RigaTariffa { chiave: string; id?: string; tipo: string; descrizione: string; unita_misura: string; prezzo: string; tariffa_id?: string | null; tolta?: boolean }
interface VoceGenerale { id: string; codice: string | null; nome: string }
const nomeVoce = (v: VoceGenerale): string => (v.codice ? `${v.codice} · ${v.nome}` : v.nome);

let contatore = 0;
const rigaVuota = (): RigaTariffa => ({ chiave: `n${++contatore}`, tipo: "manodopera", descrizione: "", unita_misura: "ora", prezzo: "" });
const nomeDi = (c: { business_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined): string =>
  c?.business_name?.trim() || [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || "Committente";
const selectClasse = "h-9 w-full rounded-md border bg-background px-2 text-sm";

export default function ContrattoCommittentePagina() {
  const { id = "", contrattoId = "nuovo" } = useParams();
  const nuovo = contrattoId === "nuovo";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? "";
  const permessi = usePermissions();
  const puoModificare = permessi.isAdmin || permessi.canEditCustomers;
  const vedeImporti = !!permessi.canViewOrderAmounts;
  const puoRiscrivere = puoRiscrivereLeCondizioni(permessi);
  const archivio = useCondizioniArchivio();
  const modelli = useMemo(() => archivio.modelli.filter((m) => m.attivo && m.ambito === "appalto"), [archivio.modelli]);
  const predefinito = modelli.find((m) => m.predefinito) ?? null;
  const [passo, setPasso] = useState(0);
  const [modelloId, setModelloId] = useState<string | null>(null);
  const modello = modelli.find((m) => m.id === modelloId) ?? predefinito;

  const committente = useQuery({
    queryKey: ["committente", companyId, id], enabled: !!companyId && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("id, business_name, first_name, last_name, email, phone, fiscal_code, vat_number, address, city, postal_code, province")
        .eq("id", id).eq("company_id", companyId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  // Oggetto, luogo e firmatario: finché le colonne non ci sono, la pagina funziona senza.
  const { data: campiLavori = false } = useQuery({
    queryKey: ["appalto-contratti-campi-lavori"], staleTime: 10 * 60_000,
    queryFn: async () => !(await db.from("appalto_contratti").select("oggetto_lavori").limit(1)).error,
  });
  const contratto = useQuery({
    queryKey: ["appalto-contratto", contrattoId], enabled: !nuovo,
    queryFn: async () => {
      const { data, error } = await db.from("appalto_contratti").select("*").eq("id", contrattoId).eq("committente_id", id).maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });
  const tariffeSalvate = useQuery({
    queryKey: ["appalto-tariffe", contrattoId], enabled: !nuovo && vedeImporti,
    queryFn: async () => {
      const { data, error } = await db.from("appalto_tariffe").select("*").eq("contratto_id", contrattoId).eq("attivo", true).order("ordine", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
  const listinoGenerale = useQuery({
    queryKey: ["listino-generale-voci", companyId], enabled: !!companyId && vedeImporti, staleTime: 60_000,
    queryFn: async () => {
      const tutte: VoceGenerale[] = [];
      for (let da = 0; da < 5000; da += 1000) {
        const { data, error } = await db.from("tariffe_aziendali").select("id, codice, nome").eq("company_id", companyId).eq("attivo", true)
          .order("nome").order("id").range(da, da + 999);
        if (error) throw error;
        tutte.push(...((data ?? []) as VoceGenerale[]));
        if ((data ?? []).length < 1000) break;
      }
      return tutte;
    },
  });
  const vociGenerali = listinoGenerale.data ?? [];
  const altriContratti = useQuery({
    queryKey: ["appalto-contratti-azienda", companyId], enabled: !!companyId && vedeImporti,
    queryFn: async () => {
      const { data, error } = await db.from("appalto_contratti").select("id, nome").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });

  const base: Bozza | null = useMemo(() => {
    const c = contratto.data;
    if (!nuovo && !c) return null;
    const t = (k: string, d = ""): string => String(c?.[k] ?? d);
    return {
      nome: t("nome", `Accordo ${new Date().getFullYear()}`), oggetto_lavori: t("oggetto_lavori"), luogo_lavori: t("luogo_lavori"), firmatario_committente: t("firmatario_committente"),
      valido_dal: t("valido_dal", oggiISO()), valido_al: t("valido_al"), riferimento_committente: t("riferimento_committente"),
      giorni_pagamento: t("giorni_pagamento", "30"), ritenuta_pct: t("ritenuta_pct", "0"),
      maggiorazione_straordinario_pct: t("maggiorazione_straordinario_pct", "0"), maggiorazione_festivo_pct: t("maggiorazione_festivo_pct", "0"),
      modo_fatturazione: t("modo_fatturazione", "per_commessa"), regime_iva: t("regime_iva", "ordinaria"), include_fornitura: !!c?.include_fornitura,
      condizioni: nuovo ? testoDelModello(predefinito) : t("condizioni"),
    };
  }, [nuovo, contratto.data, predefinito]);
  const [modifiche, setModifiche] = useState<Partial<Bozza>>({});
  const b: Bozza | null = base ? { ...base, ...modifiche } : null;
  const cambia = (p: Partial<Bozza>): void => setModifiche((m) => ({ ...m, ...p }));

  const righeBase: RigaTariffa[] = useMemo(() => (tariffeSalvate.data ?? []).map((t) => ({
    chiave: String(t.id), id: String(t.id), tipo: String(t.tipo), descrizione: String(t.descrizione), unita_misura: String(t.unita_misura), prezzo: formatDecimalIT(Number(t.prezzo_unitario)),
    tariffa_id: (t.tariffa_id as string | null) ?? null,
  })), [tariffeSalvate.data]);
  const [righeModificate, setRighe] = useState<RigaTariffa[] | null>(null);
  const righe = righeModificate ?? (righeBase.length || !nuovo ? righeBase : [rigaVuota()]);
  const visibili = righe.filter((r) => !r.tolta);
  const cambiaRiga = (chiave: string, p: Partial<RigaTariffa>): void => setRighe(righe.map((r) => (r.chiave === chiave ? { ...r, ...p } : r)));
  const aggiungi = (): void => setRighe([...righe, rigaVuota()]);
  // Una tariffa già salvata si spegne, non si cancella: i rendiconti fatti la citano.
  const togli = (r: RigaTariffa): void => setRighe(r.id ? righe.map((x) => (x.chiave === r.chiave ? { ...x, tolta: true } : x)) : righe.filter((x) => x.chiave !== r.chiave));
  const copiaDa = async (origine: string): Promise<void> => {
    const { data, error } = await db.from("appalto_tariffe").select("tipo, descrizione, unita_misura, prezzo_unitario, tariffa_id").eq("contratto_id", origine).eq("attivo", true).order("ordine", { ascending: true });
    if (error) { toast({ title: "Tariffe non copiate", description: "Riprova.", variant: "destructive" }); return; }
    const nuove = ((data ?? []) as Array<Record<string, unknown>>).map((t) => ({ chiave: `n${++contatore}`, tipo: String(t.tipo), descrizione: String(t.descrizione), unita_misura: String(t.unita_misura), prezzo: formatDecimalIT(Number(t.prezzo_unitario)), tariffa_id: (t.tariffa_id as string | null) ?? null }));
    setRighe([...righe.filter((r) => r.id || r.descrizione.trim()), ...nuove]);
  };

  const scegliModello = (mid: string): void => {
    setModelloId(mid);
    const m = modelli.find((x) => x.id === mid);
    if (m) cambia({ condizioni: testoDelModello(m) });
  };

  const datiPdf = useCallback(async () => {
    const societari = await caricaDatiSocietari(supabase, companyId);
    const num = (v: string): number => Number(String(v).replace(",", ".")) || 0;
    return datiDaAccordo({
      societari, companyId, committente: committente.data ?? {},
      accordo: { ...b, giorni_pagamento: num(b?.giorni_pagamento ?? "0"), ritenuta_pct: num(b?.ritenuta_pct ?? "0"), maggiorazione_straordinario_pct: num(b?.maggiorazione_straordinario_pct ?? "0"), maggiorazione_festivo_pct: num(b?.maggiorazione_festivo_pct ?? "0") },
      tariffe: visibili.filter((r) => r.descrizione.trim()).map((r) => ({ tipo: r.tipo, descrizione: r.descrizione, unita_misura: r.unita_misura, prezzo_unitario: parseDecimalIT(r.prezzo), attivo: true })),
      vessatorie: (modello?.clausole ?? []).filter((c) => c.vessatoria).map((c) => c.titolo.trim()),
    });
  }, [b, visibili, modello, committente.data, companyId]);
  const anteprima = useCallback(async () => {
    const { contrattoClienteBlob } = await import("@/components/contratti/ContrattoClientePDF");
    return createPdfPreviewUrl(await contrattoClienteBlob(await datiPdf()));
  }, [datiPdf]);

  const mancante = !b?.nome.trim() ? "Scrivi il nome del contratto." : campiLavori && !b.oggetto_lavori.trim() ? "Scrivi l'oggetto dei lavori." : "";
  const salva = useMutation({
    mutationFn: async () => {
      if (!b) return;
      const num = (v: string): number => Number(String(v).replace(",", ".")) || 0;
      const riga = {
        company_id: companyId, committente_id: id, nome: b.nome.trim(), valido_dal: b.valido_dal || oggiISO(), valido_al: b.valido_al || null,
        giorni_pagamento: num(b.giorni_pagamento), ritenuta_pct: num(b.ritenuta_pct), maggiorazione_straordinario_pct: num(b.maggiorazione_straordinario_pct),
        maggiorazione_festivo_pct: num(b.maggiorazione_festivo_pct), modo_fatturazione: b.modo_fatturazione, regime_iva: b.regime_iva, include_fornitura: b.include_fornitura,
        riferimento_committente: b.riferimento_committente.trim() || null, condizioni: b.condizioni.trim() || null,
        ...(campiLavori ? { oggetto_lavori: b.oggetto_lavori.trim() || null, luogo_lavori: b.luogo_lavori.trim() || null, firmatario_committente: b.firmatario_committente.trim() || null } : {}),
      };
      const salvato = nuovo ? await db.from("appalto_contratti").insert(riga).select("id").single() : await db.from("appalto_contratti").update(riga).eq("id", contrattoId).select("id").single();
      if (salvato.error) throw salvato.error;
      const idContratto = salvato.data.id as string;
      if (vedeImporti) {
        for (const [ordine, r] of righe.entries()) {
          if (r.tolta && r.id) { const { error } = await db.from("appalto_tariffe").update({ attivo: false }).eq("id", r.id); if (error) throw error; continue; }
          if (r.tolta || !r.descrizione.trim()) continue;
          const t = { company_id: companyId, contratto_id: idContratto, tipo: r.tipo, descrizione: r.descrizione.trim(), unita_misura: r.unita_misura, prezzo_unitario: parseDecimalIT(r.prezzo), tariffa_id: r.tariffa_id ?? null, ordine, attivo: true };
          const { error } = r.id ? await db.from("appalto_tariffe").update(t).eq("id", r.id) : await db.from("appalto_tariffe").insert(t);
          if (error) throw error;
        }
      }
      const [{ contrattoClienteBlob }, dati] = await Promise.all([import("@/components/contratti/ContrattoClientePDF"), datiPdf()]);
      const url = URL.createObjectURL(await contrattoClienteBlob(dati));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contratto ${b.nome}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onSuccess: () => {
      for (const k of ["appalto-contratti", "appalto-contratto", "appalto-tariffe"]) void queryClient.invalidateQueries({ queryKey: [k] });
      toast({ title: "Contratto salvato" });
      navigate(`/azienda/committenti/${id}`);
    },
    onError: (e) => toast({ title: "Contratto non salvato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  if (!b || committente.isLoading) return <p role="status" className="p-4 text-sm text-muted-foreground">Apro il contratto…</p>;
  if (!committente.data) return <p role="alert" className="p-4 text-sm">Committente non trovato.</p>;
  const numero = (k: keyof Bozza, etichetta: string, max: number) => (
    <div className="space-y-1"><Label htmlFor={k}>{etichetta}</Label>
      <Input id={k} type="number" min={0} max={max} value={String(b[k])} disabled={!puoModificare} onChange={(e) => cambia({ [k]: e.target.value })} /></div>
  );

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="h-9 px-2"><Link to={`/azienda/committenti/${id}`} aria-label="Torna al committente"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <Input aria-label="Nome del contratto" className="h-9 min-w-[12rem] flex-1" value={b.nome} disabled={!puoModificare} onChange={(e) => cambia({ nome: e.target.value })} />
        <span className="text-sm text-muted-foreground">{nomeDi(committente.data)}</span>
        {puoModificare && (
          <Button size="sm" className="h-9 gap-1.5" disabled={!!mancante || salva.isPending} title={mancante} onClick={() => salva.mutate()}>
            {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Salva e scarica PDF
          </Button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <div className="min-w-0 space-y-3">
          <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Passi del contratto">
            {PASSI.map((p, i) => (
              <button key={p} type="button" role="tab" aria-selected={passo === i} onClick={() => setPasso(i)}
                className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium", passo === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{i + 1}. {p}</button>
            ))}
          </div>

          {passo === 0 && (
            <section aria-label="Lavori" className="grid gap-3 sm:grid-cols-2">
              {campiLavori && <>
                <div className="space-y-1 sm:col-span-2"><Label htmlFor="oggetto">Oggetto dei lavori</Label>
                  <Textarea id="oggetto" rows={3} value={b.oggetto_lavori} disabled={!puoModificare} placeholder="Opere di manodopera per posa e finiture nei cantieri del committente" onChange={(e) => cambia({ oggetto_lavori: e.target.value })} /></div>
                <div className="space-y-1 sm:col-span-2"><Label htmlFor="luogo">Luogo dei lavori</Label>
                  <Input id="luogo" value={b.luogo_lavori} disabled={!puoModificare} placeholder="Un indirizzo, oppure: vari, come da singoli ordini" onChange={(e) => cambia({ luogo_lavori: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="firmatario">Chi firma per il committente</Label>
                  <Input id="firmatario" value={b.firmatario_committente} disabled={!puoModificare} onChange={(e) => cambia({ firmatario_committente: e.target.value })} /></div>
              </>}
              <div className="space-y-1"><Label htmlFor="riferimento">Loro riferimento (n° ordine)</Label>
                <Input id="riferimento" value={b.riferimento_committente} disabled={!puoModificare} onChange={(e) => cambia({ riferimento_committente: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="dal">Valido dal</Label><Input id="dal" type="date" value={b.valido_dal} disabled={!puoModificare} onChange={(e) => cambia({ valido_dal: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="al">Valido al</Label><Input id="al" type="date" value={b.valido_al} disabled={!puoModificare} onChange={(e) => cambia({ valido_al: e.target.value })} /></div>
              <div className="sm:col-span-2"><Button size="sm" variant="outline" onClick={() => setPasso(1)}>Avanti: tariffe</Button></div>
            </section>
          )}

          {passo === 1 && (
            <section aria-label="Tariffe e pagamento" className="space-y-4">
              {vedeImporti ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Tariffe concordate</h2>
                    {puoModificare && (altriContratti.data ?? []).filter((c) => c.id !== contrattoId).length > 0 && (
                      <select aria-label="Copia le tariffe da un altro contratto" className="h-8 rounded-md border bg-background px-2 text-xs" value=""
                        onChange={(e) => { if (e.target.value) void copiaDa(e.target.value); }}>
                        <option value="">Copia le tariffe da…</option>
                        {(altriContratti.data ?? []).filter((c) => c.id !== contrattoId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {visibili.map((r, i) => (
                      <div key={r.chiave} className="grid grid-cols-[minmax(0,1fr)_7.5rem_6.5rem_6rem_2rem] items-center gap-1.5">
                        <Input aria-label={`Descrizione tariffa ${i + 1}`} className="h-9" value={r.descrizione} disabled={!puoModificare} placeholder="Operaio specializzato" onChange={(e) => cambiaRiga(r.chiave, { descrizione: e.target.value })} />
                        <select aria-label={`Tipo tariffa ${i + 1}`} className={selectClasse} value={r.tipo} disabled={!puoModificare} onChange={(e) => cambiaRiga(r.chiave, { tipo: e.target.value })}>{TIPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <select aria-label={`Unità tariffa ${i + 1}`} className={selectClasse} value={r.unita_misura} disabled={!puoModificare} onChange={(e) => cambiaRiga(r.chiave, { unita_misura: e.target.value })}>{UNITA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <Input aria-label={`Prezzo tariffa ${i + 1}`} className="h-9 text-right tabular-nums" inputMode="decimal" value={r.prezzo} disabled={!puoModificare} placeholder="0,00"
                          onChange={(e) => cambiaRiga(r.chiave, { prezzo: e.target.value })}
                          onBlur={() => r.prezzo.trim() && cambiaRiga(r.chiave, { prezzo: formatDecimalIT(parseDecimalIT(r.prezzo)) })}
                          onKeyDown={(e) => { if (e.key === "Enter" && i === visibili.length - 1) { e.preventDefault(); aggiungi(); } }} />
                        {puoModificare && <Button variant="ghost" size="sm" className="h-9 px-1.5" aria-label={`Togli ${r.descrizione || "tariffa"}`} onClick={() => togli(r)}><X className="h-4 w-4" /></Button>}
                        <VoceDelListino indice={i} riga={r} voci={vociGenerali} disabled={!puoModificare}
                          onScegli={(v) => cambiaRiga(r.chiave, { tariffa_id: v?.id ?? null, ...(v && !r.descrizione.trim() ? { descrizione: v.nome } : {}) })} />
                      </div>
                    ))}
                  </div>
                  {puoModificare && <Button size="sm" variant="outline" onClick={aggiungi}><Plus className="mr-1.5 h-3.5 w-3.5" />Aggiungi tariffa</Button>}
                </div>
              ) : <p className="text-sm text-muted-foreground">Le tariffe le vede chi ha il permesso «Importi delle commesse».</p>}

              <div className="grid gap-3 sm:grid-cols-2">
                {numero("giorni_pagamento", "Giorni di pagamento", 365)}
                {numero("ritenuta_pct", "Ritenuta a garanzia %", 100)}
                <div className="space-y-1"><Label htmlFor="fatturazione">Come si fattura</Label>
                  <select id="fatturazione" className={selectClasse} value={b.modo_fatturazione} disabled={!puoModificare} onChange={(e) => cambia({ modo_fatturazione: e.target.value })}>
                    <option value="per_commessa">Per commessa</option><option value="mensile_cumulativa">Mensile, tutte le commesse</option></select></div>
                <div className="space-y-1"><Label htmlFor="iva">IVA in fattura</Label>
                  <select id="iva" className={selectClasse} value={b.regime_iva} disabled={!puoModificare} onChange={(e) => cambia({ regime_iva: e.target.value })}>
                    <option value="ordinaria">Ordinaria</option><option value="reverse_charge">Reverse charge</option></select></div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Altre opzioni</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {numero("maggiorazione_straordinario_pct", "Maggiorazione straordinario %", 200)}
                  {numero("maggiorazione_festivo_pct", "Maggiorazione festivo %", 200)}
                  <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={b.include_fornitura} disabled={!puoModificare} onCheckedChange={(v) => cambia({ include_fornitura: v })} />Comprende la fornitura dei materiali</label>
                </div>
              </details>
              <Button size="sm" variant="outline" onClick={() => setPasso(2)}>Avanti: condizioni</Button>
            </section>
          )}

          {passo === 2 && (
            <section aria-label="Condizioni" className="space-y-3">
              <div className="space-y-1"><Label htmlFor="modello">Modello di condizioni</Label>
                <select id="modello" className={selectClasse} value={modello?.id ?? ""} disabled={!puoModificare || !puoRiscrivere} onChange={(e) => scegliModello(e.target.value)}>
                  {!modello && <option value="">Nessun modello</option>}
                  {modelli.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                {modello && <p className="text-xs text-muted-foreground">{modello.clausole.length} clausole{modello.clausole.some((c) => c.vessatoria) ? `, ${modello.clausole.filter((c) => c.vessatoria).length} da approvare a parte con la seconda firma` : ""}. Le prende da Contratti e condizioni.</p>}
              </div>
              <div className="space-y-1"><Label htmlFor="condizioni">Per questo committente</Label>
                <Textarea id="condizioni" rows={14} value={b.condizioni} disabled={!puoModificare || !puoRiscrivere} onChange={(e) => cambia({ condizioni: e.target.value })} />
                <p className="text-xs text-muted-foreground">{puoRiscrivere ? "Se cambi qualcosa qui, il modello resta com'è." : "Per cambiarle serve il permesso «Riscrivere le condizioni su un documento»."}</p>
              </div>
            </section>
          )}
        </div>

        <aside aria-label="Il PDF del contratto" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <div className="h-[78dvh] min-h-[420px]">
            <PdfBlobLivePreviewPanel renderBlobUrl={anteprima} depsKey={JSON.stringify([b, visibili, modello?.id])} debounceMs={700} downloadFileName={`Contratto ${b.nome}.pdf`} headerLabel="PDF del contratto" />
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Collega la tariffa del committente alla voce del listino generale. Ricerca col datalist del browser
 * (codice o descrizione); si salva l'id. Senza collegamento la tariffa vale solo per manodopera e
 * rendiconto, non per le voci che l'ufficio aggiunge al rapportino.
 */
function VoceDelListino({ indice, riga, voci, disabled, onScegli }: {
  indice: number; riga: RigaTariffa; voci: VoceGenerale[]; disabled: boolean; onScegli: (v: VoceGenerale | null) => void;
}) {
  const scelta = voci.find((v) => v.id === riga.tariffa_id) ?? null;
  const [testo, setTesto] = useState<string | null>(null);
  const valore = testo ?? (scelta ? nomeVoce(scelta) : "");
  const idLista = `voci-listino-${riga.chiave}`;
  return (
    <div className="col-span-full -mt-0.5 mb-1 flex items-center gap-1.5 pl-1 text-xs text-muted-foreground">
      <span className="shrink-0">Voce del listino generale:</span>
      <Input aria-label={`Voce del listino generale per la tariffa ${indice + 1}`} list={idLista} className="h-7 max-w-md text-xs" disabled={disabled}
        placeholder="Nessuna: cerca per codice o descrizione" value={valore}
        onChange={(e) => {
          const t = e.target.value;
          setTesto(t);
          const v = voci.find((x) => nomeVoce(x) === t);
          if (v) { onScegli(v); setTesto(null); } else if (!t.trim()) onScegli(null);
        }}
        onBlur={() => setTesto(null)} />
      <datalist id={idLista}>{voci.map((v) => <option key={v.id} value={nomeVoce(v)} />)}</datalist>
      {riga.tariffa_id && !scelta && voci.length > 0 && <span className="text-amber-700">voce non più attiva</span>}
    </div>
  );
}
