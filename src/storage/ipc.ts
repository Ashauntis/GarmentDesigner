import type { AppPreferences, GaugeProfile, PersonProfile, ProfileKind, Project, ProjectSummary, Template } from "../types/models";

export const storageApi = {
  bootstrap: (): Promise<void> => window.desktopApi.storage.bootstrap(),
  listProjects: (): Promise<ProjectSummary[]> => window.desktopApi.storage.listProjects(),
  loadProject: (projectId: string): Promise<Project> => window.desktopApi.storage.loadProject(projectId),
  saveProject: (project: Project): Promise<Project> => window.desktopApi.storage.saveProject(project),
  deleteProject: (projectId: string): Promise<void> => window.desktopApi.storage.deleteProject(projectId),
  listTemplates: (): Promise<Template[]> => window.desktopApi.storage.listTemplates(),
  listProfiles: (kind: ProfileKind): Promise<Array<PersonProfile | GaugeProfile>> => window.desktopApi.storage.listProfiles(kind),
  saveProfile: (kind: ProfileKind, profile: PersonProfile | GaugeProfile): Promise<PersonProfile | GaugeProfile> =>
    window.desktopApi.storage.saveProfile(kind, profile),
  deleteProfile: (kind: ProfileKind, profileId: string): Promise<void> => window.desktopApi.storage.deleteProfile(kind, profileId),
  getPreferences: (): Promise<AppPreferences> => window.desktopApi.storage.getPreferences(),
  savePreferences: (preferences: AppPreferences): Promise<AppPreferences> => window.desktopApi.storage.savePreferences(preferences)
};
