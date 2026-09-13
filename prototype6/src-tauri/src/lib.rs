use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, PhysicalPosition, Position, WebviewWindow};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WindowSettings {
    pub x: i32,
    pub y: i32,
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
    if let Some(path) = get_settings_path(app) {
        let settings = WindowSettings { x, y };
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
    let mut min_y = -2; // Allows widget to go 2px higher up (y = -2)
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

#[cfg(target_os = "windows")]
static PREV_WNDPROC: std::sync::atomic::AtomicPtr<std::ffi::c_void> =
    std::sync::atomic::AtomicPtr::new(std::ptr::null_mut());

#[cfg(target_os = "windows")]
unsafe extern "system" fn wallpaper_wndproc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows_sys::Win32::Foundation::WPARAM,
    lparam: windows_sys::Win32::Foundation::LPARAM,
) -> windows_sys::Win32::Foundation::LRESULT {
    use std::sync::atomic::Ordering;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallWindowProcW, DefWindowProcW, HWND_BOTTOM, SC_MAXIMIZE, SC_MINIMIZE, SC_RESTORE,
        SWP_HIDEWINDOW, WINDOWPOS, WM_SHOWWINDOW, WM_SYSCOMMAND, WM_WINDOWPOSCHANGING,
    };

    match msg {
        WM_SYSCOMMAND => {
            let cmd = (wparam & 0xFFF0) as u32;
            if cmd == SC_MINIMIZE || cmd == SC_RESTORE || cmd == SC_MAXIMIZE {
                return 0; // Block minimize/restore animations completely
            }
        }
        WM_SHOWWINDOW => {
            if wparam == 0 {
                return 0; // Block hiding requests from 3-finger swipe / Show Desktop (Win+D)
            }
        }
        WM_WINDOWPOSCHANGING => {
            if lparam != 0 {
                let pos = lparam as *mut WINDOWPOS;
                (*pos).flags &= !SWP_HIDEWINDOW; // Strip hide flag if Windows attempts to hide window
                (*pos).hwndInsertAfter = HWND_BOTTOM; // Strictly enforce HWND_BOTTOM z-order so DWM never lifts window above apps during Task View
            }
        }
        _ => {}
    }

    let prev = PREV_WNDPROC.load(Ordering::Relaxed);
    if prev != std::ptr::null_mut() {
        CallWindowProcW(std::mem::transmute(prev), hwnd, msg, wparam, lparam)
    } else {
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }
}

