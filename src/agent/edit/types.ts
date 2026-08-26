import type {
  AlignEdge,
  DistributeAxis,
  EqualizeDim,
  Icon,
  NodeKind,
  PlaceSide,
  Scene,
  SceneEdge,
  SceneNode,
  Shape,
  SizeToken,
  StyleToken,
} from "../../scene/types";

export type SemanticNodeSpec = {
  kind?: NodeKind;
  label: string;
  icon?: Icon | null;
  shape?: Shape;
  size?: SizeToken;
  style?: StyleToken;
};

export type SemanticNodePatch = Partial<
  Pick<SceneNode, "kind" | "label" | "icon" | "shape" | "size" | "style" | "locked" | "rotation">
>;
// MUST NOT include pin

export type SemanticEdgePatch = Partial<
  Pick<SceneEdge, "label" | "kind" | "stroke" | "route" | "exposure">
>;

export type PlaceArgs =
  | { node: string; side: PlaceSide; of: string }
  | { node: string; between: [string, string] };

export type EditToolCall =
  | { tool: "ask"; args: { say: string } }
  | { tool: "add_node"; args: { id?: string; spec: SemanticNodeSpec } }
  | { tool: "insert_on_path"; args: { node: string; on: string } }
  | { tool: "add_edge"; args: { from: string; to: string; props?: SemanticEdgePatch } }
  | { tool: "remove_node"; args: { remove: string; retarget_to: string } }
  | { tool: "merge_nodes"; args: { ids: string[]; keep: string } }
  | { tool: "set_node"; args: { target: string; patch: SemanticNodePatch } }
  | { tool: "update_edge"; args: { edge: string; patch: SemanticEdgePatch } }
  | { tool: "remove_edge"; args: { edge: string } }
  | { tool: "align"; args: { edge: AlignEdge; nodes?: string[] } }
  | { tool: "distribute"; args: { axis: DistributeAxis; nodes?: string[] } }
  | { tool: "equalize"; args: { dim: EqualizeDim; nodes?: string[] } }
  | { tool: "snap"; args: { nodes?: string[] } }
  | { tool: "place"; args: PlaceArgs }
  | { tool: "beautify"; args: { scope: "selection" | "board" } }
  | { tool: "convert_ink"; args: { ids?: string[] } }
  | { tool: "tidy_layout"; args: { scope: string } }
  | { tool: "unoverlap"; args: { scope: string } }
  | { tool: "restyle_icons"; args: Record<string, never> }
  | { tool: "annotate_path"; args: { from: string; to: string } }
  | { tool: "unpin"; args: { target: string } }
  | { tool: "bump_size"; args: { dir: 1 | -1; nodes?: string[] } }
  | { tool: "rotate"; args: { nodes?: string[] } };

export type SemanticDiff = {
  nodesAdded: string[];
  nodesRemoved: string[];
  edgesAdded: string[];
  edgesRemoved: string[];
  labelsChanged: string[];
  kindsChanged: string[];
};

export type EditError = { code: string; message: string };

export type EditResult = {
  scene: Scene;
  say: string;
  wrote: boolean;
  ask: boolean;
  answer: string | null;
  ok: boolean;
  beforeHash: string;
  afterHash: string;
  diff: SemanticDiff;
  errors: EditError[];
};

export type EditPlanContext = { transcript: string; maxCalls?: number };
