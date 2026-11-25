import { afterEach, describe, expect, it, vi } from "vitest";
import { playSound } from "@/lib/sounds";

const play = vi.fn().mockResolvedValue(undefined);
class FakeAudio {
  volume = 1;
  constructor(public src: string) {
    instances.push(this);
  }
  play = play;
}
const instances: FakeAudio[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  play.mockClear();
  instances.length = 0;
});

describe("playSound", () => {
  it("plays the right file at a moderate volume", () => {
    vi.stubGlobal("Audio", FakeAudio);
    playSound("mention", true);
    expect(instances[0]?.src).toBe("/sounds/mention.wav");
    expect(instances[0]?.volume).toBeGreaterThan(0);
    expect(instances[0]?.volume).toBeLessThan(1);
    expect(play).toHaveBeenCalledOnce();
  });

  it("stays silent when sounds are muted", () => {
    vi.stubGlobal("Audio", FakeAudio);
    playSound("error", false);
    expect(play).not.toHaveBeenCalled();
  });

  it("does not throw when play() returns nothing or throws (older browsers)", () => {
    vi.stubGlobal("Audio", FakeAudio);
    play.mockReturnValueOnce(undefined);
    expect(() => playSound("done", true)).not.toThrow();
    play.mockImplementationOnce(() => {
      throw new Error("not supported");
    });
    expect(() => playSound("done", true)).not.toThrow();
  });

  it("does not throw when the browser blocks autoplay", async () => {
    vi.stubGlobal("Audio", FakeAudio);
    play.mockRejectedValueOnce(new Error("NotAllowedError"));
    expect(() => playSound("done", true)).not.toThrow();
    await Promise.resolve();
  });
});
