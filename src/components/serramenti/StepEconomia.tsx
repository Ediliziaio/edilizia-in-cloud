/**
 * StepEconomia — passo «Economia» del wizard: prezzo, come paga il cliente, detrazione fiscale.
 *
 * Sezioni, nell'ordine in cui si lavora (06/10/2026: prima il prezzo, poi le rate):
 *  - Riepilogo BOM (auto-calcolato)
 *  - Prezzo: sconto / IVA / validità / totale documento
 *  - Come paga il cliente (bonifico o finanziamento, rate) + simulazione finanziamento
 *  - Detrazione fiscale (50% prima casa / 36% altre abitazioni, da incentivi.ts)
 *  - Extra richiudibili, chiusi di serie: calcolo risparmio energetico e recupero economico 10 anni
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
  Wallet, Tag, CreditCard,
  CheckCircle2, AlertTriangle, ShieldAlert, Info,
  Lock, Send, TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDiscountRules } from "@/hooks/useDiscountRules";
import { PrezzoPreventivoAMano } from "@/components/preventivi/PrezzoPreventivoAMano";
import { ScontoRapido } from "@/components/preventivi/ScontoRapido";
import { ExtraRichiudibile } from "@/components/serramenti/ExtraRichiudibile";
import { RatePagamento } from "@/components/serramenti/RatePagamento";
import { SimulazioneFinanziamento, type ModalitaFinanziamento } from "@/components/serramenti/SimulazioneFinanziamento";
import {
  durateConRata, fasceTabella, importoFinanziatoDa, pianiManuali, pianiManualiDaSalvati, pianiUguali, pianoDaTabella,
  type PianiManuali,
} from "@/lib/serramenti/pianoFinanziamento";
import { anticipoDaRate, rateConAnticipo, schemaDopoAnticipo } from "@/lib/serramenti/ratePagamento";
import { campiRisparmio, paybackAtteso } from "@/lib/serramenti/risparmioPreventivo";
import { valoriDiversi } from "@/lib/serramenti/scritturaCampi";
import { motivoPreventivoDeciso } from "@/lib/serramenti/preventivoDeciso";
import { evaluateDiscountRules, classifyDiscount, type DiscountEvalResult } from "@/lib/serramenti/discountRules";
import {
  useTabelleFinanziamentoAttive,
  useTabellaFinanziamentoRighe,
  findMigliorRiga,
  type RigaFinanziamento,
  type TabellaFinanziamento,
} from "@/hooks/useTabelleFinanziamento";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { calcolaTotale, IVA_MISTA_SENTINEL } from "@/lib/serramenti/calcoli";
import { calcolaCostoPosizione } from "@/lib/serramenti/pricing";
import { useTariffeManodopera } from "@/lib/serramenti/queries";
import { useFamilies } from "@/hooks/useFamilies";
import { costoTariffa } from "@/lib/listino/costoTariffa";
import {
  calcolaEcobonus, calcolaCashflow,
  ALIQUOTE_DETRAZIONE_SERRAMENTI, aliquotaDetrazioneSerramenti,
} from "@/lib/serramenti/ecobonus";
import {
  calcolaRisparmio, zonaDaCap, bollettaMediaRiscaldamento,
  type ZonaClimatica,
} from "@/lib/serramenti/risparmio";
import type {
  SrProgettoRow, SrProgettoDetail, SrPianoFinanziamento, SrCashflowRiga,
  SrSchemaPagamento, SrPagamentoMilestone, SrWizardStep,
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

// ─── Pagamento: famiglie per il toggle (bonifico vs finanziamento) ──────────
// Il modello resta a 6 schemi (SR_SCHEMI_PAGAMENTO); qui li raggruppiamo nelle
// due grandi scelte che vede il cliente — come il toggle del fotovoltaico.
// «Personalizzato» resta come opzione a parte (schema su misura).
const SCHEMI_BONIFICO: SrSchemaPagamento[] = ["tre_step", "due_acconti_saldo"];
const SCHEMI_FINANZIAMENTO: SrSchemaPagamento[] = ["tutto_finanziato", "acconto_finanziato", "due_acconti_finanziato"];
const FAMIGLIA_DEFAULT_SCHEMA: Record<"bonifico" | "finanziamento", SrSchemaPagamento> = {
  bonifico: "tre_step",
  finanziamento: "acconto_finanziato",
};
type FamigliaPagamento = "bonifico" | "finanziamento" | "personalizzato";
function famigliaDiSchema(s: SrSchemaPagamento): FamigliaPagamento {
  if (s === "personalizzato") return "personalizzato";
  return SR_SCHEMI_PAGAMENTO[s].hasFinanziamento ? "finanziamento" : "bonifico";
}

const PIANI_VUOTI: SrPianoFinanziamento[] = [];

/** Il calcolo del risparmio, uguale per quello che si vede a schermo e per quello che si scrive nel preventivo. */
function calcolaRisparmioPreventivo(
  attivo: boolean, m2Serramenti: number, zona: ZonaClimatica, uwAttuale: number, uwNuovo: number, bolletta: number,
) {
  return attivo && m2Serramenti > 0
    ? calcolaRisparmio({
        zona_climatica: zona,
        m2_serramenti: m2Serramenti,
        uw_attuale: uwAttuale,
        uw_nuovo: uwNuovo,
        bolletta_attuale_anno: bolletta || undefined,
      })
    : null;
}

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
  /** Porta a un altro passo del wizard (lo stato vuoto manda a «Composizione offerta»). Senza, il pulsante non c'è. */
  onVaiAlPasso?: (passo: SrWizardStep) => void;
}

