use std::ffi::c_void;
use std::io::Write;
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{State, WebviewWindow};

use crate::{ensure, AppState};

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
type Handle = *mut c_void;

#[cfg(windows)]
const GENERIC_WRITE: u32 = 0x4000_0000;
#[cfg(windows)]
const FILE_SHARE_READ: u32 = 1;
#[cfg(windows)]
const FILE_SHARE_WRITE: u32 = 2;
#[cfg(windows)]
const OPEN_EXISTING: u32 = 3;
#[cfg(windows)]
const INVALID_HANDLE_VALUE: Handle = (-1isize) as Handle;
#[cfg(windows)]
const PRINTER_ENUM_LOCAL: u32 = 2;
#[cfg(windows)]
const PRINTER_ENUM_CONNECTIONS: u32 = 4;

#[cfg(windows)]
#[repr(C)]
struct DocInfo1 {
    doc_name: *const u16,
    output_file: *const u16,
    data_type: *const u16,
}

#[cfg(windows)]
#[repr(C)]
struct PrinterInfo4W {
    p_printer_name: *mut u16,
    p_server_name: *mut u16,
    attributes: u32,
}

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
    fn EnumPrintersW(
        flags: u32,
        name: *mut u16,
        level: u32,
        buffer: *mut u8,
        buffer_size: u32,
        needed: *mut u32,
        returned: *mut u32,
    ) -> i32;
}

#[cfg(windows)]
#[repr(C, packed(1))]
struct SockAddrBth {
    address_family: u16,
    bt_addr: u64,
    service_class_id: [u8; 16],
    port: u32,
}

#[cfg(windows)]
#[link(name = "ws2_32")]
extern "system" {
    fn WSAStartup(version: u16, data: *mut c_void) -> i32;
    fn WSACleanup() -> i32;
    fn socket(af: i32, kind: i32, protocol: i32) -> usize;
    fn connect(socket: usize, name: *const c_void, namelen: i32) -> i32;
    fn send(socket: usize, buffer: *const i8, len: i32, flags: i32) -> i32;
    fn closesocket(socket: usize) -> i32;
    fn WSAGetLastError() -> i32;
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn CreateFileW(
        name: *const u16,
        access: u32,
        share: u32,
        security: *mut c_void,
        creation: u32,
        flags: u32,
        template: Handle,
    ) -> Handle;
    fn WriteFile(
        handle: Handle,
        buffer: *const c_void,
        count: u32,
        written: *mut u32,
        overlapped: *mut c_void,
    ) -> i32;
    fn CloseHandle(handle: Handle) -> i32;
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
unsafe fn wide_ptr_string(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
}

#[cfg(windows)]
fn enumerate_windows_printers() -> Result<Vec<Value>, String> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0u32;
    let mut returned = 0u32;

    let probe = unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null_mut(),
            4,
            std::ptr::null_mut(),
            0,
            &mut needed,
            &mut returned,
        )
    };

    if probe != 0 || needed == 0 {
        return Ok(Vec::new());
    }

    let mut buffer = vec![0u8; needed as usize];
    let ok = unsafe {
        EnumPrintersW(
            flags,
            std::ptr::null_mut(),
            4,
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            &mut needed,
            &mut returned,
        )
    };

    if ok == 0 {
        return Err(format!(
            "PRINTER_ENUMERATION_FAILED: {}",
            std::io::Error::last_os_error()
        ));
    }

    let stride = std::mem::size_of::<PrinterInfo4W>();
    let mut printers = Vec::with_capacity(returned as usize);
    for index in 0..returned as usize {
        let ptr = unsafe { buffer.as_ptr().add(index * stride) as *const PrinterInfo4W };
        let info = unsafe { &*ptr };
        let name = unsafe { wide_ptr_string(info.p_printer_name) };
        if name.trim().is_empty() {
            continue;
        }
        printers.push(json!({
            "name": name,
            "default": false,
            "status": 0,
            "attributes": info.attributes,
            "connection": "windows-spooler",
            "discoveryMethod": "EnumPrintersW"
        }));
    }
    Ok(printers)
}

#[cfg(not(windows))]
fn enumerate_windows_printers() -> Result<Vec<Value>, String> {
    Ok(Vec::new())
}

#[cfg(windows)]
fn normalize_mac(value: &str) -> String {
    let hex: String = value.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if hex.len() != 12 {
        return String::new();
    }
    hex.to_ascii_uppercase()
        .as_bytes()
        .chunks(2)
        .map(|part| String::from_utf8_lossy(part).to_string())
        .collect::<Vec<_>>()
        .join(":")
}

