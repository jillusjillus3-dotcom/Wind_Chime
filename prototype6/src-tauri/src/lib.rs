use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, Position, WebviewWindow,
};

static ALLOW_HIDE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static IS_POSITION_LOCKED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn hide_window(window: &WebviewWindow) {
    ALLOW_HIDE.store(true, std::sync::atomic::Ordering::SeqCst);
    let _ = window.hide();
    ALLOW_HIDE.store(false, std::sync::atomic::Ordering::SeqCst);
}

fn show_window(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WindowSettings {
    pub x: i32,
    pub y: i32,
    #[serde(default)]
    pub locked: bool,
}

fn get_settings_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = fs::create_dir_all(&dir);
        Some(dir.join("settings.json"))
    } else {
        None
    }
}

fn save_position_to_disk(app: &AppHandle, x: i32, y: i32) {
    if x <= -10000 || y <= -10000 {
        return;
    }
    let locked = IS_POSITION_LOCKED.load(std::sync::atomic::Ordering::Relaxed);
    if let Some(path) = get_settings_path(app) {
        let settings = WindowSettings { x, y, locked };
        if let Ok(json) = serde_json::to_string_pretty(&settings) {
            let _ = fs::write(path, json);
        }
    }
}

fn load_position_from_disk(app: &AppHandle) -> Option<(i32, i32)> {
    let path = get_settings_path(app)?;
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(settings) = serde_json::from_str::<WindowSettings>(&content) {
                IS_POSITION_LOCKED.store(settings.locked, std::sync::atomic::Ordering::SeqCst);
                // Ignore minimized or off-screen coordinates (-32000 on Windows)
                if settings.x > -10000 && settings.y > -10000 {
                    return Some((settings.x, settings.y));
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_work_area_bounds(
    window: &WebviewWindow,
    window_width: i32,
    window_height: i32,
    border: i32,
) -> Option<(i32, i32, i32, i32)> {
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };

    if let Ok(hwnd_val) = window.hwnd() {
        let raw_hwnd = hwnd_val.0 as windows_sys::Win32::Foundation::HWND;
        unsafe {
            let h_mon = MonitorFromWindow(raw_hwnd, MONITOR_DEFAULTTONEAREST);
            if h_mon != std::ptr::null_mut() {
                let mut mi: MONITORINFO = std::mem::zeroed();
                mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
                if GetMonitorInfoW(h_mon, &mut mi as *mut MONITORINFO) != 0 {
                    let min_x = mi.rcWork.left + border;
                    let min_y = mi.rcWork.top - 12; // Allows widget to go 2px higher up (y = -2)
                    let max_x = mi.rcWork.right - window_width - border;
                    let max_y = mi.rcWork.bottom - window_height - border;
                    return Some((min_x, min_y, max_x, max_y));
                }
            }
        }
    }
    None
}

#[tauri::command]
fn snap_and_save_position(window: WebviewWindow) -> Result<(i32, i32), String> {
    if IS_POSITION_LOCKED.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok((100, 100));
    }

    let mut x = 100;
    let mut y = 100;

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::RECT;
        use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;
        if let Ok(hwnd_val) = window.hwnd() {
            let raw_hwnd = hwnd_val.0 as windows_sys::Win32::Foundation::HWND;
            unsafe {
                let mut rect: RECT = std::mem::zeroed();
                if GetWindowRect(raw_hwnd, &mut rect) != 0 {
                    x = rect.left;
                    y = rect.top;
                }
            }
        }
    }

    if x <= -10000 || y <= -10000 {
        return Ok((100, 100));
    }

    let window_width: i32 = 340;
    let window_height: i32 = 400;
    let grid_size: i32 = 10;
    let border: i32 = 5;

    let mut min_x = border;
    let mut min_y = -2;
    let mut max_x = 1920 - window_width - border;
    let mut max_y = 1080 - window_height - border;

    #[cfg(target_os = "windows")]
    {
        if let Some((b_min_x, b_min_y, b_max_x, b_max_y)) =
            get_work_area_bounds(&window, window_width, window_height, border)
        {
            min_x = b_min_x;
            min_y = b_min_y;
            max_x = b_max_x;
            max_y = b_max_y;
        }
    }

    let mut new_x =
        min_x + (((x - min_x) as f64 / grid_size as f64).round() as i32) * grid_size;
    let mut new_y =
        min_y + (((y - min_y) as f64 / grid_size as f64).round() as i32) * grid_size;

    if (x - min_x).abs() <= grid_size {
        new_x = min_x;
    }
    if (x - max_x).abs() <= grid_size {
        new_x = max_x;
    }
    if (y - min_y).abs() <= grid_size {
        new_y = min_y;
    }
    if (y - max_y).abs() <= grid_size {
        new_y = max_y;
    }

    x = new_x.max(min_x).min(max_x);
    y = new_y.max(min_y).min(max_y);

    let _ = move_window(window.clone(), x, y);
    save_position_to_disk(window.app_handle(), x, y);

    Ok((x, y))
}

