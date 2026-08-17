use std::ffi::c_void;
use std::io::Write;
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::time::Duration;
use serde_json::{json, Value};
use tauri::{State, WebviewWindow};
use crate::{ensure, AppState};
use std::sync::Mutex;

#[cfg(windows)] use std::os::windows::ffi::OsStrExt;
#[cfg(windows)] type Handle = *mut c_void;

#[cfg(windows)]
#[repr(C)] struct DocInfo1 { doc_name: *const u16, output_file: *const u16, data_type: *const u16 }
#[cfg(windows)]
#[repr(C)] struct PrinterInfo4W { printer_name: *const u16, server_name: *const u16, attributes: u32 }

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

#[cfg(windows)] const PRINTER_ENUM_LOCAL: u32 = 2;
#[cfg(windows)] const PRINTER_ENUM_CONNECTIONS: u32 = 4;
#[cfg(windows)] const GENERIC_WRITE: u32 = 0x40000000;
#[cfg(windows)] const FILE_SHARE_READ: u32 = 1;
#[cfg(windows)] const FILE_SHARE_WRITE: u32 = 2;
#[cfg(windows)] const OPEN_EXISTING: u32 = 3;
#[cfg(windows)] const INVALID_HANDLE_VALUE: Handle = (-1isize) as Handle;

#[cfg(windows)] fn wide(s: &str) -> Vec<u16> { std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect() }

#[cfg(windows)] #[allow(dead_code)] unsafe fn spooler_printer_count() -> Result<u32, String> {
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0u32; let mut returned = 0u32;
    let _ = EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut returned);
    if needed == 0 { return Ok(0); }
    let mut buffer = vec![0u8; needed as usize];
    if EnumPrintersW(flags, std::ptr::null(), 4, buffer.as_mut_ptr(), needed, &mut needed, &mut returned) == 0 {
        return Err(format!("PRINTER_ENUMERATION_FAILED: {}", std::io::Error::last_os_error()));
    }
    Ok(returned)
}

#[cfg(windows)] fn normalize_mac(v: &str) -> String { let h:String=v.chars().filter(|c|c.is_ascii_hexdigit()).collect(); if h.len()!=12{return String::new()} h.to_ascii_uppercase().as_bytes().chunks(2).map(|x|String::from_utf8_lossy(x).to_string()).collect::<Vec<_>>().join(":") }
#[cfg(windows)] fn bluetooth_mac_from_instance(i:&str)->String { let u=i.to_ascii_uppercase(); for marker in ["DEV_","ADDR_"] { if let Some(p)=u.find(marker) { let t=&u[p+marker.len()..]; let h:String=t.chars().take_while(|c|c.is_ascii_hexdigit()).collect(); let n=normalize_mac(&h); if !n.is_empty(){return n} } } String::new() }
#[cfg(windows)] fn likely_thermal_name(n:&str)->bool { let n=n.to_ascii_lowercase(); ["printer","receipt","thermal","esc","epson","xprinter","rongta","zebra","bixolon","gprinter","goojprt","munbyn","sunmi","b11","niimbot"].iter().any(|x|n.contains(x)) }

