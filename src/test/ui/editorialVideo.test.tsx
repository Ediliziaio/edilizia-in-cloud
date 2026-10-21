import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditorialVideo from "@/components/marketing/EditorialVideo";
import { editorialVideos, editorialVideoIsDue, editorialVideoPublicationLabel, type EditorialVideoKey } from "@/lib/marketing/editorialVideos";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T22:00:00Z")); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const keys: EditorialVideoKey[] = ["selection", "migration", "cash"];

describe("video editoriali programmati", () => {
  it.each(keys)("mostra copertina e data per %s senza caricare un video ancora privato", video => {
    render(<EditorialVideo video={video} />);
    expect(screen.getByRole("heading", { name: editorialVideos[video].title })).toBeInTheDocument();
    expect(screen.getByText("In programma")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Riproduci/ })).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector('a[target="_blank"]')).toBeNull();
  });
  it.each(keys)("dopo la pubblicazione riproduce %s dentro la stessa pagina", video => {
    vi.setSystemTime(new Date("2026-10-31T20:00:00Z"));
    render(<EditorialVideo video={video} />);
    expect(document.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Riproduci/ }));
    expect(screen.getByTitle(editorialVideos[video].title)).toHaveAttribute("src", expect.stringContaining(`youtube-nocookie.com/embed/${editorialVideos[video].id}`));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi il video" }));
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("attiva il player all’orario previsto anche lasciando la pagina aperta", () => {
    vi.setSystemTime(new Date("2026-10-22T17:59:59Z"));
    render(<EditorialVideo video="selection" />);
    expect(screen.queryByRole("button", { name: /Riproduci/ })).toBeNull();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByRole("button", { name: /Riproduci/ })).toBeInTheDocument();
  });
  it("mantiene le 20 italiane prima e dopo il cambio dell’ora", () => {
    expect(editorialVideoPublicationLabel(editorialVideos.selection.publishAt)).toBe("22 ottobre, ore 20:00 (ora italiana)");
    expect(editorialVideoPublicationLabel(editorialVideos.cash.publishAt)).toBe("26 ottobre, ore 20:00 (ora italiana)");
    expect(editorialVideoPublicationLabel(editorialVideos.migration.publishAt)).toBe("30 ottobre, ore 20:00 (ora italiana)");
    expect(editorialVideoIsDue(editorialVideos.selection.publishAt, Date.parse("2026-10-22T17:59:59Z"))).toBe(false);
    expect(editorialVideoIsDue(editorialVideos.selection.publishAt, Date.parse("2026-10-22T18:00:00Z"))).toBe(true);
    expect(editorialVideoIsDue(editorialVideos.cash.publishAt, Date.parse("2026-10-26T18:59:59Z"))).toBe(false);
    expect(editorialVideoIsDue(editorialVideos.cash.publishAt, Date.parse("2026-10-26T19:00:00Z"))).toBe(true);
  });
});