#[cfg(windows)]
fn bluetooth_mac_from_instance(instance: &str) -> String {
    let upper = instance.to_ascii_uppercase();
    for marker in ["DEV_", "ADDR_"] {
        if let Some(position) = upper.find(marker) {
            let tail = &upper[position + marker.len()..];
            let hex: String = tail
                .chars()
                .take_while(|c| c.is_ascii_hexdigit())
                .collect();
            let mac = normalize_mac(&hex);
            if !mac.is_empty() {
                return mac;
            }
        }
    }
    String::new()
}

#[cfg(windows)]
fn likely_thermal_name(name: &str) -> bool {
    let value = name.to_ascii_lowercase();
    [
        "printer", "receipt", "thermal", "esc", "epson", "xprinter", "rongta", "zebra",
        "bixolon", "gprinter", "goojprt", "munbyn", "sunmi", "b11", "niimbot",
    ]
    .iter()
    .any(|term| value.contains(term))
}

#[cfg(windows)]
fn enumerate_bluetooth_devices() -> Result<Vec<Value>, String> {
    use std::process::Command;

    let script = r#"$ErrorActionPreference='SilentlyContinue';$rows=@();$rows+=@(Get-PnpDevice -PresentOnly|Where-Object{$_.FriendlyName -and ($_.InstanceId -like 'BTHENUM*' -or $_.Class -eq 'Bluetooth' -or $_.Class -eq 'Ports' -or $_.FriendlyName -match 'Bluetooth')}|Select-Object @{N='FriendlyName';E={$_.FriendlyName}},Status,InstanceId,@{N='ClassName';E={$_.Class}});$rows+=@(Get-CimInstance Win32_PnPEntity|Where-Object{$_.Name -and ($_.PNPDeviceID -like 'BTHENUM*' -or $_.PNPClass -eq 'Ports')}|Select-Object @{N='FriendlyName';E={$_.Name}},Status,@{N='InstanceId';E={$_.PNPDeviceID}},@{N='ClassName';E={$_.PNPClass}});$ports=@(Get-CimInstance Win32_SerialPort|Where-Object{$_.DeviceID}|Select-Object DeviceID,Name,Status,PNPDeviceID);[PSCustomObject]@{devices=$rows;ports=$ports}|ConvertTo-Json -Compress -Depth 5"#;

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .map_err(|e| format!("BLUETOOTH_ENUMERATION_FAILED: {e}"))?;

    if !output.status.success() {
        return Err("BLUETOOTH_ENUMERATION_FAILED".into());
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Ok(Vec::new());
    }

    let raw: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({
        "devices": [],
        "ports": []
    }));
    let devices = raw["devices"].as_array().cloned().unwrap_or_default();
    let ports = raw["ports"].as_array().cloned().unwrap_or_default();
    let mut result = Vec::new();

    for device in devices {
        let instance = device["InstanceId"].as_str().unwrap_or("");
        let mac = bluetooth_mac_from_instance(instance);
        let status = device["Status"].as_str().unwrap_or("Unknown");
        let name = device["FriendlyName"]
            .as_str()
            .unwrap_or("Bluetooth device")
            .trim();
        if name.is_empty() {
            continue;
        }
        if result.iter().any(|item: &Value| {
            item["name"].as_str().unwrap_or("").eq_ignore_ascii_case(name)
                && item["mac"].as_str().unwrap_or("").eq_ignore_ascii_case(&mac)
        }) {
            continue;
        }
        let mut methods = vec!["windows-spooler", "bluetooth-com", "bluetooth-spp"];
        if name.to_ascii_lowercase().starts_with("b11") {
            methods.push("bluetooth-niimbot-ble");
        }
        result.push(json!({
            "name": name,
            "status": status,
            "instanceId": instance,
            "mac": mac,
            "class": device["ClassName"].as_str().unwrap_or(""),
            "connection": "bluetooth-pnp",
            "discoveryMethod": "Windows PnP / BTHENUM",
            "paired": true,
            "online": status.eq_ignore_ascii_case("OK"),
            "thermalCandidate": likely_thermal_name(name),
            "methods": methods
        }));
    }

    for port in ports {
        let com = port["DeviceID"].as_str().unwrap_or("").trim();
        let name = port["Name"].as_str().unwrap_or("Bluetooth serial port").trim();
        let instance = port["PNPDeviceID"].as_str().unwrap_or("");
        if com.is_empty() || !com.to_ascii_uppercase().starts_with("COM") {
            continue;
        }
        if !instance.to_ascii_uppercase().contains("BTHENUM")
            && !name.to_ascii_lowercase().contains("bluetooth")
        {
            continue;
        }
        if result.iter().any(|item: &Value| {
            item["comPort"].as_str().unwrap_or("").eq_ignore_ascii_case(com)
        }) {
            continue;
        }
        let status = port["Status"].as_str().unwrap_or("Unknown");
        result.push(json!({
            "name": name,
            "status": status,
            "instanceId": instance,
            "mac": bluetooth_mac_from_instance(instance),
            "comPort": com,
            "connection": "bluetooth-com",
            "discoveryMethod": "Windows Bluetooth SPP virtual COM port",
            "paired": true,
            "online": status.eq_ignore_ascii_case("OK"),
            "thermalCandidate": likely_thermal_name(name),
            "methods": ["bluetooth-com", "windows-spooler", "bluetooth-spp"]
        }));
    }

    Ok(result)
}

