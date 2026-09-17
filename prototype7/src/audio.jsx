import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import chimeAudioUrl from "./assets/chime.mp3";

export default function useChimeAudio() {
  const audioCtxRef = useRef(null);
  const audioBufferRef = useRef(null);
  const audioPoolRef = useRef([]);
  const isMutedRef = useRef(false);

  useEffect(() => {
    // Fetch initial audio mute state from backend
    invoke("is_audio_muted")
      .then((muted) => {
        isMutedRef.current = Boolean(muted);
      })
      .catch((err) => console.error("Error fetching audio mute state:", err));

    // Listen for audio mute state changes emitted from system tray
    const unlistenPromise = listen("audio-mute-changed", (event) => {
      isMutedRef.current = Boolean(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    // Pre-create HTML5 audio elements pool for zero-latency audio fallback
    audioPoolRef.current = [0.85, 0.95, 1.0, 1.1, 1.22].map((pitch) => {
      const a = new Audio(chimeAudioUrl);
      a.volume = 0.7;
      a.playbackRate = pitch;
      if ("preservesPitch" in a) {
        a.preservesPitch = false;
      }
      return a;
    });

    let unlockListeners = [];

    const initAudio = async () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx({ latencyHint: "interactive" });
        audioCtxRef.current = ctx;

        const unlock = () => {
          if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
            audioCtxRef.current.resume().catch(() => {});
          }
          audioPoolRef.current.forEach((a) => {
            a.play()
              .then(() => {
                a.pause();
                a.currentTime = 0;
              })
              .catch(() => {});
          });
        };

        const events = ["pointerdown", "mousedown", "mousemove", "keydown", "touchstart"];
        events.forEach((evt) => {
          window.addEventListener(evt, unlock, { passive: true });
        });
        unlockListeners = events.map((evt) => ({ evt, unlock }));

        // Force initial unlock attempt
        unlock();

        try {
          const res = await fetch(chimeAudioUrl);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            ctx.decodeAudioData(
              buf,
              (decoded) => {
                audioBufferRef.current = decoded;
              },
              (err) => {
                console.warn("Decode audio error:", err);
              }
            );
          }
        } catch (e) {
          console.warn("Fetch audio error:", e);
        }
      } catch (e) {
        console.warn("Audio Context init error:", e);
      }
    };

    initAudio();

    return () => {
      unlockListeners.forEach(({ evt, unlock }) => {
        window.removeEventListener(evt, unlock);
      });
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const resumeAudio = () => {
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  };

  const playChimeSound = (chimeIndex = 2) => {
    if (isMutedRef.current) return;

    // Tier 1: Web Audio API decoded buffer playback
    const ctx = audioCtxRef.current;
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      if (audioBufferRef.current) {
        try {
          const now = ctx.currentTime;
          const source = ctx.createBufferSource();
          source.buffer = audioBufferRef.current;

          const pitches = [0.85, 0.95, 1.0, 1.1, 1.22];
          source.playbackRate.value = pitches[chimeIndex] || 1.0;

          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0.7, now);

          source.connect(gainNode);
          gainNode.connect(ctx.destination);
          source.start(now);
          return;
        } catch (e) {
          console.warn("Buffer play error:", e);
        }
      }
    }

    // Tier 2: HTML5 Audio Pool fallback
    try {
      const poolAudio = audioPoolRef.current[chimeIndex] || audioPoolRef.current[2];
      if (poolAudio) {
        poolAudio.currentTime = 0;
        const playPromise = poolAudio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              return;
            })
            .catch(() => {
              // Create single-shot fallback element
              const singleAudio = new Audio(chimeAudioUrl);
              singleAudio.volume = 0.7;
              singleAudio.playbackRate = [0.85, 0.95, 1.0, 1.1, 1.22][chimeIndex] || 1.0;
              singleAudio.play().catch(() => {});
            });
        }
      }
    } catch (e) {
      console.warn("HTML5 audio pool error:", e);
    }

    // Tier 3: Synthesized Metallic Chime Fallback
    if (ctx) {
      try {
        const now = ctx.currentTime;
        const freqs = [523.25, 587.33, 659.25, 783.99, 880.00];
        const freq = freqs[chimeIndex] || 659.25;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + 1.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 1.2);
      } catch (e) {
        console.warn("Synth play error:", e);
      }
    }
  };

  return { playChimeSound, resumeAudio, isMutedRef };
}
