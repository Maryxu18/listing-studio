"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md px-2 py-0.5 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
