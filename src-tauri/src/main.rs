use std::{collections::HashMap, fs, path::PathBuf, process::Command, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use pbkdf2::pbkdf2_hmac;
use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tauri::{Manager, State, WebviewWindow};

const ITER: u32 = 210_000;
const SESSION_MS: u128 = 30 * 60 * 1000;

struct Session { user: Value, last_activity: u128 }
struct AppState { file: PathBuf, db: Value, sessions: HashMap<String, Session> }

fn now_ms() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() }

fn persist(s: &AppState) -> Result<(), String> {
    if let Some(parent) = s.file.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let text = serde_json::to_string_pretty(&s.db).map_err(|e| e.to_string())?;
    fs::write(&s.file, text).map_err(|e| e.to_string())
}

fn make_hash(secret: &str) -> String {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(secret.as_bytes(), &salt, ITER, &mut key);
    format!("pbkdf2${}${}${}", ITER, hex::encode(salt), hex::encode(key))
}

fn verify_hash(secret: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.split('$').collect();
    if parts.len() != 4 || parts[0] != "pbkdf2" { return false; }
    let iterations = parts[1].parse::<u32>().unwrap_or(0);
    let salt = match hex::decode(parts[2]) { Ok(v) => v, Err(_) => return false };
    let expected = match hex::decode(parts[3]) { Ok(v) => v, Err(_) => return false };
    let mut actual = vec![0u8; expected.len()];
    pbkdf2_hmac::<Sha256>(secret.as_bytes(), &salt, iterations, &mut actual);
    actual.as_slice().ct_eq(expected.as_slice()).into()
}

fn seed() -> Value {
    let user = |username: &str, role: &str| json!({
        "username": username, "role": role, "passwordHash": make_hash("0099"),
        "pinHash": make_hash("0099"), "failedAttempts": 0, "lockedUntil": null,
        "passwordChangedAt": null
    });
    json!({
        "version": 3, "authVersion": 2,
        "users": [user("admin","Admin"), user("owner","Owner"), user("cashier","Cashier"), user("accountant","Accountant")],
        "products": [
            {"id":"p1","name":"Chicken Pizza","category":"Pizza","price":850,"available":true},
            {"id":"p2","name":"Cheese Pizza","category":"Pizza","price":750,"available":true},
            {"id":"p3","name":"Zinger Burger","category":"Burgers","price":550,"available":true},
            {"id":"p4","name":"Fries","category":"Sides","price":220,"available":true},
            {"id":"p5","name":"Soft Drink","category":"Drinks","price":120,"available":true},
            {"id":"p6","name":"Ice Cream","category":"Desserts","price":250,"available":true}
        ],
        "orders": [], "customers": [], "riders": [], "staff": [],
        "tables": [
            {"id":"T1","name":"T1","capacity":4,"status":"Open"},
            {"id":"T2","name":"T2","capacity":4,"status":"Open"},
            {"id":"T3","name":"T3","capacity":4,"status":"Open"},
            {"id":"T4","name":"T4","capacity":4,"status":"Open"}
        ],
        "kitchenTickets": [], "audit": [],
        "settings": {
            "business":"MK Pizza & Ice Bar","address":"Collage Road Abbas Chowk, Bhakkar, Pakistan",
            "phone":"0316 9700025","currency":"Rs.","tax":0,"printerMac":"","printerName":""
        }
    })
}

fn array_mut<'a>(db: &'a mut Value, key: &str) -> &'a mut Vec<Value> {
    db[key].as_array_mut().expect("database array missing")
}

fn user_view(user: &Value) -> Value { json!({"username": user["username"], "role": user["role"]}) }

fn audit(s: &mut AppState, action: &str, data: Value) -> Result<(), String> {
    let mut event = json!({"at": chrono::Utc::now().to_rfc3339(), "action": action});
    if let (Some(dst), Some(src)) = (event.as_object_mut(), data.as_object()) {
        for (k, v) in src { dst.insert(k.clone(), v.clone()); }
    }
    array_mut(&mut s.db, "audit").push(event);
    persist(s)
}

fn find_user<'a>(db: &'a mut Value, username: &str) -> Option<&'a mut Value> {
    db["users"].as_array_mut()?.iter_mut()
        .find(|u| u["username"].as_str().unwrap_or("").eq_ignore_ascii_case(username.trim()))
}

