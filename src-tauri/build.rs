use std::{fs, path::Path};

fn main() {
    // Keep the native command surface canonical: printer commands live in
    // printer.rs. Older main.rs snapshots contained duplicate local printer
    // commands; normalize that source before rustc sees it.
    let main_path = Path::new("src/main.rs");
    if let Ok(mut src) = fs::read_to_string(main_path) {
        let before = src.clone();
        src = strip_command(&src, "discover_printers");
        src = strip_command(&src, "connect_printer");
        src = src.replace(
            "discover_printers,connect_printer,printer::print_thermal",
            "printer::discover_printers,printer::connect_printer,printer::print_thermal",
        );
        if src != before {
            fs::write(main_path, src).expect("failed to normalize native printer commands");
        }
    }

    // The shared printer module exposes enumerate_printers as an unsafe Win32
    // wrapper. Keep every call site explicit so newer Rust compilers reject no
    // hidden unsafe operation.
    let printer_path = Path::new("src/printer.rs");
    if let Ok(mut src) = fs::read_to_string(printer_path) {
        let old = "if printer==\"__DISCOVER__\"{return Ok(json!({\"ok\":true,\"printers\":enumerate_printers()?}))}";
        let new = "if printer==\"__DISCOVER__\"{return Ok(json!({\"ok\":true,\"printers\":unsafe{enumerate_printers()?}}))}";
        if src.contains(old) {
            src = src.replace(old, new);
            fs::write(printer_path, src).expect("failed to normalize printer discovery safety");
        }
    }

    tauri_build::build()
}

fn strip_command(src: &str, name: &str) -> String {
    let marker = format!("#[tauri::command]fn {name}(");
    let Some(start) = src.find(&marker) else { return src.to_string(); };
    let body_start = start + marker.len();
    let Some(end_rel) = src[body_start..].find("}\n") else { return src.to_string(); };
    let end = body_start + end_rel + 2;
    let mut out = String::with_capacity(src.len());
    out.push_str(&src[..start]);
    out.push_str(&src[end..]);
    out
}
