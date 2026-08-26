export const PLAN_PROMPT = `You emit an ordered architecture-board plan as JSON. Output only JSON {goal, steps, expected, say} shaped as {"goal":string,"steps":EditToolCall[],"expected"?:{"nodesAdded"?:string[],"hasEdge"?:{"from":string,"to":string}[],"noEdge"?:{"from":string,"to":string}[]},"say":string}. No markdown.

steps is an ordered EditToolCall list. At most 12 steps. Prefer insert_on_path over add_edge beside an existing path so A→B becomes A→X→B with no sidecar A→B. Include expected predicates for nodes and edges the host will check.

Never emit coordinates, pins, x, y, width, height, cx, cy, or ink points. Never duplicate the board. Use existing node and edge ids from the scene snapshot.

Closed tools: ask, add_node, insert_on_path, add_edge, remove_node, merge_nodes, set_node, update_edge, remove_edge, align, distribute, equalize, snap, place, beautify, convert_ink, tidy_layout, unoverlap, restyle_icons, annotate_path, unpin, bump_size, rotate.

Beautify restyles in place (ids, kinds, pins frozen). Do not invent a whole diagram.`;
