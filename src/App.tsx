import { useEffect, useMemo, useState } from "react";
import { deriveGaugeCounts } from "./domain/gauge";
import { applyRounding } from "./domain/rounding";
import { storageApi } from "./storage/ipc";
import type {
  AppPreferences,
  GaugeProfile,
  GaugeProfileSnapshot,
  Geometry,
  InstructionVerbosity,
  PersonProfile,
  PersonProfileSnapshot,
  Point,
  Project,
  ProjectSummary,
  RoundingMode,
  Template
} from "./types/models";

type Screen = "projects" | "profiles" | "design" | "instructions" | "settings";

interface DragState {
  pointId: string;
  pointerId: number;
}

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

const emptyGeometry: Geometry = {
  points: [],
  edges: [],
  sections: [],
  constraints: []
};

function nowIso(): string {
  return new Date().toISOString();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function cloneGeometry(geometry?: Geometry): Geometry {
  if (!geometry) {
    return { points: [], edges: [], sections: [], constraints: [] };
  }
  return {
    points: geometry.points.map((point) => ({ ...point })),
    edges: geometry.edges.map((edge) => ({ ...edge })),
    sections: geometry.sections.map((section) => ({ ...section, pointLoop: [...section.pointLoop] })),
    constraints: geometry.constraints.map((constraint) => ({ ...constraint }))
  };
}

function hasGeometry(geometry?: Geometry): boolean {
  return Boolean(geometry && geometry.points.length > 0 && geometry.edges.length > 0);
}

function defaultPreferences(): AppPreferences {
  const timestamp = nowIso();
  return {
    id: "app_preferences",
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    displayUnit: "in",
    instructionVerbosity: "grouped",
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

function hydrateProjectGeometry(project: Project, templates: Template[]): Project {
  if (hasGeometry(project.geometryOverrideCm)) {
    return project;
  }
  const template = templates.find((entry) => entry.id === project.templateId);
  return {
    ...project,
    geometryOverrideCm: cloneGeometry(template?.geometryCm)
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

  const draft: Project = {
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
    geometryOverrideCm: cloneGeometry(input.template?.geometryCm),
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
      completedRowsBySection: {},
      activePartialRowBySection: {}
    }
  };

  return recalculateProject(draft, input.preferences.instructionVerbosity);
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

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return { x: 0, y: 0 };
  }
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

function cmDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function sectionWidthAtY(points: Point[], y: number): number {
  if (points.length < 3) {
    return 0;
  }

  const intersections: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    if (p1.y === p2.y) {
      continue;
    }

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    if (y < minY || y >= maxY) {
      continue;
    }

    const ratio = (y - p1.y) / (p2.y - p1.y);
    const x = p1.x + ratio * (p2.x - p1.x);
    intersections.push(x);
  }

  if (intersections.length < 2) {
    const xs = points.map((point) => point.x);
    return Math.max(...xs) - Math.min(...xs);
  }

  intersections.sort((a, b) => a - b);
  return intersections[intersections.length - 1] - intersections[0];
}

function rowTargetsForSection(args: {
  points: Point[];
  stitchesPer10Cm: number;
  rowsPer10Cm: number;
  roundingPolicy: Project["roundingPolicy"];
}): { rowCount: number; targets: number[] } {
  const { points, stitchesPer10Cm, rowsPer10Cm, roundingPolicy } = args;
  if (points.length < 3) {
    return { rowCount: Math.max(roundingPolicy.row.step, 1), targets: [Math.max(roundingPolicy.stitch.step, 1)] };
  }

  const ys = points.map((point) => point.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const heightCm = Math.max(maxY - minY, 0.01);
  const rowCount = applyRounding((heightCm / 10) * rowsPer10Cm, roundingPolicy.row.mode, roundingPolicy.row.step);

  const targets: number[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    const y = minY + ((i + 0.5) / rowCount) * heightCm;
    const widthCm = Math.max(sectionWidthAtY(points, y), 0.01);
    const rawStitches = (widthCm / 10) * stitchesPer10Cm;
    targets.push(applyRounding(rawStitches, roundingPolicy.stitch.mode, roundingPolicy.stitch.step));
  }

  return {
    rowCount,
    targets
  };
}

function generateSectionInstructions(args: {
  sectionId: string;
  rowTargets: number[];
  startRow: number;
  startingStitches: number;
  verbosity: InstructionVerbosity;
}): { instructions: Project["instructions"]; endRow: number; endingStitches: number } {
  const { sectionId, rowTargets, startRow, startingStitches, verbosity } = args;
  if (rowTargets.length === 0) {
    return { instructions: [], endRow: startRow - 1, endingStitches: startingStitches };
  }

  const instructions: Project["instructions"] = [];
  let currentStitches = startingStitches;
  let spanStart = startRow;

  if (verbosity === "verbose") {
    for (let i = 0; i < rowTargets.length; i += 1) {
      const rowNumber = startRow + i;
      const next = rowTargets[i];
      if (next === currentStitches) {
        instructions.push({
          id: "",
          rowStart: rowNumber,
          rowEnd: rowNumber,
          text: `Work row ${rowNumber} even at ${next} stitches (${sectionId})`
        });
      } else {
        const delta = next - currentStitches;
        instructions.push({
          id: "",
          rowStart: rowNumber,
          rowEnd: rowNumber,
          text: `${delta > 0 ? "Increase" : "Decrease"} ${Math.abs(delta)} stitch${Math.abs(delta) === 1 ? "" : "es"} to ${next} stitches (${sectionId})`
        });
      }
      currentStitches = next;
    }

    return {
      instructions,
      endRow: startRow + rowTargets.length - 1,
      endingStitches: currentStitches
    };
  }

  for (let i = 0; i < rowTargets.length; i += 1) {
    const rowNumber = startRow + i;
    const next = rowTargets[i];
    if (next === currentStitches) {
      continue;
    }

    const spanEnd = rowNumber - 1;
    if (spanStart <= spanEnd) {
      instructions.push({
        id: "",
        rowStart: spanStart,
        rowEnd: spanEnd,
        text: `Work even at ${currentStitches} stitches (${sectionId})`
      });
    }

    const delta = next - currentStitches;
    const action = delta > 0 ? "Increase" : "Decrease";
    instructions.push({
      id: "",
      rowStart: rowNumber,
      rowEnd: rowNumber,
      text: `${action} ${Math.abs(delta)} stitch${Math.abs(delta) === 1 ? "" : "es"} to ${next} stitches (${sectionId})`
    });

    currentStitches = next;
    spanStart = rowNumber + 1;
  }

  const endRow = startRow + rowTargets.length - 1;
  if (spanStart <= endRow) {
    instructions.push({
      id: "",
      rowStart: spanStart,
      rowEnd: endRow,
      text: `Work even at ${currentStitches} stitches (${sectionId})`
    });
  }

  return { instructions, endRow, endingStitches: currentStitches };
}

function recalculateProject(project: Project, verbosity: InstructionVerbosity): Project {
  const pointMap = new Map(project.geometryOverrideCm.points.map((point) => [point.id, point]));
  const stitchesPer10Cm = project.gaugeProfileSnapshot?.stitchesPer10Cm || 20;
  const rowsPer10Cm = project.gaugeProfileSnapshot?.rowsPer10Cm || 28;

  const edgeStitches = project.geometryOverrideCm.edges.map((edge) => {
    const p1 = pointMap.get(edge.p1);
    const p2 = pointMap.get(edge.p2);
    const cm = p1 && p2 ? cmDistance(p1, p2) : 0;
    const raw = (cm / 10) * stitchesPer10Cm;
    return {
      edgeId: edge.id,
      count: applyRounding(raw, project.roundingPolicy.stitch.mode, project.roundingPolicy.stitch.step)
    };
  });

  const sectionPlans = project.geometryOverrideCm.sections.map((section) => {
    const points = section.pointLoop.map((id) => pointMap.get(id)).filter(Boolean) as Point[];
    const { rowCount, targets } = rowTargetsForSection({
      points,
      stitchesPer10Cm,
      rowsPer10Cm,
      roundingPolicy: project.roundingPolicy
    });
    return {
      sectionId: section.id,
      rowCount,
      rowTargets: targets
    };
  });

  const sectionRows = sectionPlans.map((plan) => ({
    sectionId: plan.sectionId,
    count: plan.rowCount
  }));

  const firstTarget = sectionPlans[0]?.rowTargets[0] ?? Math.max(project.roundingPolicy.stitch.step, 1);
  const lastPlan = sectionPlans[sectionPlans.length - 1];
  const lastTarget = lastPlan?.rowTargets[lastPlan.rowTargets.length - 1] ?? firstTarget;

  const instructions: Project["instructions"] = [
    {
      id: "",
      rowStart: 1,
      rowEnd: 1,
      text: `Cast on ${firstTarget} stitches`
    }
  ];

  let rowCursor = 2;
  let currentStitches = firstTarget;
  for (const plan of sectionPlans) {
    const generated = generateSectionInstructions({
      sectionId: plan.sectionId,
      rowTargets: plan.rowTargets,
      startRow: rowCursor,
      startingStitches: currentStitches,
      verbosity
    });
    instructions.push(...generated.instructions);
    rowCursor = generated.endRow + 1;
    currentStitches = generated.endingStitches;
  }

  instructions.push({
    id: "",
    rowStart: rowCursor,
    rowEnd: rowCursor,
    text: `Bind off ${currentStitches || lastTarget} stitches`
  });

  const withIds = instructions.map((instruction, index) => ({
    ...instruction,
    id: `inst_${String(index + 1).padStart(3, "0")}`
  }));

  const nextCompletedRowsBySection: Record<string, number> = {};
  const nextActivePartialBySection: Project["progress"]["activePartialRowBySection"] = {};
  for (const section of sectionRows) {
    nextCompletedRowsBySection[section.sectionId] = project.progress.completedRowsBySection[section.sectionId] ?? 0;
    nextActivePartialBySection[section.sectionId] = project.progress.activePartialRowBySection[section.sectionId] ?? null;
  }

  return {
    ...project,
    derived: {
      edgeStitches,
      sectionRows
    },
    instructions: withIds,
    progress: {
      completedRowsBySection: nextCompletedRowsBySection,
      activePartialRowBySection: nextActivePartialBySection
    }
  };
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
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [edgeLengthInput, setEdgeLengthInput] = useState<string>("");
  const [templateNameDraft, setTemplateNameDraft] = useState<string>("");
  const [edgeEditorError, setEdgeEditorError] = useState<string>("");
  const [gaugeFormError, setGaugeFormError] = useState<string>("");
  const [settingsNotice, setSettingsNotice] = useState<string>("");
  const [instructionsNotice, setInstructionsNotice] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const activeTemplate = useMemo(
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

  const pointById = useMemo(
    () => new Map(activeProject?.geometryOverrideCm.points.map((point) => [point.id, point]) ?? []),
    [activeProject?.geometryOverrideCm.points]
  );

  const activeGeometry = activeProject?.geometryOverrideCm ?? emptyGeometry;

  const canvasViewBox = useMemo(() => {
    if (activeGeometry.points.length === 0) {
      return "0 0 120 120";
    }
    const xs = activeGeometry.points.map((point) => point.x);
    const ys = activeGeometry.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 16;
    const width = Math.max(maxX - minX, 20) + pad * 2;
    const height = Math.max(maxY - minY, 20) + pad * 2;
    return `${minX - pad} ${minY - pad} ${width} ${height}`;
  }, [activeGeometry.points]);

  async function refreshProjects() {
    const loadedProjects = await storageApi.listProjects();
    setProjects(loadedProjects);
  }

  async function refreshTemplates(): Promise<Template[]> {
    const loadedTemplates = await storageApi.listTemplates();
    setTemplates(loadedTemplates);
    return loadedTemplates;
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

  useEffect(() => {
    if (activeProject && !hasGeometry(activeProject.geometryOverrideCm)) {
      setActiveProject(recalculateProject(hydrateProjectGeometry(activeProject, templates), preferences.instructionVerbosity));
    }
  }, [activeProject, templates]);

  useEffect(() => {
    setSelectedEdgeId("");
    setEdgeLengthInput("");
    setDragState(null);
    setEdgeEditorError("");
  }, [activeProject?.id]);

  useEffect(() => {
    setTemplateNameDraft(activeTemplate?.name ?? "");
  }, [activeProject?.id, activeTemplate?.id, activeTemplate?.name]);

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
      setActiveProject(recalculateProject(saved, preferences.instructionVerbosity));
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
      setActiveProject(recalculateProject(hydrateProjectGeometry(loaded, templates), preferences.instructionVerbosity));
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
      ...recalculateProject(activeProject, preferences.instructionVerbosity),
      updatedAt: nowIso()
    });
    setActiveProject(recalculateProject(saved, preferences.instructionVerbosity));
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
    if (gaugeForm.stitchesPer10Cm <= 0 || gaugeForm.rowsPer10Cm <= 0) {
      setGaugeFormError("Stitches/rows per 10cm must both be greater than 0.");
      return;
    }
    setGaugeFormError("");
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
    setSettingsNotice("Settings saved.");
    if (activeProject) {
      setActiveProject(
        recalculateProject({
          ...activeProject,
          displayUnit: saved.displayUnit,
          roundingPolicy: saved.defaultRounding
        }, saved.instructionVerbosity)
      );
    }
  }

  function handleTemplateChange(templateId: string) {
    if (!activeProject) {
      return;
    }
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }
    setActiveProject(
      recalculateProject({
        ...activeProject,
        templateId: template.id,
        geometryOverrideCm: cloneGeometry(template.geometryCm)
      }, preferences.instructionVerbosity)
    );
    setSelectedEdgeId("");
    setEdgeLengthInput("");
  }

  async function handleSaveAsTemplate() {
    if (!activeProject) {
      return;
    }
    const timestamp = nowIso();
    const sourceTemplate = templates.find((entry) => entry.id === activeProject.templateId);
    const toSave: Template = {
      id: `tpl_user_${Date.now()}`,
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      name: templateNameDraft.trim() || `${activeProject.name} Template`,
      garmentType: sourceTemplate?.garmentType ?? "custom",
      isBuiltin: false,
      basedOnTemplateId: sourceTemplate?.id ?? null,
      geometryCm: cloneGeometry(activeProject.geometryOverrideCm)
    };
    const saved = await storageApi.saveTemplate(toSave);
    await refreshTemplates();
    setActiveProject(recalculateProject({ ...activeProject, templateId: saved.id }, preferences.instructionVerbosity));
  }

  async function handleUpdateTemplate() {
    if (!activeProject || !activeTemplate || activeTemplate.isBuiltin) {
      return;
    }
    const updated = await storageApi.saveTemplate({
      ...activeTemplate,
      name: templateNameDraft.trim() || activeTemplate.name,
      geometryCm: cloneGeometry(activeProject.geometryOverrideCm)
    });
    await refreshTemplates();
    setActiveProject(recalculateProject({ ...activeProject, templateId: updated.id }, preferences.instructionVerbosity));
  }

  async function handleDeleteTemplate() {
    if (!activeTemplate || activeTemplate.isBuiltin) {
      return;
    }
    await storageApi.deleteTemplate(activeTemplate.id);
    const nextTemplates = await refreshTemplates();
    if (!activeProject) {
      return;
    }
    const fallback = nextTemplates.find((template) => template.isBuiltin) ?? nextTemplates[0];
    if (fallback) {
      setActiveProject(
        recalculateProject({
          ...activeProject,
          templateId: fallback.id,
          geometryOverrideCm: cloneGeometry(fallback.geometryCm)
        }, preferences.instructionVerbosity)
      );
    }
  }

  function handleSelectEdge(edgeId: string) {
    if (!activeProject) {
      return;
    }
    const edge = activeProject.geometryOverrideCm.edges.find((entry) => entry.id === edgeId);
    if (!edge) {
      return;
    }
    setSelectedEdgeId(edge.id);
    const p1 = pointById.get(edge.p1);
    const p2 = pointById.get(edge.p2);
    setEdgeLengthInput(p1 && p2 ? cmDistance(p1, p2).toFixed(2) : "0");
    setEdgeEditorError("");
  }

  function handleApplyEdgeLength() {
    if (!activeProject || !selectedEdgeId) {
      setEdgeEditorError("Select an edge first.");
      return;
    }
    const targetLength = parseOptionalNumber(edgeLengthInput);
    if (targetLength === null || targetLength <= 0) {
      setEdgeEditorError("Length must be a positive number.");
      return;
    }
    setEdgeEditorError("");

    setActiveProject((previous) => {
      if (!previous) {
        return previous;
      }

      const edge = previous.geometryOverrideCm.edges.find((entry) => entry.id === selectedEdgeId);
      if (!edge) {
        return previous;
      }

      const p1 = previous.geometryOverrideCm.points.find((entry) => entry.id === edge.p1);
      const p2 = previous.geometryOverrideCm.points.find((entry) => entry.id === edge.p2);
      if (!p1 || !p2) {
        return previous;
      }

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const scale = length === 0 ? 0 : targetLength / length;

      const nextP2 = length === 0 ? { x: p1.x + targetLength, y: p1.y } : { x: p1.x + dx * scale, y: p1.y + dy * scale };

      const nextProject = {
        ...previous,
        geometryOverrideCm: {
          ...previous.geometryOverrideCm,
          points: previous.geometryOverrideCm.points.map((point) =>
            point.id === p2.id ? { ...point, x: round2(nextP2.x), y: round2(nextP2.y) } : point
          )
        }
      };
      return recalculateProject(nextProject, preferences.instructionVerbosity);
    });
    setEdgeLengthInput(targetLength.toFixed(2));
  }

  function handleRegenerateInstructions() {
    if (!activeProject) {
      return;
    }
    setActiveProject(recalculateProject(activeProject, preferences.instructionVerbosity));
    setInstructionsNotice(
      preferences.instructionVerbosity === "verbose"
        ? "Verbose instructions regenerated."
        : "Grouped instructions regenerated."
    );
  }

  async function handleInstructionVerbosityChange(nextVerbosity: InstructionVerbosity) {
    if (nextVerbosity === preferences.instructionVerbosity) {
      return;
    }
    try {
      const saved = await storageApi.savePreferences({
        ...preferences,
        instructionVerbosity: nextVerbosity
      });
      setPreferences(saved);
      setSettingsForm(settingsFormFromPreferences(saved));
      setInstructionsNotice(nextVerbosity === "verbose" ? "Verbose mode enabled." : "Grouped mode enabled.");
      if (activeProject) {
        setActiveProject(recalculateProject(activeProject, nextVerbosity));
      }
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to change instruction mode.";
      setError(message);
    }
  }

  function handlePointPointerDown(event: React.PointerEvent<SVGCircleElement>, pointId: string) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) {
      return;
    }
    svg.setPointerCapture(event.pointerId);
    setDragState({ pointId, pointerId: event.pointerId });
  }

  function handleCanvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragState || !activeProject) {
      return;
    }
    if (event.pointerId !== dragState.pointerId) {
      return;
    }
    const nextPoint = svgPoint(event.currentTarget, event.clientX, event.clientY);
    setActiveProject((previous) => {
      if (!previous) {
        return previous;
      }
      const nextProject = {
        ...previous,
        geometryOverrideCm: {
          ...previous.geometryOverrideCm,
          points: previous.geometryOverrideCm.points.map((point) =>
            point.id === dragState.pointId ? { ...point, x: round2(nextPoint.x), y: round2(nextPoint.y) } : point
          )
        }
      };
      return recalculateProject(nextProject, preferences.instructionVerbosity);
    });
  }

  function handleCanvasPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragState(null);
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
                setGaugeFormError("");
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
                    setGaugeFormError("");
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
            <input
              value={gaugeForm.name}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, name: event.target.value });
              }}
            />
          </label>
          <label>
            Stitches / 10cm
            <input
              type="number"
              value={gaugeForm.stitchesPer10Cm}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, stitchesPer10Cm: parseNumber(event.target.value, gaugeForm.stitchesPer10Cm) });
              }}
            />
          </label>
          <label>
            Rows / 10cm
            <input
              type="number"
              value={gaugeForm.rowsPer10Cm}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, rowsPer10Cm: parseNumber(event.target.value, gaugeForm.rowsPer10Cm) });
              }}
            />
          </label>
          <label>
            Needle
            <input
              value={gaugeForm.needle}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, needle: event.target.value });
              }}
            />
          </label>
          <label>
            Notes
            <input
              value={gaugeForm.notes}
              onChange={(event) => {
                setGaugeFormError("");
                setGaugeForm({ ...gaugeForm, notes: event.target.value });
              }}
            />
          </label>
          {gaugeFormError && <p className="field-error">{gaugeFormError}</p>}
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
    const parsedEdgeLength = parseOptionalNumber(edgeLengthInput);
    const canApplyEdgeLength = Boolean(selectedEdgeId) && parsedEdgeLength !== null && parsedEdgeLength > 0;

    return (
      <div className="screen-grid">
        <section className="surface">
          <h2>Canvas Editor</h2>
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
              <label>
                Active Template
                <select value={activeProject.templateId} onChange={(event) => handleTemplateChange(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} {template.isBuiltin ? "(Built-in)" : "(User)"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="canvas-wrap">
                <svg
                  viewBox={canvasViewBox}
                  className="design-canvas"
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                >
                  {activeGeometry.sections.map((section) => {
                    const points = section.pointLoop.map((id) => pointById.get(id)).filter(Boolean) as Point[];
                    if (points.length < 3) {
                      return null;
                    }
                    return <polygon key={section.id} points={points.map((p) => `${p.x},${p.y}`).join(" ")} className="section-shape" />;
                  })}

                  {activeGeometry.edges.map((edge) => {
                    const p1 = pointById.get(edge.p1);
                    const p2 = pointById.get(edge.p2);
                    if (!p1 || !p2) {
                      return null;
                    }
                    return (
                      <g key={edge.id}>
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          className="edge-hit"
                          vectorEffect="non-scaling-stroke"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            handleSelectEdge(edge.id);
                          }}
                        />
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          className={`edge-line ${selectedEdgeId === edge.id ? "selected" : ""}`}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2} className="edge-label">
                          {edge.label}
                        </text>
                      </g>
                    );
                  })}

                  {activeGeometry.points.map((point) => (
                    <g key={point.id}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={6}
                        className="point-hit"
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(event) => handlePointPointerDown(event, point.id)}
                      />
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={3.6}
                        className="point-node"
                      />
                      <text x={point.x + 3.5} y={point.y - 2.5} className="point-label">
                        {point.id}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
              <button className="primary-btn" onClick={handleSaveProject}>
                Save Project
              </button>
            </>
          )}
        </section>

        <section className="surface">
          <h2>Template Library</h2>
          {!activeProject && <p>Open a project to manage templates.</p>}
          {activeProject && (
            <>
              <label>
                Template Name
                <input value={templateNameDraft} onChange={(event) => setTemplateNameDraft(event.target.value)} />
              </label>
              <div className="inline-actions">
                <button className="primary-btn" onClick={handleSaveAsTemplate}>
                  Save As New Template
                </button>
                <button className="secondary-btn" onClick={handleUpdateTemplate} disabled={activeTemplate?.isBuiltin}>
                  Update Template
                </button>
                <button className="danger-btn" onClick={handleDeleteTemplate} disabled={activeTemplate?.isBuiltin}>
                  Delete Template
                </button>
              </div>

              <h3>Edge Length Editor</h3>
              {!selectedEdgeId && <p>Select an edge in the canvas.</p>}
              {selectedEdgeId && (
                <>
                  <p>
                    Selected edge: <strong>{selectedEdgeId}</strong>
                  </p>
                  <label>
                    Length (cm)
                    <input
                      type="number"
                      value={edgeLengthInput}
                      onChange={(event) => {
                        setEdgeEditorError("");
                        setEdgeLengthInput(event.target.value);
                      }}
                    />
                  </label>
                  {edgeEditorError && <p className="field-error">{edgeEditorError}</p>}
                  <button className="secondary-btn" onClick={handleApplyEdgeLength} disabled={!canApplyEdgeLength}>
                    Apply Length
                  </button>
                </>
              )}
            </>
          )}
        </section>
      </div>
    );
  }

  function renderInstructionsScreen() {
    return (
      <section className="surface">
        <h2>Instructions + Progress</h2>
        {!activeProject && <p>Open a project to view instructions.</p>}
        {activeProject && (
          <>
            <div className="inline-actions">
              <label className="inline-control">
                Instruction Detail
                <select
                  value={preferences.instructionVerbosity}
                  onChange={(event) => void handleInstructionVerbosityChange(event.target.value as InstructionVerbosity)}
                >
                  <option value="grouped">Grouped</option>
                  <option value="verbose">Verbose</option>
                </select>
              </label>
              <button className="secondary-btn" onClick={handleRegenerateInstructions}>
                Regenerate Instructions
              </button>
              <button className="primary-btn" onClick={handleSaveProject}>
                Save Progress
              </button>
            </div>
            {instructionsNotice && <p className="field-note">{instructionsNotice}</p>}
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
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, displayUnit: event.target.value as "in" | "cm" });
            }}
          >
            <option value="in">Inches</option>
            <option value="cm">Centimeters</option>
          </select>
        </label>
        <label>
          Stitch Rounding Mode
          <select
            value={settingsForm.stitchMode}
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, stitchMode: event.target.value as RoundingMode });
            }}
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
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, stitchStep: Math.max(parseNumber(event.target.value, 1), 1) });
            }}
          />
        </label>
        <label>
          Row Rounding Mode
          <select
            value={settingsForm.rowMode}
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, rowMode: event.target.value as RoundingMode });
            }}
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
            onChange={(event) => {
              setSettingsNotice("");
              setSettingsForm({ ...settingsForm, rowStep: Math.max(parseNumber(event.target.value, 1), 1) });
            }}
          />
        </label>
        {settingsNotice && <p className="field-note">{settingsNotice}</p>}
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
