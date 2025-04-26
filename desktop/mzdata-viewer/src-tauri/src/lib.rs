use std::collections::HashMap;
use std::io;
use std::{fs::File, path::PathBuf, sync::Mutex};

use mzdata::io::RestartableGzDecoder;
use mzdata::{
    io::{IMMZReaderType, MZReaderType},
    prelude::*,
};

use itertools::Itertools;
use mzdeisotope::isotopic_model::{IsotopicModels, IsotopicPatternParams};
use mzdeisotope::scorer::{MaximizingFitFilter, PenalizedMSDeconvScorer};
use mzdeisotope::{deconvolute_peaks, IsotopicModelLike};
use mzdeisotope_map::solution::DeconvolvedSolutionFeature;
use mzdeisotope_map::FeatureSearchParams;
use mzpeaks::feature::Feature;
use mzpeaks::{CentroidPeak, IonMobility, MZ};
use mzsignal::feature_statistics::FeatureTransform;
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, InvokeResponseBody, IpcResponse, Response};
use tauri::Manager;
use tauri::{command, AppHandle, Runtime};

use tracing::info;
use tracing_subscriber::{
    prelude::*,
    EnvFilter,
};

mod ms_dialog;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub enum Reader {
    MZReader(MZReaderType<File, CentroidPeak, mzdeisotope::DeconvolvedSolutionPeak>),
    MZReaderGZ(MZReaderType<RestartableGzDecoder<io::BufReader<File>>, CentroidPeak, mzdeisotope::DeconvolvedSolutionPeak>),
    IMMZReader(
        IMMZReaderType<File, Feature<MZ, IonMobility>, DeconvolvedSolutionFeature<IonMobility>>,
    ),
}

#[derive(Default)]
pub struct AppData {
    handles: HashMap<String, ReaderHandle>,
}

impl AppData {
    pub fn handle(&mut self, key: &str) -> Option<&mut ReaderHandle> {
        self.handles.get_mut(key)
    }

    pub fn add(&mut self, handle: ReaderHandle) -> ReaderHandleRef {
        let key = handle.as_key();
        self.handles.insert(key.key.clone(), handle);
        key
    }
}

pub type ADHandle = Mutex<AppData>;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingParams {
    pub deconvolution_score: f32,
    pub denoise_scale: f32,
    pub reprofile: bool,
    pub isotopic_models: Vec<IsotopicModels>,
    pub do_deconvolution: bool,
    pub minimum_feature_extraction_size: usize,
    pub maximum_feature_gap_size: f64,
    pub mass_error_tolerance: Tolerance,
}

pub struct ReaderHandle {
    reader: Reader,
    key: String,
    path: PathBuf,
    peak_picking: bool,
    load_data: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReaderHandleRef {
    key: String,
    path: PathBuf,
    peak_picking: bool,
    load_data: bool,
}

impl ReaderHandle {
    pub fn open_mz_reader(path: PathBuf) -> io::Result<Self> {
        let (_fmt, is_gzipped) = mzdata::io::infer_format(path.clone())?;
        let key = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap();
        if is_gzipped {
            let fh = std::fs::File::open(&path)?;
            let reader = MZReaderType::open_gzipped_read_seek(fh)?;
            let reader = Reader::MZReaderGZ(reader);
            Ok(ReaderHandle {
                reader,
                key,
                path,
                peak_picking: true,
                load_data: true,
            })
        } else {
            let reader = Reader::MZReader(MZReaderType::open_path(path.clone())?);
            Ok(ReaderHandle {
                reader,
                key,
                path,
                peak_picking: true,
                load_data: true,
            })
        }

    }

    pub fn as_key(&self) -> ReaderHandleRef {
        ReaderHandleRef {
            key: self.key.clone(),
            path: self.path.clone(),
            peak_picking: self.peak_picking,
            load_data: self.load_data,
        }
    }

    pub fn configure_from(&mut self, handle: &ReaderHandleRef) {
        self.peak_picking = handle.peak_picking;
        self.load_data = handle.load_data;
    }

