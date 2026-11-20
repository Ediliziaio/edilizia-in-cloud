import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";

const runtime = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  createUser: vi.fn(),
  requireRole: vi.fn(),
  renderWelcome: vi.fn(),
  sendWelcome: vi.fn(),
}));

vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({
  requireAuth: async () => ({ userId: "gestore", supabaseAdmin: runtime.db }),
  requireRole: runtime.requireRole,
}));
vi.mock("../../../supabase/functions/_shared/withMetrics.ts", () => ({
  conMetriche: (_name: string, handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock("../../../supabase/functions/_shared/fasiCommessa.ts", () => ({
  creaFasiCommessa: async (): Promise<{ errore: string | null }> => ({ errore: null }),
}));
vi.mock("../../../supabase/functions/_shared/platformAutomation.ts", () => ({
  PLATFORM_EVENTS: { COMPANY_CREATED: "company_created" },
  emitPlatformEvent: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/renderTemplate.ts", () => ({
  renderEmailTemplate: runtime.renderWelcome,
}));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({
  sendEmailUnified: runtime.sendWelcome,
}));
vi.mock("../../../supabase/functions/_shared/getPlatformSetting.ts", () => ({
  getPlatformSetting: async () => "https://app.example.invalid",
}));

let handler: ((request: Request) => Promise<Response> | Response) | null = null;

beforeEach(async () => {
  vi.resetAllMocks();
  runtime.db = new DbMinimo();
  runtime.createUser.mockResolvedValue({ data: { user: { id: "nuovo-admin" } }, error: null });
  Object.assign(runtime.db, { auth: { admin: { createUser: runtime.createUser } } });
  runtime.renderWelcome.mockResolvedValue({ subject: "Benvenuto", html: "", text: "" });
  runtime.sendWelcome.mockResolvedValue({ ok: true, status: 200 });

  const deno = denoFinto();
  vi.stubGlobal("Deno", deno.finto);
  if (!handler) {
    const endpoint = "../../../supabase/functions/create-company/index.ts";
    await import(/* @vite-ignore */ endpoint);
    handler = deno.gestore();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function creaAzienda(extra: Riga = {}) {
  return handler!(new Request("http://localhost/functions/v1/create-company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: "Impresa di prova",
      companyEmail: "impresa@example.invalid",
      adminEmail: "Admin@Example.invalid",
      adminFirstName: "Mario",
      adminLastName: "Rossi",
      sector: "altro",
      ...extra,
    }),
  }));
}

describe("Password amministratore alla creazione dell’azienda", () => {
  it("usa la stessa password generata per Auth, email di benvenuto e conferma", async () => {
    const response = await creaAzienda();
    const { adminCredentials } = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(adminCredentials).toMatchObject({ email: "admin@example.invalid", welcomeEmailStatus: "sent" });
    expect(adminCredentials.password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).{20}$/);
    expect(runtime.createUser).toHaveBeenCalledExactlyOnceWith({
      email: "admin@example.invalid",
      password: adminCredentials.password,
      email_confirm: true,
    });
    expect(runtime.renderWelcome).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      templateName: "welcome",
      props: expect.objectContaining({
        loginUrl: "https://app.example.invalid/login",
        loginEmail: "admin@example.invalid",
        password: adminCredentials.password,
      }),
    }));
    expect(runtime.sendWelcome).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      to: ["admin@example.invalid"],
    }));
    expect(runtime.db.tabelle.user_roles).toContainEqual(expect.objectContaining({
      user_id: "nuovo-admin",
      role: "company_admin",
    }));
  });

  it("restituisce la password senza inviare il benvenuto quando è disattivato", async () => {
    const response = await creaAzienda({ inviaBenvenuto: false });
    expect(response.status).toBe(200);
    const { adminCredentials } = await response.json();
    expect(adminCredentials).toMatchObject({
      password: runtime.createUser.mock.calls[0][0].password,
      welcomeEmailStatus: "skipped",
    });
    expect(runtime.renderWelcome).not.toHaveBeenCalled();
    expect(runtime.sendWelcome).not.toHaveBeenCalled();
  });

  it("restituisce le credenziali anche se il provider rifiuta l’invio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.sendWelcome.mockResolvedValue({ ok: false, status: 503 });
    const response = await creaAzienda();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      adminCredentials: {
        password: runtime.createUser.mock.calls[0][0].password,
        welcomeEmailStatus: "failed",
      },
    });
  });

  it("continua ad accettare la password inviata da un client precedente", async () => {
    const password = "Credenziale-di-test!37";
    const response = await creaAzienda({ adminPassword: password, inviaBenvenuto: false });
    expect(response.status).toBe(200);
    expect(runtime.createUser).toHaveBeenCalledWith(expect.objectContaining({ password }));
    expect(await response.json()).not.toHaveProperty("adminCredentials");
  });

  it("blocca la creazione prima di scrivere dati quando il ruolo è negato", async () => {
    runtime.requireRole.mockRejectedValue(new Response(null, { status: 403 }));
    const response = await creaAzienda();
    expect(response.status).toBe(403);
    expect(runtime.requireRole).toHaveBeenCalledWith(runtime.db, "gestore", ["super_admin"], expect.any(Object));
    expect(runtime.db.scritture).toHaveLength(0);
    expect(runtime.createUser).not.toHaveBeenCalled();
  });
});