#[tauri::command]
fn start_drag(window: WebviewWindow) -> Result<(), String> {
    if IS_POSITION_LOCKED.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok(());
    }
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_window_position(window: WebviewWindow) -> Result<(i32, i32), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::RECT;
        use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect;

        if let Ok(hwnd_val) = window.hwnd() {
            let raw_hwnd = hwnd_val.0 as windows_sys::Win32::Foundation::HWND;
            unsafe {
                let mut rect: RECT = std::mem::zeroed();
                if GetWindowRect(raw_hwnd, &mut rect) != 0 {
                    return Ok((rect.left, rect.top));
                }
            }
        }
    }
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y))
}

#[tauri::command]
fn move_window(window: WebviewWindow, mut x: i32, mut y: i32) -> Result<(), String> {
    if IS_POSITION_LOCKED.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok(());
    }

    let window_width: i32 = 340;
    let window_height: i32 = 400;
    let border: i32 = 5;

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::RECT;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetParent, GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
        };

        if let Some((min_x, min_y, max_x, max_y)) =
            get_work_area_bounds(&window, window_width, window_height, border)
        {
            x = x.max(min_x).min(max_x);
            y = y.max(min_y).min(max_y);
        }

        if let Ok(hwnd_val) = window.hwnd() {
            let raw_hwnd = hwnd_val.0 as windows_sys::Win32::Foundation::HWND;
            unsafe {
                let parent = GetParent(raw_hwnd);
                if parent != std::ptr::null_mut() {
                    let mut parent_rect: RECT = std::mem::zeroed();
                    let (rel_x, rel_y) = if GetWindowRect(parent, &mut parent_rect) != 0 {
                        (x - parent_rect.left, y - parent_rect.top)
                    } else {
                        (x, y)
                    };

                    SetWindowPos(
                        raw_hwnd,
                        std::ptr::null_mut(),
                        rel_x,
                        rel_y,
                        0,
                        0,
                        SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
                    );
                    return Ok(());
                }
            }
        }
    }

    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn is_position_locked() -> bool {
    IS_POSITION_LOCKED.load(std::sync::atomic::Ordering::Relaxed)
}

