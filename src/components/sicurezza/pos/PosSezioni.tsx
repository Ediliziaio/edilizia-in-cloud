/**
 * Le sezioni dell'editor del POS, nell'ordine del modello semplificato del
 * DI 9/9/2014 (Allegato I). Ogni sezione modifica la bozza con `modifica`,
 * che lavora su una copia: niente mutazioni dello stato di React.
 */
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Loader2, Paperclip, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, Campo, Riga, Sezione } from "./campi";
import {
  ALLEGATO_LABEL, GESTIONE_EMERGENZE_LABEL, RIFERIMENTI_SEZIONE, RSPP_LABEL, RUOLO_IMPRESA_LABEL, SVOLGIMENTO_LABEL,
  lavorazioneVuota, soggettoVuoto,
  type GestioneEmergenze, type Lavorazione, type PosContenuto, type RsppSvoltoDa, type RuoloImpresa, type Svolgimento,
  type TipoAllegato,
} from "../../../../supabase/functions/_shared/posModello";
import type { ContestoPos } from "../../../../supabase/functions/_shared/posModello";
import { caricaAllegatoPos, linkAllegatoPos } from "@/hooks/usePos";

export type Modifica = (fn: (d: PosContenuto) => void) => void;

interface BaseProps {
  d: PosContenuto;
  modifica: Modifica;
  ro: boolean;
  mancanti: number;
}

const nuovoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `l${Date.now()}`);

// ── 1. Opera e committente ───────────────────────────────────────────────────

export function SezioneOpera({ d, modifica, ro, mancanti }: BaseProps) {
  const o = d.opera;
  return (
    <Sezione id="opera" numero={1} titolo="Opera, committente e cantiere" riferimento={`punto 3.2.1 e ${RIFERIMENTI_SEZIONE.opera}`} mancanti={mancanti}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="comm-nome" label="Committente: cognome e nome o ragione sociale" value={o.committente.nominativo} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.committente.nominativo = v; })} />
        <Campo id="comm-cf" label="Committente: codice fiscale" value={o.committente.codice_fiscale} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.committente.codice_fiscale = v; })} />
        <Campo id="comm-ind" label="Committente: indirizzo" value={o.committente.indirizzo} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((x) => { x.opera.committente.indirizzo = v; })} />
        <Campo id="comm-tel" label="Committente: telefono" type="tel" value={o.committente.telefono} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.committente.telefono = v; })} />
        <Campo id="comm-mail" label="Committente: e-mail" type="email" value={o.committente.email} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.committente.email = v; })} />
      </div>

      <div className="flex items-center gap-2">
        <Switch id="resp-lavori" checked={!!o.responsabile_lavori} disabled={ro}
          onCheckedChange={(on) => modifica((x) => { x.opera.responsabile_lavori = on ? soggettoVuoto() : null; })} />
        <Label htmlFor="resp-lavori" className="text-sm">Il committente ha nominato un responsabile dei lavori</Label>
      </div>
      {o.responsabile_lavori && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="rl-nome" label="Responsabile dei lavori: cognome e nome" value={o.responsabile_lavori.nominativo} readOnly={ro}
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.nominativo = v; })} />
          <Campo id="rl-cf" label="Codice fiscale" value={o.responsabile_lavori.codice_fiscale} readOnly={ro}
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.codice_fiscale = v; })} />
          <Campo id="rl-ind" label="Indirizzo" value={o.responsabile_lavori.indirizzo} readOnly={ro} className="sm:col-span-2"
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.indirizzo = v; })} />
          <Campo id="rl-tel" label="Telefono" type="tel" value={o.responsabile_lavori.telefono} readOnly={ro}
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.telefono = v; })} />
          <Campo id="rl-mail" label="E-mail" type="email" value={o.responsabile_lavori.email} readOnly={ro}
            onChange={(v) => modifica((x) => { if (x.opera.responsabile_lavori) x.opera.responsabile_lavori.email = v; })} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-6">
        <Campo id="cant-via" label="Cantiere: via e numero" value={o.cantiere.via} readOnly={ro} className="sm:col-span-3"
          onChange={(v) => modifica((x) => { x.opera.cantiere.via = v; })} />
        <Campo id="cant-loc" label="Località" value={o.cantiere.localita} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((x) => { x.opera.cantiere.localita = v; })} />
        <Campo id="cant-prov" label="Provincia" value={o.cantiere.provincia} readOnly={ro}
          onChange={(v) => modifica((x) => { x.opera.cantiere.provincia = v.toUpperCase().slice(0, 2); })} />
        <Campo id="data-inizio" label="Inizio lavori" type="date" value={o.data_inizio} readOnly={ro} className="sm:col-span-3"
          onChange={(v) => modifica((x) => { x.opera.data_inizio = v; })} />
        <Campo id="data-fine" label="Fine lavori prevista" type="date" value={o.data_fine} readOnly={ro} className="sm:col-span-3"
          onChange={(v) => modifica((x) => { x.opera.data_fine = v; })} />
      </div>

      <Area id="descr-att" label="Descrizione sintetica delle attività che saranno svolte in cantiere" rows={3} value={o.descrizione_attivita} readOnly={ro}
        onChange={(v) => modifica((x) => { x.opera.descrizione_attivita = v; })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Area id="mod-org" label="Modalità organizzative" rows={3} value={o.modalita_organizzative} readOnly={ro}
          placeholder="Es.: accesso al cantiere dal cancello su via…, area di stoccaggio materiali nel cortile, servizi igienici chimici, orari di consegna"
          onChange={(v) => modifica((x) => { x.opera.modalita_organizzative = v; })} />
        <Area id="turni" label="Turni di lavoro" rows={3} value={o.turni_lavoro} readOnly={ro}
          placeholder="Es.: turno unico diurno, 8:00-12:00 e 13:00-17:00, dal lunedì al venerdì"
          onChange={(v) => modifica((x) => { x.opera.turni_lavoro = v; })} />
      </div>
    </Sezione>
  );
}

