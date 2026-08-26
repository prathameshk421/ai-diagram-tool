export const SCHEMA_ID = "arch-scene/v1" as const;

export const NODE_KINDS = [
  "service",
  "datastore",
  "cache",
  "queue",
  "actor",
  "gateway",
  "lb",
  "bucket",
  "unknown",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const SHAPES = [
  "rectangle",
  "ellipse",
  "diamond",
  "cylinder",
  "queue",
  "actor",
] as const;
export type Shape = (typeof SHAPES)[number];

export const SIZES = ["sm", "md", "lg"] as const;
export type SizeToken = (typeof SIZES)[number];

export const STYLES = ["sketch", "clean"] as const;
export type StyleToken = (typeof STYLES)[number];

export const PALETTES = ["architecture", "aws"] as const;
export type Palette = (typeof PALETTES)[number];

export const FLOWS = ["left-to-right", "top-to-bottom"] as const;
export type Flow = (typeof FLOWS)[number];

export const ICONS = [
  "postgres",
  "redis",
  "kafka",
  "database",
  "queue",
  "generic",
  "worker",
  "s3",
  "alb",
  "apigw",
  "nat",
  "rds",
  "sqs",
  "gke",
] as const;
export type Icon = (typeof ICONS)[number];

export const EDGE_KINDS = ["sync", "async"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const STROKES = ["solid", "dashed"] as const;
export type Stroke = (typeof STROKES)[number];

export const ROUTES = ["straight", "ortho"] as const;
export type Route = (typeof ROUTES)[number];

export const EXPOSURES = ["internet"] as const;
export type Exposure = (typeof EXPOSURES)[number];

export const INK_CONVERTS = [
  "auto",
  "rectangle",
  "ellipse",
  "diamond",
  "cylinder",
  "queue",
  "line",
  "group",
] as const;
export type InkConvert = (typeof INK_CONVERTS)[number];

export const ALIGN_EDGES = [
  "left",
  "right",
  "top",
  "bottom",
  "centerH",
  "centerV",
] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];

export const DISTRIBUTE_AXES = ["h", "v"] as const;
export type DistributeAxis = (typeof DISTRIBUTE_AXES)[number];

export const EQUALIZE_DIMS = ["both", "width", "height"] as const;
export type EqualizeDim = (typeof EQUALIZE_DIMS)[number];

export const PLACE_SIDES = ["left", "right", "above", "below"] as const;
export type PlaceSide = (typeof PLACE_SIDES)[number];

export const PASS_TYPES = [
  "beautify",
  "convert-ink",
  "tidy-layout",
  "unoverlap",
  "insert",
  "merge",
  "annotate-path",
  "restyle-icons",
] as const;
export type PassType = (typeof PASS_TYPES)[number];

export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export type Pin = { x: number; y: number };

export type SceneNode = {
  kind: NodeKind;
  label: string;
  icon: Icon | null;
  shape: Shape;
  size: SizeToken;
  style: StyleToken;
  locked: boolean;
  pin?: Pin;
  rotation: 0 | 90;
};

export type SceneEdge = {
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
  stroke: Stroke;
  route: Route;
  exposure: Exposure | null;
};

export type SceneGroup = {
  label: string;
  contains: string[];
  parent: string | null;
};

export type SceneInk = {
  convert: InkConvert | null;
  points?: [number, number][];
};

export type BeautifyPass = {
  type: "beautify";
  scope: "selection" | "board";
  /** Implied true. Explicit false is invalid (not a relayout). */
  freezeTopology?: boolean;
  freezeSemantics?: boolean;
  freezePins?: boolean;
};

export type ConvertInkPass = {
  type: "convert-ink";
  ids?: string[];
};

export type TidyPass = {
  type: "tidy-layout";
  scope: "board" | string;
};

export type UnoverlapPass = {
  type: "unoverlap";
  scope: "selection" | "board" | string;
};

export type InsertPass = {
  type: "insert";
  node: string;
  on: string;
};

export type MergePass = {
  type: "merge";
  ids: string[];
  keep: string;
};

export type AnnotatePathPass = {
  type: "annotate-path";
  from: string;
  to: string;
};

export type RestyleIconsPass = { type: "restyle-icons" };

export type Pass =
  | BeautifyPass
  | ConvertInkPass
  | TidyPass
  | UnoverlapPass
  | InsertPass
  | MergePass
  | AnnotatePathPass
  | RestyleIconsPass;

export type AlignConstraint = {
  op: "align";
  edge: AlignEdge;
  nodes?: string[];
};

export type DistributeConstraint = {
  op: "distribute";
  axis: DistributeAxis;
  nodes?: string[];
};

export type EqualizeConstraint = {
  op: "equalize";
  dim: EqualizeDim;
  nodes?: string[];
};

export type SnapConstraint = { op: "snap"; nodes?: string[] };

export type GapConstraint = {
  op: "gap";
  min: number;
  nodes?: string[];
};

export type PlaceConstraint =
  | { op: "place"; node: string; side: PlaceSide; of: string }
  | { op: "place"; node: string; between: [string, string] };

export type Constraint =
  | AlignConstraint
  | DistributeConstraint
  | EqualizeConstraint
  | SnapConstraint
  | GapConstraint
  | PlaceConstraint;

export type Board = {
  grid: number;
  flow: Flow;
  palette: Palette;
  style: StyleToken;
  legend: boolean;
};

export type SceneMeta = { strict: boolean };

export type Rel = "left_of" | "right_of" | "above" | "below";

export type SceneView = {
  rel: Record<string, `${Rel}:${string}`[]>;
  containsSpatial: Record<string, string[]>;
};

export type Scene = {
  schema: typeof SCHEMA_ID;
  board: Board;
  selection: string[];
  lastDrawn: string | null;
  nodes: Record<string, SceneNode>;
  edges: Record<string, SceneEdge>;
  groups: Record<string, SceneGroup>;
  ink: Record<string, SceneInk>;
  passes: Pass[];
  constraints: Constraint[];
  meta: SceneMeta;
};

export type Box = { x: number; y: number; w: number; h: number };

export type AgentWriteRole = "agent" | "human" | "kernel";

export type JsonPatchOp = {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
};

export type TurnResult = {
  scene: Scene;
  say: string;
  wrote: boolean;
  ask: boolean;
  answer: string | null;
};

export const FORBIDDEN_WRITE_KEYS = new Set([
  "x",
  "y",
  "width",
  "height",
  "points",
  "cx",
  "cy",
]);
