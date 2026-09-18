import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import woodAudioUrl from "./assets/wood.mp3";

export function useAudioController() {
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
      const a = new Audio(woodAudioUrl);
      a.volume = 0.7;
      a.playbackRate = pitch;
      if ("preservesPitch" in a) {
        a.preservesPitch = false;
      }
      return a;
    });

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

        window.addEventListener("pointerdown", unlock, { passive: true });
        window.addEventListener("mousedown", unlock, { passive: true });
        window.addEventListener("mousemove", unlock, { passive: true });
        window.addEventListener("keydown", unlock, { passive: true });
        window.addEventListener("touchstart", unlock, { passive: true });

        // Force initial unlock attempt
        unlock();

        try {
          const res = await fetch(woodAudioUrl);
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
  }, []);

  const resumeAudio = useCallback(() => {
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, []);

  const playChimeSound = useCallback((chimeIndex = 2, intensity = 0.7, panX = 0) => {
    if (isMutedRef.current) return;

    // Soothing Zen Pentatonic Musical Tuning Ratios (C4, D4, E4, G4, A4)
    const pitches = [0.841, 0.944, 1.0, 1.189, 1.335];
    const targetPitch = pitches[chimeIndex] || 1.0;
    const clampedIntensity = Math.min(Math.max(intensity, 0.2), 1.0);
    const volumeGain = 0.15 + clampedIntensity * 0.45;

    // Tier 1: High-Fidelity Web Audio API with Lowpass Filter, Exponential Envelope & Stereo Panning
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
          source.playbackRate.value = targetPitch;

          // Warm Acoustic Lowpass Filter (cuts harsh digital high frequencies for soothing tone)
          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(2400 + chimeIndex * 250, now);
          filter.Q.setValueAtTime(0.7, now);

          // Smooth Gain Envelope (Gentle 12ms attack & smooth exponential decay)
          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0.001, now);
          gainNode.gain.exponentialRampToValueAtTime(volumeGain, now + 0.012);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

          // Spatial Stereo Panner (-0.4 left chimes to +0.4 right chimes)
          let panner = null;
          if (typeof ctx.createStereoPanner === "function") {
            panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(Math.min(Math.max(panX * 0.5, -0.7), 0.7), now);
          }

          source.connect(filter);
          filter.connect(gainNode);
          if (panner) {
            gainNode.connect(panner);
            panner.connect(ctx.destination);
          } else {
            gainNode.connect(ctx.destination);
          }

          source.start(now);
          return;
        } catch (e) {
          console.warn("Buffer play error:", e);
        }
      }
    }

    // Tier 2: HTML5 Audio Pool Fallback
    try {
      const poolAudio = audioPoolRef.current[chimeIndex] || audioPoolRef.current[2];
      if (poolAudio) {
        poolAudio.currentTime = 0;
        poolAudio.volume = Math.min(volumeGain, 1.0);
        const playPromise = poolAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            const singleAudio = new Audio(woodAudioUrl);
            singleAudio.volume = Math.min(volumeGain, 1.0);
            singleAudio.playbackRate = targetPitch;
            singleAudio.play().catch(() => {});
          });
        }
        return;
      }
    } catch (e) {
      console.warn("HTML5 audio pool error:", e);
    }

    // Tier 3: Soothing Synthesized Organic Wooden Bar Tone
    if (ctx) {
      try {
        const now = ctx.currentTime;
        // Soothing Zen Pentatonic frequencies (C4, D4, E4, G4, A4)
        const freqs = [261.63, 293.66, 329.63, 392.00, 440.00];
        const fundamentalFreq = freqs[chimeIndex] || 329.63;

        // Fundamental tone oscillator
        const oscFundamental = ctx.createOscillator();
        oscFundamental.type = "sine";
        oscFundamental.frequency.setValueAtTime(fundamentalFreq, now);

        // Acoustic wood overtone oscillator (2.76x fundamental frequency)
        const oscOvertone = ctx.createOscillator();
        oscOvertone.type = "triangle";
        oscOvertone.frequency.setValueAtTime(fundamentalFreq * 2.76, now);

        // Warm Lowpass Filter
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1800, now);

        // Master Gain Envelope
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.001, now);
        masterGain.gain.exponentialRampToValueAtTime(volumeGain * 0.5, now + 0.008);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

        // Overtone Gain (decays quickly for natural wood block resonance)
        const overtoneGain = ctx.createGain();
        overtoneGain.gain.setValueAtTime(volumeGain * 0.15, now);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        oscFundamental.connect(masterGain);
        oscOvertone.connect(overtoneGain);
        overtoneGain.connect(masterGain);
        masterGain.connect(filter);
        filter.connect(ctx.destination);

        oscFundamental.start(now);
        oscOvertone.start(now);
        oscFundamental.stop(now + 1.4);
        oscOvertone.stop(now + 0.35);
      } catch (e) {
        console.warn("Synth play error:", e);
      }
    }
  }, []);

  return { playChimeSound, resumeAudio };
}
