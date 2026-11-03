/**
 * Il pannello a destra (sul telefono: in basso) con i dettagli di ciò che è
 * selezionato. Le misure si scrivono qui come sulla pianta.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Armchair, Check, Copy, Layers, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DESTINAZIONI, type Apertura, type AreaLavoro, type DatiVista, type Destinazione, type ElementoLavoro, type LocaleVista, type Muro, type Pianta, type QuotaLavoro, type TestoLavoro, type TipoApertura } from "./adattatore";
import { CATALOGO, nomeDelTipo } from "./catalogo";
import { destinazioneArredabile, dotazioneCei } from "./arreda";
import { btuConsigliati, DESTINAZIONI_CLIMA } from "../../../../shared/planimetrie/impianti.ts";
import { dist } from "./geometria";
import { altezzaCassonettoConsigliata, anteDi, cassonettoDi, eAvvolgibile, manovraDi, misureOscurante, misureSerramento, NOMI_CASSONETTO, NOMI_OSCURANTE, NOMI_SISTEMA, oscuranteAmmessi, oscuranteDi, sistemaDi, sistemiAmmessi } from "../../../../shared/planimetrie/serramenti.ts";
import { TIPI_SU_TUTTI_I_PIANI } from "@/lib/planimetrie/copiaSuiPiani";
import { contaStimate, modificabile, prossimaStimata, visibile, type Vista } from "./comandi";
import { lunghezzaMuro } from "./geometria";
import { leggiMisura, scriviCentimetri, scriviMetri, scriviMq } from "./misure";
import type { Selezione } from "./TelaPlanimetria";
import { NOMI_AREA, TIPI_AREA, TIPI_CASSONETTO, type SistemaApertura, type TipoArea, type TipoCassonetto, type TipoOscurante } from "../../../../shared/planimetrie/modello.ts";
import { areaPoligono } from "../../../../shared/planimetrie/geometria.ts";
import type { AltezzeSottotetto } from "../../../../shared/planimetrie/sottotetto.ts";
import { leggiQuota, scriviQuota, TIPO_PUNTO_QUOTA } from "../../../../shared/planimetrie/terreno.ts";

export interface AzioniPannello {
  nomeStanza: (id: string, nome: string) => void;
  destinazioneStanza: (id: string, d: Destinazione) => void;
  latoStanza: (id: string, lato: number, cm: number) => void;
  lunghezzaParete: (id: string, cm: number) => void;
  spessoreParete: (id: string, cm: number) => void;
  modificaApertura: (id: string, campi: Partial<Pick<Apertura, "tipo" | "larghezza" | "altezza" | "davanzale" | "ante" | "sistema" | "manovra" | "oscurante" | "cassonetto" | "altezzaCassonetto" | "motore">>) => void;
  giraApertura: (id: string) => void;
  elimina: (sel: Selezione) => void;
  conferma: (sel: Selezione) => void;
  confermaTutte: () => void;
  seleziona: (sel: Selezione | null) => void;
  modificaElemento: (id: string, campi: Partial<Pick<ElementoLavoro, "rotazione" | "larghezza" | "profondita" | "altezza" | "etichetta" | "tipo">>) => void;
  ruotaElemento: (id: string, gradi: number) => void;
  duplicaElemento: (id: string) => void;
  /** Ripete l'elemento (vano ascensore, scala, pilastro) sugli altri piani, nello stesso punto. */
  copiaSuiPiani: (id: string) => void;
  modificaQuota: (id: string, campi: Partial<Pick<QuotaLavoro, "scostamento">>) => void;
  modificaTesto: (id: string, campi: Partial<Pick<TestoLavoro, "testo" | "rotazione">>) => void;
  /** Arredi tipici della destinazione, appoggiati alle pareti. */
  arreda: (localeId: string, destinazione: Destinazione) => void;
  /** Appartamento della stanza (condomini, bifamiliari); vuoto per toglierlo. */
  unitaStanza: (localeId: string, unita: string) => void;
  /** Pilastri a maglia regolare dentro la stanza (capannoni). */
  magliaPilastri: (localeId: string, passoCm: number) => void;
  /** Prese, punti luce e interruttori minimi (CEI 64-8 livello 1). */
  impiantoElettrico: (localeId: string, destinazione: Destinazione) => void;
  /** Split con la taglia consigliata. */
  clima: (localeId: string, destinazione: Destinazione) => void;
  /** Termosifoni sotto le finestre. */
  riscaldamento: (localeId: string) => void;
  /** Curva la parete con la freccia data (cm). */
  curvaParete: (id: string, frecciaCm: number) => void;
  modificaArea: (id: string, campi: Partial<Pick<AreaLavoro, "tipo" | "nome" | "recinzione" | "quota">>) => void;
}

interface Props {
  pianta: Pianta;
  /** Stanze, mq e problemi della vista, letti dal documento. */
  dati: DatiVista;
  latiModificabili: ReadonlySet<string>;
  vista: Vista;
  selezione: Selezione | null;
  azioni: AzioniPannello;
  /** Sul telefono: niente elenco e niente spessori, solo nome e misure. */
  essenziale?: boolean;
  /** Mette il cursore nel nome appena nasce una stanza. */
  focusNome?: boolean;
  /** Mansarda: altezze sotto le falde, per stanza. */
  sottotetto?: ReadonlyMap<string, AltezzeSottotetto>;
}