#[cfg(target_os = "windows")]
fn attach_to_desktop_wallpaper(window: &WebviewWindow) -> Result<(), String> {
    use std::ptr;
    use std::sync::atomic::{AtomicPtr, Ordering};
    use windows_sys::Win32::Foundation::{GetLastError, BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowA, FindWindowExA, GetClassNameA, GetWindowLongPtrW,
        IsWindowVisible, SendMessageTimeoutA, SetParent, SetWindowLongPtrW, SetWindowPos,
        GWLP_WNDPROC, GWL_EXSTYLE, GWL_STYLE, HWND_BOTTOM, SMTO_NORMAL, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU,
    };

    let raw_hwnd = match window.hwnd() {
        Ok(h) => h.0 as HWND,
        Err(e) => return Err(format!("Failed to get window HWND: {}", e)),
    };

    println!("[WorkerW Debug] Tauri Window HWND: {:?}", raw_hwnd);

    unsafe {
        let progman = FindWindowA(b"Progman\0".as_ptr(), ptr::null());
        println!("[WorkerW Debug] FindWindowA('Progman') HWND: {:?}", progman);
        if progman == ptr::null_mut() {
            return Err("Failed to find Progman window".to_string());
        }

        // Send 0x052C to Progman to split wallpaper layer and spawn WorkerW
        let mut result: usize = 0;
        let msg_res = SendMessageTimeoutA(
            progman,
            0x052C,
            0,
            0,
            SMTO_NORMAL,
            1000,
            &mut result as *mut usize as *mut _,
        );
        println!(
            "[WorkerW Debug] SendMessageTimeoutA(0x052C) result: {}, msg_res: {}, GetLastError: {}",
            result, msg_res, GetLastError()
        );

        // Find the window containing SHELLDLL_DefView
        static SHELLDLL_WINDOW: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(ptr::null_mut());
        static WORKERW_WALLPAPER: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(ptr::null_mut());

        SHELLDLL_WINDOW.store(ptr::null_mut(), Ordering::Relaxed);
        WORKERW_WALLPAPER.store(ptr::null_mut(), Ordering::Relaxed);

        unsafe extern "system" fn enum_windows_proc(hwnd: HWND, _: LPARAM) -> BOOL {
            let shelldll = FindWindowExA(hwnd, ptr::null_mut(), b"SHELLDLL_DefView\0".as_ptr(), ptr::null());
            if shelldll != ptr::null_mut() {
                SHELLDLL_WINDOW.store(hwnd, Ordering::Relaxed);
            }
            1
        }

        EnumWindows(Some(enum_windows_proc), 0);
        let shelldll_window = SHELLDLL_WINDOW.load(Ordering::Relaxed);
        println!("[WorkerW Debug] Window containing SHELLDLL_DefView: {:?}", shelldll_window);

        if shelldll_window != ptr::null_mut() {
            let workerw = FindWindowExA(ptr::null_mut(), shelldll_window, b"WorkerW\0".as_ptr(), ptr::null());
            println!("[WorkerW Debug] Sibling WorkerW right after SHELLDLL_DefView window: {:?}", workerw);
            if workerw != ptr::null_mut() {
                WORKERW_WALLPAPER.store(workerw, Ordering::Relaxed);
            }
        }

        let mut target_workerw = WORKERW_WALLPAPER.load(Ordering::Relaxed);

        if target_workerw == ptr::null_mut() {
            println!("[WorkerW Debug] Sibling WorkerW null. Searching for visible WorkerW windows...");
            unsafe extern "system" fn enum_visible_workerw(hwnd: HWND, _: LPARAM) -> BOOL {
                let mut class_name = [0u8; 256];
                let len = GetClassNameA(hwnd, class_name.as_mut_ptr(), 256);
                if len > 0 {
                    let name = std::str::from_utf8(&class_name[..len as usize]).unwrap_or("");
                    if name == "WorkerW" && IsWindowVisible(hwnd) != 0 {
                        if hwnd != SHELLDLL_WINDOW.load(Ordering::Relaxed) {
                            WORKERW_WALLPAPER.store(hwnd, Ordering::Relaxed);
                            return 0;
                        }
                    }
                }
                1
            }
            EnumWindows(Some(enum_visible_workerw), 0);
            target_workerw = WORKERW_WALLPAPER.load(Ordering::Relaxed);
            println!("[WorkerW Debug] Fallback WorkerW: {:?}", target_workerw);
        }

        // Prefer WorkerW wallpaper layer so window stays strictly behind all apps during 3-finger slide up (Task View)
        let target_parent = if target_workerw != ptr::null_mut() {
            target_workerw
        } else if progman != ptr::null_mut() {
            progman
        } else {
            return Err("No desktop wallpaper parent window found".to_string());
        };

        println!("[WorkerW Debug] Selected target_parent HWND: {:?}", target_parent);

        // Extended window styles (ToolWindow / NoActivate, strip AppWindow to prevent Task View / 3-finger slide up inclusion)
        let ex_style = GetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE);
        let new_ex_style = (ex_style | (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) as isize) & !(WS_EX_APPWINDOW as isize);
        SetWindowLongPtrW(raw_hwnd, GWL_EXSTYLE, new_ex_style);

        // Strip Minimize / Maximize / SysMenu styles to prevent gestures from minimizing window
        let style = GetWindowLongPtrW(raw_hwnd, GWL_STYLE);
        let new_style = style & !(WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU) as isize;
        SetWindowLongPtrW(raw_hwnd, GWL_STYLE, new_style);

        // Subclass WNDPROC to block SC_MINIMIZE and 3-finger swipe / Show Desktop hide messages
        let old_wndproc = SetWindowLongPtrW(raw_hwnd, GWLP_WNDPROC, wallpaper_wndproc as *const () as isize);
        if old_wndproc != 0 {
            PREV_WNDPROC.store(old_wndproc as *mut _, Ordering::Relaxed);
        }

        // Attach window to desktop wallpaper layer
        let parent_res = SetParent(raw_hwnd, target_parent);
        let err = GetLastError();
        println!(
            "[WorkerW Debug] SetParent(raw_hwnd: {:?}, target_parent: {:?}) returned: {:?}, GetLastError: {}",
            raw_hwnd, target_parent, parent_res, err
        );

        if parent_res == ptr::null_mut() && err != 0 {
            println!("[WorkerW Debug] SetParent failed with error code: {}. Aborting.", err);
            return Err(format!("SetParent failed with error {}", err));
        }

        // Push to bottom of desktop z-order
        SetWindowPos(
            raw_hwnd,
            HWND_BOTTOM,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
        );
        println!("[WorkerW Debug] SetWindowPos HWND_BOTTOM executed successfully.");
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some((x, y)) = load_position_from_disk(app.handle()) {
                    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
                } else {
                    let _ = window.set_position(Position::Physical(PhysicalPosition::new(100, 100)));
                }

                // Show window BEFORE attaching to desktop wallpaper so show() doesn't override HWND_BOTTOM
                let _ = window.show();

                #[cfg(target_os = "windows")]
                {
                    match attach_to_desktop_wallpaper(&window) {
                        Ok(_) => println!("[WorkerW] Window successfully attached to desktop wallpaper!"),
                        Err(e) => {
                            eprintln!("[WorkerW Warning] Attachment failed: {}. App falling back to standard desktop window mode.", e);
                        }
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snap_and_save_position,
            start_drag,
            get_window_position,
            move_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}