const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = 1;

let dataRoot = "";

function ensureBootstrapped() {
  if (!dataRoot) {
    throw new Error("Storage not initialized. Call bootstrap first.");
  }
}

function rootPaths() {
  ensureBootstrapped();
  const templatesRoot = path.join(dataRoot, "templates");
  return {
    data: dataRoot,
    templates: templatesRoot,
    templatesBuiltin: path.join(templatesRoot, "builtin"),
    templatesUser: path.join(templatesRoot, "user"),
    projects: path.join(dataRoot, "projects"),
    profiles: path.join(dataRoot, "profiles"),
    preferences: path.join(dataRoot, "app-preferences.json")
  };
}

async function readJson(filePath) {
  const payload = await fs.readFile(filePath, "utf8");
  return JSON.parse(payload);
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validateSchema(entity, sourceName) {
  if (!entity || typeof entity !== "object") {
    throw new Error(`Invalid JSON shape in ${sourceName}`);
  }
  if (entity.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion in ${sourceName}. Expected ${SCHEMA_VERSION}.`);
  }
}

function listJsonFiles(dirPath) {
  if (!fsSync.existsSync(dirPath)) {
    return [];
  }
  return fsSync
    .readdirSync(dirPath)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(dirPath, entry));
}

async function seedBuiltinTemplates(appPathname) {
  const { templatesBuiltin } = rootPaths();
  const sourceBuiltin = path.join(appPathname, "data", "templates", "builtin");
  const builtinFiles = listJsonFiles(sourceBuiltin);

  await Promise.all(
    builtinFiles.map(async (sourcePath) => {
      const fileName = path.basename(sourcePath);
      const targetPath = path.join(templatesBuiltin, fileName);
      if (!fsSync.existsSync(targetPath)) {
        await fs.copyFile(sourcePath, targetPath);
      }
    })
  );
}

async function seedDefaultPreferences() {
  const { preferences } = rootPaths();
  if (fsSync.existsSync(preferences)) {
    return;
  }

  const timestamp = new Date().toISOString();
  await writeJson(preferences, {
    id: "app_preferences",
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    displayUnit: "in",
    defaultRounding: {
      stitch: { mode: "nearest", step: 2 },
      row: { mode: "nearest", step: 1 }
    }
  });
}

async function bootstrap({ userDataRoot, appPath }) {
  dataRoot = path.join(userDataRoot, "data");
  const paths = rootPaths();

  await Promise.all([
    fs.mkdir(paths.templatesBuiltin, { recursive: true }),
    fs.mkdir(paths.templatesUser, { recursive: true }),
    fs.mkdir(paths.projects, { recursive: true }),
    fs.mkdir(paths.profiles, { recursive: true })
  ]);

  await Promise.all([seedBuiltinTemplates(appPath), seedDefaultPreferences()]);
}

async function listTemplates() {
  const { templatesBuiltin, templatesUser } = rootPaths();
  const paths = [...listJsonFiles(templatesBuiltin), ...listJsonFiles(templatesUser)];
  const templates = await Promise.all(paths.map(async (entry) => readJson(entry)));
  templates.forEach((template, index) => validateSchema(template, paths[index]));
  return templates;
}

async function listProjects() {
  const { projects } = rootPaths();
  const projectFiles = listJsonFiles(projects);
  const loaded = await Promise.all(projectFiles.map(async (filePath) => readJson(filePath)));
  loaded.forEach((project, index) => validateSchema(project, projectFiles[index]));

  return loaded
    .map((project) => ({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function loadProject(projectId) {
  const { projects } = rootPaths();
  const filePath = path.join(projects, `${projectId}.json`);
  if (!fsSync.existsSync(filePath)) {
    throw new Error(`Project ${projectId} not found.`);
  }
  const project = await readJson(filePath);
  validateSchema(project, filePath);
  return project;
}

async function saveProject(project) {
  if (!project.id || typeof project.id !== "string") {
    throw new Error("Project must include id.");
  }
  project.schemaVersion = SCHEMA_VERSION;
  project.updatedAt = new Date().toISOString();

  const { projects } = rootPaths();
  await writeJson(path.join(projects, `${project.id}.json`), project);
  return project;
}

async function deleteProject(projectId) {
  const { projects } = rootPaths();
  const filePath = path.join(projects, `${projectId}.json`);
  if (fsSync.existsSync(filePath)) {
    await fs.unlink(filePath);
  }
}

module.exports = {
  bootstrap,
  listTemplates,
  listProjects,
  loadProject,
  saveProject,
  deleteProject
};
