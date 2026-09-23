/// <reference types="vite/client" />
export {}

declare global {
  interface Window {
    /**
     * Injected by the preload script (see src/preload/index.ts) — that file is
     * the implementation this type must be kept in step with.
     */
    api: {
      exportPdf: (docTitle: string) => Promise<{ canceled: boolean; filePath?: string }>
      compileLatex: (texSource: string) => Promise<{ success: boolean; pdfBase64?: string; log?: string }>
      listProjects: () => Promise<{ id: string; title: string; updatedAt: number }[]>
      saveProject: (id: string, title: string, doc: unknown) => Promise<void>
      loadProject: (id: string) => Promise<{ id: string; title: string; updatedAt: number; doc: unknown } | null>
      deleteProject: (id: string) => Promise<void>
    }
  }
}
