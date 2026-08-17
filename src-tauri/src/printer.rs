use std::ffi::c_void;
use std::io::Write;
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::time::Duration;
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

#[cfg(windows)]
fn normalize_mac(value: &str) -> String {
    let hex: String = value.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if hex.len() != 12 { return String::new(); }
    hex.to_ascii_uppercase().as_bytes().chunks(2).map(|x| String::from_utf8_lossy(x).to_string()).collect::<Vec<_>>().join(":")
}

#[cfg(windows)]
fn bluetooth_mac_from_instance(instance: &str) -> String {
    let upper = instance.to_ascii_uppercase();
    for marker in ["DEV_", "ADDR_"] {
        if let Some(pos) = upper.find(marker) {
            let tail = &upper[pos + marker.len()..];
            let mac: String = tail.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
            let normalized = normalize_mac(&mac);
            if !normalized.is_empty() { return normalized; }
        }
    }
    String::new()
}

#[cfg(windows)]
fn likely_thermal_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    ["printer","pos","receipt","thermal","esc","epson","xprinter","rongta","zebra","bixolon","gprinter","goojprt","munbyn","sunmi"].iter().any(|x| n.contains(x))
}

#[cfg(windows)]
fn enumerate_bluetooth_devices() -> Result<Vec<Value>, String> {
    use std::process::Command;
    let script = r#"
$ErrorActionPreference='SilentlyContinue'
$rows=@()
$rows += @(Get-PnpDevice -PresentOnly | Where-Object {
  $_.FriendlyName -and ($_.InstanceId -like 'BTHENUM*' -or $_.Class -eq 'Bluetooth' -or $_.Class -eq 'Ports' -or $_.FriendlyName -match 'Bluetooth')
} | Select-Object @{N='FriendlyName';E={$_.FriendlyName}},Status,InstanceId,@{N='ClassName';E={$_.Class}})
$rows += @(Get-CimInstance Win32_PnPEntity | Where-Object {
  $_.Name -and ($_.PNPDeviceID -like 'BTHENUM*' -or $_.PNPClass -eq 'Ports')
} | Select-Object @{N='FriendlyName';E={$_.Name}},Status,@{N='InstanceId';E={$_.PNPDeviceID}},@{N='ClassName';E={$_.PNPClass}})
$ports=@(Get-CimInstance Win32_SerialPort | Where-Object {$_.DeviceID} | Select-Object DeviceID,Name,Status,PNPDeviceID)
[PSCustomObject]@{devices=$rows;ports=$ports} | ConvertTo-Json -Compress -Depth 5
"#;
    let out = Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-Command",script]).output()
        .map_err(|e| format!("BLUETOOTH_ENUMERATION_FAILED: {e}"))?;
    if !out.status.success() { return Err("BLUETOOTH_ENUMERATION_FAILED".into()); }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() { return Ok(Vec::new()); }
    let raw: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({"devices":[],"ports":[]}));
    let device_rows = raw["devices"].as_array().cloned().unwrap_or_default();
    let port_rows = raw["ports"].as_array().cloned().unwrap_or_default();
    let mut result: Vec<Value> = Vec::new();
    for x in device_rows {
        let instance = x["InstanceId"].as_str().unwrap_or("");
        let mac = bluetooth_mac_from_instance(instance);
        let status = x["Status"].as_str().unwrap_or("Unknown");
        let name = x["FriendlyName"].as_str().unwrap_or("Bluetooth device").trim();
        if name.is_empty() { continue; }
        let class_name = x["ClassName"].as_str().unwrap_or("");
        let duplicate = result.iter().any(|d| d["name"].as_str().unwrap_or("").eq_ignore_ascii_case(name) && d["mac"].as_str().unwrap_or("").eq_ignore_ascii_case(&mac));
        if duplicate { continue; }
        result.push(json!({"name":name,"status":status,"instanceId":instance,"mac":mac,"class":class_name,"connection":"bluetooth-pnp","discoveryMethod":"Windows PnP / BTHENUM","paired":true,"online":status.eq_ignore_ascii_case("OK"),"thermalCandidate":likely_thermal_name(name),"methods":["bluetooth-spp","windows-spooler","bluetooth-com"]}));
    }
    for p in port_rows {
        let port = p["DeviceID"].as_str().unwrap_or("").trim();
        let name = p["Name"].as_str().unwrap_or("Bluetooth serial port").trim();
        let pnp = p["PNPDeviceID"].as_str().unwrap_or("");
        if port.is_empty() || !port.to_ascii_uppercase().starts_with("COM") { continue; }
        let bluetooth = pnp.to_ascii_uppercase().contains("BTHENUM") || name.to_ascii_lowercase().contains("bluetooth");
        if !bluetooth { continue; }
        let mac = bluetooth_mac_from_instance(pnp);
        let duplicate = result.iter().any(|d| d["comPort"].as_str().unwrap_or("").eq_ignore_ascii_case(port));
        if duplicate { continue; }
        result.push(json!({"name":name,"status":p["Status"].as_str().unwrap_or("Unknown"),"instanceId":pnp,"mac":mac,"comPort":port,"connection":"bluetooth-com","discoveryMethod":"Windows Bluetooth SPP virtual COM port","paired":true,"online":p["Status"].as_str().unwrap_or("").eq_ignore_ascii_case("OK"),"thermalCandidate":likely_thermal_name(name),"methods":["bluetooth-com","windows-spooler","bluetooth-spp"]}));
    }
    result.sort_by(|a,b| {
        let aa = format!("{} {}",a["thermalCandidate"].as_bool().unwrap_or(false),a["name"].as_str().unwrap_or(""));
        let bb = format!("{} {}",b["thermalCandidate"].as_bool().unwrap_or(false),b["name"].as_str().unwrap_or(""));
        bb.to_ascii_lowercase().cmp(&aa.to_ascii_lowercase())
    });
    Ok(result)
}