#[cfg(not(windows))]
fn enumerate_bluetooth_devices() -> Result<Vec<Value>, String> {
    Ok(Vec::new())
}

#[cfg(windows)]
fn parse_bluetooth_mac(value: &str) -> Result<u64, String> {
    let hex: String = value.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if hex.len() != 12 {
        return Err("BLUETOOTH_MAC_REQUIRED".into());
    }
    u64::from_str_radix(&hex, 16).map_err(|_| "BLUETOOTH_MAC_INVALID".into())
}

#[cfg(windows)]
fn spp_uuid() -> [u8; 16] {
    [1, 17, 0, 0, 0, 0, 0, 16, 128, 0, 0, 128, 95, 155, 52, 251]
}

#[cfg(windows)]
fn send_bluetooth_socket(socket: usize, data: &[u8]) -> Result<u32, String> {
    let mut sent = 0usize;
    while sent < data.len() {
        let size = (data.len() - sent).min(i32::MAX as usize) as i32;
        let written = unsafe { send(socket, data[sent..].as_ptr() as *const i8, size, 0) };
        if written <= 0 {
            return Err(format!("write error {}", unsafe { WSAGetLastError() }));
        }
        sent += written as usize;
    }
    Ok(sent as u32)
}

#[cfg(windows)]
fn try_bluetooth_endpoint(
    bt: u64,
    uuid: [u8; 16],
    port: u32,
    data: &[u8],
) -> Result<u32, String> {
    let socket_handle = unsafe { socket(32, 1, 3) };
    if socket_handle == usize::MAX {
        return Err(format!("socket error {}", unsafe { WSAGetLastError() }));
    }
    let address = SockAddrBth {
        address_family: 32,
        bt_addr: bt,
        service_class_id: uuid,
        port,
    };
    let result = unsafe {
        connect(
            socket_handle,
            &address as *const _ as *const c_void,
            std::mem::size_of::<SockAddrBth>() as i32,
        )
    };
    if result != 0 {
        let error = unsafe { WSAGetLastError() };
        unsafe { closesocket(socket_handle) };
        return Err(format!("connect error {error}"));
    }
    let written = send_bluetooth_socket(socket_handle, data);
    unsafe { closesocket(socket_handle) };
    written
}

#[cfg(windows)]
fn print_bluetooth_spp(mac: &str, data: &[u8]) -> Result<u32, String> {
    let address = parse_bluetooth_mac(mac)?;
    let mut startup = [0u8; 400];
    let status = unsafe { WSAStartup(0x0202, startup.as_mut_ptr() as *mut c_void) };
    if status != 0 {
        return Err(format!("BLUETOOTH_SOCKET_INIT_FAILED: {status}"));
    }

    let mut errors = Vec::new();
    for attempt in 1..=3 {
        match try_bluetooth_endpoint(address, spp_uuid(), 0, data) {
            Ok(written) => {
                unsafe { WSACleanup() };
                return Ok(written);
            }
            Err(error) => errors.push(format!("attempt {attempt}: {error}")),
        }
        if attempt < 3 {
            std::thread::sleep(Duration::from_millis(300));
        }
    }
    unsafe { WSACleanup() };
    Err(format!(
        "BLUETOOTH_CONNECT_FAILED: {}; RFCOMM/SPP unavailable; use SPP COM, Windows Queue, or Niimbot BLE",
        errors.join("; ")
    ))
}

#[cfg(not(windows))]
fn print_bluetooth_spp(_: &str, _: &[u8]) -> Result<u32, String> {
    Err("BLUETOOTH_SPP_WINDOWS_ONLY".into())
}

