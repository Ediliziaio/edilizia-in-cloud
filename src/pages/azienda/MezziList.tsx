/**
 * /azienda/mezzi — Mezzi e attrezzature (24/09/2026, divisi il 05/10/2026).
 *
 * Due elenchi: i mezzi (furgoni, auto, mezzi d'opera, gru, rimorchi) per tipo,
 * le attrezzature per categoria. In cima quello che è scaduto o sta per
 * scadere, con il pallino dello stato peggiore su ogni riga: le scadenze
 * vengono dalla vista mezzi_scadenze, la stessa che fa partire l'avviso
 * giornaliero. Le attrezzature a quantità (ponteggi, transenne) mostrano quanto
 * è montato e quanto resta in magazzino. Dall'ufficio si scansiona un QR, si
 * stampano le etichette, si fa l'inventario.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ChevronRight, ClipboardCheck, Loader2, Plus, QrCode, Search, Settings2, Truck, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  useCopertineMezzi, useCostiParco, useMezzi, useMezziCategorie, useMezziDisponibilita, useMezziScadenze,
  useSegnalazioniAperte, useUltimeViste,
} from "@/hooks/useMezzi";
import { formatCurrency } from "@/lib/formatters";
import { MezzoFormDialog } from "@/components/mezzi/MezzoFormDialog";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import { ScansionaMezzoButton } from "@/components/mezzi/ScansionaMezzo";
import { EtichetteQrDialog } from "@/components/mezzi/EtichetteQrDialog";
import { CategorieAttrezziDialog } from "@/components/mezzi/CategorieAttrezziDialog";
import {
  STATO_SCADENZA_BADGE, TIPI_VEICOLO, classeDi, costoAnnuoMezzo, descriviScadenza, formatContatore, formatData,
  formatQuantita, giorniTra, giornoItaliano, oggiIso, statoMezzo, statoPeggiore, tipoMezzoLabel, tipoSegnalazioneLabel,
  type MezzoClasse, type MezzoConAssegnazione, type MezzoDisponibilita, type MezzoScadenza,
} from "@/types/mezzi";
import { cn } from "@/lib/utils";

const TUTTI = "__tutti__";
const SENZA = "__senza__";
const PALLINO: Record<string, string> = {
  scaduto: "bg-red-500",
  in_scadenza: "bg-amber-400",
  valido: "bg-emerald-500",
};
/** Oltre questi giorni senza una lettura del QR, l'attrezzo si segnala come «non visto». */
const GIORNI_NON_VISTO = 60;

const classeMezzo = (m: Pick<MezzoConAssegnazione, "classe" | "tipo">): MezzoClasse => m.classe ?? classeDi(m.tipo);

/**
 * `incorporata`: dentro Manodopera e Mezzi il titolo lo dà la pagina che la
 * contiene; qui restano la frase e il bottone.
 */