#[cfg(windows)]
#[repr(C, packed(1))]
struct SockAddrBth { address_family:u16, bt_addr:u64, service_class_id:[u8;16], port:u32 }

#[cfg(windows)]
#[link(name = "ws2_32")]
extern "system" {
    fn WSAStartup(version:u16,data:*mut c_void)->i32;
    fn WSACleanup()->i32;
    fn socket(af:i32,kind:i32,protocol:i32)->usize;
    fn connect(socket:usize,name:*const c_void,namelen:i32)->i32;
    fn send(socket:usize,buffer:*const i8,len:i32,flags:i32)->i32;
    fn closesocket(socket:usize)->i32;
    fn WSAGetLastError()->i32;
}

#[cfg(windows)]
fn parse_bluetooth_mac(value:&str)->Result<u64,String>{let hex:String=value.chars().filter(|c|c.is_ascii_hexdigit()).collect();if hex.len()!=12{return Err("BLUETOOTH_MAC_REQUIRED".into())}u64::from_str_radix(&hex,16).map_err(|_|"BLUETOOTH_MAC_INVALID".into())}

#[cfg(windows)]
fn print_bluetooth_spp(mac:&str,data:&[u8])->Result<u32,String>{
    let bt_addr=parse_bluetooth_mac(mac)?;
    let mut wsa=[0u8;400];
    let startup=unsafe{WSAStartup(0x0202,wsa.as_mut_ptr() as *mut c_void)};
    if startup!=0{return Err(format!("BLUETOOTH_SOCKET_INIT_FAILED: {startup}"));}
    let spp_uuid:[u8;16]=[0x01,0x11,0x00,0x00,0x00,0x00,0x00,0x10,0x80,0x00,0x00,0x80,0x5f,0x9b,0x34,0xfb];
    let addr=SockAddrBth{address_family:32,bt_addr,service_class_id:spp_uuid,port:0};
    let mut last=String::new();
    for attempt in 1..=3 {
        let sock=unsafe{socket(32,1,3)};
        if sock==usize::MAX { last=format!("socket error {}",unsafe{WSAGetLastError()}); }
        else {
            let connected=unsafe{connect(sock,&addr as *const _ as *const c_void,std::mem::size_of::<SockAddrBth>() as i32)};
            if connected==0 {
                let mut sent=0usize; let mut failed=false;
                while sent<data.len() { let n=unsafe{send(sock,data[sent..].as_ptr() as *const i8,(data.len()-sent).min(i32::MAX as usize) as i32,0)}; if n<=0 { last=format!("write error {}",unsafe{WSAGetLastError()}); failed=true; break; } sent+=n as usize; }
                unsafe{closesocket(sock)};
                if !failed { unsafe{WSACleanup()}; return Ok(sent as u32); }
            } else { last=format!("connect error {}",unsafe{WSAGetLastError()}); unsafe{closesocket(sock)}; }
        }
        if attempt<3 { std::thread::sleep(std::time::Duration::from_millis(250)); }
    }
    unsafe{WSACleanup()}; Err(format!("BLUETOOTH_CONNECT_FAILED: {last}; tried 3 RFCOMM/SPP attempts"))
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn CreateFileW(name:*const u16,access:u32,share:u32,security:*mut c_void,creation:u32,flags:u32,template:Handle)->Handle;
    fn WriteFile(handle:Handle,buffer:*const c_void,count:u32,written:*mut u32,overlapped:*mut c_void)->i32;
    fn CloseHandle(handle:Handle)->i32;
}
#[cfg(windows)] const GENERIC_WRITE:u32=0x40000000;
#[cfg(windows)] const FILE_SHARE_READ:u32=0x00000001;
#[cfg(windows)] const FILE_SHARE_WRITE:u32=0x00000002;
#[cfg(windows)] const OPEN_EXISTING:u32=3;
#[cfg(windows)] const INVALID_HANDLE_VALUE:Handle=(-1isize) as Handle;

