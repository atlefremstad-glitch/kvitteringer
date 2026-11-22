import { STATUS_LABEL, type ReceiptStatus } from "@/lib/types";

const STYLES: Record<ReceiptStatus, string> = {
  ok: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  needs_review: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  processing: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

export function StatusBadge({ status }: { status: ReceiptStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
