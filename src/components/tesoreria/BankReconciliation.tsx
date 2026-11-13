import TransactionsFeed from "./TransactionsFeed";

/** Reconciliation uses the same register, filters and movement detail as Transactions. */
export default function BankReconciliation({
  companyId,
  refreshKey = 0,
}: {
  companyId: string;
  refreshKey?: number;
}) {
  return (
    <TransactionsFeed
      companyId={companyId}
      refreshKey={refreshKey}
      mode="reconcile"
    />
  );
}
