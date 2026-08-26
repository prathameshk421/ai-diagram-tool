# Canvas research: an agent-optimized scene (not a drawing dump)

**Status:** research only. This file does **not** ship a board. The running slice is still voice → Command JSON with no geometry (`docs/features.md` §4, `docs/implementation-plan.md` locked item 6).

**Question:** how do we build a canvas that an LLM agent can understand and mutate, without asking the model to do the math?

**Answer:** keep three layers. The model talks in **named ops and relations**. Code owns **boxes, grids, and solvers**. The renderer only paints the solved geometry.

```
speech/type  →  Command {op, args}     already shipped
                    ↓
             tool on selection
                    ↓
     logical scene  →  constraints  →  solved AABBs  →  pixels
                    ↑
             compact AgentView (no raw x/y)
```

That split is already locked in this repo: Command JSON is the contract, the LLM never emits coordinates, and a later canvas binds the same ops as tools against an agent-optimized scene — not an Excalidraw/tldraw dump (`docs/features.md` §3, §7).

---

## 1. Why the math cannot live in the model

LLMs are strong at *naming* (“align these left”, “API talks to the DB”) and weak at *placing*. Across domains the same failure shows up: the model can describe a layout and still cannot construct a consistent coordinate assignment.

| Finding | Source |
|---|---|
| Models **comprehend** spatial layouts far better than they **construct** them. Construction errors then poison later reasoning. | *Learning to Draw ASCII Improves Spatial Reasoning in Language Models* (2026), [arXiv:2604.14641](https://arxiv.org/abs/2604.14641) |
| Qualitative spatial relations (left-of, contains) are still a bottleneck; anonymizing relation names drops accuracy — models are not a substitute for a symbolic spatial reasoner. | Cohn et al. on RCC-8 / GSR-BENCH summaries in [Spatial Reasoning in LLMs](https://www.emergentmind.com/topics/spatial-reasoning-in-llms) |
| CAD DSLs that force the model to emit coordinates lose to a **solver-aided** language even when the coordinate language is in the training set (OpenSCAD). | Jones et al., *AIDL*, [arXiv:2502.09819](https://arxiv.org/abs/2502.09819) |
| Dumping a raw editor document into the prompt is exactly what this product refused. | `docs/features.md` §2 “Screenshot / dump-the-scene agents” |

So “the math shit” is not something DeepSeek should approximate. It is a small, deterministic kernel you write once, then expose as tools whose args already exist in `src/intent/types.ts`.

**LayoutGPT** ([Feng et al., NeurIPS 2023](https://arxiv.org/abs/2305.15393)) is the other fork in the road: they *do* ask the LLM for `left/top/width/height`, but wrap them as CSS so the numbers have names. That helps image/scene *generation*. It is the wrong default here. This product already rejects coordinate keys (`x`, `y`, `width`, `height`, `points`, `cx`, `cy`) at parse time. Keep that. Let code compute the numbers.

---

## 2. The three-layer scene (what to build)

Steal the C4/Structurizr idea: **model ≠ view ≠ pixels**. Structurizr’s pitch for agents is the same as ours — a text-shaped architecture model, layout as a separate engine ([Why “as code”?](https://docs.structurizr.com/as-code), [Structurizr](https://structurizr.com/)).

| Layer | Lives in | What it stores | Who writes it |
|---|---|---|---|
| **Logical scene** | `src/scene/` (later) | Stable ids, kind, label, edges, groups, selection | User draw + `connect` tool |
| **Constraints** | same module | “these share left edge”, “even gaps”, “on 8px grid” | Command tools (`align`, `distribute`, `snap`, …) |
| **Geometry** | same module, private | Axis-aligned boxes `x,y,w,h`, rotation, edge routes | Solver / closed-form kernel only |
| **Agent view** | projection | Labels, kinds, selection, **relative** relations (`left_of`, `connected_to`) | Read-only compact JSON |
| **Pixels** | canvas renderer | SVG/Canvas2D of the solved boxes | Not in the model context |

The agent never sees stroke JSON, z-index bags, or font metrics. It sees something closer to:

```json
{
  "selection": ["n_api"],
  "nodes": [
    {
      "id": "n_api",
      "kind": "service",
      "label": "API",
      "shape": "rectangle",
      "rel": ["left_of:n_db", "above:n_cache"]
    }
  ],
  "edges": [{ "id": "e1", "from": "n_api", "to": "n_db", "label": "reads" }]
}
```

Ids are **minted by code**, not by the LLM (already locked: implementation plan item 10). Selection comes from the canvas, which retires today’s `selectionCount` stub.

### Why a graph, not a tree

Architecture diagrams are **compound graphs**: a box can sit in a group *and* be aligned with a sibling *and* own an edge. MIT **Bluefish** (UIST 2024) is the diagram-language paper for that: relations are not UI components with sole ownership of children; layout is jointly determined, and the runtime is a relational scenegraph ([paper](https://vis.csail.mit.edu/pubs/bluefish.pdf), [site](https://vis.csail.mit.edu/pubs/bluefish/)).

Bluefish’s standard relations are almost our Command list: Align, Distribute, Stack, Contain, connector. That is the vocabulary the agent should keep using. The solver behind those words can change without changing the tools.

---

## 3. What “the math” is, in order of need

You do **not** start with a general optimizer. The locked ops are almost all **closed-form operations on axis-aligned bounding boxes (AABBs)**. A Cassowary-class solver earns its keep only when constraints must *persist* after the next drag or command.

### 3.1 Boxes (v1 kernel — write this yourself)

Every node is a box. Ignore rotation until `rotate` runs; even then, architecture boxes usually stay AABB (swap width/height on 90°).

Let each selected node \(i\) have \(x_i, y_i, w_i, h_i\).

| Command | Math (code, not LLM) |
|---|---|
| `align` `left` | \(x_i \leftarrow \min_j x_j\) |
| `align` `right` | \(x_i + w_i \leftarrow \max_j (x_j + w_j)\) |
| `align` `top` / `bottom` | same on \(y\) / \(y+h\) |
| `align` `centerV` | \(x_i + w_i/2 \leftarrow\) mean or first-selected center X |
| `align` `centerH` | same on Y |
| `distribute` `h` | sort by center X (or left); set gaps or centers evenly between first and last |
| `distribute` `v` | same on Y |
| `snap` | \(x \leftarrow g\,\mathrm{round}(x/g)\) (and \(y,w,h\)) for grid size \(g\) |
| `bigger` / `smaller` | scale \(w,h\) about center by \(1.1\) / \(0.9\) (pick one factor and keep it) |
| `equalize` `width` | \(w_i \leftarrow \max_j w_j\) (or mean; pick max — architecture boxes look “grown to match”) |
| `equalize` `height` / `both` | same |
| `rotate` `90` | about center: \((w,h) \leftarrow (h,w)\); for lines, rotate the two endpoints |
| `perfect` `auto` | classify by aspect + stroke: near-square → rectangle with \(w=h\) optional; high aspect → rectangle; closed round → ellipse; two-point → line. Then snap rotation to \(\{0,90\}\) |
| `connect` | add a logical edge; **route** in geometry (straight first; orthogonal later) |

**Distribute** needs an explicit policy: even *gaps* (space between boxes) vs even *centers*. Even gaps is what designers mean by “space these evenly”. Centers is simpler and looks wrong when widths differ. Implement gaps.

**Align** with one selected node: no-op, still a valid Command (system prompt already says do not switch op when `selectionCount < 2`).

These formulas are the entire v1 “constraint solver”. Unit-test them with integer boxes. No library required.

### 3.2 Persistent constraints (v2 — Cassowary / kiwi)

Once the user can drag a box *and* you still want “those three stay left-aligned”, you need incremental linear constraints.

**Cassowary** (Badros, Borning, Stuckey, *TOCHI* 2001; UIST 1997) is the algorithm: dual simplex over equalities and inequalities, with required vs preferred strengths. It is what Apple Auto Layout runs. Paper: [TOCHI PDF](https://constraints.cs.washington.edu/solvers/cassowary-tochi.pdf), toolkit notes: [UW Cassowary](https://constraints.cs.washington.edu/cassowary/).

A box is eight linear variables that are not independent. Pelican (agent-diagram system, [femtomc/pelican](https://github.com/femtomc/pelican)) states the invariant cleanly: `left, right, center_x, width` form one 2-degree-of-freedom system; `top, bottom, center_y, height` another. Setting any two on an axis determines the rest.

Map our ops to Cassowary:

- `align left` → required \(x_i = x_{\mathrm{ref}}\) (or stay-constraint on the group)
- `distribute` → equal spacing variables between sorted neighbors
- `snap` → stay near the rounded values, or round after solve
- `bigger` → edit width/height, let stays pull neighbors if you encoded them

JS implementation to use later: **kiwi.js** (Nucleic Kiwi, a faster Cassowary). Do not take this dependency in v1.

**DeltaBlue** (Freeman-Benson, Maloney, Borning, 1990) is the older local-propagation solver. Fine if constraints are a DAG. Cassowary is the one that survives cycles (“A left of B and B left of C and C’s left = A’s left”).

### 3.3 Graph layout (v3 — only for “place this new service” / “tidy the diagram”)

When the user adds nodes without dragging, you need a **layered digraph layout**, not a box aligner. That is Sugiyama:

Sugiyama, Tagawa, Toda. *Methods for Visual Understanding of Hierarchical System Structures.* IEEE SMC 11(2), 1981. [DOI](https://doi.org/10.1109/tsmc.1981.4308636)

Pipeline (this is the math you would otherwise reinvent):

1. **Cycle breaking** — reverse a few edges so the graph is a DAG.
2. **Layer assignment** — nodes on ranks so edges point one way (network simplex or longest-path).
3. **Crossing minimization** — permute order inside each rank (NP-hard; barycenter heuristic is standard).
4. **Node placement** — assign coordinates inside the rank.
5. **Edge routing** — orthogonal or polyline, often with dummy nodes for long spans.

Production engine: **ELK Layered** / [`elkjs`](https://github.com/kieler/elkjs). ELK is layout only — it returns `x,y,w,h`. You still own the scene. Survey: *The Eclipse Layout Kernel*, GD 2024, [PDF](https://drops.dagstuhl.de/storage/00lipics/lipics-vol320-gd2024/LIPIcs.GD.2024.56/LIPIcs.GD.2024.56.pdf).

Do **not** call ELK on every `align left`. ELK is for global placement. Local ops stay closed-form / Cassowary so the user’s last nudge is not thrown away.

**Separation-constraint graph layout** (Dwyer, Marriott, Wybrow — IPSep-CoLa / Adaptagrams / cola.js) sits between the two: force layout subject to “A left-of B” inequalities. Useful if you want “keep these non-overlapping” while the user drags. Optional v3, not v1.

### 3.4 Nonlinear “make it pretty” (do not start here)

**Penrose** (Ye, Ni, et al., SIGGRAPH 2020) compiles `ensure` / `encourage` predicates into a constrained optimization and solves with an exterior-point L-BFGS method. [Project](https://penrose.cs.cmu.edu/siggraph20), [PDF](https://www.cs.cmu.edu/~jssunshi/assets/pdf/penrose.pdf). **Feynman** (2026) then has an LLM emit Penrose programs ([arXiv:2603.12597](https://arxiv.org/abs/2603.12597)).

That is the right stack for *math illustration*, the wrong stack for interactive architecture commands. You cannot incrementally satisfy “align these three” with a batch energy minimizer without fighting the user’s last drag. Keep Penrose in the reading list; do not take it as the canvas kernel.

**Sketchpad** (Sutherland, 1963) is the historical parent: the user draws, the system maintains geometric constraints. Same idea, 60 years earlier.

---

## 4. How other agent canvases do it (copy the split, not the dump)

| System | What the model sees | What computes x,y | Takeaway for us |
|---|---|---|---|
| **This repo (locked)** | `{op, args}` + `selectionCount` stub | nothing yet | Keep ops; replace stub with real selection |
| **tldraw Agent kit** | Screenshot **plus** Blurry / Focused / Peripheral shape JSON, including bounds | Model may emit coordinates; sanitizer fixes ids and numbers | Dual visual+structured context is smart. **Letting the model emit x,y is not**, given our contract. Use their *tiered* scene idea (focused vs peripheral) without the coordinate out-channel. Docs: [tldraw AI](https://tldraw.dev/docs/ai), [agent kit](https://tldraw.dev/starter-kits/agent) |
| **Pelican** | Queryable bboxes + predicates (contain, overlap, align, distance) | Local propagation; optional Kiwi | Closest “diagrams for agents” design. Agent **reads** geometry, **writes** relations. [repo](https://github.com/femtomc/pelican) |
| **AIDL** | Hierarchical named parts + constraints (`above`, coincident, …) | Geometric constraint solver | Language designed *for* LLMs: names and relations, solver does space. [arXiv:2502.09819](https://arxiv.org/abs/2502.09819), [code](https://github.com/deGravity/aidl) |
| **Bluefish** | Declarative relations in TypeScript | Local propagation on a relational scenegraph | Relation API ≈ our tools. [PDF](https://vis.csail.mit.edu/pubs/bluefish.pdf) |
| **Structurizr / C4** | DSL model (people, systems, rels) | Auto or manual layout in the view | Architecture belongs in the logical layer, not in pixels |
| **diag-agent** | PlantUML / Mermaid / C4 text | Kroki renderer | Good for *generate a whole diagram*. This product refused whole-board generation from a speech dump. Use as a cousin, not the path. |
| **agentic-scene-graph** | JSON furniture + relational rules | CP-SAT on a grid | Same thesis in 3D rooms: LLM declares, solver places. [repo](https://github.com/divinrkz/agentic-scene-graph) |
| **LaySPA / LayoutAgent** | Structured canvas spec or VLM scene graph | RL policy or diffusion for boxes | Research on *generating* layouts. We are *editing* a live selection. Different job. |

**Excalidraw** (the `frontend/` placeholder) is a human ink editor. Its document is a bad agent IR: arrows as freehand polylines, unbound text, element IDs, files, frames. Binding Command tools to Excalidraw JSON would recreate the “dump-the-scene” anti-pattern this slice already rejected.

---

## 5. Agent-ready tools (the API the model actually calls)

When the canvas exists, each `Command.op` becomes a tool with the **same args** already validated in `isCommand` (`docs/implementation-plan.md` §6). That is the agent-readiness work: enums, required fields, structured errors — the same pillars as agent-ready HTTP APIs, applied to tools.

Minimum tool surface:

| Tool | Args (already specified) | Effect |
|---|---|---|
| `perfect` | `shape?: auto\|ellipse\|rectangle\|diamond\|line` | Canonicalize selected geometry |
| `align` | `edge` required | AABB align |
| `distribute` | `axis` required | Even gaps |
| `snap` | `{}` | Grid |
| `bigger` / `smaller` | `{}` | Scale about center |
| `equalize` | `dim?: both\|width\|height` | Match size |
| `connect` | `{}` | Edge between two selected nodes |
| `rotate` | `degrees?: 90` | 90° AABB swap |

Plus **read** tools the current harness does not have yet (still no coordinates in the *write* path):

| Tool | Returns |
|---|---|
| `getSelection` | ids + labels + kinds |
| `getScene` | compact AgentView (relative relations, not raw boxes) |
| `getNeighbors` | edges in/out of selection |

Structured failures, so the model can self-heal without inventing geometry:

- `need_axis` — bare “align these”
- `need_two` — `connect` with one selected
- `empty_selection`
- `unknown_id` — never let the model mint ids to “fix” this

Do not add a `setPosition({x,y})` tool. If a later “put the API to the left of the DB” command appears, the arg is `side: "left"`, `target: "n_db"` — still a relation. Code computes the translation.

---

## 6. Proposed TypeScript scene (for when you build it)

Sketch only. Do not add `src/geometry/**` in this slice (`docs/implementation-plan.md` §1).

```ts
export type NodeId = string;
export type EdgeId = string;

export type NodeKind = "generic" | "service" | "store" | "queue" | "actor" | "group";

export type SceneNode = {
  id: NodeId;
  kind: NodeKind;
  label: string;
  shape: "rectangle" | "ellipse" | "diamond" | "line";
  /** private to the kernel — never in LLM output */
  box: { x: number; y: number; w: number; h: number; rotation: 0 | 90 };
};

export type SceneEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  label?: string;
};

export type Constraint =
  | { kind: "align"; edge: AlignEdge; nodeIds: NodeId[] }
  | { kind: "distribute"; axis: "h" | "v"; nodeIds: NodeId[] }
  | { kind: "snap"; grid: number }
  | { kind: "equalize"; dim: EqualizeDim; nodeIds: NodeId[] };

export type Scene = {
  nodes: SceneNode[];
  edges: SceneEdge[];
  constraints: Constraint[]; // empty in v1; filled when stays persist
  selection: NodeId[];
  grid: number; // e.g. 8
};

export type Rel = `${"left_of" | "right_of" | "above" | "below" | "overlaps"}:${NodeId}`;

export type AgentNode = {
  id: NodeId;
  kind: NodeKind;
  label: string;
  shape: SceneNode["shape"];
  rel: Rel[];
};

export type AgentView = {
  selection: NodeId[];
  nodes: AgentNode[];
  edges: { id: EdgeId; from: NodeId; to: NodeId; label?: string }[];
};
```

`applyCommand(scene, command): Scene` is a pure function. Undo is the previous scene. Tests are box arithmetic. The React canvas is a view of `scene.nodes[].box`.

Relative relations in `AgentView` are derived, e.g. `left_of` if \(x_i + w_i \le x_j\) and the Y intervals overlap enough (IoU or center-band). That is cheap computational geometry (interval overlap), not a vision model.

---

## 7. DIY build order (when a canvas PR is allowed)

Stay inside the locked product: no whole-diagram generation, no vision pretty-up, no Web Speech, no keyword table, geometry stays in code.

1. **Scene + selection, no LLM change.** Draw rectangles you click. `selection` is ids. Harness `selectionCount` becomes `scene.selection.length`. Still preview Command JSON only if you want a thin vertical slice — or start executing.
2. **`applyCommand` for align / distribute / snap / equalize / bigger / smaller.** Closed-form AABB. Vitest on integer fixtures. This is the math.
3. **`connect` + straight edges.** Logical edge list; clip the line to box borders (geometry: intersect segment with rectangle).
4. **`perfect` + `rotate`.** Shape enum + 90° swap. “Perfect this circle” is already an intent op; execution snaps the AABB and `shape`.
5. **`toAgentView(scene)`.** Relative relations. Optionally feed it back on the next intent call as context *in addition to* `{transcript, selectionCount}` — still no coordinates in the *output* schema.
6. **Custom renderer** (SVG). Not Excalidraw. Not tldraw document export. Pan/zoom is view-transform over the same boxes.
7. **Persistent constraints + kiwi** only after drag exists and “align” should survive a later move.
8. **elkjs** only for “place a newly created node” or an explicit tidy op you have not locked yet. Adding a `tidy` op is a **product** change (`docs/features.md`), not a silent extra.

Human drawing can stay crude: click-drag a box, type a label, shift-click select. The agent path is the nine ops. That is enough for the architecture-diagram loop this product claimed.

---

## 8. Paper and system list (read in this order)

### Must read (matches this product)

1. Jones, Zhang, Hähnlein, Matusik, Ahmad, Kim, Schulz. **A Solver-Aided Hierarchical Language for LLM-Driven CAD Design (AIDL).** arXiv:2502.09819, 2025. https://arxiv.org/abs/2502.09819 — thesis: offload space to a solver; give the model names and relations.
2. Pollock, Mei, et al. **Bluefish: Composing Diagrams with Declarative Relations.** UIST 2024. https://vis.csail.mit.edu/pubs/bluefish.pdf — relation API and relational scenegraph.
3. Badros, Borning, Stuckey. **The Cassowary Linear Arithmetic Constraint Solving Algorithm.** TOCHI 8(4), 2001. https://constraints.cs.washington.edu/solvers/cassowary-tochi.pdf — the linear math behind align/distribute that must persist.
4. Sugiyama, Tagawa, Toda. **Methods for Visual Understanding of Hierarchical System Structures.** IEEE SMC 11(2), 1981. https://doi.org/10.1109/tsmc.1981.4308636 — the global layout math for architecture graphs.
5. Pelican README + source. **Constraint-based technical diagrams for AI agents.** https://github.com/femtomc/pelican — queryable boxes, inspect-after-solve loop.

### Strongly related

6. Ye, Ni, Krieger, Ma’ayan, Wise, Aldrich, Sunshine, Crane. **Penrose: From Mathematical Notation to Beautiful Diagrams.** SIGGRAPH 2020 / TOG 39(4). https://www.cs.cmu.edu/~jssunshi/assets/pdf/penrose.pdf — `ensure`/`encourage` optimization; too heavy for v1 editing.
7. Feng, Zhu, et al. **LayoutGPT.** NeurIPS 2023. https://arxiv.org/abs/2305.15393 — structured layout *generation*; contrast with our no-coordinate write path.
8. *Learning to Draw ASCII Improves Spatial Reasoning in Language Models.* 2026. https://arxiv.org/abs/2604.14641 — construction vs comprehension gap.
9. tldraw **Agent starter kit.** https://tldraw.dev/starter-kits/agent — tiered scene (focused / blurry / peripheral); do not copy coordinate emission.
10. Eclipse Layout Kernel / elkjs. https://github.com/kieler/elkjs and GD 2024 note: https://drops.dagstuhl.de/storage/00lipics/lipics-vol320-gd2024/LIPIcs.GD.2024.56/LIPIcs.GD.2024.56.pdf
11. Brown / Structurizr. C4 model + DSL. https://structurizr.com/ — architecture as a model, layout as a view.
12. Sutherland. **Sketchpad.** 1963. Constraint drawing origin story.

### Optional / adjacent

13. Feynman diagramming agent + Penrose. https://arxiv.org/abs/2603.12597
14. LayoutAgent (VLM + scene graph + diffusion). OpenReview PDF linked from 2025/26 layout-agent work.
15. Agentic scene graph + CP-SAT. https://github.com/divinrkz/agentic-scene-graph
16. Adaptagrams / cola.js (Dwyer et al., IPSep-CoLa) — separation constraints while dragging.
17. Borning, Marriott, Stuckey, Xiao. **Solving Linear Arithmetic Constraints for User Interface Applications.** UIST 1997. Cassowary’s conference version.
18. Freeman-Benson, Maloney, Borning. **An incremental constraint solver.** CACM 1990. DeltaBlue.

---

## 9. What this research does *not* change

- Command ops, OmniRoute-on-every-phrase, Groq STT, no keyword table.
- No drawing surface in the *current* slice.
- No vision model to pretty up ink.
- No whole-diagram generation from a long prompt.
- LLM still must not emit coordinates.

When you open a canvas PR, update `docs/features.md` §7 with the scene fields you actually ship, `FLOW.md` with tool dispatch, and `DECISIONS.md` with the kernel choice (closed-form v1 vs kiwi). Until then this file is the map.

---

## 10. One-sentence design

**The canvas is a small architecture graph plus a box kernel; the agent calls `align`/`connect`/… on a selection and reads back labels and “left of / connected to”, while every pixel is solved in code.**
