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

    // The command bodies in this project are minified onto a single line and
    // can contain nested blocks. Looking for the first `}\n` is therefore
    // unsafe: it may fail to match at all or remove the wrong command. Find
    // the opening brace and scan balanced braces instead, while ignoring
    // braces inside string literals.
    let Some(body_start) = src[start + marker.len()..].find('{')
        .map(|offset| start + marker.len() + offset)
    else {
        return src.to_string();
    };

    let bytes = src.as_bytes();
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    let mut i = body_start;

    while i < bytes.len() {
        let b = bytes[i];
        if in_string {
            if escaped {
                escaped = false;
            } else if b == b'\\' {
                escaped = true;
            } else if b == b'"' {
                in_string = false;
            }
        } else {
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        let mut end = i + 1;
                        if end < bytes.len() && bytes[end] == b'\n' {
                            end += 1;
                        }
                        let mut out = String::with_capacity(src.len() - (end - start));
                        out.push_str(&src[..start]);
                        out.push_str(&src[end..]);
                        return out;
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }

    src.to_string()
}
