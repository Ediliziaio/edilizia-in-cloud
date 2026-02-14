import { AdminSupportChatList } from "@/components/admin/support/AdminSupportChatList";

export default function GlobalTickets() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Assistenza Aziende</h1>
        <p className="text-muted-foreground">
          Gestisci le richieste di supporto diretto dalle aziende
        </p>
      </div>
      <AdminSupportChatList />
    </div>
  );
}