export function PannelloDettagli({ pianta, dati, sottotetto, latiModificabili, vista, selezione, azioni, essenziale, focusNome }: Props) {
  if (selezione?.tipo === "locale") {
    const l = dati.locali.find((x) => x.id === selezione.id);
    if (l) {
      return (
        <DettaglioStanza
          key={l.id}
          pianta={pianta}
          vista={vista}
          locale={l}
          misurabile={latiModificabili.has(l.id)}
          azioni={azioni}
          essenziale={essenziale}
          focusNome={focusNome}
          sottotetto={sottotetto?.get(l.id)}
        />
      );
    }
  }
  if (selezione?.tipo === "muro") {
    const m = pianta.muri.find((x) => x.id === selezione.id);
    if (m) return <DettaglioParete vista={vista} muro={m} azioni={azioni} essenziale={essenziale} />;
  }
  if (selezione?.tipo === "apertura") {
    const a = pianta.aperture.find((x) => x.id === selezione.id);
    if (a) return <DettaglioApertura vista={vista} apertura={a} azioni={azioni} essenziale={essenziale} />;
  }
  if (selezione?.tipo === "elemento") {
    const e = (pianta.elementi ?? []).find((x) => x.id === selezione.id);
    if (e) return <DettaglioElemento key={e.id} vista={vista} elemento={e} azioni={azioni} essenziale={essenziale} />;
  }
  if (selezione?.tipo === "quota") {
    const q = (pianta.quote ?? []).find((x) => x.id === selezione.id);
    if (q) return <DettaglioQuota quota={q} azioni={azioni} />;
  }
  if (selezione?.tipo === "testo") {
    const t = (pianta.testi ?? []).find((x) => x.id === selezione.id);
    if (t) return <DettaglioTesto key={t.id} testo={t} azioni={azioni} />;
  }
  if (selezione?.tipo === "area") {
    const a = (pianta.aree ?? []).find((x) => x.id === selezione.id);
    if (a) return <DettaglioArea key={a.id} vista={vista} area={a} azioni={azioni} />;
  }
  return <ElencoStanze pianta={pianta} dati={dati} vista={vista} azioni={azioni} />;
}

function DettaglioArea({ vista, area: a, azioni }: { vista: Vista; area: AreaLavoro; azioni: AzioniPannello }) {
  const mq = areaPoligono(a.contorno) / 10_000;
  const perimetro = a.contorno.reduce((t, p, i) => t + dist(p, a.contorno[(i + 1) % a.contorno.length]), 0) / 100;
  const libera = modificabile(a.stato, vista);
  const [nome, setNome] = useState(a.nome ?? "");
  return (
    <div className="space-y-3 p-3">
      <p className="text-sm font-semibold">{a.nome || NOMI_AREA[a.tipo]}</p>
      <div className="space-y-1">
        <Label className="text-xs">Tipo</Label>
        <Select value={a.tipo} onValueChange={(v) => azioni.modificaArea(a.id, { tipo: v as TipoArea })} disabled={!libera}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{TIPI_AREA.map((t) => <SelectItem key={t} value={t}>{NOMI_AREA[t]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="nome-area">Nome</Label>
        <Input id="nome-area" value={nome} placeholder={NOMI_AREA[a.tipo]} onChange={(e) => setNome(e.target.value)} onBlur={() => nome !== (a.nome ?? "") && azioni.modificaArea(a.id, { nome: nome.trim() || undefined })} />
      </div>
      {a.tipo !== "lotto" && (
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="quota-area">Quota rispetto al piano terra (m)</Label>
          <Input id="quota-area" key={`q-${a.quota ?? 0}`} defaultValue={String((a.quota ?? 0) / 100).replace(".", ",")} inputMode="decimal"
            onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v) && Math.round(v * 100) !== (a.quota ?? 0)) azioni.modificaArea(a.id, { quota: Math.round(v * 100) || undefined }); }} />
          <p className="text-[11px] text-muted-foreground">Per terrazzamenti, rialzi e bordi piscina (−0,50 = mezzo metro sotto).</p>
        </div>
      )}
      <p className="text-sm">{scriviMq(mq)}{a.tipo === "lotto" ? ` · perimetro ${perimetro.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m` : ""}</p>
      {a.tipo === "lotto" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={a.recinzione !== false} onChange={(e) => azioni.modificaArea(a.id, { recinzione: e.target.checked })} />
          Recintato (conta i metri di recinzione, si vede nel 3D)
        </label>
      )}
      <Button size="sm" variant="outline" className="w-full justify-start text-destructive" onClick={() => azioni.elimina({ tipo: "area", id: a.id })}>
        <Trash2 /> {vista === "progetto" && a.stato !== "nuovo" ? (a.stato === "da_demolire" ? "Rimetti" : "Togli nel progetto") : "Elimina"}
      </Button>
    </div>
  );
}