fn session_user(s: &mut AppState, w: &WebviewWindow) -> Result<Value, String> {
    let label = w.label().to_string();
    let expired = match s.sessions.get(&label) {
        Some(session) => now_ms().saturating_sub(session.last_activity) > SESSION_MS,
        None => true
    };
    if expired { s.sessions.remove(&label); return Err("UNAUTHENTICATED".into()); }
    if let Some(session) = s.sessions.get_mut(&label) {
        session.last_activity = now_ms();
        return Ok(session.user.clone());
    }
    Err("UNAUTHENTICATED".into())
}

fn ensure(s: &mut AppState, w: &WebviewWindow, roles: Option<&[&str]>) -> Result<Value, String> {
    let user = session_user(s, w)?;
    if let Some(allowed) = roles {
        let role = user["role"].as_str().unwrap_or("");
        if !allowed.contains(&role) { return Err("FORBIDDEN".into()); }
    }
    Ok(user)
}

fn migrate(db: &mut Value) {
    if let Some(users) = db["users"].as_array_mut() {
        for user in users {
            let hash = user["passwordHash"].as_str().unwrap_or("");
            if !hash.starts_with("pbkdf2$") {
                user["passwordHash"] = Value::String(make_hash("0099"));
                user["passwordChangedAt"] = Value::Null;
            }
            if user["failedAttempts"].is_null() { user["failedAttempts"] = json!(0); }
            if user["lockedUntil"].is_null() { user["lockedUntil"] = Value::Null; }
            if user["pinHash"].is_null() { user["pinHash"] = Value::Null; }
        }
    }
    db["authVersion"] = json!(2);
}

fn load_state(file: PathBuf) -> AppState {
    let mut db = fs::read_to_string(&file)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .unwrap_or_else(seed);
    migrate(&mut db);
    let state = AppState { file, db, sessions: HashMap::new() };
    let _ = persist(&state);
    state
}

fn authenticate(s: &mut AppState, w: &WebviewWindow, username: &str, secret: &str, pin: bool) -> Result<Value, String> {
    let uname = username.trim().to_lowercase();
    let (valid, locked, retry_at, user_viewed, must_change) = {
        let user = find_user(&mut s.db, &uname).ok_or("INVALID")?;
        let locked = user["lockedUntil"].as_str()
            .and_then(|x| chrono::DateTime::parse_from_rfc3339(x).ok())
            .map(|d| d.timestamp_millis() as u128 > now_ms()).unwrap_or(false);
        let retry = user["lockedUntil"].clone();
        let field = if pin { "pinHash" } else { "passwordHash" };
        let hash = user[field].as_str().unwrap_or("").to_string();
        (verify_hash(secret, &hash), locked, retry, user_view(user), user["passwordChangedAt"].is_null())
    };
    if locked { return Ok(json!({"ok":false,"reason":"LOCKED","retryAt":retry_at})); }
    if !valid {
        let mut locked_now = false;
        if let Some(user) = find_user(&mut s.db, &uname) {
            let attempts = user["failedAttempts"].as_u64().unwrap_or(0) + 1;
            if attempts >= 5 {
                user["failedAttempts"] = json!(0);
                user["lockedUntil"] = json!((chrono::Utc::now() + chrono::Duration::minutes(15)).to_rfc3339());
                locked_now = true;
            } else { user["failedAttempts"] = json!(attempts); }
        }
        if locked_now { audit(s, "ACCOUNT_LOCKED", json!({"username":uname}))?; } else { persist(s)?; }
        return Ok(json!({"ok":false,"reason":"INVALID"}));
    }
    if let Some(user) = find_user(&mut s.db, &uname) { user["failedAttempts"] = json!(0); user["lockedUntil"] = Value::Null; }
    audit(s, "LOGIN", json!({"username":uname,"method":if pin {"pin"} else {"password"}}))?;
    s.sessions.insert(w.label().to_string(), Session { user:user_viewed.clone(), last_activity:now_ms() });
    let token = format!("{:x}", Sha256::digest(format!("{}{}", w.label(), now_ms()).as_bytes()));
    Ok(json!({"ok":true,"user":user_viewed,"mustChange":must_change,"token":token}))
}

