import type { EtsyStatus } from "@/lib/products";

export function EtsyBadge({ status }: { status: EtsyStatus }) {
  if (status === "active") {
    return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Live on Etsy</span>;
  }
  if (status === "draft") {
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Etsy draft</span>;
  }
  return <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">Saved</span>;
}
