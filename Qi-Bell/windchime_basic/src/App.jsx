import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import WidgetDragHandle from "./drag.jsx";
import MatterScene from "./matter.jsx";
import { useAudioController } from "./audio.jsx";

function App() {
  const [skin, setSkin] = useState("basic");

  useEffect(() => {
    // Fetch initial skin state from backend
    invoke("get_active_skin")
      .then((activeSkin) => {
        if (activeSkin) setSkin(activeSkin);
      })
      .catch((err) => console.error("Error fetching active skin:", err));

    // Listen for skin changes emitted from system tray menu
    const unlistenPromise = listen("skin-changed", (event) => {
      setSkin(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const { playChimeSound, resumeAudio } = useAudioController(skin);

  return (
    <div className="w-screen h-screen relative overflow-hidden flex justify-center items-center bg-transparent select-none">
      <WidgetDragHandle />
      <MatterScene skin={skin} playChimeSound={playChimeSound} resumeAudio={resumeAudio} />
    </div>
  );
}

export default App;
