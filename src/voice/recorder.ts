const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
];

export function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

export function filenameForMime(mime: string): string {
  if (mime.includes("ogg")) return "utterance.ogg";
  if (mime.includes("mp4")) return "utterance.mp4";
  return "utterance.webm";
}

export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startedAt = 0;
  private mime = "";

  async start(): Promise<"ok" | "no-mic" | "no-mime"> {
    const mime = pickMime();
    if (!mime) return "no-mime";
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return "no-mic";
    }
    this.chunks = [];
    this.mime = mime;
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.startedAt = Date.now();
    this.recorder.start();
    return "ok";
  }

  async stop(): Promise<{ blob: Blob; mime: string; durationMs: number }> {
    const recorder = this.recorder;
    const mime = this.mime;
    const durationMs = Date.now() - this.startedAt;
    const blob = await new Promise<Blob>((resolve) => {
      if (!recorder || recorder.state === "inactive") {
        resolve(new Blob(this.chunks, { type: mime || "audio/webm" }));
        return;
      }
      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: mime || "audio/webm" }));
      };
      recorder.stop();
    });
    this.cleanup();
    return { blob, mime, durationMs };
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}
