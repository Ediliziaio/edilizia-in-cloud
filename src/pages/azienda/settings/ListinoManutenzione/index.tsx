/**
 * ListinoManutenzione — orchestratore
 * Refactor MP-IMP-001 Fase 5: file mostro 1776 righe → split in
 *   - types.ts / constants.ts / presets.ts
 *   - hooks/useListinoData.ts
 *   - dialogs/{Impianto,Intervento,Listino,StandardListino}Dialog.tsx
 *   - sections/{Impianti,Interventi,Tariffe}Tab.tsx
 *   - index.tsx (questo file, ~200 righe)
 *
 * Route: /azienda/impostazioni/listino-manutenzione
 * Permission: canViewSettingsCustomization (gestito da withCompanyPermission
 * in companyRoutes.tsx). Il guard isAdmin interno resta per UX semantica.
 */
import { useState } from "react";
import { Sparkles, ShieldAlert, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useVertical } from "@/hooks/useVertical";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import type { TipoImpianto, TipoIntervento, ListinoPrezzo } from "./types";
import { useListinoData } from "./hooks/useListinoData";
import { ImpiantoDialog } from "./dialogs/ImpiantoDialog";
import { InterventoDialog } from "./dialogs/InterventoDialog";
import { ListinoDialog } from "./dialogs/ListinoDialog";
import { StandardListinoDialog } from "./dialogs/StandardListinoDialog";
import { ImpiantiTab } from "./sections/ImpiantiTab";
import { InterventiTab } from "./sections/InterventiTab";
import { TariffeTab } from "./sections/TariffeTab";

