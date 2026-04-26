/**
 * Wizard 8-step creazione progetto Fotovoltaico (§31).
 *
 * Step 1 — Cliente
 * Step 2 — Immobile (indirizzo + geocoding)
 * Step 3 — Consumi (kWh, profilo, tariffa, ISEE/reddito)
 * Step 4 — Tetto (Solar API / PVGIS / Manuale)
 * Step 5 — Configurazione impianto (componenti dal listino)
 * Step 6 — Anteprima finanziaria espansa (KPI + sensitivity + what-if)
 * Step 7 — Vista impresa (BOM + manodopera + margine)
 * Step 8 — Generazione PDF + emissione
 */

import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  ArrowRight,
  Sun,
  CheckCircle2,
  Sparkles,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  FileText,
  Wrench,
  Banknote,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  useProgetto,
  useCreaProgetto,
  useAggiornaProgetto,
  useProfiliAutoconsumo,
  useArticoliFv,
  useUpsertComponenti,
  useUpsertManodopera,
  useUpsertServizi,
} from "@/lib/fotovoltaico/queries";
import type {
  FvArchetipo,
  FvProfiloAutoconsumoCodice,
  FvTariffaTipo,
  FvCategoriaComponente,
} from "@/lib/fotovoltaico/tipi";
import { toast } from "sonner";

const TOTAL_STEPS = 8;

interface WizardData {
  // Step 1: Cliente
  cliente_nome: string;
  cliente_cognome: string;
  cliente_telefono: string;
  cliente_email: string;
  cliente_id: string | null;
  archetipo: FvArchetipo;
  // Step 2: Immobile
  indirizzo: string;
  comune: string;
  provincia: string;
  cap: string;
  regione: string;
  popolazione_comune: number | null;
  latitudine: number | null;
  longitudine: number | null;
  tipologia_immobile: string;
  superficie_immobile_mq: number | null;
  prima_casa: boolean;
  // Step 3: Consumi
  consumo_annuo_kwh: number | null;
  costo_kwh_attuale: number;
  tariffa_tipo: FvTariffaTipo;
  profilo_consumo: FvProfiloAutoconsumoCodice;
  isee: number | null;
  numero_figli: number;
  reddito_annuo_dichiarato: number | null;
  // Step 4: Tetto
  fonte_dati_tetto: "solar_api" | "pvgis" | "manuale";
  ore_sole_annue: number | null;
  superficie_tetto_disponibile_mq: number | null;
  numero_pannelli_max: number | null;
  potenza_max_kwp: number | null;
  qualita_dati_tetto: string | null;
  imagery_date: string | null;
  // Step 5: Configurazione
  numero_pannelli_scelti: number;
  potenza_kwp: number;
  con_accumulo: boolean;
  capacita_accumulo_kwh: number;
  con_wallbox: boolean;
  con_ottimizzatori: boolean;
  pannello_id: string | null;
  inverter_id: string | null;
  accumulo_id: string | null;
}

const INITIAL: WizardData = {
  cliente_nome: "",
  cliente_cognome: "",
  cliente_telefono: "",
  cliente_email: "",
  cliente_id: null,
  archetipo: "privato_prima",
  indirizzo: "",
  comune: "",
  provincia: "",
  cap: "",
  regione: "",
  popolazione_comune: null,
  latitudine: null,
  longitudine: null,
  tipologia_immobile: "residenziale",
  superficie_immobile_mq: null,
  prima_casa: true,
  consumo_annuo_kwh: null,
  costo_kwh_attuale: 0.32,
  tariffa_tipo: "monoraria",
  profilo_consumo: "misto",
  isee: null,
  numero_figli: 0,
  reddito_annuo_dichiarato: null,
  fonte_dati_tetto: "solar_api",
  ore_sole_annue: null,
  superficie_tetto_disponibile_mq: null,
  numero_pannelli_max: null,
  potenza_max_kwp: null,
  qualita_dati_tetto: null,
  imagery_date: null,
  numero_pannelli_scelti: 16,
  potenza_kwp: 8.64,
  con_accumulo: false,
  capacita_accumulo_kwh: 0,
  con_wallbox: false,
  con_ottimizzatori: false,
  pannello_id: null,
  inverter_id: null,
  accumulo_id: null,
};