function DettaglioElemento({ vista, elemento: e, azioni, essenziale }: { vista: Vista; elemento: ElementoLavoro; azioni: AzioniPannello; essenziale?: boolean }) {
  const ok = modificabile(e.stato, vista);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">Arredo</p>
        <p className="font-semibold">{e.etichetta || nomeDelTipo(e.tipo)}</p>
        {vista === "progetto" && e.stato === "nuovo" && <p className="text-xs text-red-700">Nuovo, nel progetto</p>}
        {vista === "progetto" && e.stato === "da_demolire" && <p className="text-xs text-amber-700">Da togliere</p>}
        {!ok && e.stato === "esistente" && <p className="text-xs text-muted-foreground">Nel progetto gli arredi di oggi non si spostano: toglilo e mettine uno nuovo.</p>}
      </div>
      <div className="space-y-1">
        <Label>Cos'è</Label>
        <Select value={CATALOGO.some((v) => v.tipo === e.tipo) ? e.tipo : "altro"} disabled={!ok} onValueChange={(t) => {
          const v = CATALOGO.find((x) => x.tipo === t);
          if (v) azioni.modificaElemento(e.id, { tipo: v.tipo, larghezza: v.larghezza, profondita: v.profondita, altezza: v.altezza });
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATALOGO.map((v) => <SelectItem key={v.tipo} value={v.tipo}>{v.nome}</SelectItem>)}
            {!CATALOGO.some((v) => v.tipo === e.tipo) && <SelectItem value="altro">{nomeDelTipo(e.tipo)}</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CampoMisura etichetta="Larghezza (cm)" valore={e.larghezza} centimetri disabled={!ok} onConferma={(cm) => azioni.modificaElemento(e.id, { larghezza: cm })} />
        <CampoMisura etichetta="Profondità (cm)" valore={e.profondita} centimetri disabled={!ok} onConferma={(cm) => azioni.modificaElemento(e.id, { profondita: cm })} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Rotazione: {e.rotazione}°</span>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" disabled={!ok} onClick={() => azioni.ruotaElemento(e.id, -90)} aria-label="Ruota a sinistra di 90°"><RotateCcw /> 90°</Button>
          <Button size="sm" variant="outline" disabled={!ok} onClick={() => azioni.ruotaElemento(e.id, 90)} aria-label="Ruota a destra di 90°"><RotateCw /> 90°</Button>
          <Button size="sm" variant="outline" disabled={!ok} onClick={() => azioni.ruotaElemento(e.id, -15)} aria-label="Ruota a sinistra di 15°">−15°</Button>
          <Button size="sm" variant="outline" disabled={!ok} onClick={() => azioni.ruotaElemento(e.id, 15)} aria-label="Ruota a destra di 15°">+15°</Button>
        </div>
      </div>
      {e.tipo === TIPO_PUNTO_QUOTA && (
        <div className="space-y-1">
          <Label htmlFor={`quota-${e.id}`}>Quota del terreno (m)</Label>
          <Input id={`quota-${e.id}`} key={`${e.id}-${e.etichetta ?? ""}`} defaultValue={leggiQuota(e.etichetta) !== null ? String(leggiQuota(e.etichetta)! / 100).replace(".", ",") : ""} placeholder="es. 1,20 oppure -0,50" inputMode="decimal" disabled={!ok}
            onBlur={(ev) => { const q = leggiQuota(ev.target.value); const nuova = q === null ? undefined : scriviQuota(q); if (nuova !== e.etichetta) azioni.modificaElemento(e.id, { etichetta: nuova }); }}
            onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }} />
          <p className="text-[11px] text-muted-foreground">Rispetto al pavimento del piano terra (0). Con almeno due punti il terreno nel 3D è in pendenza e la pianta ha le curve di livello ogni 50 cm.</p>
        </div>
      )}
      {!essenziale && e.tipo !== TIPO_PUNTO_QUOTA && (
        <div className="space-y-1">
          <Label htmlFor={`etichetta-${e.id}`}>Nome sulla pianta (facoltativo)</Label>
          <Input id={`etichetta-${e.id}`} defaultValue={e.etichetta ?? ""} placeholder={nomeDelTipo(e.tipo)} disabled={!ok}
            onBlur={(ev) => { const v = ev.target.value.trim(); if (v !== (e.etichetta ?? "")) azioni.modificaElemento(e.id, { etichetta: v || undefined }); }}
            onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => azioni.duplicaElemento(e.id)}><Copy /> Duplica</Button>
        {TIPI_SU_TUTTI_I_PIANI.includes(e.tipo) && ok && (
          <Button size="sm" variant="outline" onClick={() => azioni.copiaSuiPiani(e.id)}><Layers /> Su tutti i piani</Button>
        )}
        {!essenziale && (
          vista === "progetto" && e.stato === "da_demolire"
            ? <Button size="sm" variant="outline" onClick={() => azioni.elimina({ tipo: "elemento", id: e.id })}><Undo2 /> Rimetti</Button>
            : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => azioni.elimina({ tipo: "elemento", id: e.id })}>
                <Trash2 /> {vista === "progetto" && e.stato === "esistente" ? "Togli nel progetto" : "Elimina"}
              </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Trascinalo per spostarlo · R ruota di 90° · Ctrl+D duplica · Canc elimina</p>
    </div>
  );
}

function DettaglioQuota({ quota: q, azioni }: { quota: QuotaLavoro; azioni: AzioniPannello }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">Quota</p>
        <p className="text-lg font-semibold tabular-nums">{scriviMetri(dist(q.p1, q.p2))} m</p>
        <p className="text-xs text-muted-foreground">Misura da sola la distanza fra i due punti.</p>
      </div>
      <CampoMisura etichetta="Distanza dalla linea (cm)" valore={Math.abs(q.scostamento)} centimetri
        onConferma={(cm) => azioni.modificaQuota(q.id, { scostamento: q.scostamento < 0 ? -cm : cm })} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => azioni.modificaQuota(q.id, { scostamento: -q.scostamento })}>Dall'altra parte</Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => azioni.elimina({ tipo: "quota", id: q.id })}><Trash2 /> Elimina</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Trascina la quota per allontanarla o avvicinarla.</p>
    </div>
  );
}

