"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EtsyStatus } from "@/lib/products";

const WHO_MADE = [
  ["i_did", "I did"],
  ["collective", "A member of my shop"],
  ["someone_else", "Another company or person"],
] as const;
const WHEN_MADE = [
  ["made_to_order", "Made to order"],
  ["2020_2026", "2020 – 2026"],
  ["2010_2019", "2010 – 2019"],
  ["2007_2009", "2007 – 2009"],
  ["before_2007", "Before 2007"],
] as const;

type Props = {
  productId: string;
  status: EtsyStatus;
  etsyUrl: string | null;
  listingId: string | null;
  shopName: string | null;
  connected: boolean;
  defaultPrice: string;
  error?: string;
};

export function EtsyPanel({ productId, status, etsyUrl, listingId, shopName, connected, defaultPrice, error: initialError }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<null | "publish" | "activate">(null);
  const [error, setError] = useState(initialError ?? null);

  async function call(action: "publish" | "activate", body?: object) {
    setPending(action);
    setError(null);
    const res = await fetch(`/api/products/${productId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    setPending(null);
    if (!res.ok) {
      setError(json.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  const errorBox = error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;

  if (status === "active" && etsyUrl) {
    return (
      <div className="card p-5">
        <p className="text-sm text-stone-600">
          Live on Etsy{shopName && <> in <strong>{shopName}</strong></>} · listing #{listingId}
        </p>
        <a href={etsyUrl} target="_blank" rel="noreferrer" className="btn-primary mt-3 w-full">
          View listing on Etsy ↗
        </a>
      </div>
    );
  }

  if (status === "draft" && etsyUrl) {
    return (
      <div className="card p-5">
        <p className="text-sm text-stone-600">
          Saved as a <strong>draft</strong>
          {shopName && <> in <strong>{shopName}</strong></>} · listing #{listingId}. Only you can see it.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a href={etsyUrl} target="_blank" rel="noreferrer" className="btn-primary">
            Open draft on Etsy ↗
          </a>
          <button className="btn-secondary" disabled={pending !== null} onClick={() => call("activate")}>
            {pending === "activate" ? "Making live…" : "Make live on Etsy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Making it live publishes it on etsy.com and Etsy charges your shop its listing fee (usually $0.20).
        </p>
        {errorBox}
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="card p-5">
        <p className="text-sm text-stone-600">Connect your Etsy shop to publish this listing.</p>
        <a href={`/api/etsy/connect?next=/products/${productId}`} className="btn-primary mt-3 w-full">
          Connect Etsy shop
        </a>
        {errorBox}
      </div>
    );
  }

  return (
    <form
      className="card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        call("publish", {
          price: form.get("price"),
          quantity: Number(form.get("quantity")),
          whoMade: form.get("whoMade"),
          whenMade: form.get("whenMade"),
        });
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Publish to {shopName ?? "your Etsy shop"}</p>
        <button
          type="button"
          className="text-xs text-stone-500 hover:text-stone-800"
          onClick={async () => {
            await fetch("/api/etsy/disconnect", { method: "POST" });
            router.refresh();
          }}
        >
          Disconnect
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-600">Price (shop currency)</span>
          <input name="price" type="number" min="0.2" step="0.01" required defaultValue={defaultPrice} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-600">Quantity</span>
          <input name="quantity" type="number" min="1" max="999" step="1" required defaultValue={1} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-600">Who made it?</span>
          <select name="whoMade" className="input" defaultValue="i_did">
            {WHO_MADE.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-600">When was it made?</span>
          <select name="whenMade" className="input" defaultValue="made_to_order">
            {WHEN_MADE.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="btn-primary mt-4 w-full" disabled={pending !== null}>
        {pending === "publish" ? "Creating Etsy draft and uploading photos…" : "Publish to Etsy as draft (free)"}
      </button>
      {errorBox}
    </form>
  );
}
