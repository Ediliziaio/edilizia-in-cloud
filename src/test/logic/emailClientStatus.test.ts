import { describe, expect, it } from "vitest";
import { emailClientStatus, emailReadErrorMessage } from "@/lib/email/clientStatus";
import type { EmailConnectionHealth } from "@/pages/azienda/email/components/EmailConnectionHealthPanel";
const active: EmailConnectionHealth = {id:"demo", email_address:"demo@example.test", provider:"imap", status:"active", last_synced_at:"2026-10-01T10:00:00Z"};
describe("Stato reale del client email", () => {
  it("non dichiara aggiornata una casella con credenziali rifiutate", () => {
    expect(emailClientStatus([{...active,last_sync_error:"authentication failed"}],false,false,false)).toEqual({label:"Problemi di sincronizzazione",warning:true});
  });
  it("distingue caricamento, errore di lettura e sincronizzazione fallita", () => {
    expect(emailClientStatus([],true,false,false).label).toBe("Verifica caselle…");
    expect(emailClientStatus([],false,true,false).label).toBe("Stato caselle non disponibile");
    expect(emailClientStatus([active],false,false,false,true).label).toBe("Sincronizzazione non riuscita");
  });
  it("mostra la data conosciuta invece di promettere aggiornamento in tempo reale", () => {
    expect(emailClientStatus([active],false,false,false).label).toContain("Ultimo sync:");
    expect(emailClientStatus([{...active,last_synced_at:null}],false,false,false).label).toBe("Nessuna sincronizzazione registrata");
  });
  it("spiega anche i timeout restituiti come oggetti da Supabase", () => {
    expect(emailReadErrorMessage({message:"statement timeout",code:"57014"})).toContain("non ha risposto in tempo");
    expect(emailReadErrorMessage({message:"statement timeout"})).not.toContain("password");
  });
});
