import Link from "next/link";
import { getSession } from "@/lib/auth";

const steps = [
  { title: "Describe your product", body: "Name, details, materials, who it's for, and at least one photo." },
  { title: "Get 3 listing sets", body: "Each with an SEO title, description, 10 tags and 5 AI product photos." },
  { title: "Pick one and publish", body: "Save it to My products and push it to your Etsy shop in one click." },
];

export default async function Home() {
  const session = await getSession();

  return (
    <div className="py-10">
      <section className="mx-auto max-w-2xl text-center">
        <p className="mb-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
          Gemini copy · Ideogram photos
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Product listings that get found, written in a minute.
        </h1>
        <p className="mt-4 text-lg text-stone-600 text-pretty">
          Upload a photo and a few details. Listing Studio writes search-optimized titles, descriptions and tags, and
          shoots a fresh set of product photos for every option.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          {session ? (
            <>
              <Link href="/new" className="btn-primary px-6 py-3 text-base">
                Create a listing
              </Link>
              <Link href="/products" className="btn-secondary px-6 py-3 text-base">
                My products
              </Link>
            </>
          ) : (
            <>
              <Link href="/signup" className="btn-primary px-6 py-3 text-base">
                Get started free
              </Link>
              <Link href="/login" className="btn-secondary px-6 py-3 text-base">
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <div key={step.title} className="card p-6">
            <div className="mb-3 grid size-8 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
              {i + 1}
            </div>
            <h2 className="font-semibold">{step.title}</h2>
            <p className="mt-1 text-sm text-stone-600">{step.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
