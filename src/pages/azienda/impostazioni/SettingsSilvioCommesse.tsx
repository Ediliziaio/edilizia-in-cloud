/**
 * SettingsSilvioCommesse — cosa fa Silvio da solo sulle commesse (1/11/2026, fase 5, lotti 5.1 e 5.2).
 * Vedi docs/piano-silvio-commessa-ai.md, sezione 4.
 *
 * Una sezione sola: le azioni di Silvio sulle commesse, ognuna con «Mai», «Chiede», «Da solo»,
 * e sotto il calendario di cantiere (chiusura estiva, patrono, sabato) che le date di Silvio
 * rispettano. Il predefinito è «Chiede» per tutto: niente è promosso finché non lo scegli.
 *
 * Il controllo vero sta nel database (`silvio_autonomia_salva` rifiuta i livelli non ammessi,
 * `_silvio_scrittura_permessa` toglie quello che è vietato): qui le scelte oltre il massimo
 * sono spente, e chi non ha «Impostazioni commesse → Modifica» vede la pagina in sola lettura.
 *
 * È diversa da «Cosa fa Silvio da solo» (ai-automazioni), che governa le azioni della chat
 * (email, attività, appuntamenti): questa vale per il popup «Crea con Silvio» e per il piano
 * di volo delle commesse.
 */
import { Suspense, useMemo, useState } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { useCreaConSilvioAttivo } from "@/components/silvio-commessa/useCreaConSilvioAttivo";
import {
  giornoDaTesto, giornoInTesto, leggiImpostazioniSilvio, salvaImpostazioniSilvio, type ClientAutonomia, type ImpostazioniSilvio,
} from "@/lib/silvio-commessa/autonomia";
import { AZIONI_SILVIO, SEMPRE_TU, livelloDi, sogliaDi, type AzioneSilvio, type LivelloAutonomia } from "../../../../shared/silvio-commessa/autonomia.ts";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const QuantoLavoraSilvio = lazy(() => import("@/components/silvio-commessa/QuantoLavoraSilvio"));
const ReseCantiere = lazy(() => import("@/components/impostazioni/ReseCantiere").then((m) => ({ default: m.ReseCantiere })));

const ETICHETTE: Record<LivelloAutonomia, string> = { vietata: "Mai", chiede: "Chiede", da_sola: "Da solo" };

interface Bozza {
  livelli: Record<string, LivelloAutonomia>;
  soglia: string;
  chiusuraDal: string;
  chiusuraAl: string;
  patrono: string;
  patronoNome: string;
  sabato: boolean;
}

function bozzaDa(i: ImpostazioniSilvio): Bozza {
  const k = i.calendario.calendario;
  const soglia = sogliaDi(i.autonomia, "ordini");
  return {
    livelli: Object.fromEntries(AZIONI_SILVIO.map((a) => [a.azione, livelloDi(i.autonomia, a.azione)])),
    soglia: soglia == null ? "" : String(soglia).replace(".", ","),
    chiusuraDal: giornoInTesto(k?.chiusura_dal), chiusuraAl: giornoInTesto(k?.chiusura_al),
    patrono: giornoInTesto(k?.patrono), patronoNome: k?.patrono_nome ?? "", sabato: k?.sabato_lavorativo === true,
  };
}

/** Cosa non va nella bozza, o null. */
function erroreBozza(b: Bozza, t: (testo: string, valori?: Record<string, string | number>) => string): string | null {
  if (b.livelli.ordini === "da_sola" && !(Number(b.soglia.replace(",", ".")) >= 0 && b.soglia.trim())) {
    return t("Per gli ordini «Da solo» scrivi la soglia in euro: sopra la soglia Silvio chiede.");
  }
  if (!!b.chiusuraDal !== !!b.chiusuraAl) return t("La chiusura estiva vuole tutte e due le date, o nessuna.");
  for (const [campo, testo] of [["dal", b.chiusuraDal], ["al", b.chiusuraAl], ["patrono", b.patrono]] as const) {
    if (testo && !giornoDaTesto(testo)) return t("La data «{testo}» ({campo}) va scritta come GG/MM, per esempio 10/08.", { testo, campo: t(campo) });
  }
  return null;
}

