import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import chimeAudioUrl from "./assets/chime.mp3";
import woodAudioUrl from "./assets/wood.mp3";

export function useAudioController(skin = "basic") {
  const audioCtxRef = useRef(null);
  const chimeBufferRef = useRef(null);
  const woodBufferRef = useRef(null);
  const masterGainRef = useRef(null);
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
    audioPoolRef.current = [0.841, 0.944, 1.0, 1.189, 1.335].map((pitch) => {
      const a = new Audio(chimeAudioUrl);
      a.volume = 0.8;
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

        // Master Dynamics Compressor for distortion-free, crystal-clear acoustics
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 1.3; // Clean 130% master volume

        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);
        masterGainRef.current = compressor;

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

        unlock();

        // Load Basic Metallic Audio Buffer
        try {
          const res = await fetch(chimeAudioUrl);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            ctx.decodeAudioData(
              buf,
              (decoded) => {
                chimeBufferRef.current = decoded;
              },
              (err) => console.warn("Decode chime audio error:", err)
            );
          }
        } catch (e) {
          console.warn("Fetch chime audio error:", e);
        }

        // Load Wood Acoustic Audio Buffer
        try {
          const res = await fetch(woodAudioUrl);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            ctx.decodeAudioData(
              buf,
              (decoded) => {
                woodBufferRef.current = decoded;
              },
              (err) => console.warn("Decode wood audio error:", err)
            );
          }
        } catch (e) {
          console.warn("Fetch wood audio error:", e);
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

  /**
   * Pristine Single Chime Voice
   */
  const triggerSingleVoice = useCallback(
    (chimeIndex, intensity, panX, isEcho = false) => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const destinationNode = masterGainRef.current || ctx.destination;
      const now = ctx.currentTime;

      if (skin === "wood") {
        // --- WOOD (BAMBOO) ACOUSTIC ENGINE ---
        if (woodBufferRef.current) {
          try {
            const source = ctx.createBufferSource();
            source.buffer = woodBufferRef.current;

            const pentatonicPitches = [0.75, 0.8889, 1.0, 1.125, 1.3333];
            const basePitch = pentatonicPitches[chimeIndex] || 1.0;
            const microDetune = 1.0 + (Math.random() - 0.5) * 0.015;
            source.playbackRate.value = basePitch * microDetune;

            const normEnergy = Math.min(Math.max(intensity, 0.25), 1.0);
            const strikeVolume = (0.5 + normEnergy * 0.9) * (isEcho ? 0.4 : 1.0);

            const gainNode = ctx.createGain();
            const decayDuration = 0.9 + normEnergy * 1.2;
            gainNode.gain.setValueAtTime(strikeVolume, now);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + decayDuration);

            const bassFilter = ctx.createBiquadFilter();
            bassFilter.type = "lowshelf";
            bassFilter.frequency.value = 280;
            bassFilter.gain.value = 8;

            const tubeResonanceFilter = ctx.createBiquadFilter();
            tubeResonanceFilter.type = "peaking";
            tubeResonanceFilter.frequency.value = 850;
            tubeResonanceFilter.Q.value = 2.5;
            tubeResonanceFilter.gain.value = 5;

            const trebleFilter = ctx.createBiquadFilter();
            trebleFilter.type = "lowpass";
            trebleFilter.frequency.value = 1900;

            source.connect(bassFilter);
            bassFilter.connect(tubeResonanceFilter);
            tubeResonanceFilter.connect(trebleFilter);
            trebleFilter.connect(gainNode);
            gainNode.connect(destinationNode);

            source.start(now);
            source.stop(now + decayDuration + 0.1);
            return;
          } catch (e) {
            console.warn("Wood buffer play error:", e);
          }
        }
        const audio = new Audio(woodAudioUrl);
        audio.volume = 1.0;
        audio.play().catch(() => {});
      } else {
        // --- BASIC (PURE ZEN METALLIC CHIME) ENGINE ---
        if (chimeBufferRef.current) {
          try {
            // Soothing Zen Pentatonic Musical Ratios (C4, D4, E4, G4, A4)
            const pitches = [0.841, 0.944, 1.0, 1.189, 1.335];
            const targetPitch = pitches[chimeIndex] || 1.0;
            const clampedIntensity = Math.min(Math.max(intensity, 0.2), 1.0);

            // Clean, clear gain scaling without distortion
            const volumeGain = (0.35 + clampedIntensity * 0.65) * (isEcho ? 0.4 : 1.0);

            const source = ctx.createBufferSource();
            source.buffer = chimeBufferRef.current;
            source.playbackRate.value = targetPitch;

            // Warm Acoustic Lowpass Filter (eliminates digital harshness for soothing bell tone)
            const filter = ctx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(2800 + chimeIndex * 250, now);
            filter.Q.setValueAtTime(0.7, now);

            // Gentle Attack & Smooth Exponential Decay Envelope
            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(0.001, now);
            gainNode.gain.exponentialRampToValueAtTime(volumeGain, now + 0.012);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

            // Stereo Spatial Panner (-0.5 left chimes to +0.5 right chimes)
            let panner = null;
            if (typeof ctx.createStereoPanner === "function") {
              panner = ctx.createStereoPanner();
              panner.pan.setValueAtTime(Math.min(Math.max(panX * 0.5, -0.6), 0.6), now);
            }

            source.connect(filter);
            filter.connect(gainNode);
            if (panner) {
              gainNode.connect(panner);
              panner.connect(destinationNode);
            } else {
              gainNode.connect(destinationNode);
            }

            source.start(now);
            source.stop(now + 2.5);
            return;
          } catch (e) {
            console.warn("Chime buffer play error:", e);
          }
        }
        const audio = new Audio(chimeAudioUrl);
        audio.volume = 0.8;
        audio.play().catch(() => {});
      }
    },
    [skin]
  );

  const playChimeSound = useCallback(
    (chimeIndex = 2, intensity = 0.7, panX = 0) => {
      if (isMutedRef.current) return;
      resumeAudio();

      // 1. Direct Primary Chime Strike
      triggerSingleVoice(chimeIndex, intensity, panX, false);

      // 2. Soft Secondary Micro-Rhythmic Echo Tap for realistic chime resonance
      if (intensity > 0.45) {
        const adjacentIndex = (chimeIndex + (Math.random() > 0.5 ? 1 : -1) + 5) % 5;
        setTimeout(() => {
          triggerSingleVoice(adjacentIndex, intensity * 0.35, panX, true);
        }, 90 + Math.random() * 30);
      }
    },
    [resumeAudio, triggerSingleVoice]
  );

  return { playChimeSound, resumeAudio };
}
