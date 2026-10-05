/**
 * «Il cantiere» in cima a «Lavori e squadre» (26/09/2026, richiesta del
 * founder): dove si trova, quanta strada c'è dalla sede (km e tempo, con le
 * indicazioni), e i mezzi e gli attrezzi legati al cantiere — quelli che ci
 * stanno e quelli di chi ci lavora. Dal 05/10 anche i ponteggi (e le altre
 * attrezzature a quantità) montati qui: si portano sul cantiere a m² o a pezzi.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Layers, MapPin, Navigation, Plus, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import { useDistanzeCantieri } from "@/hooks/useDistanzaCantieri";
import { useAssegnaMezzoACommessa, useMezzi, useMezziDisponibilita, useMontaQuantita } from "@/hooks/useMezzi";
import { formatQuantita, numeroLetto, unitaBreve } from "@/types/mezzi";
import { usePermissions } from "@/hooks/usePermissions";
import {
  durataViaggio, linkIndicazioni, mezziLavoroKey, useIndirizzoCantiere, useMezziLavoro,
} from "@/hooks/useCantiereLogistica";
import { AZIONE_TENUE } from "@/lib/manodopera/colori";
import { cn } from "@/lib/utils";

const kmIt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });

function MettiMezzoDialog({ orderId, aperto, onAperto, giaQui }: {
  orderId: string;
  aperto: boolean;
  onAperto: (v: boolean) => void;
  giaQui: Set<string>;
}) {
  const qc = useQueryClient();
  const { data: mezzi = [] } = useMezzi();
  const { data: disponibilita } = useMezziDisponibilita();
  const assegna = useAssegnaMezzoACommessa();
  const monta = useMontaQuantita();
  const [scelto, setScelto] = useState("");
  const [quantita, setQuantita] = useState("");
  // I ponteggi (a quantità) si montano a m² o a pezzi, e solo se ne resta in magazzino.
  const scegliibili = mezzi.filter((m) =>
    m.gestione === "quantita"
      ? (disponibilita?.get(m.id)?.disponibile ?? Number(m.quantita_totale ?? 0)) > 0
      : !giaQui.has(m.id) && !m.su_mezzo_id);
  const sceltoInfo = mezzi.find((m) => m.id === scelto);
  const aQuantita = sceltoInfo?.gestione === "quantita";
  const libero = sceltoInfo ? disponibilita?.get(sceltoInfo.id)?.disponibile ?? Number(sceltoInfo.quantita_totale ?? 0) : 0;
  const n = numeroLetto(quantita);
  const quantitaValida = !aQuantita || (n != null && n > 0 && n <= libero);
  const occupato = assegna.isPending || monta.isPending;
  const dove = (m: (typeof mezzi)[number]) =>
    m.gestione === "quantita"
      ? `${formatQuantita(disponibilita?.get(m.id)?.disponibile ?? m.quantita_totale, m.unita_misura)} in magazzino`
      : m.assegnato_commessa ? `ora su ${m.assegnato_commessa}` : m.assegnato_persona ? `con ${m.assegnato_persona}` : "in sede";

  const chiudi = () => {
    setScelto("");
    setQuantita("");
    onAperto(false);
  };

  const conferma = () => {
    if (!scelto || !quantitaValida) return;
    if (aQuantita) {
      monta.mutate({ mezzoId: scelto, order_id: orderId, quantita: n! }, { onSuccess: chiudi });
      return;
    }
    assegna.mutate({ mezzoId: scelto, orderId }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: mezziLavoroKey(orderId) });
        chiudi();
      },
    });
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!occupato) { onAperto(o); if (!o) { setScelto(""); setQuantita(""); } } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Porta un mezzo o un attrezzo sul cantiere</DialogTitle>
          <DialogDescription>Da oggi risulta qui: lo vedi nel mezzo e nel diario del giorno.</DialogDescription>
        </DialogHeader>
        <Select value={scelto} onValueChange={(v) => { setScelto(v); setQuantita(""); }}>
          <SelectTrigger aria-label="Mezzo o attrezzo"><SelectValue placeholder="Scegli…" /></SelectTrigger>
          <SelectContent>
            {scegliibili.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.nome}{m.targa ? ` · ${m.targa}` : ""} — {dove(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {aQuantita && sceltoInfo && (
          <div className="space-y-1.5">
            <Label htmlFor="logistica-quantita">Quanto ne monti qui ({unitaBreve(sceltoInfo.unita_misura)})</Label>
            <Input
              id="logistica-quantita"
              inputMode="decimal"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              placeholder={`al massimo ${formatQuantita(libero, sceltoInfo.unita_misura)}`}
              aria-invalid={n != null && n > libero}
            />
            {n != null && n > libero && (
              <p className="text-xs text-red-700">In magazzino ce ne sono {formatQuantita(libero, sceltoInfo.unita_misura)}.</p>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onAperto(false)} disabled={occupato}>Annulla</Button>
          <Button
            className={AZIONE_TENUE.mezzo}
            variant="outline"
            disabled={!scelto || !quantitaValida || (aQuantita && !quantita.trim()) || occupato}
            onClick={conferma}
          >
            {aQuantita ? "Segna il montaggio" : "Porta sul cantiere"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CantiereLogistica({ orderId, showSiteEquipment = true }: { orderId: string; showSiteEquipment?: boolean }) {
  const qc = useQueryClient();
  const perms = usePermissions();
  const puoMezzi = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const vedeMezzi = perms.canViewMezzi === true || perms.isAdmin;
  const sede = useCompanyBase();
  const { data: cantiere } = useIndirizzoCantiere(orderId);
  const { data: distanze } = useDistanzeCantieri([orderId]);
  const { data: mezzi } = useMezziLavoro(orderId);
  const togli = useAssegnaMezzoACommessa();
  const [aperto, setAperto] = useState(false);

  const strada = distanze?.[orderId];
  const indicazioni = linkIndicazioni(sede, cantiere);
  const tempo = durataViaggio(strada?.minuti);
  const sulCantiere = mezzi?.sul_cantiere ?? [];
  const montati = mezzi?.montati ?? [];
  // Con le persone: solo chi lavora su tutta la commessa; quelli di una fase
  // stanno dentro la fase.
  const conTutti = (mezzi?.con_le_persone ?? []).filter((m) => m.fasi === null);

  return (
    <section aria-label="Il cantiere" className="space-y-2.5 rounded-xl border bg-slate-50/70 p-3 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{cantiere?.indirizzo ?? "Manca l'indirizzo del cantiere"}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {strada
                ? <>Dalla sede <b className="font-semibold text-foreground">{kmIt(strada.km)} km</b>{tempo && <> · <b className="font-semibold text-foreground">{tempo}</b></>} · andata e ritorno {kmIt(strada.km * 2)} km</>
                : !sede
                  ? "Per km e tempo dalla sede serve l'indirizzo della sede operativa nelle Impostazioni."
                  : cantiere?.indirizzo
                    ? "Km e tempo dalla sede arrivano appena il cantiere ha la posizione sulla mappa."
                    : "Aggiungilo dalla commessa: servono l'indirizzo e la posizione."}
            </p>
          </div>
        </div>
        {indicazioni && (
          <Button asChild size="sm" variant="outline" className={cn("h-8 max-sm:w-full", AZIONE_TENUE.fase)}>
            <a href={indicazioni} target="_blank" rel="noopener noreferrer">
              <Navigation className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Indicazioni
            </a>
          </Button>
        )}
      </div>

      {((showSiteEquipment && (sulCantiere.length > 0 || montati.length > 0 || puoMezzi)) || conTutti.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          <Truck className="mr-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{showSiteEquipment ? "Mezzi e attrezzi" : "Al seguito della squadra"}</span>
          {sulCantiere.length === 0 && montati.length === 0 && conTutti.length === 0 && (
            <span className="text-xs text-muted-foreground">nessuno sul cantiere</span>
          )}
          {(showSiteEquipment ? sulCantiere : []).map((m) => (
            <span key={m.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", AZIONE_TENUE.mezzo)}>
              <b className="font-semibold">{m.nome}</b>{m.targa && <span className="opacity-80">{m.targa}</span>}
              <span className="opacity-80">· sul cantiere</span>
              {puoMezzi && (
                <button
                  type="button"
                  className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-teal-200/60"
                  aria-label={`Togli ${m.nome} dal cantiere`}
                  disabled={togli.isPending}
                  onClick={() => togli.mutate({ mezzoId: m.id, orderId: null }, {
                    onSuccess: () => void qc.invalidateQueries({ queryKey: mezziLavoroKey(orderId) }),
                  })}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          {(showSiteEquipment ? montati : []).map((g) => {
            const testo = <><b className="font-semibold">{g.nome}</b><span className="opacity-80">· {formatQuantita(g.quantita, g.unita)} montati</span></>;
            return vedeMezzi ? (
              <Link
                key={g.id}
                to={`/azienda/mezzi/${g.mezzo_id}`}
                className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:underline", AZIONE_TENUE.mezzo)}
                title="Montaggi e rientri dalla scheda dell'attrezzatura"
              >
                <Layers className="h-3 w-3" aria-hidden="true" />{testo}
              </Link>
            ) : (
              <span key={g.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", AZIONE_TENUE.mezzo)}>
                <Layers className="h-3 w-3" aria-hidden="true" />{testo}
              </span>
            );
          })}
          {conTutti.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs">
              <b className="font-semibold">{m.nome}</b>
              <span className="text-muted-foreground">· {m.persona}{m.a_bordo.length > 0 ? `, con ${m.a_bordo.join(", ")}` : ""}</span>
            </span>
          ))}
          {puoMezzi && showSiteEquipment && (
            <Button size="sm" variant="outline" className={cn("h-7 rounded-full px-2.5 text-xs", AZIONE_TENUE.mezzo)} onClick={() => setAperto(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Mezzo o attrezzo
            </Button>
          )}
        </div>
      )}

      {puoMezzi && aperto && (
        <MettiMezzoDialog orderId={orderId} aperto={aperto} onAperto={setAperto} giaQui={new Set(sulCantiere.map((m) => m.id))} />
      )}
    </section>
  );
}
