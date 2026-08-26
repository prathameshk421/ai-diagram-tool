import { cloneJson } from "./clone";
import type { Scene } from "./types";

export type JournalEntry = {
  label: string;
  before: Scene;
  after: Scene;
};

export class SceneHistory {
  private snapshots: Scene[] = [];
  private journal: JournalEntry[] = [];

  snapshot(scene: Scene): void {
    this.snapshots.push(cloneJson(scene));
  }

  record(label: string, before: Scene, after: Scene): void {
    this.journal.push({
      label,
      before: cloneJson(before),
      after: cloneJson(after),
    });
    this.snapshots.push(cloneJson(before));
  }

  undo(scene: Scene): Scene {
    const prev = this.snapshots.pop();
    return prev ? cloneJson(prev) : scene;
  }

  undoHunk(needle: string, scene: Scene): Scene {
    const key = needle.toLowerCase();
    for (let i = this.journal.length - 1; i >= 0; i--) {
      if (this.journal[i].label.toLowerCase().includes(key)) {
        const entry = this.journal.splice(i, 1)[0];
        return cloneJson(entry.before);
      }
    }
    return scene;
  }
}
