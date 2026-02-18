const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  storage: {
    bootstrap: () => ipcRenderer.invoke("storage:bootstrap"),
    listProjects: () => ipcRenderer.invoke("storage:list-projects"),
    loadProject: (projectId) => ipcRenderer.invoke("storage:load-project", projectId),
    saveProject: (project) => ipcRenderer.invoke("storage:save-project", project),
    deleteProject: (projectId) => ipcRenderer.invoke("storage:delete-project", projectId),
    listTemplates: () => ipcRenderer.invoke("storage:list-templates")
  }
});
