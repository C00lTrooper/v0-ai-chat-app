import { promises as fs } from "fs"
import path from "path"
import { ProjectSchema, type Project } from "./project-schema"

export function getProjectsDir() {
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

export type StoredProjectMetadata = {
  slug: string
  project_name: string
  summary_name: string
  objective: string
  target_date: string
}

export async function listProjects(): Promise<StoredProjectMetadata[]> {
  const projectsDir = getProjectsDir()

  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))

    const results: StoredProjectMetadata[] = []

    for (const file of files) {
      const slug = file.name.replace(/\.json$/i, "")
      try {
        const raw = await fs.readFile(path.join(projectsDir, file.name), "utf8")
        const json = JSON.parse(raw)
        const parsed = ProjectSchema.safeParse(json)
        if (!parsed.success) continue
        const project = parsed.data
        results.push({
          slug,
          project_name: project.project_name,
          summary_name: project.project_summary.name,
          objective: project.project_summary.objective,
          target_date: project.project_summary.target_date,
        })
      } catch {
        // Skip unreadable or invalid files
      }
    }

    // Sort newest first by slug (roughly by creation timestamp)
    return results.sort((a, b) => a.project_name.localeCompare(b.project_name))
  } catch {
    return []
  }
}

export async function loadProjectBySlug(slug: string): Promise<Project | null> {
  if (!slug) return null

  const projectsDir = getProjectsDir()
  const filePath = path.join(projectsDir, `${slug}.json`)

  try {
    const raw = await fs.readFile(filePath, "utf8")
    const json = JSON.parse(raw)
    const parsed = ProjectSchema.safeParse(json)

    if (!parsed.success) {
      return null
    }

    return parsed.data
  } catch {
    return null
  }
}


