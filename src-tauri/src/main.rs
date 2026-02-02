// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod llm;
mod voice;

use tauri::Manager;

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize database
            let app_dir = match app.path().app_data_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    eprintln!("Failed to get app data directory: {}", e);
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "Failed to get app data directory"
                    )));
                }
            };
            
            if let Err(e) = std::fs::create_dir_all(&app_dir) {
                eprintln!("Warning: Failed to create app directory: {}", e);
            }
            
            let db_path = app_dir.join("wishmaster.db");
            if let Err(e) = database::init(&db_path) {
                eprintln!("Failed to initialize database: {}", e);
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to initialize database: {}", e)
                )));
            }
            
            // Initialize LLM engine
            llm::init();
            
            // Initialize voice engine
            voice::init();
            
            println!("🧞 Wishmaster Desktop started!");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            commands::load_settings,
            commands::save_settings,
            // Models
            commands::scan_models,
            commands::load_model,
            commands::unload_model,
            // Sessions
            commands::get_sessions,
            commands::create_session,
            commands::delete_session,
            // Messages
            commands::get_messages,
            commands::save_message,
            // Generation
            commands::generate,
            commands::stop_generation,
            // Voice
            commands::get_voice_profiles,
            commands::create_voice_profile,
            commands::delete_voice_profile,
            commands::start_recording,
            commands::stop_recording,
            commands::speak,
            commands::stop_speaking,
        ])
        .run(tauri::generate_context!());
    
    if let Err(e) = result {
        eprintln!("Application error: {}", e);
        std::process::exit(1);
    }
}
