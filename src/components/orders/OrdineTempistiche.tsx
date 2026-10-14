import { InlineEditableDatesCard } from "./InlineEditableDatesCard";

interface OrdineTempIsticheProps {
  orderId: string;
  expectedDate?: string | null;
  warehouseArrivalDate?: string | null;
  workStartDate?: string | null;
  workEndDate?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  updatedAt?: string | null;
  onOpenSchedule?: () => void;
  orderCode?: string | null;
  orderDescription?: string | null;
  defaultAddress?: string | null;
}

export function OrdineTempistiche({
  orderId,
  expectedDate,
  warehouseArrivalDate,
  workStartDate,
  workEndDate,
  workStartTime,
  workEndTime,
  updatedAt,
  onOpenSchedule,
  orderCode,
  orderDescription,
  defaultAddress,
}: OrdineTempIsticheProps) {
  return (
    <InlineEditableDatesCard
      orderId={orderId}
      expectedDate={expectedDate}
      warehouseArrivalDate={warehouseArrivalDate}
      workStartDate={workStartDate}
      workEndDate={workEndDate}
      workStartTime={workStartTime}
      workEndTime={workEndTime}
      updatedAt={updatedAt}
      onOpenSchedule={onOpenSchedule}
      orderCode={orderCode}
      orderDescription={orderDescription}
      defaultAddress={defaultAddress}
    />
  );
}
