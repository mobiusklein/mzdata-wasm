use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use eframe::egui;
use egui_file_dialog::{DialogState, FileDialog};

pub struct SelectFilesApp {
    file_dialog: FileDialog,
    picked_items: Option<Vec<PathBuf>>,
    state: Arc<Mutex<Option<Vec<PathBuf>>>>,
}

impl SelectFilesApp {
    pub fn new(ctx: &eframe::CreationContext, state: Arc<Mutex<Option<Vec<PathBuf>>>>) -> Self {
        let mut file_dialog = FileDialog::default().default_size([900.0, 500.0]).title_bar(false);
        if let Some(storage) = ctx.storage {
            *file_dialog.storage_mut() = eframe::get_value(storage, "mzdata-viewer-file-chooser").unwrap_or_default();
        }
        Self {
            file_dialog,
            picked_items: None,
            state,
        }
    }
}

impl eframe::App for SelectFilesApp {
    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        // Save the persistent data of the file dialog
        eframe::set_value(
            storage,
            "mzdata-viewer-file-chooser",
            self.file_dialog.storage_mut(),
        );
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |_ui| {
            if matches!(self.file_dialog.state(), DialogState::Closed)
                && self.picked_items.is_none()
            {
                self.file_dialog.pick_multiple();
            }

            self.file_dialog.update(ctx);

            if let Some(items) = self.file_dialog.take_picked_multiple() {
                self.picked_items = Some(items);
                *self.state.lock().unwrap() = self.picked_items.clone();
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            }
        });
    }
}

pub fn pick_mz_paths() -> eframe::Result<Option<Vec<PathBuf>>> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1080.0, 720.0])
            .with_decorations(true)
            .with_clamp_size_to_monitor_size(true)
            .with_title_shown(false)
            .with_transparent(true)
            .with_always_on_top(),
        ..Default::default()
    };

    let state: Arc<Mutex<Option<Vec<PathBuf>>>> = Arc::new(Mutex::new(None));
    eframe::run_native(
        "mzdata-viewer-file-chooser",
        options,
        Box::new(|ctx| Ok(Box::new(SelectFilesApp::new(ctx, state.clone())))),
    )?;
    let mut view = state.lock().unwrap();

    let data = view.take();
    Ok(data)
}
