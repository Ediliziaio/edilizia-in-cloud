/**
 * ListinoManutenzione — orchestratore
 * Refactor MP-IMP-001 Fase 5: file mostro 1776 righe → split in
 *   - types.ts / constants.ts / presets.ts
 *   - hooks/useListinoData.ts
 *   - dialogs/{Impianto,Intervento,Listino,StandardListino}Dialog.tsx
 *   - sections/{Impianti,Interventi,Tariffe}Tab.tsx
 *   - index.tsx (questo file)
 *
 * Montaggio: le tre parti (tipi di impianto, tipi di intervento, prezzi) sono schede della pagina «Manodopera e servizi»,
 * nella stessa fila della manodopera: /azienda/impostazioni/tariffe?tab=impianti | interventi | prezzi. Prima erano una
 * seconda fila di schede dentro la scheda «Manutenzione». `?tab=manutenzione` (l'indirizzo di prima) apre gli impianti;
 * la vecchia route /azienda/impostazioni/listino-manutenzione reindirizza lì. La fila di schede è della pagina
 * (SettingsTariffe): questo componente mostra la parte scelta (`scheda`) e non ha titoli suoi (il layout mette l'h1).
 * Permission: canViewSettingsPricing. Chi scrive: i prezzi li cambia l'amministratore o chi ha «Listino & Prezzi» in
 * modifica; i tipi di impianto e di intervento solo l'amministratore (policy del database).
 */
import { useState } from "react";
import { Sparkles, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useVertical } from "@/hooks/useVertical";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import type { SchedaManutenzione } from "../SettingsTariffe/schede";
import type { TipoImpianto, TipoIntervento, ListinoPrezzo } from "./types";
import { useListinoData } from "./hooks/useListinoData";
import { ImpiantoDialog } from "./dialogs/ImpiantoDialog";
import { InterventoDialog } from "./dialogs/InterventoDialog";
import { ListinoDialog } from "./dialogs/ListinoDialog";
import { StandardListinoDialog } from "./dialogs/StandardListinoDialog";
import { ImpiantiTab } from "./sections/ImpiantiTab";
import { InterventiTab } from "./sections/InterventiTab";
import { TariffeTab } from "./sections/TariffeTab";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Il titolo della parte aperta, per chi usa il lettore di schermo (la fila di schede non è un titolo). */
const TITOLO_SCHEDA: Record<SchedaManutenzione, string> = {
  impianti: "Manutenzione: tipi di impianto",
  interventi: "Manutenzione: tipi di intervento",
  prezzi: "Manutenzione: prezzi",
};