#[cfg(windows)]
fn print_bluetooth_com(port:&str,data:&[u8])->Result<u32,String>{
    let port=port.trim(); if !port.to_ascii_uppercase().starts_with("COM"){return Err("BLUETOOTH_COM_PORT_INVALID".into());}
    let name=wide(&format!(r"\\.\{}",port));
    let handle=unsafe{CreateFileW(name.as_ptr(),GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,std::ptr::null_mut(),OPEN_EXISTING,0,std::ptr::null_mut())};
    if handle.is_null()||handle==INVALID_HANDLE_VALUE{return Err(format!("BLUETOOTH_COM_OPEN_FAILED: {}",std::io::Error::last_os_error()));}
    let mut written=0u32; let ok=unsafe{WriteFile(handle,data.as_ptr() as *const c_void,data.len().try_into().map_err(|_|"PRINT_DATA_TOO_LARGE")?,&mut written,std::ptr::null_mut())}; unsafe{CloseHandle(handle)};
    if ok==0||written!=data.len() as u32{return Err(format!("BLUETOOTH_COM_WRITE_FAILED: {}",std::io::Error::last_os_error()));} Ok(written)
}

fn parse_network_target(target:&str)->Result<(String,u16),String>{
    let value=target.trim(); let (host,port)=if let Some((h,p))=value.rsplit_once(':'){if p.chars().all(|c|c.is_ascii_digit()){(h.to_string(),p.parse::<u16>().map_err(|_|"NETWORK_PORT_INVALID")?)}else{(value.to_string(),9100)}}else{(value.to_string(),9100)};
    if host.trim().is_empty(){return Err("NETWORK_HOST_REQUIRED".into())} Ok((host,port))
}
fn print_network_raw(target:&str,data:&[u8])->Result<u32,String>{
    if data.is_empty(){return Err("PRINT_DATA_EMPTY".into())} let (host,port)=parse_network_target(target)?; let mut addrs=(host.as_str(),port).to_socket_addrs().map_err(|e|format!("NETWORK_RESOLVE_FAILED: {e}"))?; let addr=addrs.next().ok_or_else(||"NETWORK_ADDRESS_NOT_FOUND".to_string())?; let mut last=String::new();
    for attempt in 1..=3 { match TcpStream::connect_timeout(&addr,Duration::from_secs(3)){Ok(mut stream)=>{let _=stream.set_write_timeout(Some(Duration::from_secs(5)));if let Err(e)=stream.write_all(data){last=format!("write error {e}")}else{let _=stream.shutdown(Shutdown::Both);return Ok(data.len() as u32)}},Err(e)=>last=format!("connect error {e}")} if attempt<3{std::thread::sleep(Duration::from_millis(200));} }
    Err(format!("NETWORK_PRINT_FAILED: {last}; tried 3 RAW/9100 attempts"))
}

