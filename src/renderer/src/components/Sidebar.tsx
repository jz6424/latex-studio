import { useState, type ReactNode } from 'react'
import { TOOL_CATEGORIES } from '../model/tools'
import { HEADING_LEVELS } from '../model/headings'
import { useDocStore } from '../model/store'
import type { ToolDef } from '../model/types'
import SidebarTool from './SidebarTool'
import './Sidebar.css'

// Sections that aren't tool categories still need a stable key for the
// collapsed-state map, so they're named here rather than inline.
const DOC_PROPERTIES = 'Document Properties'
const DOC_STRUCTURE = 'Document Structure'

/** The tool palette, plus document-level settings that have nowhere better to
 * live. Sections collapse independently, and a search query flattens across
 * all of them. */
export default function Sidebar(): JSX.Element {
  const [query, setQuery] = useState('')
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const addHeadingBlock = useDocStore((s) => s.addHeadingBlock)
  const title = useDocStore((s) => s.doc.title)
  const setTitle = useDocStore((s) => s.setTitle)

  const search = query.trim().toLowerCase()

  const toggleSection = (name: string): void => setCollapsedSections((c) => ({ ...c, [name]: !c[name] }))

  // Searching should always reveal matches, regardless of a section's collapsed
  // state — otherwise a match inside a collapsed section would be invisible
  // with no indication it exists. The collapsed state itself is preserved, so
  // clearing the search restores whatever was open before.
  const isCollapsed = (name: string): boolean => !search && Boolean(collapsedSections[name])

  const headingLevels = search
    ? HEADING_LEVELS.filter((h) => h.label.toLowerCase().includes(search))
    : HEADING_LEVELS

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title gradient-text">Tools</span>
        <input
          className="sidebar-search"
          placeholder="Search symbols…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="sidebar-scroll">
        {TOOL_CATEGORIES.map((category) => {
          const tools = matchingTools(category.tools, search)
          // Hide a category entirely when nothing in it matches, rather than
          // leaving an empty header behind.
          if (tools.length === 0) return null
          return (
            <SidebarSection
              key={category.name}
              title={category.name}
              collapsed={isCollapsed(category.name)}
              onToggle={() => toggleSection(category.name)}
            >
              <div className="sidebar-grid">
                {tools.map((tool) => (
                  <SidebarTool tool={tool} key={tool.id} />
                ))}
              </div>
            </SidebarSection>
          )
        })}

        <SidebarSection
          title={DOC_PROPERTIES}
          // Not search-aware: this is a settings field, not something a symbol
          // search should be expanding or hiding.
          collapsed={Boolean(collapsedSections[DOC_PROPERTIES])}
          onToggle={() => toggleSection(DOC_PROPERTIES)}
        >
          <label className="sidebar-field">
            <span className="sidebar-field-label">Title</span>
            <input
              className="sidebar-field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled Document"
            />
          </label>
        </SidebarSection>

        {headingLevels.length > 0 && (
          <SidebarSection
            title={DOC_STRUCTURE}
            collapsed={isCollapsed(DOC_STRUCTURE)}
            onToggle={() => toggleSection(DOC_STRUCTURE)}
          >
            {/* Headings are inserted by click, not drag — they're always
                whole blocks, never something dropped inside an equation. */}
            <div className="sidebar-structure-list">
              {headingLevels.map((h) => (
                <button
                  type="button"
                  key={h.level}
                  className="sidebar-structure-btn"
                  title={`Insert a ${h.label.toLowerCase()} heading block`}
                  onClick={() => addHeadingBlock(h.level)}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </SidebarSection>
        )}
      </div>

      <div className="sidebar-hint">Drag a tool onto the page, or a slot in an equation, to place it.</div>
    </aside>
  )
}

/** Matches on both the display label and the LaTeX, so a tool is findable by
 * either its name ("Fraction") or its command ("\frac"). */
function matchingTools(tools: ToolDef[], search: string): ToolDef[] {
  if (!search) return tools
  return tools.filter(
    (t) => t.label.toLowerCase().includes(search) || t.latexPreview.toLowerCase().includes(search)
  )
}

function SidebarSection({
  title,
  collapsed,
  onToggle,
  children
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <div className="sidebar-category" data-collapsed={collapsed || undefined}>
      <button type="button" className="sidebar-category-header" onClick={onToggle} aria-expanded={!collapsed}>
        <span className="sidebar-category-chevron" data-collapsed={collapsed || undefined}>
          ▸
        </span>
        <span className="sidebar-category-label">{title}</span>
      </button>
      {!collapsed && children}
    </div>
  )
}
