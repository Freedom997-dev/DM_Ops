import { REASON_ICON_COMPONENTS, type ReasonIcon } from "@/lib/hk-reason-style";

/** The icon chosen for a check-out reason (door, bed, …). */
export function ReasonIconView({ icon, className }: { icon: ReasonIcon; className?: string }) {
  const { Icon } = REASON_ICON_COMPONENTS[icon];
  return <Icon className={className} aria-hidden />;
}