// ── 2. Impresa ───────────────────────────────────────────────────────────────

export function SezioneImpresa({ d, modifica, ro, mancanti }: BaseProps) {
  const i = d.impresa;
  const recapito = (chiave: "sede_legale" | "sede_operativa" | "uffici_cantiere", titolo: string, hint?: string) => (
    <div className="grid gap-3 sm:grid-cols-3">
      <Campo id={`${chiave}-ind`} label={`${titolo}: indirizzo`} value={i[chiave].indirizzo} readOnly={ro} hint={hint}
        onChange={(v) => modifica((x) => { x.impresa[chiave].indirizzo = v; })} />
      <Campo id={`${chiave}-tel`} label="Telefono" type="tel" value={i[chiave].telefono} readOnly={ro}
        onChange={(v) => modifica((x) => { x.impresa[chiave].telefono = v; })} />
      <Campo id={`${chiave}-mail`} label="E-mail" type="email" value={i[chiave].email} readOnly={ro}
        onChange={(v) => modifica((x) => { x.impresa[chiave].email = v; })} />
    </div>
  );
  return (
    <Sezione id="impresa" numero={2} titolo="Dati identificativi dell'impresa" riferimento={RIFERIMENTI_SEZIONE.impresa} mancanti={mancanti}>
      <RadioGroup value={i.ruolo} disabled={ro} className="grid gap-2 sm:grid-cols-3"
        onValueChange={(v) => modifica((x) => { x.impresa.ruolo = v as RuoloImpresa; })}>
        {(Object.keys(RUOLO_IMPRESA_LABEL) as RuoloImpresa[]).map((r) => (
          <Label key={r} htmlFor={`ruolo-${r}`} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm font-normal">
            <RadioGroupItem id={`ruolo-${r}`} value={r} />
            {RUOLO_IMPRESA_LABEL[r]}
          </Label>
        ))}
      </RadioGroup>
      {i.ruolo === "esecutrice_subappalto" && (
        <Campo id="sub-a" label="In subappalto a (impresa affidataria)" value={i.subappalto_a} readOnly={ro}
          onChange={(v) => modifica((x) => { x.impresa.subappalto_a = v; })} />
      )}
      <div className="flex items-center gap-2">
        <Switch id="oltre-200" checked={i.durata_oltre_200_giorni} disabled={ro}
          onCheckedChange={(on) => modifica((x) => { x.impresa.durata_oltre_200_giorni = on; })} />
        <Label htmlFor="oltre-200" className="text-sm">Le attività dell'impresa in questo cantiere durano più di 200 giorni</Label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo id="rag-soc" label="Ragione sociale" value={i.ragione_sociale} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((x) => { x.impresa.ragione_sociale = v; })} />
        <Campo id="piva" label="Partita IVA" value={i.partita_iva} readOnly={ro}
          onChange={(v) => modifica((x) => { x.impresa.partita_iva = v; })} />
        <Campo id="datore" label="Datore di lavoro" value={i.datore_lavoro} readOnly={ro} className="sm:col-span-3"
          onChange={(v) => modifica((x) => { x.impresa.datore_lavoro = v; })} />
      </div>
      {recapito("sede_legale", "Sede legale")}
      {recapito("sede_operativa", "Sede operativa", "Vuota: nel POS risulta uguale alla sede legale.")}
      {recapito("uffici_cantiere", "Uffici di cantiere", "Vuoti: nel POS risultano non previsti.")}
    </Sezione>
  );
}

// ── 3. Figure ────────────────────────────────────────────────────────────────

