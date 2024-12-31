use js_sys::{Array, Object, Reflect};
use mzdeisotope::DeconvolvedSolutionPeak;
use mzpeaks::CentroidPeak;
use wasm_bindgen::prelude::*;

use std::io;

use mzdata::io::MZReaderType;
use mzdata::prelude::*;
use mzdata::spectrum::{MultiLayerSpectrum, SignalContinuity};

use crate::binds::WebSpectrum;

type ReaderType = MZReaderType<io::Cursor<Vec<u8>>, CentroidPeak, DeconvolvedSolutionPeak>;

#[wasm_bindgen]
pub struct MemWebMZReader {
    handle: ReaderType,
    peak_picking: bool,
}

impl MemWebMZReader {
    pub fn get_mut(&mut self) -> &mut ReaderType {
        &mut self.handle
    }

    pub fn get_ref(&self) -> &ReaderType {
        &self.handle
    }
}

#[wasm_bindgen]
impl MemWebMZReader {
    pub fn from_buffer(handle: js_sys::Uint8Array) -> Self {
        let n = handle.length() as usize;
        let mut buf = Vec::with_capacity(n);
        buf.resize(n, 0);
        handle.copy_to(&mut buf);
        Self {
            handle: MZReaderType::open_read_seek(io::Cursor::new(buf)).unwrap(),
            peak_picking: false,
        }
    }

    pub fn set_data_loading(&mut self, load_data: bool) {
        if load_data {
            self.handle.set_detail_level(mzdata::io::DetailLevel::Full);
        } else {
            self.handle
                .set_detail_level(mzdata::io::DetailLevel::MetadataOnly);
        }
    }

    pub fn set_peak_picking(&mut self, pick_peaks: bool) {
        self.peak_picking = pick_peaks;
    }

    #[wasm_bindgen(getter)]
    pub fn file_format(&self) -> String {
        self.handle.as_format().to_string()
    }

    #[wasm_bindgen(getter)]
    pub fn length(&self) -> usize {
        self.handle.len()
    }

    fn convert_spectrum(
        &self,
        mut spectrum: MultiLayerSpectrum<CentroidPeak, DeconvolvedSolutionPeak>,
    ) -> WebSpectrum {
        // if spectrum.peaks.is_none() && spectrum.deconvoluted_peaks.is_none() {
        //     spectrum.pick_peaks(1.0).unwrap();
        //     spectrum.description_mut().signal_continuity = SignalContinuity::Centroid;
        // }
        if self.peak_picking && spectrum.signal_continuity() == SignalContinuity::Profile {
            spectrum.pick_peaks(1.0).unwrap();
            spectrum.description_mut().signal_continuity = SignalContinuity::Centroid;
        }
        WebSpectrum::from(spectrum)
    }

    pub fn get_spectrum_by_id(&mut self, id: &str) -> Option<WebSpectrum> {
        let spectrum = self.handle.get_spectrum_by_id(id)?;
        Some(self.convert_spectrum(spectrum))
    }

    pub fn get_spectrum_by_index(&mut self, index: usize) -> Option<WebSpectrum> {
        let spectrum = self.handle.get_spectrum_by_index(index)?;
        Some(self.convert_spectrum(spectrum))
    }

    pub fn get_spectrum_by_time(&mut self, time: f64) -> Option<WebSpectrum> {
        let spectrum = self.handle.get_spectrum_by_time(time)?;
        Some(self.convert_spectrum(spectrum))
    }

    pub fn next(&mut self) -> Option<WebSpectrum> {
        self.handle.next().map(|s| self.convert_spectrum(s))
    }

    pub fn start_from_index(&mut self, index: usize) {
        self.handle.start_from_index(index).unwrap();
    }

    pub fn start_from_time(&mut self, time: f64) {
        self.handle.start_from_time(time).unwrap();
    }

    pub fn group_at(&mut self, index: usize) -> Option<Object> {
        let mut it = self.handle.iter();
        let mut it = it.groups();
        it.start_from_index(index).unwrap();
        let group = it.next();
        drop(it);

        let obj = Object::new();
        let group = match group {
            Some(group) => group,
            None => return None,
        };

        let (prec, products) = group.into_parts();
        if let Some(prec) = prec {
            let spec = self.convert_spectrum(prec);
            let val = JsValue::from(spec);
            Reflect::set(&obj, &JsValue::from_str(&"precursor"), &val).unwrap();
        } else {
            Reflect::set(&obj, &JsValue::from_str(&"precursor"), &JsValue::null()).unwrap();
        }

        let products: Array = products
            .into_iter()
            .map(|spec| JsValue::from(self.convert_spectrum(spec)))
            .collect();
        Reflect::set(&obj, &JsValue::from_str(&"products"), &products).unwrap();
        Some(obj)
    }
}