export default function ListinoManutenzione() {
  const { effectiveCompany, role } = useAuth();
  const { vertical } = useVertical();
  const companyId = effectiveCompany?.id as string | undefined;
  // Solo admin azienda (e super admin) possono editare prezzi/tariffe. Un
  // commerciale non ha mai titolo per modificare il listino: vedrebbe UI ma
  // tutti i write fallirebbero via RLS generando solo toast di errore.
  const isAdmin = role === "company_admin" || role === "super_admin";

  const [activeTab, setActiveTab] = useState("impianti");

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

  // Template seed state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  const {
    tipiImpianto, tipiIntervento, listino,
    loadingImpianti, loadingInterventi, loadingListino,
    deleteImpiantoMutation, deleteInterventoMutation, deleteListinoMutation,
    seedFromTemplate, creatingDemo,
    invalidateImpianti, invalidateInterventi, invalidateListino,
  } = useListinoData(companyId);

  if (!companyId) return null;

  if (!isAdmin) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent
          className="py-10 flex flex-col items-center gap-4 text-center"
          role="alert"
          aria-live="polite"
        >
          <ShieldAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-medium">Accesso riservato</p>
            <p className="text-sm text-muted-foreground mt-1">
              Solo l&apos;amministratore dell&apos;azienda può modificare il
              listino manutenzione. Se devi aggiornare un prezzo, chiedi al
              titolare di farlo da questa pagina.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Listino Prezzi Manutenzione</h1>
            <p className="text-sm text-muted-foreground">
              Tipi di impianto, tipi di intervento e listino prezzi. Usati dal modulo Manutenzione
              per calcolare automaticamente i preventivi di intervento.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTemplateDialogOpen(true)}
          disabled={creatingDemo}
          className="shrink-0"
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {creatingDemo ? "Importazione..." : "Importa da template"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="impianti">
            Tipi Impianto
            {tipiImpianto.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{tipiImpianto.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="interventi">
            Tipi Intervento
            {tipiIntervento.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{tipiIntervento.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tariffe">
            Tariffe
            {listino.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{listino.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="impianti" className="mt-4">
          <ImpiantiTab
            tipiImpianto={tipiImpianto}
            loadingImpianti={loadingImpianti}
            onAdd={() => { setEditingImpianto(null); setImpiantoDialogOpen(true); }}
            onEdit={(t) => { setEditingImpianto(t); setImpiantoDialogOpen(true); }}
            onDelete={setDeleteImpiantoId}
          />
        </TabsContent>

        <TabsContent value="interventi" className="mt-4">
          <InterventiTab
            tipiIntervento={tipiIntervento}
            loadingInterventi={loadingInterventi}
            onAdd={() => { setEditingIntervento(null); setInterventoDialogOpen(true); }}
            onEdit={(t) => { setEditingIntervento(t); setInterventoDialogOpen(true); }}
            onDelete={setDeleteInterventoId}
          />
        </TabsContent>

        <TabsContent value="tariffe" className="mt-4">
          <TariffeTab
            listino={listino}
            loadingListino={loadingListino}
            tipiImpianto={tipiImpianto}
            tipiIntervento={tipiIntervento}
            onAdd={() => { setEditingListino(null); setListinoDialogOpen(true); }}
            onEdit={(l) => { setEditingListino(l); setListinoDialogOpen(true); }}
            onDelete={setDeleteListinoId}
          />
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}
      {impiantoDialogOpen && (
        <ImpiantoDialog
          key={editingImpianto?.id ?? "new-impianto"}
          open={impiantoDialogOpen}
          onClose={() => setImpiantoDialogOpen(false)}
          editing={editingImpianto}
          companyId={companyId}
          onSaved={invalidateImpianti}
        />
      )}

      {interventoDialogOpen && (
        <InterventoDialog
          key={editingIntervento?.id ?? "new-intervento"}
          open={interventoDialogOpen}
          onClose={() => setInterventoDialogOpen(false)}
          editing={editingIntervento}
          companyId={companyId}
          onSaved={invalidateInterventi}
        />
      )}

      {listinoDialogOpen && (
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
      <AlertDialog open={!!deleteImpiantoId} onOpenChange={(v) => !v && setDeleteImpiantoId(null)}>
        <AlertDialogContent>
          {(() => {
            const impiantoInUso = listino.filter((l) => l.tipo_impianto_id === deleteImpiantoId).length;
            const blocked = impiantoInUso > 0;
            const impiantoNome = tipiImpianto.find((t) => t.id === deleteImpiantoId)?.nome ?? "questo tipo";
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Elimina tipo impianto</AlertDialogTitle>
                  <AlertDialogDescription>
                    {blocked ? (
                      <>
                        <span className="text-rose-700 font-medium">Impossibile eliminare.</span>{" "}
                        Ci sono <strong>{impiantoInUso}</strong>{" "}
                        {impiantoInUso === 1 ? "tariffa di listino associata" : "tariffe di listino associate"} a
                        {" "}<em>{impiantoNome}</em>.
                        Rimuovi prima le tariffe, oppure <strong>disattiva</strong> il tipo dall&apos;interruttore in lista
                        (il tipo non compare più nel preventivatore ma preserva lo storico).
                      </>
                    ) : (
                      <>Questa azione è irreversibile. Nessuna tariffa è attualmente collegata a <em>{impiantoNome}</em>.</>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    disabled={blocked}
                    onClick={() => {
                      if (!blocked && deleteImpiantoId) {
                        deleteImpiantoMutation.mutate(deleteImpiantoId);
                        setDeleteImpiantoId(null);
                      }
                    }}
                  >
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteInterventoId} onOpenChange={(v) => !v && setDeleteInterventoId(null)}>
        <AlertDialogContent>
          {(() => {
            const interventoInUso = listino.filter((l) => l.tipo_intervento_id === deleteInterventoId).length;
            const blocked = interventoInUso > 0;
            const interventoNome = tipiIntervento.find((t) => t.id === deleteInterventoId)?.nome ?? "questo tipo";
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Elimina tipo intervento</AlertDialogTitle>
                  <AlertDialogDescription>
                    {blocked ? (
                      <>
                        <span className="text-rose-700 font-medium">Impossibile eliminare.</span>{" "}
                        Ci sono <strong>{interventoInUso}</strong>{" "}
                        {interventoInUso === 1 ? "tariffa di listino associata" : "tariffe di listino associate"} a
                        {" "}<em>{interventoNome}</em>.
                        Rimuovi prima le tariffe, oppure <strong>disattiva</strong> il tipo.
                      </>
                    ) : (
                      <>Questa azione è irreversibile. Nessuna tariffa è attualmente collegata a <em>{interventoNome}</em>.</>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    disabled={blocked}
                    onClick={() => {
                      if (!blocked && deleteInterventoId) {
                        deleteInterventoMutation.mutate(deleteInterventoId);
                        setDeleteInterventoId(null);
                      }
                    }}
                  >
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteListinoId} onOpenChange={(v) => !v && setDeleteListinoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina tariffa</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. La tariffa verrà rimossa definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (deleteListinoId) {
                  deleteListinoMutation.mutate(deleteListinoId);
                  setDeleteListinoId(null);
                }
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Template picker ── */}
      {templateDialogOpen && (
        <StandardListinoDialog
          open={templateDialogOpen}
          onClose={() => setTemplateDialogOpen(false)}
          existingCount={tipiImpianto.length + tipiIntervento.length + listino.length}
          onImport={async (params) => {
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