#[tauri::command]
fn toggle_position_lock(app: AppHandle) -> Result<bool, String> {
    let current = IS_POSITION_LOCKED.load(std::sync::atomic::Ordering::SeqCst);
    let new_state = !current;
    IS_POSITION_LOCKED.store(new_state, std::sync::atomic::Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("main") {
    let _ = w.emit("position-lock-changed", new_state);
}

    if let Some(w) = app.get_webview_window("main") {
        if let Ok(pos) = get_window_position(w) {
            save_position_to_disk(&app, pos.0, pos.1);
        }
    }
    Ok(new_state)
}

#[cfg(target_os = "windows")]
fn send_to_bottom(raw_hwnd: windows_sys::Win32::Foundation::HWND) {
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };
        SetWindowPos(
            raw_hwnd,
            HWND_BOTTOM,
            0,
            0,
            0,
            0,
            SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE,
        );
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn wallpaper_subclass_proc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows_sys::Win32::Foundation::WPARAM,
    lparam: windows_sys::Win32::Foundation::LPARAM,
    _id_subclass: usize,
    _ref_data: usize,
) -> windows_sys::Win32::Foundation::LRESULT {
    use windows_sys::Win32::UI::Shell::DefSubclassProc;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        HWND_BOTTOM, SC_MAXIMIZE, SC_MINIMIZE, SC_RESTORE, STYLESTRUCT, SWP_HIDEWINDOW,
        SWP_NOMOVE, WINDOWPOS, WM_ACTIVATE, WM_ACTIVATEAPP, WM_CHILDACTIVATE, WM_NCACTIVATE,
        WM_SHOWWINDOW, WM_STYLECHANGED, WM_STYLECHANGING, WM_SYSCOMMAND, WM_WINDOWPOSCHANGED,
        WM_WINDOWPOSCHANGING, WS_MINIMIZE, WS_VISIBLE,
    };

    match msg {
        WM_SYSCOMMAND => {
            let cmd = (wparam & 0xFFF0) as u32;
            if cmd == SC_MINIMIZE || cmd == SC_RESTORE || cmd == SC_MAXIMIZE {
                send_to_bottom(hwnd);
                return 0; // Prevent minimize/restore (Exact Electron preventDefault logic)
            }
        }
        WM_SHOWWINDOW => {
            if wparam == 0 && !ALLOW_HIDE.load(std::sync::atomic::Ordering::Relaxed) {
                send_to_bottom(hwnd);
                return 0; // Prevent hide
            }
        }
        WM_WINDOWPOSCHANGING => {
            if lparam != 0 {
                let pos = lparam as *mut WINDOWPOS;
                // Intercept Win+D / Show Desktop off-screen movement to (-32000, -32000)
                if (*pos).x <= -10000 || (*pos).y <= -10000 {
                    (*pos).flags |= SWP_NOMOVE; // Block off-screen movement
                }
                if !ALLOW_HIDE.load(std::sync::atomic::Ordering::Relaxed) {
                    (*pos).flags &= !SWP_HIDEWINDOW; // Strip hide flag
                }
                (*pos).hwndInsertAfter = HWND_BOTTOM;
            }
            return 0;
        }
        WM_WINDOWPOSCHANGED => {
            if lparam != 0 {
                let pos = lparam as *mut WINDOWPOS;
                if (*pos).x <= -10000 || (*pos).y <= -10000 {
                    (*pos).flags |= SWP_NOMOVE;
                }
                if !ALLOW_HIDE.load(std::sync::atomic::Ordering::Relaxed) {
                    (*pos).flags &= !SWP_HIDEWINDOW;
                }
                (*pos).hwndInsertAfter = HWND_BOTTOM;
            }
        }
        WM_NCACTIVATE => {
            if !ALLOW_HIDE.load(std::sync::atomic::Ordering::Relaxed) {
                return 1;
            }
        }
        WM_ACTIVATEAPP => {
            if wparam == 0 && !ALLOW_HIDE.load(std::sync::atomic::Ordering::Relaxed) {
                return 0;
            }
        }
        WM_ACTIVATE => {
            if (wparam & 0xFFFF) == 0 && !ALLOW_HIDE.load(std::sync::atomic::Ordering::Relaxed) {
                return 0;
            }
        }
        WM_CHILDACTIVATE => {
            if !ALLOW_HIDE.load(std::sync::atomic::Ordering::Relaxed) {
                return 0;
            }
        }
        WM_STYLECHANGING | WM_STYLECHANGED => {
            if lparam != 0 {
                let style = lparam as *mut STYLESTRUCT;
                (*style).styleNew &= !(WS_MINIMIZE as u32);
                (*style).styleNew |= WS_VISIBLE as u32;
            }
        }
        _ => {}
    }

    DefSubclassProc(hwnd, msg, wparam, lparam)
}

