import { ProjectPageClient } from "@/components/project-page/ProjectPageClient";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectPageClient projectId={projectId} />;
}
