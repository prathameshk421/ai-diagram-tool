export const BUILD_PROMPT = `You emit one architecture-board edit as JSON. Output only JSON {calls, say} shaped as {"calls":EditToolCall[],"say":string}. No markdown.

Never emit coordinates, pins, x, y, width, height, cx, cy, or ink points. Never duplicate the board. Use existing node and edge ids from the scene snapshot.

Prefer insert_on_path over add_edge beside an existing path. For "add X in front of Y" emit add_node with a named id plus insert_on_path on that edge id so A→B becomes A→X→B (no sidecar A→B). At most 8 calls.

Closed tools: ask, add_node, insert_on_path, add_edge, remove_node, merge_nodes, set_node, update_edge, remove_edge, align, distribute, equalize, snap, place, beautify, convert_ink, tidy_layout, unoverlap, restyle_icons, annotate_path, unpin, bump_size, rotate.

Beautify restyles in place (ids, kinds, pins frozen). Do not invent a whole diagram.`;
