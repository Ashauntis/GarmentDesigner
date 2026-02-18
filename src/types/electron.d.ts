import type { AppPreferences, GaugeProfile, PersonProfile, ProfileKind, Project, ProjectSummary, Template } from "./models";

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
        saveTemplate: (template: Template) => Promise<Template>;
        deleteTemplate: (templateId: string) => Promise<void>;
        listProfiles: (kind: ProfileKind) => Promise<Array<PersonProfile | GaugeProfile>>;
        saveProfile: (kind: ProfileKind, profile: PersonProfile | GaugeProfile) => Promise<PersonProfile | GaugeProfile>;
        deleteProfile: (kind: ProfileKind, profileId: string) => Promise<void>;
        getPreferences: () => Promise<AppPreferences>;
        savePreferences: (preferences: AppPreferences) => Promise<AppPreferences>;
      };
    };
  }
}

export {};
