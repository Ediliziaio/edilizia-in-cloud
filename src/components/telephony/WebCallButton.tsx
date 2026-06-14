import { Button, type ButtonProps } from "@/components/ui/button";
import { Phone } from "lucide-react";
import { useSoftphoneOptional } from "./SoftphoneProvider";

interface WebCallButtonProps {
  phone?: string | null;
  name?: string | null;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  iconOnly?: boolean;
}

/**
 * Chiama dal browser parlando tu (centralina WebRTC). Se il provider softphone
 * non è montato (es. fuori dal CompanyLayout), ripiega su `tel:` (apre il telefono).
 */
export function WebCallButton({
  phone,
  name,
  label = "Chiama",
  variant = "outline",
  size = "sm",
  className,
  iconOnly = false,
}: WebCallButtonProps) {
  const softphone = useSoftphoneOptional();
  const disabled = !phone;
  const busy = softphone?.status && softphone.status !== "idle";

  const onClick = () => {
    if (!phone) return;
    if (softphone) softphone.startCall(phone, { name: name ?? undefined });
    else window.open(`tel:${phone}`, "_self");
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || !!busy}
      onClick={onClick}
      title={disabled ? "Numero mancante" : label}
    >
      <Phone className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5 mr-2"} />
      {!iconOnly && label}
    </Button>
  );
}
