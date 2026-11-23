// src/components/orders/generali/piano/TabellaVoci.tsx
// Le voci del piano come un foglio di calcolo: ricavi sopra, costi sotto, margine in fondo.
// Colonne: Voce · Categoria · Mese · Mesi · (Commessa) · (Approvato) · Previsto · Reale a oggi ·
// A finire · Stima finale · Scostamento. Il reale si apre e mostra le righe da cui viene.
// Su una versione approvata cambia solo l'«a finire» (è una stima, non il budget).
import { useState } from "react";
import { ChevronRight, Link2, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AgganciaCategorieDialog } from "@/components/orders/generali/piano/AgganciaCategorieDialog";
import {
  CellaDurata,
  CellaImporto,
  CellaMese,
  CellaScelta,
  CellaTesto,
} from "@/components/orders/generali/piano/Celle";
import {
  TONI,
  euro,
  euroSegno,
  nomeMese,
  tonoScostamento,
} from "@/components/orders/generali/piano/formato";
import {
  messaggioPiano,
  useAggiungiVoci,
  useEliminaVoce,
  useModificaVoce,
  type ModificaVoce,
} from "@/hooks/useGeneralePiano";
import type {
  FigliaGenerale,
  ModelloGenerale,
} from "@/lib/orders/commesseGenerali";
import {
  CATEGORIE_COSTO,
  CATEGORIE_PIANO,
  CATEGORIE_RICAVO,
  CHIAVI_REALI,
  categorieDelTipo,
  isCategoriaPiano,
  type CategoriaPiano,
  type TipoVoce,
} from "@/lib/orders/generali/pianoCategorie";
import {
  CATEGORIA_VARIANTI,
  type PianoCalcolato,
  type RigaConfronto,
  type RigaReale,
  type TotaliColonne,
  type VocePiano,
} from "@/lib/orders/generali/pianoConti";
import type { CategoriaAzienda } from "@/lib/orders/generali/pianoLettura";
import { cn } from "@/lib/utils";
import { stimaMancante } from "@/lib/orders/generali/budgetCompletezza";
import { totaliRigheFiltrate } from "@/lib/orders/generali/filtriGrafici";

export interface PropsTabellaVoci {
  generaleId: string;
  modello: ModelloGenerale;
  versioneId: string;
  piano: PianoCalcolato;
  categorieFiltrate?: string[];
  /** Bozza e permesso di modificare: si cambia tutto. */
  modificabile: boolean;
  /** L'a finire si può scrivere anche sull'approvato. */
  aFinireModificabile: boolean;
  /** Si guarda una revisione: c'è la colonna dell'approvato. */
  conApprovato: boolean;
  figlie: FigliaGenerale[];
  categorieAzienda: CategoriaAzienda[];
  onApriRighe: (titolo: string, righe: RigaReale[]) => void;
}

const nomeFiglia = (f: FigliaGenerale) =>
  f.codice ? `${f.codice} · ${f.nome}` : f.nome;

/** Un importo nella tabella: lo zero non si scrive, si lascia la lineetta. */
const cifra = (n: number | null | undefined) =>
  n === null || n === undefined || Math.abs(n) < 0.005 ? "—" : euro(n);
const cifraSegno = (n: number) => (Math.abs(n) < 0.5 ? "—" : euroSegno(n));

/** Una riga che dice qualcosa: un previsto, un reale, un a finire scritto a mano, o reale fuori piano. */
export const rigaPiena = (r: RigaConfronto) =>
  !r.voce ||
  r.previsto > 0.005 ||
  Math.abs(r.reale) > 0.005 ||
  (r.aFinireManuale && Math.abs(r.aFinire) > 0.005);

const ORDINE_CATEGORIE: string[] = [...CATEGORIE_RICAVO, ...CATEGORIE_COSTO];
const nomeCategoria = (c: string) =>
  CATEGORIE_PIANO[c as CategoriaPiano]?.nome ?? CHIAVI_REALI[c] ?? c;

export interface GruppoVoci {
  categoria: string;
  righe: RigaConfronto[];
  piene: RigaConfronto[];
  vuote: RigaConfronto[];
  daStimare: number;
}

