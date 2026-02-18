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

function requireProfileKind(kind) {
  if (kind !== "person" && kind !== "gauge") {
    throw new Error(`Unsupported profile kind: ${kind}`);
  }
}

function profilePrefix(kind) {
  return kind === "person" ? "person_" : "gauge_";
}

function sanitizePersonProfile(profile, timestamp) {
  return {
    ...profile,
    measurementsCm: typeof profile.measurementsCm === "object" && profile.measurementsCm ? profile.measurementsCm : {},
    createdAt: profile.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function sanitizeGaugeProfile(profile, timestamp) {
  return {
    ...profile,
    stitchesPer10Cm: Number.isFinite(profile.stitchesPer10Cm) ? profile.stitchesPer10Cm : 0,
    rowsPer10Cm: Number.isFinite(profile.rowsPer10Cm) ? profile.rowsPer10Cm : 0,
    needle: typeof profile.needle === "string" ? profile.needle : "",
    notes: typeof profile.notes === "string" ? profile.notes : "",
    createdAt: profile.createdAt ?? timestamp,
    updatedAt: timestamp
  };
}

function normalizeCompletedRowsBySection(progress) {
  const raw = progress?.completedRowsBySection ?? {};
  const normalized = {};

  Object.entries(raw).forEach(([sectionId, value]) => {
    if (Array.isArray(value)) {
      const uniqueRows = new Set(value.filter((entry) => Number.isInteger(entry) && entry > 0));
      normalized[sectionId] = uniqueRows.size;
      return;
    }
    if (Number.isInteger(value) && value >= 0) {
      normalized[sectionId] = value;
      return;
    }
    normalized[sectionId] = 0;
  });

  return normalized;
}

function normalizePartialRowsBySection(progress) {
  const raw = progress?.activePartialRowBySection ?? {};
  const normalized = {};

  Object.entries(raw).forEach(([sectionId, value]) => {
    if (
      value &&
      Number.isInteger(value.rowNumber) &&
      value.rowNumber > 0 &&
      Number.isInteger(value.completedStitches) &&
      value.completedStitches >= 0
    ) {
      normalized[sectionId] = {
        rowNumber: value.rowNumber,
        completedStitches: value.completedStitches
      };
      return;
    }
    normalized[sectionId] = null;
  });

  return normalized;
}

function normalizeProject(project) {
  const normalized = { ...project };
  const sectionIds = (normalized.derived?.sectionRows ?? []).map((section) => section.sectionId);

  normalized.personProfileSnapshot = normalized.personProfileSnapshot ?? {
    sourceProfileId: normalized.personProfileId ?? null,
    sourceProfileUpdatedAt: null,
    name: "Unspecified Person Snapshot",
    measurementsCm: {}
  };

  normalized.gaugeProfileSnapshot = normalized.gaugeProfileSnapshot ?? {
    sourceProfileId: normalized.gaugeProfileId ?? null,
    sourceProfileUpdatedAt: null,
    name: "Unspecified Gauge Snapshot",
    stitchesPer10Cm: 0,
    rowsPer10Cm: 0,
    needle: "",
    notes: ""
  };

  const completedRowsBySection = normalizeCompletedRowsBySection(normalized.progress);
  const activePartialRowBySection = normalizePartialRowsBySection(normalized.progress);

  sectionIds.forEach((sectionId) => {
    if (completedRowsBySection[sectionId] === undefined) {
      completedRowsBySection[sectionId] = 0;
    }
    if (activePartialRowBySection[sectionId] === undefined) {
      activePartialRowBySection[sectionId] = null;
    }
  });

  normalized.progress = {
    completedRowsBySection,
    activePartialRowBySection
  };

  delete normalized.personProfileId;
  delete normalized.gaugeProfileId;

  return normalized;
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

async function saveTemplate(template) {
  if (!template || typeof template !== "object") {
    throw new Error("Template payload is required.");
  }
  if (template.isBuiltin) {
    throw new Error("Built-in templates are immutable. Use Save as New Template.");
  }

  const timestamp = new Date().toISOString();
  const existing = (await listTemplates()).find((entry) => entry.id === template.id);
  if (existing?.isBuiltin) {
    throw new Error("Cannot overwrite built-in template.");
  }

  const id = typeof template.id === "string" && template.id.startsWith("tpl_") ? template.id : `tpl_user_${Date.now()}`;
  const normalized = {
    ...template,
    id,
    schemaVersion: SCHEMA_VERSION,
    isBuiltin: false,
    createdAt: existing?.createdAt ?? template.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  const { templatesUser } = rootPaths();
  await writeJson(path.join(templatesUser, `${id}.json`), normalized);
  return normalized;
}

async function deleteTemplate(templateId) {
  const templates = await listTemplates();
  const target = templates.find((template) => template.id === templateId);

  if (!target) {
    return;
  }
  if (target.isBuiltin) {
    throw new Error("Cannot delete built-in template.");
  }

  const projects = await listProjects();
  const referenced = await Promise.all(
    projects.map(async (projectSummary) => {
      const project = await loadProject(projectSummary.id);
      return project.templateId === templateId;
    })
  );
  if (referenced.some(Boolean)) {
    throw new Error("Template is referenced by one or more projects.");
  }

  const { templatesUser } = rootPaths();
  const userPath = path.join(templatesUser, `${templateId}.json`);
  if (fsSync.existsSync(userPath)) {
    await fs.unlink(userPath);
  }
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
  return normalizeProject(project);
}

async function saveProject(project) {
  if (!project.id || typeof project.id !== "string") {
    throw new Error("Project must include id.");
  }
  const normalized = normalizeProject(project);
  normalized.schemaVersion = SCHEMA_VERSION;
  normalized.updatedAt = new Date().toISOString();

  const { projects } = rootPaths();
  await writeJson(path.join(projects, `${normalized.id}.json`), normalized);
  return normalized;
}

async function listProfiles(kind) {
  requireProfileKind(kind);
  const { profiles } = rootPaths();
  const prefix = profilePrefix(kind);
  const files = listJsonFiles(profiles).filter((filePath) => path.basename(filePath).startsWith(prefix));
  const loaded = await Promise.all(files.map(async (filePath) => readJson(filePath)));
  loaded.forEach((profile, index) => validateSchema(profile, files[index]));
  return loaded.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function saveProfile(kind, profile) {
  requireProfileKind(kind);
  const timestamp = new Date().toISOString();
  const prefix = profilePrefix(kind);
  const id = typeof profile.id === "string" && profile.id.startsWith(prefix) ? profile.id : `${prefix}${Date.now()}`;

  const base = {
    ...profile,
    id,
    schemaVersion: SCHEMA_VERSION
  };

  const normalized = kind === "person" ? sanitizePersonProfile(base, timestamp) : sanitizeGaugeProfile(base, timestamp);
  const { profiles } = rootPaths();
  await writeJson(path.join(profiles, `${normalized.id}.json`), normalized);
  return normalized;
}

async function deleteProfile(kind, profileId) {
  requireProfileKind(kind);
  const { profiles } = rootPaths();
  const filePath = path.join(profiles, `${profileId}.json`);
  if (fsSync.existsSync(filePath)) {
    await fs.unlink(filePath);
  }
}

async function getPreferences() {
  const { preferences } = rootPaths();
  const prefs = await readJson(preferences);
  validateSchema(prefs, preferences);
  return prefs;
}

async function savePreferences(preferences) {
  const existing = await getPreferences();
  const normalized = {
    ...existing,
    ...preferences,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString()
  };

  const { preferences: preferencesPath } = rootPaths();
  await writeJson(preferencesPath, normalized);
  return normalized;
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
  saveTemplate,
  deleteTemplate,
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  listProfiles,
  saveProfile,
  deleteProfile,
  getPreferences,
  savePreferences
};