#[tauri::command]
pub fn print_thermal(w: WebviewWindow, s: State<Mutex<AppState>>, printer: String, data: Vec<u8>) -> Result<Value, String> {
    let mut app=s.lock().map_err(|_|"PRINTER_LOCK_FAILED".to_string())?;
    ensure(&mut app,&w,Some(&["Admin","Owner","Manager","Cashier","Counter Person","Waiter","Kitchen Staff","Kitchen","Rider"]))?;
    drop(app);
    if printer=="__DISCOVER__"{#[cfg(windows)] unsafe{return Ok(json!({"ok":true,"printers":enumerate_printers()?}));}#[cfg(not(windows))]{return Ok(json!({"ok":true,"printers":[]}));}}
    if printer=="__BLUETOOTH_DISCOVER__"{#[cfg(windows)]{return Ok(json!({"ok":true,"devices":enumerate_bluetooth_devices()?}));}#[cfg(not(windows))]{return Ok(json!({"ok":true,"devices":[]}));}}
    if let Some(mac)=printer.strip_prefix("__BLUETOOTH_RAW__|"){if data.is_empty(){return Err("PRINT_DATA_EMPTY".into())}#[cfg(windows)]{let written=print_bluetooth_spp(mac,&data)?;return Ok(json!({"ok":true,"printer":mac,"connection":"bluetooth-spp","bytes":written}));}#[cfg(not(windows))]{let _=(mac,data);return Err("WINDOWS_BLUETOOTH_THERMAL_PRINT_ONLY".into());}}
    if let Some(port)=printer.strip_prefix("__BLUETOOTH_COM__|"){if data.is_empty(){return Err("PRINT_DATA_EMPTY".into())}#[cfg(windows)]{let written=print_bluetooth_com(port,&data)?;return Ok(json!({"ok":true,"printer":port,"connection":"bluetooth-com","bytes":written}));}#[cfg(not(windows))]{let _=(port,data);return Err("WINDOWS_BLUETOOTH_COM_THERMAL_PRINT_ONLY".into());}}
    if let Some(target)=printer.strip_prefix("__NETWORK_RAW__|"){let written=print_network_raw(target,&data)?;return Ok(json!({"ok":true,"printer":target,"connection":"network-raw","bytes":written}));}
    if printer.trim().is_empty(){return Err("PRINTER_NAME_REQUIRED".into())} if data.is_empty(){return Err("PRINT_DATA_EMPTY".into())}
    #[cfg(not(windows))]{let _=(printer,data);return Err("WINDOWS_THERMAL_PRINT_ONLY".into());}
    #[cfg(windows)] unsafe{
        let mut name=wide(&printer);let mut handle:Handle=std::ptr::null_mut();
        if OpenPrinterW(name.as_mut_ptr(),&mut handle,std::ptr::null_mut())==0||handle.is_null(){return Err(format!("PRINTER_OPEN_FAILED: {}",std::io::Error::last_os_error()));}
        let doc=wide("MK FOODS POS Thermal Receipt");let dtype=wide("RAW");let mut info=DocInfo1{doc_name:doc.as_ptr(),output_file:std::ptr::null(),data_type:dtype.as_ptr()};
        let started=StartDocPrinterW(handle,1,&mut info);if started==0{ClosePrinter(handle);return Err(format!("PRINT_DOCUMENT_FAILED: {}",std::io::Error::last_os_error()));}
        if StartPagePrinter(handle)==0{EndDocPrinter(handle);ClosePrinter(handle);return Err(format!("PRINT_PAGE_FAILED: {}",std::io::Error::last_os_error()));}
        let mut written=0u32;let ok=WritePrinter(handle,data.as_ptr() as *const c_void,data.len() as u32,&mut written);EndPagePrinter(handle);EndDocPrinter(handle);ClosePrinter(handle);
        if ok==0||written!=data.len() as u32{return Err(format!("PRINT_WRITE_FAILED: {}",std::io::Error::last_os_error()));}
        Ok(json!({"ok":true,"printer":printer,"bytes":written,"connection":"windows-raw"}))
    }
}