#[cfg(windows)] fn enumerate_bluetooth_devices()->Result<Vec<Value>,String>{
    use std::process::Command;
    let script=r#"$ErrorActionPreference='SilentlyContinue';$rows=@();$rows+=@(Get-PnpDevice -PresentOnly|Where-Object{$_.FriendlyName -and ($_.InstanceId -like 'BTHENUM*' -or $_.Class -eq 'Bluetooth' -or $_.Class -eq 'Ports' -or $_.FriendlyName -match 'Bluetooth')}|Select-Object @{N='FriendlyName';E={$_.FriendlyName}},Status,InstanceId,@{N='ClassName';E={$_.Class}});$rows+=@(Get-CimInstance Win32_PnPEntity|Where-Object{$_.Name -and ($_.PNPDeviceID -like 'BTHENUM*' -or $_.PNPClass -eq 'Ports')}|Select-Object @{N='FriendlyName';E={$_.Name}},Status,@{N='InstanceId';E={$_.PNPDeviceID}},@{N='ClassName';E={$_.PNPClass}});$ports=@(Get-CimInstance Win32_SerialPort|Where-Object{$_.DeviceID}|Select-Object DeviceID,Name,Status,PNPDeviceID);[PSCustomObject]@{devices=$rows;ports=$ports}|ConvertTo-Json -Compress -Depth 5"#;
    let out=Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-Command",script]).output().map_err(|e|format!("BLUETOOTH_ENUMERATION_FAILED: {e}"))?;
    if !out.status.success(){return Err("BLUETOOTH_ENUMERATION_FAILED".into())}
    let text=String::from_utf8_lossy(&out.stdout).trim().to_string(); if text.is_empty(){return Ok(Vec::new())}
    let raw:Value=serde_json::from_str(&text).unwrap_or_else(|_|json!({"devices":[],"ports":[]}));
    let ds=raw["devices"].as_array().cloned().unwrap_or_default(); let ps=raw["ports"].as_array().cloned().unwrap_or_default(); let mut r:Vec<Value>=Vec::new();
    for x in ds { let inst=x["InstanceId"].as_str().unwrap_or(""); let mac=bluetooth_mac_from_instance(inst); let status=x["Status"].as_str().unwrap_or("Unknown"); let name=x["FriendlyName"].as_str().unwrap_or("Bluetooth device").trim(); if name.is_empty(){continue} if r.iter().any(|d|d["name"].as_str().unwrap_or("").eq_ignore_ascii_case(name)&&d["mac"].as_str().unwrap_or("").eq_ignore_ascii_case(&mac)){continue} let mut methods=vec!["windows-spooler","bluetooth-com","bluetooth-spp"]; if name.to_ascii_lowercase().starts_with("b11"){methods.push("bluetooth-niimbot-ble")} r.push(json!({"name":name,"status":status,"instanceId":inst,"mac":mac,"class":x["ClassName"].as_str().unwrap_or(""),"connection":"bluetooth-pnp","discoveryMethod":"Windows PnP / BTHENUM","paired":true,"online":status.eq_ignore_ascii_case("OK"),"thermalCandidate":likely_thermal_name(name),"methods":methods})); }
    for p in ps { let port=p["DeviceID"].as_str().unwrap_or("").trim(); let name=p["Name"].as_str().unwrap_or("Bluetooth serial port").trim(); let pnp=p["PNPDeviceID"].as_str().unwrap_or(""); if port.is_empty()||!port.to_ascii_uppercase().starts_with("COM"){continue} if !pnp.to_ascii_uppercase().contains("BTHENUM")&&!name.to_ascii_lowercase().contains("bluetooth"){continue} if r.iter().any(|d|d["comPort"].as_str().unwrap_or("").eq_ignore_ascii_case(port)){continue} r.push(json!({"name":name,"status":p["Status"].as_str().unwrap_or("Unknown"),"instanceId":pnp,"mac":bluetooth_mac_from_instance(pnp),"comPort":port,"connection":"bluetooth-com","discoveryMethod":"Windows Bluetooth SPP virtual COM port","paired":true,"online":p["Status"].as_str().unwrap_or("").eq_ignore_ascii_case("OK"),"thermalCandidate":likely_thermal_name(name),"methods":["bluetooth-com","windows-spooler","bluetooth-spp"]})); }
    Ok(r)
}
#[cfg(not(windows))] fn enumerate_bluetooth_devices()->Result<Vec<Value>,String>{Ok(Vec::new())}

#[cfg(windows)] #[repr(C,packed(1))] struct SockAddrBth{address_family:u16,bt_addr:u64,service_class_id:[u8;16],port:u32}
#[cfg(windows)] #[link(name="ws2_32")] extern "system"{fn WSAStartup(version:u16,data:*mut c_void)->i32;fn WSACleanup()->i32;fn socket(af:i32,kind:i32,protocol:i32)->usize;fn connect(socket:usize,name:*const c_void,namelen:i32)->i32;fn send(socket:usize,buffer:*const i8,len:i32,flags:i32)->i32;fn closesocket(socket:usize)->i32;fn WSAGetLastError()->i32;}
#[cfg(windows)] fn parse_bluetooth_mac(v:&str)->Result<u64,String>{let h:String=v.chars().filter(|c|c.is_ascii_hexdigit()).collect();if h.len()!=12{return Err("BLUETOOTH_MAC_REQUIRED".into())}u64::from_str_radix(&h,16).map_err(|_|"BLUETOOTH_MAC_INVALID".into())}
#[cfg(windows)] fn spp_uuid()->[u8;16]{[1,17,0,0,0,0,0,16,128,0,0,128,95,155,52,251]}
#[cfg(windows)] fn send_bluetooth_socket(sock:usize,data:&[u8])->Result<u32,String>{let mut sent=0usize;while sent<data.len(){let n=unsafe{send(sock,data[sent..].as_ptr() as *const i8,(data.len()-sent).min(i32::MAX as usize) as i32,0)};if n<=0{return Err(format!("write error {}",unsafe{WSAGetLastError()}))}sent+=n as usize}Ok(sent as u32)}
#[cfg(windows)] fn try_bluetooth_endpoint(bt:u64,uuid:[u8;16],port:u32,data:&[u8])->Result<u32,String>{let sock=unsafe{socket(32,1,3)};if sock==usize::MAX{return Err(format!("socket error {}",unsafe{WSAGetLastError()}))}let addr=SockAddrBth{address_family:32,bt_addr:bt,service_class_id:uuid,port};let rc=unsafe{connect(sock,&addr as *const _ as *const c_void,std::mem::size_of::<SockAddrBth>() as i32)};if rc!=0{let e=unsafe{WSAGetLastError()};unsafe{closesocket(sock)};return Err(format!("connect error {e}"))}let result=send_bluetooth_socket(sock,data);unsafe{closesocket(sock)};result}
#[cfg(windows)] fn print_bluetooth_spp(mac:&str,data:&[u8])->Result<u32,String>{let bt=parse_bluetooth_mac(mac)?;let mut w=[0u8;400];let st=unsafe{WSAStartup(0x0202,w.as_mut_ptr() as *mut c_void)};if st!=0{return Err(format!("BLUETOOTH_SOCKET_INIT_FAILED: {st}"))}let mut errors=Vec::new();for attempt in 1..=3{match try_bluetooth_endpoint(bt,spp_uuid(),0,data){Ok(n)=>{unsafe{WSACleanup()};return Ok(n)}Err(e)=>errors.push(format!("attempt {attempt}: {e}"))}if attempt<3{std::thread::sleep(Duration::from_millis(300))}}unsafe{WSACleanup()};Err(format!("BLUETOOTH_CONNECT_FAILED: {}; RFCOMM/SPP unavailable; use SPP COM, Windows Queue, or the Niimbot BLE transport for BLE-only printers",errors.join("; ")))}
#[cfg(not(windows))] fn print_bluetooth_spp(_: &str, _: &[u8])->Result<u32,String>{Err("BLUETOOTH_SPP_WINDOWS_ONLY".into())}

