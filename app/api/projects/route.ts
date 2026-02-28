import { listProjects, validateAndSaveProject } from "@/lib/project-storage"

export async function GET() {
  try {
    const projects = await listProjects()
    return new Response(
      JSON.stringify({
        ok: true,
        projects,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to list projects",
        details: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json()

    const result = await validateAndSaveProject(json)
    if (!result.ok) {
      return new Response(
        JSON.stringify({
          error: "Invalid project JSON",
          issues: result.issues,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        filePath: `projects/${result.slug}.json`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to save project",
        details: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

