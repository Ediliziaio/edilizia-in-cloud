// src/components/orders/generali/piano/TabellaVoci.tsx
// Le voci del piano come un foglio di calcolo: ricavi sopra, costi sotto, margine in fondo.
// Colonne: Voce · Categoria · Mese · Mesi · (Commessa) · (Approvato) · Previsto · Reale a oggi ·
// A finire · Stima finale · Scostamento. Il reale si apre e mostra le righe da cui viene.
// Su una versione approvata cambia solo l'«a finire» (è una stima, non il budget).
import { useState } from "react";
import { Link2, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AgganciaCategorieDialog } from "@/components/orders/generali/piano/AgganciaCategorieDialog";
import { CellaDurata, CellaImporto, CellaMese, CellaScelta, CellaTesto } from "@/components/orders/generali/piano/Celle";
import { TONI, euro, euroSegno, nomeMese, tonoScostamento } from "@/components/orders/generali/piano/formato";
import { messaggioPiano, useAggiungiVoci, useEliminaVoce, useModificaVoce, type ModificaVoce } from "@/hooks/useGeneralePiano";
import type { FigliaGenerale, ModelloGenerale } from "@/lib/orders/commesseGenerali";
import {
  CATEGORIE_PIANO, CHIAVI_REALI, categorieDelTipo, isCategoriaPiano,
  type CategoriaPiano, type TipoVoce,
} from "@/lib/orders/generali/pianoCategorie";
import type { PianoCalcolato, RigaConfronto, RigaReale, TotaliColonne, VocePiano } from "@/lib/orders/generali/pianoConti";
import type { CategoriaAzienda } from "@/lib/orders/generali/pianoLettura";
import { cn } from "@/lib/utils";