/** Le righe per categoria, nell'ordine delle categorie del piano; quelle sconosciute in fondo. */
export function gruppiPerCategoria(righe: readonly RigaConfronto[]): GruppoVoci[] {
  const mappa = new Map<string, RigaConfronto[]>();
  for (const r of righe) mappa.set(r.categoria, [...(mappa.get(r.categoria) ?? []), r]);
  const posto = (c: string) => {
    const i = ORDINE_CATEGORIE.indexOf(c);
    return i < 0 ? ORDINE_CATEGORIE.length : i;
  };
  return [...mappa.entries()]
    .sort(([a], [b]) => posto(a) - posto(b))
    .map(([categoria, rr]) => ({
      categoria,
      righe: rr,
      piene: rr.filter(rigaPiena),
      vuote: rr.filter((r) => !rigaPiena(r)),
      daStimare: rr.filter((r) => r.voce && stimaMancante(r.voce)).length,
    }));
}

function Intestazione({
  testo,
  tono,
  aiuto,
  className,
}: {
  testo: string;
  tono?: keyof typeof TONI;
  aiuto?: string;
  className?: string;
}) {
  const contenuto = (
    <span className="inline-flex items-center gap-1.5">
      {tono && (
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", TONI[tono].punto)}
          aria-hidden="true"
        />
      )}
      {testo}
    </span>
  );
  return (
    <th
      scope="col"
      className={cn("whitespace-nowrap px-2 py-2 font-medium", className)}
    >
      {aiuto ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">{contenuto}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{aiuto}</TooltipContent>
        </Tooltip>
      ) : (
        contenuto
      )}
    </th>
  );
}

