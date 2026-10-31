"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GenerationImage, GenerationView as View } from "@/lib/generations";
import { IMAGE_ROLES, IMAGES_PER_OPTION } from "@/lib/types";
import { CopyButton } from "./CopyButton";

const LETTERS = ["A", "B", "C"];

export function GenerationView({ initial }: { initial: View }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generating = view.status === "generating";

  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/generations/${view.id}`);
      if (res.ok) setView(await res.json());
    }, 2500);
    return () => clearInterval(timer);
  }, [generating, view.id]);

  const allImages = view.options?.flatMap((o) => o.images) ?? [];
  const doneImages = allImages.filter((i) => i.status !== "pending").length;

  async function confirm() {
    if (selected === null) return;
    setConfirming(true);
    setError(null);
    const res = await fetch(`/api/generations/${view.id}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionIndex: selected }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not save.");
      setConfirming(false);
      return;
    }
    router.push(`/products/${json.productId}`);
  }

  return (
    <div className="pb-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-500">Recommendations for</p>
          <h1 className="text-3xl font-bold tracking-tight">{view.input.name}</h1>
        </div>
        <div className="flex gap-2">
          {view.photoUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="Your photo" className="size-12 rounded-lg border border-stone-200 object-cover" />
          ))}
        </div>
      </div>

      {view.status === "failed" && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Generation failed.</p>
          <p className="mt-1">{view.error}</p>
          <Link href="/new" className="mt-3 inline-block font-semibold underline">
            Try again
          </Link>
        </div>
      )}

      {generating && (
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <Spinner />
          {view.options
            ? allImages.length < view.options.length * IMAGES_PER_OPTION
              ? `Copy is ready. The art director is planning each photo shoot (${doneImages} photos done so far)…`
              : `Shooting product photos: ${doneImages} of ${allImages.length} done…`
            : "Gemini is studying your product and writing 3 listing options…"}
        </div>
      )}

      {view.confirmedProductId && (
        <div className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          You already saved a recommendation from this batch.{" "}
          <Link href={`/products/${view.confirmedProductId}`} className="font-semibold underline">
            View product
          </Link>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {view.options
          ? view.options.map((option, i) => {
              const isSelected = selected === i;
              const readyCount = option.images.filter((img) => img.status === "ready").length;
              const selectable = !generating && !view.confirmedProductId && readyCount > 0;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => selectable && setSelected(i)}
                  onKeyDown={(e) => e.key === "Enter" && selectable && setSelected(i)}
                  className={`card flex flex-col overflow-hidden text-left transition ${
                    isSelected ? "ring-2 ring-brand-500" : selectable ? "cursor-pointer hover:border-stone-300 hover:shadow-md" : ""
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                          isSelected ? "bg-brand-500 text-white" : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {LETTERS[i]}
                      </span>
                      <span className="text-sm font-semibold text-stone-700">{option.angle}</span>
                    </div>
                    {isSelected && <span className="text-xs font-semibold text-brand-600">Selected</span>}
                  </div>

                  <ImageGrid images={option.images} generating={generating} />

                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Title · {option.title.length}/140</Label>
                        <CopyButton text={option.title} />
                      </div>
                      <p className="font-semibold leading-snug">{option.title}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Description</Label>
                        <CopyButton text={option.description} />
                      </div>
                      <Description text={option.description} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Tags · {option.tags.length}</Label>
                        <CopyButton text={option.tags.join(", ")} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {option.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mt-auto space-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
                      <p>
                        <span className="font-semibold text-stone-600">Primary keyword:</span> {option.primary_keyword}
                      </p>
                      <p>
                        <span className="font-semibold text-stone-600">For:</span> {option.target_audience}
                      </p>
                      {option.assumptions.length > 0 && (
                        <p>
                          <span className="font-semibold text-stone-600">Assumptions:</span> {option.assumptions.join("; ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          : Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} />)}
      </div>

      {view.status === "ready" && !view.confirmedProductId && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
            <p className="text-sm text-stone-600">
              {selected === null
                ? "Pick the option you like best."
                : `Option ${LETTERS[selected]} selected: "${view.options?.[selected].angle}"`}
              {error && <span className="ml-3 text-red-700">{error}</span>}
            </p>
            <button className="btn-primary px-6 py-3" disabled={selected === null || confirming} onClick={confirm}>
              {confirming ? "Saving…" : "Confirm & save to My products"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageGrid({ images, generating }: { images: GenerationImage[]; generating: boolean }) {
  if (images.length === 0) {
    if (!generating) {
      return <div className="bg-stone-50 p-4 text-center text-xs text-stone-500">Photos could not be generated for this option.</div>;
    }
    // Shot list not planned yet: placeholders in the final layout.
    images = Array.from({ length: IMAGES_PER_OPTION }, (_, position) => ({ position, status: "pending", url: null, prompt: "" }));
  }
  const [hero, ...rest] = images;
  return (
    <div className="grid grid-cols-4 gap-1 bg-stone-50 p-1">
      <div className="col-span-4">
        <ImageTile image={hero} large />
      </div>
      {rest.map((img) => (
        <ImageTile key={img.position} image={img} />
      ))}
    </div>
  );
}

function ImageTile({ image, large }: { image: GenerationImage; large?: boolean }) {
  const base = `aspect-square w-full overflow-hidden ${large ? "rounded-t-xl" : "rounded-md"}`;
  if (image.status === "ready" && image.url) {
    return (
      <a href={image.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`relative block ${base}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={image.prompt} title={image.prompt} className="size-full object-cover" />
        <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {IMAGE_ROLES[image.position]}
        </span>
      </a>
    );
  }
  if (image.status === "failed") {
    return (
      <div className={`${base} grid place-items-center bg-stone-100 text-xs text-stone-400`} title="This image could not be generated">
        Failed
      </div>
    );
  }
  return <div className={`${base} animate-pulse bg-stone-200`} />;
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className={`whitespace-pre-line text-sm text-stone-700 ${open ? "" : "line-clamp-5"}`}>{text}</p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="mt-1 text-xs font-semibold text-brand-600 hover:underline"
      >
        {open ? "Show less" : "Read full description"}
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-semibold tracking-wide text-stone-400 uppercase">{children}</p>;
}

function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-square animate-pulse bg-stone-200" />
      <div className="space-y-3 p-5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-stone-200" />
        <div className="h-3 w-full animate-pulse rounded bg-stone-100" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-stone-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-stone-100" />
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
