import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { groupBox, nodeBox } from "../scene/boxes";
import { cloneJson } from "../scene/clone";
import { nextId } from "../scene/ids";
import type { Scene, SceneNode } from "../scene/types";
import {
  appendPenPoint,
  clientToWorld,
  diamondPoints,
  edgePath,
  pastMoveThreshold,
  rectFromCorners,
  type BoardTool,
} from "./geometry";
import { hitTest } from "./hit";
import { commitDrawnBox, commitLabel, commitMarquee, commitPenStroke } from "./drawOps";

export type { BoardTool };

type Cam = { x: number; y: number; k: number };

type Props = {
  scene: Scene;
  tool: BoardTool;
  onChange: (scene: Scene) => void;
  onCheckpoint: () => void;
  pickHint?: { candidates: string[] } | null;
};

type Drag =
  | { kind: "pan"; x: number; y: number; cam: Cam }
  | { kind: "move"; x: number; y: number; start: Scene; ids: string[]; moved: boolean }
  | { kind: "box"; x: number; y: number }
  | { kind: "pen"; points: [number, number][] }
  | { kind: "marquee"; x: number; y: number };

export function Board({
  scene,
  tool,
  onChange,
  onCheckpoint,
  pickHint = null,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cam, setCam] = useState<Cam>({ x: 24, y: 24, k: 1 });
  const [space, setSpace] = useState(false);
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [penDraft, setPenDraft] = useState<[number, number][] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const connectFrom = useRef<string | null>(null);

  useEffect(() => {
    function down(event: KeyboardEvent) {
      if (event.code === "Space") setSpace(true);
    }
    function up(event: KeyboardEvent) {
      if (event.code === "Space") setSpace(false);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function worldFromEvent(event: { clientX: number; clientY: number }) {
    const rect = svgRef.current!.getBoundingClientRect();
    return clientToWorld(event.clientX, event.clientY, rect, cam);
  }

  function onWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const world = clientToWorld(event.clientX, event.clientY, rect, cam);
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    const k = Math.min(3, Math.max(0.35, cam.k * factor));
    setCam({
      k,
      x: event.clientX - rect.left - world.x * k,
      y: event.clientY - rect.top - world.y * k,
    });
  }

  useEffect(() => {
    connectFrom.current = null;
  }, [tool]);

  function capture(event: PointerEvent<SVGSVGElement>) {
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const target = event.target as Element | null;
    if (target?.closest?.("input, textarea")) return;
    const p = worldFromEvent(event);
    const pan =
      space || event.button === 1 || event.button === 2 || tool === "select" && event.altKey;
    if (pan) {
      capture(event);
      drag.current = { kind: "pan", x: event.clientX, y: event.clientY, cam };
      return;
    }
    if (tool === "box") {
      const over = hitTest(scene, p.x, p.y);
      if (editingId && over === editingId) return;
      capture(event);
      drag.current = { kind: "box", x: p.x, y: p.y };
      setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    if (tool === "pen") {
      capture(event);
      drag.current = { kind: "pen", points: [[p.x, p.y]] };
      setPenDraft([[p.x, p.y]]);
      return;
    }
    const hit = hitTest(scene, p.x, p.y);
    if (tool === "connect") {
      if (!hit || !(hit in scene.nodes)) return;
      if (!connectFrom.current) {
        connectFrom.current = hit;
        const next = cloneJson(scene);
        next.selection = [hit];
        onChange(next);
        return;
      }
      if (connectFrom.current !== hit) {
        onCheckpoint();
        const next = cloneJson(scene);
        const id = nextId(next, "e_");
        next.edges[id] = {
          from: connectFrom.current,
          to: hit,
          label: "",
          kind: "sync",
          stroke: "solid",
          route: "ortho",
          exposure: null,
        };
        next.selection = [connectFrom.current, hit];
        connectFrom.current = null;
        onChange(next);
      }
      return;
    }
    if (hit && hit in scene.nodes) {
      onCheckpoint();
      let ids = scene.selection.includes(hit) ? [...scene.selection] : [hit];
      if (event.shiftKey) {
        ids = scene.selection.includes(hit)
          ? scene.selection.filter((id) => id !== hit)
          : [...scene.selection, hit];
      }
      const next = cloneJson(scene);
      next.selection = ids.filter((id) => id in next.nodes || id in next.ink);
      onChange(next);
      capture(event);
      drag.current = {
        kind: "move",
        x: p.x,
        y: p.y,
        start: next,
        ids: next.selection.filter((id) => id in next.nodes && !next.nodes[id].locked),
        moved: false,
      };
      return;
    }
    if (hit) {
      const next = cloneJson(scene);
      next.selection = event.shiftKey
        ? next.selection.includes(hit)
          ? next.selection.filter((id) => id !== hit)
          : [...next.selection, hit]
        : [hit];
      onChange(next);
      return;
    }
    capture(event);
    drag.current = { kind: "marquee", x: p.x, y: p.y };
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    if (!event.shiftKey) {
      const next = cloneJson(scene);
      next.selection = [];
      onChange(next);
    }
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current) return;
    if (current.kind === "pan") {
      setCam({
        ...current.cam,
        x: current.cam.x + (event.clientX - current.x),
        y: current.cam.y + (event.clientY - current.y),
      });
      return;
    }
    const p = worldFromEvent(event);
    if (current.kind === "box" || current.kind === "marquee") {
      setDraft(rectFromCorners(current.x, current.y, p.x, p.y));
      return;
    }
    if (current.kind === "pen") {
      const points: [number, number][] = [...current.points, [p.x, p.y]];
      current.points = points;
      setPenDraft(points);
      return;
    }
    if (current.kind === "move") {
      const dx = p.x - current.x;
      const dy = p.y - current.y;
      if (!current.moved && !pastMoveThreshold(dx, dy)) return;
      current.moved = true;
      const next = cloneJson(current.start);
      for (const id of current.ids) {
        const node = next.nodes[id];
        if (!node.pin) node.pin = { x: 0, y: 0 };
        node.pin = { x: node.pin.x + dx, y: node.pin.y + dy };
      }
      onChange(next);
    }
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const p = worldFromEvent(event);
    if (current.kind === "box") {
      const next = commitDrawnBox(scene, current.x, current.y, p.x, p.y);
      if (next) {
        onCheckpoint();
        onChange(next);
        const id = next.lastDrawn;
        if (id) queueMicrotask(() => setEditingId(id));
      }
    }
    if (current.kind === "pen") {
      const next = commitPenStroke(
        scene,
        appendPenPoint(current.points, [p.x, p.y]),
      );
      if (next) {
        onCheckpoint();
        onChange(next);
      }
    }
    if (current.kind === "marquee") {
      onChange(
        commitMarquee(scene, rectFromCorners(current.x, current.y, p.x, p.y)),
      );
    }
    setDraft(null);
    setPenDraft(null);
  }

  function onDoubleClick(event: { clientX: number; clientY: number }) {
    if (tool !== "select" && tool !== "box") return;
    const p = worldFromEvent(event);
    const hit = hitTest(scene, p.x, p.y);
    if (hit && hit in scene.nodes) {
      drag.current = null;
      setEditingId(hit);
    }
  }

  return (
    <svg
      ref={svgRef}
      className="board-svg"
      aria-label="Architecture board"
      role="application"
      data-testid="arch-board"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      <defs>
        <marker
          id="arch-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa8b9" />
        </marker>
        <pattern id="arch-grid" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="0.6" cy="0.6" r="0.6" fill="#243040" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#121820" />
      <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
        <rect x={-2000} y={-2000} width={6000} height={6000} fill="url(#arch-grid)" />
        {Object.entries(scene.groups).map(([id, group]) => {
          const box = groupBox(scene, id);
          const selected = scene.selection.includes(id);
          return (
            <g key={id}>
              <rect
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                rx={10}
                fill="none"
                stroke={selected ? "#2f6fed" : "#3d4d60"}
                strokeDasharray="8 6"
                strokeWidth={selected ? 2 : 1.25}
              />
              <text x={box.x + 10} y={box.y + 16} className="board-label dim">
                {group.label}
              </text>
            </g>
          );
        })}
        {Object.entries(scene.edges).map(([id, edge]) => {
          const from = scene.nodes[edge.from] ?? null;
          const to = scene.nodes[edge.to] ?? null;
          if (!from || !to) return null;
          const d = edgePath(nodeBox(from), nodeBox(to), edge.route);
          const selected = scene.selection.includes(id);
          return (
            <path
              key={id}
              d={d}
              fill="none"
              stroke={selected ? "#2f6fed" : "#9aa8b9"}
              strokeWidth={selected ? 2.4 : 1.6}
              strokeDasharray={edge.stroke === "dashed" ? "8 6" : undefined}
              markerEnd="url(#arch-arrow)"
            />
          );
        })}
        {Object.entries(scene.ink).map(([id, ink]) => {
          const pts = ink.points ?? [];
          if (pts.length < 2) return null;
          const d = pts
            .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`)
            .join(" ");
          const selected = scene.selection.includes(id);
          return (
            <path
              key={id}
              d={d}
              fill="none"
              stroke={selected ? "#2f6fed" : "#c5d0dc"}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {Object.entries(scene.nodes).map(([id, node]) => (
          <NodeGlyph
            key={id}
            id={id}
            node={node}
            selected={scene.selection.includes(id)}
            hinted={Boolean(pickHint?.candidates.includes(id))}
            editing={editingId === id}
            onCommit={(label) => {
              onCheckpoint();
              onChange(commitLabel(scene, id, label));
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        ))}
        {scene.board.legend ? <Legend scene={scene} /> : null}
        {draft ? (
          <rect
            x={draft.x}
            y={draft.y}
            width={draft.w}
            height={draft.h}
            fill="rgba(47,111,237,0.12)"
            stroke="#2f6fed"
            strokeDasharray="4 3"
          />
        ) : null}
        {penDraft && penDraft.length > 1 ? (
          <path
            d={penDraft
              .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`)
              .join(" ")}
            fill="none"
            stroke="#e7ecf3"
            strokeWidth={2}
          />
        ) : null}
      </g>
    </svg>
  );
}

function NodeGlyph({
  id,
  node,
  selected,
  hinted,
  editing,
  onCommit,
  onCancel,
}: {
  id: string;
  node: SceneNode;
  selected: boolean;
  hinted: boolean;
  editing: boolean;
  onCommit: (label: string) => void;
  onCancel: () => void;
}) {
  const box = nodeBox(node);
  const stroke = selected
    ? "#2f6fed"
    : hinted
      ? "#f4d58d"
      : node.style === "clean"
        ? "#8aa0b8"
        : "#c5d0dc";
  const fill = node.style === "clean" ? "#1a2430" : "#1e2833";
  const sw = selected ? 2.4 : hinted ? 2.2 : node.style === "clean" ? 1.4 : 1.8;
  const label = node.label || id;
  return (
    <g data-node={id} className={hinted ? "candidate-halo" : undefined}>
      <NodeShape box={box} node={node} fill={fill} stroke={stroke} sw={sw} />
      {editing ? (
        <foreignObject
          x={box.x + 6}
          y={box.y + box.h / 2 - 12}
          width={Math.max(48, box.w - 12)}
          height={24}
          style={{ overflow: "visible" }}
        >
          <div {...{ xmlns: "http://www.w3.org/1999/xhtml" }}>
            <input
              autoFocus
              defaultValue={node.label}
              aria-label={`Label ${id}`}
              data-testid="board-label-input"
              className="board-label-input"
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onBlur={(event) => onCommit(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommit(event.currentTarget.value);
                }
                if (event.key === "Escape") {
                  event.stopPropagation();
                  onCancel();
                }
              }}
            />
          </div>
        </foreignObject>
      ) : (
        <text
          x={box.x + box.w / 2}
          y={box.y + box.h / 2 + 4}
          textAnchor="middle"
          className="board-label"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function NodeShape({
  box,
  node,
  fill,
  stroke,
  sw,
}: {
  box: { x: number; y: number; w: number; h: number };
  node: SceneNode;
  fill: string;
  stroke: string;
  sw: number;
}) {
  const { x, y, w, h } = box;
  if (node.shape === "ellipse") {
    return (
      <ellipse
        cx={x + w / 2}
        cy={y + h / 2}
        rx={w / 2}
        ry={h / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }
  if (node.shape === "diamond") {
    return (
      <polygon
        points={diamondPoints(box)}
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }
  if (node.shape === "cylinder") {
    const ry = Math.min(14, h / 6);
    return (
      <g>
        <rect x={x} y={y + ry} width={w} height={h - ry * 2} fill={fill} stroke="none" />
        <ellipse cx={x + w / 2} cy={y + h - ry} rx={w / 2} ry={ry} fill={fill} stroke={stroke} strokeWidth={sw} />
        <rect x={x} y={y + ry} width={w} height={h - ry * 2} fill={fill} stroke={stroke} strokeWidth={sw} />
        <ellipse cx={x + w / 2} cy={y + ry} rx={w / 2} ry={ry} fill={fill} stroke={stroke} strokeWidth={sw} />
      </g>
    );
  }
  if (node.shape === "actor") {
    const head = Math.min(w, h) * 0.28;
    return (
      <g>
        <circle cx={x + w / 2} cy={y + head + 4} r={head} fill={fill} stroke={stroke} strokeWidth={sw} />
        <path
          d={`M ${x + 8} ${y + h - 6} L ${x + w / 2} ${y + head * 2 + 8} L ${x + w - 8} ${y + h - 6}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      </g>
    );
  }
  if (node.shape === "queue") {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={stroke} strokeWidth={sw} />
        <path d={`M ${x + 10} ${y + 8} L ${x + 10} ${y + h - 8}`} stroke={stroke} strokeWidth={sw} />
        <path d={`M ${x + 18} ${y + 8} L ${x + 18} ${y + h - 8}`} stroke={stroke} strokeWidth={sw} />
      </g>
    );
  }
  const rx = node.style === "clean" ? 4 : 8;
  return (
    <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={sw} />
  );
}

function Legend({ scene }: { scene: Scene }) {
  const kinds = [...new Set(Object.values(scene.nodes).map((n) => n.kind))];
  return (
    <g transform="translate(8,8)" pointerEvents="none">
      <rect width={140} height={20 + kinds.length * 18} rx={6} fill="#141b22" stroke="#2a3544" />
      <text x={10} y={16} className="board-label dim">
        Legend
      </text>
      {kinds.map((kind, i) => (
        <text key={kind} x={10} y={34 + i * 18} className="board-label">
          {kind}
        </text>
      ))}
    </g>
  );
}