function DettaglioTesto({ testo: t, azioni }: { testo: TestoLavoro; azioni: AzioniPannello }) {
  const [valore, setValore] = useState(t.testo);
  const salva = () => { const v = valore.trim(); if (v && v !== t.testo) azioni.modificaTesto(t.id, { testo: v }); };
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`testo-${t.id}`}>Testo</Label>
        <Input id={`testo-${t.id}`} autoFocus value={valore} onChange={(e) => setValore(e.target.value)} onBlur={salva}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => azioni.modificaTesto(t.id, { rotazione: ((t.rotazione - 90) % 360 + 360) % 360 })}><RotateCcw /> 90°</Button>
        <Button size="sm" variant="outline" onClick={() => azioni.modificaTesto(t.id, { rotazione: (t.rotazione + 90) % 360 })}><RotateCw /> 90°</Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => azioni.elimina({ tipo: "testo", id: t.id })}><Trash2 /> Elimina</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Trascina il testo per spostarlo.</p>
    </div>
  );
}

function ElencoStanze({ pianta, dati, vista, azioni }: { pianta: Pianta; dati: DatiVista; vista: Vista; azioni: AzioniPannello }) {
  const locali = dati.locali;
  const quantita = locali.map((l) => ({ l, q: l }));
  const totale = quantita.reduce((s, x) => s + x.q.mq, 0);
  const stimate = contaStimate(pianta);
  const porte = pianta.aperture.filter((a) => a.tipo !== "finestra" && a.tipo !== "varco" && visibile(a.stato, vista) && a.stato !== "da_demolire").length;
  const finestre = pianta.aperture.filter((a) => a.tipo === "finestra" && visibile(a.stato, vista) && a.stato !== "da_demolire").length;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Stanze</h3>
        {locali.length === 0 && <p className="mt-1 text-sm text-muted-foreground">Ancora nessuna stanza.</p>}
        <ul className="mt-2 divide-y rounded-md border">
          {quantita.map(({ l, q }) => (
            <li key={l.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => azioni.seleziona({ tipo: "locale", id: l.id })}
              >
                <span className="truncate">
                  {l.nome}
                  <span className="ml-1 text-xs text-muted-foreground">{etichettaDestinazione(l.destinazione, l.nome)}</span>
                </span>
                <span className={cn("shrink-0 whitespace-nowrap pl-2 tabular-nums", q.stimata && "italic text-primary")}>
                  {q.stimata ? "≈ " : ""}
                  {scriviMq(q.mq)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {locali.length > 0 && (
          <div className="mt-2 flex justify-between px-3 text-sm font-semibold">
            <span>Totale</span>
            <span className="tabular-nums">{scriviMq(totale)}</span>
          </div>
        )}
      </div>
      {(porte > 0 || finestre > 0) && (
        <p className="text-sm text-muted-foreground">
          {porte} {porte === 1 ? "porta" : "porte"} · {finestre} {finestre === 1 ? "finestra" : "finestre"}
        </p>
      )}
      {stimate > 0 && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="text-foreground">
            <strong>{stimate}</strong> {stimate === 1 ? "misura è stimata" : "misure sono stimate"}: si vedono a righe viola e con «≈».
            Controllale sul posto, poi confermale.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => azioni.seleziona(prossimaStimata(pianta))}>
              Controllale una alla volta
            </Button>
            <Button size="sm" variant="outline" onClick={azioni.confermaTutte}>
              <Check /> Le ho controllate tutte
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-foreground/80">Una alla volta: si parte dalla stanza più grande; correggi la misura se serve e premi «Misura controllata», si passa da sola alla prossima.</p>
        </div>
      )}
      <DaSistemare pianta={pianta} dati={dati} azioni={azioni} />
    </div>
  );
}

/** I problemi del controllo della fase 1, in parole semplici; un clic porta all'oggetto. */
function DaSistemare({ pianta, dati, azioni }: { pianta: Pianta; dati: DatiVista; azioni: AzioniPannello }) {
  const problemi = [...dati.problemi].sort((a, b) => (a.gravita === b.gravita ? 0 : a.gravita === "errore" ? -1 : 1));
  if (!problemi.length) return null;
  const tipoDi = (id?: string): Selezione["tipo"] | null =>
    !id
      ? null
      : pianta.muri.some((m) => m.id === id)
        ? "muro"
        : pianta.aperture.some((a) => a.id === id)
          ? "apertura"
          : dati.locali.some((l) => l.id === id)
            ? "locale"
            : null;
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-amber-600" /> Da controllare
      </h3>
      <ul className="mt-2 space-y-1">
        {problemi.slice(0, 8).map((p, i) => {
          const tipo = tipoDi(p.oggettoId);
          return (
            <li key={`${p.codice}-${p.oggettoId ?? i}`}>
              <button
                type="button"
                disabled={!tipo}
                onClick={() => tipo && p.oggettoId && azioni.seleziona({ tipo, id: p.oggettoId })}
                className={cn(
                  "w-full rounded-md border px-2.5 py-1.5 text-left text-xs",
                  p.gravita === "errore" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900",
                  tipo && "hover:brightness-95",
                )}
              >
                {p.messaggio}
              </button>
            </li>
          );
        })}
      </ul>
      {problemi.length > 8 && <p className="mt-1 text-xs text-muted-foreground">e altri {problemi.length - 8}.</p>}
    </div>
  );
}

