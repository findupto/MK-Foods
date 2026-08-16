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
#[repr(C)] struct DocInfo1 { doc_name: *const u16, output_file: *const u16, data_type: *const u16 }

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
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> { std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect() }

#[tauri::command]
pub fn print_thermal(w: WebviewWindow, s: State<Mutex<AppState>>, printer: String, data: Vec<u8>) -> Result<Value, String> {
    let mut app = s.lock().map_err(|_| "PRINTER_LOCK_FAILED".to_string())?;
    ensure(&mut app, &w, Some(&["Admin","Owner","Manager","Cashier","Counter Person","Waiter","Kitchen Staff","Kitchen","Rider"]))?;
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
