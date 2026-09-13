const { app, BrowserWindow, Menu, screen, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

let koffi = null;
try {
    koffi = require("koffi");
} catch (e) {
    console.log("koffi native module status:", e.message);
}

// ============================================
// CREATE WINDOW
// ============================================

function createWindow() {
    // ----------------------------------------
    // Settings file
    // ----------------------------------------
    const settingsPath = path.join(
        app.getPath("userData"),
        "settings.json"
    );

    // ----------------------------------------
    // Window size
    // ----------------------------------------
    const WINDOW_WIDTH = 340;
    const WINDOW_HEIGHT = 400;

    // ----------------------------------------
    // Position rules
    // ----------------------------------------
    const GRID_SIZE = 10;
    const LEFT_BORDER = 10;
    const TOP_BORDER = 10;
    const RIGHT_BORDER = 10;
    const BOTTOM_BORDER = 10;

    // ============================================
    // READ SAVED POSITION
    // ============================================
    let savedPosition = null;

    if (fs.existsSync(settingsPath)) {
        try {
            const settings = JSON.parse(
                fs.readFileSync(settingsPath, "utf-8")
            );

            if (
                typeof settings.x === "number" &&
                typeof settings.y === "number"
            ) {
                savedPosition = {
                    x: settings.x,
                    y: settings.y
                };
            }
        } catch (error) {
            console.log("Could not read saved position.");
        }
    }

    // ============================================
    // CREATE WINDOW
    // ============================================
    const window = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        frame: false,
        resizable: false,
        transparent: true,
        skipTaskbar: true,
        minimizable: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false
        },
        ...(savedPosition && {
            x: savedPosition.x,
            y: savedPosition.y
        })
    });

    // ============================================
    // LOAD HTML / DEV SERVER
    // ============================================
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";

    if (isDev) {
        const loadDevServer = () => {
            window.loadURL(devUrl).catch(() => {
                console.log("Waiting for Vite dev server at " + devUrl + "...");
                setTimeout(loadDevServer, 500);
            });
        };
        loadDevServer();
    } else {
        const distIndexPath = path.join(__dirname, "dist", "index.html");
        if (fs.existsSync(distIndexPath)) {
            window.loadFile(distIndexPath);
        } else {
            window.loadURL(devUrl).catch(() => {
                window.loadFile("index.html");
            });
        }
    }

    // ============================================
    // GET ALLOWED DESKTOP AREA
    // ============================================
    function getAllowedArea(x, y) {
        const display = screen.getDisplayNearestPoint({
            x: x + WINDOW_WIDTH / 2,
            y: y + WINDOW_HEIGHT / 2
        });

        const area = display.workArea;

        return {
            minX: area.x + LEFT_BORDER,
            minY: area.y + TOP_BORDER,
            maxX: area.x + area.width - WINDOW_WIDTH - RIGHT_BORDER,
            maxY: area.y + area.height - WINDOW_HEIGHT - BOTTOM_BORDER
        };
    }

    // ============================================
    // DRAG VARIABLES
    // ============================================
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    // ============================================
    // START DRAG
    // ============================================
    ipcMain.on("start-drag", (event, mousePosition) => {
        const cursor = screen.getCursorScreenPoint();
        const [windowX, windowY] = window.getPosition();

        const curX = (mousePosition && typeof mousePosition.x === "number") ? mousePosition.x : cursor.x;
        const curY = (mousePosition && typeof mousePosition.y === "number") ? mousePosition.y : cursor.y;

        dragOffsetX = curX - windowX;
        dragOffsetY = curY - windowY;

        isDragging = true;
    });

    // ============================================
    // DRAG
    // ============================================
    ipcMain.on("drag", (event, mousePosition) => {
        if (!isDragging) return;

        const cursor = screen.getCursorScreenPoint();
        const curX = (mousePosition && typeof mousePosition.x === "number") ? mousePosition.x : cursor.x;
        const curY = (mousePosition && typeof mousePosition.y === "number") ? mousePosition.y : cursor.y;

        let newX = curX - dragOffsetX;
        let newY = curY - dragOffsetY;

        const bounds = getAllowedArea(newX, newY);

        newX = Math.max(bounds.minX, Math.min(newX, bounds.maxX));
        newY = Math.max(bounds.minY, Math.min(newY, bounds.maxY));

        window.setPosition(Math.round(newX), Math.round(newY));
    });

    // ============================================
    // STOP DRAG
    // ============================================
    ipcMain.on("stop-drag", () => {
        if (!isDragging) return;
        isDragging = false;

        const [x, y] = window.getPosition();
        snapToGrid(x, y);
    });

    // ============================================
    // SNAP TO GRID
    // ============================================
    function snapToGrid(x, y) {
        const display = screen.getDisplayNearestPoint({
            x: x + WINDOW_WIDTH / 2,
            y: y + WINDOW_HEIGHT / 2
        });

        const area = display.workArea;

        const left = area.x + LEFT_BORDER;
        const top = area.y + TOP_BORDER;
        const right = area.x + area.width - WINDOW_WIDTH - RIGHT_BORDER;
        const bottom = area.y + area.height - WINDOW_HEIGHT - BOTTOM_BORDER;

        let newX = left + Math.round((x - left) / GRID_SIZE) * GRID_SIZE;
        let newY = top + Math.round((y - top) / GRID_SIZE) * GRID_SIZE;

        if (Math.abs(x - left) <= GRID_SIZE) newX = left;
        if (Math.abs(x - right) <= GRID_SIZE) newX = right;
        if (Math.abs(y - top) <= GRID_SIZE) newY = top;
        if (Math.abs(y - bottom) <= GRID_SIZE) newY = bottom;

        newX = Math.max(left, Math.min(newX, right));
        newY = Math.max(top, Math.min(newY, bottom));

        window.setPosition(Math.round(newX), Math.round(newY));
    }
}

// ============================================
// START ELECTRON
// ============================================
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows", "true");
app.commandLine.appendSwitch("disable-renderer-backgrounding", "true");
app.commandLine.appendSwitch("disable-background-timer-throttling", "true");
app.commandLine.appendSwitch("disable-http-cache");

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
});
