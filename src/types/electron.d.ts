import type { Project, ProjectSummary, Template } from "./models";

declare global {
  interface Window {
    desktopApi: {
      storage: {
        bootstrap: () => Promise<void>;
        listProjects: () => Promise<ProjectSummary[]>;
        loadProject: (projectId: string) => Promise<Project>;
        saveProject: (project: Project) => Promise<Project>;
        deleteProject: (projectId: string) => Promise<void>;
        listTemplates: () => Promise<Template[]>;
      };
    };
  }
}

export {};
