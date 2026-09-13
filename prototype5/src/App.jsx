import { useEffect, useRef } from "react";
import Matter from "matter-js";
import ballBImg from "./assets/ballB.png";
import ballAImg from "./assets/ballA.png";
import rectangleAImg from "./assets/rectangleA.png";
import rectangleBImg from "./assets/rectangleB.png";
import rectangleCImg from "./assets/rectangleC.png";
import rectangleDImg from "./assets/rectangleD.png";
import rectangleEImg from "./assets/rectangleE.png";
import rectangleFImg from "./assets/rectangleF.png";
import { initWindCursor, setWindowDraggingState } from "./cursor.jsx";
import { initAudio, resumeAudio, handleChimeCollision } from "./Audio.jsx";

function App() {
  const sceneRef = useRef(null);

  useEffect(() => {
    initAudio();
  }, []);


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
        strokeStyle: "#cbd5e1", // Tailwind slate-300 (realistic woven thread color)
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    // 4. Heavy dynamic horizontal top beam (rectangleA) with rectangleA.png image texture (35% wider)
    const rectangleAWidth = 162 * SCALE;
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

    // 6. Create 6 vertically long rectangles (rectangleB, C, D, E, F, G) rendered with image textures from assets
    const chimeConfigs = [
      { name: "rectangleB", img: rectangleBImg, imgW: 150, imgH: 889,  height: 140 * SCALE, constraintLength: 90 * SCALE,  stiffness: 0.68, damping: 0.05, mass: 2.0 * SCALE, frictionAir: 0.018 },
      { name: "rectangleC", img: rectangleCImg, imgW: 143, imgH: 943,  height: 160 * SCALE, constraintLength: 105 * SCALE, stiffness: 0.64, damping: 0.06, mass: 2.6 * SCALE, frictionAir: 0.014 },
      { name: "rectangleD", img: rectangleDImg, imgW: 142, imgH: 1019, height: 180 * SCALE, constraintLength: 120 * SCALE, stiffness: 0.58, damping: 0.08, mass: 3.2 * SCALE, frictionAir: 0.011 },
      { name: "rectangleE", img: rectangleEImg, imgW: 140, imgH: 939,  height: 160 * SCALE, constraintLength: 100 * SCALE, stiffness: 0.62, damping: 0.06, mass: 2.4 * SCALE, frictionAir: 0.016 },
      { name: "rectangleF", img: rectangleFImg, imgW: 144, imgH: 884,  height: 140 * SCALE, constraintLength: 85 * SCALE,  stiffness: 0.70, damping: 0.04, mass: 1.8 * SCALE, frictionAir: 0.020 },
      { name: "rectangleG", img: rectangleFImg, imgW: 144, imgH: 884,  height: 130 * SCALE, constraintLength: 75 * SCALE,  stiffness: 0.72, damping: 0.04, mass: 1.6 * SCALE, frictionAir: 0.022 },
    ];

    const chimeWidth = 21.6 * SCALE;
    const chimeRectangles = [];
    const chimeConstraints = [];

    // Calculate equal horizontal spacing across rectangleA for all 5 chimes
    const spacingStep = rectangleAWidth / (chimeConfigs.length + 1);

    chimeConfigs.forEach((cfg, idx) => {
      const offsetX = (idx + 1) * spacingStep - (rectangleAWidth / 2);
      const chimeX = width / 2 + offsetX;
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
              texture: cfg.img,
              xScale: chimeWidth / cfg.imgW,
              yScale: cfg.height / cfg.imgH
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
        pointA: { x: offsetX, y: rectangleAHeight / 2 },
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

    // 7. Collision detection for playing chime audio on chime-to-chime impacts
    Matter.Events.on(engine, "collisionStart", handleChimeCollision);

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
      Matter.Events.off(engine, "collisionStart", handleChimeCollision);
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
      if (render.canvas) {
        render.canvas.remove();
      }
    };
  }, []);

  const handleTopMouseDown = (e) => {
    if (e.button === 0) {
      setWindowDraggingState(true);
      if (window.electronAPI) {
        window.electronAPI.startDrag({ x: e.screenX, y: e.screenY });
      }

      const onMouseMove = (moveEvent) => {
        if (window.electronAPI) {
          window.electronAPI.drag({ x: moveEvent.screenX, y: moveEvent.screenY });
        }
      };

      const onMouseUp = () => {
        setWindowDraggingState(false);
        if (window.electronAPI) {
          window.electronAPI.stopDrag();
        }
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
  };

  return (
    <div className="w-screen h-screen relative overflow-hidden flex justify-center items-center bg-transparent select-none">
      {/* ballB Window Drag Handle Target */}
      <div
        onMouseDown={handleTopMouseDown}
        style={{ WebkitAppRegion: "drag" }}
        className="drag-handle-ballB absolute top-[2.5px] left-1/2 -translate-x-1/2 w-10 h-10 rounded-full cursor-grab active:cursor-grabbing z-[99999] pointer-events-auto"
        title="Click & Drag top ball (ballB) to move Wind Chime widget"
      />
      <div
        ref={sceneRef}
        className="w-full h-full overflow-hidden mx-auto relative"
      />
    </div>
  );
}

export default App;
