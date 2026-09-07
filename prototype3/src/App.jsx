import { useEffect, useRef } from "react";
import Matter from "matter-js";
import chimeAudioUrl from "./assets/chime.mp3";
import ballBImg from "./assets/ballB.png";
import ballAImg from "./assets/ballA.png";
import rectangleAImg from "./assets/rectangleA.png";
import { initWindCursor } from "./cursor.jsx";

function App() {
  const sceneRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioBufferRef = useRef(null);

  useEffect(() => {
    // Initialize Web Audio API for fast, overlapping chime sounds
    const initAudio = async () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const response = await fetch(chimeAudioUrl);
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

  const playChimeSound = (chimeIndex = 2) => {
    resumeAudio();

    if (audioCtxRef.current && audioBufferRef.current) {
      const source = audioCtxRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;

      // Unique pitch for each chime tube (B: 0.85, C: 0.95, D: 1.0, E: 1.1, F: 1.22)
      const pitches = [0.85, 0.95, 1.0, 1.1, 1.22];
      source.playbackRate.value = pitches[chimeIndex] || 1.0;

      const gainNode = audioCtxRef.current.createGain();
      gainNode.gain.value = 0.7;

      source.connect(gainNode);
      gainNode.connect(audioCtxRef.current.destination);
      source.start(0);
    } else {
      const audio = new Audio(chimeAudioUrl);
      audio.volume = 0.7;
      audio.play().catch(() => {});
    }
  };

  useEffect(() => {
    const width = 840;
    const height = window.innerHeight;

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
        background: "#111827"
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
        strokeStyle: "#cbd5e1", // Tailwind slate-300 (realistic woven thread color)
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
      pointA: { x: -ballAAttachX, y: ballAAttachY }, // Connected to bottom-left edge of ballA (unchanged)
      pointB: { x: -rectAAttachX, y: -rectangleAHeight / 2 }, // Balanced inner anchor on top of rectangleA
      length: stringLength,
      stiffness: 1,
      render: {
        visible: true,
        strokeStyle: "#cbd5e1", // Tailwind slate-300 (realistic woven thread color)
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    const constraintRight = Matter.Constraint.create({
      bodyA: ballA,
      bodyB: rectangleA,
      pointA: { x: ballAAttachX, y: ballAAttachY }, // Connected to bottom-right edge of ballA (unchanged)
      pointB: { x: rectAAttachX, y: -rectangleAHeight / 2 }, // Balanced inner anchor on top of rectangleA
      length: stringLength,
      stiffness: 1,
      render: {
        visible: true,
        strokeStyle: "#cbd5e1", // Tailwind slate-300 (realistic woven thread color)
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
          strokeStyle: "#cbd5e1", // Tailwind slate-300 (realistic woven thread color)
          lineWidth: 1.5,
          type: "line",
          anchors: false
        }
      });
      chimeConstraints.push(c);
    });

    // Render Real 3D Aluminum Metal finish on rectangleB, C, D, E, F using Tailwind CSS metallic palette
    const onRenderAluminumChimes = () => {
      if (!render || !render.context) return;
      const ctx = render.context;

      chimeRectangles.forEach((chime) => {
        ctx.save();
        ctx.translate(chime.position.x, chime.position.y);
        ctx.rotate(chime.angle);

        const w = chimeWidth;
        const h = chime.chimeHeight || (140 * SCALE);

        // Linear gradient across tube width using Tailwind CSS metallic slate palette:
        // slate-600 (#475569) -> slate-400 (#94a3b8) -> white (#ffffff) -> slate-300 (#cbd5e1) -> slate-700 (#334155)
        const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        grad.addColorStop(0.00, "#475569"); // Tailwind slate-600 (left shadow)
        grad.addColorStop(0.18, "#94a3b8"); // Tailwind slate-400 (outer sheen)
        grad.addColorStop(0.40, "#ffffff"); // Tailwind white (specular highlight)
        grad.addColorStop(0.70, "#cbd5e1"); // Tailwind slate-300 (brushed aluminum midtone)
        grad.addColorStop(1.00, "#334155"); // Tailwind slate-700 (right shadow)

        // Draw metallic aluminum tube body
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(-w / 2, -h / 2, w, h, 2);
        } else {
          ctx.rect(-w / 2, -h / 2, w, h);
        }
        ctx.fillStyle = grad;
        ctx.fill();

        // Subtle metallic edge highlight
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
      });
    };

    Matter.Events.on(render, "afterRender", onRenderAluminumChimes);

    // 7. Collision detection for playing chime audio on chime-to-chime impacts
    const lastPlayedMap = new Map();

    const handleCollisionStart = (event) => {
      const now = Date.now();
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const isChimeA = bodyA.label === "chime";
        const isChimeB = bodyB.label === "chime";

        if (isChimeA && isChimeB) {
          const idx = bodyA.chimeIndex ?? bodyB.chimeIndex ?? 2;

          // Rate limit per body pair (60ms) to allow clear, distinct notes
          const lastTime = lastPlayedMap.get(bodyA.id) || 0;
          if (now - lastTime > 60) {
            lastPlayedMap.set(bodyA.id, now);
            playChimeSound(idx);
          }
        }
      });
    };

    Matter.Events.on(engine, "collisionStart", handleCollisionStart);

    // 8. Initialize Wind Field Cursor Controller (creates invisible airflow around cursor for all connected bodies)
    const cleanupWindCursor = initWindCursor({
      engine,
      render,
      windBodies: [ballA, rectangleA, ...chimeRectangles],
      onUnlockAudio: resumeAudio
    });

    // 9. Add all bodies and constraints to world
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

    // 10. Run renderer and runner
    Matter.Render.run(render);
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    // Clean up on unmount
    return () => {
      cleanupWindCursor();
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
    <div className="w-screen h-screen relative overflow-hidden flex justify-center items-center bg-[radial-gradient(circle_at_50%_30%,#0d0f17_0%,#050608_100%)] select-none">
      <div
        ref={sceneRef}
        className="w-[840px] max-w-full h-screen overflow-hidden mx-auto relative shadow-[0_0_40px_rgba(0,0,0,0.6)] border-x border-white/5 !cursor-none"
      />
    </div>
  );
}

export default App;