export interface PropsTabellaVoci {
  generaleId: string;
  modello: ModelloGenerale;
  versioneId: string;
  piano: PianoCalcolato;
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

const nomeFiglia = (f: FigliaGenerale) => (f.codice ? `${f.codice} · ${f.nome}` : f.nome);

function Intestazione({ testo, tono, aiuto, className }: { testo: string; tono?: keyof typeof TONI; aiuto?: string; className?: string }) {
  const contenuto = (
    <span className="inline-flex items-center gap-1.5">
      {tono && <span className={cn("h-2 w-2 shrink-0 rounded-full", TONI[tono].punto)} aria-hidden="true" />}
      {testo}
    </span>
  );
  return (
    <th scope="col" className={cn("whitespace-nowrap px-2 py-2 font-medium", className)}>
      {aiuto ? (
        <Tooltip>
          <TooltipTrigger asChild><span className="cursor-help">{contenuto}</span></TooltipTrigger>
          <TooltipContent className="max-w-xs">{aiuto}</TooltipContent>
        </Tooltip>
      ) : contenuto}
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

  const nuovaVoce = (tipo: TipoVoce, categoria?: CategoriaPiano, descrizione?: string) => {
    const cat: CategoriaPiano = categoria ?? (tipo === "ricavo" ? (p.modello === "appalto" ? "lavori" : "vendite") : "altri_costi");
    aggiungi.mutate(
      [{ tipo, categoria: cat, descrizione: descrizione ?? "", importo: 0, mese: piano.oggi, durataMesi: 1 }],
      { onError: (e) => toast.error(messaggioPiano(e, "la voce")) },
    );
  };

  const sezione = (tipo: TipoVoce, righe: RigaConfronto[], totali: TotaliColonne) => (
    <tbody className="divide-y border-b">
      <tr className="bg-muted/40">
        <th colSpan={colonne} scope="rowgroup" className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {tipo === "ricavo" ? "Ricavi" : "Costi"}
        </th>
      </tr>
      {righe.length === 0 && (
        <tr>
          <td colSpan={colonne} className="px-3 py-3 text-sm text-muted-foreground">
            {tipo === "ricavo" ? "Nessun ricavo nel piano: aggiungi quanto pensi di incassare e quando." : "Nessun costo nel piano."}
          </td>
        </tr>
      )}
      {righe.map((r) => (
        <RigaVoce key={r.chiave} r={r} {...p} conFiglie={conFiglie} onAggancia={setAggancia} onNuovaDaFuori={nuovaVoce} />
      ))}
      {modificabile && (
        <tr>
          <td colSpan={colonne} className="px-2 py-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => nuovaVoce(tipo)} disabled={aggiungi.isPending}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {tipo === "ricavo" ? "Aggiungi un ricavo" : "Aggiungi un costo"}
            </Button>
          </td>
        </tr>
      )}
      <RigaTotale etichetta={tipo === "ricavo" ? "Totale ricavi" : "Totale costi"} t={totali} tipo={tipo} conFiglie={conFiglie} conApprovato={conApprovato} />
    </tbody>
  );

  const { totali } = piano.confronto;
  return (
    <TooltipProvider delayDuration={300}>
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[68rem] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <Intestazione testo="Voce" className="min-w-[14rem] px-3" />
            <Intestazione testo="Categoria" className="min-w-[11rem]" aiuto="La categoria decide quali costi e ricavi registrati finiscono in questa voce." />
            <Intestazione testo="Mese" className="w-28" aiuto="Il mese in cui il denaro entra o esce. Serve al flusso di cassa e al rendimento." />
            <Intestazione testo="Mesi" className="w-14 text-right" aiuto="Su quanti mesi si divide l'importo, in parti uguali." />
            {conFiglie && <Intestazione testo="Commessa" className="min-w-[9rem]" aiuto="Facoltativa: la voce raccoglie solo il reale di quella commessa." />}
            {conApprovato && <Intestazione testo="Approvato" className="text-right" aiuto="L'importo nella versione approvata, per confronto." />}
            <Intestazione testo="Previsto" tono="previsto" className="text-right" />
            <Intestazione testo="Reale a oggi" tono="reale" className="text-right" aiuto="Costi e fatture già registrati sulla generale e sulle sue commesse. Tocca il numero per vedere le righe." />
            <Intestazione testo="A finire" tono="aFinire" className="text-right" aiuto="Quanto manca. Vuoto = previsto meno reale; scrivilo tu se sai che sarà diverso." />
            <Intestazione testo="Stima finale" tono="stima" className="text-right" aiuto="Reale a oggi più a finire." />
            <Intestazione testo="Scostamento" className="text-right" aiuto="Stima finale meno previsto." />
            <th className="w-10 px-1"><span className="sr-only">Azioni</span></th>
          </tr>
        </thead>
        {sezione("ricavo", piano.confronto.ricavi, totali.ricavi)}
        {sezione("costo", piano.confronto.costi, totali.costi)}
        <tbody>
          <RigaTotale etichetta="Margine" t={totali.margine} tipo="margine" conFiglie={conFiglie} conApprovato={conApprovato} forte />
        </tbody>
      </table>
      {piano.confronto.vociTolte.length > 0 && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Rispetto all'approvato questa revisione toglie: {piano.confronto.vociTolte.map((v) => `${v.descrizione || CATEGORIE_PIANO[v.categoria].nome} (${euro(v.importo)})`).join(", ")}.
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
                onSuccess: () => { toast.success("Categorie agganciate: il reale è stato riclassificato"); setAggancia(null); },
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

function RigaTotale({ etichetta, t, tipo, conFiglie, conApprovato, forte }: {
  etichetta: string; t: TotaliColonne; tipo: TipoVoce | "margine"; conFiglie: boolean; conApprovato: boolean; forte?: boolean;
}) {
  return (
    <tr className={cn("bg-muted/30 font-medium", forte && "border-t-2 text-base")}>
      <td className="px-3 py-2" colSpan={conFiglie ? 5 : 4}>{etichetta}</td>
      {conApprovato && <td className="px-2 py-2 text-right tabular-nums">{euro(t.approvato)}</td>}
      <td className="px-2 py-2 text-right tabular-nums">{euro(t.previsto)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", TONI.reale.testo)}>{euro(t.reale)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", TONI.aFinire.testo)}>{euro(t.aFinire)}</td>
      <td className="px-2 py-2 text-right tabular-nums font-semibold">{euro(t.stima)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", tonoScostamento(t.scostamento, tipo))}>{euroSegno(t.scostamento)}</td>
      <td />
    </tr>
  );
}

function RigaVoce({ r, conFiglie, onAggancia, onNuovaDaFuori, ...p }: PropsTabellaVoci & {
  r: RigaConfronto;
  conFiglie: boolean;
  onAggancia: (v: VocePiano) => void;
  onNuovaDaFuori: (tipo: TipoVoce, categoria?: CategoriaPiano, descrizione?: string) => void;
}) {
  const modifica = useModificaVoce(p.generaleId, p.versioneId);
  const elimina = useEliminaVoce(p.generaleId, p.versioneId);
  const v = r.voce;
  const salva = (m: ModificaVoce) => {
    if (!v) return;
    modifica.mutate({ id: v.id, modifica: m }, { onError: (e) => toast.error(messaggioPiano(e, "la voce")) });
  };
  const apriReale = () => r.righe.length > 0 && p.onApriRighe(`${r.etichetta} · reale a oggi`, r.righe);
  const reale = (
    <td className="px-2 py-1 text-right tabular-nums">
      {r.righe.length > 0 ? (
        <button type="button" onClick={apriReale} className={cn("rounded px-1 underline-offset-2 hover:underline", TONI.reale.testo)}>
          {euro(r.reale)}
        </button>
      ) : (
        <span className="px-1 text-muted-foreground">—</span>
      )}
    </td>
  );
  const fineRiga = (
    <>
      <td className="px-2 py-1 text-right tabular-nums font-medium">{euro(r.stima)}</td>
      <td className={cn("px-2 py-1 text-right tabular-nums", tonoScostamento(r.scostamento, r.tipo))}>{euroSegno(r.scostamento)}</td>
    </>
  );

  if (!v) {
    // Reale che nessuna voce raccoglie: si vede, è contato, e si può dargli una voce.
    const categoria = isCategoriaPiano(r.categoria) && CATEGORIE_PIANO[r.categoria].tipo === r.tipo ? r.categoria : undefined;
    return (
      <tr className="bg-amber-50/40 dark:bg-amber-500/5">
        <td className="px-3 py-1.5 italic text-muted-foreground" colSpan={conFiglie ? 5 : 4}>{r.etichetta}</td>
        {p.conApprovato && <td className="px-2 py-1 text-right text-muted-foreground">—</td>}
        <td className="px-2 py-1 text-right text-muted-foreground">—</td>
        {reale}
        <td className="px-2 py-1 text-right text-muted-foreground">—</td>
        {fineRiga}
        <td className="px-1 py-1">
          {p.modificabile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  aria-label={`Crea una voce per ${r.etichetta}`}
                  onClick={() => onNuovaDaFuori(r.tipo, categoria, CHIAVI_REALI[r.categoria] ?? "")}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Crea una voce che raccolga queste righe</TooltipContent>
            </Tooltip>
          )}
        </td>
      </tr>
    );
  }

  const nome = r.etichetta;
  const scelteCategoria = categorieDelTipo(v.tipo).map((c) => ({ valore: c.id, nome: c.nome }));
  const scelteFiglia = [{ valore: "__tutte", nome: "Tutte" }, ...p.figlie.map((f) => ({ valore: f.id, nome: nomeFiglia(f) }))];
  const agganciate = v.categorieCosto.length;
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-2 py-1">
        {p.modificabile ? (
          <CellaTesto valore={v.descrizione} etichetta={`Descrizione di ${nome}`} placeholder={CATEGORIE_PIANO[v.categoria].nome} onSalva={(descrizione) => salva({ descrizione })} />
        ) : (
          <span className="px-1.5">{nome}</span>
        )}
        {agganciate > 0 && (
          <p className="px-1.5 text-[11px] text-muted-foreground">
            <Link2 className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
            {agganciate === 1 ? "1 categoria agganciata" : `${agganciate} categorie agganciate`}
          </p>
        )}
      </td>
      <td className="px-1 py-1">
        {p.modificabile ? (
          <CellaScelta valore={v.categoria} scelte={scelteCategoria} etichetta={`Categoria di ${nome}`} onSalva={(categoria) => salva({ categoria })} />
        ) : (
          <span className="px-1.5">{CATEGORIE_PIANO[v.categoria].nome}</span>
        )}
      </td>
      <td className="px-1 py-1">
        {p.modificabile ? (
          <CellaMese valore={v.mese} partenza={p.piano.oggi} etichetta={`Mese di ${nome}`} onSalva={(mese) => salva({ mese })} />
        ) : (
          <span className={cn("px-1.5", !v.mese && "text-amber-700 dark:text-amber-400")}>{v.mese ? nomeMese(v.mese) : "manca"}</span>
        )}
      </td>
      <td className="px-1 py-1">
        {p.modificabile ? (
          <CellaDurata valore={v.durataMesi} etichetta={`Durata in mesi di ${nome}`} onSalva={(durataMesi) => salva({ durataMesi })} />
        ) : (
          <span className="block px-1.5 text-right tabular-nums">{v.durataMesi}</span>
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
            <span className="px-1.5 text-muted-foreground">{p.figlie.find((f) => f.id === v.figliaId)?.codice ?? (v.figliaId ? "—" : "Tutte")}</span>
          )}
        </td>
      )}
      {p.conApprovato && (
        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
          {r.approvato === null ? <span className="text-xs">nuova</span> : euro(r.approvato)}
        </td>
      )}
      <td className="px-1 py-1">
        {p.modificabile ? (
          <CellaImporto valore={v.importo} etichetta={`Previsto di ${nome}`} onSalva={(importo) => salva({ importo: importo ?? 0 })} />
        ) : (
          <span className="block px-1.5 text-right tabular-nums">{euro(v.importo)}</span>
        )}
      </td>
      {reale}
      <td className="px-1 py-1">
        {p.aFinireModificabile ? (
          <CellaImporto
            valore={v.aFinire}
            vuotoPermesso
            suggerito={r.aFinire}
            etichetta={`A finire di ${nome}`}
            className={TONI.aFinire.testo}
            onSalva={(aFinire) => salva({ aFinire })}
          />
        ) : (
          <span className={cn("block px-1.5 text-right tabular-nums", TONI.aFinire.testo)}>{euro(r.aFinire)}</span>
        )}
      </td>
      {fineRiga}
      <td className="px-1 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Azioni per ${nome}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={apriReale} disabled={r.righe.length === 0}>Vedi le righe del reale</DropdownMenuItem>
            {p.modificabile && v.tipo === "costo" && (
              <DropdownMenuItem onClick={() => onAggancia(v)}>
                <Link2 className="mr-2 h-4 w-4" /> Aggancia categorie di costo…
              </DropdownMenuItem>
            )}
            {p.aFinireModificabile && v.aFinire !== null && (
              <DropdownMenuItem onClick={() => salva({ aFinire: null })}>
                <RotateCcw className="mr-2 h-4 w-4" /> A finire calcolato (previsto − reale)
              </DropdownMenuItem>
            )}
            {p.modificabile && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={elimina.isPending}
                  onClick={() => elimina.mutate(v.id, {
                    onSuccess: () => toast.success(`«${nome}» tolta dal piano`),
                    onError: (e) => toast.error(messaggioPiano(e, "la voce")),
                  })}
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
