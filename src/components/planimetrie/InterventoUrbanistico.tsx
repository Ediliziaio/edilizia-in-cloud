import type { ReactNode } from "react";
import { ArrowRight, Building2, ExternalLink, MapPin, PanelLeftClose, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { INTERVENTO_INIZIALE, NOMI_PIANO, quadroIntervento } from "@/lib/planimetrie/verificaIntervento";
import { cn } from "@/lib/utils";
import { PIANI_INTERVENTO, type AmbitoCartografico, type InterventoUrbanistico, type RiscontroCartografico } from "../../../shared/planimetrie/urbanistica";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function CampoUrbanistico({ nome, children }: { nome: string; children: ReactNode }) {
  return <Label className="block space-y-1.5 text-sm"><span>{nome}</span>{children}</Label>;
}

export function FonteLink({ url, children }: { url: string; children: ReactNode }) {
  return <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-words font-medium text-primary underline-offset-4 hover:underline">
    {children}<ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
  </a>;
}

export function SceltaInterventoUrbanistico({ intervento, onModifica }: {
  intervento?: InterventoUrbanistico;
  onModifica: (v: InterventoUrbanistico) => void;
}) {
  const t = useT();
  const attuale = intervento ?? INTERVENTO_INIZIALE;
  const aggiorna = (campi: Partial<InterventoUrbanistico>) => onModifica({ ...attuale, ...campi });
  return <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
    <h3 className="text-sm font-semibold">{t("Intervento da valutare")}</h3>
    <div role="group" aria-label={t("Tipo di intervento")} className="grid gap-2 sm:grid-cols-2">
      {([
        ["frazionamento", "Frazionamento", PanelLeftClose],
        ["cambio_uso", "Cambio d’uso", Building2],
      ] as const).map(([tipo, titolo, Icona]) => <Button key={tipo} type="button" variant="outline"
        aria-pressed={attuale.tipo === tipo} onClick={() => aggiorna({ tipo })}
        className="h-11 justify-start gap-2 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary">
        <Icona aria-hidden="true" className="h-4 w-4" />{t(titolo)}
      </Button>)}
    </div>
    {attuale.tipo === "frazionamento" ? <div className="grid gap-3 sm:grid-cols-3">
      <CampoUrbanistico nome={t("Unità previste")}>
        <Input type="number" min={2} max={80} defaultValue={attuale.unitaPreviste ?? 2} onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isInteger(n) && n >= 2 && n <= 80) aggiorna({ unitaPreviste: n });
        }} onBlur={e => {
          if (!e.currentTarget.value || !e.currentTarget.validity.valid) e.currentTarget.value = String(attuale.unitaPreviste ?? 2);
        }} />
      </CampoUrbanistico>
      <CampoUrbanistico nome={t("Volumetria complessiva")}>
        <UniformSelect value={attuale.volume ?? ""} onChange={e => aggiorna({ volume: (e.target.value || undefined) as InterventoUrbanistico["volume"] })}>
          <option value="">{t("Da verificare")}</option><option value="invariato">{t("Invariata")}</option><option value="variato">{t("Modificata")}</option>
        </UniformSelect>
      </CampoUrbanistico>
      <CampoUrbanistico nome={t("Destinazione d’uso")}>
        <UniformSelect value={attuale.usoFrazionamento ?? ""} onChange={e => aggiorna({ usoFrazionamento: (e.target.value || undefined) as InterventoUrbanistico["usoFrazionamento"] })}>
          <option value="">{t("Da verificare")}</option><option value="invariato">{t("Invariata")}</option><option value="variato">{t("Modificata")}</option>
        </UniformSelect>
      </CampoUrbanistico>
    </div> : <div className="grid gap-3 sm:grid-cols-2">
      <CampoUrbanistico nome={t("Uso attuale indicato")}><Input value={attuale.usoAttuale ?? ""} onChange={e => aggiorna({ usoAttuale: e.target.value })} maxLength={120} placeholder={t("Es. Garage")} /></CampoUrbanistico>
      <CampoUrbanistico nome={t("Uso previsto")}><Input value={attuale.usoPrevisto ?? ""} onChange={e => aggiorna({ usoPrevisto: e.target.value })} maxLength={120} placeholder={t("Es. Abitazione")} /></CampoUrbanistico>
      <CampoUrbanistico nome={t("Piano dell’unità")}>
        <UniformSelect value={attuale.piano ?? ""} onChange={e => aggiorna({ piano: (e.target.value || undefined) as InterventoUrbanistico["piano"] })}>
          <option value="">{t("Seleziona il piano")}</option>{PIANI_INTERVENTO.map(p => <option key={p} value={p}>{t(NOMI_PIANO[p])}</option>)}
        </UniformSelect>
      </CampoUrbanistico>
      <CampoUrbanistico nome={t("Opere previste")}>
        <UniformSelect value={attuale.opere ?? ""} onChange={e => aggiorna({ opere: (e.target.value || undefined) as InterventoUrbanistico["opere"] })}>
          <option value="">{t("Da individuare")}</option><option value="con_opere">{t("Con opere")}</option><option value="senza_opere">{t("Senza opere")}</option>
        </UniformSelect>
      </CampoUrbanistico>
    </div>}
  </section>;
}

const esitiStrato = { trovato: "Riscontro", assente: "Nessun riscontro in questo strato", parziale: "Risposta parziale", indisponibile: "Fonte non disponibile" };

