import { useEffect, useState } from 'react'

interface ProjectSummary {
  id: string
  title: string
  updatedAt: number
}

function formatUpdatedAt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

interface Props {
  onCreateProject: () => void
  onOpenProject: (id: string) => void
}

export default function HomePage({ onCreateProject, onOpenProject }: Props): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.listProjects().then((list) => {
      if (!cancelled) setProjects(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDelete(e: React.MouseEvent, id: string): Promise<void> {
    e.stopPropagation()
    // Optimistic — the list is small and local, no need to wait on the round
    // trip before it looks deleted.
    setProjects((current) => current?.filter((p) => p.id !== id) ?? current)
    await window.api.deleteProject(id)
  }

  return (
    <div className="home-shell">
      <div className="home-hero">
        <span className="app-logo home-logo">∫</span>
        <h1 className="gradient-text home-title">LaTeX Studio</h1>
        <p className="home-subtitle">Drag-and-drop widgets, real pdflatex compiling, one polished page.</p>
      </div>

      <div className="home-project-grid">
        <button type="button" className="home-new-project" onClick={onCreateProject}>
          <span className="home-new-project-plus">+</span>
          <span className="home-new-project-label">New Project</span>
        </button>

        {projects?.map((project) => (
          // A <div>, not a <button> — it contains its own delete button, and
          // a <button> can't nest another interactive control.
          <div
            key={project.id}
            className="home-project-card"
            role="button"
            tabIndex={0}
            onClick={() => onOpenProject(project.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenProject(project.id)
            }}
          >
            <button
              type="button"
              className="home-project-delete"
              onClick={(e) => handleDelete(e, project.id)}
              aria-label={`Delete ${project.title}`}
              title="Delete project"
            >
              🗑
            </button>
            <span className="home-project-card-title">{project.title || 'Untitled Document'}</span>
            <span className="home-project-card-date">{formatUpdatedAt(project.updatedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
