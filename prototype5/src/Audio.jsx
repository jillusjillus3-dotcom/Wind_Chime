import note1 from "./assets/god-father_1.mp3";
import note2 from "./assets/god-father_2.mp3";
import note3 from "./assets/god-father_3.mp3";
import note4 from "./assets/god-father_4.mp3";
import note5 from "./assets/god-father_5.mp3";
import note6 from "./assets/god-father_6.mp3";
import note7 from "./assets/god-father_7.mp3";
import note8 from "./assets/god-father_8.mp3";
import note9 from "./assets/god-father_9.mp3";
import note10 from "./assets/god-father_10.mp3";
import note11 from "./assets/god-father_11.mp3";
import note12 from "./assets/god-father_12.mp3";

const noteUrls = [
  note1, note2, note3, note4, note5, note6,
  note7, note8, note9, note10, note11, note12
];

let audioCtx = null;
let audioBuffers = [];
let currentNoteIndex = 0;
let lastCollisionTime = 0;

/**
 * Initializes Web Audio API Context and pre-decodes the 12 Godfather melody MP3 files.
 */
export async function initAudio() {
  try {
    if (audioCtx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();

    // Pre-fetch and decode all 12 note files in parallel for instant playback
    audioBuffers = await Promise.all(
      noteUrls.map(async (url) => {
        try {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          return await audioCtx.decodeAudioData(arrayBuffer);
        } catch (err) {
          console.warn("Failed to decode audio file:", url, err);
          return null;
        }
      })
    );
  } catch (e) {
    console.warn("Audio Context init error:", e);
  }
}

/**
 * Resumes suspended AudioContext upon user interaction.
 */
export function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

/**
 * Plays the next sequential Godfather note (1 to 12) with a smooth Web Audio gain fade-out envelope.
 * Eliminates end-of-buffer micro-clicks, pops, or minute beeps.
 */
export function playNextSequentialNote() {
  resumeAudio();

  const noteIdx = currentNoteIndex;
  const currentBuffer = audioBuffers[noteIdx];

  if (audioCtx && currentBuffer) {
    const source = audioCtx.createBufferSource();
    source.buffer = currentBuffer;

    const gainNode = audioCtx.createGain();
    const targetVolume = 0.8;
    const duration = currentBuffer.duration;
    const fadeOutDuration = Math.min(0.12, duration * 0.3); // 120ms smooth fade-out (or up to 30% of note length)
    const now = audioCtx.currentTime;

    // 1. De-click attack: 5ms soft exponential fade-in
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(targetVolume, now + 0.005);

    // 2. Sustain target volume until fade-out threshold
    const fadeStartTime = Math.max(now + 0.005, now + duration - fadeOutDuration);
    gainNode.gain.setValueAtTime(targetVolume, fadeStartTime);

    // 3. Smooth fade-out envelope to 0.0001 right at the end of the note duration
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(now);

    // Disconnect audio nodes when buffer playback completes
    source.onended = () => {
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch (e) {}
    };
  } else if (noteUrls[noteIdx]) {
    const audio = new Audio(noteUrls[noteIdx]);
    audio.volume = 0.8;
    audio.play().catch(() => {});
  }

  // Advance collision counter (1st -> 2nd -> ... -> 12th -> 1st)
  currentNoteIndex = (currentNoteIndex + 1) % 12;
}

// Backward compatibility alias for playNextSequentialNote
export const playChimeSound = playNextSequentialNote;

/**
 * Handles collision events between chime bodies and triggers the 12-step sequential note player.
 * @param {object} event - Matter.js collision event object
 */
export function handleChimeCollision(event) {
  const now = Date.now();
  event.pairs.forEach((pair) => {
    const { bodyA, bodyB } = pair;
    const isChimeA = bodyA.label === "chime";
    const isChimeB = bodyB.label === "chime";

    if (isChimeA && isChimeB) {
      // 75ms rate limit per collision pair to keep notes distinct and musical
      if (now - lastCollisionTime > 75) {
        lastCollisionTime = now;
        playNextSequentialNote();
      }
    }
  });
}
