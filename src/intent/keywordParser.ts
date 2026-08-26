import {
  BARE_ALIGN_SAY,
  BARE_DISTRIBUTE_SAY,
  type Command,
  UNKNOWN_SAY,
  unknownCommand,
} from "./types";

const HIT = 0.8;

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hit(
  op: Command["op"],
  args: Record<string, unknown>,
  say: string,
): Command {
  return { op, args, confidence: HIT, say };
}

export function keywordParser(text: string): Command {
  const s = normalize(text);
  if (!s) return unknownCommand(UNKNOWN_SAY, 0);

  if (
    /perfect.*circle/.test(s) ||
    /make (this |it )?(a )?circle/.test(s) ||
    /\bellipse\b/.test(s)
  ) {
    return hit("perfect", { shape: "ellipse" }, "Perfected the selection.");
  }
  if (
    /make (this |it )?(a )?rectangle/.test(s) ||
    /make (this |it )?(a )?box/.test(s)
  ) {
    return hit("perfect", { shape: "rectangle" }, "Perfected the selection.");
  }
  if (/\bdiamond\b/.test(s) && /(perfect|make)/.test(s)) {
    return hit("perfect", { shape: "diamond" }, "Perfected the selection.");
  }
  if (/make (this |it )?(a )?line/.test(s)) {
    return hit("perfect", { shape: "line" }, "Perfected the selection.");
  }
  if (/perfect/.test(s) || /clean (this )?up/.test(s)) {
    return hit("perfect", { shape: "auto" }, "Perfected the selection.");
  }

  if (/align left|left align/.test(s)) {
    return hit("align", { edge: "left" }, "Aligned left.");
  }
  if (/align right/.test(s)) {
    return hit("align", { edge: "right" }, "Aligned right.");
  }
  if (/align top/.test(s)) {
    return hit("align", { edge: "top" }, "Aligned top.");
  }
  if (/align bottom/.test(s)) {
    return hit("align", { edge: "bottom" }, "Aligned bottom.");
  }
  if (/center( these)? horizontally|align (horizontal )?cent/.test(s)) {
    return hit("align", { edge: "centerH" }, "Aligned center horizontally.");
  }
  if (/center( these)? vertically|align (vertical )?cent/.test(s)) {
    return hit("align", { edge: "centerV" }, "Aligned center vertically.");
  }
  if (/\balign\b/.test(s)) {
    return unknownCommand(BARE_ALIGN_SAY, HIT);
  }

  if (/distribut.*vert|space .*vert/.test(s)) {
    return hit("distribute", { axis: "v" }, "Distributed vertically.");
  }
  if (/distribut.*horiz|space .*horiz/.test(s)) {
    return hit("distribute", { axis: "h" }, "Distributed horizontally.");
  }
  if (/distribut|space .*even/.test(s)) {
    return unknownCommand(BARE_DISTRIBUTE_SAY, HIT);
  }

  if (/\bsnap\b/.test(s)) {
    return hit("snap", {}, "Snapped to grid.");
  }

  if (/same width/.test(s)) {
    return hit("equalize", { dim: "width" }, "Equalized width.");
  }
  if (/same height/.test(s)) {
    return hit("equalize", { dim: "height" }, "Equalized height.");
  }
  if (/same size|equalize/.test(s)) {
    return hit("equalize", { dim: "both" }, "Equalized size.");
  }

  if (/bigger|enlarge|grow/.test(s)) {
    return hit("bigger", {}, "Made bigger.");
  }
  if (/smaller|shrink/.test(s)) {
    return hit("smaller", {}, "Made smaller.");
  }

  if (/\bconnect\b/.test(s)) {
    return hit("connect", {}, "Connected selection.");
  }

  if (/\brotate\b/.test(s)) {
    return hit("rotate", { degrees: 90 }, "Rotated 90°.");
  }

  return unknownCommand(UNKNOWN_SAY, 0);
}