export function SezioneFigure({ d, modifica, ro, mancanti }: BaseProps) {
  return (
    <Sezione id="figure" numero={3} titolo="Dirigenti, preposti, RSPP, medico competente e RLS" riferimento={RIFERIMENTI_SEZIONE.figure} mancanti={mancanti}
      descrizione="Arrivano dalle Figure della sicurezza dell'impresa. Qui le adatti a questo cantiere; per ognuna servono le mansioni di sicurezza (lettera b).">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Dirigenti</h3>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.dirigenti.push({ nominativo: "", ruolo: "direttore_tecnico", mansioni_sicurezza: "" }); })}>
              <Plus className="mr-1 h-4 w-4" />Aggiungi
            </Button>
          )}
        </div>
        {d.dirigenti.length === 0 && <p className="text-xs text-muted-foreground">Serve almeno il direttore tecnico di cantiere.</p>}
        {d.dirigenti.map((x, n) => (
          <Riga key={`dir-${n}`} readOnly={ro} etichettaRimuovi={`Togli il dirigente ${x.nominativo || n + 1}`} onRemove={() => modifica((y) => { y.dirigenti.splice(n, 1); })}>
            <div className="grid gap-3 pr-10 sm:grid-cols-2">
              <Campo id={`dir-${n}-nome`} label="Nominativo" value={x.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.dirigenti[n].nominativo = v; })} />
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">Ruolo</Label>
                <Select value={x.ruolo} disabled={ro} onValueChange={(v) => modifica((y) => { y.dirigenti[n].ruolo = v as typeof x.ruolo; })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direttore_tecnico">Direttore tecnico di cantiere</SelectItem>
                    <SelectItem value="incaricato_art97">Incaricato dell'affidataria (art. 97)</SelectItem>
                    <SelectItem value="altro">Altro dirigente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Area id={`dir-${n}-mans`} label="Mansioni di sicurezza in cantiere" rows={2} value={x.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
                onChange={(v) => modifica((y) => { y.dirigenti[n].mansioni_sicurezza = v; })} />
            </div>
          </Riga>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Preposti</h3>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.preposti.push({ nominativo: "", ruolo: "capocantiere", ruolo_altro: "", mansioni_sicurezza: "" }); })}>
              <Plus className="mr-1 h-4 w-4" />Aggiungi
            </Button>
          )}
        </div>
        {d.preposti.length === 0 && <p className="text-xs text-muted-foreground">Serve almeno il capocantiere.</p>}
        {d.preposti.map((x, n) => (
          <Riga key={`pre-${n}`} readOnly={ro} etichettaRimuovi={`Togli il preposto ${x.nominativo || n + 1}`} onRemove={() => modifica((y) => { y.preposti.splice(n, 1); })}>
            <div className="grid gap-3 pr-10 sm:grid-cols-2">
              <Campo id={`pre-${n}-nome`} label="Nominativo" value={x.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.preposti[n].nominativo = v; })} />
              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">Ruolo</Label>
                <Select value={x.ruolo} disabled={ro} onValueChange={(v) => modifica((y) => { y.preposti[n].ruolo = v as typeof x.ruolo; })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capocantiere">Capo cantiere</SelectItem>
                    <SelectItem value="incaricato_art97">Incaricato dell'affidataria (art. 97)</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {x.ruolo === "altro" && (
                <Campo id={`pre-${n}-altro`} label="Quale ruolo" value={x.ruolo_altro} readOnly={ro} onChange={(v) => modifica((y) => { y.preposti[n].ruolo_altro = v; })} />
              )}
              <Area id={`pre-${n}-mans`} label="Mansioni di sicurezza in cantiere" rows={2} value={x.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
                onChange={(v) => modifica((y) => { y.preposti[n].mansioni_sicurezza = v; })} />
            </div>
          </Riga>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <h3 className="text-sm font-semibold sm:col-span-2">Responsabile del servizio di prevenzione e protezione (RSPP)</h3>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-slate-700">Il ruolo è svolto da</Label>
          <Select value={d.rspp.svolto_da} disabled={ro} onValueChange={(v) => modifica((y) => {
            y.rspp.svolto_da = v as RsppSvoltoDa;
            if (v === "datore" && !y.rspp.nominativo) y.rspp.nominativo = y.impresa.datore_lavoro;
          })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RSPP_LABEL) as RsppSvoltoDa[]).map((k) => <SelectItem key={k} value={k}>{RSPP_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Campo id="rspp-nome" label="Nominativo" value={d.rspp.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.rspp.nominativo = v; })} />
        <Area id="rspp-mans" label="Mansioni di sicurezza in cantiere" rows={2} value={d.rspp.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((y) => { y.rspp.mansioni_sicurezza = v; })} />
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <h3 className="text-sm font-semibold">Medico competente</h3>
          <div className="flex items-center gap-2">
            <Switch id="medico-previsto" checked={d.medico_competente.previsto} disabled={ro}
              onCheckedChange={(on) => modifica((y) => { y.medico_competente.previsto = on; })} />
            <Label htmlFor="medico-previsto" className="text-xs">Previsto (sorveglianza sanitaria)</Label>
          </div>
        </div>
        {d.medico_competente.previsto && (
          <>
            <Campo id="medico-nome" label="Nominativo" value={d.medico_competente.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.medico_competente.nominativo = v; })} />
            <Area id="medico-mans" label="Mansioni di sicurezza in cantiere" rows={2} value={d.medico_competente.mansioni_sicurezza} readOnly={ro}
              onChange={(v) => modifica((y) => { y.medico_competente.mansioni_sicurezza = v; })} />
          </>
        )}
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <h3 className="text-sm font-semibold sm:col-span-2">Rappresentante dei lavoratori per la sicurezza</h3>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-slate-700">Tipo</Label>
          <Select value={d.rls.tipo} disabled={ro} onValueChange={(v) => modifica((y) => { y.rls.tipo = v as "rls" | "rlst"; })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rls">RLS aziendale</SelectItem>
              <SelectItem value="rlst">RLST territoriale</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Campo id="rls-nome" label="Nominativo" value={d.rls.nominativo} readOnly={ro} onChange={(v) => modifica((y) => { y.rls.nominativo = v; })} />
        <Area id="rls-mans" label="Mansioni di sicurezza in cantiere" rows={2} value={d.rls.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
          onChange={(v) => modifica((y) => { y.rls.mansioni_sicurezza = v; })} />
      </div>
    </Sezione>
  );
}

