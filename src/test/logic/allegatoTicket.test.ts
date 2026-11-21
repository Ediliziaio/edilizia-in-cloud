import { expect, it } from "vitest";
import { allegatoTicket } from "@/lib/tickets/allegato";

const ticket = "f9081322-beaf-4444-81d2-1604f5a6849d";
const chiave = `${ticket}/bb96bf5c-71e1-4b69-a383-f123b5b483d0_foto collaudo.jpg`;

it("usa la stessa chiave per i riferimenti storici e i nuovi percorsi", () => {
  const link = `https://db.example.test/storage/v1/object/sign/ticket-attachments/${encodeURI(chiave)}?token=scaduto`;
  expect(allegatoTicket(link, ticket)).toEqual({ path: chiave, nome: "foto collaudo.jpg", immagine: true });
  expect(allegatoTicket(chiave, ticket)).toEqual(allegatoTicket(link, ticket));
});

it("accetta soltanto riferimenti al bucket e alla cartella del ticket", () => {
  expect(allegatoTicket(chiave, "altro-ticket").path).toBeNull();
  expect(allegatoTicket(`${ticket}/../allegato.jpg`, ticket).path).toBeNull();
  expect(allegatoTicket(`https://db.example.test/storage/v1/object/public/altro-bucket/${chiave}`, ticket).path).toBeNull();
});
