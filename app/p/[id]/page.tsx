import { notFound } from "next/navigation";
import { loadProject } from "@/lib/store/projects";
import { ProjectWorkspace } from "@/components/project-workspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: PageProps<"/p/[id]">) {
  const { id: raw } = await params;
  // Route params reach a page still percent-encoded on a hard navigation.
  const id = safeDecode(raw);
  try {
    await loadProject(id);
  } catch {
    notFound();
  }
  return <ProjectWorkspace projectId={id} />;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