// ── 4. Emergenze ─────────────────────────────────────────────────────────────

export function SezioneEmergenze({ d, modifica, ro, mancanti }: BaseProps) {
  const e = d.emergenze;
  return (
    <Sezione id="emergenze" numero={4} titolo="Pronto soccorso, antincendio ed evacuazione" riferimento={RIFERIMENTI_SEZIONE.emergenze} mancanti={mancanti}
      descrizione="Se c'è il PSC, controlla cosa prevede per emergenze, evacuazione e primo soccorso.">
      <RadioGroup value={e.gestione} disabled={ro} className="grid gap-2 sm:grid-cols-3"
        onValueChange={(v) => modifica((x) => { x.emergenze.gestione = v as GestioneEmergenze; })}>
        {(Object.keys(GESTIONE_EMERGENZE_LABEL) as GestioneEmergenze[]).map((g) => (
          <Label key={g} htmlFor={`gest-${g}`} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm font-normal">
            <RadioGroupItem id={`gest-${g}`} value={g} />
            {GESTIONE_EMERGENZE_LABEL[g]}
          </Label>
        ))}
      </RadioGroup>
      {e.gestione === "comune" && (
        <Campo id="imprese-comune" label="Imprese che gestiscono insieme le emergenze" value={e.imprese_gestione_comune} readOnly={ro}
          onChange={(v) => modifica((x) => { x.emergenze.imprese_gestione_comune = v; })} />
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Lavoratori incaricati</h3>
        {!ro && (
          <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.emergenze.addetti.push({ nominativo: "", antincendio: false, primo_soccorso: false, mansioni_sicurezza: "" }); })}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi
          </Button>
        )}
      </div>
      {e.addetti.map((a, n) => (
        <Riga key={`add-${n}`} readOnly={ro} etichettaRimuovi={`Togli l'addetto ${a.nominativo || n + 1}`} onRemove={() => modifica((x) => { x.emergenze.addetti.splice(n, 1); })}>
          <div className="grid gap-3 pr-10 sm:grid-cols-2">
            <Campo id={`add-${n}-nome`} label="Nominativo" value={a.nominativo} readOnly={ro} onChange={(v) => modifica((x) => { x.emergenze.addetti[n].nominativo = v; })} />
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={a.antincendio} disabled={ro} onCheckedChange={(c) => modifica((x) => { x.emergenze.addetti[n].antincendio = c === true; })} />
                Antincendio, evacuazione, salvataggio
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={a.primo_soccorso} disabled={ro} onCheckedChange={(c) => modifica((x) => { x.emergenze.addetti[n].primo_soccorso = c === true; })} />
                Primo soccorso
              </label>
            </div>
            <Area id={`add-${n}-mans`} label="Mansioni di sicurezza in cantiere" rows={2} value={a.mansioni_sicurezza} readOnly={ro} className="sm:col-span-2"
              onChange={(v) => modifica((x) => { x.emergenze.addetti[n].mansioni_sicurezza = v; })} />
          </div>
        </Riga>
      ))}
    </Sezione>
  );
}

// ── 5. Lavoratori e autonomi ─────────────────────────────────────────────────

