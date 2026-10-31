import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getProduct } from "@/lib/products";
import { CopyButton } from "@/components/CopyButton";
import { EtsyBadge } from "@/components/EtsyBadge";
import { EtsyPanel } from "@/components/EtsyPanel";
import { getConnection } from "@/lib/etsy";

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  const session = await requireSession();
  const { id } = await params;
  const product = await getProduct(id, session.userId);
  if (!product) notFound();
  const connection = await getConnection(session.userId);
  const { etsy_error } = await searchParams;
  // Prefill the Etsy price from whatever the seller typed, e.g. "$32" -> "32".
  const defaultPrice = product.input.price?.match(/\d+(?:[.,]\d{1,2})?/)?.[0].replace(",", ".") ?? "";

  const details = [
    ["Category", product.input.category],
    ["Materials", product.input.materials],
    ["Price", product.input.price],
    ["Keywords", product.input.keywords],
    ["Audience", product.input.audience],
  ].filter((d): d is [string, string] => Boolean(d[1]));

  return (
    <div>
      <Link href="/products" className="text-sm font-medium text-stone-500 hover:text-stone-800">
        ← My products
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrls[0]} alt={product.title} className="aspect-square w-full rounded-2xl object-cover" />
          <div className="grid grid-cols-4 gap-2">
            {product.imageUrls.slice(1).map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="aspect-square w-full rounded-xl object-cover" />
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <EtsyBadge status={product.etsyStatus} />
              {product.publishedAt && product.etsyStatus !== "not_published" && (
                <span className="text-xs text-stone-500">updated {product.publishedAt.toLocaleString()}</span>
              )}
            </div>
            <EtsyPanel
              productId={product.id}
              status={product.etsyStatus}
              etsyUrl={product.etsyUrl}
              listingId={product.etsyListingId}
              shopName={connection?.shopName ?? null}
              connected={Boolean(connection)}
              defaultPrice={defaultPrice}
              error={typeof etsy_error === "string" ? etsy_error : undefined}
            />
          </div>

          <Section title={`Title · ${product.title.length}/140`} copy={product.title}>
            <h1 className="text-xl font-bold leading-snug">{product.title}</h1>
          </Section>

          <Section title={`Tags · ${product.tags.length}`} copy={product.tags.join(", ")}>
            <div className="flex flex-wrap gap-1.5">
              {product.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700">
                  {tag}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Description" copy={product.description}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-stone-700">{product.description}</p>
          </Section>

          <div className="card p-5">
            <p className="mb-3 text-xs font-semibold tracking-wide text-stone-400 uppercase">What you submitted</p>
            <dl className="space-y-2 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[6rem_1fr] gap-2">
                  <dt className="text-stone-500">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex gap-2">
              {product.sourcePhotoUrls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="Original photo" className="size-16 rounded-lg border border-stone-200 object-cover" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-stone-400 uppercase">{title}</p>
        <CopyButton text={copy} />
      </div>
      {children}
    </div>
  );
}