export default function ListinoManutenzione({ scheda }: { scheda: SchedaManutenzione }) {
  const tr = useT();
  const { effectiveCompany, role } = useAuth();
  const { vertical } = useVertical();
  const companyId = effectiveCompany?.id as string | undefined;
  // I prezzi (listino_prezzi) li scrive chi ha «Listino & Prezzi» in modifica o l'amministratore; i tipi di impianto e di
  // intervento solo l'amministratore (policy `tipi_*_admin_write`). Chi non può vede l'elenco e basta: con i pulsanti
  // accesi riceveva un rifiuto, o peggio un «aggiornato» a vuoto.
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const eAmministratore = role === "company_admin" || role === "super_admin" || permissions.isAdmin;
  const scritturaAbilitata = !permissions.isLoading && !permissions.solaLettura;
  const puoModificarePrezzi = scritturaAbilitata && (eAmministratore || permissions.canEditSettingsPricing);
  const puoModificareTipi = scritturaAbilitata && eAmministratore;
  const canView = eAmministratore || permissions.canEditSettingsPricing || permissions.canViewSettingsPricing;
  const puoModificare = scheda === "prezzi" ? puoModificarePrezzi : puoModificareTipi;

  // Impianti state
  const [impiantoDialogOpen, setImpiantoDialogOpen] = useState(false);
  const [editingImpianto, setEditingImpianto] = useState<TipoImpianto | null>(null);
  const [deleteImpiantoId, setDeleteImpiantoId] = useState<string | null>(null);

  // Interventi state
  const [interventoDialogOpen, setInterventoDialogOpen] = useState(false);
  const [editingIntervento, setEditingIntervento] = useState<TipoIntervento | null>(null);
  const [deleteInterventoId, setDeleteInterventoId] = useState<string | null>(null);

  // Listino state
  const [listinoDialogOpen, setListinoDialogOpen] = useState(false);
  const [editingListino, setEditingListino] = useState<ListinoPrezzo | null>(null);
  const [deleteListinoId, setDeleteListinoId] = useState<string | null>(null);

  // Catalogo pronto (seed) state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const {
    tipiImpianto, tipiIntervento, listino,
    loadingImpianti, loadingInterventi, loadingListino,
    deleteImpiantoMutation, deleteInterventoMutation, deleteListinoMutation,
    seedFromTemplate, creatingDemo,
    invalidateImpianti, invalidateInterventi, invalidateListino,
  } = useListinoData(companyId);

  if (!companyId) return null;

  if (!canView) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent
          className="py-10 flex flex-col items-center gap-4 text-center"
          role="alert"
          aria-live="polite"
        >
          <ShieldAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-medium">{tr("Accesso riservato")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {tr("Non hai il permesso di vedere il listino di manutenzione. Chiedilo all'amministratore dell'azienda.")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{tr(TITOLO_SCHEDA[scheda])}</h2>

      {/* Una riga: a cosa serve e, per chi può, il catalogo pronto. Niente titolo grande: lo dice la scheda aperta. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {tr("Impianti, interventi e prezzi che il modulo Manutenzione usa per calcolare i preventivi di intervento.")}
        </p>
        {puoModificareTipi && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTemplateDialogOpen(true)}
            disabled={creatingDemo}
            className="shrink-0"
          >
            <Sparkles className="h-4 w-4 mr-1.5" aria-hidden />
            {creatingDemo ? tr("Importazione...") : tr("Importa un catalogo pronto")}
          </Button>
        )}
      </div>

      {!puoModificare && (
        <Alert>
          <AlertDescription>
            {permissions.solaLettura
              ? tr("Modalità sola lettura: puoi consultare il listino di manutenzione senza modificarlo o importare cataloghi.")
              : scheda === "prezzi"
              ? tr("Stai consultando i prezzi di manutenzione: li cambia chi ha il permesso «Listino & Prezzi» in modifica.")
              : scheda === "impianti"
              ? tr("Stai consultando i tipi di impianto: li cambia l'amministratore dell'azienda.")
              : tr("Stai consultando i tipi di intervento: li cambia l'amministratore dell'azienda.")}
          </AlertDescription>
        </Alert>
      )}

      {scheda === "impianti" && (
        <ImpiantiTab
          tipiImpianto={tipiImpianto}
          loadingImpianti={loadingImpianti}
          puoModificare={puoModificareTipi}
          puoImportare={puoModificareTipi}
          onAdd={() => { setEditingImpianto(null); setImpiantoDialogOpen(true); }}
          onEdit={(t) => { setEditingImpianto(t); setImpiantoDialogOpen(true); }}
          onDelete={setDeleteImpiantoId}
        />
      )}

      {scheda === "interventi" && (
        <InterventiTab
          tipiIntervento={tipiIntervento}
          loadingInterventi={loadingInterventi}
          puoModificare={puoModificareTipi}
          puoImportare={puoModificareTipi}
          onAdd={() => { setEditingIntervento(null); setInterventoDialogOpen(true); }}
          onEdit={(t) => { setEditingIntervento(t); setInterventoDialogOpen(true); }}
          onDelete={setDeleteInterventoId}
        />
      )}

      {scheda === "prezzi" && (
        <TariffeTab
          listino={listino}
          loadingListino={loadingListino}
          tipiImpianto={tipiImpianto}
          tipiIntervento={tipiIntervento}
          puoModificare={puoModificarePrezzi}
          puoImportare={puoModificareTipi}
          onAdd={() => { setEditingListino(null); setListinoDialogOpen(true); }}
          onEdit={(l) => { setEditingListino(l); setListinoDialogOpen(true); }}
          onDelete={setDeleteListinoId}
        />
      )}

      {/* ── Dialogs ── */}
      {impiantoDialogOpen && puoModificareTipi && (
        <ImpiantoDialog
          key={editingImpianto?.id ?? "new-impianto"}
          open={impiantoDialogOpen}
          onClose={() => setImpiantoDialogOpen(false)}
          editing={editingImpianto}
          companyId={companyId}
          onSaved={invalidateImpianti}
        />
      )}

      {interventoDialogOpen && puoModificareTipi && (
        <InterventoDialog
          key={editingIntervento?.id ?? "new-intervento"}
          open={interventoDialogOpen}
          onClose={() => setInterventoDialogOpen(false)}
          editing={editingIntervento}
          companyId={companyId}
          onSaved={invalidateInterventi}
        />
      )}

      {listinoDialogOpen && puoModificarePrezzi && (
        <ListinoDialog
          key={editingListino?.id ?? "new-listino"}
          open={listinoDialogOpen}
          onClose={() => setListinoDialogOpen(false)}
          editing={editingListino}
          companyId={companyId}
          tipiImpianto={tipiImpianto}
          tipiIntervento={tipiIntervento}
          onSaved={invalidateListino}
        />
      )}

      {/* ── Delete Confirmations con FK guard (cascade counter) ── */}
      <AlertDialog open={!!deleteImpiantoId && puoModificareTipi} onOpenChange={(v) => !v && setDeleteImpiantoId(null)}>
        <AlertDialogContent>
          {(() => {
            const impiantoInUso = listino.filter((l) => l.tipo_impianto_id === deleteImpiantoId).length;
            const blocked = impiantoInUso > 0;
            const impiantoNome = tipiImpianto.find((t) => t.id === deleteImpiantoId)?.nome ?? tr("questo tipo");
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tr("Elimina tipo di impianto")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {blocked ? (
                      <>
                        <span className="text-rose-700 font-medium">{tr("Impossibile eliminare.")}</span>{" "}
                        {impiantoInUso === 1
                          ? tr("C'è 1 prezzo di manutenzione collegato a {nome}. Elimina prima quel prezzo, oppure disattiva il tipo (apri «Modifica» e spegni «Attivo»): non si potrà più scegliere nei nuovi interventi, ma resta nello storico.", { nome: impiantoNome })
                          : tr("Ci sono {n} prezzi di manutenzione collegati a {nome}. Elimina prima quei prezzi, oppure disattiva il tipo (apri «Modifica» e spegni «Attivo»): non si potrà più scegliere nei nuovi interventi, ma resta nello storico.", { n: impiantoInUso, nome: impiantoNome })}
                      </>
                    ) : (
                      <>{tr("Questa azione è irreversibile. Nessun prezzo è collegato a {nome}.", { nome: impiantoNome })}</>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    disabled={blocked}
                    onClick={() => {
                      if (puoModificareTipi && !blocked && deleteImpiantoId) {
                        deleteImpiantoMutation.mutate(deleteImpiantoId);
                        setDeleteImpiantoId(null);
                      }
                    }}
                  >
                    {tr("Elimina")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteInterventoId && puoModificareTipi} onOpenChange={(v) => !v && setDeleteInterventoId(null)}>
        <AlertDialogContent>
          {(() => {
            const interventoInUso = listino.filter((l) => l.tipo_intervento_id === deleteInterventoId).length;
            const blocked = interventoInUso > 0;
            const interventoNome = tipiIntervento.find((t) => t.id === deleteInterventoId)?.nome ?? tr("questo tipo");
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tr("Elimina tipo di intervento")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {blocked ? (
                      <>
                        <span className="text-rose-700 font-medium">{tr("Impossibile eliminare.")}</span>{" "}
                        {interventoInUso === 1
                          ? tr("C'è 1 prezzo di manutenzione collegato a {nome}. Elimina prima quel prezzo, oppure disattiva il tipo (apri «Modifica» e spegni «Attivo»): non si potrà più scegliere nei nuovi interventi, ma resta nello storico.", { nome: interventoNome })
                          : tr("Ci sono {n} prezzi di manutenzione collegati a {nome}. Elimina prima quei prezzi, oppure disattiva il tipo (apri «Modifica» e spegni «Attivo»): non si potrà più scegliere nei nuovi interventi, ma resta nello storico.", { n: interventoInUso, nome: interventoNome })}
                      </>
                    ) : (
                      <>{tr("Questa azione è irreversibile. Nessun prezzo è collegato a {nome}.", { nome: interventoNome })}</>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    disabled={blocked}
                    onClick={() => {
                      if (puoModificareTipi && !blocked && deleteInterventoId) {
                        deleteInterventoMutation.mutate(deleteInterventoId);
                        setDeleteInterventoId(null);
                      }
                    }}
                  >
                    {tr("Elimina")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteListinoId && puoModificarePrezzi} onOpenChange={(v) => !v && setDeleteListinoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Elimina prezzo di manutenzione")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("Questa azione è irreversibile. Il prezzo verrà rimosso definitivamente.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (puoModificarePrezzi && deleteListinoId) {
                  deleteListinoMutation.mutate(deleteListinoId);
                  setDeleteListinoId(null);
                }
              }}
            >
              {tr("Elimina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Catalogo pronto ── */}
      {templateDialogOpen && puoModificareTipi && (
        <StandardListinoDialog
          open={templateDialogOpen}
          onClose={() => setTemplateDialogOpen(false)}
          existingCount={tipiImpianto.length + tipiIntervento.length + listino.length}
          onImport={async (params) => {
            if (!puoModificareTipi) return;
            const ok = await seedFromTemplate(params);
            if (ok) setTemplateDialogOpen(false);
          }}
          importing={creatingDemo}
          vertical={vertical}
        />
      )}
    </div>
  );
}
