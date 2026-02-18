const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const storage = require("./storage");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function registerIpcHandlers() {
  ipcMain.handle("storage:bootstrap", async () => {
    await storage.bootstrap({
      userDataRoot: app.getPath("userData"),
      appPath: app.getAppPath()
    });
  });

  ipcMain.handle("storage:list-projects", async () => storage.listProjects());
  ipcMain.handle("storage:load-project", async (_event, projectId) => storage.loadProject(projectId));
  ipcMain.handle("storage:save-project", async (_event, project) => storage.saveProject(project));
  ipcMain.handle("storage:delete-project", async (_event, projectId) => storage.deleteProject(projectId));
  ipcMain.handle("storage:list-templates", async () => storage.listTemplates());
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
