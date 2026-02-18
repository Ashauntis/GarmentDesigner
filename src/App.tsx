import { useEffect, useMemo, useState } from "react";
import { deriveGaugeCounts } from "./domain/gauge";
import { storageApi } from "./storage/ipc";
import type {
  AppPreferences,
  GaugeProfile,
  GaugeProfileSnapshot,
  PersonProfile,
  PersonProfileSnapshot,
  Project,
  ProjectSummary,
  RoundingMode,
  Template
} from "./types/models";

type Screen = "projects" | "profiles" | "design" | "instructions" | "settings";

interface PersonFormState {
  id?: string;
  name: string;
  bustCircumference: number;
  armLength: number;
  garmentLength: number;
}

interface GaugeFormState {
  id?: string;
  name: string;
  stitchesPer10Cm: number;
  rowsPer10Cm: number;
  needle: string;
  notes: string;
}

interface SettingsFormState {
  displayUnit: "in" | "cm";
  stitchMode: RoundingMode;
  stitchStep: number;
  rowMode: RoundingMode;
  rowStep: number;
}

const navigation: Array<{ screen: Screen; glyph: string; label: string }> = [
  { screen: "projects", glyph: "PJ", label: "Projects" },
  { screen: "profiles", glyph: "PF", label: "Profiles" },
  { screen: "design", glyph: "DS", label: "Design" },
  { screen: "instructions", glyph: "IN", label: "Instructions" },
  { screen: "settings", glyph: "ST", label: "Settings" }
];

function nowIso(): string {
  return new Date().toISOString();
}

function defaultPreferences(): AppPreferences {
  const timestamp = nowIso();
  return {
    id: "app_preferences",
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    displayUnit: "in",
    defaultRounding: {
      stitch: { mode: "nearest", step: 2 },
      row: { mode: "nearest", step: 1 }
    }
  };
}

function settingsFormFromPreferences(preferences: AppPreferences): SettingsFormState {
  return {
    displayUnit: preferences.displayUnit,
    stitchMode: preferences.defaultRounding.stitch.mode,
    stitchStep: preferences.defaultRounding.stitch.step,
    rowMode: preferences.defaultRounding.row.mode,
    rowStep: preferences.defaultRounding.row.step
  };
}

function personSnapshotFromProfile(profile?: PersonProfile): PersonProfileSnapshot {
  if (!profile) {
    return {
      sourceProfileId: null,
      sourceProfileUpdatedAt: null,
      name: "Draft Person Snapshot",
      measurementsCm: {
        bustCircumference: 96.5,
        armLength: 58,
        garmentLength: 58
      }
    };
  }

  return {
    sourceProfileId: profile.id,
    sourceProfileUpdatedAt: profile.updatedAt,
    name: profile.name,
    measurementsCm: profile.measurementsCm
  };
}

function gaugeSnapshotFromProfile(profile?: GaugeProfile): GaugeProfileSnapshot {
  if (!profile) {
    return {
      sourceProfileId: null,
      sourceProfileUpdatedAt: null,
      name: "Draft Gauge Snapshot",
      stitchesPer10Cm: 20,
      rowsPer10Cm: 28,
      needle: "US 8 / 5.0mm",
      notes: "Starter snapshot"
    };
  }

  return {
    sourceProfileId: profile.id,
    sourceProfileUpdatedAt: profile.updatedAt,
    name: profile.name,
    stitchesPer10Cm: profile.stitchesPer10Cm,
    rowsPer10Cm: profile.rowsPer10Cm,
    needle: profile.needle,
    notes: profile.notes
  };
}

function buildProjectDraft(input: {
  template?: Template;
  projectName: string;
  preferences: AppPreferences;
  personProfile?: PersonProfile;
  gaugeProfile?: GaugeProfile;
}): Project {
  const timestamp = nowIso();
  const id = `proj_${Date.now()}`;
  const personSnapshot = personSnapshotFromProfile(input.personProfile);
  const gaugeSnapshot = gaugeSnapshotFromProfile(input.gaugeProfile);
  const gaugePreview = deriveGaugeCounts(
    {
      lengthCm: 50,
      stitchesPer10Cm: gaugeSnapshot.stitchesPer10Cm,
      rowsPer10Cm: gaugeSnapshot.rowsPer10Cm
    },
    input.preferences.defaultRounding
  );

  return {
    id,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    name: input.projectName,
    templateId: input.template?.id ?? "tpl_scarf_builtin_v1",
    personProfileSnapshot: personSnapshot,
    gaugeProfileSnapshot: gaugeSnapshot,
    displayUnit: input.preferences.displayUnit,
    roundingPolicy: input.preferences.defaultRounding,
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
      completedRowsBySection: {
        preview_section: 0
      },
      activePartialRowBySection: {
        preview_section: null
      }
    }
  };
}

