import type { Command, PerfectShape } from "../../intent/types";
import type {
  AlignEdge,
  DistributeAxis,
  EqualizeDim,
  Scene,
  Shape,
} from "../../scene/types";
import type { EditToolCall } from "./types";

export function desugarCommand(command: Command, scene?: Scene): EditToolCall[] {
  switch (command.op) {
    case "align":
      return [{ tool: "align", args: { edge: command.args.edge as AlignEdge } }];
    case "distribute":
      return [
        { tool: "distribute", args: { axis: command.args.axis as DistributeAxis } },
      ];
    case "equalize":
      return [
        {
          tool: "equalize",
          args: { dim: (command.args.dim as EqualizeDim) ?? "both" },
        },
      ];
    case "snap":
      return [{ tool: "snap", args: {} }];
    case "bigger":
      return [{ tool: "bump_size", args: { dir: 1 } }];
    case "smaller":
      return [{ tool: "bump_size", args: { dir: -1 } }];
    case "rotate":
      return [{ tool: "rotate", args: {} }];
    case "connect": {
      const nodes = scene
        ? scene.selection.filter((id) => id in scene.nodes)
        : [];
      if (nodes.length >= 2) {
        return [{ tool: "add_edge", args: { from: nodes[0], to: nodes[1] } }];
      }
      return [{ tool: "add_edge", args: { from: "", to: "" } }];
    }
    case "perfect": {
      const calls: EditToolCall[] = [
        { tool: "convert_ink", args: {} },
        { tool: "beautify", args: { scope: "selection" } },
      ];
      const shape = (command.args.shape as PerfectShape | undefined) ?? "auto";
      if (shape !== "auto" && shape !== "line" && scene) {
        const mapped: Shape =
          shape === "ellipse"
            ? "ellipse"
            : shape === "diamond"
              ? "diamond"
              : "rectangle";
        for (const id of scene.selection) {
          if (scene.nodes[id]) {
            calls.push({
              tool: "set_node",
              args: { target: id, patch: { shape: mapped, style: "clean" } },
            });
          }
        }
      }
      return calls;
    }
    case "unknown":
      return [];
    default:
      return [];
  }
}
