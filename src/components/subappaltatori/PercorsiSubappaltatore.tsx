import { ClipboardList, FileCheck2, List, NotebookTabs, UsersRound, WalletCards } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PercorsiSubappaltatore({ mostraListino }: { mostraListino: boolean }) {
  const sezioni = [
    { id: "anagrafica", nome: "Panoramica", Icona: NotebookTabs },
    { id: "lavori", nome: "Commesse e contratti", Icona: ClipboardList },
    { id: "operai", nome: "Operai e squadre", Icona: UsersRound },
    { id: "documenti", nome: "Documenti e sicurezza", Icona: FileCheck2 },
    { id: "contabilita", nome: "Contabilità", Icona: WalletCards },
    ...(mostraListino ? [{ id: "listino", nome: "Listino", Icona: List }] : []),
  ];
  return <TabsList aria-label="Scheda del subappaltatore" className="grid h-auto w-full grid-cols-2 justify-start gap-1 rounded-lg border p-1 sm:flex sm:overflow-x-auto">
    {sezioni.map(({ id, nome, Icona }) => <TabsTrigger key={id} value={id} className="min-w-0 shrink-0 justify-start gap-1.5 whitespace-normal px-2 py-2 text-left max-sm:text-xs">
      <Icona className="size-4 shrink-0" aria-hidden="true" />{nome}
    </TabsTrigger>)}
  </TabsList>;
}
