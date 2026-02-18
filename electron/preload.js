const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  storage: {
    bootstrap: () => ipcRenderer.invoke("storage:bootstrap"),
    listProjects: () => ipcRenderer.invoke("storage:list-projects"),
    loadProject: (projectId) => ipcRenderer.invoke("storage:load-project", projectId),
    saveProject: (project) => ipcRenderer.invoke("storage:save-project", project),
    deleteProject: (projectId) => ipcRenderer.invoke("storage:delete-project", projectId),
    listTemplates: () => ipcRenderer.invoke("storage:list-templates"),
    saveTemplate: (template) => ipcRenderer.invoke("storage:save-template", template),
    deleteTemplate: (templateId) => ipcRenderer.invoke("storage:delete-template", templateId),
    listProfiles: (kind) => ipcRenderer.invoke("storage:list-profiles", kind),
    saveProfile: (kind, profile) => ipcRenderer.invoke("storage:save-profile", kind, profile),
    deleteProfile: (kind, profileId) => ipcRenderer.invoke("storage:delete-profile", kind, profileId),
    getPreferences: () => ipcRenderer.invoke("storage:get-preferences"),
    savePreferences: (preferences) => ipcRenderer.invoke("storage:save-preferences", preferences)
  }
});
