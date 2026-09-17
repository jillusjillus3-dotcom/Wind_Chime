import { useEffect } from "react";
import WidgetDragHandle from "./drag.jsx";
import MatterScene from "./matter.jsx";
import useChimeAudio from "./audio.jsx";

function App() {
  const { playChimeSound, resumeAudio } = useChimeAudio();

  useEffect(() => {
    // Native WorkerW parenting & subclassing handled by Rust backend
  }, []);

  return (
    <div className="w-screen h-screen relative overflow-hidden flex justify-center items-center bg-transparent select-none">
      <WidgetDragHandle />
      <MatterScene playChimeSound={playChimeSound} resumeAudio={resumeAudio} />
    </div>
  );
}

export default App;