function DettaglioStanza({
  pianta,
  vista,
  locale,
  misurabile,
  azioni,
  essenziale,
  focusNome,
  sottotetto,
}: {
  sottotetto?: AltezzeSottotetto;
  pianta: Pianta;
  vista: Vista;
  locale: LocaleVista;
  misurabile: boolean;
  azioni: AzioniPannello;
  essenziale?: boolean;
  focusNome?: boolean;
}) {
  const q = locale;
  // la stanza disegnata nell'editor, se c'è (nel progetto una stanza può nascere dalle pareti)
  const diLavoro = pianta.locali.find((l) => l.id === locale.id);
  const [nome, setNome] = useState(locale.nome);
  useEffect(() => setNome(locale.nome), [locale.id, locale.nome]);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="pl-nome">Nome della stanza</Label>
        <Input
          id="pl-nome"
          value={nome}
          autoFocus={focusNome}
          onFocus={(e) => focusNome && e.currentTarget.select()}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => nome.trim() && nome !== locale.nome && azioni.nomeStanza(locale.id, nome.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </div>
      <div className="space-y-1">
        <Label>Che stanza è</Label>
        <Select value={locale.destinazione} onValueChange={(v) => azioni.destinazioneStanza(locale.id, v as Destinazione)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DESTINAZIONI.map((d) => (
              <SelectItem key={d.valore} value={d.valore}>
                {d.etichetta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!essenziale && diLavoro && (
        <div className="space-y-1">
          <Label htmlFor="pl-unita">Appartamento (condominio, bifamiliare)</Label>
          <Input id="pl-unita" key={`${locale.id}-unita`} defaultValue={diLavoro.unita ?? ""} placeholder="Es. A, Int. 3, Parti comuni" maxLength={40}
            onBlur={(e) => e.target.value.trim() !== (diLavoro.unita ?? "") && azioni.unitaStanza(locale.id, e.target.value.trim())}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          <p className="text-[11px] text-muted-foreground">Le stanze con la stessa sigla fanno un appartamento: nel computo trovi superfici e pareti per appartamento.</p>
        </div>
      )}
      {sottotetto && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-medium">Sotto le falde</p>
          <p className="mt-0.5 tabular-nums">Altezza minima {scriviMetri(sottotetto.minima)} m · massima {scriviMetri(sottotetto.massima)} m · <strong>media {scriviMetri(sottotetto.media)} m</strong></p>
          <p className="tabular-nums">Superficie utile (sopra 1,50 m) <strong>{scriviMq(sottotetto.superficieUtile)}</strong> su {scriviMq(sottotetto.superficie)} · volume {sottotetto.volume.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m³</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Pavimento</div>
          <div className={`text-base font-semibold ${q.stimata ? "italic text-primary" : ""}`}>
            {q.stimata ? "≈ " : ""}
            {scriviMq(q.mq)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Perimetro</div>
          <div className={`text-base font-semibold ${q.stimata ? "italic text-primary" : ""}`}>
            {q.stimata ? "≈ " : ""}
            {scriviMetri(q.perimetro * 100)} m
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Misure interne (da muro a muro)</Label>
        {!misurabile && (
          <p className="text-xs text-muted-foreground">Nel progetto le stanze di oggi non si allargano: demolisci la parete e disegnane una nuova.</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {q.lati.map((l, i) => (
            <CampoMisura
              key={`${locale.id}-${i}`}
              etichetta={`Lato ${i + 1}`}
              valore={l}
              disabled={!misurabile}
              stimata={q.stimata}
              onConferma={(cm) => azioni.latoStanza(locale.id, i, cm)}
            />
          ))}
        </div>
      </div>
      {!essenziale && diLavoro && destinazioneArredabile(locale.destinazione) && (
        <div className="space-y-1 rounded-md border border-dashed p-2">
          <Button size="sm" variant="secondary" className="w-full" onClick={() => azioni.arreda(locale.id, locale.destinazione)}>
            <Armchair /> Arreda con un clic
          </Button>
          <p className="text-[11px] text-muted-foreground">Mette gli arredi tipici di {DESTINAZIONI.find((d) => d.valore === locale.destinazione)?.etichetta.toLowerCase() ?? "questa stanza"} lungo le pareti, lontano da porte e finestre. Poi li sposti come vuoi; il 3D e il render AI li usano dove stanno.</p>
        </div>
      )}
      {!essenziale && diLavoro && (() => {
        const cei = dotazioneCei(locale.destinazione, q.mq);
        const clima = btuConsigliati(diLavoro);
        return (
          <div className="space-y-2 rounded-md border border-dashed p-2">
            <p className="text-xs font-medium">Impianti</p>
            <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => azioni.impiantoElettrico(locale.id, locale.destinazione)}>
              Impianto elettrico minimo
            </Button>
            <p className="text-[11px] text-muted-foreground">Norma CEI 64-8, livello 1: {cei.prese} {cei.prese === 1 ? "presa" : "prese"}, {cei.luci} {cei.luci === 1 ? "punto luce" : "punti luce"} con interruttore accanto alla porta. Mette solo quello che manca.</p>
            {!["balcone", "terrazzo", "garage", "cantina", "ripostiglio", "giardino"].includes(locale.destinazione) && (
              <>
                <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => azioni.riscaldamento(locale.id)}>
                  Riscaldamento: termosifoni sotto le finestre
                </Button>
                <p className="text-[11px] text-muted-foreground">Circa {Math.round((q.mq * ((diLavoro.altezza ?? 270) / 100) * 40) / 50) * 50} W per questa stanza (40 W al m³, di massima). Metti la caldaia o la pompa di calore (Arredi → Energia) per avere i tubi nel computo.</p>
              </>
            )}
            {DESTINAZIONI_CLIMA.has(locale.destinazione) && (
              <>
                <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => azioni.clima(locale.id, locale.destinazione)}>
                  Clima: {clima.split > 1 ? `${clima.split} split da ` : "split da "}{clima.taglia.toLocaleString("it-IT")} BTU
                </Button>
                <p className="text-[11px] text-muted-foreground">Circa {clima.btu.toLocaleString("it-IT")} BTU/h per {q.mq.toLocaleString("it-IT", { maximumFractionDigits: 1 })} mq: indicazione di massima, esposizione e vetrate contano. Metti anche l'unità esterna (catalogo Impianti) per avere rame e condensa nel computo.</p>
              </>
            )}
          </div>
        );
      })()}
      {!essenziale && diLavoro && q.mq >= 60 && <MagliaPilastri onMetti={(passo) => azioni.magliaPilastri(locale.id, passo)} />}
      <div className="flex flex-wrap gap-2 pt-1">
        {q.stimata && (
          <Button size="sm" variant="outline" onClick={() => azioni.conferma({ tipo: "locale", id: locale.id })}>
            <Check /> Misure controllate
          </Button>
        )}
        {!essenziale && diLavoro && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => azioni.elimina({ tipo: "locale", id: locale.id })}>
            <Trash2 /> {vista === "progetto" && diLavoro.stato !== "nuovo" ? "Demolisci la stanza" : "Elimina la stanza"}
          </Button>
        )}
      </div>
    </div>
  );
}

function MagliaPilastri({ onMetti }: { onMetti: (passoCm: number) => void }) {
  const [passo, setPasso] = useState("6,00");
  const cm = leggiMisura(passo);
  return (
    <div className="space-y-1 rounded-md border border-dashed p-2">
      <Label htmlFor="pl-passo" className="text-xs">Pilastri a maglia (capannone, autorimessa)</Label>
      <div className="flex gap-2">
        <Input id="pl-passo" className="h-8 w-24" value={passo} onChange={(e) => setPasso(e.target.value)} aria-label="Passo dei pilastri in metri" />
        <Button size="sm" variant="secondary" disabled={!cm || cm < 200} onClick={() => cm && onMetti(cm)}>Metti i pilastri</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Passo in metri, uguale nei due versi; la maglia parte dal centro. Si contano nel computo come «Pilastri».</p>
    </div>
  );
}

function DettaglioParete({ vista, muro, azioni, essenziale }: { vista: Vista; muro: Muro; azioni: AzioniPannello; essenziale?: boolean }) {
  const misurabile = modificabile(muro.stato, vista);
  const stimata = muro.origine === "stimata";
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">
        Parete{" "}
        {vista === "progetto" && muro.stato === "da_demolire" && <span className="ml-1 rounded bg-yellow-300 px-1.5 text-xs">da demolire</span>}
        {muro.stato === "nuovo" && <span className="ml-1 rounded bg-red-600 px-1.5 text-xs text-white">nuova</span>}
      </h3>
      <CampoMisura
        etichetta="Lunghezza"
        valore={lunghezzaMuro(muro)}
        disabled={!misurabile}
        stimata={stimata}
        onConferma={(cm) => azioni.lunghezzaParete(muro.id, cm)}
      />
      {!misurabile && vista === "progetto" && (
        <p className="text-xs text-muted-foreground">Le pareti di oggi nel progetto non si spostano: puoi demolirle e disegnarne di nuove.</p>
      )}
      {!essenziale && (
        <div className="space-y-1">
          <Label>Spessore</Label>
          <Select value={String(muro.spessore)} onValueChange={(v) => azioni.spessoreParete(muro.id, Number(v))} disabled={!misurabile}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[8, 10, 12, 15, 20, 25, 30, 40, 50].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s} cm{s === 10 ? " · tramezzo" : s === 30 ? " · muro portante" : ""}
                </SelectItem>
              ))}
              {![8, 10, 12, 15, 20, 25, 30, 40, 50].includes(muro.spessore) && (
                <SelectItem value={String(muro.spessore)}>{muro.spessore} cm</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {stimata && (
          <Button size="sm" variant="outline" onClick={() => azioni.conferma({ tipo: "muro", id: muro.id })}>
            <Check /> Misura controllata
          </Button>
        )}
        {!essenziale && <BottoneElimina vista={vista} stato={muro.stato} cosa="la parete" onClick={() => azioni.elimina({ tipo: "muro", id: muro.id })} />}
      </div>
      {!essenziale && misurabile && <CurvaParete onCurva={(f) => azioni.curvaParete(muro.id, f)} />}
    </div>
  );
}

function CurvaParete({ onCurva }: { onCurva: (frecciaCm: number) => void }) {
  const [freccia, setFreccia] = useState("0,50");
  const [verso, setVerso] = useState<1 | -1>(1);
  const cm = leggiMisura(freccia);
  return (
    <div className="space-y-1 rounded-md border border-dashed p-2">
      <Label htmlFor="pl-freccia" className="text-xs">Parete curva (bovindo, balcone tondo)</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="pl-freccia" className="h-8 w-20" value={freccia} onChange={(e) => setFreccia(e.target.value)} aria-label="Freccia della curva in metri" />
        <Button size="sm" variant="outline" onClick={() => setVerso((v) => (v === 1 ? -1 : 1))}>{verso === 1 ? "Verso un lato" : "Verso l'altro"}</Button>
        <Button size="sm" variant="secondary" disabled={!cm} onClick={() => cm && onCurva(cm * verso)}>Curva</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">La freccia è quanto la curva si allontana dal centro della parete. Diventa un arco di tratti dritti; la stanza segue la curva. Ctrl+Z per tornare indietro.</p>
    </div>
  );
}

const NOMI_APERTURA: Record<TipoApertura, string> = { porta: "Porta", finestra: "Finestra", portafinestra: "Portafinestra", varco: "Passaggio senza porta" };

function DettaglioApertura({ vista, apertura: a, azioni, essenziale }: { vista: Vista; apertura: Apertura; azioni: AzioniPannello; essenziale?: boolean }) {
  const misurabile = modificabile(a.stato, vista);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Cos'è</Label>
        <Select value={a.tipo} onValueChange={(v) => azioni.modificaApertura(a.id, { tipo: v as TipoApertura })} disabled={!misurabile}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(NOMI_APERTURA) as TipoApertura[]).map((t) => (
              <SelectItem key={t} value={t}>
                {NOMI_APERTURA[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {a.tipo !== "varco" && (
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <div className="space-y-1">
            <Label>Come si apre</Label>
            <Select
              value={sistemaDi(a)}
              onValueChange={(v) => {
                const s = v as SistemaApertura;
                azioni.modificaApertura(a.id, { sistema: s, manovra: manovraDi(s), ...(s === "scorrevole_scomparsa" ? { ante: 1 } : {}) });
              }}
              disabled={!misurabile}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sistemiAmmessi(a.tipo).map((s) => <SelectItem key={s} value={s}>{NOMI_SISTEMA[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {sistemaDi(a) !== "scorrevole_scomparsa" && (
            <div className="space-y-1">
              <Label>Ante</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <Button key={n} type="button" size="sm" variant={anteDi(a) === n ? "default" : "outline"} className="h-9 w-8 px-0" disabled={!misurabile} onClick={() => azioni.modificaApertura(a.id, { ante: n })}>{n}</Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {a.tipo !== "varco" && !essenziale && <MisureControtelaio a={a} />}
      {oscuranteAmmessi(a.tipo).length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Oscurante</Label>
              <Select
                value={oscuranteDi(a) ?? "nessuno"}
                onValueChange={(v) => azioni.modificaApertura(a.id, { oscurante: v === "nessuno" ? undefined : (v as TipoOscurante) })}
                disabled={!misurabile}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">Nessuno</SelectItem>
                  {oscuranteAmmessi(a.tipo).map((o) => <SelectItem key={o} value={o}>{NOMI_OSCURANTE[o]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {eAvvolgibile(oscuranteDi(a)) && (
              <div className="space-y-1">
                <Label>Cassonetto</Label>
                <Select
                  value={cassonettoDi(a) ?? "monoblocco"}
                  onValueChange={(v) => azioni.modificaApertura(a.id, { cassonetto: v as TipoCassonetto })}
                  disabled={!misurabile}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPI_CASSONETTO.map((c) => <SelectItem key={c} value={c}>{NOMI_CASSONETTO[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {eAvvolgibile(oscuranteDi(a)) && (
            <div className="grid grid-cols-2 items-end gap-2">
              <CampoMisura
                etichetta="Altezza cassonetto (cm)"
                valore={a.altezzaCassonetto ?? altezzaCassonettoConsigliata(a.altezza, oscuranteDi(a) ?? "tapparella")}
                centimetri
                disabled={!misurabile}
                onConferma={(cm) => azioni.modificaApertura(a.id, { altezzaCassonetto: cm })}
              />
              <label className="flex h-9 items-center gap-2 text-sm">
                <Switch checked={!!a.motore} onCheckedChange={(v) => azioni.modificaApertura(a.id, { motore: v })} disabled={!misurabile} />
                Motore
              </label>
            </div>
          )}
          {oscuranteDi(a) && !essenziale && <MisureOscuranteRiga a={a} />}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <CampoMisura
          etichetta="Larghezza (cm)"
          valore={a.larghezza}
          centimetri
          disabled={!misurabile}
          stimata={a.origine === "stimata"}
          onConferma={(cm) => azioni.modificaApertura(a.id, { larghezza: cm })}
        />
        <CampoMisura
          etichetta="Altezza (cm)"
          valore={a.altezza}
          centimetri
          disabled={!misurabile}
          stimata={a.origine === "stimata"}
          onConferma={(cm) => azioni.modificaApertura(a.id, { altezza: cm })}
        />
        {a.tipo === "finestra" && !essenziale && (
          <CampoMisura
            etichetta="Da terra (cm)"
            valore={a.davanzale}
            centimetri
            disabled={!misurabile}
            onConferma={(cm) => azioni.modificaApertura(a.id, { davanzale: cm })}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {a.tipo !== "finestra" && (
          <Button size="sm" variant="outline" onClick={() => azioni.giraApertura(a.id)} disabled={!misurabile}>
            <RotateCw /> Gira il verso
          </Button>
        )}
        {a.origine === "stimata" && (
          <Button size="sm" variant="outline" onClick={() => azioni.conferma({ tipo: "apertura", id: a.id })}>
            <Check /> Misura controllata
          </Button>
        )}
        {!essenziale && (
          <BottoneElimina vista={vista} stato={a.stato} cosa={a.tipo === "finestra" ? "la finestra" : "la porta"} onClick={() => azioni.elimina({ tipo: "apertura", id: a.id })} />
        )}
      </div>
    </div>
  );
}

/** Foro, controtelaio e anta, di massima: servono per ordinare il controtelaio prima della posa. */
function MisureControtelaio({ a }: { a: Apertura }) {
  const m = misureSerramento(a);
  const cm = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 1 });
  return (
    <div className="space-y-0.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      <p><span className="font-medium text-foreground">Controtelaio{m.controtelaioSpeciale ? " per scorrevole a scomparsa" : ""}:</span> {cm(m.controtelaio.larghezza)} × {cm(m.controtelaio.altezza)} cm</p>
      <p>Serramento: {cm(m.telaio.larghezza)} × {cm(m.telaio.altezza)} cm · anta {cm(m.anta)} cm{anteDi(a) > 1 ? ` (${anteDi(a)} ante)` : ""}</p>
      {m.tascaScomparsa > 0 && <p>Serve un tratto di muro libero di almeno {cm(m.tascaScomparsa)} cm a fianco, senza porte né impianti.</p>}
    </div>
  );
}

function MisureOscuranteRiga({ a }: { a: Apertura }) {
  const o = misureOscurante(a);
  if (!o) return null;
  const cm = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 1 });
  return (
    <div className="space-y-0.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      {o.cassonetto && (
        <p>
          <span className="font-medium text-foreground">Cassonetto:</span> {cm(o.cassonetto.larghezza)} × {cm(o.cassonetto.altezza)} cm, profondo {cm(o.cassonetto.profondita)} cm
          {o.cassonetto.tipo === "monoblocco" ? ` · sta nel vano: il serramento resta alto ${cm(misureSerramento(a).telaio.altezza)} cm` : ` · serve muro libero sopra il vano: ${cm(o.spazioSopra)} cm`}
        </p>
      )}
      <p>
        {o.avvolgibile
          ? `Telo ${cm(o.telo.larghezza)} × ${cm(o.telo.altezza)} cm (${cm(o.superficieMq)} m²) · guide ${cm(o.guideMl * 2)} m${o.motore ? " · motorizzata" : ""}`
          : `${o.ante} ${o.ante === 1 ? "anta" : "ante"} da ${cm(a.larghezza / o.ante)} cm (${cm(o.superficieMq)} m²)`}
      </p>
    </div>
  );
}

function BottoneElimina({ vista, stato, cosa, onClick }: { vista: Vista; stato: Muro["stato"]; cosa: string; onClick: () => void }) {
  if (vista === "progetto" && stato === "da_demolire") {
    return (
      <Button size="sm" variant="outline" onClick={onClick}>
        <Undo2 /> Non demolire
      </Button>
    );
  }
  return (
    <Button size="sm" variant="ghost" className="text-destructive" onClick={onClick}>
      <Trash2 /> {vista === "progetto" && stato === "esistente" ? `Demolisci ${cosa}` : `Elimina ${cosa}`}
    </Button>
  );
}

/** Casella di una misura: si scrive «4,20» e si conferma con Invio o uscendo. */
export function CampoMisura({
  etichetta,
  valore,
  onConferma,
  disabled,
  stimata,
  centimetri,
}: {
  etichetta: string;
  valore: number;
  onConferma: (cm: number) => void;
  disabled?: boolean;
  stimata?: boolean;
  centimetri?: boolean;
}) {
  const scritto = centimetri ? scriviCentimetri(valore) : scriviMetri(valore);
  const [testo, setTesto] = useState(scritto);
  const [errore, setErrore] = useState(false);
  useEffect(() => {
    setTesto(scritto);
    setErrore(false);
  }, [scritto]);
  const applica = () => {
    if (testo === scritto) return;
    const cm = centimetri ? leggiMisura(`${testo.replace(",", ".")} cm`) ?? leggiMisura(testo) : leggiMisura(testo);
    if (!cm) {
      setErrore(true);
      return;
    }
    setErrore(false);
    onConferma(cm);
  };
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{etichetta}</span>
      <Input
        inputMode="decimal"
        value={testo}
        disabled={disabled}
        aria-label={etichetta}
        aria-invalid={errore}
        className={`h-9 tabular-nums ${stimata ? "border-dashed border-primary/40 italic text-primary" : ""} ${errore ? "border-destructive" : ""}`}
        onChange={(e) => setTesto(e.target.value)}
        onBlur={applica}
        onKeyDown={(e) => {
          if (e.key === "Enter") applica();
          if (e.key === "Escape") setTesto(scritto);
        }}
      />
      {errore && <span className="text-xs text-destructive">Scrivi una misura, es. {centimetri ? "90" : "4,20"}</span>}
    </div>
  );
}

function etichettaDestinazione(d: Destinazione, nome: string) {
  if (d === "altro") return "";
  const etichetta = DESTINAZIONI.find((x) => x.valore === d)?.etichetta ?? "";
  return nome.toLowerCase().startsWith(etichetta.split(" /")[0].toLowerCase()) ? "" : etichetta;
}
