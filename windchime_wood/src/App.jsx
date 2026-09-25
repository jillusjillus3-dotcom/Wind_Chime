import { useEffect, useRef } from "react";
import Matter from "matter-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import woodAudioUrl from "./assets/wood.mp3";
import ballBImg from "./assets/ballB.png";
import ballAImg from "./assets/ballA.png";
import rectangleAImg from "./assets/rectangleA.png";
import bambo1Img from "./assets/bambo1.png";
import bambo2Img from "./assets/bambo2.png";
import bambo3Img from "./assets/bambo3.png";
import bambo4Img from "./assets/bambo4.png";
import bambo5Img from "./assets/bambo5.png";
import { initWindCursor } from "./cursor.jsx";
import WidgetDragHandle from "./drag.jsx";

function App() {
  const sceneRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioBufferRef = useRef(null);
  const masterAudioNodeRef = useRef(null);
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
    // Initialize Web Audio API for zero-latency, overlapping wind chime acoustics
    const initAudio = async () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx({ latencyHint: "interactive" });
        audioCtxRef.current = ctx;

        // Master Dynamics Compressor + Master Volume Gain Boost (1.8x)
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -12; // dB threshold to prevent clipping
        compressor.knee.value = 10;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 1.8; // Boost master volume to 180%

        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);
        masterAudioNodeRef.current = compressor;

        // Silent Keep-Alive Oscillator (prevents audio hardware thread sleep)
        try {
          const keepAliveOsc = ctx.createOscillator();
          const keepAliveGain = ctx.createGain();
          keepAliveGain.gain.value = 0.000001;
          keepAliveOsc.connect(keepAliveGain);
          keepAliveGain.connect(ctx.destination);
          keepAliveOsc.start(0);
        } catch (e) {
          console.warn("Keep-alive oscillator error:", e);
        }

        const unlock = () => {
          if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
            audioCtxRef.current.resume().catch(() => {});
          }
        };

        window.addEventListener("pointermove", unlock, { passive: true });
        window.addEventListener("pointerdown", unlock, { passive: true });
        window.addEventListener("mousedown", unlock, { passive: true });
        window.addEventListener("mousemove", unlock, { passive: true });
        window.addEventListener("keydown", unlock, { passive: true });
        window.addEventListener("mouseenter", unlock, { passive: true });

        const response = await fetch(woodAudioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const decodedData = await ctx.decodeAudioData(arrayBuffer);
        audioBufferRef.current = decodedData;
      } catch (e) {
        console.warn("Audio Context init error:", e);
      }
    };
    initAudio();
  }, []);

  const resumeAudio = () => {
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  };

  /**
   * Zero-Latency Wind Chime Sound Engine via Web Audio API:
   * 1. Silent Keep-Alive Thread: AudioContext stays in 'running' state perpetually.
   * 2. Harmonic Pentatonic Scale Tuning: [0.75, 0.8889, 1.0, 1.125, 1.3333]
   * 3. Organic Micro-Detuning: +/- 1.2% variance per strike.
   * 4. Dynamic Gain & Exponential Decay Envelope: Instant attack on impact.
   */
  const playChimeSound = (chimeIndex = 2, impactEnergy = 0.6) => {
    if (isMutedRef.current) return;
    resumeAudio();

    const ctx = audioCtxRef.current;
    if (ctx && audioBufferRef.current) {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = audioBufferRef.current;

      // 1. Pentatonic Scale Ratios for Chimes (B, C, D, E, F)
      const pentatonicPitches = [0.75, 0.8889, 1.0, 1.125, 1.3333];
      const basePitch = pentatonicPitches[chimeIndex] || 1.0;

      // Organic micro-detuning (+/- 1.2% variation per strike)
      const microDetune = 1.0 + (Math.random() - 0.5) * 0.024;
      source.playbackRate.value = basePitch * microDetune;

      // 2. High Volume Gain Scaling (0.5 to 1.6 gain range per chime voice)
      const normEnergy = Math.min(Math.max(impactEnergy, 0.25), 1.0);
      const strikeVolume = 0.5 + normEnergy * 1.1;

      // 3. Instant Attack & Exponential Gain Decay Envelope
      const gainNode = ctx.createGain();
      const decayDuration = 0.9 + normEnergy * 1.3; // 0.9s to 2.2s decay
      gainNode.gain.setValueAtTime(strikeVolume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + decayDuration);

      // 4. Acoustic Wooden Filters:
      // a) Lowshelf filter: Boosts 280 Hz (+8 dB) for deep wooden body resonance
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 280;
      bassFilter.gain.value = 8;

      // b) Peaking Filter: Hollow wooden tube cavity resonance (850 Hz, Q=2.5, +5 dB)
      const tubeResonanceFilter = ctx.createBiquadFilter();
      tubeResonanceFilter.type = "peaking";
      tubeResonanceFilter.frequency.value = 850;
      tubeResonanceFilter.Q.value = 2.5;
      tubeResonanceFilter.gain.value = 5;

      // c) Lowpass Filter: Warm wooden cutoff above 1900 Hz
      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = "lowpass";
      trebleFilter.frequency.value = 1900;

      source.connect(bassFilter);
      bassFilter.connect(tubeResonanceFilter);
      tubeResonanceFilter.connect(trebleFilter);
      trebleFilter.connect(gainNode);

      // Route through Master Dynamics Compressor & Master Gain Boost
      const destinationNode = masterAudioNodeRef.current || ctx.destination;
      gainNode.connect(destinationNode);

      source.start(now);
      source.stop(now + decayDuration + 0.1);
    } else {
      const audio = new Audio(woodAudioUrl);
      audio.volume = 1.0;
      audio.play().catch(() => {});
    }
  };

  useEffect(() => {
    const width = window.innerWidth || 340;
    const height = window.innerHeight || 400;

    // 1. Create engine & renderer
    const engine = Matter.Engine.create();
    engine.gravity.y = 1; // Explicit gravity

    const render = Matter.Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: width,
        height: height,
        wireframes: false,
        background: "transparent"
      }
    });

    // 75% Global Scale Factor for Wind Chime Structure
    const SCALE = 0.75;

    // 2. Small static ball at top (ballB) with ballB.png image texture
    const ballBRadius = 6 * SCALE;
    const ballB = Matter.Bodies.circle(
      width / 2,
      30 * SCALE,
      ballBRadius,
      {
        label: "ballB",
        isStatic: true,
        collisionFilter: { group: -1 }, // Prevent physical collision overlap with ballA
        render: {
          sprite: {
            texture: ballBImg,
            xScale: (2 * ballBRadius) / 428,
            yScale: (2 * ballBRadius) / 401
          }
        }
      }
    );

    // 3. Dynamic ball below ballB (ballA) with ballA.png image texture
    const ballARadius = 10 * SCALE;
    const ballA = Matter.Bodies.circle(
      width / 2,
      60 * SCALE,
      ballARadius,
      {
        label: "ballA",
        isStatic: false,
        restitution: 0.5,
        friction: 0.1,
        frictionAir: 0.015,
        collisionFilter: { group: -1 }, // Prevent physical collision overlap with ballB
        render: {
          sprite: {
            texture: ballAImg,
            xScale: (2 * ballARadius) / 1920,
            yScale: (2 * ballARadius) / 1920
          }
        }
      }
    );
    Matter.Body.setMass(ballA, 3.0 * SCALE);

    // Fixed constraint connecting bottom edge of static ballB to top edge of dynamic ballA
    const constraintBallBToBallA = Matter.Constraint.create({
      bodyA: ballB,
      bodyB: ballA,
      pointA: { x: 0, y: ballBRadius }, // Connected to bottom edge of ballB
      pointB: { x: 0, y: -ballARadius }, // Connected to top edge of ballA
      length: (30 - 6 - 10) * SCALE,
      stiffness: 1, // Rigid constraint
      render: {
        visible: true,
        strokeStyle: "#000000",
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    // 4. Heavy dynamic horizontal top beam (rectangleA) with new rectangleA.png image texture (90x16 px)
    const rectangleAWidth = 120 * SCALE;
    const rectangleAHeight = 20 * SCALE;
    const rectangleAY = 130 * SCALE;
    const rectangleA = Matter.Bodies.rectangle(
      width / 2,
      rectangleAY,
      rectangleAWidth,
      rectangleAHeight,
      {
        label: "rectangleA",
        isStatic: false,
        restitution: 0.5,
        friction: 0.1,
        frictionAir: 0.015,
        render: {
          sprite: {
            texture: rectangleAImg,
            xScale: rectangleAWidth / 90,
            yScale: rectangleAHeight / 16
          }
        }
      }
    );
    Matter.Body.setMass(rectangleA, 5.5 * SCALE);

    // 5. Fixed dual constraints connecting bottom curvature of ballA to balanced inner points of rectangleA
    const attachAngle = Math.PI / 4; // 45 degrees along bottom arc
    const ballAAttachX = ballARadius * Math.cos(attachAngle);
    const ballAAttachY = ballARadius * Math.sin(attachAngle);

    const ballAY = 60 * SCALE;
    const rectAAttachX = rectangleAWidth * 0.28; // Balanced inner suspension points on top beam
    const stringLength = Math.hypot(
      rectAAttachX - ballAAttachX,
      (rectangleAY - rectangleAHeight / 2) - (ballAY + ballAAttachY)
    );

    const constraintLeft = Matter.Constraint.create({
      bodyA: ballA,
      bodyB: rectangleA,
      pointA: { x: -ballAAttachX, y: ballAAttachY }, // Connected to bottom-left edge of ballA
      pointB: { x: -rectAAttachX, y: -rectangleAHeight / 2 }, // Balanced inner anchor on top of rectangleA
      length: stringLength,
      stiffness: 1,
      render: {
        visible: true,
        strokeStyle: "#000000",
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    const constraintRight = Matter.Constraint.create({
      bodyA: ballA,
      bodyB: rectangleA,
      pointA: { x: ballAAttachX, y: ballAAttachY }, // Connected to bottom-right edge of ballA
      pointB: { x: rectAAttachX, y: -rectangleAHeight / 2 }, // Balanced inner anchor on top of rectangleA
      length: stringLength,
      stiffness: 1,
      render: {
        visible: true,
        strokeStyle: "#000000",
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    // 6. Create 5 vertically long rectangles (rectangleB, C, D, E, F) mapped to bambo1.png - bambo5.png
    const chimeConfigs = [
      { name: "rectangleB", offsetX: -40 * SCALE, height: 140 * SCALE, color: "#cbd5e1", constraintLength: 90 * SCALE,  stiffness: 0.68, damping: 0.05, mass: 2.0 * SCALE, frictionAir: 0.018, texture: bambo1Img, texW: 178, texH: 1479 },
      { name: "rectangleC", offsetX: -20 * SCALE, height: 160 * SCALE, color: "#cbd5e1", constraintLength: 105 * SCALE, stiffness: 0.64, damping: 0.06, mass: 2.6 * SCALE, frictionAir: 0.014, texture: bambo2Img, texW: 212, texH: 1492 },
      { name: "rectangleD", offsetX: 0,           height: 180 * SCALE, color: "#cbd5e1", constraintLength: 120 * SCALE, stiffness: 0.58, damping: 0.08, mass: 3.2 * SCALE, frictionAir: 0.011, texture: bambo3Img, texW: 181, texH: 1477 },
      { name: "rectangleE", offsetX: 20 * SCALE,  height: 160 * SCALE, color: "#cbd5e1", constraintLength: 100 * SCALE, stiffness: 0.62, damping: 0.06, mass: 2.4 * SCALE, frictionAir: 0.016, texture: bambo4Img, texW: 186, texH: 1479 },
      { name: "rectangleF", offsetX: 40 * SCALE,  height: 140 * SCALE, color: "#cbd5e1", constraintLength: 85 * SCALE,  stiffness: 0.70, damping: 0.04, mass: 1.8 * SCALE, frictionAir: 0.020, texture: bambo5Img, texW: 178, texH: 1477 },
    ];

    const chimeWidth = 16 * SCALE;
    const chimeRectangles = [];
    const chimeConstraints = [];

    chimeConfigs.forEach((cfg, idx) => {
      const chimeX = width / 2 + cfg.offsetX;
      const chimeY = rectangleAY + (rectangleAHeight / 2) + cfg.constraintLength + (cfg.height / 2);

      const chime = Matter.Bodies.rectangle(
        chimeX,
        chimeY,
        chimeWidth,
        cfg.height,
        {
          label: "chime",
          chimeIndex: idx,
          isStatic: false,
          restitution: 0.8,
          friction: 0.05,
          frictionAir: cfg.frictionAir,
          render: {
            sprite: {
              texture: cfg.texture,
              xScale: chimeWidth / cfg.texW,
              yScale: cfg.height / cfg.texH
            }
          }
        }
      );
      chime.chimeHeight = cfg.height;
      Matter.Body.setMass(chime, cfg.mass);
      chimeRectangles.push(chime);

      // Constraint connecting rectangleA to the top of this chime
      const c = Matter.Constraint.create({
        bodyA: rectangleA,
        bodyB: chime,
        pointA: { x: cfg.offsetX, y: rectangleAHeight / 2 },
        pointB: { x: 0, y: -cfg.height / 2 }, // Connected to top edge of rectangle
        length: cfg.constraintLength,
        stiffness: cfg.stiffness,
        damping: cfg.damping,
        render: {
          visible: true,
          strokeStyle: "#000000",
          lineWidth: 1.5,
          type: "line",
          anchors: false
        }
      });
      chimeConstraints.push(c);
    });

    // 7. Collision detection for playing wind chime audio with realistic impact velocity & cascading micro-rhythms
    const lastPlayedMap = new Map();

    const handleCollisionStart = (event) => {
      const now = Date.now();
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        let chimeBody = null;
        let otherBody = null;

        if (bodyA.label === "chime") {
          chimeBody = bodyA;
          otherBody = bodyB;
        } else if (bodyB.label === "chime") {
          chimeBody = bodyB;
          otherBody = bodyA;
        }

        if (chimeBody && otherBody) {
          const idx = chimeBody.chimeIndex ?? 2;
          const pairKey = `chime-${chimeBody.id}-${otherBody.id}`;

          const lastTime = lastPlayedMap.get(pairKey) || 0;
          if (now - lastTime > 60) {
            lastPlayedMap.set(pairKey, now);

            // Calculate impact energy from relative velocities of colliding bodies
            const relVx = bodyA.velocity.x - bodyB.velocity.x;
            const relVy = bodyA.velocity.y - bodyB.velocity.y;
            const relSpeed = Math.hypot(relVx, relVy);
            const impactEnergy = Math.min(Math.max(relSpeed / 3.5, 0.25), 1.0);

            playChimeSound(idx, impactEnergy);

            // Sympathetic secondary echo tap for strong wind gust impacts
            if (impactEnergy > 0.6) {
              const secondaryIdx = otherBody.chimeIndex ?? ((idx + 1) % 5);
              setTimeout(() => {
                playChimeSound(secondaryIdx, impactEnergy * 0.45);
              }, 70 + Math.random() * 50);
            }
          }
        }
      });
    };

    Matter.Events.on(engine, "collisionStart", handleCollisionStart);

    // 8. Clamp maximum body speeds to guarantee physical stability during touchpad gestures
    const dynamicBodies = [ballA, rectangleA, ...chimeRectangles];
    const clampBodySpeeds = () => {
      dynamicBodies.forEach((body) => {
        const maxSpeed = 10;
        if (body.speed > maxSpeed) {
          Matter.Body.setVelocity(body, {
            x: (body.velocity.x / body.speed) * maxSpeed,
            y: (body.velocity.y / body.speed) * maxSpeed
          });
        }
        if (Math.abs(body.angularVelocity) > 0.2) {
          Matter.Body.setAngularVelocity(body, Math.sign(body.angularVelocity) * 0.2);
        }
      });
    };
    Matter.Events.on(engine, "beforeUpdate", clampBodySpeeds);

    // 9. Initialize Wind Field Cursor Controller
    const cleanupWindCursor = initWindCursor({
      engine,
      render,
      windBodies: dynamicBodies,
      onUnlockAudio: resumeAudio
    });

    // 10. Add all bodies and constraints to world
    Matter.Composite.add(engine.world, [
      ballB,
      ballA,
      constraintBallBToBallA,
      rectangleA,
      constraintLeft,
      constraintRight,
      ...chimeRectangles,
      ...chimeConstraints
    ]);

    // 11. Run renderer and runner with fixed 60 FPS timestep
    Matter.Render.run(render);
    const runner = Matter.Runner.create({
      isFixed: true,
      delta: 1000 / 60
    });
    Matter.Runner.run(runner, engine);

    // Clean up on unmount
    return () => {
      cleanupWindCursor();
      Matter.Events.off(engine, "beforeUpdate", clampBodySpeeds);
      Matter.Events.off(engine, "collisionStart", handleCollisionStart);
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
      if (render.canvas) {
        render.canvas.remove();
      }
    };
  }, []);

  return (
    <div className="w-screen h-screen relative overflow-hidden flex justify-center items-center bg-transparent select-none">
      <WidgetDragHandle />
      <div
        ref={sceneRef}
        className="w-full h-full overflow-hidden mx-auto relative"
      />
    </div>
  );
}

export default App;
