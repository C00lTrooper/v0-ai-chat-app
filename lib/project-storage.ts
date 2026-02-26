import { promises as fs } from "fs"
import path from "path"
import { ProjectSchema, type Project } from "./project-schema"

function getProjectsDir() {
  return path.join(process.cwd(), "projects")
}

function slugifyBaseName(baseName: string, fallback: string) {
  const slug =
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback

  return slug
}

export function deriveProjectSlug(project: Project, timestamp = Date.now()) {
  const baseName =
    project.project_name ||
    project.project_summary.name ||
    `project-${timestamp}`

  return slugifyBaseName(baseName, `project-${timestamp}`)
}

export async function validateAndSaveProject(json: unknown) {
  const parsed = ProjectSchema.safeParse(json)

  if (!parsed.success) {
    return {
      ok: false as const,
      issues: parsed.error.issues,
    }
  }

  const project = parsed.data
  const projectsDir = getProjectsDir()
  await fs.mkdir(projectsDir, { recursive: true })

  const slug = deriveProjectSlug(project)
  const filePath = path.join(projectsDir, `${slug}.json`)

  await fs.writeFile(filePath, JSON.stringify(project, null, 2), "utf8")

  return {
    ok: true as const,
    project,
    slug,
    filePath,
  }
}