export function TabellaVoci(p: PropsTabellaVoci) {
  const { piano, modificabile, conApprovato, figlie } = p;
  const conFiglie = figlie.length > 0;
  const colonne = 9 + (conFiglie ? 1 : 0) + (conApprovato ? 1 : 0) + 1;
  const aggiungi = useAggiungiVoci(p.generaleId, p.versioneId);
  const [aggancia, setAggancia] = useState<VocePiano | null>(null);
  const modifica = useModificaVoce(p.generaleId, p.versioneId);
  // Gruppi aperti o chiusi a mano; senza scelta, aperto il gruppo che ha qualcosa da mostrare.
  const [aperti, setAperti] = useState<Record<string, boolean>>({});
  // Gruppi in cui si vedono anche le voci senza importo.
  const [conVuote, setConVuote] = useState<Record<string, boolean>>({});

  const nuovaVoce = (
    tipo: TipoVoce,
    categoria?: CategoriaPiano,
    descrizione?: string,
  ) => {
    const cat: CategoriaPiano =
      categoria ??
      (tipo === "ricavo"
        ? p.modello === "appalto"
          ? "lavori"
          : "vendite"
        : "altri_costi");
    aggiungi.mutate(
      [
        {
          tipo,
          categoria: cat,
          descrizione: descrizione ?? "",
          importo: 0,
          mese: piano.oggi,
          durataMesi: 1,
        },
      ],
      { onError: (e) => toast.error(messaggioPiano(e, "la voce")) },
    );
  };

  const sezione = (
    tipo: TipoVoce,
    righe: RigaConfronto[],
    totali: TotaliColonne,
  ) => (
    <tbody className="divide-y border-b">
      <tr
        className={`generale-plan-group generale-plan-group--${tipo} bg-muted/40`}
      >
        <th
          colSpan={colonne}
          scope="rowgroup"
          className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {tipo === "ricavo" ? "Ricavi" : "Costi"}
        </th>
      </tr>
      {righe.length === 0 && (
        <tr>
          <td
            colSpan={colonne}
            className="px-3 py-3 text-sm text-muted-foreground"
          >
            {tipo === "ricavo"
              ? "Nessun ricavo nel piano: aggiungi quanto pensi di incassare e quando."
              : "Nessun costo nel piano."}
          </td>
        </tr>
      )}
      {gruppiPerCategoria(righe).map((g, _i, tutti) => {
        const chiave = `${tipo}:${g.categoria}`;
        // Un gruppo solo (i ricavi di un'operazione con sole vendite): niente intestazione.
        const conTesta = tutti.length > 1;
        const aperto = !conTesta || (aperti[chiave] ?? g.piene.length > 0);
        const vuoteVisibili = conVuote[chiave] ?? false;
        const riga = (r: RigaConfronto, vuota = false) => (
          <RigaVoce
            key={r.chiave}
            r={r}
            {...p}
            vuota={vuota}
            conFiglie={conFiglie}
            onAggancia={setAggancia}
            onNuovaDaFuori={nuovaVoce}
          />
        );
        return [
          conTesta && (
            <RigaGruppo
              key={`testa:${chiave}`}
              gruppo={g}
              aperto={aperto}
              onApri={() => setAperti((x) => ({ ...x, [chiave]: !aperto }))}
              conFiglie={conFiglie}
              conApprovato={conApprovato}
              tipo={tipo}
            />
          ),
          ...(aperto ? g.piene.map((r) => riga(r)) : []),
          aperto && g.vuote.length > 0 && (
            <tr key={`vuote:${chiave}`} className="generale-plan-empty-toggle">
              <td colSpan={colonne}>
                <button
                  type="button"
                  aria-expanded={vuoteVisibili}
                  onClick={() => setConVuote((x) => ({ ...x, [chiave]: !vuoteVisibili }))}
                >
                  <ChevronRight aria-hidden="true" />
                  {vuoteVisibili ? "Nascondi" : "Mostra"}{" "}
                  {g.vuote.length === 1 ? "1 voce senza importo" : `${g.vuote.length} voci senza importo`}
                  {g.daStimare > 0 && !vuoteVisibili && (
                    <span className="generale-plan-pill">{g.daStimare} da stimare</span>
                  )}
                </button>
              </td>
            </tr>
          ),
          ...(aperto && vuoteVisibili ? g.vuote.map((r) => riga(r, true)) : []),
        ];
      })}
      {modificabile && !p.categorieFiltrate?.length && (
        <tr>
          <td colSpan={colonne} className="px-2 py-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => nuovaVoce(tipo)}
              disabled={aggiungi.isPending}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />{" "}
              {tipo === "ricavo" ? "Aggiungi un ricavo" : "Aggiungi un costo"}
            </Button>
          </td>
        </tr>
      )}
      <RigaTotale
        etichetta={
          tipo === "ricavo"
            ? "Totale ricavi"
            : p.categorieFiltrate?.length
              ? "Totale costi filtrati"
              : "Totale costi"
        }
        t={totali}
        tipo={tipo}
        conFiglie={conFiglie}
        conApprovato={conApprovato}
      />
    </tbody>
  );

  const { totali } = piano.confronto;
  const filtro = p.categorieFiltrate ?? [];
  const costi = filtro.length
    ? piano.confronto.costi.filter((r) => filtro.includes(r.categoria))
    : piano.confronto.costi;
  return (
    <TooltipProvider delayDuration={300}>
      <div className="generale-plan-table overflow-x-auto rounded-lg border bg-card" role="region" aria-label="Voci del piano" tabIndex={0}>
        <table className="w-full min-w-[68rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <Intestazione testo="Voce" className="min-w-[15rem] px-3" />
              <Intestazione
                testo="Categoria"
                className="min-w-[9.5rem]"
                aiuto="La categoria decide quali costi e ricavi registrati finiscono in questa voce."
              />
              <Intestazione
                testo="Mese"
                className="min-w-[6.5rem]"
                aiuto="Il mese in cui il denaro entra o esce. Serve al flusso di cassa e al rendimento."
              />
              <Intestazione
                testo="Mesi"
                className="w-14 text-right"
                aiuto="Su quanti mesi si divide l'importo, in parti uguali."
              />
              {conFiglie && (
                <Intestazione
                  testo="Commessa"
                  className="min-w-[7rem]"
                  aiuto="Facoltativa: la voce raccoglie solo il reale di quella commessa."
                />
              )}
              {conApprovato && (
                <Intestazione
                  testo="Approvato"
                  className="text-right"
                  aiuto="L'importo nella versione approvata, per confronto."
                />
              )}
              <Intestazione
                testo="Previsto"
                tono="previsto"
                className="text-right"
              />
              <Intestazione
                testo="Reale a oggi"
                tono="reale"
                className="text-right"
                aiuto="Costi e fatture già registrati sulla generale e sulle sue commesse. Tocca il numero per vedere le righe."
              />
              <Intestazione
                testo="A finire"
                tono="aFinire"
                className="text-right"
                aiuto="Quanto manca. Vuoto = previsto meno reale; scrivilo tu se sai che sarà diverso."
              />
              <Intestazione
                testo="Stima finale"
                tono="stima"
                className="text-right"
                aiuto="Reale a oggi più a finire."
              />
              <Intestazione
                testo="Scostamento"
                className="text-right"
                aiuto="Stima finale meno previsto."
              />
              <th className="w-10 px-1">
                <span className="sr-only">Azioni</span>
              </th>
            </tr>
          </thead>
          {!filtro.length &&
            sezione("ricavo", piano.confronto.ricavi, totali.ricavi)}
          {sezione(
            "costo",
            costi,
            filtro.length ? totaliRigheFiltrate(costi) : totali.costi,
          )}
          {!filtro.length && (
            <tfoot>
              <RigaTotale
                etichetta="Margine"
                t={totali.margine}
                tipo="margine"
                conFiglie={conFiglie}
                conApprovato={conApprovato}
                forte
              />
            </tfoot>
          )}
        </table>
        {piano.confronto.vociTolte.length > 0 && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Rispetto all'approvato questa revisione toglie:{" "}
            {piano.confronto.vociTolte
              .map(
                (v) =>
                  `${v.descrizione || CATEGORIE_PIANO[v.categoria].nome} (${euro(v.importo)})`,
              )
              .join(", ")}
            .
          </p>
        )}
        {aggancia && (
          <AgganciaCategorieDialog
            voce={aggancia}
            categorie={p.categorieAzienda}
            onClose={() => setAggancia(null)}
            onSalva={(categorieCosto) =>
              modifica.mutate(
                { id: aggancia.id, modifica: { categorieCosto } },
                {
                  onSuccess: () => {
                    toast.success(
                      "Categorie agganciate: il reale è stato riclassificato",
                    );
                    setAggancia(null);
                  },
                  onError: (e) => toast.error(messaggioPiano(e, "la voce")),
                },
              )
            }
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function RigaTotale({
  etichetta,
  t,
  tipo,
  conFiglie,
  conApprovato,
  forte,
}: {
  etichetta: string;
  t: TotaliColonne;
  tipo: TipoVoce | "margine";
  conFiglie: boolean;
  conApprovato: boolean;
  forte?: boolean;
}) {
  return (
    <tr
      className={cn("bg-muted/30 font-medium", forte && "border-t-2 text-base")}
    >
      <td className="px-3 py-2" colSpan={conFiglie ? 5 : 4}>
        {etichetta}
      </td>
      {conApprovato && (
        <td className="px-2 py-2 text-right tabular-nums">
          {euro(t.approvato)}
        </td>
      )}
      <td className="px-2 py-2 text-right tabular-nums">{cifra(t.previsto)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", TONI.reale.testo)}>
        {cifra(t.reale)}
      </td>
      <td
        className={cn("px-2 py-2 text-right tabular-nums", TONI.aFinire.testo)}
      >
        {cifra(t.aFinire)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">
        {cifra(t.stima)}
      </td>
      <td
        className={cn(
          "px-2 py-2 text-right tabular-nums",
          tonoScostamento(t.scostamento, tipo),
        )}
      >
        {cifraSegno(t.scostamento)}
      </td>
      <td />
    </tr>
  );
}

/** L'intestazione di una categoria: nome, quante voci, e i totali del gruppo. Si apre e si chiude. */
function RigaGruppo({
  gruppo,
  aperto,
  onApri,
  conFiglie,
  conApprovato,
  tipo,
}: {
  gruppo: GruppoVoci;
  aperto: boolean;
  onApri: () => void;
  conFiglie: boolean;
  conApprovato: boolean;
  tipo: TipoVoce;
}) {
  const t = totaliRigheFiltrate(gruppo.righe);
  const n = gruppo.righe.length;
  return (
    <tr className="generale-plan-cat" data-aperto={aperto || undefined}>
      <th scope="rowgroup" colSpan={conFiglie ? 5 : 4} className="text-left">
        <button type="button" aria-expanded={aperto} onClick={onApri}>
          <ChevronRight aria-hidden="true" />
          <span className="generale-plan-cat-name">{nomeCategoria(gruppo.categoria)}</span>
          <span className="generale-plan-cat-count">
            {n === 1 ? "1 voce" : `${n} voci`}
          </span>
          {gruppo.daStimare > 0 && (
            <span className="generale-plan-pill">{gruppo.daStimare} da stimare</span>
          )}
        </button>
      </th>
      {conApprovato && <td className="text-right tabular-nums">{cifra(t.approvato)}</td>}
      <td className="text-right tabular-nums">{cifra(t.previsto)}</td>
      <td className={cn("text-right tabular-nums", TONI.reale.testo)}>{cifra(t.reale)}</td>
      <td className={cn("text-right tabular-nums", TONI.aFinire.testo)}>{cifra(t.aFinire)}</td>
      <td className="text-right tabular-nums font-semibold">{cifra(t.stima)}</td>
      <td className={cn("text-right tabular-nums", tonoScostamento(t.scostamento, tipo))}>
        {cifraSegno(t.scostamento)}
      </td>
      <td />
    </tr>
  );
}

function RigaVoce({
  r,
  vuota = false,
  conFiglie,
  onAggancia,
  onNuovaDaFuori,
  ...p
}: PropsTabellaVoci & {
  r: RigaConfronto;
  /** Voce senza importo, mostrata su richiesta: si vede più chiara. */
  vuota?: boolean;
  conFiglie: boolean;
  onAggancia: (v: VocePiano) => void;
  onNuovaDaFuori: (
    tipo: TipoVoce,
    categoria?: CategoriaPiano,
    descrizione?: string,
  ) => void;
}) {
  const modifica = useModificaVoce(p.generaleId, p.versioneId);
  const elimina = useEliminaVoce(p.generaleId, p.versioneId);
  const v = r.voce;
  const meseNonNecessario =
    !!v &&
    !stimaMancante(v) &&
    v.importo === 0 &&
    r.reale === 0 &&
    r.aFinire === 0;
  const salva = (m: ModificaVoce) => {
    if (!v) return;
    modifica.mutate(
      { id: v.id, modifica: m },
      { onError: (e) => toast.error(messaggioPiano(e, "la voce")) },
    );
  };
  const apriReale = () =>
    r.righe.length > 0 &&
    p.onApriRighe(`${r.etichetta} · reale a oggi`, r.righe);
  const reale = (
    <td className="px-2 py-1 text-right tabular-nums">
      {r.righe.length > 0 ? (
        <button
          type="button"
          onClick={apriReale}
          className={cn(
            "rounded px-1 underline-offset-2 hover:underline",
            TONI.reale.testo,
          )}
        >
          {euro(r.reale)}
        </button>
      ) : (
        <span className="px-1 text-muted-foreground">—</span>
      )}
    </td>
  );
  const fineRiga = (
    <>
      <td className="px-2 py-1 text-right tabular-nums font-medium">
        {cifra(r.stima)}
      </td>
      <td
        className={cn(
          "px-2 py-1 text-right tabular-nums",
          tonoScostamento(r.scostamento, r.tipo),
        )}
      >
        {cifraSegno(r.scostamento)}
      </td>
    </>
  );

  if (!v && r.categoria === CATEGORIA_VARIANTI) {
    // Varianti accettate dagli acquirenti: non erano nel piano, entrano a finire (scheda Unità).
    return (
      <tr className="bg-sky-50/40 dark:bg-sky-500/5">
        <td
          className="px-3 py-1.5 text-muted-foreground"
          colSpan={conFiglie ? 5 : 4}
        >
          {r.etichetta}
        </td>
        {p.conApprovato && (
          <td className="px-2 py-1 text-right text-muted-foreground">—</td>
        )}
        <td className="px-2 py-1 text-right text-muted-foreground">—</td>
        {reale}
        <td className="px-2 py-1 text-right tabular-nums">{cifra(r.aFinire)}</td>
        {fineRiga}
        <td className="px-1 py-1" />
      </tr>
    );
  }

  if (!v) {
    // Reale che nessuna voce raccoglie: si vede, è contato, e si può dargli una voce.
    const categoria =
      isCategoriaPiano(r.categoria) &&
      CATEGORIE_PIANO[r.categoria].tipo === r.tipo
        ? r.categoria
        : undefined;
    return (
      <tr className="bg-amber-50/40 dark:bg-amber-500/5">
        <td
          className="px-3 py-1.5 italic text-muted-foreground"
          colSpan={conFiglie ? 5 : 4}
        >
          {r.etichetta}
        </td>
        {p.conApprovato && (
          <td className="px-2 py-1 text-right text-muted-foreground">—</td>
        )}
        <td className="px-2 py-1 text-right text-muted-foreground">—</td>
        {reale}
        <td className="px-2 py-1 text-right text-muted-foreground">—</td>
        {fineRiga}
        <td className="px-1 py-1">
          {p.modificabile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Crea una voce per ${r.etichetta}`}
                  onClick={() =>
                    onNuovaDaFuori(
                      r.tipo,
                      categoria,
                      CHIAVI_REALI[r.categoria] ?? "",
                    )
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Crea una voce che raccolga queste righe
              </TooltipContent>
            </Tooltip>
          )}
        </td>
      </tr>
    );
  }

  const nome = r.etichetta;
  const scelteCategoria = categorieDelTipo(v.tipo).map((c) => ({
    valore: c.id,
    nome: c.nome,
  }));
  const scelteFiglia = [
    { valore: "__tutte", nome: "Tutte" },
    ...p.figlie.map((f) => ({ valore: f.id, nome: nomeFiglia(f) })),
  ];
  const agganciate = v.categorieCosto.length;
  // Spese registrate su una voce senza previsto: il budget non le copre ancora.
  const senzaPrevisto = v.tipo === "costo" && r.previsto < 0.005 && r.reale > 0.005;
  return (
    <tr className={cn("generale-plan-voce hover:bg-muted/30", vuota && "generale-plan-row--empty")}>
      <td className="px-2 py-1">
        {p.modificabile ? (
          <CellaTesto
            valore={v.descrizione}
            etichetta={`Descrizione di ${nome}`}
            placeholder={CATEGORIE_PIANO[v.categoria].nome}
            onSalva={(descrizione) => salva({ descrizione })}
          />
        ) : (
          <span className="px-1.5">{nome}</span>
        )}
        {agganciate > 0 && (
          <p className="px-1.5 text-[11px] text-muted-foreground">
            <Link2 className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
            {agganciate === 1
              ? "1 categoria agganciata"
              : `${agganciate} categorie agganciate`}
          </p>
        )}
      </td>
      <td className="px-1 py-1">
        {p.modificabile ? (
          <CellaScelta
            valore={v.categoria}
            scelte={scelteCategoria}
            etichetta={`Categoria di ${nome}`}
            className="max-w-[9.5rem]"
            onSalva={(categoria) => salva({ categoria })}
          />
        ) : (
          <span className="px-1.5">{CATEGORIE_PIANO[v.categoria].nome}</span>
        )}
      </td>
      <td className="px-1 py-1">
        {p.modificabile ? (
          <CellaMese
            valore={v.mese}
            partenza={p.piano.oggi}
            etichetta={`Mese di ${nome}`}
            onSalva={(mese) => salva({ mese })}
          />
        ) : (
          <span
            className={cn(
              "whitespace-nowrap px-1.5",
              !v.mese &&
                !meseNonNecessario &&
                "text-amber-700 dark:text-amber-400",
            )}
          >
            {v.mese
              ? nomeMese(v.mese)
              : meseNonNecessario
                ? "Non necessario"
                : "manca"}
          </span>
        )}
      </td>
      <td className="px-1 py-1">
        {p.modificabile ? (
          <CellaDurata
            valore={v.durataMesi}
            etichetta={`Durata in mesi di ${nome}`}
            onSalva={(durataMesi) => salva({ durataMesi })}
          />
        ) : (
          <span className="block px-1.5 text-right tabular-nums">
            {v.durataMesi}
          </span>
        )}
      </td>
      {conFiglie && (
        <td className="px-1 py-1">
          {p.modificabile ? (
            <CellaScelta
              valore={v.figliaId ?? "__tutte"}
              scelte={scelteFiglia}
              etichetta={`Commessa di ${nome}`}
              className="max-w-[12rem]"
              onSalva={(x) => salva({ figliaId: x === "__tutte" ? null : x })}
            />
          ) : (
            <span className="px-1.5 text-muted-foreground">
              {p.figlie.find((f) => f.id === v.figliaId)?.codice ??
                (v.figliaId ? "—" : "Tutte")}
            </span>
          )}
        </td>
      )}
      {p.conApprovato && (
        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
          {r.approvato === null ? (
            <span className="text-xs">nuova</span>
          ) : (
            euro(r.approvato)
          )}
        </td>
      )}
      <td className="px-1 py-1">
        {p.modificabile ? (
          <>
            <CellaImporto
              valore={stimaMancante(v) || v.importo === 0 ? null : v.importo}
              etichetta={`Previsto di ${nome}`}
              onSalva={(importo) => {
                if (importo !== null) salva({ importo });
              }}
            />
            {senzaPrevisto ? (
              <span className="generale-plan-cell-note">senza previsto</span>
            ) : stimaMancante(v) ? (
              <span className="generale-plan-cell-note">da stimare</span>
            ) : null}
          </>
        ) : (
          <>
            <span className="block px-1.5 text-right tabular-nums">
              {stimaMancante(v) ? "Da stimare" : cifra(v.importo)}
            </span>
            {senzaPrevisto && <span className="generale-plan-cell-note">senza previsto</span>}
          </>
        )}
      </td>
      {reale}
      <td className="px-1 py-1">
        {p.aFinireModificabile ? (
          <>
            <CellaImporto
              valore={v.aFinire}
              vuotoPermesso
              suggerito={Math.abs(r.aFinire) < 0.005 ? undefined : r.aFinire}
              etichetta={`A finire di ${nome}`}
              className={TONI.aFinire.testo}
              onSalva={(aFinire) => salva({ aFinire })}
            />
            {r.aFinireManuale && r.reale > 0 && r.aFinire > 0 && (
              <span className="block px-1 text-right text-[11px] leading-tight text-amber-800 dark:text-amber-300"
                title={`Verifica se i ${euro(r.reale)} già registrati sono compresi nel residuo manuale.`}>
                Manuale · verifica
              </span>
            )}
          </>
        ) : (
          <span
            className={cn(
              "block px-1.5 text-right tabular-nums",
              TONI.aFinire.testo,
            )}
          >
            {cifra(r.aFinire)}
          </span>
        )}
      </td>
      {fineRiga}
      <td className="px-1 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Azioni per ${nome}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={apriReale}
              disabled={r.righe.length === 0}
            >
              Vedi le righe del reale
            </DropdownMenuItem>
            {p.modificabile && v.tipo === "costo" && (
              <DropdownMenuItem onClick={() => onAggancia(v)}>
                <Link2 className="mr-2 h-4 w-4" /> Aggancia categorie di costo…
              </DropdownMenuItem>
            )}
            {p.aFinireModificabile && v.aFinire !== null && (
              <DropdownMenuItem onClick={() => salva({ aFinire: null })}>
                <RotateCcw className="mr-2 h-4 w-4" /> A finire calcolato
                (previsto − reale)
              </DropdownMenuItem>
            )}
            {p.modificabile && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={elimina.isPending}
                  onClick={() =>
                    elimina.mutate(v.id, {
                      onSuccess: () =>
                        toast.success(`«${nome}» tolta dal piano`),
                      onError: (e) => toast.error(messaggioPiano(e, "la voce")),
                    })
                  }
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Togli dal piano
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