#[cfg(windows)] #[link(name="kernel32")] extern "system"{fn CreateFileW(name:*const u16,access:u32,share:u32,security:*mut c_void,creation:u32,flags:u32,template:Handle)->Handle;fn WriteFile(handle:Handle,buffer:*const c_void,count:u32,written:*mut u32,overlapped:*mut c_void)->i32;fn CloseHandle(handle:Handle)->i32;}
#[cfg(windows)] fn print_bluetooth_com(port:&str,data:&[u8])->Result<u32,String>{let p=port.trim();if !p.to_ascii_uppercase().starts_with("COM"){return Err("BLUETOOTH_COM_PORT_INVALID".into())}let n=wide(&format!(r"\\.\{}",p));let h=unsafe{CreateFileW(n.as_ptr(),GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,std::ptr::null_mut(),OPEN_EXISTING,0,std::ptr::null_mut())};if h.is_null()||h==INVALID_HANDLE_VALUE{return Err(format!("BLUETOOTH_COM_OPEN_FAILED: {}",std::io::Error::last_os_error()))}let mut wr=0u32;let count=u32::try_from(data.len()).map_err(|_|"PRINT_DATA_TOO_LARGE".to_string())?;let ok=unsafe{WriteFile(h,data.as_ptr() as *const c_void,count,&mut wr,std::ptr::null_mut())};unsafe{CloseHandle(h)};if ok==0||wr!=count{return Err(format!("BLUETOOTH_COM_WRITE_FAILED: {}",std::io::Error::last_os_error()))}Ok(wr)}
#[cfg(not(windows))] fn print_bluetooth_com(_: &str, _: &[u8])->Result<u32,String>{Err("BLUETOOTH_COM_WINDOWS_ONLY".into())}

#[cfg(windows)] unsafe fn print_windows_raw(name:&str,data:&[u8])->Result<u32,String>{if data.is_empty(){return Err("PRINT_DATA_EMPTY".into())}let mut printer=wide(name);let mut handle:Handle=std::ptr::null_mut();if OpenPrinterW(printer.as_mut_ptr(),&mut handle,std::ptr::null_mut())==0||handle.is_null(){return Err(format!("PRINTER_OPEN_FAILED: {}",std::io::Error::last_os_error()))}let doc_name=wide("MK Foods POS Receipt");let data_type=wide("RAW");let mut doc=DocInfo1{doc_name:doc_name.as_ptr(),output_file:std::ptr::null(),data_type:data_type.as_ptr()};if StartDocPrinterW(handle,1,&mut doc)==0{ClosePrinter(handle);return Err(format!("PRINTER_START_DOC_FAILED: {}",std::io::Error::last_os_error()))}if StartPagePrinter(handle)==0{EndDocPrinter(handle);ClosePrinter(handle);return Err(format!("PRINTER_START_PAGE_FAILED: {}",std::io::Error::last_os_error()))}let mut written=0u32;let count=u32::try_from(data.len()).map_err(|_|"PRINT_DATA_TOO_LARGE".to_string())?;let ok=WritePrinter(handle,data.as_ptr() as *const c_void,count,&mut written);EndPagePrinter(handle);EndDocPrinter(handle);ClosePrinter(handle);if ok==0||written!=count{return Err(format!("PRINTER_WRITE_FAILED: {}",std::io::Error::last_os_error()))}Ok(written)}
#[cfg(not(windows))] unsafe fn print_windows_raw(_: &str,_:&[u8])->Result<u32,String>{Err("WINDOWS_PRINTER_ONLY".into())}

