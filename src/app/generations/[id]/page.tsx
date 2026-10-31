import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getGenerationView } from "@/lib/generations";
import { GenerationView } from "@/components/GenerationView";

export default async function GenerationPage({ params }: PageProps<"/generations/[id]">) {
  const session = await requireSession();
  const { id } = await params;
  const view = await getGenerationView(id, session.userId);
  if (!view) notFound();

  return <GenerationView initial={view} />;
}
