import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import HomeVideoGallery from "@/components/marketing/HomeVideoGallery";

afterEach(cleanup);

it("loads no player until requested and replaces the previous player when another video is selected", () => {
  render(<HomeVideoGallery />);
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(document.querySelector("iframe")).toBeNull();
  expect([...document.querySelectorAll("img")].every(image => image.getAttribute("src")?.startsWith("/images/marketing/"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Riproduci: Da Excel/ }));
  expect(document.querySelectorAll("iframe")).toHaveLength(1);
  expect(screen.getByTitle("Da Excel e WhatsApp a un’impresa edile organizzata")).toHaveAttribute("src", expect.stringContaining("youtube-nocookie.com/embed/Yk0hJ01HKco"));
  fireEvent.click(screen.getByRole("button", { name: /Riproduci: Hai finito/ }));
  expect(document.querySelectorAll("iframe")).toHaveLength(1);
  expect(screen.getByTitle("Hai finito il cantiere. Ma quanto hai guadagnato davvero?")).toHaveAttribute("src", expect.stringContaining("embed/ZVsy7hnM8v8"));
  expect(screen.queryByTitle("Da Excel e WhatsApp a un’impresa edile organizzata")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Chiudi il video" }));
  expect(document.querySelector("iframe")).toBeNull();
});

it("supports keyboard dismissal, restores focus and offers a YouTube fallback", async () => {
  render(<HomeVideoGallery />);
  const trigger = screen.getByRole("button", { name: /Riproduci: Impresa edile/ });
  fireEvent.click(trigger);
  expect(screen.getByTitle("Impresa edile in utile, conto in rosso: dove sono i soldi?")).toHaveFocus();
  expect(screen.getByRole("link", { name: "Apri su YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=SdOsQ9YyMvI");
  fireEvent.keyDown(screen.getByRole("button", { name: "Chiudi il video" }), { key: "Escape" });
  expect(document.querySelector("iframe")).toBeNull();
  await waitFor(() => expect(trigger).toHaveFocus());
});
