import { useEffect, useRef } from "react";
import Matter from "matter-js";
import { attach } from "tauri-plugin-wallpaper";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import chimeAudioUrl from "./assets/chime.mp3";
import ballBImg from "./assets/ballB.png";
import ballAImg from "./assets/ballA.png";
import rectangleAImg from "./assets/rectangleA.png";
import { initWindCursor } from "./cursor.jsx";
import WidgetDragHandle from "./drag.jsx";

function App() {
  const sceneRef = useRef(null);
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
    // Native WorkerW parenting & subclassing handled by Rust backend
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
        strokeStyle: "#000000", // Black constraint thread color
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    // 4. Heavy dynamic horizontal top beam (rectangleA) with rectangleA.png image texture
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
            xScale: rectangleAWidth / 670,
            yScale: rectangleAHeight / 164
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
      pointA: { x: -ballAAttachX, y: ballAAttachY },
      pointB: { x: -rectAAttachX, y: -rectangleAHeight / 2 },
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
      pointA: { x: ballAAttachX, y: ballAAttachY },
      pointB: { x: rectAAttachX, y: -rectangleAHeight / 2 },
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

    // 6. Create 5 vertically long rectangles (rectangleB, C, D, E, F) with aluminum metal finish (75% scaled)
    const chimeConfigs = [
      { name: "rectangleB", offsetX: -40 * SCALE, height: 140 * SCALE, color: "#cbd5e1", constraintLength: 90 * SCALE,  stiffness: 0.68, damping: 0.05, mass: 2.0 * SCALE, frictionAir: 0.018 },
      { name: "rectangleC", offsetX: -20 * SCALE, height: 160 * SCALE, color: "#cbd5e1", constraintLength: 105 * SCALE, stiffness: 0.64, damping: 0.06, mass: 2.6 * SCALE, frictionAir: 0.014 },
      { name: "rectangleD", offsetX: 0,           height: 180 * SCALE, color: "#cbd5e1", constraintLength: 120 * SCALE, stiffness: 0.58, damping: 0.08, mass: 3.2 * SCALE, frictionAir: 0.011 },
      { name: "rectangleE", offsetX: 20 * SCALE,  height: 160 * SCALE, color: "#cbd5e1", constraintLength: 100 * SCALE, stiffness: 0.62, damping: 0.06, mass: 2.4 * SCALE, frictionAir: 0.016 },
      { name: "rectangleF", offsetX: 40 * SCALE,  height: 140 * SCALE, color: "#cbd5e1", constraintLength: 85 * SCALE,  stiffness: 0.70, damping: 0.04, mass: 1.8 * SCALE, frictionAir: 0.020 },
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
          render: { fillStyle: cfg.color }
        }
      );
      chime.chimeHeight = cfg.height;
      Matter.Body.setMass(chime, cfg.mass);
      chimeRectangles.push(chime);

      const c = Matter.Constraint.create({
        bodyA: rectangleA,
        bodyB: chime,
        pointA: { x: cfg.offsetX, y: rectangleAHeight / 2 },
        pointB: { x: 0, y: -cfg.height / 2 },
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

    // Render Real 3D Aluminum Metal finish on rectangleB, C, D, E, F using metallic palette
    const onRenderAluminumChimes = () => {
      if (!render || !render.context) return;
      const ctx = render.context;

      chimeRectangles.forEach((chime) => {
        ctx.save();
        ctx.translate(chime.position.x, chime.position.y);
        ctx.rotate(chime.angle);

        const w = chimeWidth;
        const h = chime.chimeHeight || (140 * SCALE);

        const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        grad.addColorStop(0.00, "#475569");
        grad.addColorStop(0.18, "#94a3b8");
        grad.addColorStop(0.40, "#ffffff");
        grad.addColorStop(0.70, "#cbd5e1");
        grad.addColorStop(1.00, "#334155");

        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(-w / 2, -h / 2, w, h, 2);
        } else {
          ctx.rect(-w / 2, -h / 2, w, h);
        }
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
      });
    };

    Matter.Events.on(render, "afterRender", onRenderAluminumChimes);

    // 7. Collision detection for playing chime audio on any chime impact
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
            playChimeSound(idx);
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
      Matter.Events.off(render, "afterRender", onRenderAluminumChimes);
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
