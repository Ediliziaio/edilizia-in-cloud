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
import { useMemo, useState } from "react";
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
import { AZIONI_SILVIO, SEMPRE_TU, livelloDi, sogliaDi, type LivelloAutonomia } from "../../../../shared/silvio-commessa/autonomia.ts";
import { cn } from "@/lib/utils";

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
function erroreBozza(b: Bozza): string | null {
  if (b.livelli.ordini === "da_sola" && !(Number(b.soglia.replace(",", ".")) >= 0 && b.soglia.trim())) {
    return "Per gli ordini «Da solo» scrivi la soglia in euro: sopra la soglia Silvio chiede.";
  }
  if (!!b.chiusuraDal !== !!b.chiusuraAl) return "La chiusura estiva vuole tutte e due le date, o nessuna.";
  for (const [campo, testo] of [["dal", b.chiusuraDal], ["al", b.chiusuraAl], ["patrono", b.patrono]] as const) {
    if (testo && !giornoDaTesto(testo)) return `La data «${testo}» (${campo}) va scritta come GG/MM, per esempio 10/08.`;
  }
  return null;
}

export default function SettingsSilvioCommesse({ db }: { db?: ClientAutonomia } = {}) {
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
    return <p className="text-sm text-muted-foreground">«Crea con Silvio» non è ancora attivo per la tua azienda: queste scelte arrivano con lui.</p>;
  }
  if (lettura.isLoading || !bozza) return <Skeleton className="h-96 w-full" />;
  if (lettura.data && !lettura.data.lette) {
    return <p className="text-sm text-muted-foreground">Non riesco a leggere le impostazioni di Silvio: riprova tra poco. Finché non si leggono, Silvio chiede sempre.</p>;
  }

  const errore = erroreBozza(bozza);
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
      toast.success("Scelte salvate: valgono dalla prossima commessa che apri con Silvio.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Non sono riuscito a salvare.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <SezioneImpostazione
      id="silvio-commesse"
      titolo="Cosa fa Silvio da solo sulle commesse"
      descrizione="Mai: non lo propone. Chiede: lo propone e aspetta il tuo «Va bene». Da solo: lo fa, e lo vedi nella commessa."
      azione={puoModificare ? (
        <Button type="button" size="sm" className="h-8 gap-1" disabled={!cambiata || !!errore || salvando} onClick={() => void salva()}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}Salva
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" aria-hidden />Sola lettura: serve «Impostazioni commesse → Modifica»</span>
      )}
    >
      <ul className="divide-y">
        {AZIONI_SILVIO.map((a) => {
          const scelto = bozza.livelli[a.azione] ?? "chiede";
          return (
            <li key={a.azione} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-azione={a.azione}>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{a.etichetta}</p>
                <p className="text-xs text-muted-foreground">{a.effetto}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {a.soglia && scelto === "da_sola" && (
                  <Label className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    fino a
                    <Input value={bozza.soglia} inputMode="decimal" aria-label="Soglia degli ordini in euro" disabled={!puoModificare}
                      className="h-8 w-20 text-right" placeholder="500" onChange={(e) => metti({ soglia: e.target.value })} />
                    €
                  </Label>
                )}
                <div role="radiogroup" aria-label={a.etichetta} className="inline-flex overflow-hidden rounded-md border">
                  {(["vietata", "chiede", "da_sola"] as const).map((l) => {
                    const oltre = l === "da_sola" && a.massimo !== "da_sola";
                    return (
                      <button key={l} type="button" role="radio" aria-checked={scelto === l} disabled={!puoModificare || oltre}
                        title={oltre ? "Esce verso terzi o ha valore legale: Silvio chiede sempre" : undefined}
                        onClick={() => metti({ livelli: { ...bozza.livelli, [a.azione]: l } })}
                        className={cn("h-8 px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          l !== "vietata" && "border-l",
                          scelto === l ? (l === "da_sola" ? "bg-emerald-600 text-white" : l === "vietata" ? "bg-slate-700 text-white" : "bg-primary text-primary-foreground")
                            : "bg-background hover:bg-muted")}>
                        {ETICHETTE[l]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
        <li className="px-4 py-2.5 text-xs text-muted-foreground">
          <Lock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
          Sempre tu, mai Silvio da solo: {SEMPRE_TU.map((s) => s.etichetta).join(", ")}.
        </li>
        <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4" aria-label="Calendario di cantiere">
          <div className="w-full text-sm font-medium leading-tight sm:w-auto sm:basis-full">
            Calendario di cantiere
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              le date di Silvio saltano domeniche, feste (Pasqua e Pasquetta comprese), e queste chiusure; le altre stanno in Personale → festività
            </span>
          </div>
          <Label className="flex items-center gap-1.5 text-xs font-normal">
            Chiusura estiva dal
            <Input value={bozza.chiusuraDal} placeholder="10/08" disabled={!puoModificare} className="h-8 w-16" aria-label="Chiusura estiva dal"
              onChange={(e) => metti({ chiusuraDal: e.target.value })} />
            al
            <Input value={bozza.chiusuraAl} placeholder="23/08" disabled={!puoModificare} className="h-8 w-16" aria-label="Chiusura estiva al"
              onChange={(e) => metti({ chiusuraAl: e.target.value })} />
          </Label>
          <Label className="flex items-center gap-1.5 text-xs font-normal">
            Patrono
            <Input value={bozza.patrono} placeholder="07/12" disabled={!puoModificare} className="h-8 w-16" aria-label="Giorno del patrono"
              onChange={(e) => metti({ patrono: e.target.value })} />
            <Input value={bozza.patronoNome} placeholder="Sant'Ambrogio" disabled={!puoModificare} className="h-8 w-36" aria-label="Nome del patrono"
              onChange={(e) => metti({ patronoNome: e.target.value })} />
          </Label>
          <Label className="flex items-center gap-2 text-xs font-normal">
            <Switch checked={bozza.sabato} disabled={!puoModificare} onCheckedChange={(v) => metti({ sabato: v })} aria-label="Si lavora il sabato" />
            Si lavora il sabato
          </Label>
          <p className="text-xs text-muted-foreground sm:basis-full">
            Senza patrono scritto qui, Silvio usa quello della città del cantiere quando la conosce (Milano, Roma, Torino e gli altri capoluoghi grandi).
          </p>
        </li>
      </ul>
      {errore && <p role="alert" className="border-t px-4 py-2 text-xs text-red-700">{errore}</p>}
    </SezioneImpostazione>
  );
}