    pub fn len(&self) -> usize {
        match &self.reader {
            Reader::MZReader(mzreader_type) => mzreader_type.len(),
            Reader::IMMZReader(immzreader_type) => immzreader_type.len(),
            Reader::MZReaderGZ(reader) => reader.len(),
        }
    }

    pub fn at(&mut self, index: usize) -> Option<Response> {
        match &mut self.reader {
            Reader::MZReader(reader) => {
                let entry = reader.get_spectrum_by_index(index)?;
                Some(Response::new(serde_json::to_string(&entry).unwrap()))
            }
            Reader::IMMZReader(reader) => {
                let entry = reader.get_frame_by_index(index)?;
                Some(Response::new(serde_json::to_string(&entry).unwrap()))
            }
            Reader::MZReaderGZ(reader) => {
                let entry = reader.get_spectrum_by_index(index)?;
                Some(Response::new(serde_json::to_string(&entry).unwrap()))
            }
        }
    }
}

#[derive(Debug, Clone)]
pub enum DataBufferMessage {
    Started { handle_ref: ReaderHandleRef },
    Data { data: Vec<u8> },
    Finished { handle_ref: ReaderHandleRef },
}

impl IpcResponse for DataBufferMessage {
    fn body(self) -> tauri::Result<InvokeResponseBody> {
        Ok(match self {
            DataBufferMessage::Started { handle_ref } => {
                let mut this = serde_json::Map::new();
                this.insert("event".into(), "started".into());
                this.insert(
                    "handleRef".into(),
                    serde_json::to_value(handle_ref).unwrap(),
                );
                InvokeResponseBody::Json(serde_json::to_string(&this).unwrap())
            }
            DataBufferMessage::Data { data } => InvokeResponseBody::Raw(data),
            DataBufferMessage::Finished { handle_ref } => {
                let mut this = serde_json::Map::new();
                this.insert("event".into(), "finished".into());
                this.insert(
                    "handleRef".into(),
                    serde_json::to_value(handle_ref).unwrap(),
                );
                InvokeResponseBody::Json(serde_json::to_string(&this).unwrap())
            }
        })
    }
}

#[command]
async fn load_all_headers<R: Runtime>(
    app: AppHandle<R>,
    handle: ReaderHandleRef,
    channel: Channel<DataBufferMessage>,
) -> Result<Response, String> {
    let state = app.state::<ADHandle>();
    let mut handles = state.lock().unwrap();
    if let Some(reader) = handles.handle(&handle.key) {
        match &mut reader.reader {
            Reader::MZReader(reader) => {
                let dl = *reader.detail_level();
                reader.set_detail_level(mzdata::io::DetailLevel::MetadataOnly);
                for (i, batch) in reader.iter().chunks(500).into_iter().enumerate() {
                    info!("Sending header batch {i} for {}", handle.key);
                    let spectra: Vec<_> = batch.collect();
                    channel
                        .send(DataBufferMessage::Data {
                            data: serde_json::to_vec(&spectra).unwrap(),
                        })
                        .map_err(|e| e.to_string())?;
                }
                reader.set_detail_level(dl);
            }
            Reader::MZReaderGZ(reader) => {
                let dl = *reader.detail_level();
                reader.set_detail_level(mzdata::io::DetailLevel::MetadataOnly);
                for (i, batch) in reader.iter().chunks(500).into_iter().enumerate() {
                    info!("Sending header batch {i} for {}", handle.key);
                    let spectra: Vec<_> = batch.collect();
                    channel
                        .send(DataBufferMessage::Data {
                            data: serde_json::to_vec(&spectra).unwrap(),
                        })
                        .map_err(|e| e.to_string())?;
                }
                reader.set_detail_level(dl);
            }
            Reader::IMMZReader(reader) => {
                let dl = *reader.detail_level();
                reader.set_detail_level(mzdata::io::DetailLevel::MetadataOnly);
                for (i, batch) in reader.iter().chunks(500).into_iter().enumerate() {
                    info!("Sending header batch {i} for {}", handle.key);
                    let frames: Vec<_> = batch.collect();
                    channel
                        .send(DataBufferMessage::Data {
                            data: serde_json::to_vec(&frames).unwrap(),
                        })
                        .map_err(|e| e.to_string())?;
                }
                reader.set_detail_level(dl);
            }
        }
        channel
            .send(DataBufferMessage::Finished {
                handle_ref: handle.clone(),
            })
            .map_err(|e| e.to_string())?;
        return Ok(Response::new(InvokeResponseBody::Raw(
            serde_json::to_vec(&handle).unwrap(),
        )));
    } else {
        Err(format!("Cannot enumerate headers"))
    }
}

#[command]
async fn load_data_for<R: Runtime>(
    app: AppHandle<R>,
    handle: ReaderHandleRef,
    index: usize,
    processing: Option<ProcessingParams>,
) -> Result<Response, String> {
    let state = app.state::<ADHandle>();
    let mut handles = state.lock().unwrap();
    let mut spectrum_opt = None;
    let mut frame_opt = None;
    if let Some(reader) = handles.handle(&handle.key) {
        info!("Loading {index} for {}", handle.key);
        reader.configure_from(&handle);
        match &mut reader.reader {
            Reader::MZReader(reader) => {
                reader.set_detail_level(mzdata::io::DetailLevel::Full);
                let spectrum = reader.get_spectrum_by_index(index).unwrap();
                if spectrum.has_ion_mobility_dimension() {
                    frame_opt = Some(spectrum.try_into().unwrap())
                } else {
                    spectrum_opt = Some(spectrum)
                }
            }
            Reader::MZReaderGZ(reader) => {
                reader.set_detail_level(mzdata::io::DetailLevel::Full);
                let spectrum = reader.get_spectrum_by_index(index).unwrap();
                if spectrum.has_ion_mobility_dimension() {
                    frame_opt = Some(spectrum.try_into().unwrap())
                } else {
                    spectrum_opt = Some(spectrum)
                }
            }
            Reader::IMMZReader(reader) => {
                reader.set_detail_level(mzdata::io::DetailLevel::Full);
                let frame = reader.get_frame_by_index(index).unwrap();
                frame_opt = Some(frame);
            }
        }
    }
    drop(handles);


    if let Some(mut spectrum) = spectrum_opt {
        if let Some(procs) = processing.as_ref() {
            info!("Transforming spectrum {index} with {procs:?}");
            if procs.reprofile {
                spectrum
                    .reprofile_with_shape(0.001, 0.005)
                    .map_err(|e| e.to_string())?;
            }
            if procs.denoise_scale > 0.0 {
                spectrum
                    .denoise(procs.denoise_scale)
                    .map_err(|e| e.to_string())?;
            }
            spectrum.pick_peaks(1.0).map_err(|e| e.to_string())?;
            if procs.do_deconvolution {
                let peaks = spectrum.peaks.clone().unwrap();
                let max_z = spectrum
                    .description()
                    .precursor
                    .as_ref()
                    .and_then(|p| p.charge())
                    .unwrap_or(8)
                    .abs();
                let models =
                    IsotopicModelLike::from_iter(procs.isotopic_models.iter().map(|i| *i));
                let mut iso_params = IsotopicPatternParams::default();
                iso_params.incremental_truncation = Some(0.95);
                iso_params.truncate_after = 0.9999;
                let solution = deconvolute_peaks(
                    peaks,
                    models,
                    Tolerance::PPM(15.0),
                    (1, max_z),
                    PenalizedMSDeconvScorer::new(0.02, 2.0),
                    MaximizingFitFilter::new(procs.deconvolution_score),
                    1,
                    iso_params,
                    true,
                )
                .unwrap();
                spectrum.deconvoluted_peaks = Some(solution);
            }
        }
        info!("Done processing spectrum, sending");
        return Ok(Response::new(InvokeResponseBody::Raw(
            serde_json::to_vec(&spectrum).unwrap(),
        )));
    }
    if let Some(mut frame) = frame_opt {
        if let Some(procs) = processing.as_ref() {
            info!("Transforming ion mobility frame {index} with {procs:?}");
            frame
                .extract_features_simple(
                    procs.mass_error_tolerance,
                    procs.minimum_feature_extraction_size,
                    procs.maximum_feature_gap_size,
                    None,
                )
                .map_err(|e| e.to_string())?;

            if procs.do_deconvolution {
                let mut features = frame.features.clone().unwrap();
                features.iter_mut().for_each(|f| {
                    f.smooth(1);
                });

                let max_z = frame
                    .description()
                    .precursor
                    .as_ref()
                    .and_then(|p| p.charge())
                    .unwrap_or(8)
                    .abs();
                let mut feature_params = FeatureSearchParams::default();
                if frame.ms_level() == 1 {
                    feature_params.truncate_after = 0.95;
                } else {
                    feature_params.truncate_after = 0.8;
                }
                let isotopic_model: IsotopicModelLike = procs
                    .isotopic_models
                    .first()
                    .copied()
                    .map(|m| m.into())
                    .unwrap();
                let res = mzdeisotope_map::deconvolute_features(
                    features,
                    feature_params,
                    isotopic_model,
                    PenalizedMSDeconvScorer::new(0.04, 2.0),
                    MaximizingFitFilter::new(procs.deconvolution_score),
                    procs.mass_error_tolerance,
                    (1, max_z),
                    procs.minimum_feature_extraction_size,
                    procs.maximum_feature_gap_size,
                    5.0,
                    2,
                )
                .inspect_err(|e| {
                    log::error!("Error occured during deconvolution: {e}");
                })
                .unwrap();
                frame.deconvoluted_features = Some(res);
            }
        }
        info!("Done processing frame, sending");
        return Ok(Response::new(InvokeResponseBody::Raw(
            serde_json::to_vec(&[frame]).unwrap(),
        )));
    }
    Err(format!("Handle {handle:?} not found"))
}

#[command]
fn operate_on_handle<R: Runtime>(
    app: AppHandle<R>,
    handle: ReaderHandleRef,
    operation: String,
) -> Result<Response, String> {
    let state = app.state::<ADHandle>();
    let mut state = state.lock().unwrap();
    match operation.as_str() {
        "length" => {
            if let Some(handle) = state.handle(&handle.key) {
                let val = handle.len();
                Ok(Response::new(InvokeResponseBody::Json(
                    serde_json::to_string(&val).unwrap(),
                )))
            } else {
                Err(format!("Operation {operation} not recognized"))
            }
        }
        _ => Err(format!("Operation {operation} not recognized")),
    }
}

#[command]
fn open_mzreader_path<R: Runtime>(app: AppHandle<R>) -> Option<ReaderHandleRef> {
    let path = ms_dialog::pick_mz_paths().unwrap();
    if let Some(path) = path {
        eprintln!("{path:?}");
        if let Some(path) = path.get(0).cloned() {
            let state = app.state::<ADHandle>();
            let inner = state.inner();
            let mut inner = inner.lock().unwrap();
            if let Ok(reader) = ReaderHandle::open_mz_reader(path) {
                Some(inner.add(reader))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    }
}

fn setup_logging() {
    let subscriber = tracing_subscriber::registry().with(
        tracing_subscriber::fmt::layer()
            .with_timer(tracing_subscriber::fmt::time::ChronoLocal::rfc_3339())
            .with_writer(io::stderr)
            .with_filter(
                EnvFilter::builder()
                    .with_default_directive(tracing::Level::INFO.into())
                    .from_env_lossy(),
            ),
    );
    subscriber.init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_logging();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_mzreader_path,
            operate_on_handle,
            load_all_headers,
            load_data_for,
        ])
        .setup(|app| {
            app.manage(Mutex::new(AppData::default()));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
