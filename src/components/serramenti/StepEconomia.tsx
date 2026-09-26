/**
 * StepEconomia — Step 6 wizard: totale preventivo + Ecobonus + recupero 10 anni.
 *
 * Sezioni:
 *  - Riepilogo BOM (auto-calcolato)
 *  - Sconto / totale documento
 *  - Configurazione finanziamento (anticipo % + piani)
 *  - Detrazione fiscale (50% prima casa / 36% altre abitazioni, da incentivi.ts)
 *  - Calcolo risparmio energetico
 *  - Grafico recupero economico 10 anni
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Euro, TrendingUp, Leaf, Calculator, Calendar, HelpCircle,
  Wallet, Tag, CreditCard, Plus, Trash2,
  CheckCircle2, AlertTriangle, ShieldAlert, Info,
  Lock, Send, TrendingDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDiscountRules } from "@/hooks/useDiscountRules";
import { usePrezzoFinaleAMano } from "@/hooks/usePrezzoFinaleAMano";
import { evaluateDiscountRules, classifyDiscount } from "@/lib/serramenti/discountRules";
import {
  useTabelleFinanziamentoAttive,
  useTabellaFinanziamentoRighe,
  findMigliorRiga,
  getDurateUniche,
} from "@/hooks/useTabelleFinanziamento";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { calcolaTotale, IVA_MISTA_SENTINEL } from "@/lib/serramenti/calcoli";
import {
  calcolaEcobonus, calcolaCashflow, calcolaPianoFinanziamento,
  ALIQUOTE_DETRAZIONE_SERRAMENTI, aliquotaDetrazioneSerramenti,
} from "@/lib/serramenti/ecobonus";
import {
  calcolaRisparmio, zonaDaCap, bollettaMediaRiscaldamento,
  type ZonaClimatica,
} from "@/lib/serramenti/risparmio";
import type {
  SrProgettoRow, SrProgettoDetail, SrPianoFinanziamento, SrCashflowRiga,
  SrSchemaPagamento, SrPagamentoMilestone,
} from "@/types/serramenti";
import { SR_SCHEMI_PAGAMENTO } from "@/types/serramenti";
import { SrCard, SrKpi, SrCallout } from "@/lib/serramenti/wizardUI";
import { formatEuro, formatPct, formatNumero } from "@/lib/serramenti/format";
// Recharts per il nuovo grafico ROI (sostituisce il vecchio SVG inline)
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ReferenceLine, ReferenceDot, ResponsiveContainer,
} from "recharts";

/** Aliquote IVA standard supportate dal Select. */
const IVA_STANDARD_VALUES = new Set([0, 4, 10, 22]);

// IVA_MISTA_SENTINEL importato da @/lib/serramenti/calcoli (unica fonte di
// verità): prima era ridefinito qui localmente → se il sentinel cambiava nel
// modulo calcoli, l'IVA mista si rompeva in silenzio.

/**
 * Resolve il valore stringa del Select dato il numero (o null) dal form.
 * Gestisce: aliquote standard, sentinel mista, valori legacy non standard
 * (es. preventivi vecchi salvati a 21% o 27%).
 */
function ivaSelectValue(iva: number | null | undefined): string {
  if (iva === IVA_MISTA_SENTINEL) return "mista";
  if (iva == null) return "10"; // default UI
  if (IVA_STANDARD_VALUES.has(iva)) return String(iva);
  return String(iva); // legacy: mostriamo il valore reale (sara' rimappato)
}

/** True se il valore IVA non e' nello standard (e' un legacy da correggere). */
function isLegacyIvaValue(iva: number | null | undefined): boolean {
  if (iva == null) return false;
  if (iva === IVA_MISTA_SENTINEL) return false;
  return !IVA_STANDARD_VALUES.has(iva);
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}

