import { expect, it } from "vitest";
import { calcolaTentativoEstrazione } from "../../../supabase/functions/email-ai-estrai-allegato/tentativi";

const ora = Date.parse("2026-11-19T16:00:00Z");

it("rinvia i blocchi di pagamento senza consumare i tentativi tecnici", () => {
  expect(calcolaTentativoEstrazione({ tentativi: 5, ultimo_esito: "vision_error" }, "credito", ora)).toMatchObject({
    tentativi: 0, prossimo_tentativo: "2026-11-19T17:00:00.000Z",
  });
  expect(calcolaTentativoEstrazione({ tentativi: 12, ultimo_esito: "credito" }, "troncato", ora)).toMatchObject({
    tentativi: 1, prossimo_tentativo: "2026-11-19T17:00:00.000Z",
  });
});

it("applica il rinvio progressivo ai soli errori tecnici", () => {
  expect(calcolaTentativoEstrazione({ tentativi: 1, ultimo_esito: "troncato" }, "parse_failed", ora)).toMatchObject({
    tentativi: 2, prossimo_tentativo: "2026-11-19T18:00:00.000Z",
  });
  expect(calcolaTentativoEstrazione({ tentativi: 5, ultimo_esito: "parse_failed" }, "vision_error", ora)).toMatchObject({
    tentativi: 6, prossimo_tentativo: "2026-11-20T16:00:00.000Z",
  });
});