fn parse_network_target(target:&str)->Result<(String,u16),String>{let v=target.trim();if v.is_empty(){return Err("NETWORK_HOST_REQUIRED".into())}if let Some((h,p))=v.rsplit_once(':'){if p.chars().all(|c|c.is_ascii_digit()){return Ok((h.to_string(),p.parse::<u16>().map_err(|_|"NETWORK_PORT_INVALID")?))}}Ok((v.to_string(),9100))}
fn print_network_raw(target:&str,data:&[u8])->Result<u32,String>{if data.is_empty(){return Err("PRINT_DATA_EMPTY".into())}let(h,p)=parse_network_target(target)?;let mut a=(h.as_str(),p).to_socket_addrs().map_err(|e|format!("NETWORK_RESOLVE_FAILED: {e}"))?;let addr=a.next().ok_or_else(||"NETWORK_ADDRESS_NOT_FOUND".to_string())?;let mut last=String::new();for attempt in 1..=3{match TcpStream::connect_timeout(&addr,Duration::from_secs(3)){Ok(mut s)=>{let _=s.set_write_timeout(Some(Duration::from_secs(5)));match s.write_all(data){Ok(())=>{let _=s.shutdown(Shutdown::Both);return Ok(data.len() as u32)}Err(e)=>last=format!("write error {e}")}},Err(e)=>last=format!("connect error {e}")}if attempt<3{std::thread::sleep(Duration::from_millis(250))}}Err(format!("NETWORK_PRINT_FAILED: {last}; tried 3 RAW/9100 attempts"))}

fn require_session(state:&State<Mutex<AppState>>,window:&WebviewWindow)->Result<(),String>{let mut app=state.lock().map_err(|_|"PRINTER_LOCK_FAILED".to_string())?;ensure(&mut app,window,Some(&["Admin","Owner","Manager","Cashier","Counter Person","Waiter","Kitchen Staff","Kitchen","Rider"]))?;Ok(())}

#[tauri::command]
pub fn print_thermal(window:WebviewWindow,state:State<Mutex<AppState>>,printer:String,data:Vec<u8>)->Result<Value,String>{
    require_session(&state,&window)?;
    if printer=="__BLUETOOTH_DISCOVER__" { return Ok(json!({"ok":true,"devices":enumerate_bluetooth_devices()?})); }
    if printer=="__DISCOVER__" { return Ok(json!({"ok":true,"printers":[]})); }
    if printer.starts_with("__BLUETOOTH_RAW__|") { let mac=printer.split_once('|').map(|(_,v)|v).unwrap_or(""); let written=print_bluetooth_spp(mac,&data)?; return Ok(json!({"ok":true,"written":written,"route":"bluetooth-spp"})); }
    if printer.starts_with("__BLUETOOTH_COM__|") { let com=printer.split_once('|').map(|(_,v)|v).unwrap_or(""); let written=print_bluetooth_com(com,&data)?; return Ok(json!({"ok":true,"written":written,"route":"bluetooth-com"})); }
    if printer.starts_with("__NETWORK_RAW__|") { let target=printer.split_once('|').map(|(_,v)|v).unwrap_or(""); let written=print_network_raw(target,&data)?; return Ok(json!({"ok":true,"written":written,"route":"network-raw"})); }
    #[cfg(windows)] { let written=unsafe{print_windows_raw(&printer,&data)?}; return Ok(json!({"ok":true,"written":written,"route":"windows-raw","printer":printer})); }
    #[cfg(not(windows))] { Err("WINDOWS_PRINTER_ONLY".into()) }
}

// The application keeps the Windows spooler commands in main.rs for backwards
// compatibility with the existing renderer contract. Tauri's generate_handler!
// resolves the generated command glue relative to the path used in the macro.
// Re-export both the command and its generated glue so the existing
// `printer::discover_printers` / `printer::connect_printer` registrations remain
// valid without creating duplicate command implementations or invoke names.
pub(crate) use crate::discover_printers;
pub(crate) use crate::connect_printer;
pub(crate) use crate::__cmd__discover_printers;
pub(crate) use crate::__cmd__connect_printer;
pub(crate) use crate::__tauri_command_name_discover_printers;
pub(crate) use crate::__tauri_command_name_connect_printer;