function emptyPersonForm(): PersonFormState {
  return {
    name: "",
    bustCircumference: 96.5,
    armLength: 58,
    garmentLength: 58
  };
}

function emptyGaugeForm(): GaugeFormState {
  return {
    name: "",
    stitchesPer10Cm: 20,
    rowsPer10Cm: 28,
    needle: "",
    notes: ""
  };
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("projects");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [personProfiles, setPersonProfiles] = useState<PersonProfile[]>([]);
  const [gaugeProfiles, setGaugeProfiles] = useState<GaugeProfile[]>([]);
  const [selectedPersonProfileId, setSelectedPersonProfileId] = useState<string>("");
  const [selectedGaugeProfileId, setSelectedGaugeProfileId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences());
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(settingsFormFromPreferences(defaultPreferences()));
  const [personForm, setPersonForm] = useState<PersonFormState>(emptyPersonForm());
  const [gaugeForm, setGaugeForm] = useState<GaugeFormState>(emptyGaugeForm());
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === activeProject?.templateId),
    [activeProject?.templateId, templates]
  );

  const selectedPersonProfile = useMemo(
    () => personProfiles.find((profile) => profile.id === selectedPersonProfileId),
    [personProfiles, selectedPersonProfileId]
  );

  const selectedGaugeProfile = useMemo(
    () => gaugeProfiles.find((profile) => profile.id === selectedGaugeProfileId),
    [gaugeProfiles, selectedGaugeProfileId]
  );

  async function refreshProjects() {
    const loadedProjects = await storageApi.listProjects();
    setProjects(loadedProjects);
  }

  async function refreshProfiles() {
    const [persons, gauges] = await Promise.all([
      storageApi.listProfiles("person") as Promise<PersonProfile[]>,
      storageApi.listProfiles("gauge") as Promise<GaugeProfile[]>
    ]);
    setPersonProfiles(persons);
    setGaugeProfiles(gauges);
    if (!selectedPersonProfileId && persons.length > 0) {
      setSelectedPersonProfileId(persons[0].id);
    }
    if (!selectedGaugeProfileId && gauges.length > 0) {
      setSelectedGaugeProfileId(gauges[0].id);
    }
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        await storageApi.bootstrap();
        const [loadedTemplates, loadedPreferences] = await Promise.all([storageApi.listTemplates(), storageApi.getPreferences()]);
        setTemplates(loadedTemplates);
        setPreferences(loadedPreferences);
        setSettingsForm(settingsFormFromPreferences(loadedPreferences));
        await Promise.all([refreshProjects(), refreshProfiles()]);
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : "Failed to initialize app data.";
        setError(message);
      }
    };

    void initialize();
  }, []);

  async function handleCreateProject() {
    try {
      const projectName = newProjectName.trim() || `Project ${projects.length + 1}`;
      const draft = buildProjectDraft({
        template: templates[0],
        projectName,
        preferences,
        personProfile: selectedPersonProfile,
        gaugeProfile: selectedGaugeProfile
      });
      const saved = await storageApi.saveProject(draft);
      await refreshProjects();
      setActiveProject(saved);
      setNewProjectName("");
      setScreen("design");
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
      setScreen("design");
      setError(null);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to open project.";
      setError(message);
    }
  }

  async function handleDeleteProject(projectId: string) {
    await storageApi.deleteProject(projectId);
    if (activeProject?.id === projectId) {
      setActiveProject(null);
    }
    await refreshProjects();
  }

  async function handleSaveProject() {
    if (!activeProject) {
      return;
    }
    const saved = await storageApi.saveProject({
      ...activeProject,
      updatedAt: nowIso()
    });
    setActiveProject(saved);
    await refreshProjects();
  }

  async function handleSavePersonProfile() {
    const timestamp = nowIso();
    const existing = personProfiles.find((profile) => profile.id === personForm.id);
    const toSave: PersonProfile = {
      id: personForm.id ?? `person_${Date.now()}`,
      schemaVersion: 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      name: personForm.name.trim() || "Unnamed Person",
      measurementsCm: {
        bustCircumference: personForm.bustCircumference,
        armLength: personForm.armLength,
        garmentLength: personForm.garmentLength
      }
    };
    const saved = (await storageApi.saveProfile("person", toSave)) as PersonProfile;
    await refreshProfiles();
    setSelectedPersonProfileId(saved.id);
    setPersonForm({
      id: saved.id,
      name: saved.name,
      bustCircumference: saved.measurementsCm.bustCircumference ?? 0,
      armLength: saved.measurementsCm.armLength ?? 0,
      garmentLength: saved.measurementsCm.garmentLength ?? 0
    });
  }

  async function handleDeletePersonProfile() {
    if (!personForm.id) {
      return;
    }
    await storageApi.deleteProfile("person", personForm.id);
    setPersonForm(emptyPersonForm());
    setSelectedPersonProfileId("");
    await refreshProfiles();
  }

  async function handleSaveGaugeProfile() {
    const timestamp = nowIso();
    const existing = gaugeProfiles.find((profile) => profile.id === gaugeForm.id);
    const toSave: GaugeProfile = {
      id: gaugeForm.id ?? `gauge_${Date.now()}`,
      schemaVersion: 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      name: gaugeForm.name.trim() || "Unnamed Gauge",
      stitchesPer10Cm: gaugeForm.stitchesPer10Cm,
      rowsPer10Cm: gaugeForm.rowsPer10Cm,
      needle: gaugeForm.needle,
      notes: gaugeForm.notes
    };
    const saved = (await storageApi.saveProfile("gauge", toSave)) as GaugeProfile;
    await refreshProfiles();
    setSelectedGaugeProfileId(saved.id);
    setGaugeForm({
      id: saved.id,
      name: saved.name,
      stitchesPer10Cm: saved.stitchesPer10Cm,
      rowsPer10Cm: saved.rowsPer10Cm,
      needle: saved.needle,
      notes: saved.notes ?? ""
    });
  }

  async function handleDeleteGaugeProfile() {
    if (!gaugeForm.id) {
      return;
    }
    await storageApi.deleteProfile("gauge", gaugeForm.id);
    setGaugeForm(emptyGaugeForm());
    setSelectedGaugeProfileId("");
    await refreshProfiles();
  }

  async function handleSaveSettings() {
    const saved = await storageApi.savePreferences({
      ...preferences,
      displayUnit: settingsForm.displayUnit,
      defaultRounding: {
        stitch: { mode: settingsForm.stitchMode, step: Math.max(settingsForm.stitchStep, 1) },
        row: { mode: settingsForm.rowMode, step: Math.max(settingsForm.rowStep, 1) }
      }
    });
    setPreferences(saved);
    setSettingsForm(settingsFormFromPreferences(saved));
    if (activeProject) {
      setActiveProject({
        ...activeProject,
        displayUnit: saved.displayUnit,
        roundingPolicy: saved.defaultRounding
      });
    }
  }

  function renderProjectsScreen() {
    return (
      <div className="screen-grid">
        <section className="surface">
          <h2>New Project</h2>
          <label>
            Project Name
            <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Blue Raglan" />
          </label>
          <label>
            Person Snapshot Source
            <select value={selectedPersonProfileId} onChange={(event) => setSelectedPersonProfileId(event.target.value)}>
              <option value="">No saved profile</option>
              {personProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Gauge Snapshot Source
            <select value={selectedGaugeProfileId} onChange={(event) => setSelectedGaugeProfileId(event.target.value)}>
              <option value="">No saved profile</option>
              {gaugeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-btn" onClick={handleCreateProject}>
            Create Project
          </button>
        </section>

        <section className="surface">
          <h2>Projects</h2>
          <ul className="item-list">
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
        </section>
      </div>
    );
  }

  function renderProfilesScreen() {
    return (
      <div className="screen-grid">
        <section className="surface">
          <h2>Person Profiles</h2>
          <div className="inline-actions">
            <button
              className="secondary-btn"
              onClick={() => {
                setPersonForm(emptyPersonForm());
                setSelectedPersonProfileId("");
              }}
            >
              New
            </button>
          </div>
          <ul className="item-list compact">
            {personProfiles.map((profile) => (
              <li key={profile.id}>
                <button
                  className={`link-btn ${selectedPersonProfileId === profile.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedPersonProfileId(profile.id);
                    setPersonForm({
                      id: profile.id,
                      name: profile.name,
                      bustCircumference: profile.measurementsCm.bustCircumference ?? 0,
                      armLength: profile.measurementsCm.armLength ?? 0,
                      garmentLength: profile.measurementsCm.garmentLength ?? 0
                    });
                  }}
                >
                  {profile.name}
                </button>
              </li>
            ))}
          </ul>
          <label>
            Name
            <input value={personForm.name} onChange={(event) => setPersonForm({ ...personForm, name: event.target.value })} />
          </label>
          <label>
            Bust (cm)
            <input
              type="number"
              value={personForm.bustCircumference}
              onChange={(event) => setPersonForm({ ...personForm, bustCircumference: parseNumber(event.target.value, personForm.bustCircumference) })}
            />
          </label>
          <label>
            Arm Length (cm)
            <input
              type="number"
              value={personForm.armLength}
              onChange={(event) => setPersonForm({ ...personForm, armLength: parseNumber(event.target.value, personForm.armLength) })}
            />
          </label>
          <label>
            Garment Length (cm)
            <input
              type="number"
              value={personForm.garmentLength}
              onChange={(event) => setPersonForm({ ...personForm, garmentLength: parseNumber(event.target.value, personForm.garmentLength) })}
            />
          </label>
          <div className="inline-actions">
            <button className="primary-btn" onClick={handleSavePersonProfile}>
              Save
            </button>
            <button className="danger-btn" onClick={handleDeletePersonProfile}>
              Delete
            </button>
          </div>
        </section>

        <section className="surface">
          <h2>Gauge Profiles</h2>
          <div className="inline-actions">
            <button
              className="secondary-btn"
              onClick={() => {
                setGaugeForm(emptyGaugeForm());
                setSelectedGaugeProfileId("");
              }}
            >
              New
            </button>
          </div>
          <ul className="item-list compact">
            {gaugeProfiles.map((profile) => (
              <li key={profile.id}>
                <button
                  className={`link-btn ${selectedGaugeProfileId === profile.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedGaugeProfileId(profile.id);
                    setGaugeForm({
                      id: profile.id,
                      name: profile.name,
                      stitchesPer10Cm: profile.stitchesPer10Cm,
                      rowsPer10Cm: profile.rowsPer10Cm,
                      needle: profile.needle,
                      notes: profile.notes ?? ""
                    });
                  }}
                >
                  {profile.name}
                </button>
              </li>
            ))}
          </ul>
          <label>
            Name
            <input value={gaugeForm.name} onChange={(event) => setGaugeForm({ ...gaugeForm, name: event.target.value })} />
          </label>
          <label>
            Stitches / 10cm
            <input
              type="number"
              value={gaugeForm.stitchesPer10Cm}
              onChange={(event) => setGaugeForm({ ...gaugeForm, stitchesPer10Cm: parseNumber(event.target.value, gaugeForm.stitchesPer10Cm) })}
            />
          </label>
          <label>
            Rows / 10cm
            <input
              type="number"
              value={gaugeForm.rowsPer10Cm}
              onChange={(event) => setGaugeForm({ ...gaugeForm, rowsPer10Cm: parseNumber(event.target.value, gaugeForm.rowsPer10Cm) })}
            />
          </label>
          <label>
            Needle
            <input value={gaugeForm.needle} onChange={(event) => setGaugeForm({ ...gaugeForm, needle: event.target.value })} />
          </label>
          <label>
            Notes
            <input value={gaugeForm.notes} onChange={(event) => setGaugeForm({ ...gaugeForm, notes: event.target.value })} />
          </label>
          <div className="inline-actions">
            <button className="primary-btn" onClick={handleSaveGaugeProfile}>
              Save
            </button>
            <button className="danger-btn" onClick={handleDeleteGaugeProfile}>
              Delete
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderDesignScreen() {
    return (
      <section className="surface">
        <h2>Design Workspace</h2>
        {!activeProject && <p>Select a project from Projects to begin editing.</p>}
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
              Snapshot Pair: {activeProject.personProfileSnapshot?.name ?? "None"} / {activeProject.gaugeProfileSnapshot?.name ?? "None"}
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
      </section>
    );
  }

  function renderInstructionsScreen() {
    return (
      <section className="surface">
        <h2>Instructions + Progress</h2>
        {!activeProject && <p>Open a project to view instructions.</p>}
        {activeProject && (
          <>
            <ol>
              {activeProject.instructions.map((instruction) => (
                <li key={instruction.id}>
                  Rows {instruction.rowStart}-{instruction.rowEnd}: {instruction.text}
                </li>
              ))}
            </ol>
            {activeProject.derived.sectionRows.map((section) => {
              const partial = activeProject.progress.activePartialRowBySection[section.sectionId];
              return (
                <div key={section.sectionId} className="progress-row">
                  <h3>{section.sectionId}</h3>
                  <label>
                    Completed Full Rows
                    <input
                      type="number"
                      value={activeProject.progress.completedRowsBySection[section.sectionId] ?? 0}
                      onChange={(event) =>
                        setActiveProject({
                          ...activeProject,
                          progress: {
                            ...activeProject.progress,
                            completedRowsBySection: {
                              ...activeProject.progress.completedRowsBySection,
                              [section.sectionId]: Math.max(parseNumber(event.target.value, 0), 0)
                            }
                          }
                        })
                      }
                    />
                  </label>
                  <label>
                    Active Row Number
                    <input
                      type="number"
                      value={partial?.rowNumber ?? 0}
                      onChange={(event) =>
                        setActiveProject({
                          ...activeProject,
                          progress: {
                            ...activeProject.progress,
                            activePartialRowBySection: {
                              ...activeProject.progress.activePartialRowBySection,
                              [section.sectionId]: {
                                rowNumber: Math.max(parseNumber(event.target.value, 0), 0),
                                completedStitches: partial?.completedStitches ?? 0
                              }
                            }
                          }
                        })
                      }
                    />
                  </label>
                  <label>
                    Completed Stitches In Active Row
                    <input
                      type="number"
                      value={partial?.completedStitches ?? 0}
                      onChange={(event) =>
                        setActiveProject({
                          ...activeProject,
                          progress: {
                            ...activeProject.progress,
                            activePartialRowBySection: {
                              ...activeProject.progress.activePartialRowBySection,
                              [section.sectionId]: {
                                rowNumber: partial?.rowNumber ?? 1,
                                completedStitches: Math.max(parseNumber(event.target.value, 0), 0)
                              }
                            }
                          }
                        })
                      }
                    />
                  </label>
                </div>
              );
            })}
            <button className="primary-btn" onClick={handleSaveProject}>
              Save Progress
            </button>
          </>
        )}
      </section>
    );
  }

  function renderSettingsScreen() {
    return (
      <section className="surface">
        <h2>Settings</h2>
        <label>
          Display Unit
          <select
            value={settingsForm.displayUnit}
            onChange={(event) => setSettingsForm({ ...settingsForm, displayUnit: event.target.value as "in" | "cm" })}
          >
            <option value="in">Inches</option>
            <option value="cm">Centimeters</option>
          </select>
        </label>
        <label>
          Stitch Rounding Mode
          <select
            value={settingsForm.stitchMode}
            onChange={(event) => setSettingsForm({ ...settingsForm, stitchMode: event.target.value as RoundingMode })}
          >
            <option value="nearest">Nearest</option>
            <option value="ceil">Ceil</option>
            <option value="floor">Floor</option>
          </select>
        </label>
        <label>
          Stitch Rounding Step
          <input
            type="number"
            min={1}
            value={settingsForm.stitchStep}
            onChange={(event) => setSettingsForm({ ...settingsForm, stitchStep: Math.max(parseNumber(event.target.value, 1), 1) })}
          />
        </label>
        <label>
          Row Rounding Mode
          <select
            value={settingsForm.rowMode}
            onChange={(event) => setSettingsForm({ ...settingsForm, rowMode: event.target.value as RoundingMode })}
          >
            <option value="nearest">Nearest</option>
            <option value="ceil">Ceil</option>
            <option value="floor">Floor</option>
          </select>
        </label>
        <label>
          Row Rounding Step
          <input
            type="number"
            min={1}
            value={settingsForm.rowStep}
            onChange={(event) => setSettingsForm({ ...settingsForm, rowStep: Math.max(parseNumber(event.target.value, 1), 1) })}
          />
        </label>
        <button className="primary-btn" onClick={handleSaveSettings}>
          Save Settings
        </button>
      </section>
    );
  }

  return (
    <div className="app-frame">
      <aside className="nav-rail">
        <div className="brand-pill">GD</div>
        {navigation.map((item) => (
          <button
            key={item.screen}
            className={`nav-icon ${screen === item.screen ? "active" : ""}`}
            onClick={() => setScreen(item.screen)}
            title={item.label}
            aria-label={item.label}
          >
            {item.glyph}
          </button>
        ))}
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <h1>{navigation.find((item) => item.screen === screen)?.label ?? "Workspace"}</h1>
          <p>Local-first desktop MVP</p>
        </header>
        <div className="workspace-body">
          {screen === "projects" && renderProjectsScreen()}
          {screen === "profiles" && renderProfilesScreen()}
          {screen === "design" && renderDesignScreen()}
          {screen === "instructions" && renderInstructionsScreen()}
          {screen === "settings" && renderSettingsScreen()}
        </div>
      </main>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
