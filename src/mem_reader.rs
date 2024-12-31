use wasm_bindgen::prelude::*;

use std::io;

use mzdata::io::{MZReader, MZReaderType};
use mzdata::prelude::*;
use mzdata::spectrum::{MultiLayerSpectrum, SignalContinuity};

use crate::binds::WebSpectrum;

#[wasm_bindgen]
pub struct MemWebMZReader {
    handle: MZReader<io::Cursor<Vec<u8>>>,
    peak_picking: bool,
}

impl MemWebMZReader {
    pub fn get_mut(&mut self) -> &mut MZReaderType<io::Cursor<Vec<u8>>> {
        &mut self.handle
    }

    pub fn get_ref(&self) -> &MZReaderType<io::Cursor<Vec<u8>>> {
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
            handle: MZReader::open_read_seek(io::Cursor::new(buf)).unwrap(),
            peak_picking: false
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
    pub fn length(&self) -> usize {
        self.handle.len()
    }

    fn convert_spectrum(&self, mut spectrum: MultiLayerSpectrum) -> WebSpectrum {
        match spectrum.try_build_peaks() {
            Ok(_) => {}
            Err(_) => {}
        }
        if spectrum.peaks.is_none() && spectrum.deconvoluted_peaks.is_none() {
            spectrum.pick_peaks(1.0).unwrap();
            spectrum.description_mut().signal_continuity = SignalContinuity::Centroid;
        }
        let (peaks, description) = spectrum.into_peaks_and_description();
        WebSpectrum::new_with_peaks(description, peaks)
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
}

// #[wasm_bindgen]
// pub struct StreamWebMZReader {
//     handle: StreamingSpectrumIterator<
//         CentroidPeak,
//         DeconvolutedPeak,
//         MultiLayerSpectrum,
//         MZReaderType<PreBufferedStream<Box<dyn io::Read>>>,
//     >,
// }

// #[wasm_bindgen]
// impl StreamWebMZReader {

//     #[wasm_bindgen(constructor)]
//     pub fn from_stream(stream: ReadableStream) -> Self {
//         let mut reader = crate::asyncio::WebReaderPipe::from_stream_sync(stream);
//         info!("Bridge ready");
//         let mut buf: Vec<u8> = Vec::new();
//         buf.resize(64, 0);
//         reader.read(&mut buf).expect("Failed to read bytes");
//         info!("Read {} bytes", String::from_utf8_lossy(&buf));
//         let handle = MZReader::open_read(Box::new(reader) as Box<dyn Read>).unwrap();
//         info!("Reader ready");
//         Self { handle }
//     }

//     pub fn from_file(file: web_sys::File) -> Self {
//         Self::from_stream(file.stream())
//     }

//     #[wasm_bindgen(getter)]
//     pub fn length(&self) -> usize {
//         self.handle.len()
//     }

//     pub fn next(&mut self) -> Option<WebSpectrum> {
//         self.handle.next().map(convert_spectrum)
//     }
// }
