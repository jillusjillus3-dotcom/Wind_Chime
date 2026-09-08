import Matter from "matter-js";

/**
 * Wind Field Cursor Controller for Matter.js
 * 
 * Includes ballA, rectangleA, and rectangleB-F in the wind-force simulation.
 * 
 * Specifications:
 * 1. Invisible wind source (No physical collision body).
 * 2. Per-frame velocity calculation: dx, dy, dt.
 * 3. 220px Wind Radius with distance falloff:
 *    - 0 – 70 px   = 100% (1.0)
 *    - 70 – 140 px = 60%  (0.60)
 *    - 140 – 220 px = 25% (0.25)
 *    - > 220 px    = 0%   (0.0)
 * 4. Speed-multiplied and clamped forces for strong swipe gusts.
 * 5. Gust persistence: Each gust remains active for 120–180 ms with smooth fade-out.
 * 6. 8% random gust variation (±8% noise).
 * 7. Force attachment point at `y = -10` (10px above center) for natural tilting.
 * 8. Visual wind zone rings matching 70px, 140px, and 220px radii.
 */
let isWindowDragging = false;

export function setWindowDraggingState(isDragging) {
  isWindowDragging = isDragging;
}

export function initWindCursor({ engine, render, windBodies = [], chimeRectangles = [], onUnlockAudio }) {
  const mousePos = { x: -1000, y: -1000 };
  const prevMousePos = { x: -1000, y: -1000 };
  let lastTime = performance.now();
  let velocity = { x: 0, y: 0 };
  let isPointerOnScreen = false;

  // Combine wind-responsive bodies (ballA, rectangleA, rectangleB, C, D, E, F)
  const targetBodies = windBodies.length > 0 ? windBodies : chimeRectangles;

  // Active gusts per body id: { body, startTime, duration, forceX, forceY }
  const activeGusts = new Map();

  const handlePointerMove = (event) => {
    if (isWindowDragging || (event.target && event.target.closest && event.target.closest('.cursor-grab'))) {
      isPointerOnScreen = false;
      mousePos.x = -1000;
      mousePos.y = -1000;
      prevMousePos.x = -1000;
      prevMousePos.y = -1000;
      velocity.x = 0;
      velocity.y = 0;
      return;
    }

    if (!isPointerOnScreen) {
      isPointerOnScreen = true;
    }

    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    lastTime = now;

    let targetX = event.clientX;
    let targetY = event.clientY;

    if (render && render.canvas) {
      const rect = render.canvas.getBoundingClientRect();
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;
    }

    if (prevMousePos.x === -1000) {
      prevMousePos.x = targetX;
      prevMousePos.y = targetY;
    } else {
      prevMousePos.x = mousePos.x;
      prevMousePos.y = mousePos.y;
    }

    mousePos.x = targetX;
    mousePos.y = targetY;

    const dx = mousePos.x - prevMousePos.x;
    const dy = mousePos.y - prevMousePos.y;

    // Normalize per-frame velocity based on time delta (in ms)
    const instVx = (dx / dt) * 16.67;
    const instVy = (dy / dt) * 16.67;

    // Exponential moving average smoothing
    velocity.x = velocity.x * 0.4 + instVx * 0.6;
    velocity.y = velocity.y * 0.4 + instVy * 0.6;

    if (onUnlockAudio) {
      onUnlockAudio();
    }

    triggerGusts(now);
  };

  const handleMouseLeave = () => {
    isPointerOnScreen = false;
    mousePos.x = -1000;
    mousePos.y = -1000;
    velocity.x = 0;
    velocity.y = 0;
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerenter", handlePointerMove);
  window.addEventListener("pointerdown", handlePointerMove);
  document.addEventListener("mouseleave", handleMouseLeave);

  /**
   * Generates or refreshes active gust impulses for all connected bodies (ballA, rectangleA, chimes) within 220px wind field.
   */
  const triggerGusts = (now) => {
    const rawSpeed = Math.hypot(velocity.x, velocity.y);
    if (rawSpeed < 0.05) return;

    // Speed multiplier clamped so fast swipes create strong gusts without physics instability
    const speedFactor = Math.min(Math.max(rawSpeed / 4.0, 0.2), 3.0);

    const velUnitX = rawSpeed > 0.001 ? velocity.x / rawSpeed : 0;
    const velUnitY = rawSpeed > 0.001 ? velocity.y / rawSpeed : 0;

    targetBodies.forEach((body) => {
      const dx = body.position.x - mousePos.x;
      const dy = body.position.y - mousePos.y;
      const dist = Math.hypot(dx, dy);

      // 220px Wind Radius Falloff Zones:
      // 0–70 px = 100%, 70–140 px = 60%, 140–220 px = 25%, > 220 px = 0%
      let falloff = 0;
      if (dist <= 70) {
        falloff = 1.0;
      } else if (dist <= 140) {
        falloff = 0.60;
      } else if (dist <= 220) {
        falloff = 0.25;
      } else {
        falloff = 0;
      }

      if (falloff <= 0) return;

      // Radial push unit vector (outward from cursor)
      const distUnitX = dist > 0 ? dx / dist : 0;
      const distUnitY = dist > 0 ? dy / dist : 0;

      // Combine swipe velocity direction (70%) with outward radial push (30%)
      let windDirX = velUnitX * 0.7 + distUnitX * 0.3;
      let windDirY = velUnitY * 0.7 + distUnitY * 0.3;
      const dirLen = Math.hypot(windDirX, windDirY);
      if (dirLen > 0) {
        windDirX /= dirLen;
        windDirY /= dirLen;
      }

      // Base force calculation scaled with body mass so heavier bodies (ballA & rectangleA) respond visibly
      const massScale = Math.sqrt(body.mass || 2.0);
      let baseForce = falloff * speedFactor * 0.00035 * massScale;

      // 8% random gust variation (±8% range: 0.92 to 1.08)
      const gustVariation = 1.0 + (Math.random() - 0.5) * 0.16;
      baseForce *= gustVariation;

      // Active gust duration between 120ms and 180ms
      const gustDuration = 120 + Math.random() * 60;

      activeGusts.set(body.id, {
        body,
        startTime: now,
        duration: gustDuration,
        forceX: windDirX * baseForce,
        forceY: windDirY * baseForce
      });
    });
  };

  // Apply active gust forces every physics update step
  const onBeforeUpdate = () => {
    const now = performance.now();

    activeGusts.forEach((gust, bodyId) => {
      const elapsed = now - gust.startTime;
      if (elapsed >= gust.duration) {
        activeGusts.delete(bodyId);
        return;
      }

      // Smooth fade-out over gust duration (1.0 -> 0.0)
      const fadeProgress = 1.0 - (elapsed / gust.duration);
      const currentForceX = gust.forceX * fadeProgress;
      const currentForceY = gust.forceY * fadeProgress;

      // Apply force slightly above body center (pointB.y = -10) for natural tilting
      const forceApplicationPoint = {
        x: gust.body.position.x,
        y: gust.body.position.y - 10
      };

      Matter.Body.applyForce(gust.body, forceApplicationPoint, {
        x: currentForceX,
        y: currentForceY
      });
    });

    // Velocity decay per frame
    velocity.x *= 0.88;
    velocity.y *= 0.88;
  };

  Matter.Events.on(engine, "beforeUpdate", onBeforeUpdate);

  return () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerenter", handlePointerMove);
    window.removeEventListener("pointerdown", handlePointerMove);
    document.removeEventListener("mouseleave", handleMouseLeave);
    Matter.Events.off(engine, "beforeUpdate", onBeforeUpdate);
    activeGusts.clear();
  };
}
