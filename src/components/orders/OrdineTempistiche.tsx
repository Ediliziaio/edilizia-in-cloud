import { InlineEditableDatesCard } from "./InlineEditableDatesCard";

interface OrdineTempIsticheProps {
  orderId: string;
  expectedDate?: string | null;
  warehouseArrivalDate?: string | null;
  workStartDate?: string | null;
  workEndDate?: string | null;
}

export function OrdineTempistiche({
  orderId,
  expectedDate,
  warehouseArrivalDate,
  workStartDate,
  workEndDate,
}: OrdineTempIsticheProps) {
  return (
    <InlineEditableDatesCard
      orderId={orderId}
      expectedDate={expectedDate}
      warehouseArrivalDate={warehouseArrivalDate}
      workStartDate={workStartDate}
      workEndDate={workEndDate}
    />
  );
}
