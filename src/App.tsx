import { useEffect, useMemo, useState } from "react";
import { storageApi } from "./storage/ipc";
import { deriveGaugeCounts } from "./domain/gauge";
import type { Project, ProjectSummary, Template } from "./types/models";

type ActiveTab = "instructions" | "chart";

const defaultRounding = {
  stitch: { mode: "nearest" as const, step: 2 },
  row: { mode: "nearest" as const, step: 1 }
};

function nowIso(): string {
  return new Date().toISOString();
}

function createDraftProject(template: Template | undefined, count: number): Project {
  const timestamp = nowIso();
  const id = `proj_${Date.now()}`;

  const gaugePreview = deriveGaugeCounts(
    {
      lengthCm: 50,
      stitchesPer10Cm: 20,
      rowsPer10Cm: 28
    },
    defaultRounding
  );

  return {
    id,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    name: `Project ${count + 1}`,
    templateId: template?.id ?? "tpl_scarf_builtin_v1",
    displayUnit: "in",
    roundingPolicy: defaultRounding,
    geometryOverrideCm: {
      points: [],
      edges: [],
      sections: [],
      constraints: []
    },
    derived: {
      edgeStitches: [{ edgeId: "preview_edge", count: gaugePreview.stitches }],
      sectionRows: [{ sectionId: "preview_section", count: gaugePreview.rows }]
    },
    instructions: [
      {
        id: "inst_001",
        rowStart: 1,
        rowEnd: 10,
        text: `Cast on ${gaugePreview.stitches} stitches and knit 10 rows`
      }
    ],
    progress: {
      completedRowsBySection: {}
    }
  };
}

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("instructions");
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === activeProject?.templateId),
    [activeProject?.templateId, templates]
  );

  async function refreshProjects() {
    const nextProjects = await storageApi.listProjects();
    setProjects(nextProjects);
  }

  useEffect(() => {
    const init = async () => {
      try {
        await storageApi.bootstrap();
        const [loadedTemplates] = await Promise.all([storageApi.listTemplates(), refreshProjects()]);
        setTemplates(loadedTemplates);
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : "Failed to initialize app data.";
        setError(message);
      }
    };

    void init();
  }, []);

  async function handleCreateProject() {
    try {
      const draft = createDraftProject(templates[0], projects.length);
      const saved = await storageApi.saveProject(draft);
      await refreshProjects();
      setActiveProject(saved);
      setError(null);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to create project.";
      setError(message);
    }
  }

  async function handleOpenProject(projectId: string) {
    try {
      const loaded = await storageApi.loadProject(projectId);
      setActiveProject(loaded);
      setError(null);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to open project.";
      setError(message);
    }
  }

  async function handleSaveProject() {
    if (!activeProject) {
      return;
    }
    const saved = await storageApi.saveProject({
      ...activeProject,
      updatedAt: nowIso()
    });
    await refreshProjects();
    setActiveProject(saved);
  }

  async function handleDeleteProject(projectId: string) {
    await storageApi.deleteProject(projectId);
    if (activeProject?.id === projectId) {
      setActiveProject(null);
    }
    await refreshProjects();
  }

  return (
    <div className="app-shell">
      <aside className="panel left-panel">
        <h1>Garment Designer MVP</h1>
        <button className="primary-btn" onClick={handleCreateProject}>
          New Project
        </button>
        <h2>Projects</h2>
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <button className="link-btn" onClick={() => handleOpenProject(project.id)}>
                {project.name}
              </button>
              <button className="danger-btn" onClick={() => handleDeleteProject(project.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>

        <h2>Templates</h2>
        <ul>
          {templates.map((template) => (
            <li key={template.id}>{template.name}</li>
          ))}
        </ul>
      </aside>

      <main className="panel center-panel">
        <h2>2D Design (Starter)</h2>
        {!activeProject && <p>Select or create a project to begin.</p>}
        {activeProject && (
          <>
            <label>
              Project Name
              <input
                value={activeProject.name}
                onChange={(event) => setActiveProject({ ...activeProject, name: event.target.value })}
              />
            </label>
            <p>
              Template: <strong>{selectedTemplate?.name ?? activeProject.templateId}</strong>
            </p>
            <p>
              Derived preview: {activeProject.derived.edgeStitches[0]?.count ?? 0} stitches,{" "}
              {activeProject.derived.sectionRows[0]?.count ?? 0} rows
            </p>
            <button className="primary-btn" onClick={handleSaveProject}>
              Save Project
            </button>
          </>
        )}
      </main>

      <section className="panel right-panel">
        <div className="tabs">
          <button className={activeTab === "instructions" ? "active-tab" : ""} onClick={() => setActiveTab("instructions")}>
            Instructions
          </button>
          <button className={activeTab === "chart" ? "active-tab" : ""} onClick={() => setActiveTab("chart")}>
            Chart
          </button>
        </div>

        {activeTab === "instructions" && (
          <ol>
            {activeProject?.instructions.map((instruction) => (
              <li key={instruction.id}>
                Rows {instruction.rowStart}-{instruction.rowEnd}: {instruction.text}
              </li>
            )) ?? <li>No instructions yet.</li>}
          </ol>
        )}

        {activeTab === "chart" && (
          <div className="chart-placeholder">
            <p>Chart panel placeholder for Epic F.</p>
            <p>Attach colorwork grids to sections here.</p>
          </div>
        )}
      </section>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
