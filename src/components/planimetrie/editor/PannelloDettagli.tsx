/**
 * Il pannello a destra (sul telefono: in basso) con i dettagli di ciò che è
 * selezionato. Le misure si scrivono qui come sulla pianta.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Check, RotateCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DESTINAZIONI, type Apertura, type DatiVista, type Destinazione, type LocaleVista, type Muro, type Pianta, type TipoApertura } from "./adattatore";
import { contaStimate, modificabile, visibile, type Vista } from "./comandi";
import { lunghezzaMuro } from "./geometria";
import { leggiMisura, scriviCentimetri, scriviMetri, scriviMq } from "./misure";
import type { Selezione } from "./TelaPlanimetria";

export interface AzioniPannello {
  nomeStanza: (id: string, nome: string) => void;
  destinazioneStanza: (id: string, d: Destinazione) => void;
  latoStanza: (id: string, lato: number, cm: number) => void;
  lunghezzaParete: (id: string, cm: number) => void;
  spessoreParete: (id: string, cm: number) => void;
  modificaApertura: (id: string, campi: Partial<Pick<Apertura, "tipo" | "larghezza" | "altezza" | "davanzale">>) => void;
  giraApertura: (id: string) => void;
  elimina: (sel: Selezione) => void;
  conferma: (sel: Selezione) => void;
  confermaTutte: () => void;
  seleziona: (sel: Selezione | null) => void;
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
}

export function PannelloDettagli({ pianta, dati, latiModificabili, vista, selezione, azioni, essenziale, focusNome }: Props) {
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
  return <ElencoStanze pianta={pianta} dati={dati} vista={vista} azioni={azioni} />;
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
                <span className={cn("shrink-0 whitespace-nowrap pl-2 tabular-nums", q.stimata && "italic text-violet-700")}>
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
        <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm">
          <p className="text-violet-900">
            <strong>{stimate}</strong> {stimate === 1 ? "misura è stimata" : "misure sono stimate"}: si vedono a righe viola e con «≈».
            Controllale sul posto, poi confermale.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={azioni.confermaTutte}>
            <Check /> Le ho controllate tutte
          </Button>
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
}: {
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
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Pavimento</div>
          <div className={`text-base font-semibold ${q.stimata ? "italic text-violet-700" : ""}`}>
            {q.stimata ? "≈ " : ""}
            {scriviMq(q.mq)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Perimetro</div>
          <div className={`text-base font-semibold ${q.stimata ? "italic text-violet-700" : ""}`}>
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
        className={`h-9 tabular-nums ${stimata ? "border-dashed border-violet-400 italic text-violet-800" : ""} ${errore ? "border-destructive" : ""}`}
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
