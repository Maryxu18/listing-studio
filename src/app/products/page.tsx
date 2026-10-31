import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listProducts } from "@/lib/products";
import { EtsyBadge } from "@/components/EtsyBadge";

export default async function ProductsPage() {
  const session = await requireSession();
  const products = await listProducts(session.userId);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My products</h1>
          <p className="mt-1 text-stone-600">Every listing you&apos;ve confirmed, newest first.</p>
        </div>
        <Link href="/new" className="btn-primary">
          New listing
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="card mt-8 p-12 text-center">
          <p className="font-semibold">No products yet</p>
          <p className="mt-1 text-sm text-stone-500">Create a listing and confirm a recommendation to see it here.</p>
          <Link href="/new" className="btn-primary mt-5">
            Create your first listing
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} className="card group overflow-hidden transition hover:shadow-md">
              <div className="aspect-[4/3] overflow-hidden bg-stone-100">
                {p.imageUrls[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrls[0]} alt="" className="size-full object-cover transition group-hover:scale-[1.02]" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <EtsyBadge status={p.etsyStatus} />
                  <span className="text-xs text-stone-500">{p.createdAt.toLocaleDateString()}</span>
                </div>
                <p className="mt-2 line-clamp-2 font-semibold leading-snug">{p.title}</p>
                <p className="mt-1 text-sm text-stone-500">{p.input.name}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
