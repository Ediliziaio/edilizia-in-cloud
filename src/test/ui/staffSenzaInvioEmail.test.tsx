import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StaffUserDialog } from "@/components/users/StaffUserDialog";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("crea l’account con il nome noto e permette di consegnare le credenziali senza inviare email", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const submit = vi.fn().mockResolvedValue({});
  render(<StaffUserDialog open onOpenChange={vi.fn()} onSubmit={submit} />);
  fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Andrea" } });
  fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "tecnico@example.invalid" } });
  const invio = screen.getByRole("checkbox", { name: "Invia le credenziali per email" });
  expect(invio).toBeChecked();
  fireEvent.click(invio);
  fireEvent.click(screen.getByRole("button", { name: "Crea Utente" }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(submit.mock.calls[0][0]).toMatchObject({ first_name: "Andrea", last_name: "", email: "tecnico@example.invalid", inviaBenvenuto: false, role_type: "company_staff" });
}, 20_000);
