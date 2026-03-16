import { ProjectPageClient } from "@/components/project-page/ProjectPageClient";

export const dynamic = "force-dynamic";

interface ProjectPageProps {
  params: {
    projectId: string;
  };
}

export default function ProjectPage({ params }: ProjectPageProps) {
  return <ProjectPageClient projectId={params.projectId} />;
}

import { ProjectPageClient } from "@/components/project-page/ProjectPageClient";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  return <ProjectPageClient projectId={projectId} />;
}