#[tauri::command] fn app_info(s: State<Mutex<AppState>>) -> Result<Value,String> { let state=s.lock().unwrap(); Ok(json!({"name":"MK Foods POS","business":state.db["settings"]["business"],"mode":"offline-first","version":env!("CARGO_PKG_VERSION")})) }
#[tauri::command] fn login(w:WebviewWindow,s:State<Mutex<AppState>>,u:String,p:String)->Result<Value,String>{authenticate(&mut s.lock().unwrap(),&w,&u,&p,false)}
#[tauri::command] fn pin_login(w:WebviewWindow,s:State<Mutex<AppState>>,u:String,p:String)->Result<Value,String>{authenticate(&mut s.lock().unwrap(),&w,&u,&p,true)}
#[tauri::command] fn logout(w:WebviewWindow,s:State<Mutex<AppState>>)->Result<Value,String>{s.lock().unwrap().sessions.remove(w.label());Ok(json!({"ok":true}))}
#[tauri::command] fn session(w:WebviewWindow,s:State<Mutex<AppState>>)->Result<Value,String>{let mut state=s.lock().unwrap();match session_user(&mut state,&w){Ok(user)=>{let remaining=state.sessions.get(w.label()).map(|x|SESSION_MS.saturating_sub(now_ms().saturating_sub(x.last_activity))).unwrap_or(0);Ok(json!({"ok":true,"user":user,"expiresIn":remaining}))},Err(reason)=>Ok(json!({"ok":false,"reason":reason}))}}
#[tauri::command] fn snapshot(w:WebviewWindow,s:State<Mutex<AppState>>)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,None)?;Ok(state.db.clone())}
#[tauri::command] fn change_password(w:WebviewWindow,s:State<Mutex<AppState>>,current:String,next:String)->Result<Value,String>{let mut state=s.lock().unwrap();let user=ensure(&mut state,&w,None)?;if next.len()<8{return Ok(json!({"ok":false,"reason":"WEAK"}))};let username=user["username"].as_str().unwrap_or("").to_string();let valid=find_user(&mut state.db,&username).map(|u|verify_hash(&current,u["passwordHash"].as_str().unwrap_or(""))).unwrap_or(false);if !valid{return Ok(json!({"ok":false,"reason":"INVALID"}))};if let Some(u)=find_user(&mut state.db,&username){u["passwordHash"]=json!(make_hash(&next));u["passwordChangedAt"]=json!(chrono::Utc::now().to_rfc3339());u["failedAttempts"]=json!(0);u["lockedUntil"]=Value::Null;}audit(&mut state,"PASSWORD_CHANGED",json!({"username":username}))?;Ok(json!({"ok":true}))}
#[tauri::command] fn reset_password(w:WebviewWindow,s:State<Mutex<AppState>>,target:String,temp:String)->Result<Value,String>{let mut state=s.lock().unwrap();let admin=ensure(&mut state,&w,Some(&["Admin","Owner"]))?;if temp.len()<8{return Ok(json!({"ok":false,"reason":"WEAK"}))};if find_user(&mut state.db,&target).is_none(){return Ok(json!({"ok":false,"reason":"DENIED"}))};if let Some(u)=find_user(&mut state.db,&target){u["passwordHash"]=json!(make_hash(&temp));u["passwordChangedAt"]=Value::Null;u["failedAttempts"]=json!(0);u["lockedUntil"]=Value::Null;}audit(&mut state,"PASSWORD_RESET",json!({"admin":admin["username"],"username":target}))?;Ok(json!({"ok":true}))}
#[tauri::command] fn create_order(w:WebviewWindow,s:State<Mutex<AppState>>,order:Value)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,None)?;let id=order["id"].as_str().unwrap_or("").to_string();array_mut(&mut state.db,"orders").push(order.clone());array_mut(&mut state.db,"kitchenTickets").push(json!({"id":format!("K-{}",id),"orderId":id,"status":"new","createdAt":order["createdAt"],"items":order["items"]}));audit(&mut state,"ORDER_CREATED",json!({"id":id}))?;Ok(order)}
#[tauri::command] fn order_status(w:WebviewWindow,s:State<Mutex<AppState>>,id:String,status:String)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner","Cashier"]))?;let mut found=false;for o in array_mut(&mut state.db,"orders"){if o["id"].as_str()==Some(&id){o["status"]=json!(status);found=true;break}}if !found{return Ok(json!(false))};let kitchen_status=if status=="completed"{"done".to_string()}else{status.clone()};for k in array_mut(&mut state.db,"kitchenTickets"){if k["orderId"].as_str()==Some(&id){k["status"]=json!(kitchen_status)}}audit(&mut state,"ORDER_STATUS",json!({"id":id,"status":status}))?;Ok(json!(true))}
#[tauri::command] fn assign_order(w:WebviewWindow,s:State<Mutex<AppState>>,id:String,rider:String)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner","Cashier"]))?;let mut found=false;for o in array_mut(&mut state.db,"orders"){if o["id"].as_str()==Some(&id){o["riderId"]=json!(rider);o["status"]=json!("dispatched");found=true;break}}for r in array_mut(&mut state.db,"riders"){if r["id"].as_str()==Some(&rider){r["status"]=json!("Assigned")}}if !found{return Err("Order or rider not found".into())};audit(&mut state,"ORDER_DISPATCHED",json!({"orderId":id,"riderId":rider}))?;Ok(json!(true))}
#[tauri::command] fn update_table(w:WebviewWindow,s:State<Mutex<AppState>>,id:String,status:String)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner","Cashier"]))?;let mut updated=None;for t in array_mut(&mut state.db,"tables"){if t["id"].as_str()==Some(&id){t["status"]=json!(status);updated=Some(t.clone());break}}if let Some(t)=updated{audit(&mut state,"TABLE_STATUS",json!({"id":id,"status":status}))?;Ok(t)}else{Ok(json!(false))}}
#[tauri::command] fn add_customer(w:WebviewWindow,s:State<Mutex<AppState>>,c:Value)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,None)?;let id=c["id"].as_str().map(str::to_string).unwrap_or_else(||format!("c-{}",now_ms()));let x=json!({"id":id,"name":c["name"],"phone":c["phone"].as_str().unwrap_or(""),"email":c["email"].as_str().unwrap_or(""),"birthday":c["birthday"].as_str().unwrap_or(""),"points":c["points"].as_f64().unwrap_or(0.0)});array_mut(&mut state.db,"customers").push(x.clone());audit(&mut state,"CUSTOMER_CREATED",json!({"id":id}))?;Ok(x)}
#[tauri::command] fn add_rider(w:WebviewWindow,s:State<Mutex<AppState>>,r:Value)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner"]))?;let id=r["id"].as_str().map(str::to_string).unwrap_or_else(||format!("r-{}",now_ms()));let x=json!({"id":id,"name":r["name"],"phone":r["phone"].as_str().unwrap_or(""),"zone":r["zone"].as_str().unwrap_or(""),"status":r["status"].as_str().unwrap_or("Available"),"cod":0});array_mut(&mut state.db,"riders").push(x.clone());audit(&mut state,"RIDER_CREATED",json!({"id":id}))?;Ok(x)}
#[tauri::command] fn save_product(w:WebviewWindow,s:State<Mutex<AppState>>,p:Value)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner"]))?;let id=p["id"].as_str().filter(|x|!x.is_empty()).map(str::to_string).unwrap_or_else(||format!("p-{}",now_ms()));let name=p["name"].as_str().unwrap_or("").trim().to_string();if name.is_empty(){return Err("Product name is required".into())};let x=json!({"id":id,"name":name,"category":p["category"].as_str().unwrap_or("General").trim(),"price":p["price"].as_f64().unwrap_or(0.0),"available":p["available"].as_bool().unwrap_or(true)});let mut updated=false;for q in array_mut(&mut state.db,"products"){if q["id"].as_str()==Some(&id){*q=x.clone();updated=true;break}}if !updated{array_mut(&mut state.db,"products").push(x.clone())};audit(&mut state,if updated{"MENU_UPDATED"}else{"MENU_CREATED"},json!({"id":id}))?;Ok(x)}
#[tauri::command] fn delete_product(w:WebviewWindow,s:State<Mutex<AppState>>,id:String)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner"]))?;array_mut(&mut state.db,"products").retain(|p|p["id"].as_str()!=Some(&id));audit(&mut state,"MENU_DELETED",json!({"id":id}))?;Ok(json!(true))}
#[tauri::command] fn replace_products(w:WebviewWindow,s:State<Mutex<AppState>>,products:Vec<Value>)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner"]))?;let mut out=Vec::new();for(i,p)in products.into_iter().enumerate(){let name=p["name"].as_str().unwrap_or("").trim().to_string();if name.is_empty(){continue}let id=p["id"].as_str().filter(|x|!x.is_empty()).map(str::to_string).unwrap_or_else(||format!("p-{}-{}",now_ms(),i));let available=p["available"].as_bool().unwrap_or_else(||p["available"].as_str().unwrap_or("true").to_lowercase()!="false");out.push(json!({"id":id,"name":name,"category":p["category"].as_str().unwrap_or("General").trim(),"price":p["price"].as_f64().unwrap_or(0.0),"available":available}))}let count=out.len();state.db["products"]=json!(out);audit(&mut state,"MENU_BULK_IMPORT",json!({"count":count}))?;Ok(state.db["products"].clone())}
#[tauri::command] fn add_audit(w:WebviewWindow,s:State<Mutex<AppState>>,e:Value)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,None)?;let action=e["action"].as_str().unwrap_or("EVENT").to_string();audit(&mut state,&action,e)?;Ok(json!(true))}
#[tauri::command] fn update_settings(w:WebviewWindow,s:State<Mutex<AppState>>,settings:Value)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner"]))?;if let(Some(dst),Some(src))=(state.db["settings"].as_object_mut(),settings.as_object()){for(k,v)in src{dst.insert(k.clone(),v.clone());}}persist(&state)?;Ok(state.db["settings"].clone())}
fn command_lines(command:&str,args:&[&str])->Vec<String>{Command::new(command).args(args).output().ok().and_then(|o|String::from_utf8(o.stdout).ok()).unwrap_or_default().lines().map(str::to_string).filter(|x|!x.is_empty()).collect()}
#[tauri::command] fn discover_printers(w:WebviewWindow,s:State<Mutex<AppState>>)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner","Cashier"]))?;let mut out=Vec::new();#[cfg(target_os="linux")]for line in command_lines("bluetoothctl",&["devices"]){let p:Vec<&str>=line.splitn(3,' ').collect();if p.len()==3{out.push(json!({"mac":p[1],"name":p[2]}))}}#[cfg(target_os="windows")] {let script="Get-PnpDevice -Class Bluetooth | Where-Object {$_.Status -eq 'OK'} | Select-Object FriendlyName,InstanceId | ConvertTo-Csv -NoTypeInformation";for line in command_lines("powershell",&["-NoProfile","-Command",script]).into_iter().skip(1){let name=line.split(',').next().unwrap_or("").trim_matches('"').to_string();if !name.is_empty(){out.push(json!({"name":name,"mac":""}))}}}Ok(json!(out))}
#[tauri::command] fn connect_printer(w:WebviewWindow,s:State<Mutex<AppState>>,mac:String)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner","Cashier"]))?;#[cfg(target_os="linux")]let _=command_lines("bluetoothctl",&["connect",&mac]);#[cfg(target_os="windows")]let _ = mac;Ok(json!(true))}
#[tauri::command] fn export_menu(w:WebviewWindow,s:State<Mutex<AppState>>,path:String)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner","Accountant"]))?;let mut csv="id,name,category,price,available\n".to_string();if let Some(products)=state.db["products"].as_array(){for p in products{csv.push_str(&format!("{},{},{},{},{}\n",p["id"].as_str().unwrap_or(""),p["name"].as_str().unwrap_or(""),p["category"].as_str().unwrap_or(""),p["price"].as_f64().unwrap_or(0.0),p["available"].as_bool().unwrap_or(false)))}}fs::write(&path,csv).map_err(|e|e.to_string())?;Ok(json!(path))}
#[tauri::command] fn import_menu(w:WebviewWindow,s:State<Mutex<AppState>>,path:String)->Result<Value,String>{let mut state=s.lock().unwrap();ensure(&mut state,&w,Some(&["Admin","Owner"]))?;let text=fs::read_to_string(&path).map_err(|e|e.to_string())?;let mut products=Vec::new();for line in text.lines().skip(1){let p:Vec<&str>=line.split(',').collect();if p.len()>=5{products.push(json!({"id":p[0],"name":p[1],"category":p[2],"price":p[3].parse::<f64>().unwrap_or(0.0),"available":p[4].to_lowercase()!="false"}))}}let count=products.len();state.db["products"]=json!(products);audit(&mut state,"MENU_BULK_IMPORT",json!({"count":count}))?;Ok(json!(count))}

fn main(){tauri::Builder::default().plugin(tauri_plugin_dialog::init()).setup(|app|{let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;let file=dir.join("data").join("store.json");app.manage(Mutex::new(load_state(file)));Ok(())}).invoke_handler(tauri::generate_handler![app_info,login,pin_login,logout,session,snapshot,change_password,reset_password,create_order,order_status,assign_order,update_table,add_customer,add_rider,save_product,delete_product,replace_products,add_audit,update_settings,discover_printers,connect_printer,export_menu,import_menu]).run(tauri::generate_context!()).expect("error while running MK Foods POS");}