#[cfg(target_os = "windows")]
fn get_window_hwnd(
    window: &WebviewWindow,
) -> Result<windows_sys::Win32::Foundation::HWND, String> {
    for _ in 0..20 {
        if let Ok(h) = window.hwnd() {
            return Ok(h.0 as windows_sys::Win32::Foundation::HWND);
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    window
        .hwnd()
        .map(|h| h.0 as windows_sys::Win32::Foundation::HWND)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn attach_to_desktop_wallpaper(window: &WebviewWindow) -> Result<(), String> {
    use std::ptr;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, FindWindowA, GetDesktopWindow, GetWindowLongPtrW, SetWindowLongPtrW,
        GWLP_HWNDPARENT, GWL_EXSTYLE, GWL_STYLE, WS_CAPTION, WS_CLIPSIBLINGS, WS_EX_APPWINDOW,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU,
        WS_THICKFRAME,
    };

    let raw_hwnd = get_window_hwnd(window)?;

    println!("[DesktopWidget Debug] Window HWND: {:?}", raw_hwnd);

    unsafe {
        // 1. Find Progman or fallback to GetDesktopWindow (Exact Electron logic)
        let progman = FindWindowA(b"Progman\0".as_ptr(), ptr::null());
        let desktop_owner = if progman != ptr::null_mut() {
            progman
        } else {
            GetDesktopWindow()
        };

        println!("[DesktopWidget Debug] desktopOwner HWND: {:?}", desktop_owner);

        // 2. Set desktop window as OWNER via GWLP_HWNDPARENT so Windows Shell ignores it during Win+D (Exact Electron logic)
        if desktop_owner != ptr::null_mut() {
            SetWindowLongPtrW(raw_hwnd, GWLP_HWNDPARENT, desktop_owner as isize);
        }

        // 3. Apply WS_EX_NOACTIVATE & WS_EX_TOOLWINDOW extended styles (Exact Electron logic)
        let current_ex_style = GetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE);
        let new_ex_style = (current_ex_style | (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) as isize) & !(WS_EX_APPWINDOW as isize);
        SetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE, new_ex_style);

        // 4. Keep WS_POPUP | WS_CLIPSIBLINGS style (borderless floating desktop widget)
        let style = GetWindowLongPtrW(raw_hwnd, GWL_STYLE);
        let new_style = (style
            & !(WS_CAPTION
                | WS_THICKFRAME
                | WS_MINIMIZEBOX
                | WS_MAXIMIZEBOX
                | WS_SYSMENU) as isize)
            | (WS_POPUP | WS_CLIPSIBLINGS) as isize;
        SetWindowLongPtrW(raw_hwnd, GWL_STYLE, new_style);

        // 5. Subclass window safely using SetWindowSubclass
        use windows_sys::Win32::UI::Shell::SetWindowSubclass;
        let sub_res = SetWindowSubclass(raw_hwnd, Some(wallpaper_subclass_proc), 1, 0);
        println!("[DesktopWidget Debug] SetWindowSubclass returned: {}", sub_res);

        // 6. Subclass all child HWNDs (WebView2 inner renderer host)
        unsafe extern "system" fn enum_child_subclass_proc(
            child_hwnd: windows_sys::Win32::Foundation::HWND,
            _: windows_sys::Win32::Foundation::LPARAM,
        ) -> windows_sys::Win32::Foundation::BOOL {
            use windows_sys::Win32::UI::Shell::SetWindowSubclass;
            SetWindowSubclass(child_hwnd, Some(wallpaper_subclass_proc), 1, 0);
            1
        }
        EnumChildWindows(raw_hwnd, Some(enum_child_subclass_proc), 0);

        // 7. Initial push to HWND_BOTTOM (Exact Electron logic)
        send_to_bottom(raw_hwnd);
        println!("[DesktopWidget Debug] Window successfully configured as Electron-style desktop widget!");
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_wallpaper::init())
        .setup(|app| {
            // Load saved lock state before creating the tray menu so initial tray text is correct in production
            let _ = load_position_from_disk(app.handle());

            // Build System Tray Menu & Icon
            let show_item = MenuItem::with_id(app, "show", "Show Widget", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide Widget", true, None::<&str>)?;

            let initial_lock_text = if IS_POSITION_LOCKED.load(std::sync::atomic::Ordering::Relaxed) {
                "Unlock Position"
            } else {
                "Lock Position"
            };
            let lock_item = MenuItem::with_id(app, "lock", initial_lock_text, true, None::<&str>)?;
            let uninstall_item = MenuItem::with_id(app, "uninstall", "Uninstall", true, None::<&str>)?;
            let exit_item = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                app,
                &[&show_item, &hide_item, &lock_item, &uninstall_item, &exit_item],
            )?;

            let lock_item_clone = lock_item.clone();

            let tray_icon = app
                .default_window_icon()
                .cloned()
                .unwrap_or_else(|| {
                    tauri::image::Image::from_bytes(include_bytes!("../icons/icon.ico")).unwrap()
                });

            TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&tray_menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            show_window(&w);
                        }
                    }
                    "hide" => {
                        if let Some(w) = app.get_webview_window("main") {
                            hide_window(&w);
                        }
                    }
                    "lock" => {
                        let current = IS_POSITION_LOCKED.load(std::sync::atomic::Ordering::SeqCst);
                        let new_state = !current;
                        IS_POSITION_LOCKED.store(new_state, std::sync::atomic::Ordering::SeqCst);

                        let new_text = if new_state {
                            "Unlock Position"
                        } else {
                            "Lock Position"
                        };
                        let _ = lock_item_clone.set_text(new_text);

                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("position-lock-changed", new_state);
                        }

                        if let Some(w) = app.get_webview_window("main") {
                            if let Ok(pos) = get_window_position(w) {
                                save_position_to_disk(app, pos.0, pos.1);
                            }
                        }
                    }
                    "uninstall" => {
                        #[cfg(target_os = "windows")]
                        {
                            if let Ok(current_exe) = std::env::current_exe() {
                                if let Some(exe_dir) = current_exe.parent() {
                                    let candidates = [
                                        exe_dir.join("Uninstall prototype6.exe"),
                                        exe_dir.join("uninstall.exe"),
                                        exe_dir.join("uninst.exe"),
                                    ];

                                    let mut launched = false;
                                    for uninstaller in &candidates {
                                        if uninstaller.exists() {
                                            if std::process::Command::new(uninstaller).spawn().is_ok() {
                                                launched = true;
                                                break;
                                            }
                                        }
                                    }

                                    if !launched {
                                        let _ = std::process::Command::new("cmd")
                                            .args(["/C", "start", "ms-settings:appsfeatures"])
                                            .spawn();
                                    }
                                }
                            }
                        }
                        app.exit(0);
                    }
                    "exit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if let Ok(visible) = w.is_visible() {
                                if visible {
                                    hide_window(&w);
                                } else {
                                    show_window(&w);
                                }
                            }
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                if let Some((x, y)) = load_position_from_disk(app.handle()) {
                    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
                } else {
                    let _ = window.set_position(Position::Physical(PhysicalPosition::new(100, 100)));
                }

                let _ = window.show();

                #[cfg(target_os = "windows")]
                {
                    use windows_sys::Win32::System::Threading::{
                        GetCurrentProcess, SetPriorityClass, HIGH_PRIORITY_CLASS,
                    };
                    unsafe {
                        SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS);
                    }

                    static ATTACHED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
                    let window_clone_event = window.clone();
                    let window_clone_main = window.clone();
                    let window_clone_close = window.clone();
                    let window_clone_heartbeat = window.clone();

                    let do_attach = |win: &WebviewWindow| {
                        if !ATTACHED.load(std::sync::atomic::Ordering::Relaxed) {
                            if win.hwnd().is_ok() {
                                if ATTACHED
                                    .compare_exchange(
                                        false,
                                        true,
                                        std::sync::atomic::Ordering::SeqCst,
                                        std::sync::atomic::Ordering::Relaxed,
                                    )
                                    .is_ok()
                                {
                                    match attach_to_desktop_wallpaper(win) {
                                        Ok(_) => println!(
                                            "[DesktopWidget] Window attached with Electron wallpaper pinning!"
                                        ),
                                        Err(e) => {
                                            ATTACHED.store(false, std::sync::atomic::Ordering::Relaxed);
                                            eprintln!("[DesktopWidget Warning] Attachment failed: {}", e);
                                        }
                                    }
                                }
                            }
                        }
                    };

                    let do_attach_event = do_attach;
                    let do_attach_main = do_attach;

                    window.on_window_event(move |event| {
                        match event {
                            tauri::WindowEvent::CloseRequested { api, .. } => {
                                api.prevent_close();
                                hide_window(&window_clone_close);
                            }
                            tauri::WindowEvent::Focused(_)
                            | tauri::WindowEvent::Moved(_)
                            | tauri::WindowEvent::Resized(_) => {
                                if let Ok(h) = window_clone_event.hwnd() {
                                    send_to_bottom(h.0 as windows_sys::Win32::Foundation::HWND);
                                }
                            }
                            _ => {}
                        }
                        do_attach_event(&window_clone_event);
                    });

                    // Heartbeat interval: sendToBottom every 1000ms (Exact Electron setInterval(sendToBottom, 1000))
                    tauri::async_runtime::spawn(async move {
                        loop {
                            std::thread::sleep(std::time::Duration::from_millis(1000));
                            if let Ok(h) = window_clone_heartbeat.hwnd() {
                                send_to_bottom(h.0 as windows_sys::Win32::Foundation::HWND);
                            }
                        }
                    });

                    let app_handle = app.handle().clone();
                    let _ = app_handle.run_on_main_thread(move || {
                        do_attach_main(&window_clone_main);
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snap_and_save_position,
            start_drag,
            get_window_position,
            move_window,
            is_position_locked,
            toggle_position_lock
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}