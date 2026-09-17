import { useEffect, useRef } from "react";
import Matter from "matter-js";
import ballBImg from "./assets/ballB.png";
import ballAImg from "./assets/ballA.png";
import rectangleAImg from "./assets/rectangleA.png";
import shellFlatDiscImg from "./assets/shell_flat_disc.png";
import shellCapsuleImg from "./assets/shell_capsule.png";
import shellSpiralImg from "./assets/shell_spiral.png";
import shellTeardropImg from "./assets/shell_teardrop.png";
import shellCircleImg from "./assets/shell_circle.png";
import { initWindCursor } from "./cursor.jsx";

export default function MatterScene({ playChimeSound, resumeAudio }) {
  const sceneRef = useRef(null);

  useEffect(() => {
    const width = window.innerWidth || 340;
    const height = window.innerHeight || 400;

    // 1. Create engine & renderer
    const engine = Matter.Engine.create();
    engine.gravity.y = 1;

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

    const SCALE = 0.75;

    // 2. Small static ball at top (ballB)
    const ballBRadius = 6 * SCALE;
    const ballB = Matter.Bodies.circle(
      width / 2,
      25 * SCALE,
      ballBRadius,
      {
        label: "ballB",
        isStatic: true,
        collisionFilter: { group: -1 },
        render: {
          sprite: {
            texture: ballBImg,
            xScale: (2 * ballBRadius) / 428,
            yScale: (2 * ballBRadius) / 401
          }
        }
      }
    );

    // 3. Dynamic ball below ballB (ballA)
    const ballARadius = 10 * SCALE;
    const ballA = Matter.Bodies.circle(
      width / 2,
      50 * SCALE,
      ballARadius,
      {
        label: "ballA",
        isStatic: false,
        restitution: 0.5,
        friction: 0.1,
        frictionAir: 0.015,
        collisionFilter: { group: -1 },
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

    const constraintBallBToBallA = Matter.Constraint.create({
      bodyA: ballB,
      bodyB: ballA,
      pointA: { x: 0, y: ballBRadius },
      pointB: { x: 0, y: -ballARadius },
      length: (25 - 6 - 10) * SCALE,
      stiffness: 1,
      render: {
        visible: true,
        strokeStyle: "#cbd5e1",
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    // 4. Heavy dynamic horizontal top beam (rectangleA)
    const rectangleAWidth = 260 * SCALE;
    const rectangleAHeight = 16 * SCALE;
    const rectangleAY = 95 * SCALE;
    const rectangleA = Matter.Bodies.rectangle(
      width / 2,
      rectangleAY,
      rectangleAWidth,
      rectangleAHeight,
      {
        label: "rectangleA",
        isStatic: false,
        restitution: 0.4,
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
    Matter.Body.setMass(rectangleA, 6.0 * SCALE);

    const attachAngle = Math.PI / 4;
    const ballAAttachX = ballARadius * Math.cos(attachAngle);
    const ballAAttachY = ballARadius * Math.sin(attachAngle);

    const ballAY = 50 * SCALE;
    const rectAAttachX = rectangleAWidth * 0.28;
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
        strokeStyle: "#cbd5e1",
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
        strokeStyle: "#cbd5e1",
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    // 5 Columns of Shell Strings: [5, 6, 7, 6, 5]
    // Recalculated X offsets based on max shell width (30 * SCALE) + resting gap (22 * SCALE) = colSpacing (52 * SCALE)
    const colSpacing = 52 * SCALE;
    const columnsConfig = [
      {
        colName: "shellA",
        offsetX: -2 * colSpacing,
        shells: ["capsule", "flat_disc", "capsule", "capsule", "circle"]
      },
      {
        colName: "shellB",
        offsetX: -1 * colSpacing,
        shells: ["capsule", "teardrop", "capsule", "capsule", "spiral", "capsule"]
      },
      {
        colName: "shellC",
        offsetX: 0,
        shells: ["circle", "capsule", "capsule", "flat_disc", "capsule", "spiral", "capsule"]
      },
      {
        colName: "shellD",
        offsetX: 1 * colSpacing,
        shells: ["capsule", "capsule", "teardrop", "capsule", "capsule", "circle"]
      },
      {
        colName: "shellE",
        offsetX: 2 * colSpacing,
        shells: ["capsule", "capsule", "capsule", "flat_disc", "circle"]
      }
    ];

    const allShellBodies = [];
    const allStringConstraints = [];

    // Helper factory to build single convex shell bodies with 150% larger hitboxes and matched sprite scaling
    const createShellBody = (shapeType, x, y, chimeIdx, shellName) => {
      const commonProps = {
        label: shellName,
        name: shellName,
        chimeIndex: chimeIdx,
        isStatic: false,
        restitution: 0.9,
        friction: 0.05,
        frictionAir: 0.012
      };

      let body = null;

      if (shapeType === "circle") {
        // Small Shell (Circle) - image W=1278, H=1230 (+35% larger collider)
        const radius = 16.2 * SCALE;
        const diam = radius * 2;
        body = Matter.Bodies.circle(x, y, radius, {
          ...commonProps,
          render: {
            sprite: {
              texture: shellCircleImg,
              xScale: diam / 1278,
              yScale: diam / 1230
            }
          }
        });
      } else if (shapeType === "spiral") {
        // Conch Shell (Compound Spiral) - image W=1107, H=1421 (+35% larger collider)
        const w = 32.4 * SCALE;
        const h = 48.6 * SCALE;
        body = Matter.Bodies.rectangle(x, y, w, h, {
          ...commonProps,
          chamfer: { radius: 8.1 * SCALE },
          render: {
            sprite: {
              texture: shellSpiralImg,
              xScale: w / 1107,
              yScale: h / 1421
            }
          }
        });
      } else if (shapeType === "teardrop") {
        // Long Shell (Thin Pointed Cone) - image W=1024, H=1536 (+35% larger collider)
        const w = 24.3 * SCALE;
        const h = 60.75 * SCALE;
        body = Matter.Bodies.rectangle(x, y, w, h, {
          ...commonProps,
          chamfer: { radius: 6.75 * SCALE },
          render: {
            sprite: {
              texture: shellTeardropImg,
              xScale: w / 1024,
              yScale: h / 1536
            }
          }
        });
      } else if (shapeType === "flat_disc") {
        // Scallop Shell (Flat Disc Fan) - image W=1303, H=1207 (+35% larger collider)
        const w = 40.5 * SCALE;
        const h = 36.45 * SCALE;
        body = Matter.Bodies.rectangle(x, y, w, h, {
          ...commonProps,
          chamfer: { radius: 9.45 * SCALE },
          render: {
            sprite: {
              texture: shellFlatDiscImg,
              xScale: w / 1303,
              yScale: h / 1207
            }
          }
        });
      } else {
        // Clam Shell (Capsule / Oval) - image W=1239, H=1270 (+35% larger collider)
        const w = 32.4 * SCALE;
        const h = 44.55 * SCALE;
        body = Matter.Bodies.rectangle(x, y, w, h, {
          ...commonProps,
          chamfer: { radius: 13.5 * SCALE },
          render: {
            sprite: {
              texture: shellCapsuleImg,
              xScale: w / 1239,
              yScale: h / 1270
            }
          }
        });
      }

      body.shapeType = shapeType;
      Matter.Body.setMass(body, 1.8 * SCALE);

      // Calculate exact Y bounds relative to body position for 100% precise constraint attachment
      let minY = Infinity;
      let maxY = -Infinity;
      body.vertices.forEach((v) => {
        const localY = v.y - body.position.y;
        if (localY < minY) minY = localY;
        if (localY > maxY) maxY = localY;
      });

      body.topOffset = minY;
      body.bottomOffset = maxY;

      return body;
    };

    columnsConfig.forEach((col, colIdx) => {
      let prevBody = rectangleA;
      let prevAttachPoint = { x: col.offsetX, y: rectangleAHeight / 2 };
      let prevY = rectangleAY;
      
      // Calculate stringLen so the longest column (7 shells) fits inside the window height with a safe bottom margin
      const maxColShells = 7;
      // Approx sum of heights of 7 shells in Col C (~295.65 * SCALE)
      const approxColCHeight = 295.65 * SCALE;
      const beamBottomY = rectangleAY + rectangleAHeight / 2;
      const targetMaxY = height - 40 * SCALE; // Safe bottom margin for swing clearance
      const availableStringGap = Math.max(10, targetMaxY - beamBottomY - approxColCHeight);
      const stringLen = Math.max(2 * SCALE, availableStringGap / maxColShells);

      col.shells.forEach((shapeType, sIdx) => {
        const shellName = `${col.colName}${sIdx + 1}`;
        const shellX = width / 2 + col.offsetX;
        const chimeIdx = (colIdx + sIdx) % 5;

        // Top 5 constraints connecting shell 1 to rectangleA keep full stringLen; inter-shell constraints are reduced by 50%
        const currentStringLen = sIdx === 0 ? stringLen : stringLen * 0.5;

        // Create shell at initial Y=0 to inspect exact vertex bounds
        const shell = createShellBody(shapeType, shellX, 0, chimeIdx, shellName);

        // Position shell so its top vertex sits exactly currentStringLen below prevBody's bottom attachment point
        const prevBottomY = prevBody === rectangleA ? (rectangleAY + rectangleAHeight / 2) : (prevY + prevBody.bottomOffset);
        const targetTopY = prevBottomY + currentStringLen;
        const shellY = targetTopY - shell.topOffset;

        Matter.Body.setPosition(shell, { x: shellX, y: shellY });

        const stringConstraint = Matter.Constraint.create({
          label: `constraint_${shellName}`,
          bodyA: prevBody,
          bodyB: shell,
          pointA: prevAttachPoint,
          pointB: { x: 0, y: shell.topOffset },
          length: currentStringLen,
          stiffness: 0.75,
          damping: 0.05,
          render: {
            visible: true,
            strokeStyle: "#d97706",
            lineWidth: 1.5,
            type: "line",
            anchors: false
          }
        });

        allShellBodies.push(shell);
        allStringConstraints.push(stringConstraint);

        prevBody = shell;
        prevAttachPoint = { x: 0, y: shell.bottomOffset };
        prevY = shellY;
      });
    });

    // 6. Collision detection for audio playback
    const lastPlayedMap = new Map();

    const isShellBody = (body) => body && body.label && (body.label.startsWith("shell") || body.label === "chime");

    const handleCollisionStart = (event) => {
      const now = Date.now();
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        let chimeBody = null;
        let otherBody = null;

        if (isShellBody(bodyA)) {
          chimeBody = bodyA;
          otherBody = bodyB;
        } else if (isShellBody(bodyB)) {
          chimeBody = bodyB;
          otherBody = bodyA;
        }

        if (chimeBody && otherBody) {
          const idx = chimeBody.chimeIndex ?? 2;
          const pairKey = `chime-${chimeBody.id}-${otherBody.id}`;

          const lastTime = lastPlayedMap.get(pairKey) || 0;
          if (now - lastTime > 60) {
            lastPlayedMap.set(pairKey, now);
            if (playChimeSound) {
              playChimeSound(idx);
            }
          }
        }
      });
    };

    Matter.Events.on(engine, "collisionStart", handleCollisionStart);

    // 7. Speed clamping for physics stability
    const dynamicBodies = [ballA, rectangleA, ...allShellBodies];
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

    // 8. Initialize Wind Cursor
    const cleanupWindCursor = initWindCursor({
      engine,
      render,
      windBodies: dynamicBodies,
      onUnlockAudio: resumeAudio
    });

    // 9. Add all bodies & constraints to world
    Matter.Composite.add(engine.world, [
      ballB,
      ballA,
      constraintBallBToBallA,
      rectangleA,
      constraintLeft,
      constraintRight,
      ...allShellBodies,
      ...allStringConstraints
    ]);

    // 10. Run renderer & runner
    Matter.Render.run(render);
    const runner = Matter.Runner.create({
      isFixed: true,
      delta: 1000 / 60
    });
    Matter.Runner.run(runner, engine);

    // Cleanup on unmount
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
  }, [playChimeSound, resumeAudio]);

  return (
    <div
      ref={sceneRef}
      className="w-full h-full overflow-hidden mx-auto relative"
    />
  );
}
