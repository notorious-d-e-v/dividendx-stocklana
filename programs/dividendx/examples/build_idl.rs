use std::{fs, path::PathBuf};

use anchor_lang_idl::build::IdlBuilder;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let program_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let idl = IdlBuilder::new()
        .program_path(program_path.clone())
        .resolution(true)
        .skip_lint(false)
        .cargo_args(vec!["--locked".into()])
        .build()?;
    let output_dir = program_path.join("idl");
    fs::create_dir_all(&output_dir)?;
    fs::write(
        output_dir.join("dividendx.json"),
        format!("{}\n", serde_json::to_string_pretty(&idl)?),
    )?;
    Ok(())
}
