const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    startDrag: (mousePosition) => ipcRenderer.send("start-drag", mousePosition),
    drag: (mousePosition) => ipcRenderer.send("drag", mousePosition),
    stopDrag: () => ipcRenderer.send("stop-drag")
});