export default function MezziList({ incorporata = false }: { incorporata?: boolean } = {}) {
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoModificare = (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const companyId = useEffectiveCompanyId();
  const { effectiveCompany, company } = useAuth();
  const nomeAzienda = (effectiveCompany ?? company)?.name ?? "";

  const [searchParams, setSearchParams] = useSearchParams();
  const vista: MezzoClasse = searchParams.get("vista") === "attrezzature" ? "attrezzatura" : "mezzo";
  const codiceNuovo = searchParams.get("nuovo");

  const { data: mezzi = [], isLoading, error, refetch } = useMezzi();
  const { data: scadenze = [] } = useMezziScadenze();
  const { data: segnalazioni = [] } = useSegnalazioniAperte();
  const { data: costiParco } = useCostiParco();
  const { data: categorie = [] } = useMezziCategorie();
  const { data: disponibilita } = useMezziDisponibilita();
  const { data: ultimeViste } = useUltimeViste();
  const { data: copertine } = useCopertineMezzi(mezzi.map((m) => m.foto_path ?? "").filter(Boolean));

  const [cerca, setCerca] = useState("");
  const [filtri, setFiltri] = useState<Record<MezzoClasse, string>>({ mezzo: TUTTI, attrezzatura: TUTTI });
  const [nuovo, setNuovo] = useState<{ codice: string | null } | null>(() => (codiceNuovo ? { codice: codiceNuovo } : null));
  const [tutteLeScadenze, setTutteLeScadenze] = useState(false);
  const [etichette, setEtichette] = useState(false);
  const [gestisciCategorie, setGestisciCategorie] = useState(false);

  const filtro = filtri[vista];
  const setFiltro = (v: string) => setFiltri((f) => ({ ...f, [vista]: v }));

  const cambiaVista = (v: MezzoClasse) => {
    const next = new URLSearchParams(searchParams);
    if (v === "attrezzatura") next.set("vista", "attrezzature");
    else next.delete("vista");
    next.delete("nuovo");
    setSearchParams(next, { replace: true });
  };

  const classePerId = useMemo(() => new Map(mezzi.map((m) => [m.id, classeMezzo(m)])), [mezzi]);
  const diQuesti = useMemo(() => mezzi.filter((m) => classeMezzo(m) === vista), [mezzi, vista]);
  const quanti = useMemo(() => {
    const c = { mezzo: 0, attrezzatura: 0 };
    for (const m of mezzi) c[classeMezzo(m)] += 1;
    return c;
  }, [mezzi]);

  const daControllareTutti = useMemo(
    () =>
      scadenze
        .filter((s) => s.stato === "scaduto" || s.stato === "in_scadenza")
        .sort((a, b) =>
          a.stato !== b.stato
            ? a.stato === "scaduto" ? -1 : 1
            : (a.data_scadenza ?? "9999").localeCompare(b.data_scadenza ?? "9999"),
        ),
    [scadenze],
  );
  const daControllare = daControllareTutti.filter((s) => classePerId.get(s.mezzo_id) === vista);

  const perMezzo = useMemo(() => {
    const m = new Map<string, MezzoScadenza[]>();
    for (const s of scadenze) (m.get(s.mezzo_id) ?? m.set(s.mezzo_id, []).get(s.mezzo_id)!).push(s);
    return m;
  }, [scadenze]);

  const nomeMezzo = useMemo(() => new Map(mezzi.map((m) => [m.id, m.targa ? `${m.nome} · ${m.targa}` : m.nome])), [mezzi]);
  const guastiTutti = useMemo(
    () => segnalazioni.filter((s) => s.tipo !== "km" && nomeMezzo.has(s.mezzo_id)),
    [segnalazioni, nomeMezzo],
  );
  const guasti = guastiTutti.filter((g) => classePerId.get(g.mezzo_id) === vista);
  const guastiPerMezzo = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of segnalazioni) if (g.tipo !== "km") m.set(g.mezzo_id, (m.get(g.mezzo_id) ?? 0) + 1);
    return m;
  }, [segnalazioni]);

  // Il pallino rosso sulla scheda dell'altro elenco: qualcosa da vedere anche lì.
  const problemi = useMemo(() => {
    const c = { mezzo: 0, attrezzatura: 0 };
    for (const s of daControllareTutti) { const k = classePerId.get(s.mezzo_id); if (k) c[k] += 1; }
    for (const g of guastiTutti) { const k = classePerId.get(g.mezzo_id); if (k) c[k] += 1; }
    return c;
  }, [daControllareTutti, guastiTutti, classePerId]);

  const categorieAttrezzi = useMemo(() => categorie.filter((c) => c.classe === "attrezzatura"), [categorie]);
  const nomeCategoria = useMemo(() => new Map(categorieAttrezzi.map((c) => [c.id, c.nome])), [categorieAttrezzi]);
  const conteggiCategorie = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of mezzi) if (a.categoria_id) m.set(a.categoria_id, (m.get(a.categoria_id) ?? 0) + 1);
    return m;
  }, [mezzi]);

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return diQuesti.filter((m) => {
      if (filtro !== TUTTI) {
        if (vista === "mezzo" && m.tipo !== filtro) return false;
        if (vista === "attrezzatura" && (filtro === SENZA ? !!m.categoria_id && nomeCategoria.has(m.categoria_id) : m.categoria_id !== filtro)) return false;
      }
      if (!q) return true;
      return [m.nome, m.targa, m.marca, m.modello, m.matricola, m.codice, m.assegnato_persona, m.assegnato_commessa,
        m.categoria_id ? nomeCategoria.get(m.categoria_id) : null]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [diQuesti, cerca, filtro, vista, nomeCategoria]);

  // Gruppi: i mezzi per tipo, le attrezzature per categoria (nell'ordine scelto dall'azienda).
  const gruppi = useMemo(() => {
    if (vista === "mezzo") {
      return TIPI_VEICOLO
        .map((t) => ({ chiave: t.value, titolo: t.label, righe: filtrati.filter((m) => m.tipo === t.value) }))
        .filter((g) => g.righe.length > 0);
    }
    const out = categorieAttrezzi
      .map((c) => ({ chiave: c.id, titolo: c.nome, righe: filtrati.filter((m) => m.categoria_id === c.id) }))
      .filter((g) => g.righe.length > 0);
    const senza = filtrati.filter((m) => !m.categoria_id || !nomeCategoria.has(m.categoria_id));
    if (senza.length) out.push({ chiave: SENZA, titolo: "Senza categoria", righe: senza });
    return out;
  }, [vista, filtrati, categorieAttrezzi, nomeCategoria]);

  const visibili = tutteLeScadenze ? daControllare : daControllare.slice(0, 5);

  // Il parco in due numeri: quanto vale (acquisti segnati) e quanto costa in un anno (stima).
  const parco = useMemo(() => {
    if (!diQuesti.length) return null;
    const oggi = oggiIso();
    let valore = 0;
    let costoAnno = 0;
    for (const m of diQuesti) {
      valore += Number(m.valore_acquisto ?? 0);
      costoAnno += costoAnnuoMezzo(
        m,
        (costiParco?.documenti ?? []).filter((d) => d.mezzo_id === m.id),
        (costiParco?.manutenzioni ?? []).filter((x) => x.mezzo_id === m.id),
        oggi,
      ).totale;
    }
    return { valore, costoAnno };
  }, [diQuesti, costiParco]);

  const nomeNuovo = vista === "attrezzatura" ? "Nuova attrezzatura" : "Nuovo mezzo";
  const apriNuovo = () => setNuovo({ codice: null });
  const chiudiNuovo = (aperto: boolean) => {
    if (aperto) return;
    setNuovo(null);
    if (codiceNuovo) {
      const next = new URLSearchParams(searchParams);
      next.delete("nuovo");
      setSearchParams(next, { replace: true });
    }
  };

  const azioni = (
    <div className={cn("flex items-center gap-2", incorporata ? "ml-auto max-sm:w-full" : "max-sm:w-full")}>
      <ScansionaMezzoButton onLibero={(codice) => setNuovo({ codice })} />
      {vista === "attrezzatura" && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2 max-sm:h-9 max-sm:w-9 max-sm:p-0"
          onClick={() => navigate("/azienda/mezzi/inventario")}
          aria-label="Inventario"
          title="Inventario con lo scanner"
        >
          <ClipboardCheck className="h-4 w-4 text-orange-600" /><span className="max-sm:hidden">Inventario</span>
        </Button>
      )}
      {puoModificare && diQuesti.length > 0 && (
        <Button size="sm" variant="outline" className="gap-2 max-sm:hidden" onClick={() => setEtichette(true)}>
          <QrCode className="h-4 w-4 text-orange-600" />Etichette QR
        </Button>
      )}
      {puoModificare && (
        <Button
          size="sm"
          onClick={apriNuovo}
          className="gap-2 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:h-9 max-sm:flex-1"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />{nomeNuovo}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {incorporata ? (
        <div className="flex flex-wrap items-center justify-between gap-3 max-sm:gap-2">
          <p className="text-sm text-slate-500 max-sm:hidden">
            {vista === "attrezzatura"
              ? "Attrezzi e ponteggi: dove sono, chi li ha, manutenzioni e verifiche. Con l'etichetta QR si trovano dal telefono."
              : "Assicurazioni, revisioni e tagliandi di furgoni e mezzi d'opera, con l'avviso prima che scadano."}
          </p>
          {azioni}
        </div>
      ) : (
        <div className="flex flex-col gap-3 testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)] sm:h-10 sm:w-10">
              <Truck className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Mezzi e attrezzature</h1>
              <p className="mt-0.5 hidden text-sm text-slate-500 sm:block">
                Furgoni, mezzi e attrezzi: assicurazioni, revisioni e tagliandi, con l'avviso prima che scadano.
              </p>
            </div>
          </div>
          {azioni}
        </div>
      )}

      {/* Due elenchi: mezzi e attrezzature. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/60 p-1 sm:inline-grid sm:w-auto" role="tablist" aria-label="Mezzi o attrezzature">
        {(["mezzo", "attrezzatura"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={vista === c}
            onClick={() => cambiaVista(c)}
            className={cn(
              "relative flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors max-sm:h-8 max-sm:px-2",
              vista === c ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "mezzo" ? <Truck className="h-4 w-4 max-sm:hidden" aria-hidden="true" /> : <Wrench className="h-4 w-4 max-sm:hidden" aria-hidden="true" />}
            {c === "mezzo" ? "Mezzi" : "Attrezzature"}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{quanti[c]}</span>
            {vista !== c && problemi[c] > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" aria-label={`${problemi[c]} da controllare`} />
            )}
          </button>
        ))}
      </div>

      {parco && (
        <p className="px-1 text-sm text-muted-foreground max-sm:hidden">
          {vista === "attrezzatura"
            ? diQuesti.length === 1 ? "1 attrezzatura" : `${diQuesti.length} attrezzature`
            : diQuesti.length === 1 ? "1 mezzo" : `${diQuesti.length} mezzi`}
          {parco.valore > 0 && <> · valore d'acquisto <span className="font-medium text-foreground">{formatCurrency(parco.valore)}</span></>}
          {parco.costoAnno > 0 && <> · costano circa <span className="font-medium text-foreground">{formatCurrency(parco.costoAnno)}</span> l'anno</>}
        </p>
      )}

      {(daControllare.length > 0 || guasti.length > 0) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4" aria-labelledby="da-controllare">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <h2 id="da-controllare" className="text-sm font-semibold text-amber-900">
              Da controllare: {daControllare.length + guasti.length}
            </h2>
          </div>
          <ul className="divide-y divide-amber-200/70">
            {guasti.map((g) => (
              <li key={`guasto-${g.id}`}>
                <Link
                  to={`/azienda/mezzi/${g.mezzo_id}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-amber-100/60"
                >
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{nomeMezzo.get(g.mezzo_id)}</span>
                    <span className="block truncate text-xs text-slate-600">
                      {tipoSegnalazioneLabel(g.tipo)}, {formatData(giornoItaliano(g.created_at))}{g.descrizione ? `: ${g.descrizione}` : ""}
                    </span>
                  </span>
                  <Badge variant="outline" className="shrink-0 border-red-200 bg-red-50 text-[11px] text-red-700">
                    {g.stato === "in_lavorazione" ? "In lavorazione" : "Da vedere"}
                  </Badge>
                </Link>
              </li>
            ))}
            {visibili.map((s) => (
              <li key={`${s.origine}-${s.riferimento_id}`}>
                <Link
                  to={`/azienda/mezzi/${s.mezzo_id}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-amber-100/60"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALLINO[s.stato]}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {s.mezzo_nome}{s.targa ? ` · ${s.targa}` : ""}
                    </span>
                    <span className="block truncate text-xs text-slate-600">{descriviScadenza(s)}</span>
                  </span>
                  <Badge variant="outline" className={`shrink-0 text-[11px] ${STATO_SCADENZA_BADGE[s.stato].cls}`}>
                    {STATO_SCADENZA_BADGE[s.stato].label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
          {daControllare.length > 5 && (
            <button
              type="button"
              className="mt-1 text-sm font-medium text-amber-900 underline underline-offset-2"
              onClick={() => setTutteLeScadenze((v) => !v)}
            >
              {tutteLeScadenze ? "Mostra meno" : `Mostra tutte (${daControllare.length})`}
            </button>
          )}
        </section>
      )}

      {/* Con pochi elementi si vedono tutti: ricerca e filtro servono da sei in su. */}
      {diQuesti.length > 5 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder={vista === "attrezzatura" ? "Cerca nome, codice, persona" : "Cerca nome, targa, persona"}
              className="pl-9"
              aria-label={vista === "attrezzatura" ? "Cerca attrezzature" : "Cerca mezzi"}
            />
          </div>
          <div className="flex gap-2">
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="sm:w-56 max-sm:flex-1" aria-label={vista === "attrezzatura" ? "Filtra per categoria" : "Filtra per tipo"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vista === "attrezzatura" ? (
                  <>
                    <SelectItem value={TUTTI}>Tutte le categorie</SelectItem>
                    {categorieAttrezzi.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    <SelectItem value={SENZA}>Senza categoria</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value={TUTTI}>Tutti i tipi</SelectItem>
                    {TIPI_VEICOLO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </>
                )}
              </SelectContent>
            </Select>
            {vista === "attrezzatura" && puoModificare && (
              <Button variant="outline" size="icon" className="shrink-0 max-sm:hidden" onClick={() => setGestisciCategorie(true)} aria-label="Gestisci le categorie" title="Gestisci le categorie">
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Non riesco a caricare i mezzi.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : diQuesti.length === 0 ? (
        // Telefono: una riga e basta. Anche da tablet niente secondo bottone:
        // il «Nuovo» c'è già in alto.
        <div className="rounded-2xl border border-dashed bg-card px-6 py-14 text-center max-sm:px-3 max-sm:py-5">
          {vista === "attrezzatura"
            ? <Wrench className="mx-auto h-10 w-10 text-muted-foreground/50 max-sm:hidden" aria-hidden="true" />
            : <Truck className="mx-auto h-10 w-10 text-muted-foreground/50 max-sm:hidden" aria-hidden="true" />}
          <h2 className="mt-3 text-base font-semibold max-sm:mt-0 max-sm:text-sm max-sm:font-normal max-sm:text-muted-foreground">
            {vista === "attrezzatura" ? "Nessuna attrezzatura ancora" : "Nessun mezzo ancora"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground max-sm:hidden">
            {vista === "attrezzatura"
              ? "Aggiungi trapani, demolitori, betoniere e i ponteggi a metri quadri: poi stampi le etichette QR e dal cantiere si segna dove li lasciate."
              : "Aggiungi furgoni e mezzi d'opera: poi carichi assicurazione, revisione e tagliandi, e ti avvisiamo prima delle scadenze."}
          </p>
        </div>
      ) : filtrati.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Niente corrisponde alla ricerca.</p>
      ) : (
        <div className="space-y-4 max-sm:space-y-3">
          {gruppi.map((g) => (
            <section key={g.chiave} aria-label={g.titolo}>
              {gruppi.length > 1 && (
                <h3 className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.titolo}<span className="font-normal normal-case tracking-normal">· {g.righe.length}</span>
                </h3>
              )}
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {g.righe.map((m) => (
                  <RigaMezzo
                    key={m.id}
                    mezzo={m}
                    copertina={m.foto_path ? copertine?.get(m.foto_path) : undefined}
                    scadenze={perMezzo.get(m.id) ?? []}
                    nGuasti={guastiPerMezzo.get(m.id) ?? 0}
                    disponibilita={disponibilita?.get(m.id)}
                    ultimaVista={ultimeViste?.get(m.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <MezzoFormDialog
        open={!!nuovo}
        onOpenChange={chiudiNuovo}
        classe={vista}
        codiceIniziale={nuovo?.codice ?? null}
        onSalvato={(id) => navigate(`/azienda/mezzi/${id}`)}
      />
      {companyId && (
        <EtichetteQrDialog
          open={etichette}
          onOpenChange={setEtichette}
          voci={filtrati.map((m) => ({
            id: m.id,
            codice: m.codice ?? null,
            nome: m.nome,
            sotto: m.targa ?? (m.categoria_id ? nomeCategoria.get(m.categoria_id) : null) ?? null,
          }))}
          classe={vista}
          companyId={companyId}
          azienda={nomeAzienda}
        />
      )}
      <CategorieAttrezziDialog open={gestisciCategorie} onOpenChange={setGestisciCategorie} conteggi={conteggiCategorie} />
    </div>
  );
}

function RigaMezzo({ mezzo: m, copertina, scadenze, nGuasti, disponibilita, ultimaVista }: {
  mezzo: MezzoConAssegnazione;
  copertina: string | undefined;
  scadenze: MezzoScadenza[];
  nGuasti: number;
  disponibilita: MezzoDisponibilita | undefined;
  ultimaVista: string | undefined;
}) {
  const peggiore = statoPeggiore(scadenze.map((s) => s.stato));
  const urgente = scadenze
    .filter((s) => s.stato === peggiore && peggiore !== "valido")
    .sort((a, b) => (a.data_scadenza ?? "9999").localeCompare(b.data_scadenza ?? "9999"))[0];
  const stato = statoMezzo(m.stato);
  const aQuantita = m.gestione === "quantita";
  const carico = [m.assegnato_persona, m.assegnato_commessa, m.su_mezzo_nome ? `su ${m.su_mezzo_nome}` : null]
    .filter(Boolean).join(" · ");
  const attrezzo = (m.classe ?? classeDi(m.tipo)) === "attrezzatura";

  let dettaglio: string;
  if (aQuantita) {
    const d = disponibilita;
    dettaglio = d
      ? [
          formatQuantita(d.quantita_totale, m.unita_misura),
          d.in_uso > 0 ? `${formatQuantita(d.in_uso, m.unita_misura)} montati${d.cantieri > 0 ? ` su ${d.cantieri} ${d.cantieri === 1 ? "cantiere" : "cantieri"}` : ""}` : null,
          `${formatQuantita(d.disponibile, m.unita_misura)} in magazzino`,
        ].filter(Boolean).join(" · ")
      : formatQuantita(m.quantita_totale, m.unita_misura);
  } else if (attrezzo) {
    dettaglio = [carico || "In magazzino", m.contatore != null ? formatContatore(m.contatore, m.contatore_unita) : null].filter(Boolean).join(" · ");
  } else {
    dettaglio = [tipoMezzoLabel(m.tipo), m.contatore != null ? formatContatore(m.contatore, m.contatore_unita) : null, carico || null]
      .filter(Boolean).join(" · ");
  }

  // «Non visto da…» solo per gli attrezzi che sono già stati letti almeno una volta:
  // chi non usa le etichette non si ritrova l'elenco pieno di avvisi.
  const giorniNonVisto = attrezzo && ultimaVista ? giorniTra(giornoItaliano(ultimaVista), oggiIso()) : 0;
  const percentuale = aQuantita && disponibilita && disponibilita.quantita_totale > 0
    ? Math.min(100, Math.round((disponibilita.in_uso / disponibilita.quantita_totale) * 100))
    : null;

  return (
    <li>
      <Link
        to={`/azienda/mezzi/${m.id}`}
        className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/30"
      >
        {copertina ? (
          <img src={copertina} alt="" loading="lazy" className="h-10 w-12 shrink-0 rounded-lg border object-cover" />
        ) : (
          <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <IconaMezzo tipo={m.tipo} className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{m.nome}</span>
            {m.targa && <span className="shrink-0 rounded border px-1 font-mono text-[11px] text-slate-600">{m.targa}</span>}
            {attrezzo && m.codice && <span className="shrink-0 rounded border px-1 font-mono text-[11px] text-slate-500 max-sm:hidden">{m.codice}</span>}
            {m.stato !== "in_servizio" && (
              <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[10px] ${stato.cls}`}>{stato.label}</Badge>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{dettaglio}</span>
          {percentuale != null && (
            <span className="mt-1 block h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-emerald-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-orange-400" style={{ width: `${percentuale}%` }} />
            </span>
          )}
          {nGuasti > 0 && (
            <span className="mt-0.5 block truncate text-xs font-medium text-red-700">
              {nGuasti === 1 ? "1 segnalazione dal campo da vedere" : `${nGuasti} segnalazioni dal campo da vedere`}
            </span>
          )}
          {urgente && (
            <span className={`mt-0.5 block truncate text-xs font-medium ${peggiore === "scaduto" ? "text-red-700" : "text-amber-700"}`}>
              {descriviScadenza(urgente)}
            </span>
          )}
          {giorniNonVisto > GIORNI_NON_VISTO && (
            <span className="mt-0.5 block truncate text-xs font-medium text-amber-700">Non visto da {giorniNonVisto} giorni</span>
          )}
        </span>
        {(peggiore || nGuasti > 0) && (
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${PALLINO[nGuasti > 0 ? "scaduto" : peggiore ?? "valido"]}`}
            title={nGuasti > 0 ? "Segnalazioni da vedere" : STATO_SCADENZA_BADGE[peggiore ?? "valido"].label}
            aria-label={nGuasti > 0 ? "Segnalazioni da vedere" : STATO_SCADENZA_BADGE[peggiore ?? "valido"].label}
          />
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
