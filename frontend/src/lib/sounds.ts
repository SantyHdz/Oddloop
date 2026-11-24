// Short UI sounds (REQUISITOS section 7). Files and licence: public/sounds/LICENSES.md.
export type SoundName = "assigned" | "mention" | "done" | "error";

const VOLUME = 0.4; // low by default

// The browser only allows audio after the person has interacted with the page; until
// then play() is rejected and we simply stay silent.
export function playSound(name: SoundName, enabled: boolean) {
  if (!enabled) return;
  const audio = new Audio(`/sounds/${name}.wav`);
  audio.volume = VOLUME;
  void audio.play().catch(() => {});
}