#[cfg(windows)]
fn print_bluetooth_com(port: &str, data: &[u8]) -> Result<u32, String> {
    let port = port.trim();
    if !port.to_ascii_uppercase().starts_with("COM") {
        return Err("BLUETOOTH_COM_PORT_INVALID".into());
    }
    let name = wide(&format!(r"\\.\{}", port));
    let handle = unsafe {
        CreateFileW(
            name.as_ptr(),
            GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        )
    };
    if handle.is_null() || handle == INVALID_HANDLE_VALUE {
        return Err(format!(
            "BLUETOOTH_COM_OPEN_FAILED: {}",
            std::io::Error::last_os_error()
        ));
    }
    let count = u32::try_from(data.len()).map_err(|_| "PRINT_DATA_TOO_LARGE".to_string())?;
    let mut written = 0u32;
    let ok = unsafe {
        WriteFile(
            handle,
            data.as_ptr() as *const c_void,
            count,
            &mut written,
            std::ptr::null_mut(),
        )
    };
    unsafe { CloseHandle(handle) };
    if ok == 0 || written != count {
        return Err(format!(
            "BLUETOOTH_COM_WRITE_FAILED: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(written)
}

#[cfg(not(windows))]
fn print_bluetooth_com(_: &str, _: &[u8]) -> Result<u32, String> {
    Err("BLUETOOTH_COM_WINDOWS_ONLY".into())
}

#[cfg(windows)]
unsafe fn print_windows_raw(name: &str, data: &[u8]) -> Result<u32, String> {
    if data.is_empty() {
        return Err("PRINT_DATA_EMPTY".into());
    }
    let mut printer = wide(name);
    let mut handle: Handle = std::ptr::null_mut();
    if OpenPrinterW(printer.as_mut_ptr(), &mut handle, std::ptr::null_mut()) == 0
        || handle.is_null()
    {
        return Err(format!(
            "PRINTER_OPEN_FAILED: {}",
            std::io::Error::last_os_error()
        ));
    }

    let doc_name = wide("MK Foods POS Receipt");
    let data_type = wide("RAW");
    let mut doc = DocInfo1 {
        doc_name: doc_name.as_ptr(),
        output_file: std::ptr::null(),
        data_type: data_type.as_ptr(),
    };

    if StartDocPrinterW(handle, 1, &mut doc) == 0 {
        ClosePrinter(handle);
        return Err(format!(
            "PRINTER_START_DOC_FAILED: {}",
            std::io::Error::last_os_error()
        ));
    }
    if StartPagePrinter(handle) == 0 {
        EndDocPrinter(handle);
        ClosePrinter(handle);
        return Err(format!(
            "PRINTER_START_PAGE_FAILED: {}",
            std::io::Error::last_os_error()
        ));
    }

    let count = u32::try_from(data.len()).map_err(|_| "PRINT_DATA_TOO_LARGE".to_string())?;
    let mut written = 0u32;
    let ok = WritePrinter(
        handle,
        data.as_ptr() as *const c_void,
        count,
        &mut written,
    );
    EndPagePrinter(handle);
    EndDocPrinter(handle);
    ClosePrinter(handle);

    if ok == 0 || written != count {
        return Err(format!(
            "PRINTER_WRITE_FAILED: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(written)
}

#[cfg(not(windows))]
unsafe fn print_windows_raw(_: &str, _: &[u8]) -> Result<u32, String> {
    Err("WINDOWS_PRINTER_ONLY".into())
}

fn parse_network_target(target: &str) -> Result<(String, u16), String> {
    let value = target.trim();
    if value.is_empty() {
        return Err("NETWORK_HOST_REQUIRED".into());
    }
    if let Some((host, port)) = value.rsplit_once(':') {
        if port.chars().all(|c| c.is_ascii_digit()) {
            return Ok((
                host.to_string(),
                port.parse::<u16>().map_err(|_| "NETWORK_PORT_INVALID")?,
            ));
        }
    }
    Ok((value.to_string(), 9100))
}

fn print_network_raw(target: &str, data: &[u8]) -> Result<u32, String> {
    if data.is_empty() {
        return Err("PRINT_DATA_EMPTY".into());
    }
    let (host, port) = parse_network_target(target)?;
    let mut addresses = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|e| format!("NETWORK_RESOLVE_FAILED: {e}"))?;
    let address = addresses
        .next()
        .ok_or_else(|| "NETWORK_ADDRESS_NOT_FOUND".to_string())?;

    let mut last_error = String::new();
    for attempt in 1..=3 {
        match TcpStream::connect_timeout(&address, Duration::from_secs(3)) {
            Ok(mut stream) => {
                let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
                match stream.write_all(data) {
                    Ok(()) => {
                        let _ = stream.shutdown(Shutdown::Both);
                        return Ok(data.len() as u32);
                    }
                    Err(error) => last_error = format!("write error {error}"),
                }
            }
            Err(error) => last_error = format!("connect error {error}"),
        }
        if attempt < 3 {
            std::thread::sleep(Duration::from_millis(250));
        }
    }
    Err(format!(
        "NETWORK_PRINT_FAILED: {last_error}; tried 3 RAW/9100 attempts"
    ))
}

fn require_session(
    state: &State<Mutex<AppState>>,
    window: &WebviewWindow,
) -> Result<(), String> {
    let mut app = state
        .lock()
        .map_err(|_| "PRINTER_LOCK_FAILED".to_string())?;
    ensure(
        &mut app,
        window,
        Some(&[
            "Admin",
            "Owner",
            "Manager",
            "Cashier",
            "Counter Person",
            "Waiter",
            "Kitchen Staff",
            "Kitchen",
            "Rider",
        ]),
    )?;
    Ok(())
}

#[tauri::command]
pub fn discover_printers(
    window: WebviewWindow,
    state: State<Mutex<AppState>>,
) -> Result<Value, String> {
    let mut app = state
        .lock()
        .map_err(|_| "PRINTER_LOCK_FAILED".to_string())?;
    ensure(
        &mut app,
        &window,
        Some(&["Admin", "Owner", "Manager", "Cashier", "Counter Person"]),
    )?;
    drop(app);
    Ok(json!(enumerate_windows_printers()?))
}

#[tauri::command]
pub fn connect_printer(
    window: WebviewWindow,
    state: State<Mutex<AppState>>,
    name: String,
) -> Result<Value, String> {
    let mut app = state
        .lock()
        .map_err(|_| "PRINTER_LOCK_FAILED".to_string())?;
    ensure(
        &mut app,
        &window,
        Some(&["Admin", "Owner", "Manager", "Cashier", "Counter Person"]),
    )?;
    let printer_name = name.trim().to_string();
    if printer_name.is_empty() {
        return Err("PRINTER_NAME_REQUIRED".into());
    }
    app.db["settings"]["printerName"] = json!(printer_name.clone());
    app.db["settings"]["printerMac"] = Value::Null;
    app.db["settings"]["printerConnection"] = json!("windows-raw");
    crate::persist(&app)?;
    let _ = crate::audit(
        &mut app,
        "PRINTER_SELECTED",
        json!({"printerName": printer_name}),
    );
    Ok(json!({"ok": true, "printer": printer_name, "connection": "windows-raw"}))
}

#[tauri::command]
pub fn print_thermal(
    window: WebviewWindow,
    state: State<Mutex<AppState>>,
    printer: String,
    data: Vec<u8>,
) -> Result<Value, String> {
    require_session(&state, &window)?;

    if printer == "__BLUETOOTH_DISCOVER__" {
        return Ok(json!({"ok": true, "devices": enumerate_bluetooth_devices()?}));
    }
    if printer == "__DISCOVER__" {
        return Ok(json!({
            "ok": true,
            "printers": enumerate_windows_printers()?
        }));
    }
    if let Some((_, mac)) = printer.split_once("__BLUETOOTH_RAW__|") {
        let written = print_bluetooth_spp(mac, &data)?;
        return Ok(json!({"ok": true, "written": written, "route": "bluetooth-spp"}));
    }
    if let Some((_, com)) = printer.split_once("__BLUETOOTH_COM__|") {
        let written = print_bluetooth_com(com, &data)?;
        return Ok(json!({"ok": true, "written": written, "route": "bluetooth-com"}));
    }
    if let Some((_, target)) = printer.split_once("__NETWORK_RAW__|") {
        let written = print_network_raw(target, &data)?;
        return Ok(json!({"ok": true, "written": written, "route": "network-raw"}));
    }

    #[cfg(windows)]
    {
        let written = unsafe { print_windows_raw(&printer, &data)? };
        return Ok(json!({
            "ok": true,
            "written": written,
            "route": "windows-raw",
            "printer": printer
        }));
    }

    #[cfg(not(windows))]
    {
        let _ = printer;
        let _ = data;
        Err("WINDOWS_PRINTER_ONLY".into())
    }
}