export function RiscontriCartografici({ cartografia, onCollega, fontiCollegate = [] }: {
  cartografia?: RiscontroCartografico;
  onCollega?: (ambito: AmbitoCartografico) => void;
  fontiCollegate?: string[];
}) {
  const t = useT();
  const ambiti = cartografia?.ambiti ?? [];
  return <section className="space-y-3 rounded-xl border bg-card p-4" aria-label={t("Riscontro cartografico")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" />{t("Zona e tutele sulle mappe")}</h3>
      {cartografia && <span className="text-xs text-muted-foreground">{t("Consultate il {valore}", { valore: new Date(`${cartografia.data}T12:00:00`).toLocaleDateString(intlCampo()) })}</span>}
    </div>
    {!cartografia ? <p className="text-sm text-muted-foreground">{t("Localizza l’immobile per interrogare le tavole disponibili.")}</p> : <>
      <div className="grid gap-2.5 md:grid-cols-2">
        {(["zona", "tutela"] as const).map(categoria => {
          const risultati = ambiti.filter(a => (a.categoria ?? "zona") === categoria);
          return <div key={categoria} className="min-w-0 rounded-lg border bg-muted/20 p-3">
            <h4 className="text-xs font-semibold">{categoria === "zona" ? t("Ambiti di piano") : t("Tutele da riscontrare")}</h4>
            {risultati.length ? <ul className="mt-2 space-y-2 text-sm">
              {risultati.map((a, i) => <li key={`${a.tavola}-${i}`} className="space-y-0.5">
                <FonteLink url={a.scheda ?? a.tavola}>{a.descrizione}</FonteLink>
                {onCollega && a.scheda && !fontiCollegate.includes(a.scheda) && <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => onCollega(a)}>{t("Collega scheda")}</Button>}
              </li>)}
            </ul> : <p className="mt-1.5 text-sm text-muted-foreground">{t("Riscontra la particella sulle fonti ufficiali.")}</p>}
          </div>;
        })}
      </div>
      {cartografia.esito === "discordante" && <p className="text-sm text-amber-800 dark:text-amber-200">{t("Il punto è vicino al confine tra Comuni. Verifica il perimetro della particella.")}</p>}
      {cartografia.esito === "parziale" && <p className="text-sm text-amber-800 dark:text-amber-200">{t("Copertura parziale. Controlla la disponibilità delle singole tavole.")}</p>}
      <p className="text-xs text-muted-foreground">{t("I riscontri riguardano il punto e il suo intorno. Controlla il perimetro della particella sulle tavole ufficiali.")}</p>
      {!!cartografia.strati?.length && <details className="text-sm">
        <summary className="cursor-pointer font-medium">{t("Tavole interrogate e disponibilità")}</summary>
        <ul className="mt-2 divide-y">{cartografia.strati.map((s, i) => <li key={`${s.fonte}-${i}`} className="flex flex-wrap justify-between gap-2 py-2">
          <FonteLink url={s.fonte}>{s.titolo}</FonteLink><span className="text-xs text-muted-foreground">{t(esitiStrato[s.esito])}</span>
        </li>)}</ul>
      </details>}
    </>}
  </section>;
}

export function EsitoInterventoUrbanistico({ quadro, intervento = INTERVENTO_INIZIALE, cartografia, onFonti }: {
  quadro: ReturnType<typeof quadroIntervento>;
  intervento?: InterventoUrbanistico;
  cartografia?: RiscontroCartografico;
  onFonti: () => void;
}) {
  const t = useT();
  const formata = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 });
  return <div className="space-y-3">
    <section className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-primary" aria-hidden="true" />{t("Verifica preliminare dell’intervento")}</h3>
        <Badge variant="outline" className={cn(quadro.criticita.length > 0 && "border-destructive/40 text-destructive")}>
          {quadro.criticita.length ? t("Criticità nel confronto con i requisiti") : t("Verifiche aperte")}
        </Badge>
      </div>
      <p className="mt-1.5 text-sm font-medium">{intervento.tipo === "frazionamento"
        ? t("Frazionamento in {n} unità", { n: intervento.unitaPreviste ?? 2 })
        : intervento.usoAttuale && intervento.usoPrevisto ? t("Cambio d’uso · {usoAttuale} → {usoPrevisto}", { usoAttuale: String(intervento.usoAttuale ?? ""), usoPrevisto: String(intervento.usoPrevisto ?? "") }) : t("Cambio d’uso")}</p>
      {!!quadro.unita.length && <div className="mt-2 flex flex-wrap gap-1.5">
        {quadro.unita.map(u => <Badge key={u.sigla} variant="secondary">{t("Unità {sigla}", { sigla: u.sigla })} · {quadro.contorniStimati && "≈ "}{t("{mq} m² netti", { mq: formata.format(u.mqNetti) })}</Badge>)}
      </div>}
    </section>
    <RiscontriCartografici cartografia={cartografia} />
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("Verifiche e documenti da completare")}</h3>
        <Button variant="outline" size="sm" onClick={onFonti}>{t("Fonti e atti")}<ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" /></Button>
      </div>
      <ul className="divide-y">{quadro.verifiche.map(v => <li key={v.titolo} className="space-y-1 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <p className="text-sm font-medium">{v.titolo}</p>
          <Badge variant="outline" className={cn(v.stato === "Riscontro" ? "border-emerald-400/40 text-emerald-700 dark:text-emerald-300" : "border-amber-400/45 text-amber-800 dark:text-amber-200")}>
            {v.stato}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{v.dettaglio}</p>
        {v.fonte && <span className="text-xs"><FonteLink url={v.fonte.url}>{v.fonte.nome}</FonteLink></span>}
      </li>)}</ul>
    </section>
  </div>;
}
