export const JUDGE_PROMPT = `Pick one route for this architecture-board utterance. Output only JSON {"route":"command"|"build"|"plan","reason":string}. No markdown. Never emit coordinates, pins, hex colors, or ink points.

command = the nine layout ops (perfect, align, distribute, snap, bigger, smaller, equalize, connect, rotate).
build = 1–2 kernel tools (insert on a named edge, connect named nodes, set a label).
plan = merge, delete, or any multi-step edit.

Prefer command for layout ops. Prefer build for a single structural step. Do not default to plan when unsure.`;