export function StepEconomia({ progettoId, detail, form, onChange, onVaiAlPasso }: Props) {
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

  // Un preventivo già firmato, accettato o in commessa non si riscrive MAI da solo: il piano di pagamento e di
  // finanziamento, la detrazione e il resto fanno parte di ciò che il cliente ha firmato, e il PDF si rifà dai dati
  // salvati. Gli effetti qui sotto che scrivono senza che l'utente tocchi niente (aprendo il passo, cambiando un prezzo
  // da un altro passo) si fermano; le scelte di chi lavora si scrivono sempre. Stato, firma e commessa li cambia il
  // server: si leggono dalla copia salvata (`detail`), non dal modulo.
  const motivoDeciso = motivoPreventivoDeciso(detail.progetto);
  const deciso = motivoDeciso != null;

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
  // Per chi non carica i prezzi del listino (o vuole fissare un totale diverso
  // dalla somma delle voci): si scrive nel riquadro condiviso PrezzoPreventivoAMano,
  // che si auto-gestisce l'abilitazione aziendale (Impostazioni → Margini) e
  // mostra un suggerimento quando è spenta — così l'opzione è sempre individuabile.
  // IVA mista col prezzo scritto a mano: la regola dei beni significativi
  // ripartisce l'imponibile come le voci. Con le voci tutte a 0 € non c'è niente
  // da ripartire, e l'aliquota va scelta.
  const ivaMistaSenzaVoci = totaleCalc.prezzo_manuale && totaleCalc.somma_voci <= 0;

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
  // Un preventivo già deciso tiene la regola di allora (è proprio quella che l'audit vuole sapere).
  useEffect(() => {
    if (deciso) return;
    const targetId = discountEval.primaryRule?.id ?? null;
    if ((form.discount_rule_id ?? null) !== targetId) {
      onChange("discount_rule_id", targetId);
    }
  }, [discountEval.primaryRule?.id, deciso]); // eslint-disable-line react-hooks/exhaustive-deps

  const costGridIds = useMemo(
    () => Array.from(new Set([
      ...detail.serramenti.map((s) => s.listino_voce_id).filter((v): v is string => !!v),
      ...detail.accessori.map((a) => a.listino_voce_id).filter((v): v is string => !!v),
    ])),
    [detail.serramenti, detail.accessori],
  );

  type CellaCosto = { id: string; prezzo_acquisto: number | null; supplier_product_line_id: string | null };
  const { data: costGridRows = [], isFetching: isFetchingGridCosts } = useQuery({
    queryKey: ["sr-margin-grid-costs", progettoId, costGridIds],
    enabled: canViewImpresa && costGridIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<CellaCosto[]> => {
      const { data, error } = await (supabase as any)
        .from("listino_griglia")
        .select("id, prezzo_acquisto, supplier_product_line_id")
        .in("id", costGridIds);
      if (error) {
        console.warn("[StepEconomia] listino_griglia cost fetch failed:", error.message);
        return [];
      }
      return (data ?? []).map((row: CellaCosto) => ({
        id: row.id,
        prezzo_acquisto: row.prezzo_acquisto == null ? null : Number(row.prezzo_acquisto),
        supplier_product_line_id: row.supplier_product_line_id ?? null,
      }));
    },
  });

  const cellaById = useMemo(
    () => new Map(costGridRows.map((row) => [row.id, row])),
    [costGridRows],
  );

  // I prodotti del listino con le loro varianti (stessa cache della distinta)
  // e il costo delle tariffe di posa: il costo di ogni riga si calcola con le
  // stesse regole del suo prezzo (calcolaCostoPosizione).
  const { families: famiglieListino, isLoading: famiglieInCaricamento } = useFamilies();
  const famigliaById = useMemo(
    () => new Map(famiglieListino.map((f) => [f.id, f])),
    [famiglieListino],
  );
  const { data: tariffe = [] } = useTariffeManodopera();
  const tariffeCosti = useMemo(() => {
    const m = new Map<string, number>();
    tariffe.forEach((t) => {
      // Il costo dalle tre colonne con la regola unica (lib/listino/costoTariffa).
      const costo = costoTariffa(t);
      if (costo != null) m.set(t.id, costo);
    });
    return m;
  }, [tariffe]);

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

    const conta = (venditaRiga: number, costoRiga: number | null) => {
      // Col prezzo scritto a mano le voci possono essere a 0 € ma avere un costo:
      // il margine è prezzo scritto meno i costi di tutte le voci.
      if (venditaRiga <= 0 && !totaleCalc.prezzo_manuale) return;
      righeConVendita += 1;
      if (costoRiga != null && costoRiga > 0) {
        costoTotale += costoRiga;
        righeConCosto += 1;
      } else {
        righeSenzaCosto += 1;
      }
    };

    // Le righe del listino non salvano un costo: si calcola dal listino, con
    // le misure, le varianti e la posa della riga (prima solo la cella della
    // griglia, al lordo degli sconti fornitore: un prodotto a pezzo o al m²
    // restava «senza costo» anche col costo scritto nel listino).
    const costoDalListino = (riga: {
      family_id?: string | null;
      listino_voce_id?: string | null;
      larghezza_mm?: number | null;
      altezza_mm?: number | null;
      quantita?: number | null;
      valori_assi?: unknown;
      posa_esclusa?: boolean | null;
    }): number | null => {
      const quantita = Math.max(1, Number(riga.quantita ?? 1) || 1);
      const famiglia = riga.family_id ? famigliaById.get(riga.family_id) : undefined;
      const cella = riga.listino_voce_id ? cellaById.get(riga.listino_voce_id) ?? null : null;
      if (!famiglia) {
        // Prodotto non più nel listino attivo: resta il costo della cella, se c'è.
        const acquisto = Number(cella?.prezzo_acquisto ?? 0);
        return acquisto > 0 ? acquisto * quantita : null;
      }
      const costo = calcolaCostoPosizione({
        family: famiglia,
        larghezza: riga.larghezza_mm ?? null,
        altezza: riga.altezza_mm ?? null,
        quantita,
        cella,
        selections: (riga.valori_assi ?? null) as Record<string, string> | null,
        axes: famiglia.axes,
        posaEsclusa: riga.posa_esclusa,
        tariffeCosti,
      });
      return costo.prodotto != null ? costo.prodotto + costo.posa : null;
    };

    detail.serramenti.forEach((s) => {
      conta(
        Number(s.prezzo_totale ?? (s.prezzo_unitario ?? 0) * (s.quantita ?? 1)),
        costoDalListino(s),
      );
    });
    detail.accessori.forEach((a) => {
      conta(
        Number(a.prezzo_totale ?? (a.prezzo_unitario ?? 0) * (a.quantita ?? 1)),
        costoDalListino(a),
      );
    });
    (detail.servizi ?? []).forEach((m) => {
      conta(
        Number(m.prezzo_totale_vendita ?? (m.prezzo_unitario_vendita ?? 0) * (m.quantita ?? 1)),
        m.prezzo_totale_costo ?? Number(m.prezzo_unitario_costo ?? 0) * (m.quantita ?? 1),
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
      // Finché listino o celle non sono arrivati i costi sono parziali: la UI
      // lo tratta come il caricamento delle celle di prima.
      isFetchingGridCosts: isFetchingGridCosts || famiglieInCaricamento,
    };
  }, [
    canViewImpresa, isFetchingGridCosts, famiglieInCaricamento, cellaById, famigliaById, tariffeCosti,
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

  // ─── Come paga il cliente + finanziamento ───────────────────────────────────
  // Le rate, lo schema e il piano di finanziamento stanno nel PREVENTIVO (`form`), non in copie locali: ogni scelta
  // si scrive subito con `onChange`, dal gestore dell'evento (il wizard salva con un po' di ritardo, come per gli
  // altri campi), e quello che si vede è quello che c'è scritto, cioè quello che esce nel PDF. Niente pulsante
  // «Applica» e niente effetti che copiano il form nello stato (facevano scivolare gli input).
  type Milestone = SrPagamentoMilestone;
  /** Scrive un campo del preventivo solo se cambia: ogni scrittura lo segna come modificato e fa partire un salvataggio. */
  const scrivi = <K extends keyof SrProgettoRow>(campo: K, valore: SrProgettoRow[K]) => {
    if (valoriDiversi(form[campo], valore)) onChange(campo, valore);
  };
  const pianiSalvati: SrPianoFinanziamento[] = Array.isArray(form.fin_piani) ? form.fin_piani : PIANI_VUOTI;
  /** Il piano si confronta per mesi e importi (non per nome) e si scrive solo se cambia. */
  const scriviPiani = (piani: SrPianoFinanziamento[]) => {
    if (!pianiUguali(pianiSalvati, piani)) onChange("fin_piani", piani);
  };

  // ─── Sconti veloci ────────────────────────────────────────────────────────
  // Lo sconto qui è doppio (percentuale e fisso, il fisso si toglie per primo). I tasti scrivono la PERCENTUALE, il
  // campo che le regole di scontistica controllano, e azzerano il fisso: i due insieme darebbero un totale diverso da
  // quello che il tasto dice. «Arriva a €» parte dal prezzo pieno (prezzo scritto a mano compreso), IVA esclusa.
  const scontoInVigorePct = totaleCalc.imponibile_lordo > 0
    ? roundMoney((totaleCalc.sconto / totaleCalc.imponibile_lordo) * 100)
    : 0;
  // Con l'IVA mista l'aliquota cambia con lo sconto (la regola dei beni significativi ripartisce l'imponibile): il
  // conto «a ritroso» di «Arriva a €» non vale, restano i tasti.
  const ivaPerArrivaA = form.iva_percentuale === IVA_MISTA_SENTINEL ? undefined : Number(form.iva_percentuale ?? 10);
  const applicaScontoVeloce = ({ pct }: { pct: number; importo: number }) => {
    if (!isAdmin) return; // i tasti sono spenti, ma la regola vale anche qui: lo sconto lo scrive chi può approvarlo
    scrivi("sconto_percentuale", pct);
    scrivi("sconto_importo", 0);
  };

  const schemaSalvato = form.schema_pagamento && form.schema_pagamento in SR_SCHEMI_PAGAMENTO
    ? (form.schema_pagamento as SrSchemaPagamento)
    : null;
  const rateSalvate = Array.isArray(form.pagamento_milestones) ? (form.pagamento_milestones as Milestone[]) : null;
  // Lo stesso ripiego del PDF: senza uno schema scritto vale «3 step».
  const schemaPagamento: SrSchemaPagamento = schemaSalvato ?? "tre_step";
  const schemaCfg = SR_SCHEMI_PAGAMENTO[schemaPagamento];
  // «Scelto» = nel preventivo c'è qualcosa: le rate scritte, o «Personalizzato» (che parte senza rate). Finché non
  // si sceglie niente non si propone niente: nessun valore preselezionato che a schermo c'è e nel PDF no.
  const pagamentoScelto = (rateSalvate?.length ?? 0) > 0 || schemaSalvato === "personalizzato";
  const famigliaPagamento: FamigliaPagamento | null = pagamentoScelto ? famigliaDiSchema(schemaPagamento) : null;
  const unaFamigliaScelta = famigliaPagamento === "bonifico" || famigliaPagamento === "finanziamento";
  // Negli schemi con finanziamento l'ANTICIPO è la quota non finanziata delle rate (tutte tranne quella che paga la
  // finanziaria): non sono due numeri, e il preventivo non può dirne due. Si scrivono insieme: scegliendo lo schema, o
  // cambiando le rate, `fin_anticipo_pct` segue le rate; cambiando l'anticipo nella scheda, le rate seguono l'anticipo.
  // «Personalizzato» no: lì non si sa quale rata sia il finanziamento, e i due restano indipendenti.
  const anticipoNelleRate = pagamentoScelto && SCHEMI_FINANZIAMENTO.includes(schemaPagamento) && (rateSalvate?.length ?? 0) > 0;
  const anticipoDalleRate = anticipoNelleRate ? anticipoDaRate(rateSalvate ?? []) : null;

  const anticipoPct = Number(form.fin_anticipo_pct ?? 40);
  const { data: tabelleAttive = [], isLoading: tabelleInCaricamento = false } = useTabelleFinanziamentoAttive();
  // Una tabella usata dal preventivo e poi archiviata resta nell'elenco: il piano scritto si legge ancora.
  const tabelleFinanziamento = useMemo<TabellaFinanziamento[]>(() => {
    const id = form.fin_tabella_id;
    if (!id || tabelleAttive.some((t) => t.id === id)) return tabelleAttive;
    return [...tabelleAttive, {
      id, company_id: form.company_id ?? "", finanziaria_id: null, finanziaria_nome: null,
      nome_prodotto: pianiSalvati[0]?.nome ?? "Tabella del preventivo", codice_condizione: null, subtariffa_default: null,
      tan_base: null, pdf_url: null, csv_url: null, data_decorrenza: null, data_scadenza: null, attiva: false,
    }];
  }, [tabelleAttive, form.fin_tabella_id, form.company_id, pianiSalvati]);
  // La tabella: quella scritta nel preventivo, o l'unica che la finanziaria ha (niente tendina da aprire).
  const tabellaId = form.fin_tabella_id ?? (tabelleFinanziamento.length === 1 ? tabelleFinanziamento[0].id : null);
  const { data: righeTabella = [], isLoading: righeInCaricamento = false } = useTabellaFinanziamentoRighe(tabellaId);
  const importoFinanziato = importoFinanziatoDa(forbice.media, anticipoPct);
  const durateTabella = useMemo(() => durateConRata(righeTabella, importoFinanziato), [righeTabella, importoFinanziato]);
  // Dove sta l'importo da finanziare rispetto alle fasce: oltre l'ultima non c'è nessuna rata (e la scheda lo dice).
  const fasce = useMemo(() => fasceTabella(righeTabella, importoFinanziato), [righeTabella, importoFinanziato]);

  // Il modo (da tabella o manuale) si legge dal preventivo; solo se non c'è niente di scritto si parte dalla
  // tabella, quando ce n'è una. Il clic dell'utente lo decide da lì in poi.
  const [modalitaScelta, setModalitaScelta] = useState<ModalitaFinanziamento | null>(null);
  const modalitaFin: ModalitaFinanziamento = modalitaScelta
    ?? (form.fin_tabella_id ? "tabella" : pianiSalvati.length > 0 ? "manuale" : tabelleFinanziamento.length > 0 ? "tabella" : "manuale");
  // La durata scelta è quella SCRITTA nel preventivo (dalla riga salvata, o dal piano): riaprendo lo step si vede
  // quella, non la prima della tabella. Nessuna scelta = nessuna durata evidenziata.
  const rigaSalvata = form.fin_tabella_riga_id ? righeTabella.find((r) => r.id === form.fin_tabella_riga_id) ?? null : null;
  const durataScelta = modalitaFin === "tabella" && form.fin_tabella_id ? (rigaSalvata?.durata_mesi ?? pianiSalvati[0]?.mesi ?? null) : null;
  // La riga del riepilogo: per la durata scelta e per l'importo di adesso (se il totale è cambiato, può cambiare fascia).
  const rigaTabellaScelta = durataScelta != null ? findMigliorRiga(righeTabella, importoFinanziato, durataScelta) : null;
  // Il piano manuale: i valori scritti nel preventivo, o quelli di serie finché non si tocca niente.
  const [manualeBozza, setManualeBozza] = useState<PianiManuali | null>(null);
  // La durata scelta resta in mente quando il piano esce dal preventivo senza che l'utente l'abbia tolto: passando a un
  // bonifico, o perché l'importo supera l'ultima fascia della tabella. Quando si torna al finanziamento, o l'importo
  // rientra, si rimette quella invece di far rifare la scelta. Non serve a disegnare niente: un riferimento, non uno stato.
  // Si dimentica quando l'utente cambia tabella o modo (da lì in poi non c'è nessun piano finché non sceglie).
  const durataRicordata = useRef<number | null>(null);
  const manuale = manualeBozza ?? pianiManualiDaSalvati(modalitaFin === "manuale" ? pianiSalvati : []);
  const pianiManualiCalcolati = useMemo(
    () => pianiManuali({ totale: forbice.media, anticipoPct, piani: manuale }),
    // `manuale` cambia identità a ogni render quando viene dal preventivo: contano i valori.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forbice.media, anticipoPct, manuale.estesa.mesi, manuale.estesa.tasso, manuale.standard.mesi, manuale.standard.tasso],
  );

  const scriviPianoTabella = (id: string, riga: RigaFinanziamento, pct: number) => {
    durataRicordata.current = riga.durata_mesi;
    scrivi("fin_tabella_id", id);
    scrivi("fin_tabella_riga_id", riga.id);
    scrivi("fin_anticipo_pct", pct);
    scriviPiani([pianoDaTabella({
      nomeTabella: tabelleFinanziamento.find((t) => t.id === id)?.nome_prodotto, riga, totale: forbice.media, anticipoPct: pct,
    })]);
  };
  const scriviPianiManuali = (piani: PianiManuali, pct: number) => {
    scrivi("fin_tabella_id", null);
    scrivi("fin_tabella_riga_id", null);
    scrivi("fin_anticipo_pct", pct);
    scriviPiani(pianiManuali({ totale: forbice.media, anticipoPct: pct, piani }));
  };
  const scegliDurata = (durataMesi: number) => {
    if (!tabellaId) return;
    const riga = findMigliorRiga(righeTabella, importoFinanziato, durataMesi);
    if (riga) scriviPianoTabella(tabellaId, riga, anticipoPct);
  };
  const scegliTabella = (id: string) => {
    // Un'altra tabella ha altre rate: il piano di prima non vale più, e la durata si sceglie di nuovo.
    durataRicordata.current = null;
    scrivi("fin_tabella_id", id);
    scrivi("fin_tabella_riga_id", null);
    scriviPiani([]);
  };
  const scegliAnticipo = (pct: number) => {
    const nuovo = Math.round(Math.max(0, Math.min(100, pct)) * 100) / 100;
    // Negli schemi con finanziamento le rate seguono l'anticipo: l'acconto è l'anticipo, il finanziamento il resto (con
    // anticipo 0 restano solo le rate del finanziamento, e dallo 0 in su se ne aggiunge una di acconto).
    if (anticipoNelleRate && rateSalvate) {
      const rate = rateConAnticipo(rateSalvate, nuovo, SR_SCHEMI_PAGAMENTO.acconto_finanziato.milestones[0]);
      scrivi("pagamento_milestones", rate);
      scrivi("schema_pagamento", schemaDopoAnticipo(schemaPagamento, rate));
    }
    // L'anticipo e il piano che sta nel preventivo (che lo segue) si scrivono insieme, una volta sola ciascuno.
    const riga = tabellaId && durataScelta != null
      ? findMigliorRiga(righeTabella, importoFinanziatoDa(forbice.media, nuovo), durataScelta)
      : null;
    if (modalitaFin === "manuale") {
      scriviPianiManuali(manuale, nuovo);
    } else if (tabellaId && riga) {
      scriviPianoTabella(tabellaId, riga, nuovo);
    } else {
      // Nessuna riga: nessuna durata scelta, o il nuovo importo supera l'ultima fascia. Si scrive l'anticipo; un piano
      // scritto che non vale più lo toglie l'effetto più sotto (che sa se le righe della tabella sono arrivate).
      scrivi("fin_anticipo_pct", nuovo);
    }
  };
  const scegliModalita = (modalita: ModalitaFinanziamento) => {
    setModalitaScelta(modalita);
    durataRicordata.current = null;
    if (modalita === "manuale") {
      scriviPianiManuali(manuale, anticipoPct);
    } else {
      // Da tabella: finché non si sceglie una durata nel preventivo non c'è nessun piano.
      scrivi("fin_tabella_id", tabellaId);
      scrivi("fin_tabella_riga_id", null);
      scriviPiani([]);
    }
  };
  const cambiaManuale = (piani: PianiManuali) => {
    setManualeBozza(piani);
    scriviPianiManuali(piani, anticipoPct);
  };
  /** Le rate cambiano. Negli schemi con finanziamento l'anticipo è la loro quota non finanziata, e segue (il piano nel
   *  preventivo segue l'anticipo con l'effetto più sotto). */
  const cambiaRate = (rate: Milestone[]) => {
    scrivi("pagamento_milestones", rate);
    if (anticipoNelleRate) scrivi("fin_anticipo_pct", anticipoDaRate(rate));
  };

  /** Sceglie uno schema: scrive lo schema e le sue rate. Il PDF e la pagina del cliente stampano la simulazione ogni
   *  volta che nel preventivo c'è un piano: con un bonifico non ci deve essere. Con un finanziamento l'anticipo è la
   *  quota non finanziata delle rate dello schema (30% per «Acconto + finanziato»): si scrive insieme a loro. Anticipo e
   *  tabella restano, e la scelta fatta (la durata, o i valori del piano manuale) si ricorda: tornando al finanziamento
   *  torna nel preventivo. */
  const applySchema = (next: SrSchemaPagamento) => {
    const cfg = SR_SCHEMI_PAGAMENTO[next];
    const rate = cfg.milestones.map((m) => ({ ...m }));
    scrivi("schema_pagamento", next);
    scrivi("pagamento_milestones", rate);
    const anticipoDelloSchema = SCHEMI_FINANZIAMENTO.includes(next) ? anticipoDaRate(rate) : null;
    if (anticipoDelloSchema != null) scrivi("fin_anticipo_pct", anticipoDelloSchema);
    const anticipo = anticipoDelloSchema ?? anticipoPct;
    if (!cfg.hasFinanziamento) {
      if (pianiSalvati.length > 0) {
        if (modalitaFin === "tabella" && durataScelta != null) durataRicordata.current = durataScelta;
        if (modalitaFin === "manuale") setManualeBozza(manuale);
        setModalitaScelta(modalitaFin);
      }
      scriviPiani([]);
      scrivi("fin_tabella_riga_id", null);
    } else if (famigliaDiSchema(next) === "finanziamento" && pianiSalvati.length === 0 && !tabelleInCaricamento) {
      // Si torna al finanziamento: quello che c'era torna nel preventivo con lo schema. Senza scelte fatte prima non si
      // inventa niente; fa eccezione il piano manuale, che a schermo ha già le sue rate (senza tabelle è l'unica via).
      if (modalitaFin === "manuale") {
        scriviPianiManuali(manuale, anticipo);
      } else if (tabellaId && durataRicordata.current != null) {
        const riga = findMigliorRiga(righeTabella, importoFinanziatoDa(forbice.media, anticipo), durataRicordata.current);
        if (riga) scriviPianoTabella(tabellaId, riga, anticipo);
      }
    }
  };
  /** Passa a una famiglia (bonifico/finanziamento): se lo schema attuale non vi appartiene, applica quello di
   *  partenza della famiglia. */
  const scegliFamiglia = (fam: "bonifico" | "finanziamento") => {
    if (famigliaPagamento !== fam) applySchema(FAMIGLIA_DEFAULT_SCHEMA[fam]);
  };

  const formDetrazioneAliquotaKey = String(form.detrazione_aliquota ?? "");
  useEffect(() => {
    setBonusAttivo((form.detrazione_aliquota ?? 50) > 0);
    setAliquota(aliquotaDetrazioneSerramenti(form.detrazione_aliquota));
  }, [formDetrazioneAliquotaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const formRisparmioCalcolatoKey = String(form.risparmio_calcolato ?? "");
  useEffect(() => {
    setRisparmioAttivo(form.risparmio_calcolato ?? false);
  }, [formRisparmioCalcolatoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Ecobonus ─────────────────────────────────────────────────────────────
  const [bonusAttivo, setBonusAttivo] = useState((form.detrazione_aliquota ?? 50) > 0);
  const [aliquota, setAliquota] = useState<number>(() => aliquotaDetrazioneSerramenti(form.detrazione_aliquota));

  const ecobonusCalc = useMemo(() =>
    bonusAttivo
      ? calcolaEcobonus({ imponibile_eur: forbice.media, aliquota })
      : null,
    [bonusAttivo, forbice.media, aliquota],
  );

  // Quello che questa scheda mostra è quello che esce nel PDF: l'ALIQUOTA scelta si scrive appena cambiano interruttore
  // o aliquota, e la prima volta se il preventivo non l'ha mai avuta (l'interruttore la mostra accesa al 50%, e senza
  // questa scrittura il PDF usciva senza detrazione). 0 = esclusa di proposito; null = mai scelto.
  // Gli IMPORTI che seguono il totale (prezzi, sconto, IVA, posizioni) li tiene allineati il wizard in ogni passo,
  // Economia compresa (`detrazioneDelPreventivo`, stesso conto: totale IVA inclusa, massimale, aliquota scritta): qui si
  // scrivono solo insieme a un'aliquota nuova, e mai quando l'aliquota è già quella scritta. Un solo scrittore per gli
  // importi: prima li riscrivevano tutti e due (e lo step riscriveva anche l'aliquota, uguale a quella di prima).
  useEffect(() => {
    const salvata = form.detrazione_aliquota == null ? null : Number(form.detrazione_aliquota);
    if (!ecobonusCalc) {
      if (salvata !== 0) onChange("detrazione_aliquota", 0);
      return;
    }
    if (salvata === ecobonusCalc.aliquota) return;
    // Senza che l'utente tocchi niente si scrive solo il valore di partenza (aliquota mai scelta) o un'aliquota di prima
    // non più proponibile: su un preventivo già deciso non si scrivono da soli, e nemmeno senza un importo (una bozza
    // vuota, serramenti senza prezzo: sarebbero il 50% e degli zeri mentre lo schermo non ha niente da calcolare).
    // Appena l'importo c'è il totale cambia, l'effetto riparte e il valore di partenza si scrive.
    const automatica = salvata == null || (salvata > 0 && !ALIQUOTE_DETRAZIONE_SERRAMENTI.some((i) => i.pct === salvata));
    const senzaImporto = !(forbice.media > 0);
    if (automatica && (deciso || senzaImporto)) return;
    onChange("detrazione_aliquota", ecobonusCalc.aliquota);
    onChange("detrazione_eur_totale", ecobonusCalc.detrazione_totale);
    onChange("detrazione_eur_anno", ecobonusCalc.rata_annuale);
    // onChange cambia identità a ogni render del wizard: contano solo i valori.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecobonusCalc, form.detrazione_aliquota, deciso]);

  // ─── Risparmio energetico ─────────────────────────────────────────────────
  const [risparmioAttivo, setRisparmioAttivo] = useState(form.risparmio_calcolato ?? false);
  // Gli extra (risparmio, recupero in 10 anni) stanno chiusi di serie; aprirli o chiuderli non tocca i dati:
  // interruttore, Uw, m² e bolletta sono qui, non nella scheda.
  const [extraAperti, setExtraAperti] = useState({ risparmio: false, recupero: false });
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

  const risparmioCalc = useMemo(
    () => calcolaRisparmioPreventivo(risparmioAttivo, totaleCalc.metri_quadri, zonaClimatica, uwAttuale, uwNuovo, bollettaAttuale),
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

  // ─── Le scelte si scrivono da sole (il pulsante «Applica calcoli» non c'è più) ──────────────────────────────
  // Piano di pagamento e finanziamento: sopra, dai gestori delle scelte. Detrazione: l'effetto più su. Qui il
  // risparmio energetico e il recupero in 10 anni: i campi che il PDF e la pagina del cliente leggono si scrivono
  // quando l'utente accende il risparmio o cambia gli Uw — sono quei valori, che non stanno scritti da nessuna parte,
  // a decidere il risultato, e riaprendo lo step tornano ai valori di partenza: confrontarli con quelli salvati
  // riscriverebbe il risparmio personalizzato con quello di partenza al solo aprire lo step. Quello che dipende
  // solo da dati scritti (il payback, dal totale, dal risparmio salvato e dalla detrazione) segue invece il totale
  // con un effetto, come la detrazione.
  const aggiornaRisparmio = (
    prossimo: Partial<{ attivo: boolean; uwAttuale: number; uwNuovo: number; m2Casa: number; bolletta: number }>,
  ) => {
    const dati = { attivo: risparmioAttivo, uwAttuale, uwNuovo, bolletta: bollettaAttuale, ...prossimo };
    if (prossimo.attivo !== undefined) setRisparmioAttivo(prossimo.attivo);
    if (prossimo.uwAttuale !== undefined) setUwAttuale(prossimo.uwAttuale);
    if (prossimo.uwNuovo !== undefined) setUwNuovo(prossimo.uwNuovo);
    if (prossimo.m2Casa !== undefined) setM2Casa(prossimo.m2Casa);
    if (prossimo.bolletta !== undefined) setBollettaAttuale(prossimo.bolletta);
    const campi = campiRisparmio(
      calcolaRisparmioPreventivo(dati.attivo, totaleCalc.metri_quadri, zonaClimatica, dati.uwAttuale, dati.uwNuovo, dati.bolletta),
      { totale: forbice.media, detrazioneEurAnno: ecobonusCalc ? ecobonusCalc.rata_annuale : null },
    );
    scrivi("risparmio_calcolato", campi.risparmio_calcolato);
    scrivi("risparmio_eur_anno", campi.risparmio_eur_anno);
    scrivi("co2_risparmiata_t_anno", campi.co2_risparmiata_t_anno);
    if (campi.cantiere_zona_climatica !== undefined) scrivi("cantiere_zona_climatica", campi.cantiere_zona_climatica);
    if (campi.payback_anni !== undefined) scrivi("payback_anni", campi.payback_anni);
  };

  // Il piano di finanziamento nel preventivo segue il totale: se i prezzi cambiano in un altro passo, la rata
  // scritta non resta quella di prima. Solo un piano che c'è già (non ne nasce uno da solo), solo con uno schema che
  // lo prevede, e solo se i dati per rifarlo ci sono (la tabella è arrivata); non si scrive se è già uguale.
  // Oltre l'ultima fascia della tabella una rata giusta non c'è: il piano si toglie (nel PDF non finisce una rata
  // sbagliata) e la durata si ricorda; quando l'importo rientra nelle fasce quel piano, e solo quello, torna da solo.
  // Su un preventivo già deciso (firmato, accettato, in commessa) non si scrive niente: si dice solo che il piano non
  // corrisponde al totale attuale.
  type AllineamentoPiano =
    | { azione: "scrivi"; piani: SrPianoFinanziamento[]; rigaId: string | null }
    | { azione: "togli"; durataMesi: number };
  /** Cosa servirebbe fare al piano scritto per il totale di adesso, o null: già giusto, o i dati non sono ancora arrivati.
   *  Legge solo il preventivo e le righe della tabella (niente riferimenti): serve anche a disegnare l'avviso. */
  const pianoDaAllineare = (): AllineamentoPiano | null => {
    if (!pagamentoScelto || !schemaCfg.hasFinanziamento || pianiSalvati.length === 0) return null;
    if (form.fin_tabella_id) {
      if (!rigaSalvata) return null;
      const riga = findMigliorRiga(righeTabella, importoFinanziato, rigaSalvata.durata_mesi);
      if (!riga) return { azione: "togli", durataMesi: rigaSalvata.durata_mesi };
      const atteso = [pianoDaTabella({ nomeTabella: pianiSalvati[0]?.nome, riga, totale: forbice.media, anticipoPct })];
      const giusto = pianiUguali(pianiSalvati, atteso) && riga.id === (form.fin_tabella_riga_id ?? null);
      return giusto ? null : { azione: "scrivi", piani: atteso, rigaId: riga.id };
    }
    if (pianiSalvati.length === 2) {
      const atteso = pianiManuali({ totale: forbice.media, anticipoPct, piani: pianiManualiDaSalvati(pianiSalvati) });
      return pianiUguali(pianiSalvati, atteso) ? null : { azione: "scrivi", piani: atteso, rigaId: null };
    }
    return null;
  };
  useEffect(() => {
    if (deciso || !pagamentoScelto || !schemaCfg.hasFinanziamento) return;
    if (pianiSalvati.length === 0) {
      // Il piano tolto perché l'importo usciva dalle fasce torna quando rientra: la durata ricordata è la sua.
      const durata = durataRicordata.current;
      if (durata == null || famigliaPagamento !== "finanziamento" || modalitaFin !== "tabella" || !form.fin_tabella_id || righeTabella.length === 0) return;
      const riga = findMigliorRiga(righeTabella, importoFinanziato, durata);
      if (riga) scriviPianoTabella(form.fin_tabella_id, riga, anticipoPct);
      return;
    }
    const azione = pianoDaAllineare();
    if (!azione) return;
    if (azione.azione === "togli") {
      durataRicordata.current = azione.durataMesi;
      onChange("fin_piani", []);
      onChange("fin_tabella_riga_id", null);
    } else {
      if (!pianiUguali(pianiSalvati, azione.piani)) onChange("fin_piani", azione.piani);
      if (azione.rigaId != null && azione.rigaId !== (form.fin_tabella_riga_id ?? null)) onChange("fin_tabella_riga_id", azione.rigaId);
    }
    // onChange cambia identità a ogni render del wizard: contano solo i valori.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbice.media, anticipoPct, righeTabella, form.fin_piani, form.fin_tabella_id, form.fin_tabella_riga_id, pagamentoScelto, schemaCfg.hasFinanziamento, deciso]);
  const avvisoPianoIndietro = deciso && pianoDaAllineare() != null;

  // Il recupero in 10 anni segue il totale: l'anno di pareggio si rifà dal totale, dal risparmio scritto e dalla
  // detrazione. Solo con il risparmio acceso e una detrazione; non si scrive se è già uguale.
  useEffect(() => {
    if (deciso || !form.risparmio_calcolato || !ecobonusCalc) return;
    const risparmio = Number(form.risparmio_eur_anno ?? 0);
    if (!(risparmio > 0)) return;
    const atteso = paybackAtteso({ totale: forbice.media, risparmioEurAnno: risparmio, detrazioneEurAnno: ecobonusCalc.rata_annuale });
    if (valoriDiversi(form.payback_anni, atteso)) onChange("payback_anni", atteso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbice.media, ecobonusCalc, form.risparmio_calcolato, form.risparmio_eur_anno, form.payback_anni, deciso]);

  // ─── Stato vuoto onesto ──────────────────────────────────────────────────────
  // Senza serramenti e senza un importo (un prezzo scritto a mano è un importo) i campi qui sotto non possono
  // funzionare: si dice com'è e si porta al passo dove si aggiungono. Con i serramenti la schermata c'è anche se non
  // hanno ancora un prezzo: è lì che si scrive il prezzo a mano. (Dopo tutti gli hook: l'ordine non cambia.)
  if (detail.serramenti.length === 0 && totaleCalc.imponibile_lordo <= 0) {
    return (
      <SrCard>
        <div className="flex flex-col items-center gap-3 py-6 text-center max-md:py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange-600">
            <Calculator className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Non c'è ancora niente da calcolare</p>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              Prezzo, sconto, rate e detrazione partono dai serramenti dell'offerta: aggiungine almeno uno e torna qui.
            </p>
          </div>
          {onVaiAlPasso && (
            <Button type="button" onClick={() => onVaiAlPasso("bom")} className="bg-orange-500 hover:bg-orange-600 max-sm:w-full">
              Vai all'Offerta
            </Button>
          )}
        </div>
      </SrCard>
    );
  }

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
        {/* Un solo contenitore a griglia: ogni blocco (prezzo scritto a mano, regole, avvisi, campi, margine, totale)
            occupa la riga intera e c'è solo quando serve; la griglia non lascia spazio per quello che non c'è. */}
        <div className="grid grid-cols-12 gap-3">
          {/* Prezzo manuale dell'offerta — riquadro condiviso con gli altri moduli: IVA esclusa, prende il posto
              della somma delle voci; sconto e IVA lavorano sopra. Compare se l'azienda l'ha acceso (Impostazioni →
              Margini) o se c'è già un prezzo scritto: altrimenti niente, nemmeno il riquadro tratteggiato che
              spiegava una funzione spenta. Il contenitore sta vuoto, e si nasconde, quando il riquadro non c'è. */}
          <div className="col-span-12 empty:hidden">
            <PrezzoPreventivoAMano
              id="sr-prezzo-manuale"
              companyId={detail.progetto.company_id}
              value={form.prezzo_manuale}
              sommaVoci={totaleCalc.somma_voci}
              onCommit={(v) => onChange("prezzo_manuale", v == null ? null : roundMoney(v))}
            />
          </div>
          {/* Regole di scontistica aziendale (mirror del compute_max_discount SQL): massimo, soglia di approvazione e
              margine minimo che valgono per l'importo e il tipo di lavoro di questo preventivo. Una riga sola.
              Telefono no: le regole si leggono dal computer; il limite allo sconto vale comunque. */}
          <RigaRegoleSconti regole={discountEval} className="col-span-12" />

          {/* Banner read-only per commerciali base: niente editing diretto sullo
              sconto, lo applica/conferma il titolare. Eccezione: lo possono
              richiedere via "Richiedi approvazione" (sotto). */}
          {!isAdmin && (
            <div className="col-span-12 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] text-blue-900 flex items-start gap-2">
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
              className={`col-span-12 rounded-md px-3 py-2 text-[11px] flex items-start gap-2 ${
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

          {/* I 4 campi (sconto %, sconto fisso, IVA, validità). Le label hanno la stessa altezza (h-4 fisso) così
              la riga dei campi è allineata; il verdetto sullo sconto sta sotto il campo. */}
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
              key={`sconto-importo-${form.sconto_importo}`}
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
              {/* Nel campo chiuso solo l'aliquota: la colonna è stretta a ogni larghezza e «10% —…» usciva
                  tagliato; nell'elenco aperto restano le spiegazioni. */}
              <SelectTrigger className="h-9 text-xs mt-1 [&_.iva-desc]:hidden">
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
          {/* ─── Sconti veloci (tasti 0 / 5 / 10 % e «Arriva a €»). Qui lo sconto è doppio, percentuale e fisso, e lo
              scrive solo chi può approvare gli sconti (isAdmin): gli altri vedono i campi in sola lettura e passano da
              «Richiedi approvazione». I tasti non aggirano questo flusso:
              · per chi non può approvare sono SPENTI, come i campi, e non scrivono niente (resta la sola riga dei tasti);
              · per chi può approvare scrivono lo sconto in PERCENTUALE (il campo che le regole controllano, quindi
                scattano gli stessi avvisi, «oltre il massimo» e «richiede approvazione», e la richiesta di approvazione
                resta lì) e azzerano lo sconto fisso, che sommato darebbe un totale diverso da quello che il tasto dice.
              Come nel campo, l'amministrazione non ha un tetto: vede il limite, non è fermata. */}
          <div className="col-span-12" title={!isAdmin ? "Solo l'amministrazione può cambiare lo sconto." : undefined}>
            <ScontoRapido
              className="md:flex md:flex-wrap md:items-center md:justify-between md:gap-x-6 md:space-y-0"
              valorePct={scontoInVigorePct}
              massimoPct={null}
              imponibileLordo={totaleCalc.imponibile_lordo}
              ivaPct={isAdmin ? ivaPerArrivaA : undefined}
              onApplica={applicaScontoVeloce}
              disabled={!isAdmin}
              daDito
            />
            {isAdmin && form.iva_percentuale === IVA_MISTA_SENTINEL && (
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground max-sm:hidden">
                «Arriva a €» non c'è con l'IVA mista: l'aliquota cambia con lo sconto.
              </p>
            )}
          </div>

          {/* ─── Margine: una riga. Lo vede solo chi lo vedeva prima (permesso su margini o costi). Costo, vendita,
              margine € e %, con l'avviso se i costi sono incompleti o il margine è sotto il target della regola
              di scontistica. Telefono no: margini e costi si guardano dal computer, come negli altri preventivatori. */}
          {canViewImpresa && marginCalc && <RigaMargine m={marginCalc} className="col-span-12" />}

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
                  <p className="text-[10px] uppercase font-semibold text-eic-navy-deep">
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

      {/* Come paga il cliente: un interruttore Bonifico / Finanziamento, le varianti come pastiglie e le rate in
          righe compatte (nome · quando · % · importo). Si scrive tutto subito nel preventivo. */}
      <SrCard
        title="Come paga il cliente"
        description="Bonifico o finanziamento: la scelta guida gli step qui sotto. Compare nel PDF come piano concordato."
        icon={<Wallet className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Interruttore a due posti. Finché non è scelta nessuna famiglia (preventivo nuovo, o «Personalizzato») le due
                voci sono due pulsanti col bordo: la scelta è da fare, non uno stato già deciso. */}
            <div
              role="group"
              aria-label="Come paga il cliente"
              className={cn(
                "grid w-full grid-cols-2 md:inline-grid md:w-auto",
                unaFamigliaScelta ? "gap-0.5 rounded-lg bg-slate-100 p-0.5" : "gap-2",
              )}
            >
              {([
                { fam: "bonifico" as const, icon: <Wallet className="h-4 w-4" />, label: "Bonifico", sub: "Acconti e saldo, senza finanziaria" },
                { fam: "finanziamento" as const, icon: <CreditCard className="h-4 w-4" />, label: "Finanziamento", sub: "Rate tramite finanziaria" },
              ]).map((o) => {
                const attivo = famigliaPagamento === o.fam;
                return (
                  <button
                    key={o.fam}
                    type="button"
                    onClick={() => scegliFamiglia(o.fam)}
                    aria-pressed={attivo}
                    title={o.sub}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors max-md:min-h-10 md:min-h-9 md:min-w-[8.5rem]",
                      attivo
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-orange-400"
                        : unaFamigliaScelta
                        ? "text-slate-500 hover:text-slate-800"
                        : "border border-slate-300 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50/40",
                    )}
                  >
                    <span className={attivo ? "text-orange-600" : "text-slate-400"}>{o.icon}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>

            {/* Variante della famiglia scelta (pastiglie) + Personalizzato. Toccare lo schema che è GIÀ quello scelto non fa
                niente: lo schema riporta le rate a quelle di serie (cancella quelle scritte a mano, rifà l'anticipo e il
                piano), e con il salvataggio automatico il reset partirebbe subito. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {unaFamigliaScelta &&
                (famigliaPagamento === "bonifico" ? SCHEMI_BONIFICO : SCHEMI_FINANZIAMENTO).map((k) => {
                  const on = schemaPagamento === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { if (schemaPagamento !== k) applySchema(k); }}
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors max-md:min-h-9",
                        on ? "border-orange-300 bg-orange-100 text-orange-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      {SR_SCHEMI_PAGAMENTO[k].label}
                    </button>
                  );
                })}
              <button
                type="button"
                onClick={() => { if (schemaPagamento !== "personalizzato") applySchema("personalizzato"); }}
                aria-pressed={famigliaPagamento === "personalizzato"}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors max-md:min-h-9",
                  famigliaPagamento === "personalizzato"
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-dashed border-slate-300 bg-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                Personalizzato
              </button>
            </div>
          </div>

          {pagamentoScelto ? (
            <>
              <p className="text-[11px] text-slate-600 max-md:hidden">{schemaCfg.description}</p>
              <RatePagamento
                rate={rateSalvate ?? []}
                totale={forbice.media}
                onChange={cambiaRate}
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Scegli come paga il cliente: le rate compaiono nel preventivo appena scegli.
            </p>
          )}
        </div>
      </SrCard>

      {/* Simulazione finanziamento — c'è solo se lo schema scelto lo prevede */}
      {pagamentoScelto && schemaCfg.hasFinanziamento && (
        <SrCard
          title="Simulazione finanziamento"
          description="Scegli le rate: la rata viene dalla tabella della finanziaria (o dal piano manuale) e compare nel PDF."
          icon={<CreditCard className="h-4 w-4" />}
        >
          {avvisoPianoIndietro && (
            <SrCallout variant="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />} className="mb-3">
              Il preventivo è già {motivoDeciso}: il piano di finanziamento non corrisponde al totale attuale. Resta com'è, non si riscrive da solo.
            </SrCallout>
          )}
          <SimulazioneFinanziamento
            totale={forbice.media}
            anticipoPct={anticipoPct}
            onAnticipo={scegliAnticipo}
            modalita={modalitaFin}
            onModalita={scegliModalita}
            tabelle={tabelleFinanziamento}
            tabelleInCaricamento={tabelleInCaricamento}
            tabellaId={tabellaId}
            onTabella={scegliTabella}
            righeInCaricamento={righeInCaricamento}
            durate={durateTabella}
            durataScelta={durataScelta}
            onDurata={scegliDurata}
            rigaScelta={rigaTabellaScelta}
            importoFinanziato={importoFinanziato}
            fasciaMassima={fasce.fasciaMassima}
            durateFuoriFascia={fasce.durateFuoriFascia}
            anticipoDalleRate={anticipoDalleRate}
            manuale={manuale}
            onManuale={cambiaManuale}
            pianiManuali={pianiManualiCalcolati}
            manualeNelPreventivo={pianiSalvati.length > 0}
          />
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
            {/* Telefono: l'interruttore è alto 24 px; l'area che risponde al tocco si allarga a 48×44 (il bordo da 2 px non conta) senza cambiare l'aspetto. */}
            <Switch checked={bonusAttivo} onCheckedChange={setBonusAttivo} className="max-md:relative max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-3 max-md:before:content-['']" />
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

      {/* Risparmio energetico — extra richiudibile, chiuso di serie. Lo stato (interruttore, Uw, m², bolletta)
          e i calcoli stanno qui sopra, nel componente: chiudere la scheda non cancella niente e non cambia
          quello che si scrive nel preventivo e nel PDF (lo scrivono i gestori di questi campi, aperta o no). */}
      <ExtraRichiudibile
        titolo="Risparmio energetico (per il PDF)"
        titoloBreve="Risparmio energetico"
        icona={<Leaf className="h-4 w-4" />}
        stato={risparmioAttivo ? "Attivo" : undefined}
        statoDettaglio={risparmioAttivo && risparmioCalc ? `${formatEuro(risparmioCalc.risparmio_eur_anno)}/anno` : undefined}
        aperto={extraAperti.risparmio}
        onApertoChange={(aperto) => setExtraAperti((prima) => ({ ...prima, risparmio: aperto }))}
      >
        <p className="text-[11px] text-muted-foreground max-md:hidden">
          Mostra al cliente quanto risparmierà ogni anno in bolletta + il payback completo dopo la detrazione.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between border rounded-md p-2.5 bg-muted/20">
            <div>
              <p className="text-sm font-medium">Calcola risparmio in bolletta</p>
              <p className="text-[10px] text-muted-foreground">
                Zona climatica rilevata: <span className="font-semibold">{zonaClimatica}</span> ·
                m² serramenti: {formatNumero(totaleCalc.metri_quadri, 2)}
              </p>
            </div>
            <Switch checked={risparmioAttivo} onCheckedChange={(attivo) => aggiornaRisparmio({ attivo })} className="max-md:relative max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-3 max-md:before:content-['']" />
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
                    onChange={(e) => aggiornaRisparmio({ uwAttuale: Number(e.target.value) || 0 })}
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
                    onChange={(e) => aggiornaRisparmio({ uwNuovo: Number(e.target.value) || 0 })}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5 max-md:hidden">Standard: 1.4 · Performante: 1.1 · Triplo vetro: 0.8</p>
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">m² casa</Label>
                  <Input
                    type="number" value={m2Casa}
                    onChange={(e) => aggiornaRisparmio({ m2Casa: Number(e.target.value) || 0 })}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs"><span className="max-md:hidden">Bolletta riscaldamento attuale (€/anno)</span><span className="md:hidden">Bolletta (€/anno)</span></Label>
                  <Input
                    type="number" value={bollettaAttuale}
                    onChange={(e) => aggiornaRisparmio({ bolletta: Number(e.target.value) || 0 })}
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
      </ExtraRichiudibile>

      {/* Recupero economico 10 anni (vista cliente) — extra richiudibile, chiuso di serie */}
      {cashflow && (
        <ExtraRichiudibile
          titolo="Recupero economico · 10 anni"
          titoloBreve="Recupero in 10 anni"
          icona={<TrendingUp className="h-4 w-4" />}
          statoDettaglio={cashflow.payback_anni != null ? `Payback ${formatNumero(cashflow.payback_anni, 1)} anni` : "Payback oltre 10 anni"}
          statoTono="neutro"
          aperto={extraAperti.recupero}
          onApertoChange={(aperto) => setExtraAperti((prima) => ({ ...prima, recupero: aperto }))}
        >
          <p className="text-[11px] text-muted-foreground max-md:hidden">
            Confronta il totale preventivo con risparmio bolletta e detrazione fiscale anno per anno.
          </p>
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
        </ExtraRichiudibile>
      )}

      {/* L'importo c'è (complementi, servizi) ma serramenti no: lo dice e porta all'Offerta. Con un prezzo scritto a
          mano il totale è quello, e niente da segnalare. */}
      {detail.serramenti.length === 0 && !totaleCalc.prezzo_manuale && (
        <SrCallout variant="warning">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>⚠️ Nell'offerta non ci sono serramenti: il totale viene solo da complementi e servizi.</span>
            {onVaiAlPasso && (
              <Button type="button" size="sm" variant="outline" onClick={() => onVaiAlPasso("bom")} className="text-xs">
                Vai all'Offerta
              </Button>
            )}
          </div>
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

// ─── Regole di scontistica: una riga sola ───────────────────────────────────────
//
// Prima era un riquadro con titolo, tre cifre in scatole e l'elenco delle regole applicate. Ora: massimo,
// soglia di approvazione e margine minimo in una riga; i nomi delle regole stanno nel suggerimento al passaggio
// del mouse. Come prima, solo da tablet in su.

function RigaRegoleSconti({ regole, className }: { regole: DiscountEvalResult; className?: string }) {
  const applicate = regole.matchingRules.map((r) => r.name).join(" · ");
  const suggerimento = regole.isFallback
    ? "Nessuna regola di scontistica combacia con questo preventivo: vale il massimo predefinito."
    : `Applicate: ${applicate}${regole.primaryRule && regole.matchingRules.length > 1 ? ` (principale: ${regole.primaryRule.name})` : ""}`;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-l-4 border-slate-200 border-l-eic-navy-deep bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-600 max-md:hidden",
        className,
      )}
      title={suggerimento}
    >
      <Tag className="h-3.5 w-3.5 shrink-0 text-eic-navy-deep" />
      <span className="font-semibold text-eic-navy-deep">Regole sconti</span>
      {regole.isFallback ? (
        <span>nessuna regola configurata: massimo {formatPct(regole.scontoMaxPct, 1)}</span>
      ) : (
        <>
          <span>max <strong className="tabular-nums text-slate-800">{formatPct(regole.scontoMaxPct, 1)}</strong></span>
          <span>
            {regole.approvaOltrePct != null
              ? <>approvazione oltre <strong className="tabular-nums text-slate-800">{formatPct(regole.approvaOltrePct, 1)}</strong></>
              : "nessuna approvazione richiesta"}
          </span>
          <span>margine min <strong className="tabular-nums text-slate-800">{formatPct(regole.margineMinPct, 1)}</strong></span>
        </>
      )}
      <a
        href="/azienda/impostazioni/scontistica"
        target="_blank"
        rel="noreferrer"
        className="ml-auto text-[11px] text-eic-navy-deep underline hover:no-underline"
      >
        Configura regole →
      </a>
    </div>
  );
}

// ─── Margine: una riga sola ─────────────────────────────────────────────────────
//
// Prima era un riquadro alto (titolo, quattro scatole, paragrafo di spiegazione). Ora una riga: costo acquisto,
// vendita, margine € e %, e l'avviso — se i costi sono incompleti o il margine è sotto il target. Margine reale
// sul NETTO: imponibile di vendita post-sconto meno costo di acquisto netto; con costi incompleti niente
// percentuali fuorvianti. Lo spiega il suggerimento al passaggio del mouse.

interface MargineRiga {
  costoTotale: number;
  vendita: number;
  margine: number;
  marginePct: number | null;
  margineMinPct: number;
  sottoTarget: boolean;
  costiCompleti: boolean;
  righeConCosto: number;
  righeSenzaCosto: number;
  isFetchingGridCosts: boolean;
}

function RigaMargine({ m, className }: { m: MargineRiga; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs max-md:hidden",
        !m.costiCompleti
          ? "border-amber-300 bg-amber-50/60"
          : m.sottoTarget
          ? "border-rose-300 bg-rose-50/60"
          : "border-emerald-200 bg-emerald-50/40",
        className,
      )}
      title={
        "Lo vede solo chi ha il permesso sui margini o sui costi. Il margine è calcolato su valori netti IVA esclusa: imponibile vendita meno costo acquisto netto."
        + (m.costiCompleti ? " Tutte le righe vendute hanno un costo collegato." : ` Mancano costi su ${m.righeSenzaCosto} righe: completa il listino/costo per vedere il margine reale.`)
      }
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <TrendingUp className="h-3.5 w-3.5" />
        Margine (interno)
      </span>
      <span className="text-slate-600">
        {m.costiCompleti ? null : <>parziale{" "}</>}
        <strong className={cn("tabular-nums", m.margine >= 0 ? "text-emerald-700" : "text-rose-700")}>
          {m.righeConCosto > 0 ? formatEuro(m.margine) : "—"}
        </strong>
        {m.marginePct != null && (
          <strong className={cn("ml-1 tabular-nums", m.sottoTarget ? "text-rose-700" : "text-emerald-700")}>
            ({formatPct(m.marginePct, 1)})
          </strong>
        )}
      </span>
      <span className="text-slate-600">costo <strong className="tabular-nums text-slate-800">{formatEuro(m.costoTotale)}</strong></span>
      <span className="text-slate-600">vendita <strong className="tabular-nums text-slate-800">{formatEuro(m.vendita)}</strong></span>
      {!m.costiCompleti ? (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
          <Info className="h-3 w-3" />
          Costi incompleti: mancano su {m.righeSenzaCosto} {m.righeSenzaCosto === 1 ? "riga" : "righe"}
        </span>
      ) : m.sottoTarget ? (
        <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
          <TrendingDown className="h-3 w-3" />
          Sotto target {formatPct(m.margineMinPct, 1)}
        </span>
      ) : null}
      {m.isFetchingGridCosts && <span className="text-slate-500">aggiorno i costi…</span>}
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
