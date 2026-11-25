// Short UI sounds (REQUISITOS section 7). Files and licence: public/sounds/LICENSES.md.
export type SoundName = "assigned" | "mention" | "done" | "error";

// Moderate by default. The files are normalized to the same loudness (see LICENSES.md),
// so this one number sets how loud all of them are.
const VOLUME = 0.6;

// The browser only allows audio after the person has interacted with the page; until
// then play() is rejected and we simply stay silent.
export function playSound(name: SoundName, enabled: boolean) {
  if (!enabled) return;
  const audio = new Audio(`/sounds/${name}.wav`);
  audio.volume = VOLUME;
  // play() returns a promise in current browsers, but older ones return nothing and it can also throw.
  try {
    void Promise.resolve(audio.play()).catch(() => {});
  } catch {
    // no audio support: stay silent
  }
}
