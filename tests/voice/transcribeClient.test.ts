import { describe, expect, it } from "vitest";
import { filenameForMime } from "../../src/voice/recorder";
import {
  NO_SPEECH_SKIP,
  shouldSkipIntentFromStt,
  transcribeAudio,
} from "../../src/voice/transcribeClient";
import { afterEach, vi } from "vitest";

describe("filenameForMime", () => {
  it("maps mime to a Groq-safe extension", () => {
    expect(filenameForMime("audio/webm;codecs=opus")).toBe("utterance.webm");
    expect(filenameForMime("audio/webm")).toBe("utterance.webm");
    expect(filenameForMime("audio/ogg")).toBe("utterance.ogg");
    expect(filenameForMime("audio/mp4")).toBe("utterance.mp4");
  });
});

describe("transcribeAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fetch when the Groq key is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await transcribeAudio(new Blob(["x"]), "  ", "audio/webm");
    expect(result).toEqual({ ok: false, error: "missing_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a named file, never a raw blob", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: "align left", no_speech_prob: 0.01 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await transcribeAudio(
      new Blob(["x"], { type: "audio/webm" }),
      "gsk_test",
      "audio/webm;codecs=opus",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    const file = form.get("file") as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("utterance.webm");
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("en");
    expect(form.get("response_format")).toBe("verbose_json");
  });

  it("retries 429 at most twice (3 attempts) and honors Retry-After 0", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "0" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ "Retry-After": "0" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ text: "ok", segments: [{ no_speech_prob: 0.1 }] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const result = await transcribeAudio(new Blob(["x"]), "gsk_test", "audio/ogg");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect((form.get("file") as File).name).toBe("utterance.ogg");
    expect(result).toEqual({ ok: true, text: "ok", noSpeechProb: 0.1 });
  });

  it("reads top-level no_speech_prob and empty text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: "   ", no_speech_prob: 0.91 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await transcribeAudio(new Blob(["x"]), "gsk_test", "audio/webm");
    expect(result).toEqual({ ok: true, text: "", noSpeechProb: 0.91 });
  });

  it("takes the max no_speech_prob across segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: "align left",
        segments: [{ no_speech_prob: 0.1 }, { no_speech_prob: 0.72 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await transcribeAudio(new Blob(["x"]), "gsk_test", "audio/webm");
    expect(result).toEqual({
      ok: true,
      text: "align left",
      noSpeechProb: 0.72,
    });
  });

  it("does not retry a 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await transcribeAudio(new Blob(["x"]), "gsk_test", "audio/mp4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1].body as FormData).get("file")).toMatchObject(
      { name: "utterance.mp4" },
    );
    expect(result).toEqual({ ok: false, error: "http" });
  });
});

describe("shouldSkipIntentFromStt", () => {
  it("skips empty text and the 0.6 no-speech floor", () => {
    expect(shouldSkipIntentFromStt("", 0)).toBe(true);
    expect(shouldSkipIntentFromStt("align left", NO_SPEECH_SKIP)).toBe(true);
    expect(shouldSkipIntentFromStt("align left", 0.59)).toBe(false);
    expect(shouldSkipIntentFromStt("align left", 0)).toBe(false);
  });
});
