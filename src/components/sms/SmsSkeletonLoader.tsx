/**
 * @file SmsSkeletonLoader.tsx
 * @description Skeleton loader riutilizzabile per il modulo SMS transazionale.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { Skeleton } from "@/components/ui/skeleton";

interface SmsSkeletonLoaderProps {
  rows?: number;
  variant?: "table" | "cards" | "stats";
}

export function SmsSkeletonLoader({ rows = 5, variant = "table" }: SmsSkeletonLoaderProps) {
  if (variant === "stats") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  // variant === "table"
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 px-4 py-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48 flex-1" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 rounded-lg border bg-card items-center">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
