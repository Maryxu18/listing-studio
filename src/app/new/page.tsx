import { NewProductForm } from "@/components/NewProductForm";

export default function NewListingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">New listing</h1>
      <p className="mt-1 text-stone-600">
        Tell us about your product. We&apos;ll write 3 listing options with SEO titles, descriptions and tags, plus 5
        product photos for each.
      </p>
      <NewProductForm />
    </div>
  );
}
