use std::ffi::c_void;
use serde_json::{json, Value};
use tauri::{State, WebviewWindow};
use crate::{ensure, AppState};
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
type Handle = *mut c_void;

#[cfg(windows)]
#[repr(C)]
struct DocInfo1 { doc_name: *const u16, output_file: *const u16, data_type: *const u16 }

#[cfg(windows)]
#[repr(C)]
struct PrinterInfo4W { printer_name: *const u16, server_name: *const u16, attributes: u32 }

#[cfg(windows)]
#[link(name = "winspool")]
extern "system" {
    fn OpenPrinterW(name: *mut u16, handle: *mut Handle, defaults: *mut c_void) -> i32;
    fn ClosePrinter(handle: Handle) -> i32;
    fn StartDocPrinterW(handle: Handle, level: u32, info: *mut DocInfo1) -> u32;
    fn EndDocPrinter(handle: Handle) -> i32;
    fn StartPagePrinter(handle: Handle) -> i32;
    fn EndPagePrinter(handle: Handle) -> i32;
    fn WritePrinter(handle: Handle, bytes: *const c_void, count: u32, written: *mut u32) -> i32;
    fn EnumPrintersW(flags: u32, name: *const u16, level: u32, buffer: *mut u8, size: u32, needed: *mut u32, returned: *mut u32) -> i32;
}

#[cfg(windows)]
const PRINTER_ENUM_LOCAL: u32 = 0x00000002;
#[cfg(windows)]
const PRINTER_ENUM_CONNECTIONS: u32 = 0x00000004;

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> { std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect() }

#[cfg(windows)]
unsafe fn from_wide_ptr(ptr: *const u16) -> String {
    if ptr.is_null() { return String::new(); }
    let mut len = 0usize;
    while *ptr.add(len) != 0 { len += 1; }
    String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
}

#[cfg(windows)]
unsafe fn enumerate_printers() -> Result<Vec<Value>, String> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0u32;
    let mut returned = 0u32;
    let _ = EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut returned);
    if needed == 0 { return Ok(Vec::new()); }
    let mut buffer = vec![0u8; needed as usize];
    if EnumPrintersW(flags, std::ptr::null(), 4, buffer.as_mut_ptr(), needed, &mut needed, &mut returned) == 0 {
        return Err(format!("PRINTER_ENUMERATION_FAILED: {}", std::io::Error::last_os_error()));
    }
    let items = std::slice::from_raw_parts(buffer.as_ptr() as *const PrinterInfo4W, returned as usize);
    let mut result = Vec::with_capacity(items.len());
    for item in items {
        let printer = from_wide_ptr(item.printer_name);
        let server = from_wide_ptr(item.server_name);
        if printer.trim().is_empty() { continue; }
        let mut name = wide(&printer);
        let mut handle: Handle = std::ptr::null_mut();
        let online = OpenPrinterW(name.as_mut_ptr(), &mut handle, std::ptr::null_mut()) != 0 && !handle.is_null();
        if online { ClosePrinter(handle); }
        result.push(json!({
            "name": printer,
            "server": server,
            "connection": if printer.starts_with("\\\\") { "network" } else { "windows-raw" },
            "online": online,
            "status": if online { "Connected" } else { "Offline" }
        }));
    }
    result.sort_by(|a,b| a["name"].as_str().unwrap_or("").to_ascii_lowercase().cmp(&b["name"].as_str().unwrap_or("").to_ascii_lowercase()));
    Ok(result)
}

#[tauri::command]
pub fn print_thermal(w: WebviewWindow, s: State<Mutex<AppState>>, printer: String, data: Vec<u8>) -> Result<Value, String> {
    let mut app = s.lock().map_err(|_| "PRINTER_LOCK_FAILED".to_string())?;
    ensure(&mut app, &w, Some(&["Admin","Owner","Manager","Cashier","Counter Person","Waiter","Kitchen Staff","Kitchen","Rider"]))?;

    // Backward-compatible discovery channel. This avoids requiring another
    // Tauri command registration and lets older renderer builds discover live
    // Windows printers after updating only the native module.
    if printer == "__DISCOVER__" {
        #[cfg(windows)]
        unsafe { return Ok(json!({"ok":true,"printers":enumerate_printers()?})); }
        #[cfg(not(windows))]
        { return Ok(json!({"ok":true,"printers":[]})); }
    }

    if printer.trim().is_empty() { return Err("PRINTER_NAME_REQUIRED".into()); }
    if data.is_empty() { return Err("PRINT_DATA_EMPTY".into()); }
    #[cfg(not(windows))]
    { let _ = (printer, data); return Err("WINDOWS_THERMAL_PRINT_ONLY".into()); }
    #[cfg(windows)]
    unsafe {
        let mut name = wide(&printer);
        let mut handle: Handle = std::ptr::null_mut();
        if OpenPrinterW(name.as_mut_ptr(), &mut handle, std::ptr::null_mut()) == 0 || handle.is_null() {
            return Err(format!("PRINTER_OPEN_FAILED: {}", std::io::Error::last_os_error()));
        }
        let doc = wide("MK FOODS POS Thermal Receipt");
        let dtype = wide("RAW");
        let mut info = DocInfo1 { doc_name: doc.as_ptr(), output_file: std::ptr::null(), data_type: dtype.as_ptr() };
        let started = StartDocPrinterW(handle, 1, &mut info);
        if started == 0 { ClosePrinter(handle); return Err(format!("PRINT_DOCUMENT_FAILED: {}", std::io::Error::last_os_error())); }
        if StartPagePrinter(handle) == 0 { EndDocPrinter(handle); ClosePrinter(handle); return Err(format!("PRINT_PAGE_FAILED: {}", std::io::Error::last_os_error())); }
        let mut written = 0u32;
        let ok = WritePrinter(handle, data.as_ptr() as *const c_void, data.len() as u32, &mut written);
        EndPagePrinter(handle);
        EndDocPrinter(handle);
        ClosePrinter(handle);
        if ok == 0 || written != data.len() as u32 { return Err(format!("PRINT_WRITE_FAILED: {}", std::io::Error::last_os_error())); }
        Ok(json!({"ok":true,"printer":printer,"bytes":written}))
    }
}