export default function FotovoltaicoWizard() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(INITIAL);
  const [progettoId, setProgettoId] = useState<string | null>(id ?? null);
  const [salvando, setSalvando] = useState(false);
  const [analizzandoTetto, setAnalizzandoTetto] = useState(false);
  const [calcolandoFinanziario, setCalcolandoFinanziario] = useState(false);
  const [scenarioFin, setScenarioFin] = useState<Record<string, unknown> | null>(null);

  const { data: profili = [] } = useProfiliAutoconsumo();
  const { data: pannelli = [] } = useArticoliFv("pannello");
  const { data: inverter = [] } = useArticoliFv("inverter");
  const { data: accumuli = [] } = useArticoliFv("accumulo");
  const { data: progettoEsistente } = useProgetto(progettoId ?? undefined);

  const creaProgetto = useCreaProgetto();
  const aggiornaProgetto = useAggiornaProgetto();
  const upsertComponenti = useUpsertComponenti();
  const upsertManodopera = useUpsertManodopera();
  const upsertServizi = useUpsertServizi();

  // Carica progetto esistente nello state se presente
  useEffect(() => {
    if (progettoEsistente && progettoId) {
      setData((d) => ({
        ...d,
        archetipo: progettoEsistente.archetipo,
        indirizzo: progettoEsistente.indirizzo,
        comune: progettoEsistente.comune ?? "",
        provincia: progettoEsistente.provincia ?? "",
        cap: progettoEsistente.cap ?? "",
        regione: progettoEsistente.regione ?? "",
        popolazione_comune: progettoEsistente.popolazione_comune,
        latitudine: progettoEsistente.latitudine,
        longitudine: progettoEsistente.longitudine,
        tipologia_immobile: progettoEsistente.tipologia_immobile ?? "residenziale",
        superficie_immobile_mq: progettoEsistente.superficie_immobile_mq,
        prima_casa: progettoEsistente.prima_casa ?? true,
        consumo_annuo_kwh: progettoEsistente.consumo_annuo_kwh,
        costo_kwh_attuale: progettoEsistente.costo_kwh_attuale ?? 0.32,
        tariffa_tipo: progettoEsistente.tariffa_tipo ?? "monoraria",
        profilo_consumo: (progettoEsistente.profilo_consumo as FvProfiloAutoconsumoCodice) ?? "misto",
        isee: progettoEsistente.isee,
        numero_figli: progettoEsistente.numero_figli ?? 0,
        reddito_annuo_dichiarato: progettoEsistente.reddito_annuo_dichiarato,
        fonte_dati_tetto: (progettoEsistente.fonte_dati_tetto as never) ?? "solar_api",
        ore_sole_annue: progettoEsistente.ore_sole_annue,
        superficie_tetto_disponibile_mq: progettoEsistente.superficie_tetto_disponibile_mq,
        numero_pannelli_max: progettoEsistente.numero_pannelli_max,
        potenza_max_kwp: progettoEsistente.potenza_max_kwp,
        numero_pannelli_scelti: progettoEsistente.numero_pannelli_scelti ?? 16,
        potenza_kwp: progettoEsistente.potenza_kwp ?? 8.64,
        con_accumulo: progettoEsistente.con_accumulo ?? false,
        capacita_accumulo_kwh: progettoEsistente.capacita_accumulo_kwh ?? 0,
        con_wallbox: progettoEsistente.con_wallbox ?? false,
        con_ottimizzatori: progettoEsistente.con_ottimizzatori ?? false,
      }));
    }
  }, [progettoEsistente, progettoId]);

  const update = <K extends keyof WizardData>(k: K, v: WizardData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  // ─── Validazione step ─────────────────────────────────────────────────────
  const stepValido = useMemo(() => {
    switch (step) {
      case 1:
        return Boolean(
          data.cliente_nome.trim() &&
          data.cliente_cognome.trim() &&
          (data.cliente_telefono.trim() || data.cliente_email.trim())
        );
      case 2:
        return Boolean(
          data.indirizzo.trim() &&
          data.latitudine != null &&
          data.longitudine != null
        );
      case 3:
        return data.consumo_annuo_kwh != null && data.consumo_annuo_kwh >= 500;
      case 4:
        return data.ore_sole_annue != null && data.numero_pannelli_max != null;
      case 5:
        return data.potenza_kwp > 0 && data.numero_pannelli_scelti > 0;
      case 6:
        return scenarioFin != null;
      case 7:
        return Boolean(progettoId);
      case 8:
        return Boolean(progettoId);
      default:
        return false;
    }
  }, [step, data, scenarioFin, progettoId]);

  // ─── Step 2 → onboarding cliente (crea progetto in DB) ────────────────────
  const handleSalvaStep2 = async () => {
    if (!data.indirizzo || data.latitudine == null || data.longitudine == null) return;
    setSalvando(true);
    try {
      const titolo = `${data.cliente_nome} ${data.cliente_cognome}`.trim();
      if (!progettoId) {
        // Chiama edge function fv-onboarding-cliente
        const { data: result, error } = await supabase.functions.invoke(
          "fv-onboarding-cliente",
          {
            body: {
              titolo,
              archetipo: data.archetipo,
              indirizzo: data.indirizzo,
              comune: data.comune || undefined,
              provincia: data.provincia || undefined,
              cap: data.cap || undefined,
              regione: data.regione || undefined,
              popolazione_comune: data.popolazione_comune ?? undefined,
              latitudine: data.latitudine,
              longitudine: data.longitudine,
              tipologia_immobile: data.tipologia_immobile,
              superficie_immobile_mq: data.superficie_immobile_mq ?? undefined,
              prima_casa: data.prima_casa,
              consumo_annuo_kwh: data.consumo_annuo_kwh ?? 3500, // placeholder; verrà aggiornato a step 3
              costo_kwh_attuale: data.costo_kwh_attuale,
              tariffa_tipo: data.tariffa_tipo,
              profilo_consumo: data.profilo_consumo,
              isee: data.isee ?? undefined,
              numero_figli: data.numero_figli,
              reddito_annuo_dichiarato: data.reddito_annuo_dichiarato ?? undefined,
            },
          }
        );
        if (error) throw error;
        const newId = (result as { progetto_id: string }).progetto_id;
        setProgettoId(newId);
        toast.success("Progetto creato — continua con i consumi");
      } else {
        // Aggiorna esistente
        await aggiornaProgetto.mutateAsync({
          id: progettoId,
          patch: {
            archetipo: data.archetipo,
            indirizzo: data.indirizzo,
            comune: data.comune,
            provincia: data.provincia,
            cap: data.cap,
            regione: data.regione,
            popolazione_comune: data.popolazione_comune,
            latitudine: data.latitudine,
            longitudine: data.longitudine,
            tipologia_immobile: data.tipologia_immobile,
            superficie_immobile_mq: data.superficie_immobile_mq,
            prima_casa: data.prima_casa,
          } as never,
        });
      }
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  // ─── Step 3 → salva consumi ──────────────────────────────────────────────
  const handleSalvaStep3 = async () => {
    if (!progettoId) return;
    setSalvando(true);
    try {
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          consumo_annuo_kwh: data.consumo_annuo_kwh,
          costo_kwh_attuale: data.costo_kwh_attuale,
          tariffa_tipo: data.tariffa_tipo,
          profilo_consumo: data.profilo_consumo,
          isee: data.isee,
          numero_figli: data.numero_figli,
          reddito_annuo_dichiarato: data.reddito_annuo_dichiarato,
        } as never,
      });
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  // ─── Step 4 → analisi tetto ───────────────────────────────────────────────
  const handleAnalizzaTetto = async () => {
    if (!progettoId || data.latitudine == null || data.longitudine == null) return;
    setAnalizzandoTetto(true);
    try {
      let result: Record<string, unknown> | null = null;
      if (data.fonte_dati_tetto === "solar_api") {
        const { data: r, error } = await supabase.functions.invoke("fv-solar-api-fetch", {
          body: { lat: data.latitudine, lng: data.longitudine, progetto_id: progettoId },
        });
        if (error) throw error;
        result = r as Record<string, unknown>;
      } else if (data.fonte_dati_tetto === "pvgis") {
        const { data: r, error } = await supabase.functions.invoke("fv-pvgis-fetch", {
          body: { lat: data.latitudine, lng: data.longitudine, kwp: data.potenza_kwp },
        });
        if (error) throw error;
        result = r as Record<string, unknown>;
      }

      if (!result) {
        toast.error("Nessun dato tetto");
        return;
      }

      const ore = (result.ore_sole_annue as number) ?? (result.ore_sole_annue_equivalenti as number) ?? null;
      const numMax = (result.numero_pannelli_max as number) ?? null;
      const kwpMax = (result.potenza_max_kwp as number) ?? null;

      update("ore_sole_annue", ore);
      update("numero_pannelli_max", numMax);
      update("potenza_max_kwp", kwpMax);
      update("superficie_tetto_disponibile_mq", (result.superficie_tetto_disponibile_mq as number) ?? null);
      update("qualita_dati_tetto", (result.qualita as string) ?? null);
      update("imagery_date", (result.imagery_date as string) ?? null);

      // Salva su progetto
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          fonte_dati_tetto: data.fonte_dati_tetto,
          ore_sole_annue: ore,
          superficie_tetto_disponibile_mq: (result.superficie_tetto_disponibile_mq as number) ?? null,
          numero_pannelli_max: numMax,
          potenza_max_kwp: kwpMax,
          qualita_dati_tetto: (result.qualita as string) ?? null,
          imagery_date: (result.imagery_date as string) ?? null,
        } as never,
      });

      const isMock = result._mock === true;
      toast.success(`Tetto analizzato: ${ore?.toFixed(0)} h sole/anno · max ${numMax} pannelli${isMock ? " (mock dev)" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalizzandoTetto(false);
    }
  };

  // ─── Step 5 → configurazione + componenti ─────────────────────────────────
  const handleSalvaStep5 = async () => {
    if (!progettoId) return;
    setSalvando(true);
    try {
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          numero_pannelli_scelti: data.numero_pannelli_scelti,
          potenza_kwp: data.potenza_kwp,
          con_accumulo: data.con_accumulo,
          capacita_accumulo_kwh: data.capacita_accumulo_kwh,
          con_wallbox: data.con_wallbox,
          con_ottimizzatori: data.con_ottimizzatori,
        } as never,
      });

      // Componenti dal listino
      const comp: Array<{
        progetto_id: string;
        articolo_id: string | null;
        categoria: FvCategoriaComponente;
        descrizione: string;
        quantita: number;
        unita_misura: string;
        prezzo_unitario_netto: number;
        prezzo_unitario_vendita: number;
        margine_pct: number | null;
        potenza_unitaria_w: number | null;
        potenza_unitaria_kw: number | null;
        capacita_kwh: number | null;
        garanzia_anni: number | null;
        ordinamento: number;
      }> = [];

      const pannello = pannelli.find((p) => (p as { id: string }).id === data.pannello_id);
      if (pannello) {
        const p = pannello as Record<string, unknown>;
        const netto = (p.prezzo_acquisto as number) ?? (p.prezzo_vendita as number) * 0.75;
        const vendita = (p.prezzo_vendita as number) ?? netto * 1.3;
        comp.push({
          progetto_id: progettoId,
          articolo_id: data.pannello_id,
          categoria: "pannello",
          descrizione: (p.descrizione as string) ?? "Pannello FV",
          quantita: data.numero_pannelli_scelti,
          unita_misura: "pz",
          prezzo_unitario_netto: netto,
          prezzo_unitario_vendita: vendita,
          margine_pct: vendita > 0 ? (vendita - netto) / vendita : null,
          potenza_unitaria_w: (p.potenza_w as number) ?? 540,
          potenza_unitaria_kw: null,
          capacita_kwh: null,
          garanzia_anni: (p.garanzia_anni as number) ?? 25,
          ordinamento: 1,
        });
      }
      const inv = inverter.find((p) => (p as { id: string }).id === data.inverter_id);
      if (inv) {
        const p = inv as Record<string, unknown>;
        const netto = (p.prezzo_acquisto as number) ?? (p.prezzo_vendita as number) * 0.75;
        const vendita = (p.prezzo_vendita as number) ?? netto * 1.3;
        comp.push({
          progetto_id: progettoId,
          articolo_id: data.inverter_id,
          categoria: "inverter",
          descrizione: (p.descrizione as string) ?? "Inverter",
          quantita: 1,
          unita_misura: "pz",
          prezzo_unitario_netto: netto,
          prezzo_unitario_vendita: vendita,
          margine_pct: vendita > 0 ? (vendita - netto) / vendita : null,
          potenza_unitaria_w: null,
          potenza_unitaria_kw: (p.potenza_kw as number) ?? data.potenza_kwp,
          capacita_kwh: null,
          garanzia_anni: (p.garanzia_anni as number) ?? 10,
          ordinamento: 2,
        });
      }
      if (data.con_accumulo) {
        const acc = accumuli.find((p) => (p as { id: string }).id === data.accumulo_id);
        if (acc) {
          const p = acc as Record<string, unknown>;
          const netto = (p.prezzo_acquisto as number) ?? (p.prezzo_vendita as number) * 0.75;
          const vendita = (p.prezzo_vendita as number) ?? netto * 1.3;
          comp.push({
            progetto_id: progettoId,
            articolo_id: data.accumulo_id,
            categoria: "accumulo",
            descrizione: (p.descrizione as string) ?? "Accumulo",
            quantita: 1,
            unita_misura: "pz",
            prezzo_unitario_netto: netto,
            prezzo_unitario_vendita: vendita,
            margine_pct: vendita > 0 ? (vendita - netto) / vendita : null,
            potenza_unitaria_w: null,
            potenza_unitaria_kw: null,
            capacita_kwh: (p.capacita_kwh as number) ?? data.capacita_accumulo_kwh,
            garanzia_anni: (p.garanzia_anni as number) ?? 10,
            ordinamento: 3,
          });
        } else {
          // Componente generico se non scelto da listino
          comp.push({
            progetto_id: progettoId,
            articolo_id: null,
            categoria: "accumulo",
            descrizione: `Accumulo ${data.capacita_accumulo_kwh} kWh`,
            quantita: 1,
            unita_misura: "pz",
            prezzo_unitario_netto: data.capacita_accumulo_kwh * 600,
            prezzo_unitario_vendita: data.capacita_accumulo_kwh * 800,
            margine_pct: 0.25,
            potenza_unitaria_w: null,
            potenza_unitaria_kw: null,
            capacita_kwh: data.capacita_accumulo_kwh,
            garanzia_anni: 10,
            ordinamento: 3,
          });
        }
      }

      await upsertComponenti.mutateAsync({
        progetto_id: progettoId,
        righe: comp.map(({ progetto_id: _ignored, ...r }) => r),
        replace: true,
      });

      // Manodopera + servizi standard pre-popolati (override poi possibile)
      const ore_installazione = Math.ceil(data.numero_pannelli_scelti * 0.5 + 8);
      await upsertManodopera.mutateAsync({
        progetto_id: progettoId,
        replace: true,
        righe: [
          {
            tariffa_id: null,
            descrizione: `Installazione impianto ${data.potenza_kwp} kWp`,
            ore: ore_installazione,
            tariffa_oraria_netta: 30,
            tariffa_oraria_vendita: 40,
            margine_pct: 0.25,
            ordinamento: 1,
          },
        ],
      });
      await upsertServizi.mutateAsync({
        progetto_id: progettoId,
        replace: true,
        righe: [
          {
            tipo: "pratica_gse",
            descrizione: "Pratica GSE RID",
            quantita: 1,
            prezzo_netto: 200,
            prezzo_vendita: 350,
            ordinamento: 1,
            note_operative: "Entro 90 gg da fine lavori",
          },
          {
            tipo: "allaccio_e_distribuzione",
            descrizione: "Pratica E-Distribuzione (TICA)",
            quantita: 1,
            prezzo_netto: 150,
            prezzo_vendita: 280,
            ordinamento: 2,
            note_operative: null,
          },
          {
            tipo: "asseverazione",
            descrizione: "Asseverazione tecnica",
            quantita: 1,
            prezzo_netto: 250,
            prezzo_vendita: 450,
            ordinamento: 3,
            note_operative: null,
          },
        ],
      });

      setStep(6);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  // ─── Step 6 → calcolo finanziario ─────────────────────────────────────────
  const handleCalcolaFinanziario = async () => {
    if (!progettoId) return;
    setCalcolandoFinanziario(true);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "fv-calcolo-finanziario",
        { body: { progetto_id: progettoId } }
      );
      if (error) throw error;
      setScenarioFin(result as Record<string, unknown>);
      toast.success("Calcolo finanziario completato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCalcolandoFinanziario(false);
    }
  };

  // Auto-calcolo entrando nello step 6
  useEffect(() => {
    if (step === 6 && progettoId && !scenarioFin && !calcolandoFinanziario) {
      handleCalcolaFinanziario();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, progettoId]);

  // ─── Step 8 → genera PDF + emetti ─────────────────────────────────────────
  const handleGeneraEdEmetti = async () => {
    if (!progettoId) return;
    setSalvando(true);
    try {
      // Genera 3 PDF in parallelo
      const tipi = ["vendita", "tecnico", "mobile"] as const;
      await Promise.all(
        tipi.map((t) =>
          supabase.functions.invoke("fv-genera-pdf", {
            body: { progetto_id: progettoId, tipo: t },
          })
        )
      );

      // Aggiorna stato a "emesso"
      await aggiornaProgetto.mutateAsync({
        id: progettoId,
        patch: {
          stato: "emesso",
          emesso_il: new Date().toISOString(),
        } as never,
      });

      toast.success("Preventivo emesso! PDF generati con successo");
      navigate(`/azienda/marketing/fotovoltaico/${progettoId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  // ─── Render header progress ───────────────────────────────────────────────
  const progressPct = (step / TOTAL_STEPS) * 100;
  const stepLabels = [
    "Cliente",
    "Immobile",
    "Consumi",
    "Tetto",
    "Configurazione",
    "Finanziario",
    "Vista impresa",
    "Emissione",
  ];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/marketing/fotovoltaico")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Lista progetti
        </Button>
      </div>

      <Card>
        <CardContent className="py-5">
          <div className="flex items-center gap-3 mb-3">
            <Sun className="h-6 w-6 text-amber-500" />
            <div className="flex-1">
              <h2 className="font-semibold">
                {progettoId ? "Modifica progetto" : "Nuovo progetto fotovoltaico"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Step {step} di {TOTAL_STEPS} — {stepLabels[step - 1]}
              </p>
            </div>
          </div>
          <Progress value={progressPct} />
        </CardContent>
      </Card>

      {/* Step content */}
      {step === 1 && <Step1Cliente data={data} update={update} />}
      {step === 2 && <Step2Immobile data={data} update={update} />}
      {step === 3 && <Step3Consumi data={data} update={update} profili={profili as never} />}
      {step === 4 && (
        <Step4Tetto
          data={data}
          update={update}
          analizzando={analizzandoTetto}
          onAnalizza={handleAnalizzaTetto}
        />
      )}
      {step === 5 && (
        <Step5Configurazione
          data={data}
          update={update}
          pannelli={pannelli as never}
          inverter={inverter as never}
          accumuli={accumuli as never}
        />
      )}
      {step === 6 && (
        <Step6Finanziario
          scenario={scenarioFin}
          calcolando={calcolandoFinanziario}
          onRicalcola={handleCalcolaFinanziario}
        />
      )}
      {step === 7 && progettoId && <Step7VistaImpresa progettoId={progettoId} scenario={scenarioFin} />}
      {step === 8 && <Step8Genera onEmetti={handleGeneraEdEmetti} salvando={salvando} />}

      {/* Navigation footer */}
      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || salvando}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Indietro
        </Button>
        {step < TOTAL_STEPS && (
          <Button
            onClick={async () => {
              if (step === 2) await handleSalvaStep2();
              else if (step === 3) await handleSalvaStep3();
              else if (step === 5) await handleSalvaStep5();
              else setStep((s) => s + 1);
            }}
            disabled={!stepValido || salvando || analizzandoTetto || calcolandoFinanziario}
          >
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Avanti
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Cliente ────────────────────────────────────────────────────────
function Step1Cliente({
  data,
  update,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <h3 className="font-semibold">Dati cliente</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Nome *</Label>
            <Input value={data.cliente_nome} onChange={(e) => update("cliente_nome", e.target.value)} />
          </div>
          <div>
            <Label>Cognome *</Label>
            <Input value={data.cliente_cognome} onChange={(e) => update("cliente_cognome", e.target.value)} />
          </div>
          <div>
            <Label>Telefono</Label>
            <Input value={data.cliente_telefono} onChange={(e) => update("cliente_telefono", e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={data.cliente_email} onChange={(e) => update("cliente_email", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Archetipo cliente *</Label>
          <Select value={data.archetipo} onValueChange={(v) => update("archetipo", v as FvArchetipo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="privato_prima">Privato — prima casa</SelectItem>
              <SelectItem value="privato_seconda">Privato — seconda casa</SelectItem>
              <SelectItem value="privato_isee">Privato — ISEE basso (Reddito Energetico)</SelectItem>
              <SelectItem value="pmi">PMI / Partita IVA</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          * Almeno uno tra telefono o email è obbligatorio.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Step 2: Immobile ───────────────────────────────────────────────────────
function Step2Immobile({
  data,
  update,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <h3 className="font-semibold">Immobile</h3>
        <div>
          <Label>Indirizzo completo *</Label>
          <Input
            placeholder="Via Roma 12, 20100 Milano MI"
            value={data.indirizzo}
            onChange={(e) => update("indirizzo", e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Per la versione Wave 1 inserisci manualmente latitudine/longitudine. Geocoding Google Places in W2.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Comune</Label>
            <Input value={data.comune} onChange={(e) => update("comune", e.target.value)} />
          </div>
          <div>
            <Label>Provincia (sigla)</Label>
            <Input
              maxLength={2}
              value={data.provincia}
              onChange={(e) => update("provincia", e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <Label>CAP</Label>
            <Input value={data.cap} onChange={(e) => update("cap", e.target.value)} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Latitudine *</Label>
            <Input
              type="number"
              step="0.000001"
              value={data.latitudine ?? ""}
              onChange={(e) => update("latitudine", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <Label>Longitudine *</Label>
            <Input
              type="number"
              step="0.000001"
              value={data.longitudine ?? ""}
              onChange={(e) => update("longitudine", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Tipologia</Label>
            <Select value={data.tipologia_immobile} onValueChange={(v) => update("tipologia_immobile", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="residenziale">Residenziale</SelectItem>
                <SelectItem value="capannone">Capannone</SelectItem>
                <SelectItem value="ufficio">Ufficio</SelectItem>
                <SelectItem value="agricolo">Agricolo</SelectItem>
                <SelectItem value="altro">Altro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Superficie (m²)</Label>
            <Input
              type="number"
              value={data.superficie_immobile_mq ?? ""}
              onChange={(e) => update("superficie_immobile_mq", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <Label>Popolazione comune</Label>
            <Input
              type="number"
              value={data.popolazione_comune ?? ""}
              onChange={(e) => update("popolazione_comune", e.target.value ? Number(e.target.value) : null)}
              placeholder="per stima CER"
            />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data.prima_casa}
              onChange={(e) => update("prima_casa", e.target.checked)}
              className="h-4 w-4"
            />
            <span>Prima casa (abitazione principale)</span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 3: Consumi ────────────────────────────────────────────────────────
function Step3Consumi({
  data,
  update,
  profili,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  profili: Array<{ codice: string; nome_visualizzato: string; emoji: string | null }>;
}) {
  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <h3 className="font-semibold">Consumi e profilo</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Consumo annuo kWh *</Label>
            <Input
              type="number"
              value={data.consumo_annuo_kwh ?? ""}
              onChange={(e) => update("consumo_annuo_kwh", e.target.value ? Number(e.target.value) : null)}
              placeholder="es. 3500"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tipico residenziale: 2.500-4.500 kWh/anno
            </p>
          </div>
          <div>
            <Label>Costo €/kWh attuale</Label>
            <Input
              type="number"
              step="0.001"
              value={data.costo_kwh_attuale}
              onChange={(e) => update("costo_kwh_attuale", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Tipo tariffa</Label>
            <Select value={data.tariffa_tipo} onValueChange={(v) => update("tariffa_tipo", v as FvTariffaTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monoraria">Monoraria</SelectItem>
                <SelectItem value="bioraria">Bioraria</SelectItem>
                <SelectItem value="trioraria">Trioraria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Profilo consumo</Label>
            <Select
              value={data.profilo_consumo}
              onValueChange={(v) => update("profilo_consumo", v as FvProfiloAutoconsumoCodice)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {profili.map((p) => (
                  <SelectItem key={p.codice} value={p.codice}>
                    {p.emoji} {p.nome_visualizzato}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(data.archetipo === "privato_prima" || data.archetipo === "privato_isee") && (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Dati fiscali (per incentivi)</h4>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>ISEE €</Label>
                <Input
                  type="number"
                  value={data.isee ?? ""}
                  onChange={(e) => update("isee", e.target.value ? Number(e.target.value) : null)}
                  placeholder="solo se vuoi Reddito Energetico"
                />
              </div>
              <div>
                <Label>Numero figli</Label>
                <Input
                  type="number"
                  min={0}
                  value={data.numero_figli}
                  onChange={(e) => update("numero_figli", Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Reddito annuo lordo €</Label>
                <Input
                  type="number"
                  value={data.reddito_annuo_dichiarato ?? ""}
                  onChange={(e) =>
                    update("reddito_annuo_dichiarato", e.target.value ? Number(e.target.value) : null)
                  }
                  placeholder="per check capienza IRPEF"
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 4: Tetto ──────────────────────────────────────────────────────────
function Step4Tetto({
  data,
  update,
  analizzando,
  onAnalizza,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  analizzando: boolean;
  onAnalizza: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <h3 className="font-semibold">Analisi tetto</h3>
        <div className="grid sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => update("fonte_dati_tetto", "solar_api")}
            className={
              "rounded-md border p-3 text-left transition " +
              (data.fonte_dati_tetto === "solar_api" ? "border-primary bg-primary/5" : "hover:bg-muted")
            }
          >
            <div className="font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Google Solar API
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Analisi satellitare ad alta risoluzione. Layout pannelli automatico.
            </p>
          </button>
          <button
            type="button"
            onClick={() => update("fonte_dati_tetto", "pvgis")}
            className={
              "rounded-md border p-3 text-left transition " +
              (data.fonte_dati_tetto === "pvgis" ? "border-primary bg-primary/5" : "hover:bg-muted")
            }
          >
            <div className="font-medium">PVGIS (UE)</div>
            <p className="text-xs text-muted-foreground mt-1">
              Dati irradiazione gratuiti. Niente geometria tetto.
            </p>
          </button>
          <button
            type="button"
            onClick={() => update("fonte_dati_tetto", "manuale")}
            className={
              "rounded-md border p-3 text-left transition " +
              (data.fonte_dati_tetto === "manuale" ? "border-primary bg-primary/5" : "hover:bg-muted")
            }
          >
            <div className="font-medium">Manuale</div>
            <p className="text-xs text-muted-foreground mt-1">
              Inserisci tu i parametri. Ultima spiaggia se le altre fonti falliscono.
            </p>
          </button>
        </div>

        {data.fonte_dati_tetto !== "manuale" && (
          <Button onClick={onAnalizza} disabled={analizzando} size="lg" className="w-full">
            {analizzando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Stiamo analizzando il tuo tetto…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Analizza tetto
              </>
            )}
          </Button>
        )}

        {data.ore_sole_annue && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Tetto analizzato</AlertTitle>
            <AlertDescription>
              <ul className="text-sm mt-1 space-y-1">
                <li>Ore sole annue: <strong>{data.ore_sole_annue?.toFixed(0)} h</strong></li>
                <li>Numero pannelli max: <strong>{data.numero_pannelli_max}</strong></li>
                <li>Potenza max: <strong>{data.potenza_max_kwp?.toFixed(2)} kWp</strong></li>
                {data.qualita_dati_tetto && (
                  <li>Qualità dati: <strong>{data.qualita_dati_tetto}</strong></li>
                )}
                {data.imagery_date && (
                  <li>Immagine satellitare: <strong>{data.imagery_date}</strong></li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {data.fonte_dati_tetto === "manuale" && (
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>Ore sole annue</Label>
              <Input
                type="number"
                value={data.ore_sole_annue ?? ""}
                onChange={(e) => update("ore_sole_annue", e.target.value ? Number(e.target.value) : null)}
                placeholder="es. 1450"
              />
            </div>
            <div>
              <Label>Numero pannelli max</Label>
              <Input
                type="number"
                value={data.numero_pannelli_max ?? ""}
                onChange={(e) => update("numero_pannelli_max", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div>
              <Label>Potenza max kWp</Label>
              <Input
                type="number"
                step="0.01"
                value={data.potenza_max_kwp ?? ""}
                onChange={(e) => update("potenza_max_kwp", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 5: Configurazione ─────────────────────────────────────────────────
function Step5Configurazione({
  data,
  update,
  pannelli,
  inverter,
  accumuli,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  pannelli: Array<Record<string, unknown>>;
  inverter: Array<Record<string, unknown>>;
  accumuli: Array<Record<string, unknown>>;
}) {
  // Auto-calcolo potenza_kwp da numero pannelli (assumi 540W default)
  useEffect(() => {
    if (data.pannello_id) {
      const p = pannelli.find((x) => (x as { id: string }).id === data.pannello_id);
      const w = (p?.potenza_w as number) ?? 540;
      update("potenza_kwp", Math.round((data.numero_pannelli_scelti * w) / 10) / 100);
    } else {
      update("potenza_kwp", Math.round((data.numero_pannelli_scelti * 540) / 10) / 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.numero_pannelli_scelti, data.pannello_id]);

  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <h3 className="font-semibold">Configurazione impianto</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Numero pannelli</Label>
            <Input
              type="number"
              min={4}
              max={data.numero_pannelli_max ?? 100}
              value={data.numero_pannelli_scelti}
              onChange={(e) => update("numero_pannelli_scelti", Number(e.target.value))}
            />
            {data.numero_pannelli_max && (
              <p className="text-xs text-muted-foreground mt-1">
                Max disponibile su tetto: {data.numero_pannelli_max}
              </p>
            )}
          </div>
          <div>
            <Label>Potenza impianto (auto)</Label>
            <Input value={`${data.potenza_kwp.toFixed(2)} kWp`} disabled />
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label>Modello pannello</Label>
            <Select value={data.pannello_id ?? ""} onValueChange={(v) => update("pannello_id", v || null)}>
              <SelectTrigger><SelectValue placeholder="Seleziona pannello…" /></SelectTrigger>
              <SelectContent>
                {pannelli.length === 0 ? (
                  <SelectItem value="__none__" disabled>Nessun pannello in listino</SelectItem>
                ) : (
                  pannelli.map((p) => (
                    <SelectItem key={(p as { id: string }).id} value={(p as { id: string }).id}>
                      {p.descrizione as string} ({p.potenza_w as number}W)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Inverter</Label>
            <Select value={data.inverter_id ?? ""} onValueChange={(v) => update("inverter_id", v || null)}>
              <SelectTrigger><SelectValue placeholder="Seleziona inverter…" /></SelectTrigger>
              <SelectContent>
                {inverter.length === 0 ? (
                  <SelectItem value="__none__" disabled>Nessun inverter</SelectItem>
                ) : (
                  inverter.map((p) => (
                    <SelectItem key={(p as { id: string }).id} value={(p as { id: string }).id}>
                      {p.descrizione as string}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Accumulo (opzionale)</Label>
            <Select
              value={data.accumulo_id ?? "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") {
                  update("accumulo_id", null);
                  update("con_accumulo", false);
                  update("capacita_accumulo_kwh", 0);
                } else {
                  update("accumulo_id", v);
                  update("con_accumulo", true);
                  const acc = accumuli.find((x) => (x as { id: string }).id === v);
                  update("capacita_accumulo_kwh", (acc?.capacita_kwh as number) ?? 5);
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nessun accumulo</SelectItem>
                {accumuli.map((p) => (
                  <SelectItem key={(p as { id: string }).id} value={(p as { id: string }).id}>
                    {p.descrizione as string} ({p.capacita_kwh as number} kWh)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data.con_wallbox}
              onChange={(e) => update("con_wallbox", e.target.checked)}
              className="h-4 w-4"
            />
            <span>Wallbox (cross-sell auto elettrica)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data.con_ottimizzatori}
              onChange={(e) => update("con_ottimizzatori", e.target.checked)}
              className="h-4 w-4"
            />
            <span>Ottimizzatori per ombreggiamento (PR +3%)</span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 6: Anteprima finanziaria ──────────────────────────────────────────
function Step6Finanziario({
  scenario,
  calcolando,
  onRicalcola,
}: {
  scenario: Record<string, unknown> | null;
  calcolando: boolean;
  onRicalcola: () => void;
}) {
  if (calcolando) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
          <p className="font-medium">Sto calcolando il tuo scenario finanziario…</p>
          <p className="text-sm text-muted-foreground">
            25 anni di flussi cassa, NPV, IRR, sensitivity, what-if
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!scenario) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Button onClick={onRicalcola}>Calcola scenario finanziario</Button>
        </CardContent>
      </Card>
    );
  }

  const sens_minus15 = scenario.sensitivity_minus15 as { payback_anni: number | null; npv: number };
  const sens_plus15 = scenario.sensitivity_plus15 as { payback_anni: number | null; npv: number };
  const auto_ev = scenario.scenario_auto_elettrica as { payback_anni: number | null; npv: number; autoconsumo: number };
  const pdc = scenario.scenario_pompa_calore as { payback_anni: number | null; npv: number };
  const incentivi = (scenario.incentivi as Array<{ codice: string; nome: string; importo_eur: number | null }>) ?? [];
  const costi = scenario.costi as { prezzo_vendita_iva_inclusa: number };

  const formatEur = (n: number) => `€ ${n.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;
  const investimento = costi?.prezzo_vendita_iva_inclusa ?? 0;
  const risparmioAnno1 = (scenario.risparmio_bolletta_eur as number) + (scenario.ricavi_rid_eur as number);
  const risparmio25Anni = scenario.risparmio_totale_25_anni as number;
  const cassaAnni = (scenario.cassa_anno_per_anno as Array<{ anno: number; cumulato: number }>) ?? [];
  const detrazione10anni = ((scenario.detrazione_anno_eur as number) ?? 0) * 10;
  const costoNettoReale = investimento - detrazione10anni;
  const rataMensilePrestito = Math.round((investimento * 1.20) / 84); // ~20% costo prestito 84 mesi
  const risparmioMensile = Math.round(risparmioAnno1 / 12);
  const costoNettoMensile = Math.max(0, rataMensilePrestito - risparmioMensile);

  return (
    <div className="space-y-4">
      {/* HERO BOX gradient navy con numero shock 25 anni */}
      <div className="relative overflow-hidden rounded-2xl p-8 text-white shadow-2xl"
        style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2C5184 100%)" }}>
        <div className="absolute -top-1/2 -right-10 w-3/5 h-[200%] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 60%)" }} />
        <div className="absolute right-8 top-8 text-7xl opacity-10 select-none" aria-hidden>☀</div>
        <div className="relative">
          <div className="text-xs uppercase tracking-widest font-semibold mb-2 text-orange-200">★ L'INVESTIMENTO</div>
          <h2 className="text-2xl font-bold mb-3 max-w-[70%]">Il tuo impianto fotovoltaico in 25 anni</h2>
          <div className="flex flex-wrap items-baseline gap-8 mt-5">
            <span className="text-6xl md:text-7xl font-extrabold leading-none tracking-tight"
              style={{ color: "#F97316", textShadow: "0 4px 24px rgba(249,115,22,0.4)" }}>
              {formatEur(risparmio25Anni)}
            </span>
            <div className="text-sm space-y-1.5 max-w-xs">
              <div>guadagno netto in 25 anni vs senza FV</div>
              <div>Investimento: <strong className="text-orange-200">{formatEur(investimento)}</strong> chiavi in mano</div>
              <div>Detrazione IRPEF 50%: <strong className="text-orange-200">{formatEur(detrazione10anni)}</strong> in 10 anni</div>
              <div>Costo netto effettivo: <strong className="text-orange-200">{formatEur(costoNettoReale)}</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 KPI HERO */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiHero label="INVESTIMENTO" value={formatEur(investimento)} accent={false} />
        <KpiHero label="RISPARMIO ANNO 1" value={formatEur(risparmioAnno1)} accent={false} />
        <KpiHero label="PAYBACK" value={`${scenario.payback_anni ?? "—"} anni`} accent />
        <KpiHero label="RISPARMIO 25 ANNI" value={formatEur(risparmio25Anni)} accent />
      </div>

      {/* 3 NUM CARDS — Rata vs Risparmio vs Costo netto reale (con scenario prestito) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-5 text-center">
          <div className="text-xs uppercase tracking-wider font-semibold text-blue-900 mb-1.5">Rata mensile (Cofidis 84m)</div>
          <div className="text-3xl font-extrabold text-blue-900 tabular-nums">{formatEur(rataMensilePrestito)}</div>
          <div className="text-xs text-blue-700 mt-1">×84 mesi · TAEG ~5,4%</div>
        </div>
        <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-5 text-center">
          <div className="text-xs uppercase tracking-wider font-semibold text-emerald-900 mb-1.5">Risparmio bolletta</div>
          <div className="text-3xl font-extrabold text-emerald-700 tabular-nums">{formatEur(risparmioMensile)}</div>
          <div className="text-xs text-emerald-700 mt-1">ogni mese, primo anno</div>
        </div>
        <div className="rounded-2xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-orange-200 p-5 text-center relative overflow-hidden">
          <div className="absolute top-2 right-2 bg-white text-orange-700 text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider">★ COSTO REALE</div>
          <div className="text-xs uppercase tracking-wider font-semibold text-orange-900 mb-1.5">Costo netto reale</div>
          <div className="text-4xl font-extrabold tabular-nums text-orange-700 animate-pulse">{formatEur(costoNettoMensile)}</div>
          <div className="text-xs text-orange-800 mt-1">/mese · meno di un caffè al giorno</div>
        </div>
      </div>

      {/* Grafico SVG Cassa Cumulata 25 anni (style mockup) */}
      {cassaAnni.length > 0 && (
        <Card>
          <CardContent className="py-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h4 className="font-semibold">Cassa cumulata 25 anni</h4>
                <p className="text-xs text-muted-foreground">Da quando rientri tutto è guadagno netto</p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">★ Breakeven anno {scenario.payback_anni ?? "—"}</span>
                <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-800 font-semibold">{formatEur(risparmio25Anni)} a fine vita</span>
              </div>
            </div>
            <CassaCumulataChart cassa={cassaAnni} payback={scenario.payback_anni as number | null} />
          </CardContent>
        </Card>
      )}

      {/* Capienza IRPEF */}
      {scenario.capienza_irpef_warning ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Attenzione capienza IRPEF</AlertTitle>
          <AlertDescription>{scenario.capienza_irpef_warning as string}</AlertDescription>
        </Alert>
      ) : scenario.capienza_irpef_ok ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>Capienza IRPEF OK</AlertTitle>
          <AlertDescription>Detrazione interamente recuperabile in 10 anni.</AlertDescription>
        </Alert>
      ) : null}

      {/* Sensitivity */}
      <Card>
        <CardContent className="py-5">
          <h4 className="font-semibold mb-3">Cosa succede se cambia il prezzo dell'energia</h4>
          <div className="grid grid-cols-3 gap-3">
            <ScenarioBox label="Pessimistico (-15%)" payback={sens_minus15?.payback_anni} npv={sens_minus15?.npv} icon={<TrendingDown className="h-4 w-4 text-red-600" />} />
            <ScenarioBox label="Base" payback={scenario.payback_anni as number | null} npv={scenario.npv_25_anni as number} icon={<Trophy className="h-4 w-4 text-amber-500" />} highlight />
            <ScenarioBox label="Ottimistico (+15%)" payback={sens_plus15?.payback_anni} npv={sens_plus15?.npv} icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} />
          </div>
        </CardContent>
      </Card>

      {/* What-if scenari */}
      <Card>
        <CardContent className="py-5">
          <h4 className="font-semibold mb-3">Se tra 2-3 anni…</h4>
          <div className="grid grid-cols-2 gap-3">
            <ScenarioBox label="…compri auto elettrica" payback={auto_ev?.payback_anni} npv={auto_ev?.npv} subtitle={`autoconsumo ${(auto_ev?.autoconsumo * 100 || 0).toFixed(0)}%`} />
            <ScenarioBox label="…installi pompa calore" payback={pdc?.payback_anni} npv={pdc?.npv} subtitle="sostituisci caldaia gas" />
          </div>
        </CardContent>
      </Card>

      {/* Incentivi applicati */}
      {incentivi.length > 0 && (
        <Card>
          <CardContent className="py-5">
            <h4 className="font-semibold mb-3">Incentivi che ti spettano</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {incentivi.map((inc) => (
                <div key={inc.codice} className="rounded-md border p-3">
                  <div className="font-medium text-sm">{inc.nome}</div>
                  <div className="text-lg font-bold mt-1 text-orange-600">
                    {inc.importo_eur != null ? formatEur(inc.importo_eur) : "Disponibile"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sezione narrativa: +240% bollette vs +11,5% reddito (chiusura emozionale) */}
      <div className="rounded-2xl p-7 border-2 border-orange-300"
        style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FED7AA 50%, #FECACA 100%)" }}>
        <div className="text-center mb-5">
          <div className="inline-block bg-white text-orange-700 px-4 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase mb-3">
            ★ Perché farlo ADESSO
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2 leading-tight">
            Negli ultimi 10 anni le bollette sono salite del <span className="text-orange-600">+240%</span>
          </h2>
          <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">
            Il tuo stipendio? Solo <span className="text-red-600">+11,5%</span>
          </h2>
          <p className="text-sm text-slate-700 mt-3 max-w-xl mx-auto">
            Dati Codacons + ISTAT. La differenza è una mazzata che peggiora ogni anno. Il fotovoltaico è
            l'unico modo concreto per <strong>uscire da questa forbice</strong>.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { val: "+240%", lbl: "Bolletta luce", sub: "2012 → 2022 · Codacons", color: "text-red-600" },
            { val: "+107%", lbl: "In soli 5 anni", sub: "2019 → 2024 · Confcommercio", color: "text-orange-600" },
            { val: "+11,5%", lbl: "Reddito famiglie", sub: "Stesso periodo · ISTAT", color: "text-slate-500" },
          ].map((k) => (
            <div key={k.lbl} className="bg-white rounded-xl p-4 text-center shadow-sm">
              <div className={`text-4xl font-extrabold leading-none ${k.color}`}>{k.val}</div>
              <div className="text-xs font-bold text-slate-900 mt-2 uppercase tracking-wide">{k.lbl}</div>
              <div className="text-[10px] text-slate-500 mt-1">{k.sub}</div>
            </div>
          ))}
        </div>
        {/* Closer */}
        <div className="rounded-xl p-5 text-center text-white relative overflow-hidden"
          style={{ background: "#1E3A5F" }}>
          <div className="absolute -top-1/3 -right-10 w-1/2 h-[160%] pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(249,115,22,0.2) 0%, transparent 60%)" }} />
          <div className="relative text-base sm:text-lg font-bold leading-relaxed">
            In 25 anni pagherai <strong className="text-orange-400">~250.000 €</strong> di bollette<br />
            oppure investirai <strong className="text-orange-400">{formatEur(investimento)}</strong> oggi e
            <strong className="text-emerald-400"> guadagnerai {formatEur(risparmio25Anni)}</strong>.
          </div>
          <div className="relative text-sm opacity-85 mt-3">
            Non è un investimento: è una scelta tra <strong>essere ostaggio del mercato</strong> o
            <strong> essere indipendente</strong>.
          </div>
        </div>
      </div>

      <div className="text-right">
        <Button variant="outline" size="sm" onClick={onRicalcola}>
          Ricalcola
        </Button>
      </div>
    </div>
  );
}

/**
 * Grafico cassa cumulata 25 anni — line chart SVG con area negativa rossa,
 * area positiva verde, breakeven marker arancione, end-value badge verde.
 * Replica del mockup HTML §6 (anteprima finanziaria).
 */
function CassaCumulataChart({ cassa, payback }: { cassa: Array<{ anno: number; cumulato: number }>; payback: number | null }) {
  if (cassa.length === 0) return null;
  const W = 800;
  const H = 280;
  const padL = 50, padR = 30, padT = 30, padB = 50;
  const minCum = Math.min(...cassa.map((c) => c.cumulato), 0);
  const maxCum = Math.max(...cassa.map((c) => c.cumulato), 0);
  const xRange = cassa[cassa.length - 1].anno;
  const xScale = (anno: number) => padL + (anno / xRange) * (W - padL - padR);
  const yRange = Math.max(maxCum - minCum, 1);
  const yScale = (cum: number) => padT + ((maxCum - cum) / yRange) * (H - padT - padB);
  const yZero = yScale(0);
  // Linea principale
  const linePoints = cassa.map((c) => `${xScale(c.anno)},${yScale(c.cumulato)}`).join(" L ");
  // Area negativa
  const negPoints = cassa.filter((c) => c.cumulato <= 0).map((c) => `${xScale(c.anno)},${yScale(c.cumulato)}`);
  const negArea = negPoints.length > 0
    ? `M ${negPoints[0].split(",")[0]},${yZero} L ${negPoints.join(" L ")} L ${negPoints[negPoints.length - 1].split(",")[0]},${yZero} Z`
    : null;
  // Area positiva
  const posPoints = cassa.filter((c) => c.cumulato >= 0).map((c) => `${xScale(c.anno)},${yScale(c.cumulato)}`);
  const posArea = posPoints.length > 0
    ? `M ${posPoints[0].split(",")[0]},${yZero} L ${posPoints.join(" L ")} L ${posPoints[posPoints.length - 1].split(",")[0]},${yZero} Z`
    : null;
  const breakevenX = payback != null ? xScale(payback) : null;
  const finalCum = cassa[cassa.length - 1].cumulato;
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n.toFixed(0)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Grafico cassa cumulata ${xRange} anni`}>
      <defs>
        <linearGradient id="fvGreenArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16A34A" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#16A34A" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line key={p} x1={padL} x2={W - padR} y1={padT + p * (H - padT - padB)} y2={padT + p * (H - padT - padB)}
          stroke="#E2E8F0" strokeDasharray="2,3" />
      ))}
      {/* Area negativa rossastra */}
      {negArea && <path d={negArea} fill="#FEE2E2" opacity="0.6" />}
      {/* Area positiva verde */}
      {posArea && <path d={posArea} fill="url(#fvGreenArea)" />}
      {/* Zero line */}
      <line x1={padL} x2={W - padR} y1={yZero} y2={yZero} stroke="#94A3B8" strokeWidth="1.5" />
      {/* Linea principale */}
      <path d={`M ${linePoints}`} stroke="#1E3A5F" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Breakeven marker */}
      {breakevenX != null && (
        <>
          <line x1={breakevenX} x2={breakevenX} y1={padT} y2={H - padB} stroke="#F97316" strokeWidth="2" strokeDasharray="5,3" />
          <circle cx={breakevenX} cy={yZero} r="6" fill="#F97316" stroke="white" strokeWidth="3">
            <animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
          </circle>
          <g transform={`translate(${breakevenX + 5}, ${padT + 10})`}>
            <rect width="120" height="32" rx="6" fill="#F97316" />
            <text x="10" y="14" fontSize="10" fill="white" fontWeight="700">BREAKEVEN</text>
            <text x="10" y="26" fontSize="10" fill="white">Anno {payback?.toFixed(1)} · 0 €</text>
          </g>
        </>
      )}
      {/* End value marker */}
      <circle cx={xScale(xRange)} cy={yScale(finalCum)} r="6" fill="#16A34A" stroke="white" strokeWidth="3" />
      <g transform={`translate(${xScale(xRange) - 110}, ${yScale(finalCum) - 30})`}>
        <rect width="110" height="20" rx="4" fill="#16A34A" />
        <text x="55" y="14" fontSize="10" fill="white" fontWeight="700" textAnchor="middle">+{fmt(finalCum)} €</text>
      </g>
      {/* Y axis labels */}
      <g fontSize="10" fill="#64748B">
        <text x={padL - 5} y={padT + 4} textAnchor="end">+{fmt(maxCum)}</text>
        <text x={padL - 5} y={yZero + 4} textAnchor="end">0</text>
        <text x={padL - 5} y={H - padB + 4} textAnchor="end">{fmt(minCum)}</text>
      </g>
      {/* X axis labels */}
      <g fontSize="10" fill="#64748B" textAnchor="middle">
        {[0, 5, 10, 15, 20, xRange].map((a) => (
          <text key={a} x={xScale(a)} y={H - padB + 18}>{`Anno ${a}`}</text>
        ))}
      </g>
    </svg>
  );
}

function KpiHero({ label, value, accent }: { label: string; value: string; accent: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "bg-orange-50 border-orange-200" : "bg-card"}`}>
      <p className="text-xs font-medium text-muted-foreground tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${accent ? "text-orange-600" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function ScenarioBox({
  label,
  payback,
  npv,
  icon,
  highlight,
  subtitle,
}: {
  label: string;
  payback: number | null | undefined;
  npv: number | null | undefined;
  icon?: React.ReactNode;
  highlight?: boolean;
  subtitle?: string;
}) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "bg-amber-50 border-amber-200" : ""}`}>
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 space-y-0.5">
        <div className="text-sm">
          Payback: <strong>{payback ?? "—"} anni</strong>
        </div>
        <div className="text-sm">
          NPV: <strong>€ {(npv ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 0 })}</strong>
        </div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}

// ─── Step 7: Vista impresa ──────────────────────────────────────────────────
function Step7VistaImpresa({
  progettoId,
  scenario,
}: {
  progettoId: string;
  scenario: Record<string, unknown> | null;
}) {
  const costi = scenario?.costi as { costo_totale_netto?: number; prezzo_vendita_iva_inclusa?: number; margine_eur?: number; margine_pct?: number } | undefined;

  return (
    <Card>
      <CardContent className="py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          <h3 className="font-semibold">Vista impresa — costi e margini</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiHero label="COSTO NETTO" value={`€ ${(costi?.costo_totale_netto ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`} accent={false} />
          <KpiHero label="PREZZO VENDITA" value={`€ ${(costi?.prezzo_vendita_iva_inclusa ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`} accent={false} />
          <KpiHero label="MARGINE €" value={`€ ${(costi?.margine_eur ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`} accent />
          <KpiHero label="MARGINE %" value={`${((costi?.margine_pct ?? 0) * 100).toFixed(1)}%`} accent />
        </div>
        <Alert>
          <Banknote className="h-4 w-4" />
          <AlertTitle>Vista solo titolare</AlertTitle>
          <AlertDescription>
            I costi netti e i margini sono visibili solo a te. I venditori vedono solo il prezzo finale al cliente.
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Per modificare componenti, manodopera o servizi torna allo Step 5. Le modifiche al margine per
          singolo componente saranno disponibili nella pagina Dettaglio progetto dopo l'emissione.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Step 8: Genera ─────────────────────────────────────────────────────────
function Step8Genera({
  onEmetti,
  salvando,
}: {
  onEmetti: () => void;
  salvando: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-8 text-center space-y-4">
        <FileText className="h-16 w-16 mx-auto text-primary" />
        <h3 className="text-xl font-semibold">Pronto a generare il preventivo</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Genereremo automaticamente 3 PDF: Vendita (12 pagine persuasive), Tecnico (6 pagine
          BOM/margini, solo per te), Mobile (3 pagine per WhatsApp). Tempo stimato: 10 secondi.
        </p>
        <Button size="lg" onClick={onEmetti} disabled={salvando}>
          {salvando ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generazione in corso…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Genera ed emetti preventivo
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
