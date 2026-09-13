import { useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * WidgetDragHandle Component
 * 
 * A completely transparent, invisible drag region overlay positioned right over ballB
 * (the top ball of the wind chime). Captures mouse/pointer drag events to move the
 * desktop wallpaper window without rendering any visible UI overlays.
 */
export function WidgetDragHandle() {
  const isDraggingRef = useRef(false);

  const handlePointerDown = async (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    isDraggingRef.current = true;

    const startScreenX = e.screenX;
    const startScreenY = e.screenY;
    const scale = window.devicePixelRatio || 1;

    let initialWinX = 100;
    let initialWinY = 100;

    try {
      const pos = await invoke("get_window_position");
      if (Array.isArray(pos)) {
        initialWinX = pos[0];
        initialWinY = pos[1];
      }
    } catch (err) {
      console.error("[Drag Handle] Error getting window position:", err);
    }

    const onPointerMove = async (moveEvent) => {
      if (!isDraggingRef.current) return;
      const dx = Math.round((moveEvent.screenX - startScreenX) * scale);
      const dy = Math.round((moveEvent.screenY - startScreenY) * scale);
      const newX = initialWinX + dx;
      const newY = initialWinY + dy;

      try {
        await invoke("move_window", { x: newX, y: newY });
      } catch (err) {
        console.error("[Drag Handle] Error moving window:", err);
      }
    };

    const onPointerUp = async () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("mousemove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("mouseup", onPointerUp);

      try {
        await invoke("snap_and_save_position");
      } catch (err) {
        console.error("[Drag Handle] Error saving position:", err);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("mouseup", onPointerUp);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onMouseDown={handlePointerDown}
      data-tauri-drag-region
      style={{
        position: "absolute",
        top: "22.5px",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        background: "transparent",
        backgroundColor: "transparent",
        zIndex: 999999,
        cursor: "grab",
        userSelect: "none",
        pointerEvents: "auto"
      }}
      className="active:cursor-grabbing"
      title="Click & Drag top ball (ballB) to move Wind Chime widget"
    />
  );
}

export default WidgetDragHandle;