export function StepEconomia({ progettoId, detail, form, onChange }: Props) {
  // ─── Auth + permission gating ────────────────────────────────────────────
  // Solo admin/titolare possono:
  //  - modificare lo sconto (i commerciali base vedono i campi read-only)
  //  - vedere il margine (prezzo di acquisto + margine netto)
  //  - approvare richieste di sconto fuori regola
  // I commerciali con permesso edit_marketing possono richiedere approvazione
  // ma non bypassare le regole.
  const { user } = useAuth();
  const permissions = usePermissions();
  // "isAdmin" qui = autorizzato a IMPOSTARE/APPROVARE sconti oltre soglia
  // nell'azienda selezionata (admin d'azienda o staff con can_approve_discounts).
  // Prima usava il ruolo GLOBALE → uno staff marketing multi-azienda poteva forzare
  // sconti anche in un'azienda dove non è autorizzato. La VISTA MARGINI è separata.
  const isAdmin = permissions.canApproveDiscounts;
  const canViewImpresa = permissions.canViewMargins || permissions.canViewCosts;
  const qc = useQueryClient();

  // ─── Calcoli BOM ──────────────────────────────────────────────────────────
  const totaleCalc = useMemo(() =>
    calcolaTotale(
      detail.serramenti,
      detail.accessori,
      {
        // Default IVA = 10% (aliquota ristrutturazione edilizia, caso piu'
        // comune per serramenti). Le altre aliquote standard sono 0, 4, 22.
        // Sentinel -1 = "IVA mista" (calcolo riga-per-riga, vedi commento sotto).
        iva_percentuale: form.iva_percentuale ?? 10,
        sconto_percentuale: form.sconto_percentuale ?? 0,
        sconto_importo: form.sconto_importo ?? 0,
        // Prezzo pieno scritto a mano: prende il posto della somma delle voci.
        prezzo_manuale: form.prezzo_manuale ?? null,
      },
      detail.servizi ?? [],
    ),
    [detail.serramenti, detail.accessori, detail.servizi, form.iva_percentuale, form.sconto_percentuale, form.sconto_importo, form.prezzo_manuale],
  );

  // ─── Prezzo scritto a mano ───────────────────────────────────────────────
  // Per chi non carica i prezzi del listino: le voci restano a 0 € e il prezzo
  // si scrive qui. Il campo compare se l'azienda l'ha acceso (Impostazioni →
  // Margini), e resta visibile su un preventivo che ha già un prezzo scritto,
  // così lo si può togliere anche dopo che l'opzione è stata spenta.
  const { data: prezzoAManoAttivo = false } = usePrezzoFinaleAMano(detail.progetto.company_id);
  const mostraPrezzoAMano = prezzoAManoAttivo || totaleCalc.prezzo_manuale;
  // IVA mista col prezzo scritto a mano: la regola dei beni significativi
  // ripartisce l'imponibile come le voci. Con le voci tutte a 0 € non c'è niente
  // da ripartire, e l'aliquota va scelta.
  const ivaMistaSenzaVoci = totaleCalc.prezzo_manuale && totaleCalc.somma_voci <= 0;
  const salvaPrezzoManuale = (testo: string) => {
    const pulito = testo.trim();
    const valore = Number(pulito);
    onChange("prezzo_manuale", pulito === "" || !Number.isFinite(valore) || valore <= 0 ? null : roundMoney(valore));
  };

  const importoDocumento = useMemo(
    () => roundMoney(totaleCalc.totale_iva_inclusa),
    [totaleCalc.totale_iva_inclusa],
  );
  const forbice = useMemo(
    () => ({ min: importoDocumento, max: importoDocumento, media: importoDocumento }),
    [importoDocumento],
  );

  // totale_min/max sulla riga del preventivo li scrive il wizard in ogni passo
  // (righePreventivo.ts), con lo stesso calcolo.

  // ─── Sconto: collegamento alle regole azienda ────────────────────────────
  // Replica client-side del compute_max_discount SQL: valuta in tempo reale
  // quale regola scatta sulla base di importo + tipo lavoro + (opz.) tags
  // cliente. L'utente vede il verdetto live mentre digita lo sconto.
  const { data: discountRules = [] } = useDiscountRules();
  const discountEval = useMemo(
    () =>
      evaluateDiscountRules(discountRules, {
        importo: totaleCalc.imponibile_netto + totaleCalc.sconto, // subtotal pre-sconto
        tipoLavoro: "serramenti",
        // salespersonId/clientTags: non disponibili sul progetto serramenti,
        // per ora solo regole "globale" e "per_cliente_cat" senza tag matchano.
      }),
    [discountRules, totaleCalc.imponibile_netto, totaleCalc.sconto],
  );
  const scontoPctCorrente = Number(form.sconto_percentuale ?? 0);
  const discountVerdict = useMemo(
    () => classifyDiscount(scontoPctCorrente, discountEval),
    [scontoPctCorrente, discountEval],
  );

  // Auto-bind la regola principale al progetto: salva discount_rule_id ↔
  // primaryRule.id quando cambia. Permette al PDF e all'audit di sapere
  // QUALE regola era attiva al momento del salvataggio.
  useEffect(() => {
    const targetId = discountEval.primaryRule?.id ?? null;
    if ((form.discount_rule_id ?? null) !== targetId) {
      onChange("discount_rule_id", targetId);
    }
  }, [discountEval.primaryRule?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const costGridIds = useMemo(
    () => Array.from(new Set([
      ...detail.serramenti.map((s) => s.listino_voce_id).filter((v): v is string => !!v),
      ...detail.accessori.map((a) => a.listino_voce_id).filter((v): v is string => !!v),
    ])),
    [detail.serramenti, detail.accessori],
  );

  const { data: costGridRows = [], isFetching: isFetchingGridCosts } = useQuery({
    queryKey: ["sr-margin-grid-costs", progettoId, costGridIds],
    enabled: canViewImpresa && costGridIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Array<{ id: string; prezzo_acquisto: number | null }>> => {
      const { data, error } = await (supabase as any)
        .from("listino_griglia")
        .select("id, prezzo_acquisto")
        .in("id", costGridIds);
      if (error) {
        console.warn("[StepEconomia] listino_griglia cost fetch failed:", error.message);
        return [];
      }
      return (data ?? []).map((row: { id: string; prezzo_acquisto: number | null }) => ({
        id: row.id,
        prezzo_acquisto: row.prezzo_acquisto == null ? null : Number(row.prezzo_acquisto),
      }));
    },
  });

  const prezzoAcquistoByGridId = useMemo(
    () => new Map(costGridRows.map((row) => [row.id, row.prezzo_acquisto])),
    [costGridRows],
  );

  // ─── Margine € + Margine % ──────────────────────────────────────────────
  // Visibile SOLO a isAdmin. Margine reale sul NETTO: vendita imponibile
  // post-sconto meno costo acquisto netto. Se i costi non sono completi, non
  // mostriamo percentuali fuorvianti (es. 100% quando manca il costo).
  const marginCalc = useMemo(() => {
    if (!canViewImpresa) return null;
    let costoTotale = 0;
    let righeConVendita = 0;
    let righeConCosto = 0;
    let righeSenzaCosto = 0;

    const addRiga = (
      venditaRiga: number,
      quantita: number,
      costoEsplicito: number | null | undefined,
      listinoVoceId: string | null | undefined,
    ) => {
      // Col prezzo scritto a mano le voci possono essere a 0 € ma avere un costo:
      // il margine è prezzo scritto meno i costi di tutte le voci.
      if (venditaRiga <= 0 && !totaleCalc.prezzo_manuale) return;
      righeConVendita += 1;
      const explicit = Number(costoEsplicito ?? 0);
      const gridCost = listinoVoceId ? prezzoAcquistoByGridId.get(listinoVoceId) : null;
      const costoRiga = explicit > 0
        ? explicit
        : gridCost != null && gridCost > 0
          ? Number(gridCost) * Math.max(1, quantita || 1)
          : null;
      if (costoRiga != null && costoRiga > 0) {
        costoTotale += costoRiga;
        righeConCosto += 1;
      } else {
        righeSenzaCosto += 1;
      }
    };

    detail.serramenti.forEach((s) => {
      addRiga(
        Number(s.prezzo_totale ?? (s.prezzo_unitario ?? 0) * (s.quantita ?? 1)),
        s.quantita ?? 1,
        (s as { prezzo_costo_totale?: number | null }).prezzo_costo_totale,
        s.listino_voce_id,
      );
    });
    detail.accessori.forEach((a) => {
      const costoAccessorioTotale = (a as { prezzo_costo_totale?: number | null }).prezzo_costo_totale;
      const costoAccessorioUnitario = (a as { prezzo_costo_unitario?: number | null }).prezzo_costo_unitario;
      addRiga(
        Number(a.prezzo_totale ?? (a.prezzo_unitario ?? 0) * (a.quantita ?? 1)),
        a.quantita ?? 1,
        costoAccessorioTotale
          ?? (costoAccessorioUnitario != null ? Number(costoAccessorioUnitario) * (a.quantita ?? 1) : null),
        a.listino_voce_id,
      );
    });
    (detail.servizi ?? []).forEach((m) => {
      addRiga(
        Number(m.prezzo_totale_vendita ?? (m.prezzo_unitario_vendita ?? 0) * (m.quantita ?? 1)),
        m.quantita ?? 1,
        m.prezzo_totale_costo ?? Number(m.prezzo_unitario_costo ?? 0) * (m.quantita ?? 1),
        null,
      );
    });
    const vendita = totaleCalc.imponibile_netto;
    const margine = vendita - costoTotale;
    const costiCompleti = righeConVendita > 0 && righeSenzaCosto === 0 && costoTotale > 0;
    const marginePct = costiCompleti && vendita > 0 ? (margine / vendita) * 100 : null;
    const margineMinPct = discountEval.margineMinPct;
    const sottoTarget = marginePct != null && marginePct < margineMinPct;
    return {
      costoTotale,
      vendita,
      margine,
      marginePct,
      margineMinPct,
      sottoTarget,
      costiCompleti,
      righeConVendita,
      righeConCosto,
      righeSenzaCosto,
      isFetchingGridCosts,
    };
  }, [
    canViewImpresa, isFetchingGridCosts, prezzoAcquistoByGridId,
    detail.serramenti, detail.accessori, detail.servizi,
    totaleCalc.imponibile_netto, totaleCalc.prezzo_manuale, discountEval.margineMinPct,
  ]);

  // ─── Approval workflow ──────────────────────────────────────────────────
  // Query quote_approvals per il preventivo corrente: 1 sola richiesta attiva
  // alla volta (la più recente). Stato: pending | approved | rejected | null.
  const { data: approvalRow } = useQuery({
    queryKey: ["sr-quote-approval", progettoId],
    enabled: !!progettoId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_approvals")
        .select("*")
        .eq("quote_id", progettoId)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[StepEconomia] quote_approvals fetch failed:", error.message);
        return null;
      }
      return data;
    },
  });

  const approvalState: "none" | "pending" | "approved" | "rejected" = useMemo(() => {
    if (!approvalRow) return "none";
    if (approvalRow.decision === "approved") return "approved";
    if (approvalRow.decision === "rejected") return "rejected";
    return "pending";
  }, [approvalRow]);

  /** Richiede approvazione per lo sconto corrente. Crea riga su
   *  quote_approvals con stato 'pending' visibile in /preventivi/approvazioni. */
  const handleRequestApproval = async () => {
    if (!user?.id) {
      toast.error("Sessione non valida. Ricarica la pagina.");
      return;
    }
    try {
      const { error } = await supabase.from("quote_approvals").insert({
        quote_id: progettoId,
        company_id: form.company_id!,
        requested_by: user.id,
        sconto_richiesto_pct: scontoPctCorrente,
        importo_preventivo: totaleCalc.totale_iva_inclusa,
        margine_stimato_pct: marginCalc?.marginePct ?? null,
        note_richiesta: null,
      });
      if (error) throw error;
      toast.success("Richiesta inviata all'amministrazione", {
        description: `Sconto ${scontoPctCorrente}% in attesa di approvazione. Riceverai notifica appena viene decisa.`,
      });
      void qc.invalidateQueries({ queryKey: ["sr-quote-approval", progettoId] });
    } catch (err) {
      toast.error("Impossibile inviare la richiesta", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  // Stato di approvazione effettiva — usato in futuro per badge "applicabile":
  // admin sempre OK, commerciale OK se entro regole o approvato. Per ora non
  // viene letto attivamente (banner + lock fields coprono la UX); lasciamo il
  // calcolo per quando aggiungeremo un'azione "Conferma applicazione sconto".
  void (isAdmin || discountVerdict === "ok" || approvalState === "approved");

  // ─── Finanziamento ────────────────────────────────────────────────────────
  const [anticipoPct, setAnticipoPct] = useState(form.fin_anticipo_pct ?? 40);
  // Modalità: "tabella" usa eic_tabelle_finanziamento (no TAN/TAEG manuali),
  // "manuale" usa i 2 piani Estesa/Standard come prima (fallback).
  const [finModalita, setFinModalita] = useState<"tabella" | "manuale">(
    form.fin_tabella_id ? "tabella" : "manuale",
  );
  const { data: tabelleFinanziamento = [] } = useTabelleFinanziamentoAttive();
  const [tabellaId, setTabellaId] = useState<string | null>(form.fin_tabella_id ?? null);
  const { data: righeTabella = [] } = useTabellaFinanziamentoRighe(tabellaId);
  const durateDisponibili = useMemo(() => getDurateUniche(righeTabella), [righeTabella]);
  const [durataTabella, setDurataTabella] = useState<number | null>(null);
  // Auto-seleziona la prima durata disponibile quando cambia tabella
  useEffect(() => {
    if (durateDisponibili.length > 0 && durataTabella === null) {
      setDurataTabella(durateDisponibili[0]);
    }
  }, [durateDisponibili]); // eslint-disable-line react-hooks/exhaustive-deps

  const [piano1Mesi, setPiano1Mesi] = useState(120);
  const [piano1Tasso, setPiano1Tasso] = useState(5.5);
  const [piano2Mesi, setPiano2Mesi] = useState(60);
  const [piano2Tasso, setPiano2Tasso] = useState(0);

  // ─── Modalità pagamento cliente ──────────────────────────────────────────
  type Milestone = SrPagamentoMilestone;
  // Schema di alto livello: l'utente sceglie il pattern (tutto finanziato /
  // acconto+fin / 2 acconti+fin / 2 acconti+saldo / 3 step / personalizzato).
  // Lo schema determina sia le milestone default sia la visibilità della
  // sezione finanziaria.
  const [schemaPagamento, setSchemaPagamento] = useState<SrSchemaPagamento>(
    (form.schema_pagamento as SrSchemaPagamento | null) ?? "tre_step",
  );
  const schemaCfg = SR_SCHEMI_PAGAMENTO[schemaPagamento];
  const milestoneDefault = schemaCfg.milestones;
  const [milestones, setMilestones] = useState<Milestone[]>(
    (form.pagamento_milestones as Milestone[] | null) ?? milestoneDefault,
  );
  // UID stabili per le key React delle milestone. Map id->uid evitiamo
  // `key={idx}` che causa input "scivolanti" quando si rimuove uno step
  // centrale (gli input mantengono i valori del posto precedente).
  // Stato locale: cresce con le milestone, non viene persistito.
  const milestoneUidsRef = useRef<string[]>([]);
  const getUid = (idx: number) => {
    if (!milestoneUidsRef.current[idx]) {
      milestoneUidsRef.current[idx] = `ms-${Math.random().toString(36).slice(2, 10)}`;
    }
    return milestoneUidsRef.current[idx];
  };
  // Quando l'utente cambia schema, ripopoliamo le milestone con il template.
  const applySchema = (next: SrSchemaPagamento) => {
    setSchemaPagamento(next);
    onChange("schema_pagamento", next);
    setMilestones(SR_SCHEMI_PAGAMENTO[next].milestones);
    milestoneUidsRef.current = []; // reset UIDs: tutto nuovo
  };
  // Sync con prop: se il progetto viene re-fetchato (es. dopo refresh, edit
  // su altra tab), aggiorniamo lo state locale per non mostrare valori stale.
  // Confronto JSON per evitare loop infinito su reference uguali ma identità diversa.
  const formMilestonesKey = JSON.stringify(form.pagamento_milestones ?? null);
  useEffect(() => {
    const incoming = (form.pagamento_milestones as Milestone[] | null) ?? milestoneDefault;
    setMilestones(incoming);
    milestoneUidsRef.current = []; // reset: dati nuovi da server
  }, [formMilestonesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync stati locali con form server post-invalidate ────────────────────
  // Stessa logica usata per milestones (vedi sopra): se il progetto viene
  // ri-fetched (autosave da altra tab, refresh, navigate back/forward) gli
  // stati useState locali restano stale -> l'utente clicca "Applica calcoli"
  // salvando valori vecchi. Risolto con resync esplicito.
  // Chiavi JSON per evitare loop su reference diverse stesso contenuto.
  const formAnticipoPctKey = String(form.fin_anticipo_pct ?? "");
  useEffect(() => {
    setAnticipoPct(form.fin_anticipo_pct ?? 40);
  }, [formAnticipoPctKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const formTabellaIdKey = String(form.fin_tabella_id ?? "");
  useEffect(() => {
    setTabellaId(form.fin_tabella_id ?? null);
    setFinModalita(form.fin_tabella_id ? "tabella" : "manuale");
  }, [formTabellaIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const formSchemaPagamentoKey = String(form.schema_pagamento ?? "");
  useEffect(() => {
    if (form.schema_pagamento) {
      setSchemaPagamento(form.schema_pagamento as SrSchemaPagamento);
    }
  }, [formSchemaPagamentoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const formDetrazioneAliquotaKey = String(form.detrazione_aliquota ?? "");
  useEffect(() => {
    setBonusAttivo((form.detrazione_aliquota ?? 50) > 0);
    setAliquota(aliquotaDetrazioneSerramenti(form.detrazione_aliquota));
  }, [formDetrazioneAliquotaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const formRisparmioCalcolatoKey = String(form.risparmio_calcolato ?? "");
  useEffect(() => {
    setRisparmioAttivo(form.risparmio_calcolato ?? false);
  }, [formRisparmioCalcolatoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const milestonesTotale = milestones.reduce((acc, m) => acc + (Number(m.percentuale) || 0), 0);
  const milestonesOk = milestonesTotale === 100;

  const finCalc = useMemo(() => calcolaPianoFinanziamento({
    importo_totale: forbice.media,
    anticipo_pct: anticipoPct,
    piani: [
      { nome: "Estesa", durata_mesi: piano1Mesi, tasso_annuo_pct: piano1Tasso },
      { nome: "Standard", durata_mesi: piano2Mesi, tasso_annuo_pct: piano2Tasso },
    ],
  }), [forbice.media, anticipoPct, piano1Mesi, piano1Tasso, piano2Mesi, piano2Tasso]);

  // Quando uso una tabella finanziamento configurata: cerco la riga ottimale
  // (importo×durata→importo_rata) dal listino fornitore. Niente TAN/TAEG
  // manuali, il PDF mostra esattamente i dati della tabella.
  const importoFinanziato = Math.max(0, forbice.media - (forbice.media * anticipoPct) / 100);
  const rigaTabellaScelta = useMemo(() => {
    if (finModalita !== "tabella" || !durataTabella || righeTabella.length === 0) return null;
    return findMigliorRiga(righeTabella, importoFinanziato, durataTabella);
  }, [finModalita, durataTabella, righeTabella, importoFinanziato]);

  // ─── Ecobonus ─────────────────────────────────────────────────────────────
  const [bonusAttivo, setBonusAttivo] = useState((form.detrazione_aliquota ?? 50) > 0);
  const [aliquota, setAliquota] = useState<number>(() => aliquotaDetrazioneSerramenti(form.detrazione_aliquota));

  const ecobonusCalc = useMemo(() =>
    bonusAttivo
      ? calcolaEcobonus({ imponibile_eur: forbice.media, aliquota })
      : null,
    [bonusAttivo, forbice.media, aliquota],
  );

  // Quello che questa scheda mostra è quello che esce nel PDF: la detrazione si
  // salva appena cambiano interruttore, aliquota o totale. Prima restava solo a
  // schermo (accesa di default) finché non si premeva «Applica calcoli al
  // progetto», e il PDF usciva senza. 0 = esclusa di proposito; null = mai scelto,
  // e l'interruttore la mostra accesa al 50%.
  useEffect(() => {
    const salvata = form.detrazione_aliquota == null ? null : Number(form.detrazione_aliquota);
    if (!ecobonusCalc) {
      if (salvata !== 0) onChange("detrazione_aliquota", 0);
      return;
    }
    const centesimi = (n: unknown) => Math.round(Number(n ?? 0) * 100);
    if (
      salvata === ecobonusCalc.aliquota &&
      centesimi(form.detrazione_eur_totale) === centesimi(ecobonusCalc.detrazione_totale) &&
      centesimi(form.detrazione_eur_anno) === centesimi(ecobonusCalc.rata_annuale)
    ) return;
    onChange("detrazione_aliquota", ecobonusCalc.aliquota);
    onChange("detrazione_eur_totale", ecobonusCalc.detrazione_totale);
    onChange("detrazione_eur_anno", ecobonusCalc.rata_annuale);
    // onChange cambia identità a ogni render del wizard: contano solo i valori.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecobonusCalc, form.detrazione_aliquota, form.detrazione_eur_totale, form.detrazione_eur_anno]);

  // ─── Risparmio energetico ─────────────────────────────────────────────────
  const [risparmioAttivo, setRisparmioAttivo] = useState(form.risparmio_calcolato ?? false);
  const [m2Casa, setM2Casa] = useState(100);
  const [uwAttuale, setUwAttuale] = useState(2.8);
  const [uwNuovo, setUwNuovo] = useState(1.1);
  const [bollettaAttuale, setBollettaAttuale] = useState<number>(0);

  const zonaClimatica: ZonaClimatica = useMemo(() => {
    const cap = form.cantiere_cap || form.cliente_cap;
    return (form.cantiere_zona_climatica as ZonaClimatica) || zonaDaCap(cap);
  }, [form.cantiere_zona_climatica, form.cantiere_cap, form.cliente_cap]);

  useEffect(() => {
    if (bollettaAttuale === 0) {
      setBollettaAttuale(bollettaMediaRiscaldamento(zonaClimatica, m2Casa));
    }
  }, [zonaClimatica, m2Casa]); // eslint-disable-line react-hooks/exhaustive-deps

  const risparmioCalc = useMemo(() =>
    risparmioAttivo && totaleCalc.metri_quadri > 0
      ? calcolaRisparmio({
          zona_climatica: zonaClimatica,
          m2_serramenti: totaleCalc.metri_quadri,
          uw_attuale: uwAttuale,
          uw_nuovo: uwNuovo,
          bolletta_attuale_anno: bollettaAttuale || undefined,
        })
      : null,
    [risparmioAttivo, totaleCalc.metri_quadri, zonaClimatica, uwAttuale, uwNuovo, bollettaAttuale],
  );

  // ─── Cashflow 10 anni ─────────────────────────────────────────────────────
  const cashflow = useMemo(() => {
    if (!risparmioCalc || !ecobonusCalc) return null;
    return calcolaCashflow({
      costo_iniziale: forbice.media,
      risparmio_eur_anno: risparmioCalc.risparmio_eur_anno,
      detrazione_eur_anno: ecobonusCalc.rata_annuale,
      inflazione_energia_pct: 3,
    });
  }, [risparmioCalc, ecobonusCalc, forbice.media]);

  // Salva finanziamento + detrazione nel progetto
  const handleSalvaCalcoli = () => {
    // Se uso una tabella finanziamento configurata, costruisco UN SOLO piano
    // basato sulla riga scelta (TAN/TAEG/rata letti dalla tabella). Altrimenti
    // fallback ai 2 piani manuali Estesa/Standard.
    let piani: SrPianoFinanziamento[];
    if (finModalita === "tabella" && rigaTabellaScelta) {
      piani = [{
        nome: tabelleFinanziamento.find((t) => t.id === tabellaId)?.nome_prodotto ?? "Finanziamento",
        mesi: rigaTabellaScelta.durata_mesi,
        tasso: rigaTabellaScelta.tan ?? 0,
        rata_mese: rigaTabellaScelta.importo_rata,
        anticipo: finCalc.anticipo,
        finanziato: importoFinanziato,
      }];
      onChange("fin_tabella_id", tabellaId);
      onChange("fin_tabella_riga_id", rigaTabellaScelta.id);
    } else {
      piani = finCalc.piani.map((p) => ({
        nome: p.nome, mesi: p.mesi, tasso: p.tasso,
        rata_mese: p.rata_mese, anticipo: finCalc.anticipo, finanziato: finCalc.finanziato,
      }));
      onChange("fin_tabella_id", null);
      onChange("fin_tabella_riga_id", null);
    }
    onChange("fin_anticipo_pct", anticipoPct);
    onChange("fin_piani", piani);
    // Persisti modalità pagamento se l'utente l'ha personalizzata
    onChange("pagamento_milestones", milestones);
    if (ecobonusCalc) {
      onChange("detrazione_aliquota", ecobonusCalc.aliquota);
      onChange("detrazione_eur_totale", ecobonusCalc.detrazione_totale);
      onChange("detrazione_eur_anno", ecobonusCalc.rata_annuale);
    } else {
      // 0 e non null: null tornerebbe a mostrarla accesa al prossimo caricamento.
      onChange("detrazione_aliquota", 0);
    }
    if (risparmioCalc) {
      onChange("risparmio_calcolato", true);
      onChange("risparmio_eur_anno", risparmioCalc.risparmio_eur_anno);
      onChange("co2_risparmiata_t_anno", risparmioCalc.co2_risparmiata_kg_anno / 1000);
      onChange("cantiere_zona_climatica", risparmioCalc.zona_climatica);
    } else {
      onChange("risparmio_calcolato", false);
    }
    if (cashflow) {
      onChange("payback_anni", cashflow.payback_anni);
    }
  };

  return (
    <div className="space-y-3">
      {/* Riepilogo BOM */}
      <SrCard
        title="Riepilogo composizione"
        description={`${detail.serramenti.length} serramenti · ${detail.accessori.length} complementi · ${(detail.servizi ?? []).length} servizi · ${formatNumero(totaleCalc.metri_quadri, 2)} m²`}
        icon={<Calculator className="h-4 w-4" />}
      >
        {/* Telefono: le tre voci in riga; imponibile e totale li dice il riquadro «Totale» sotto. */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 max-md:grid-cols-3">
          {/* La posa è nel prezzo solo degli articoli che la hanno a listino. */}
          <SrKpi label="Serramenti" value={formatEuro(totaleCalc.imponibile_serramenti)} hint="Posa compresa dove prevista" />
          <SrKpi label="Complementi" value={formatEuro(totaleCalc.imponibile_accessori)} />
          <SrKpi label="Servizi" value={formatEuro(totaleCalc.imponibile_servizi)} hint="Trasporto, ENEA, ecc." />
          <SrKpi
            className="max-md:hidden"
            label="Imponibile"
            value={formatEuro(totaleCalc.imponibile_netto)}
            hint={[
              totaleCalc.prezzo_manuale ? "Prezzo scritto a mano" : null,
              totaleCalc.sconto > 0 ? `Sconto: -${formatEuro(totaleCalc.sconto)}` : null,
            ].filter(Boolean).join(" · ") || undefined}
          />
          <SrKpi label="IVA inclusa" value={formatEuro(totaleCalc.totale_iva_inclusa)} variant="primary" className="max-md:hidden" />
        </div>
      </SrCard>

      {/* Sconto + totale */}
      <SrCard
        title="Totale preventivo (PDF cliente)"
        description={totaleCalc.prezzo_manuale
          ? "Il PDF mostra il totale di questa revisione: sconto, imponibile e IVA si calcolano dal prezzo scritto qui sotto."
          : "Il PDF mostra il totale di questa revisione: sconto, imponibile e IVA si calcolano dalle righe dell'offerta."}
        icon={<Euro className="h-4 w-4" />}
      >
        {/* ─── Prezzo scritto a mano ──────────────────────────────────────
            Prezzo pieno IVA esclusa, al posto della somma delle voci. Sconto
            e IVA lavorano sopra, così nell'offerta si vedono prezzo, sconto e
            totale. Acceso per azienda in Impostazioni → Margini. */}
        {mostraPrezzoAMano && (
          <div className="mb-3 rounded-md border border-orange-200 bg-orange-50/50 p-3">
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12 md:col-span-5">
                <Label htmlFor="sr-prezzo-manuale" className="text-xs font-semibold text-orange-900 block h-4">
                  Prezzo del preventivo (IVA esclusa)
                </Label>
                <Input
                  id="sr-prezzo-manuale"
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  key={`prezzo-manuale-${form.prezzo_manuale ?? ""}`}
                  defaultValue={form.prezzo_manuale ?? ""}
                  placeholder={totaleCalc.somma_voci > 0 ? `Somma delle voci: ${formatEuro(totaleCalc.somma_voci, 2)}` : "Scrivi il prezzo"}
                  onBlur={(e) => salvaPrezzoManuale(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="h-9 text-sm mt-1 bg-white tabular-nums"
                />
              </div>
              <div className={`col-span-12 md:col-span-7 text-[11px] text-orange-900/80 leading-snug ${totaleCalc.prezzo_manuale ? "" : "max-md:hidden"}`}>
                {totaleCalc.prezzo_manuale ? (
                  <>
                    Prende il posto della somma delle voci
                    {totaleCalc.somma_voci > 0 ? ` (${formatEuro(totaleCalc.somma_voci, 2)})` : ""}.
                    Sconto e IVA si calcolano su questo prezzo.{" "}
                    <button
                      type="button"
                      className="underline hover:no-underline"
                      onClick={() => onChange("prezzo_manuale", null)}
                    >
                      Torna alla somma delle voci
                    </button>
                  </>
                ) : (
                  <>
                    Vuoto: il prezzo è la somma delle voci ({formatEuro(totaleCalc.somma_voci, 2)}).
                    Scrivilo se non usi i prezzi del listino: sconto e IVA si calcolano sopra.
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {/* ─── Regole scontistica aziendale ───────────────────────────────
            Auto-binding live (mirror del compute_max_discount SQL):
            mostra max sconto, soglia approvazione, margine min in base
            all'importo del preventivo + tipo lavoro. Configurabile in
            /azienda/impostazioni/scontistica. */}
        {/* Telefono no: le regole si leggono dal computer; il limite allo sconto vale comunque. */}
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50/60 border-l-4 border-l-[#173b67] p-3 space-y-2 max-md:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#173b67]">
              <Tag className="h-3.5 w-3.5" />
              Regole scontistica aziendale
              {discountEval.isFallback ? (
                <span className="ml-1 text-[10px] font-normal text-slate-500 max-md:hidden">
                  · fallback (nessuna regola matcha → max 10%)
                </span>
              ) : (
                <span className="ml-1 text-[10px] font-normal text-slate-500 max-md:hidden">
                  · {discountEval.matchingRules.length} regol{discountEval.matchingRules.length > 1 ? "e" : "a"} attiv{discountEval.matchingRules.length > 1 ? "e" : "a"}
                </span>
              )}
            </div>
            <a
              href="/azienda/impostazioni/scontistica"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-[#173b67] underline hover:no-underline max-md:hidden"
            >
              Configura regole →
            </a>
          </div>

          {/* KPI binding: max / approva oltre / margine min */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded bg-white border border-slate-200 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-slate-500 font-medium">Sconto max</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">{discountEval.scontoMaxPct.toFixed(1)}%</p>
            </div>
            <div className="rounded bg-white border border-slate-200 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-slate-500 font-medium">Approva oltre</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">
                {discountEval.approvaOltrePct != null ? `${discountEval.approvaOltrePct.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="rounded bg-white border border-slate-200 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-slate-500 font-medium">Margine min</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums">{discountEval.margineMinPct.toFixed(1)}%</p>
            </div>
          </div>

          {/* Regole matchanti (nome) */}
          {discountEval.matchingRules.length > 0 && (
            <p className="text-[10px] text-slate-600 leading-tight max-md:hidden">
              <Info className="inline h-3 w-3 mr-0.5 -mt-0.5" />
              Applicate: {discountEval.matchingRules.map((r) => r.name).join(" · ")}
              {discountEval.primaryRule && discountEval.matchingRules.length > 1 && (
                <span className="text-slate-500"> (principale: {discountEval.primaryRule.name})</span>
              )}
            </p>
          )}
        </div>

        {/* Banner read-only per commerciali base: niente editing diretto sullo
            sconto, lo applica/conferma il titolare. Eccezione: lo possono
            richiedere via "Richiedi approvazione" (sotto). */}
        {!isAdmin && (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-900 flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Lo sconto è gestito dall'amministrazione.<span className="max-md:hidden"> Puoi proporre uno sconto
              superiore al consentito tramite <strong>Richiedi approvazione</strong> —
              il titolare riceverà la richiesta in <em>Preventivi → Approvazioni</em>.</span>
            </span>
          </div>
        )}

        {/* Banner stato approvazione (se richiesta esistente) */}
        {approvalState !== "none" && (
          <div
            className={`mb-3 rounded-md px-3 py-2 text-[11px] flex items-start gap-2 ${
              approvalState === "approved"
                ? "border border-emerald-200 bg-emerald-50/60 text-emerald-900"
                : approvalState === "rejected"
                ? "border border-rose-200 bg-rose-50/60 text-rose-900"
                : "border border-amber-200 bg-amber-50/60 text-amber-900"
            }`}
          >
            {approvalState === "approved" ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              : approvalState === "rejected" ? <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
            <div className="flex-1">
              {approvalState === "approved" && (
                <>
                  <strong>Sconto approvato.</strong> Sconto richiesto: {approvalRow?.sconto_richiesto_pct?.toFixed(1)}% ·
                  {" "}autorizzato: {approvalRow?.sconto_autorizzato_pct?.toFixed(1) ?? "—"}%.
                  {approvalRow?.note_decisione && <span className="block mt-0.5 opacity-80">Nota: {approvalRow.note_decisione}</span>}
                </>
              )}
              {approvalState === "rejected" && (
                <>
                  <strong>Sconto respinto dall'amministrazione.</strong> Richiesto: {approvalRow?.sconto_richiesto_pct?.toFixed(1)}%.
                  {approvalRow?.note_decisione && <span className="block mt-0.5 opacity-80">Motivo: {approvalRow.note_decisione}</span>}
                </>
              )}
              {approvalState === "pending" && (
                <>
                  <strong>Richiesta in attesa.</strong> Sconto {approvalRow?.sconto_richiesto_pct?.toFixed(1)}% inviato il{" "}
                  {approvalRow?.requested_at ? new Date(approvalRow.requested_at).toLocaleDateString("it-IT") : "—"}.
                  L'amministrazione riceve la richiesta in <em>Preventivi → Approvazioni</em>.
                </>
              )}
            </div>
          </div>
        )}

        {/* Grid 4 input + box riepilogo full-width. Tutte le label hanno
            stessa altezza (h-4 fisso) cosi' la riga input e' perfettamente
            allineata. Warning verdetto sotto l'input. */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs block h-4 flex items-center gap-1">
              Sconto %
              {!isAdmin && <Lock className="h-3 w-3 text-blue-500" />}
            </Label>
            <Input
              type="number"
              min={0} max={100} step={0.5}
              key={`sconto-${form.sconto_percentuale}`}
              defaultValue={form.sconto_percentuale ?? 0}
              onBlur={(e) => isAdmin && onChange("sconto_percentuale", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              readOnly={!isAdmin}
              className={`h-9 text-xs mt-1 ${
                !isAdmin
                  ? "bg-slate-50 cursor-not-allowed"
                  : discountVerdict === "blocked"
                  ? "border-red-400 focus-visible:ring-red-400"
                  : discountVerdict === "approve"
                  ? "border-amber-400 focus-visible:ring-amber-400"
                  : ""
              }`}
              title={!isAdmin ? "Solo l'amministrazione può modificare lo sconto. Usa Richiedi approvazione." : undefined}
            />
            {discountVerdict === "blocked" && (
              <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                Oltre max {discountEval.scontoMaxPct.toFixed(1)}% — serve override admin
              </p>
            )}
            {discountVerdict === "approve" && (
              <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Oltre {discountEval.approvaOltrePct?.toFixed(1)}% — richiede approvazione admin
              </p>
            )}
            {discountVerdict === "ok" && scontoPctCorrente > 0 && (
              <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Entro le regole aziendali
              </p>
            )}
            {/* CTA "Richiedi approvazione": visibile a chiunque (admin incluso
                per consistenza) quando discountVerdict != 'ok' e non c'è già
                una richiesta pending/approved/rejected. */}
            {(discountVerdict === "approve" || discountVerdict === "blocked") && approvalState === "none" && scontoPctCorrente > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRequestApproval()}
                className="tap-compact mt-1.5 h-7 text-[11px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <Send className="h-3 w-3" />
                Richiedi approvazione
              </Button>
            )}
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs block h-4 flex items-center gap-1">
              Sconto fisso (€)
              {!isAdmin && <Lock className="h-3 w-3 text-blue-500" />}
            </Label>
            <Input
              type="number"
              min={0} step={10}
              defaultValue={form.sconto_importo ?? 0}
              onBlur={(e) => isAdmin && onChange("sconto_importo", Math.max(0, Number(e.target.value) || 0))}
              readOnly={!isAdmin}
              className={`h-9 text-xs mt-1 ${!isAdmin ? "bg-slate-50 cursor-not-allowed" : ""}`}
              title={!isAdmin ? "Solo l'amministrazione può modificare lo sconto." : undefined}
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs block h-4">IVA</Label>
            <Select
              value={ivaSelectValue(form.iva_percentuale)}
              onValueChange={(v) => {
                // "mista" → sentinel -1 (calcolo riga-per-riga, fallback 10%)
                // numeri standard → applicati direttamente
                const next = v === "mista" ? IVA_MISTA_SENTINEL : Number(v);
                onChange("iva_percentuale", next);
              }}
            >
              {/* Telefono: nel campo chiuso solo l'aliquota («10% —…» tagliato);
                  nell'elenco aperto restano le spiegazioni. */}
              <SelectTrigger className="h-9 text-xs mt-1 max-sm:[&_.iva-desc]:hidden">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0%<span className="iva-desc"> — Esente / Non imponibile</span></SelectItem>
                <SelectItem value="4">4%<span className="iva-desc"> — IVA speciale (Legge 104 / disabilità)</span></SelectItem>
                <SelectItem value="10">10%<span className="iva-desc"> — Ristrutturazione edilizia</span></SelectItem>
                <SelectItem value="22">22%<span className="iva-desc"> — Ordinaria</span></SelectItem>
                <SelectItem value="mista" disabled={ivaMistaSenzaVoci && form.iva_percentuale !== IVA_MISTA_SENTINEL}>
                  IVA mista<span className="iva-desc"> — Beni Significativi (DM 29.12.99)</span>
                </SelectItem>
                {/* Valore legacy fuori standard (es. preventivi vecchi a 21%, 5%,
                    27%): lo mostriamo come opzione cosi' il commerciale
                    sa che e' un valore non standard e puo' correggerlo. */}
                {isLegacyIvaValue(form.iva_percentuale) && (
                  <SelectItem value={String(form.iva_percentuale)}>
                    {form.iva_percentuale}%<span className="iva-desc"> — non standard (legacy)</span>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {/* Hint contestuale per IVA mista: spiega la regola DM 29.12.99
                (Beni Significativi). Il commerciale capisce subito perche'
                vede 10% e 22% simultaneamente nel riepilogo sotto. */}
            {/* La regola dei beni significativi ripartisce l'imponibile come le
                voci: col prezzo scritto e le voci tutte a 0 € non c'è niente da
                ripartire. Il calcolo in quel caso mette tutto al 22%. */}
            {form.iva_percentuale === IVA_MISTA_SENTINEL && ivaMistaSenzaVoci && (
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mt-1 leading-tight">
                ⚠ Con il prezzo scritto a mano e le voci senza prezzo l'IVA mista non si può ripartire: scegli l'aliquota.
              </p>
            )}
            {!ivaMistaSenzaVoci && form.iva_percentuale === IVA_MISTA_SENTINEL && (
              <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-1 mt-1 leading-tight">
                ℹ Regola Beni Significativi (DM 29.12.99): serramenti al 10% fino al valore di posa/accessori, eccedenza al 22%.
              </p>
            )}
            {/* Hint per valore legacy non standard: invita a correggere. */}
            {isLegacyIvaValue(form.iva_percentuale) && (
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mt-1 leading-tight">
                ⚠ Valore non standard. Aliquote IT: 0/4/10/22%. Seleziona quella corretta.
              </p>
            )}
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs block h-4">Validità (giorni)</Label>
            <Input
              type="number"
              defaultValue={form.valido_fino_giorni ?? 15}
              onBlur={(e) => {
                const giorni = Number(e.target.value) || 15;
                onChange("valido_fino_giorni", giorni);
                // La scadenza segue i giorni, dalla creazione come nel PDF: la pagina
                // del cliente e l'avviso «scaduto» leggono la data, che restava
                // quella calcolata alla creazione.
                const scadenza = new Date(detail.progetto.created_at);
                scadenza.setDate(scadenza.getDate() + giorni);
                onChange("valido_fino_data", scadenza.toLocaleDateString("en-CA"));
              }}
              className="h-9 text-xs mt-1"
            />
          </div>
          {/* ─── Blocco MARGINE (solo admin) ─────────────────────────────
              Visibile esclusivamente a super_admin / company_admin.
              Mostra costo acquisto totale, margine € e % con confronto contro
              margine_min della regola scontistica (alert sotto target). */}
          {/* Telefono no: margini e costi si guardano dal computer, come negli altri preventivatori. */}
          {canViewImpresa && marginCalc && (
            <div className="col-span-12 max-md:hidden">
              <div
                className={`rounded-md border p-4 max-md:p-3 ${
                  !marginCalc.costiCompleti
                    ? "border-amber-300 bg-amber-50/60"
                    : marginCalc.sottoTarget
                    ? "border-rose-300 bg-rose-50/60"
                    : "border-emerald-200 bg-emerald-50/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <p className="text-[10px] uppercase font-semibold flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Margine preventivo (solo titolare/admin)
                  </p>
                  {!marginCalc.costiCompleti ? (
                    <span className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Costi incompleti
                    </span>
                  ) : marginCalc.sottoTarget && (
                    <span className="text-[10px] font-semibold text-rose-700 flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      Sotto target {marginCalc.margineMinPct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Costo acquisto netto</p>
                    <p className="font-bold text-slate-800 tabular-nums">{formatEuro(marginCalc.costoTotale)}</p>
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Imponibile vendita</p>
                    <p className="font-bold text-slate-800 tabular-nums">{formatEuro(marginCalc.vendita)}</p>
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <p className="text-[10px] uppercase text-slate-500">{marginCalc.costiCompleti ? "Margine €" : "Margine parziale €"}</p>
                    <p className={`font-bold tabular-nums ${marginCalc.margine >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {marginCalc.righeConCosto > 0 ? formatEuro(marginCalc.margine) : "—"}
                    </p>
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Margine %</p>
                    <p className={`font-bold tabular-nums ${marginCalc.sottoTarget ? "text-rose-700" : "text-emerald-700"}`}>
                      {marginCalc.marginePct != null ? `${marginCalc.marginePct.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 mt-2 leading-tight max-md:hidden">
                  <Info className="inline h-3 w-3 mr-0.5 -mt-0.5" />
                  Il margine è calcolato su valori netti IVA esclusa: imponibile vendita meno costo acquisto netto.
                  {marginCalc.costiCompleti
                    ? " Tutte le righe vendute hanno un costo collegato."
                    : ` Mancano costi su ${marginCalc.righeSenzaCosto} righe: completa il listino/costo per vedere il margine reale.`}
                  {marginCalc.isFetchingGridCosts ? " Aggiornamento costi in corso..." : ""}
                </p>
              </div>
            </div>
          )}

          <div className="col-span-12">
            <div className="rounded-md bg-orange-50 border border-orange-200 p-4">
              <p className="text-[10px] uppercase font-semibold text-orange-900 mb-1">Totale preventivo</p>
              <p className="text-2xl font-bold text-orange-900 tabular-nums">
                {formatEuro(forbice.media, 2)}
                <span className="text-xs font-normal opacity-70 ml-2">IVA inclusa</span>
              </p>
              <p className="text-[10px] text-orange-600 mt-1">
                Imponibile {formatEuro(totaleCalc.imponibile_netto, 2)} · IVA {formatEuro(totaleCalc.iva_importo, 2)}
              </p>
            </div>
          </div>

          {/* ─── Riepilogo IVA mista (Beni Significativi DM 29.12.99) ─────────
              Visibile solo quando l'utente ha selezionato "IVA mista". Mostra
              lo split calcolato per categoria (BS al 10/22, altre prestazioni
              al 10%) e l'IVA risultante. Il PDF replica esattamente questa
              tabella nella sezione economica. */}
          {totaleCalc.iva_mista && totaleCalc.mista_breakdown && (
            <div className="col-span-12">
              <div className="rounded-md bg-blue-50/40 border border-blue-200 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[10px] uppercase font-semibold text-[#173b67]">
                    📊 Riepilogo IVA mista · Regola Beni Significativi (DM 29.12.99)
                  </p>
                  <span className="text-[10px] text-slate-600 max-md:hidden">
                    IVA calcolata sulle righe del preventivo
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Imponibile 10%</p>
                    <p className="font-bold text-slate-900 tabular-nums">{formatEuro(totaleCalc.mista_breakdown.imponibile_10)}</p>
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <p className="text-[10px] uppercase text-slate-500">IVA 10%</p>
                    <p className="font-bold text-emerald-700 tabular-nums">{formatEuro(totaleCalc.mista_breakdown.iva_10)}</p>
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <p className="text-[10px] uppercase text-slate-500">Imponibile 22%</p>
                    <p className="font-bold text-slate-900 tabular-nums">{formatEuro(totaleCalc.mista_breakdown.imponibile_22)}</p>
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <p className="text-[10px] uppercase text-slate-500">IVA 22%</p>
                    <p className="font-bold text-amber-700 tabular-nums">{formatEuro(totaleCalc.mista_breakdown.iva_22)}</p>
                  </div>
                </div>
                {/* Dettaglio split Beni Significativi (educational) */}
                <p className="text-[10px] text-slate-600 leading-relaxed max-md:hidden">
                  <strong>Serramenti</strong> (bene significativo) al 10% fino a {formatEuro(totaleCalc.mista_breakdown.altre_prestazioni)}{" "}
                  (= valore accessori + posa + altre opere).
                  {totaleCalc.mista_breakdown.bs_quota_22 > 0 ? (
                    <> Eccedenza al 22%: <strong>{formatEuro(totaleCalc.mista_breakdown.bs_quota_22)}</strong>.</>
                  ) : (
                    <> Nessuna eccedenza al 22%.</>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </SrCard>

      {/* Modalità di pagamento cliente */}
      <SrCard
        title="Modalità di pagamento cliente"
        description="Scegli prima il pattern di pagamento, poi personalizza gli step. Compare nel PDF come piano concordato."
        icon={<Wallet className="h-4 w-4" />}
      >
        {/* Schema di alto livello — guida il template. Blocco INFORMATIVO
            -> blu navy soft (non e' un valore chiave da evidenziare). */}
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50/60 border-l-4 border-l-[#173b67] p-3 space-y-2">
          <Label className="text-xs font-semibold text-[#173b67] flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Schema pagamento
          </Label>
          <Select value={schemaPagamento} onValueChange={(v) => applySchema(v as SrSchemaPagamento)}>
            <SelectTrigger className="bg-white text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SR_SCHEMI_PAGAMENTO) as SrSchemaPagamento[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SR_SCHEMI_PAGAMENTO[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-slate-600 max-md:hidden">{schemaCfg.description}</p>
        </div>

        <div className="space-y-2">
          {milestones.map((m, idx) => (
            <div key={getUid(idx)} className="grid grid-cols-12 gap-2 items-end">
              {/* Telefono: nome, % e cestino su una riga; «Quando» sotto. */}
              <div className="col-span-7 md:col-span-5">
                <Label className="text-xs">Step {idx + 1}</Label>
                <Input
                  value={m.label}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setMilestones(next);
                  }}
                  className="h-9 text-xs"
                  placeholder="es. Acconto alla firma"
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                <Label className="text-xs">%</Label>
                <Input
                  type="number"
                  min={0} max={100} step={5}
                  value={m.percentuale}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], percentuale: Math.max(0, Math.min(100, Number(e.target.value) || 0)) };
                    setMilestones(next);
                  }}
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-12 md:col-span-4 max-md:order-1">
                {/* Telefono: l'etichetta la dice il segnaposto (o il valore scritto). */}
                <Label className="text-xs max-md:sr-only">Quando</Label>
                <Input
                  value={m.when ?? ""}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], when: e.target.value || null };
                    setMilestones(next);
                  }}
                  placeholder="es. Consegna materiale"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-2 md:col-span-1 flex justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setMilestones(milestones.filter((_, i) => i !== idx))}
                  disabled={milestones.length <= 1}
                  className="h-9 w-9 text-rose-600 hover:bg-rose-50"
                  title="Rimuovi step"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {/* Importo calcolato sul medio */}
              <div className="col-span-12 text-[11px] text-muted-foreground -mt-1 pl-1 max-md:order-2">
                ≈ {formatEuro((forbice.media * (Number(m.percentuale) || 0)) / 100)}<span className="max-md:hidden"> IVA inclusa</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMilestones([...milestones, { label: "", percentuale: 0, when: null }])}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Aggiungi step
            </Button>
            <div
              className={`text-sm font-bold inline-flex items-center gap-1.5 ${milestonesOk ? "text-emerald-700" : "text-amber-600"}`}
              role="status"
              aria-live="polite"
            >
              {milestonesOk && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              )}
              Totale: {milestonesTotale}%
              {!milestonesOk && (
                <span className="text-xs font-normal ml-1">
                  ({milestonesTotale > 100 ? `−${milestonesTotale - 100}%` : `+${100 - milestonesTotale}%`} per arrivare a 100%)
                </span>
              )}
            </div>
          </div>
        </div>
      </SrCard>

      {/* Finanziamento — mostrato solo se lo schema lo prevede */}
      {schemaCfg.hasFinanziamento && (
      <SrCard
        title="Simulazione finanziamento"
        description="Scegli una tabella finanziaria configurata oppure imposta manualmente. La rata si calcola da importo + durata."
        icon={<CreditCard className="h-4 w-4" />}
      >
        {/* Switch modalità: tabella vs manuale */}
        <div className="flex gap-2 mb-3 p-1 bg-muted rounded-md w-fit" role="tablist" aria-label="Modalità finanziamento">
          <button
            type="button"
            role="tab"
            aria-selected={finModalita === "tabella"}
            onClick={() => setFinModalita("tabella")}
            className={`tap-compact px-3 py-1 text-xs rounded transition-colors ${finModalita === "tabella" ? "bg-white shadow-sm font-semibold text-orange-600" : "text-muted-foreground hover:text-foreground"}`}
          >
            Da tabella<span className="max-md:hidden"> configurata</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={finModalita === "manuale"}
            onClick={() => setFinModalita("manuale")}
            className={`tap-compact px-3 py-1 text-xs rounded transition-colors ${finModalita === "manuale" ? "bg-white shadow-sm font-semibold text-orange-600" : "text-muted-foreground hover:text-foreground"}`}
          >
            Manuale<span className="max-md:hidden"> (TAN libero)</span>
          </button>
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Anticipo %</Label>
            <Input
              type="number"
              min={0} max={100} step={5}
              value={anticipoPct}
              onChange={(e) => setAnticipoPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatEuro(finCalc.anticipo)} su {formatEuro(forbice.media)}
            </p>
          </div>
          <div className="col-span-6 md:col-span-9">
            <Label className="text-xs">Importo finanziato</Label>
            <div className="h-9 px-3 flex items-center text-sm font-semibold text-orange-600 bg-orange-50 rounded-md border border-orange-200">
              {formatEuro(importoFinanziato)}
            </div>
          </div>

          {finModalita === "tabella" ? (
            <>
              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs">Tabella finanziamento</Label>
                {tabelleFinanziamento.length === 0 ? (
                  <SrCallout variant="info" className="text-[11px]">
                    Nessuna tabella configurata. Vai in{" "}
                    <a href="/azienda/impostazioni/finanziamenti" className="underline font-semibold">
                      Impostazioni → Finanziamenti
                    </a>{" "}
                    per caricarla.
                  </SrCallout>
                ) : (
                  <Select
                    value={tabellaId ?? "none"}
                    onValueChange={(v) => {
                      const next = v === "none" ? null : v;
                      setTabellaId(next);
                      setDurataTabella(null);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Seleziona tabella..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nessuna —</SelectItem>
                      {tabelleFinanziamento.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome_prodotto}{t.finanziaria_nome ? ` · ${t.finanziaria_nome}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs">Durata (mesi)</Label>
                <Select
                  value={durataTabella ? String(durataTabella) : ""}
                  onValueChange={(v) => setDurataTabella(Number(v))}
                  disabled={durateDisponibili.length === 0}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={durateDisponibili.length === 0 ? "Seleziona prima tabella" : "Scegli durata..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {durateDisponibili.map((d) => (
                      <SelectItem key={d} value={String(d)}>{d} mesi ({Math.round(d / 12 * 10) / 10} anni)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {rigaTabellaScelta && (
                <div className="col-span-12 mt-2 rounded-md border border-orange-300 bg-orange-50/50 p-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-[10px] uppercase text-orange-600 font-semibold">Rata mensile</p>
                      <p className="text-2xl font-bold text-orange-900 tabular-nums max-md:text-xl">
                        {formatEuro(rigaTabellaScelta.importo_rata, 0)}
                      </p>
                      <p className="text-[10px] text-orange-600">× {rigaTabellaScelta.numero_rate} rate</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-orange-600 font-semibold">TAN</p>
                      <p className="text-lg font-bold text-orange-900 tabular-nums">
                        {rigaTabellaScelta.tan != null ? `${rigaTabellaScelta.tan}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-orange-600 font-semibold">TAEG</p>
                      <p className="text-lg font-bold text-orange-900 tabular-nums">
                        {rigaTabellaScelta.taeg != null ? `${rigaTabellaScelta.taeg}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-orange-600 font-semibold">Totale dovuto</p>
                      <p className="text-lg font-bold text-orange-900 tabular-nums">
                        {formatEuro(rigaTabellaScelta.importo_totale_dovuto ?? rigaTabellaScelta.importo_rata * rigaTabellaScelta.numero_rate, 0)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-center text-orange-600/80 mt-2 max-md:hidden">
                    Valori letti dalla tabella ufficiale: TAN e TAEG sono pre-calcolati, niente input manuali.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Modalità manuale (legacy) */}
              <div className="col-span-12 grid grid-cols-12 gap-2 mt-2">
                <div className="col-span-12">
                  <p className="text-xs font-semibold uppercase text-orange-900">Piano Estesa</p>
                </div>
                <div className="col-span-4 md:col-span-3">
                  <Label className="text-xs">Durata (mesi)</Label>
                  <Input type="number" value={piano1Mesi} onChange={(e) => setPiano1Mesi(Number(e.target.value) || 0)} className="h-9 text-xs" />
                </div>
                <div className="col-span-4 md:col-span-3">
                  <Label className="text-xs">Tasso TAN %</Label>
                  <Input type="number" step={0.1} value={piano1Tasso} onChange={(e) => setPiano1Tasso(Number(e.target.value) || 0)} className="h-9 text-xs" />
                </div>
                <div className="col-span-4 md:col-span-6">
                  <Label className="text-xs">Rata mensile</Label>
                  <div className="h-9 px-3 flex items-center text-sm font-bold text-orange-600 bg-orange-50 rounded-md border border-orange-200">
                    {formatEuro(finCalc.piani[0]?.rata_mese, 0)}/mese
                  </div>
                </div>
              </div>
              <div className="col-span-12 grid grid-cols-12 gap-2 mt-2">
                <div className="col-span-12">
                  <p className="text-xs font-semibold uppercase text-orange-900">Piano Standard</p>
                </div>
                <div className="col-span-4 md:col-span-3">
                  <Label className="text-xs">Durata (mesi)</Label>
                  <Input type="number" value={piano2Mesi} onChange={(e) => setPiano2Mesi(Number(e.target.value) || 0)} className="h-9 text-xs" />
                </div>
                <div className="col-span-4 md:col-span-3">
                  <Label className="text-xs">Tasso TAN %</Label>
                  <Input type="number" step={0.1} value={piano2Tasso} onChange={(e) => setPiano2Tasso(Number(e.target.value) || 0)} className="h-9 text-xs" />
                </div>
                <div className="col-span-4 md:col-span-6">
                  <Label className="text-xs">Rata mensile</Label>
                  <div className="h-9 px-3 flex items-center text-sm font-bold text-orange-600 bg-orange-50 rounded-md border border-orange-200">
                    {formatEuro(finCalc.piani[1]?.rata_mese, 0)}/mese
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </SrCard>
      )}

      {/* Ecobonus */}
      <SrCard
        title="Detrazione fiscale (Ecobonus)"
        description="Detrazione IRPEF recuperata in 10 quote annuali."
        icon={<Calendar className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between border rounded-md p-2.5 bg-muted/20">
            <div>
              <p className="text-sm font-medium">Includi nel preventivo</p>
              <p className="text-[10px] text-muted-foreground max-md:hidden">Aliquote 2026: 50% sull'abitazione principale, 36% sulle altre</p>
            </div>
            <Switch checked={bonusAttivo} onCheckedChange={setBonusAttivo} />
          </div>
          {bonusAttivo && (
            <>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Aliquota</Label>
                  <Select value={String(aliquota)} onValueChange={(v) => setAliquota(Number(v))}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALIQUOTE_DETRAZIONE_SERRAMENTI.map((i) => (
                        <SelectItem key={i.key} value={String(i.pct)} title={i.hint}>{i.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {ecobonusCalc && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <SrKpi label="Base detraibile" value={formatEuro(ecobonusCalc.base_calcolo)} hint="Max 96.000 €" />
                  <SrKpi label="Aliquota" value={formatPct(ecobonusCalc.aliquota)} />
                  <SrKpi label="Detrazione totale" value={formatEuro(ecobonusCalc.detrazione_totale)} variant="success" />
                  <SrKpi label="Rata annuale × 10 anni" value={formatEuro(ecobonusCalc.rata_annuale)} variant="success" />
                </div>
              )}
            </>
          )}
        </div>
      </SrCard>

      {/* Risparmio energetico */}
      <SrCard
        title="Risparmio energetico (per il PDF)"
        description="Mostra al cliente quanto risparmierà ogni anno in bolletta + il payback completo dopo la detrazione."
        icon={<Leaf className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between border rounded-md p-2.5 bg-muted/20">
            <div>
              <p className="text-sm font-medium">Calcola risparmio in bolletta</p>
              <p className="text-[10px] text-muted-foreground">
                Zona climatica rilevata: <span className="font-semibold">{zonaClimatica}</span> ·
                m² serramenti: {formatNumero(totaleCalc.metri_quadri, 2)}
              </p>
            </div>
            <Switch checked={risparmioAttivo} onCheckedChange={setRisparmioAttivo} />
          </div>
          {risparmioAttivo && (
            <>
              <TooltipProvider delayDuration={200}>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs flex items-center gap-1">
                    Uw attuale (W/m²K)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-orange-600">
                          <HelpCircle className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs font-semibold mb-1">Uw — Trasmittanza termica del serramento</p>
                        <p className="text-[11px]">Quanto calore disperde il serramento attuale (W per m² per °C di differenza). Più basso = meglio isola. Riferimenti tipici:</p>
                        <ul className="text-[11px] mt-1 space-y-0.5">
                          <li>• <strong>5.0</strong>: singolo vetro anni '70-'80</li>
                          <li>• <strong>2.8</strong>: vetrocamera vecchia (anni '90)</li>
                          <li>• <strong>2.0</strong>: PVC standard senza taglio termico</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    type="number" step={0.1} value={uwAttuale}
                    onChange={(e) => setUwAttuale(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5 max-md:hidden">Singolo vetro: ~5.0 · Vecchia vetrocamera: ~2.8</p>
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs flex items-center gap-1">
                    Uw nuovo (W/m²K)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-orange-600">
                          <HelpCircle className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs font-semibold mb-1">Uw del nuovo serramento</p>
                        <p className="text-[11px]">Valore dichiarato dal produttore (lo trovi in scheda tecnica). Riferimenti:</p>
                        <ul className="text-[11px] mt-1 space-y-0.5">
                          <li>• <strong>1.4</strong>: PVC standard con vetrocamera basso-em.</li>
                          <li>• <strong>1.1</strong>: PVC/Alluminio premium</li>
                          <li>• <strong>0.8</strong>: triplo vetro con argon e warm-edge</li>
                          <li>• Soglia minima Ecobonus zona E: <strong>≤ 1.4</strong></li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    type="number" step={0.1} value={uwNuovo}
                    onChange={(e) => setUwNuovo(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5 max-md:hidden">Standard: 1.4 · Performante: 1.1 · Triplo vetro: 0.8</p>
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">m² casa</Label>
                  <Input
                    type="number" value={m2Casa}
                    onChange={(e) => setM2Casa(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs"><span className="max-md:hidden">Bolletta riscaldamento attuale (€/anno)</span><span className="md:hidden">Bolletta (€/anno)</span></Label>
                  <Input
                    type="number" value={bollettaAttuale}
                    onChange={(e) => setBollettaAttuale(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              {risparmioCalc && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <SrKpi
                    label="Risparmio /anno"
                    value={formatEuro(risparmioCalc.risparmio_eur_anno)}
                    hint={`${formatNumero(risparmioCalc.risparmio_kwh_anno, 0)} kWh`}
                    variant="success"
                  />
                  {risparmioCalc.risparmio_pct != null && (
                    <SrKpi label="% bolletta" value={formatPct(risparmioCalc.risparmio_pct, 1)} variant="success" />
                  )}
                  <SrKpi
                    label="CO₂ /anno"
                    value={formatNumero(risparmioCalc.co2_risparmiata_kg_anno / 1000, 2)}
                    unit="t"
                    variant="success"
                    hint="Equivalente a ~5 alberi/anno"
                  />
                  <SrKpi
                    label="Zona climatica"
                    value={zonaClimatica}
                    hint={`${risparmioCalc.gradi_giorno} GG`}
                  />
                </div>
              )}
              </TooltipProvider>
            </>
          )}
        </div>
      </SrCard>

      {/* Recupero economico 10 anni (vista cliente) */}
      {cashflow && (
        <SrCard
          title="Recupero economico · 10 anni"
          description="Confronta il totale preventivo con risparmio bolletta e detrazione fiscale anno per anno."
          icon={<TrendingUp className="h-4 w-4" />}
          variant="highlight"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 max-md:mb-0">
            <SrKpi label="Totale preventivo" value={formatEuro(forbice.media)} />
            <SrKpi label="Recuperato in 10 anni" value={formatEuro(cashflow.totale_recuperato_10y)} variant="success" />
            <SrKpi label="% Recupero" value={formatPct(cashflow.pct_recuperato_10y, 0)} variant={cashflow.pct_recuperato_10y >= 100 ? "success" : "warning"} />
            <SrKpi
              label="Payback"
              value={cashflow.payback_anni != null ? formatNumero(cashflow.payback_anni, 1) : ">10"}
              unit={cashflow.payback_anni != null ? "anni" : ""}
              variant={cashflow.payback_anni != null && cashflow.payback_anni <= 10 ? "success" : "warning"}
            />
          </div>
          {/* Telefono: bastano i quattro numeri sopra; grafico e tabella anno per anno al computer. */}
          <div className="max-md:hidden">
            <RoiChart righe={cashflow.righe} costoIniziale={forbice.media} payback={cashflow.payback_anni ?? null} />
          </div>
          <div className="mt-3 overflow-x-auto max-md:hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Anno</TableHead>
                  <TableHead className="text-[10px]">Risparmio bolletta</TableHead>
                  <TableHead className="text-[10px]">Detrazione</TableHead>
                  <TableHead className="text-[10px]">Flusso anno</TableHead>
                  <TableHead className="text-[10px]">Cumulato</TableHead>
                  <TableHead className="text-[10px]">Netto vs. totale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashflow.righe.map((r) => (
                  <TableRow key={r.anno}>
                    <TableCell className="text-xs font-semibold">{r.anno}</TableCell>
                    <TableCell className="text-xs">{formatEuro(r.risparmio_bolletta)}</TableCell>
                    <TableCell className="text-xs">{formatEuro(r.detrazione)}</TableCell>
                    <TableCell className="text-xs font-semibold text-orange-600">{formatEuro(r.flusso_anno)}</TableCell>
                    <TableCell className="text-xs">{formatEuro(r.cumulato)}</TableCell>
                    <TableCell className={`text-xs font-semibold ${r.netto >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {r.netto >= 0 ? "+" : ""}{formatEuro(r.netto)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SrCard>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSalvaCalcoli} className="bg-orange-500 hover:bg-orange-600 max-md:w-full">
          Applica calcoli al progetto
        </Button>
      </div>

      {detail.serramenti.length === 0 && (
        <SrCallout variant="warning">
          ⚠️ Aggiungi almeno un serramento nello Step 4 per calcolare il prezzo.
        </SrCallout>
      )}

      {/* ─── Alert "Solo fornitura" ─────────────────────────────────────────
          Riepilogo trasparente per il commerciale: se il preventivo contiene
          righe BOM con posa esclusa, l'alert ricorda che il cliente dovra'
          gestire la posa autonomamente. Evita malintesi in fase di firma. */}
      {(() => {
        const senzaPosa = detail.serramenti.filter((s) => s.posa_esclusa);
        if (senzaPosa.length === 0) return null;
        const tot = senzaPosa.reduce((acc, s) => acc + (s.quantita ?? 1), 0);
        const totSerr = detail.serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);
        const tutte = senzaPosa.length === detail.serramenti.length;
        return (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-2.5">
            <span className="text-amber-700 text-base leading-none mt-0.5">⊘</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-900">
                {tutte
                  ? `Preventivo "solo fornitura": tutte le ${tot} unità senza manodopera.`
                  : `${senzaPosa.length} riga${senzaPosa.length === 1 ? "" : "he"} con manodopera esclusa (${tot} di ${totSerr} unità).`}
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed max-md:hidden">
                Il cliente dovrà occuparsi personalmente della posa per gli articoli marcati come <strong>"Solo fornitura"</strong>.
                Riepilogo dettagliato verrà incluso nel PDF preventivo.
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── ROI Chart (recupero economico) ──────────────────────────────────────────
//
// Grafico vista-cliente del recupero economico anno per anno.
// Recharts area + line con:
//  - gradient verde sotto la curva (recuperato cumulato)
//  - ReferenceLine rossa tratteggiata = soglia totale preventivo
//  - ReferenceDot arancione sul payback year (anno di break-even)
//  - Tooltip personalizzato con risparmio + detrazione + cumulato
//  - LabelList con i valori cumulati (a chi guarda al volo)
//  - Asse Y con tick formattati €

function RoiChart({
  righe, costoIniziale, payback,
}: {
  righe: SrCashflowRiga[];
  costoIniziale: number;
  payback: number | null;
}) {
  // Dataset per recharts: prepend anno 0 = € 0 (origine del recupero)
  const data = useMemo(() => [
    { anno: 0, cumulato: 0, flusso_anno: 0, risparmio_bolletta: 0, detrazione: 0 },
    ...righe.map((r) => ({
      anno: r.anno,
      cumulato: Number(r.cumulato.toFixed(0)),
      flusso_anno: Number(r.flusso_anno.toFixed(0)),
      risparmio_bolletta: Number(r.risparmio_bolletta.toFixed(0)),
      detrazione: Number(r.detrazione.toFixed(0)),
    })),
  ], [righe]);

  // Punto preciso del payback (interpolazione lineare tra anni vicini)
  const paybackPoint = useMemo(() => {
    if (payback == null) return null;
    return { anno: Math.round(payback * 10) / 10, cumulato: costoIniziale };
  }, [payback, costoIniziale]);

  const totaleRecuperato = righe.length > 0 ? righe[righe.length - 1].cumulato : 0;
  const maxY = Math.max(costoIniziale, totaleRecuperato) * 1.1;

  return (
    <div className="w-full bg-white border border-emerald-100 rounded-md p-2 sm:p-3">
      <div className="h-[260px] sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 25, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="roiGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="anno"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(v) => v === 0 ? "" : `${v}`}
              label={{ value: "Anni", position: "insideBottom", offset: -2, fontSize: 10, fill: "#94a3b8" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(v) => `${Math.round(v).toLocaleString("it-IT", { useGrouping: true })} €`}
              domain={[0, maxY]}
              width={70}
            />
            <RTooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0].payload as {
                  anno: number; cumulato: number; flusso_anno: number;
                  risparmio_bolletta: number; detrazione: number;
                };
                if (d.anno === 0) return null;
                const netto = d.cumulato - costoIniziale;
                return (
                  <div className="bg-white rounded-md border border-slate-200 shadow-md p-2.5 text-xs">
                    <p className="font-bold text-slate-900 mb-1">Anno {d.anno}</p>
                    <div className="space-y-0.5 text-[11px]">
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Risparmio bolletta</span>
                        <span className="tabular-nums font-medium">€ {d.risparmio_bolletta.toLocaleString("it-IT", { useGrouping: true })}</span>
                      </p>
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Detrazione fiscale</span>
                        <span className="tabular-nums font-medium">€ {d.detrazione.toLocaleString("it-IT", { useGrouping: true })}</span>
                      </p>
                      <div className="border-t border-slate-100 my-1" />
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Cumulato</span>
                        <span className="tabular-nums font-bold text-emerald-700">€ {d.cumulato.toLocaleString("it-IT", { useGrouping: true })}</span>
                      </p>
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Netto vs totale</span>
                        <span className={`tabular-nums font-semibold ${netto >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {netto >= 0 ? "+" : ""}€ {netto.toLocaleString("it-IT", { useGrouping: true })}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              }}
            />
            {/* Area cumulato (verde gradient) */}
            <Area
              type="monotone"
              dataKey="cumulato"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#roiGradient)"
              dot={{ r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 6, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={true}
              animationDuration={800}
            />
            {/* Linea totale preventivo rossa tratteggiata */}
            <ReferenceLine
              y={costoIniziale}
              stroke="#ef4444"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `Totale € ${costoIniziale.toLocaleString("it-IT", { useGrouping: true })}`,
                position: "insideTopRight",
                fill: "#ef4444",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            {/* Punto break-even (payback) */}
            {paybackPoint && (
              <ReferenceDot
                x={paybackPoint.anno}
                y={paybackPoint.cumulato}
                r={7}
                fill="#f97316"
                stroke="#fff"
                strokeWidth={2}
                label={{
                  value: `🎯 Break-even anno ${paybackPoint.anno.toFixed(1)}`,
                  position: "top",
                  fill: "#f97316",
                  fontSize: 11,
                  fontWeight: 700,
                  offset: 12,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* Legenda compatta sotto al grafico */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-emerald-500" />
          Recupero cumulato
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 border-t border-dashed border-red-500" />
          Soglia totale
        </span>
        {paybackPoint && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />
            Break-even
          </span>
        )}
      </div>
    </div>
  );
}
