import type { Project, ProjectSummary, Template } from "../types/models";

export const storageApi = {
  bootstrap: (): Promise<void> => window.desktopApi.storage.bootstrap(),
  listProjects: (): Promise<ProjectSummary[]> => window.desktopApi.storage.listProjects(),
  loadProject: (projectId: string): Promise<Project> => window.desktopApi.storage.loadProject(projectId),
  saveProject: (project: Project): Promise<Project> => window.desktopApi.storage.saveProject(project),
  deleteProject: (projectId: string): Promise<void> => window.desktopApi.storage.deleteProject(projectId),
  listTemplates: (): Promise<Template[]> => window.desktopApi.storage.listTemplates()
};
