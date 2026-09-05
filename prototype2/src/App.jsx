import { useEffect, useRef } from "react";
import Matter from "matter-js";
import chimeAudioUrl from "./assets/chime.mp3";

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
    const width = window.innerWidth;
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

    // 2. Small static blue ball at top (ballB)
    const ballB = Matter.Bodies.circle(
      width / 2,
      30,
      6, // Smaller radius than ballA
      {
        isStatic: true,
        collisionFilter: { group: -1 }, // Prevent physical collision overlap with ballA
        render: { fillStyle: "#38bdf8" } // Bright sky blue
      }
    );

    // 3. Dynamic blue ball below ballB (ballA) - configured to match rectangleA physics
    const ballA = Matter.Bodies.circle(
      width / 2,
      60,
      10, // Larger radius than ballB
      {
        isStatic: false,
        restitution: 0.5,
        density: 5.0, // Heavy mass/density matching rectangleA
        friction: 0.1,
        frictionAir: 0.015, // Air resistance damping to eliminate wobbling/vibration
        collisionFilter: { group: -1 }, // Prevent physical collision overlap with ballB
        render: { fillStyle: "#38bdf8" } // Bright sky blue
      }
    );

    // Fixed constraint connecting static ballB to dynamic ballA
    const constraintBallBToBallA = Matter.Constraint.create({
      bodyA: ballB,
      bodyB: ballA,
      length: 30,
      stiffness: 1, // Rigid constraint
      render: {
        visible: true,
        strokeStyle: "#ffffff",
        lineWidth: 2
      }
    });

    // 4. Heavy dynamic horizontal top beam (rectangleA)
    const rectangleAWidth = 120;
    const rectangleAHeight = 20;
    const rectangleAY = 130;
    const rectangleA = Matter.Bodies.rectangle(
      width / 2,
      rectangleAY,
      rectangleAWidth,
      rectangleAHeight,
      {
        isStatic: false,
        restitution: 0.5,
        density: 5.0, // Heavy mass/density
        friction: 0.1,
        frictionAir: 0.015,
        render: { fillStyle: "#f43f5e" }
      }
    );

    // 5. Fixed dual constraints connecting ballA to the top-left and top-right corners of rectangleA
    const stringLength = Math.hypot(rectangleAWidth / 2, rectangleAY - rectangleAHeight / 2 - 60);

    const constraintLeft = Matter.Constraint.create({
      bodyA: ballA,
      bodyB: rectangleA,
      pointA: { x: 0, y: 0 },
      pointB: { x: -rectangleAWidth / 2, y: -rectangleAHeight / 2 },
      length: stringLength,
      stiffness: 1,
      render: {
        visible: true,
        strokeStyle: "#ffffff",
        lineWidth: 3
      }
    });

    const constraintRight = Matter.Constraint.create({
      bodyA: ballA,
      bodyB: rectangleA,
      pointA: { x: 0, y: 0 },
      pointB: { x: rectangleAWidth / 2, y: -rectangleAHeight / 2 },
      length: stringLength,
      stiffness: 1,
      render: {
        visible: true,
        strokeStyle: "#ffffff",
        lineWidth: 3
      }
    });

    // 6. Create 5 vertically long rectangles (rectangleB, C, D, E, F) with fixed constraints
    const chimeConfigs = [
      { name: "rectangleB", offsetX: -40, height: 140, color: "#38bdf8", constraintLength: 84, mass: 2.0, frictionAir: 0.018 },
      { name: "rectangleC", offsetX: -20, height: 160, color: "#818cf8", constraintLength: 72, mass: 2.6, frictionAir: 0.014 },
      { name: "rectangleD", offsetX: 0,   height: 180, color: "#c084fc", constraintLength: 68, mass: 3.2, frictionAir: 0.011 },
      { name: "rectangleE", offsetX: 20,  height: 160, color: "#f472b6", constraintLength: 80, mass: 2.4, frictionAir: 0.016 },
      { name: "rectangleF", offsetX: 40,  height: 140, color: "#fb7185", constraintLength: 96, mass: 1.8, frictionAir: 0.020 },
    ];

    const chimeWidth = 16;
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
      Matter.Body.setMass(chime, cfg.mass);
      chimeRectangles.push(chime);

      // Fixed constraint connecting rectangleA to this chime
      const c = Matter.Constraint.create({
        bodyA: rectangleA,
        bodyB: chime,
        pointA: { x: cfg.offsetX, y: rectangleAHeight / 2 },
        pointB: { x: 0, y: -cfg.height / 2 },
        length: cfg.constraintLength,
        stiffness: 1, // Fixed rigid string
        render: {
          visible: true,
          strokeStyle: "#e2e8f0",
          lineWidth: 2
        }
      });
      chimeConstraints.push(c);
    });

    // 7. Physics Cursor Ball (hidden by default until mouse enters screen)
    const cursorBall = Matter.Bodies.circle(
      -1000,
      -1000,
      12,
      {
        label: "cursorBall",
        isStatic: true,
        friction: 0,
        render: {
          visible: false, // Initially hidden
          fillStyle: "#fbbf24", // Bright golden yellow
          strokeStyle: "#ffffff", // White border
          lineWidth: 2
        }
      }
    );

    // 8. Collision detection for playing chime audio
    const lastPlayedMap = new Map();

    const handleCollisionStart = (event) => {
      const now = Date.now();
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const isChimeA = bodyA.label === "chime";
        const isChimeB = bodyB.label === "chime";
        const isCursorA = bodyA.label === "cursorBall";
        const isCursorB = bodyB.label === "cursorBall";

        if ((isChimeA && isCursorB) || (isChimeB && isCursorA) || (isChimeA && isChimeB)) {
          const chimeBody = isChimeA ? bodyA : bodyB;
          const idx = chimeBody.chimeIndex ?? 2;

          // Rate limit per body (60ms) to allow clear, distinct notes
          const lastTime = lastPlayedMap.get(chimeBody.id) || 0;
          if (now - lastTime > 60) {
            lastPlayedMap.set(chimeBody.id, now);
            playChimeSound(idx);
          }
        }
      });
    };

    Matter.Events.on(engine, "collisionStart", handleCollisionStart);

    // 9. Track pointer state & position — unlock audio as cursor transforms into cursorBall
    const mousePos = { x: -1000, y: -1000 };
    let isPointerOnScreen = false;

    const handlePointerMove = (event) => {
      if (!isPointerOnScreen) {
        isPointerOnScreen = true;
      }
      mousePos.x = event.clientX;
      mousePos.y = event.clientY;
      // Unlock Audio Context when cursor enters screen and becomes cursorBall
      resumeAudio();
    };

    const handleMouseLeave = () => {
      isPointerOnScreen = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerenter", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    // 10. Update cursorBall position and visibility before each physics step
    const onBeforeUpdate = () => {
      if (isPointerOnScreen) {
        cursorBall.render.visible = true;
        Matter.Body.setPosition(cursorBall, { x: mousePos.x, y: mousePos.y });
      } else {
        cursorBall.render.visible = false;
        Matter.Body.setPosition(cursorBall, { x: -1000, y: -1000 });
      }
    };
    Matter.Events.on(engine, "beforeUpdate", onBeforeUpdate);

    // 11. Add all bodies and constraints to world
    Matter.Composite.add(engine.world, [
      ballB,
      ballA,
      constraintBallBToBallA,
      rectangleA,
      constraintLeft,
      constraintRight,
      ...chimeRectangles,
      ...chimeConstraints,
      cursorBall
    ]);


    // 12. Run renderer and runner
    Matter.Render.run(render);
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    // Clean up on unmount
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerenter", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      Matter.Events.off(engine, "collisionStart", handleCollisionStart);
      Matter.Events.off(engine, "beforeUpdate", onBeforeUpdate);
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
    <div
      ref={sceneRef}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        cursor: "none"
      }}
    />
  );
}

export default App;