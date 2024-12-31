use wasm_bindgen::prelude::*;

use mzdata::prelude::*;
use mzdata::MZReader;

use crate::binds::WebSpectrum;
use crate::webio::WebIO;


#[wasm_bindgen]
pub struct WorkerWebMZReader {
    handle: MZReader<WebIO>,
}


#[wasm_bindgen]
impl WorkerWebMZReader {
    pub fn from_webio(handle: WebIO) -> Self {
        log::info!("Initializing WebMZReader");
        let reader = MZReader::open_read_seek(handle).unwrap_or_else(|e| {
            log::error!("Failed to initialize web reader: {e}");
            panic!("Failed to initialize web reader: {e}")
        });
        log::info!("Initialized");
        Self {
            handle: reader
        }
    }

    #[wasm_bindgen(constructor)]
    pub fn from_file(handle: web_sys::File) -> Self {
        log::info!("Building WebMZReader from {handle:?}");
        Self::from_webio(WebIO::new(handle))
    }

    pub fn from_blob(handle: web_sys::Blob) -> Self {
        log::info!("Building WebMZReader from {handle:?}");
        Self::from_webio(WebIO::new(handle))
    }

    pub fn get_spectrum_by_id(&mut self, id: &str) -> Option<WebSpectrum> {
        let spectrum = self.handle.get_spectrum_by_id(id)?;
        let desc = WebSpectrum::new(spectrum.description().clone());
        Some(desc)
    }

    pub fn get_spectrum_by_index(&mut self, index: usize) -> Option<WebSpectrum> {
        let spectrum = self.handle.get_spectrum_by_index(index)?;
        let desc = WebSpectrum::new(spectrum.description().clone());
        Some(desc)
    }

    pub fn get_spectrum_by_time(&mut self, time: f64) -> Option<WebSpectrum> {
        let spectrum = self.handle.get_spectrum_by_time(time)?;
        let desc = WebSpectrum::new(spectrum.description().clone());
        Some(desc)
    }
}