export function SezioneLavoratori({ d, modifica, ro, mancanti }: BaseProps) {
  return (
    <Sezione id="lavoratori" numero={5} titolo="Lavoratori in cantiere per conto dell'impresa" riferimento={RIFERIMENTI_SEZIONE.lavoratori} mancanti={mancanti}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Numero e qualifica dei lavoratori</h3>
          {!ro && <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.lavoratori.push({ qualifica: "", numero: 1, note: "" }); })}><Plus className="mr-1 h-4 w-4" />Aggiungi</Button>}
        </div>
        {d.lavoratori.map((r, n) => (
          <Riga key={`lav-${n}`} readOnly={ro} etichettaRimuovi={`Togli la riga ${r.qualifica || n + 1}`} onRemove={() => modifica((x) => { x.lavoratori.splice(n, 1); })}>
            <div className="grid gap-3 pr-10 sm:grid-cols-6">
              <Campo id={`lav-${n}-q`} label="Qualifica" value={r.qualifica} readOnly={ro} className="sm:col-span-3" onChange={(v) => modifica((x) => { x.lavoratori[n].qualifica = v; })} />
              <Campo id={`lav-${n}-n`} label="Numero" type="number" value={String(r.numero)} readOnly={ro}
                onChange={(v) => modifica((x) => { x.lavoratori[n].numero = Math.max(0, Math.round(Number(v) || 0)); })} />
              <Campo id={`lav-${n}-note`} label="Note" value={r.note} readOnly={ro} className="sm:col-span-2" onChange={(v) => modifica((x) => { x.lavoratori[n].note = v; })} />
            </div>
          </Riga>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Lavoratori autonomi</h3>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() => modifica((x) => {
              x.autonomi.push({ nominativo: "", indirizzo: "", codice_fiscale: "", partita_iva: "", attivita: "", data_ingresso: "", data_uscita: "", note: "" });
            })}><Plus className="mr-1 h-4 w-4" />Aggiungi</Button>
          )}
        </div>
        {d.autonomi.length === 0 && <p className="text-xs text-muted-foreground">Nessuno: nel POS risulta che non operano lavoratori autonomi per conto dell'impresa.</p>}
        {d.autonomi.map((a, n) => (
          <Riga key={`aut-${n}`} readOnly={ro} etichettaRimuovi={`Togli l'autonomo ${a.nominativo || n + 1}`} onRemove={() => modifica((x) => { x.autonomi.splice(n, 1); })}>
            <div className="grid gap-3 pr-10 sm:grid-cols-2">
              <Campo id={`aut-${n}-nome`} label="Nominativo" value={a.nominativo} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].nominativo = v; })} />
              <Campo id={`aut-${n}-att`} label="Attività svolta in cantiere" value={a.attivita} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].attivita = v; })} />
              <Campo id={`aut-${n}-ind`} label="Indirizzo" value={a.indirizzo} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].indirizzo = v; })} />
              <Campo id={`aut-${n}-cf`} label="Codice fiscale" value={a.codice_fiscale} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].codice_fiscale = v; })} />
              <Campo id={`aut-${n}-piva`} label="Partita IVA" value={a.partita_iva} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].partita_iva = v; })} />
              <div className="grid grid-cols-2 gap-3">
                <Campo id={`aut-${n}-in`} label="Ingresso in cantiere" type="date" value={a.data_ingresso} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].data_ingresso = v; })} />
                <Campo id={`aut-${n}-out`} label="Uscita" type="date" value={a.data_uscita} readOnly={ro} onChange={(v) => modifica((x) => { x.autonomi[n].data_uscita = v; })} />
              </div>
            </div>
          </Riga>
        ))}
      </div>
    </Sezione>
  );
}

// ── 6. Formazione ────────────────────────────────────────────────────────────

export function SezioneFormazione({ d, modifica, ro, mancanti }: BaseProps) {
  const voci: Array<{ k: "base" | "rischi_specifici" | "rischi_cantiere" | "dpi_terza_categoria"; label: string }> = [
    { k: "base", label: "Base" },
    { k: "rischi_specifici", label: "Rischi specifici e di mansione" },
    { k: "rischi_cantiere", label: "Rischi di cantiere del PSC e del POS" },
    { k: "dpi_terza_categoria", label: "DPI di 3ª categoria, con addestramento" },
  ];
  return (
    <Sezione id="formazione" numero={6} titolo="Informazione e formazione dei lavoratori" riferimento={RIFERIMENTI_SEZIONE.formazione} mancanti={mancanti}
      descrizione="Per ciascun lavoratore. Le caselle sono spuntate solo dove l'app ha trovato un attestato: controlla e completa.">
      {!ro && (
        <Button size="sm" variant="outline" onClick={() => modifica((x) => {
          x.formazione.push({ nominativo: "", qualifica: "", base: false, rischi_specifici: false, rischi_cantiere: false, dpi_terza_categoria: false, altro: "", attestati: "" });
        })}><Plus className="mr-1 h-4 w-4" />Aggiungi lavoratore</Button>
      )}
      {d.formazione.map((f, n) => (
        <Riga key={`for-${n}`} readOnly={ro} etichettaRimuovi={`Togli ${f.nominativo || `il lavoratore ${n + 1}`}`} onRemove={() => modifica((x) => { x.formazione.splice(n, 1); })}>
          <div className="grid gap-3 pr-10 sm:grid-cols-2">
            <Campo id={`for-${n}-nome`} label="Lavoratore" value={f.nominativo} readOnly={ro} onChange={(v) => modifica((x) => { x.formazione[n].nominativo = v; })} />
            <Campo id={`for-${n}-q`} label="Qualifica" value={f.qualifica} readOnly={ro} onChange={(v) => modifica((x) => { x.formazione[n].qualifica = v; })} />
            <div className="grid gap-2 text-sm sm:col-span-2 sm:grid-cols-2">
              {voci.map((v) => (
                <label key={v.k} className="flex items-center gap-2">
                  <Checkbox checked={f[v.k]} disabled={ro} onCheckedChange={(c) => modifica((x) => { x.formazione[n][v.k] = c === true; })} />
                  {v.label}
                </label>
              ))}
            </div>
            <Campo id={`for-${n}-altro`} label="Altro (descrivi)" value={f.altro} readOnly={ro} className="sm:col-span-2"
              placeholder="Es.: PLE, carrello elevatore, preposto 8 ore, ponteggiatori 28 ore"
              onChange={(v) => modifica((x) => { x.formazione[n].altro = v; })} />
            {f.attestati && <p className="text-xs text-muted-foreground sm:col-span-2">Attestati nell'app: {f.attestati}</p>}
          </div>
        </Riga>
      ))}
    </Sezione>
  );
}

// ── 7. Rumore ────────────────────────────────────────────────────────────────

export function SezioneRumore({ d, modifica, ro, mancanti }: BaseProps) {
  return (
    <Sezione id="rumore" numero={7} titolo="Esito del rapporto di valutazione del rumore" riferimento={RIFERIMENTI_SEZIONE.rumore} mancanti={mancanti}
      descrizione="Riporta l'esito della valutazione del rumore dell'impresa: i valori vengono dal rapporto, non si stimano qui. Il rapporto si può allegare.">
      <Area id="rumore-esito" label="Esito della valutazione" rows={3} value={d.rumore.esito} readOnly={ro}
        placeholder="Es.: dalla valutazione del rumore del … (rev. …), l'esposizione giornaliera degli addetti è inferiore/superiore a … dB(A)"
        onChange={(v) => modifica((x) => { x.rumore.esito = v; })} />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tabella dei livelli di esposizione</h3>
        {!ro && (
          <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.rumore.righe.push({ mansione: "", lavorazione: "", livello_sorgenti: "", esposizione: "", note: "" }); })}>
            <Plus className="mr-1 h-4 w-4" />Aggiungi riga
          </Button>
        )}
      </div>
      {d.rumore.righe.map((r, n) => (
        <Riga key={`rum-${n}`} readOnly={ro} etichettaRimuovi={`Togli la riga ${n + 1}`} onRemove={() => modifica((x) => { x.rumore.righe.splice(n, 1); })}>
          <div className="grid gap-3 pr-10 sm:grid-cols-2">
            <Campo id={`rum-${n}-m`} label="Mansione (o nominativo)" value={r.mansione} readOnly={ro} onChange={(v) => modifica((x) => { x.rumore.righe[n].mansione = v; })} />
            <Campo id={`rum-${n}-l`} label="Lavorazione" value={r.lavorazione} readOnly={ro} onChange={(v) => modifica((x) => { x.rumore.righe[n].lavorazione = v; })} />
            <Campo id={`rum-${n}-s`} label="Pressione sonora delle sorgenti" value={r.livello_sorgenti} readOnly={ro} onChange={(v) => modifica((x) => { x.rumore.righe[n].livello_sorgenti = v; })} />
            <Campo id={`rum-${n}-e`} label="Esposizione giornaliera/settimanale" value={r.esposizione} readOnly={ro} onChange={(v) => modifica((x) => { x.rumore.righe[n].esposizione = v; })} />
            <Campo id={`rum-${n}-note`} label="Note" value={r.note} readOnly={ro} className="sm:col-span-2" onChange={(v) => modifica((x) => { x.rumore.righe[n].note = v; })} />
          </div>
        </Riga>
      ))}
    </Sezione>
  );
}

