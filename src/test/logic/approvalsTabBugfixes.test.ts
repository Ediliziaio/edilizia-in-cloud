import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tabSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/silvio-hub/ApprovalsTab.tsx"),
  "utf8",
);
const sharedSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/silvio-hub/shared.ts"),
  "utf8",
);

describe("ApprovalsTab — deep bugfix v2", () => {
  describe("P0 — window.confirm rimosso", () => {
    it("non usa più window.confirm() nativo", () => {
      expect(tabSource).not.toContain("window.confirm(");
    });

    it("usa AlertDialog + Dialog stilizzati", () => {
      expect(tabSource).toContain("ConfirmApprovalDialog");
      expect(tabSource).toContain('import {\n  Dialog,');
      expect(tabSource).toContain('AlertDialog,');
    });
  });

  describe("P0 — risk_level visibile + ordinamento priority", () => {
    it("PendingApproval type include risk_level + action_type + company_id", () => {
      expect(sharedSource).toContain("action_type?: string | null");
      expect(sharedSource).toContain("risk_level?: ApprovalRiskLevel | null");
      expect(sharedSource).toContain("company_id?: string | null");
    });

    it("badge rischio renderizzato con tone colorato", () => {
      expect(tabSource).toContain("RISK_BADGE");
      expect(tabSource).toContain("ShieldAlert");
      // Mostrato nella card
      expect(tabSource).toContain("{RISK_LABEL[risk]} risk");
    });

    it("RISK_WEIGHT applicato all'ordinamento per priorità", () => {
      expect(tabSource).toContain("RISK_WEIGHT");
      // L'ordinamento usa il peso
      expect(tabSource).toMatch(/sort\(\(a, b\) =>\s*\{[\s\S]+?RISK_WEIGHT/);
    });

    it("filtro select per risk_level disponibile", () => {
      expect(tabSource).toContain("riskFilter");
      expect(tabSource).toContain('<SelectTrigger className="h-8 w-[170px]');
    });
  });

  describe("P0 — Reject note (feedback self-learning)", () => {
    it("input Textarea per motivazione su reject", () => {
      expect(tabSource).toContain("rejectNote");
      expect(tabSource).toContain("Motivazione (consigliata)");
      // Passa la nota all'RPC (undefined → DB default NULL)
      expect(tabSource).toMatch(/p_resolution_note:\s*note\s*\?\?\s*(undefined|null)/);
    });

    it("il dialog approve non chiede note (no friction utile)", () => {
      // L'AlertDialog approve è senza textarea
      const approveBlock =
        tabSource.match(/if \(isApprove\)[\s\S]+?<AlertDialog[\s\S]+?<\/AlertDialog>/)?.[0] ?? "";
      expect(approveBlock).not.toContain("Textarea");
    });
  });

  describe("P0 — preview_md migliorato + context visibile", () => {
    it("font-mono rimosso dal preview principale", () => {
      const previewBlock = tabSource.match(/Preview markdown[\s\S]+?<\/div>/)?.[0] ?? "";
      expect(previewBlock).not.toContain("font-mono");
    });

    it("context renderizzato in <details> collapsibile", () => {
      expect(tabSource).toContain("Mostra contesto tecnico");
      expect(tabSource).toContain("approval.context");
    });
  });

  describe("P1 — countdown live alla scadenza", () => {
    it("calcola msToExpire + flag urgent/expired", () => {
      expect(tabSource).toContain("msToExpire");
      expect(tabSource).toContain("isUrgent");
      expect(tabSource).toContain("isExpired");
    });

    it("usa formatDistanceStrict da date-fns", () => {
      expect(tabSource).toContain("formatDistanceStrict");
    });

    it("highlight urgent (<15min) con ring + colore", () => {
      expect(tabSource).toContain("isUrgent && \"ring-1 ring-amber-200\"");
    });
  });

  describe("P3 — security re-auth password per critical", () => {
    it("ConfirmWithPasswordDialog usato per critical/red/high", () => {
      expect(tabSource).toContain("ConfirmWithPasswordDialog");
      // isCritical helper
      expect(tabSource).toContain("isCritical");
      expect(tabSource).toMatch(/needsPasswordAuth = .*isCritical/);
    });

    it("Reject non richiede mai re-auth (no danger)", () => {
      // needsPasswordAuth solo se status === "approved"
      expect(tabSource).toContain('status === "approved" && isCritical');
    });
  });

  describe("P3 — audit log esplicito client-side", () => {
    it("logAdminAuditAction chiamato in mutation onSuccess", () => {
      expect(tabSource).toContain("logAdminAuditAction");
      expect(tabSource).toContain('"silvio_approval.approve"');
      expect(tabSource).toContain('"silvio_approval.reject"');
    });

    it("audit details includono action_id, action_type, risk_level, company_id, note", () => {
      const auditBlock =
        tabSource.match(/logAdminAuditAction\(\{[\s\S]+?\}\);/)?.[0] ?? "";
      expect(auditBlock).toContain("action_id");
      expect(auditBlock).toContain("action_type");
      expect(auditBlock).toContain("risk_level");
      expect(auditBlock).toContain("resolution_note");
    });
  });

  describe("P4 — quality", () => {
    it("usa STATUS_LITERALS constants invece di magic strings", () => {
      expect(tabSource).toContain("STATUS_LITERALS = {");
      expect(tabSource).toContain('"approved"');
      expect(tabSource).toContain('"rejected"');
    });

    it("error handling: e.message invece di String(e)", () => {
      expect(tabSource).not.toContain('String(e)');
      expect(tabSource).toContain("e.message");
    });

    it("empty state usa il componente standard EmptyState", () => {
      expect(tabSource).toContain('import { EmptyState }');
      expect(tabSource).toContain('icon={CheckCircle2}');
      expect(tabSource).toContain('tone="success"');
    });

    it("invalida anche ai-operate-counters per rinfrescare il badge", () => {
      expect(tabSource).toContain('queryKey: ["ai-operate-counters"]');
    });

    it("skeleton multiple invece di una sola h-40", () => {
      // Cerca due Skeleton consecutive nel loading state
      expect(tabSource).toMatch(/<Skeleton className="h-40" \/>\s*<Skeleton className="h-40" \/>/);
    });
  });
});
