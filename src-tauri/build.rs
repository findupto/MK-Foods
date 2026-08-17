use std::{fs, path::Path};

fn main() {
    // Keep the native command surface canonical: printer commands live in
    // printer.rs. Older main.rs snapshots contained duplicate local printer
    // commands; normalize that source before rustc sees it.
    let path = Path::new("src/main.rs");
    if let Ok(mut src) = fs::read_to_string(path) {
        let before = src.clone();
        src = strip_command(&src, "discover_printers");
        src = strip_command(&src, "connect_printer");
        src = src.replace(
            "discover_printers,connect_printer,printer::print_thermal",
            "printer::discover_printers,printer::connect_printer,printer::print_thermal",
        );
        if src != before {
            fs::write(path, src).expect("failed to normalize native printer commands");
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