// ── 8. Lavorazioni ───────────────────────────────────────────────────────────

interface LavorazioniProps extends BaseProps {
  contesto: ContestoPos | null;
  onProponiAi: () => void;
  proponendo: boolean;
}

export function SezioneLavorazioni({ d, modifica, ro, mancanti, contesto, onProponiAi, proponendo }: LavorazioniProps) {
  const campo = (l: Lavorazione, n: number, k: keyof Lavorazione, label: string, righe = 2, placeholder?: string) => (
    <Area id={`lv-${n}-${k}`} label={label} rows={righe} value={String(l[k] ?? "")} readOnly={ro} placeholder={placeholder}
      onChange={(v) => modifica((x) => { (x.lavorazioni[n] as unknown as Record<string, unknown>)[k] = v; })} />
  );
  return (
    <Sezione id="lavorazioni" numero={8} titolo="Lavorazioni svolte in cantiere" riferimento={RIFERIMENTI_SEZIONE.lavorazioni} mancanti={mancanti}
      descrizione="Una scheda per lavorazione: sostanze, opere provvisionali, macchine, rischi, misure e DPI. Le schede proposte dall'AI valgono solo dopo che le hai lette e confermate."
      azioni={!ro ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onProponiAi} disabled={proponendo}>
            {proponendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}Proponi con l'AI
          </Button>
          <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.lavorazioni.push(lavorazioneVuota(nuovoId())); })}>
            <Plus className="mr-1 h-4 w-4" />Scheda vuota
          </Button>
        </div>
      ) : undefined}>
      {contesto && (contesto.mezzi.length > 0 || contesto.subappaltatori.length > 0) && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          {contesto.mezzi.length > 0 && <p><span className="font-medium">Mezzi sulla commessa:</span> {contesto.mezzi.map((m) => m.targa ? `${m.nome} (${m.targa})` : m.nome).join(", ")}</p>}
          {contesto.subappaltatori.length > 0 && <p className="mt-1"><span className="font-medium">Subappaltatori della commessa:</span> {contesto.subappaltatori.map((s) => s.tipo_lavori ? `${s.ragione_sociale} (${s.tipo_lavori})` : s.ragione_sociale).join(", ")}</p>}
        </div>
      )}
      {d.lavorazioni.length === 0 && <p className="text-sm text-muted-foreground">Nessuna lavorazione. Proponile con l'AI partendo dalla descrizione dell'attività, o scrivile a mano.</p>}
      {d.lavorazioni.map((l, n) => (
        <div key={l.id} className={`rounded-xl border ${l.origine === "ai" && !l.verificata ? "border-amber-300 bg-amber-50/30" : "bg-slate-50/50"}`}>
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-200 text-xs font-bold">{n + 1}</span>
            <input
              aria-label={`Titolo della lavorazione ${n + 1}`}
              className="min-w-0 flex-1 rounded-md border bg-white px-2 py-1 text-sm font-medium disabled:bg-transparent"
              value={l.titolo}
              disabled={ro}
              placeholder="Titolo della lavorazione"
              onChange={(e) => modifica((x) => { x.lavorazioni[n].titolo = e.target.value; })}
            />
            {l.origine === "ai" && (
              <Badge variant="outline" className={l.verificata ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-100 text-amber-900"}>
                {l.verificata ? "AI, confermata" : "Proposta dall'AI"}
              </Badge>
            )}
            {!ro && (
              <div className="flex items-center">
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={n === 0} aria-label="Sposta su"
                  onClick={() => modifica((x) => { const [it] = x.lavorazioni.splice(n, 1); x.lavorazioni.splice(n - 1, 0, it); })}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={n === d.lavorazioni.length - 1} aria-label="Sposta giù"
                  onClick={() => modifica((x) => { const [it] = x.lavorazioni.splice(n, 1); x.lavorazioni.splice(n + 1, 0, it); })}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Duplica"
                  onClick={() => modifica((x) => { x.lavorazioni.splice(n + 1, 0, { ...x.lavorazioni[n], id: nuovoId(), titolo: `${x.lavorazioni[n].titolo} (copia)` }); })}><Copy className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Elimina la lavorazione ${l.titolo || n + 1}`}
                  onClick={() => modifica((x) => { x.lavorazioni.splice(n, 1); })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
          <div className="grid gap-3 p-3 sm:grid-cols-2">
            {campo(l, n, "descrizione", "Descrizione della lavorazione")}
            {campo(l, n, "modalita", "Modalità e organizzazione della fase di lavoro")}
            {campo(l, n, "sostanze", "Sostanze e preparati pericolosi", 2, "«Nessuna», oppure i prodotti: allega le schede di sicurezza")}
            {campo(l, n, "opere_provvisionali", "Opere provvisionali", 2, "Ponteggi, trabattelli, parapetti… o «Nessuna»")}
            {campo(l, n, "macchine", "Macchine e attrezzature", 2, "Anche «Nessuna»")}
            {campo(l, n, "impianti", "Impianti", 2, "Elettrico di cantiere, idrico… o «Nessuno»")}
            {campo(l, n, "rischi", "Rischi", 4, "Uno per riga")}
            {campo(l, n, "misure", "Misure preventive e protettive", 4, "Una per riga")}
            {campo(l, n, "dpi", "DPI", 3, "Uno per riga, con la norma se la conosci")}
            {campo(l, n, "turni", "Turni di lavoro", 3)}
            <Campo id={`lv-${n}-durata`} label="Durata presunta (giorni)" type="number" value={l.durata_giorni == null ? "" : String(l.durata_giorni)} readOnly={ro}
              onChange={(v) => modifica((x) => { x.lavorazioni[n].durata_giorni = v === "" ? null : Math.max(0, Math.round(Number(v) || 0)); })} />
            <div className="space-y-1">
              <Label className="text-xs font-medium text-slate-700">Svolgimento</Label>
              <Select value={l.svolgimento} disabled={ro} onValueChange={(v) => modifica((x) => { x.lavorazioni[n].svolgimento = v as Svolgimento; })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SVOLGIMENTO_LABEL) as Svolgimento[]).map((k) => <SelectItem key={k} value={k}>{SVOLGIMENTO_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {l.svolgimento !== "diretto" && (
              <Campo id={`lv-${n}-con`} label={l.svolgimento === "subappalto" ? "Impresa subappaltatrice" : "Impresa con cui si collabora"} value={l.svolgimento_con} readOnly={ro}
                hint={contesto?.subappaltatori.length ? `Sulla commessa: ${contesto.subappaltatori.map((s) => s.ragione_sociale).join(", ")}` : undefined}
                onChange={(v) => modifica((x) => { x.lavorazioni[n].svolgimento_con = v; })} />
            )}
            {l.origine === "ai" && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-2 text-sm sm:col-span-2">
                <Checkbox checked={l.verificata} disabled={ro} onCheckedChange={(c) => modifica((x) => { x.lavorazioni[n].verificata = c === true; })} className="mt-0.5" />
                Ho letto questa scheda, l'ho adattata al cantiere e la confermo
              </label>
            )}
          </div>
        </div>
      ))}
    </Sezione>
  );
}

// ── 9. Procedure del PSC ─────────────────────────────────────────────────────

export function SezionePsc({ d, modifica, ro, mancanti }: BaseProps) {
  const p = d.procedure_psc;
  return (
    <Sezione id="psc" numero={9} titolo="Procedure complementari o di dettaglio richieste dal PSC" riferimento={RIFERIMENTI_SEZIONE.psc} mancanti={mancanti}>
      <div className="flex items-center gap-2">
        <Switch id="psc-presente" checked={p.psc_presente} disabled={ro} onCheckedChange={(on) => modifica((x) => {
          x.procedure_psc.psc_presente = on;
          if (!on) x.procedure_psc.richieste = false;
        })} />
        <Label htmlFor="psc-presente" className="text-sm">Per questo cantiere c'è un Piano di Sicurezza e Coordinamento (PSC)</Label>
      </div>
      {p.psc_presente && (
        <div className="flex items-center gap-2">
          <Switch id="psc-richieste" checked={p.richieste} disabled={ro} onCheckedChange={(on) => modifica((x) => { x.procedure_psc.richieste = on; })} />
          <Label htmlFor="psc-richieste" className="text-sm">Il PSC chiede procedure complementari o di dettaglio</Label>
        </div>
      )}
      {p.psc_presente && p.richieste && (
        <>
          {!ro && (
            <Button size="sm" variant="outline" onClick={() => modifica((x) => { x.procedure_psc.voci.push({ procedura: "", indicazioni: "" }); })}>
              <Plus className="mr-1 h-4 w-4" />Aggiungi procedura
            </Button>
          )}
          {p.voci.map((v, n) => (
            <Riga key={`psc-${n}`} readOnly={ro} etichettaRimuovi={`Togli la procedura ${n + 1}`} onRemove={() => modifica((x) => { x.procedure_psc.voci.splice(n, 1); })}>
              <div className="grid gap-3 pr-10 sm:grid-cols-2">
                <Area id={`psc-${n}-p`} label="Procedura richiesta nel PSC" rows={2} value={v.procedura} readOnly={ro} onChange={(t) => modifica((x) => { x.procedure_psc.voci[n].procedura = t; })} />
                <Area id={`psc-${n}-i`} label="Indicazioni complementari e di dettaglio" rows={2} value={v.indicazioni} readOnly={ro} onChange={(t) => modifica((x) => { x.procedure_psc.voci[n].indicazioni = t; })} />
              </div>
            </Riga>
          ))}
        </>
      )}
    </Sezione>
  );
}

// ── 10. Allegati ─────────────────────────────────────────────────────────────

interface AllegatiProps extends BaseProps {
  companyId: string;
  posId: string;
}

export function SezioneAllegati({ d, modifica, ro, mancanti, companyId, posId }: AllegatiProps) {
  const [tipo, setTipo] = useState<TipoAllegato>("scheda_sicurezza");
  const [caricando, setCaricando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const carica = async (files: FileList | null) => {
    if (!files?.length) return;
    setCaricando(true);
    try {
      for (const f of Array.from(files)) {
        const path = await caricaAllegatoPos(companyId, posId, f);
        modifica((x) => { x.allegati.push({ tipo, nome: f.name, file_path: path }); });
      }
      toast.success("Allegato caricato: salva il POS per tenerlo");
    } catch (e) {
      toast.error(e instanceof Error ? `Allegato non caricato: ${e.message}` : "Allegato non caricato");
    } finally {
      setCaricando(false);
      if (input.current) input.current.value = "";
    }
  };

  const apri = async (path: string) => {
    const scheda = window.open("", "_blank");
    const url = await linkAllegatoPos(path);
    if (url && scheda) scheda.location.replace(url);
    else {
      scheda?.close();
      toast.error("Non riesco ad aprire l'allegato");
    }
  };

  return (
    <Sezione id="allegati" numero={10} titolo="Allegati" riferimento={RIFERIMENTI_SEZIONE.allegati} mancanti={mancanti}
      descrizione="Le schede di sicurezza delle sostanze pericolose sono allegati obbligatori. Qui anche il rapporto sul rumore o altri documenti.">
      {!ro && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-slate-700">Tipo di allegato</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAllegato)}>
              <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ALLEGATO_LABEL) as TipoAllegato[]).map((k) => <SelectItem key={k} value={k}>{ALLEGATO_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <input ref={input} id="pos-allegato" type="file" className="sr-only" multiple accept=".pdf,image/*,.doc,.docx" onChange={(e) => carica(e.target.files)} />
          <Button variant="outline" disabled={caricando} onClick={() => input.current?.click()}>
            {caricando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />}Carica file
          </Button>
        </div>
      )}
      {d.allegati.length === 0 && <p className="text-sm text-muted-foreground">Nessun allegato.</p>}
      <ul className="divide-y rounded-lg border">
        {d.allegati.map((a, n) => (
          <li key={`${a.file_path}-${n}`} className="flex items-center gap-3 px-3 py-2">
            <Badge variant="outline" className="shrink-0 text-[11px]">{ALLEGATO_LABEL[a.tipo]}</Badge>
            <span className="min-w-0 flex-1 truncate text-sm">{a.nome}</span>
            {a.file_path && (
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Apri ${a.nome}`} onClick={() => apri(a.file_path)}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            {!ro && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Togli ${a.nome}`}
                // Solo dall'elenco: il file resta finché il POS non è salvato, così
                // «annulla» non lascia un riferimento a un file cancellato.
                onClick={() => modifica((x) => { x.allegati.splice(n, 1); })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Sezione>
  );
}
