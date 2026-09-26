import { useEffect, useRef } from "react";
import Matter from "matter-js";
import basicBallBImg from "./assets/basic_ballB.png";
import basicBallAImg from "./assets/basic_ballA.png";
import basicRectAImg from "./assets/basic_rectangleA.png";

import woodBallBImg from "./assets/wood_ballB.png";
import woodBallAImg from "./assets/wood_ballA.png";
import woodRectAImg from "./assets/wood_rectangleA.png";

import bambo1Img from "./assets/bambo1.png";
import bambo2Img from "./assets/bambo2.png";
import bambo3Img from "./assets/bambo3.png";
import bambo4Img from "./assets/bambo4.png";
import bambo5Img from "./assets/bambo5.png";
import { initWindCursor } from "./cursor.jsx";

export default function MatterScene({ skin = "basic", playChimeSound, resumeAudio }) {
  const sceneRef = useRef(null);

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

    // 2. Small static ball at top (ballB)
    const ballBRadius = 6 * SCALE;
    const isWood = skin === "wood";

    const ballB = Matter.Bodies.circle(
      width / 2,
      30 * SCALE,
      ballBRadius,
      {
        label: "ballB",
        isStatic: true,
        collisionFilter: { group: -1 },
        render: {
          sprite: {
            texture: isWood ? woodBallBImg : basicBallBImg,
            xScale: isWood ? (2 * ballBRadius) / 10 : (2 * ballBRadius) / 428,
            yScale: isWood ? (2 * ballBRadius) / 9 : (2 * ballBRadius) / 401
          }
        }
      }
    );

    // 3. Dynamic ball below ballB (ballA)
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
        collisionFilter: { group: -1 },
        render: {
          sprite: {
            texture: isWood ? woodBallAImg : basicBallAImg,
            xScale: isWood ? (2 * ballARadius) / 15 : (2 * ballARadius) / 1920,
            yScale: isWood ? (2 * ballARadius) / 15 : (2 * ballARadius) / 1920
          }
        }
      }
    );
    Matter.Body.setMass(ballA, 3.0 * SCALE);

    // Fixed constraint connecting ballB to ballA
    const constraintBallBToBallA = Matter.Constraint.create({
      bodyA: ballB,
      bodyB: ballA,
      pointA: { x: 0, y: ballBRadius - (isWood ? 1 : 0) },
      pointB: { x: 0, y: -ballARadius + (isWood ? 1 : 0) },
      length: (30 - 6 - 10) * SCALE + (isWood ? 2 : 0),
      stiffness: 1,
      render: {
        visible: true,
        strokeStyle: "#000000",
        lineWidth: 1.5,
        type: "line",
        anchors: false
      }
    });

    // 4. Heavy dynamic horizontal top beam (rectangleA)
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
            texture: isWood ? woodRectAImg : basicRectAImg,
            xScale: isWood ? rectangleAWidth / 90 : rectangleAWidth / 670,
            yScale: isWood ? rectangleAHeight / 16 : rectangleAHeight / 164
          }
        }
      }
    );
    Matter.Body.setMass(rectangleA, 5.5 * SCALE);

    // 5. Dual suspension constraints connecting ballA to rectangleA
    const attachAngle = Math.PI / 4;
    const ballAAttachX = ballARadius * Math.cos(attachAngle);
    const ballAAttachY = ballARadius * Math.sin(attachAngle);

    const ballAY = 60 * SCALE;
    const rectAAttachX = rectangleAWidth * 0.28;
    const stringLength = Math.hypot(
      rectAAttachX - ballAAttachX,
      (rectangleAY - rectangleAHeight / 2) - (ballAY + ballAAttachY)
    ) + (isWood ? 3.5 : 0);

    const constraintLeft = Matter.Constraint.create({
      bodyA: ballA,
      bodyB: rectangleA,
      pointA: { x: -ballAAttachX, y: ballAAttachY - (isWood ? 1 : 0) },
      pointB: { x: -rectAAttachX, y: (-rectangleAHeight / 2) + (isWood ? 2.5 : 0) },
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
      pointA: { x: ballAAttachX, y: ballAAttachY - (isWood ? 1 : 0) },
      pointB: { x: rectAAttachX, y: (-rectangleAHeight / 2) + (isWood ? 2.5 : 0) },
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

    // 6. Create 5 chime bodies (rectangleB - F)
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

      const renderOpt = isWood
        ? {
            sprite: {
              texture: cfg.texture,
              xScale: chimeWidth / cfg.texW,
              yScale: cfg.height / cfg.texH
            }
          }
        : { fillStyle: cfg.color };

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
          render: renderOpt
        }
      );
      chime.chimeHeight = cfg.height;
      Matter.Body.setMass(chime, cfg.mass);
      chimeRectangles.push(chime);

      let anchorYOnRectA = rectangleAHeight / 2;
      let effectiveLength = cfg.constraintLength;

      if (isWood) {
        if (cfg.name === "rectangleD") {
          anchorYOnRectA = (rectangleAHeight / 2) - 2;
          effectiveLength = cfg.constraintLength - 2;
        } else if (cfg.name === "rectangleB") {
          anchorYOnRectA = (rectangleAHeight / 2) - 0.8;
          effectiveLength = cfg.constraintLength + 0.8;
        }
      }

      const c = Matter.Constraint.create({
        bodyA: rectangleA,
        bodyB: chime,
        pointA: { x: cfg.offsetX, y: anchorYOnRectA },
        pointB: { x: 0, y: -cfg.height / 2 },
        length: effectiveLength,
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

    // Custom 3D Metallic Render callback for Basic Skin
    const onRenderAluminumChimes = () => {
      if (skin !== "basic") return;
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

    if (skin === "basic") {
      Matter.Events.on(render, "afterRender", onRenderAluminumChimes);
    }

    // 7. Collision handling
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

            const relVelX = (bodyA.velocity?.x || 0) - (bodyB.velocity?.x || 0);
            const relVelY = (bodyA.velocity?.y || 0) - (bodyB.velocity?.y || 0);
            const impactSpeed = Math.hypot(relVelX, relVelY);
            const intensity = Math.min(Math.max(impactSpeed / 3.5, 0.2), 1.0);

            const posX = chimeBody.position ? chimeBody.position.x : (width / 2);
            const normalizedX = (posX - (width / 2)) / (width / 2);

            if (playChimeSound) {
              playChimeSound(idx, intensity, normalizedX);
            }
          }
        }
      });
    };

    Matter.Events.on(engine, "collisionStart", handleCollisionStart);

    // 8. Speed clamping
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

    // 9. Wind Cursor
    const cleanupWindCursor = initWindCursor({
      engine,
      render,
      windBodies: dynamicBodies,
      onUnlockAudio: resumeAudio
    });

    // 10. Composite add
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

    // 11. Run physics & renderer
    Matter.Render.run(render);
    const runner = Matter.Runner.create({
      isFixed: true,
      delta: 1000 / 60
    });
    Matter.Runner.run(runner, engine);

    return () => {
      cleanupWindCursor();
      Matter.Events.off(engine, "beforeUpdate", clampBodySpeeds);
      Matter.Events.off(engine, "collisionStart", handleCollisionStart);
      if (skin === "basic") {
        Matter.Events.off(render, "afterRender", onRenderAluminumChimes);
      }
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
      if (render.canvas) {
        render.canvas.remove();
      }
    };
  }, [skin, playChimeSound, resumeAudio]);

  return (
    <div
      ref={sceneRef}
      className="w-full h-full overflow-hidden mx-auto relative"
    />
  );
}