export default function SettingsSilvioCommesse({ db }: { db?: ClientAutonomia } = {}) {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const permissions = usePermissions();
  const attivo = useCreaConSilvioAttivo(companyId);
  const puoModificare = permissions.isAdmin || permissions.canEditSettingsOrders;
  const queryClient = useQueryClient();
  const lettura = useQuery({
    queryKey: ["silvio-commessa", "impostazioni", companyId],
    enabled: !!companyId && attivo,
    queryFn: () => leggiImpostazioniSilvio(companyId!, db),
  });
  // Le scelte non salvate; senza, quelle lette dal database.
  const [modifiche, setModifiche] = useState<Bozza | null>(null);
  const [salvando, setSalvando] = useState(false);
  const iniziale = useMemo(() => (lettura.data ? bozzaDa(lettura.data) : null), [lettura.data]);
  const bozza = modifiche ?? iniziale;
  const cambiata = !!bozza && !!iniziale && JSON.stringify(bozza) !== JSON.stringify(iniziale);
  useSettingsDraftGuard(cambiata);

  if (!attivo) {
    return <p className="text-sm text-muted-foreground">{t("«Crea con Silvio» non è ancora attivo per la tua azienda: queste scelte arrivano con lui.")}</p>;
  }
  if (lettura.isLoading || !bozza) return <Skeleton className="h-96 w-full" />;
  if (lettura.data && !lettura.data.lette) {
    return <p className="text-sm text-muted-foreground">{t("Non riesco a leggere le impostazioni di Silvio: riprova tra poco. Finché non si leggono, Silvio chiede sempre.")}</p>;
  }

  const errore = erroreBozza(bozza, t);
  const metti = (patch: Partial<Bozza>) => setModifiche({ ...bozza, ...patch });
  const salva = async () => {
    if (!companyId || errore) return;
    setSalvando(true);
    try {
      const soglia = bozza.soglia.trim() ? Math.round(Number(bozza.soglia.replace(",", ".")) * 100) / 100 : null;
      await salvaImpostazioniSilvio(companyId,
        AZIONI_SILVIO.map((a) => ({ azione: a.azione, livello: bozza.livelli[a.azione] ?? "chiede", soglia_eur: a.soglia ? soglia : null })),
        {
          chiusura_dal: giornoDaTesto(bozza.chiusuraDal), chiusura_al: giornoDaTesto(bozza.chiusuraAl),
          patrono: giornoDaTesto(bozza.patrono), patrono_nome: bozza.patronoNome.trim() || null, sabato_lavorativo: bozza.sabato,
        }, db);
      setModifiche(null);
      await queryClient.invalidateQueries({ queryKey: ["silvio-commessa", "impostazioni", companyId] });
      toast.success(t("Scelte salvate: valgono dalla prossima commessa che apri con Silvio."));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Non sono riuscito a salvare."));
    } finally {
      setSalvando(false);
    }
  };

  const rigaAzione = (a: AzioneSilvio) => {
    const scelto = bozza.livelli[a.azione] ?? "chiede";
    const livelli: LivelloAutonomia[] = a.massimo === "da_sola" ? ["vietata", "chiede", "da_sola"] : ["vietata", "chiede"];
    return (
      <li key={a.azione} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-azione={a.azione}>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">{t(a.etichetta)}</p>
          <p className="text-xs text-muted-foreground first-letter:uppercase">{t(a.effetto)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {a.soglia && scelto === "da_sola" && (
            <Label className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              {t("fino a")}
              <Input value={bozza.soglia} inputMode="decimal" aria-label={t("Soglia degli ordini in euro")} disabled={!puoModificare}
                className="h-8 w-20 text-right" placeholder="500" onChange={(e) => metti({ soglia: e.target.value })} />
              €
            </Label>
          )}
          {/* Larghezza fissa: i «Mai» e i «Chiede» restano in colonna anche dove «Da solo» non c'è. */}
          <div className="sm:w-[12.75rem]">
            <div role="radiogroup" aria-label={t(a.etichetta)} className="inline-flex overflow-hidden rounded-md border">
              {livelli.map((l) => (
                <button key={l} type="button" role="radio" aria-checked={scelto === l} disabled={!puoModificare}
                  onClick={() => metti({ livelli: { ...bozza.livelli, [a.azione]: l } })}
                  className={cn("h-11 w-[4.25rem] text-sm transition-colors sm:h-8 sm:text-xs disabled:cursor-not-allowed disabled:opacity-40",
                    l !== "vietata" && "border-l",
                    scelto === l ? (l === "da_sola" ? "bg-emerald-600 text-white" : l === "vietata" ? "bg-slate-700 text-white" : "bg-primary text-primary-foreground")
                      : "bg-background hover:bg-muted")}>
                  {t(ETICHETTE[l])}
                </button>
              ))}
            </div>
          </div>
        </div>
      </li>
    );
  };
  const titoloGruppo = (testo: string) => (
    <li className="bg-muted/40 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{t(testo)}</li>
  );

  return (
    <div className="space-y-4">
      <SezioneImpostazione
        id="silvio-commesse"
        titolo={t("Cosa può fare Silvio")}
        descrizione={t("Mai: non lo propone. Chiede: lo propone e aspetta il tuo «Va bene». Da solo: lo fa, e lo vedi nella commessa.")}
        azione={puoModificare ? undefined : (
          <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" aria-hidden />{t("Sola lettura: serve «Impostazioni commesse → Modifica»")}</span>
        )}
      >
        <ul className="divide-y">
          {titoloGruppo("Può farlo da solo, se vuoi")}
          {AZIONI_SILVIO.filter((a) => a.massimo === "da_sola").map(rigaAzione)}
          {titoloGruppo("Prepara lui, decidi sempre tu")}
          {AZIONI_SILVIO.filter((a) => a.massimo !== "da_sola").map(rigaAzione)}
          <li className="px-4 py-2.5 text-xs text-muted-foreground">
            <Lock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            {t("Sempre tu, mai Silvio da solo:")} {SEMPRE_TU.map((s) => t(s.etichetta)).join(", ")}.
          </li>
        </ul>
      </SezioneImpostazione>

      <SezioneImpostazione
        id="calendario-cantiere"
        titolo={t("Calendario di cantiere")}
        descrizione={t("Le date di Silvio saltano domeniche, feste (Pasqua e Pasquetta comprese) e queste chiusure; le altre stanno in Personale → festività.")}
      >
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-[auto_auto_1fr] sm:items-end sm:gap-6">
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium">{t("Chiusura estiva")}</legend>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("dal")}
              <Input value={bozza.chiusuraDal} placeholder="GG/MM" disabled={!puoModificare} className="h-8 w-20" aria-label={t("Chiusura estiva dal")}
                onChange={(e) => metti({ chiusuraDal: e.target.value })} />
              {t("al")}
              <Input value={bozza.chiusuraAl} placeholder="GG/MM" disabled={!puoModificare} className="h-8 w-20" aria-label={t("Chiusura estiva al")}
                onChange={(e) => metti({ chiusuraAl: e.target.value })} />
            </div>
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium">{t("Patrono")}</legend>
            <div className="flex items-center gap-1.5">
              <Input value={bozza.patrono} placeholder="GG/MM" disabled={!puoModificare} className="h-8 w-20" aria-label={t("Giorno del patrono")}
                onChange={(e) => metti({ patrono: e.target.value })} />
              <Input value={bozza.patronoNome} placeholder={t("Nome del santo")} disabled={!puoModificare} className="h-8 w-40" aria-label={t("Nome del patrono")}
                onChange={(e) => metti({ patronoNome: e.target.value })} />
            </div>
          </fieldset>
          <Label className="flex h-8 items-center gap-2 text-xs font-medium">
            <Switch checked={bozza.sabato} disabled={!puoModificare} onCheckedChange={(v) => metti({ sabato: v })} aria-label={t("Si lavora il sabato")} />
            {t("Si lavora il sabato")}
          </Label>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            {t("Senza patrono scritto qui, Silvio usa quello della città del cantiere quando la conosce (Milano, Roma, Torino e gli altri capoluoghi grandi).")}
          </p>
        </div>
      </SezioneImpostazione>

      {companyId && (
        <SezioneImpostazione id="rese-cantiere" titolo={t("Rese di cantiere")}
          descrizione={t("Quanto fa una squadra al giorno, per lavorazione: danno i tempi delle commesse («Pianifica», «Calcola come finire», cronoprogramma del computo). Si salva quando esci dal campo.")}>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <ReseCantiere companyId={companyId} puoModificare={!!permissions.canEditOrders && puoModificare} />
          </Suspense>
        </SezioneImpostazione>
      )}

      {permissions.canEditOrders && companyId && (
        <SezioneImpostazione id="quanto-lavora-silvio" titolo={t("Quanto lavora Silvio")} descrizione={t("I suoi numeri degli ultimi 90 giorni, sulle commesse.")}>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <QuantoLavoraSilvio companyId={companyId} />
          </Suspense>
        </SezioneImpostazione>
      )}

      {/* In fondo alla pagina; con una modifica in corso resta a galla (`sticky` qui non funziona:
          scorre il documento, e i contenitori hanno overflow). Al centro: a destra c'è il pulsante di Silvio. */}
      {puoModificare && (
        <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2 shadow-sm",
          cambiata && "fixed bottom-24 left-1/2 z-40 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 shadow-lg md:bottom-4")}>
          <Button type="button" size="sm" className="h-8 gap-1" disabled={!cambiata || !!errore || salvando} onClick={() => void salva()}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}{t("Salva")}
          </Button>
          {cambiata && (
            <Button type="button" size="sm" variant="ghost" className="h-8" disabled={salvando} onClick={() => setModifiche(null)}>{t("Annulla")}</Button>
          )}
          {errore
            ? <p role="alert" className="min-w-0 text-xs text-red-700">{errore}</p>
            : <p className="text-xs text-muted-foreground">{cambiata ? t("Modifiche da salvare") : t("Nessuna modifica")}</p>}
        </div>
      )}
    </div>
  );
}
