use js_sys::{Array, Object};
use log;

use mzdata::{prelude::SpectrumLike, spectrum::{Activation, PeakDataLevel}};
use wasm_bindgen::prelude::*;

use mzpeaks::{peak::MZPoint, prelude::*, CentroidPeak, DeconvolutedPeak, Tolerance};

use chemical_elements::{
    isotopic_pattern::{isotopic_variants, Peak},
    ChemicalComposition, PROTON,
};

use mzdata::{
    params::{Param, ParamDescribed, ParamLike, ValueRef},
    spectrum::{
        IsolationWindow, Precursor, ScanWindow, SelectedIon, SignalContinuity, SpectrumDescription,
    },
};

#[wasm_bindgen(js_name="Tolerance")]
#[derive(Debug, Clone, Copy)]
pub struct WebTolerance(Tolerance);

#[wasm_bindgen]
impl WebTolerance {
    #[wasm_bindgen]
    pub fn ppm(value: f64) -> Self {
        Self(Tolerance::PPM(value))
    }

    pub fn da(value: f64) -> Self {
        Self(Tolerance::Da(value))
    }
}

#[wasm_bindgen(inspectable, js_name="SimplePeak")]
#[derive(Debug, Default, Clone, Copy)]
pub struct SimpleWebPeak {
    pub mz: f64,
    pub intensity: f32,
}

impl From<MZPoint> for SimpleWebPeak {
    fn from(value: MZPoint) -> Self {
        SimpleWebPeak {
            mz: value.mz,
            intensity: value.intensity,
            .. Default::default()
        }
    }
}

impl From<&CentroidPeak> for SimpleWebPeak {
    fn from(value: &CentroidPeak) -> Self {
        SimpleWebPeak {
            mz: value.mz,
            intensity: value.intensity as f32,
            .. Default::default()
        }
    }
}
impl From<&DeconvolutedPeak> for SimpleWebPeak {
    fn from(value: &DeconvolutedPeak) -> Self {
        SimpleWebPeak {
            mz: value.mz(),
            intensity: value.intensity as f32,
            .. Default::default()
        }
    }
}

impl From<Peak> for SimpleWebPeak {
    fn from(value: Peak) -> Self {
        SimpleWebPeak {
            mz: value.mz,
            intensity: value.intensity as f32,
            .. Default::default()
        }
    }
}

#[wasm_bindgen(js_name="Param")]
#[derive(Debug, Default, Clone)]
pub struct WebParam(Param);

#[wasm_bindgen(js_class="Param")]
impl WebParam {
    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.0.name().to_string()
    }

    #[wasm_bindgen(getter)]
    pub fn id(&self) -> Option<String> {
        self.0.curie_str()
    }

    #[wasm_bindgen(getter)]
    pub fn value(&self) -> JsValue {
        let val = self.0.value();
        match val {
            ValueRef::String(cow) => JsValue::from_str(&cow),
            ValueRef::Float(x) => JsValue::from_f64(x),
            ValueRef::Int(x) => JsValue::from_f64(x as f64),
            ValueRef::Buffer(cow) => {
                let val: Array = cow
                    .to_vec()
                    .into_iter()
                    .map(|x| JsValue::from_f64(x as f64))
                    .collect();
                val.into()
            }
            ValueRef::Empty => JsValue::null(),
            ValueRef::Boolean(x) => JsValue::from_bool(x),
        }
    }

    #[wasm_bindgen(js_name = "toJSON")]
    pub fn to_json(&self) -> Result<Object, JsValue> {
        let entries = Array::of3(
            &Array::of2(&JsValue::from_str("name"), &self.name().into()),
            &Array::of2(&JsValue::from_str("value"), &self.value()),
            &Array::of2(&JsValue::from_str("id"), &self.id().into()),
        );
        Object::from_entries(&entries)
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string(&self) -> String {
        format!(
            "WebParam {{ name: {}, value: {}, id: {:?} }} ",
            self.name(),
            self.0.value.to_string(),
            self.id()
        )
    }
}

#[wasm_bindgen(js_name="IsolationWindow")]
#[derive(Debug, Default, Clone)]
pub struct WebIsolationWindow(IsolationWindow);

#[wasm_bindgen(js_class="IsolationWindow")]
impl WebIsolationWindow {
    #[wasm_bindgen(getter)]
    pub fn lower_bound(&self) -> f32 {
        self.0.lower_bound
    }

    #[wasm_bindgen(getter)]
    pub fn upper_bound(&self) -> f32 {
        self.0.upper_bound
    }

    pub fn contains(&self, x: f32) -> bool {
        self.0.contains(x)
    }
}

#[wasm_bindgen(js_name="ScanWindow")]
#[derive(Debug, Default, Clone)]
pub struct WebScanWindow(ScanWindow);

#[wasm_bindgen(js_class="ScanWindow")]
impl WebScanWindow {
    #[wasm_bindgen(getter)]
    pub fn lower_bound(&self) -> f32 {
        self.0.lower_bound
    }

    #[wasm_bindgen(getter)]
    pub fn upper_bound(&self) -> f32 {
        self.0.upper_bound
    }

    pub fn contains(&self, x: f32) -> bool {
        self.0.contains(x)
    }
}

#[wasm_bindgen(js_name="SelectedIon")]
#[derive(Debug, Clone)]
pub struct WebSelectedIon(SelectedIon);

#[wasm_bindgen(js_class="SelectedIon")]
impl WebSelectedIon {
    #[wasm_bindgen(getter)]
    pub fn mz(&self) -> f64 {
        self.0.mz
    }

    #[wasm_bindgen(getter)]
    pub fn intensity(&self) -> f32 {
        self.0.intensity
    }

    #[wasm_bindgen(getter)]
    pub fn charge(&self) -> Option<i32> {
        self.0.charge
    }

    pub fn params(&self) -> Vec<WebParam> {
        self.0
            .params()
            .iter()
            .cloned()
            .map(|p| WebParam(p))
            .collect()
    }
}


#[wasm_bindgen(js_name="Activation")]
#[derive(Debug, Clone)]
pub struct WebActivation(Activation);

#[wasm_bindgen(js_class="Activation")]
impl WebActivation {

    #[wasm_bindgen(getter)]
    pub fn method(&self) -> Option<String> {
        self.0.method().map(|m| m.name().to_string())
    }

    #[wasm_bindgen(getter)]
    pub fn energy(&self) -> f32 {
        self.0.energy
    }

    pub fn methods(&self) -> Vec<WebParam> {
        self.0.methods().iter().map(|m| {
            WebParam(m.to_param().into())
        }).collect()
    }

    pub fn params(&self) -> Vec<WebParam> {
        self.0
            .params
            .iter()
            .cloned()
            .map(|p| WebParam(p))
            .collect()
    }

    #[wasm_bindgen(js_name="toJSON")]
    pub fn to_json(&self) -> Result<Object, JsValue> {
        let entries = Array::of3(
            &Array::of2(&JsValue::from_str("method"), &self.method().into()),
            &Array::of2(&JsValue::from_str("energy"), &self.energy().into()),
            &Array::of2(&JsValue::from_str("params"), &self.params().into()),
        );
        Object::from_entries(&entries)
    }
}


#[wasm_bindgen(getter_with_clone, inspectable, js_name="Precursor")]
#[derive(Debug, Clone)]
pub struct WebPrecursor {
    _inner: Precursor,
    pub ions: Vec<WebSelectedIon>,
    pub isolation_window: WebIsolationWindow,
    pub activation: WebActivation
}

#[wasm_bindgen(js_class="Precursor")]
impl WebPrecursor {
    fn new(precursor: Precursor) -> Self {
        let ions = precursor
            .ions
            .iter()
            .cloned()
            .map(|i| WebSelectedIon(i))
            .collect();
        let isolation_window = WebIsolationWindow(precursor.isolation_window.clone());
        let activation = WebActivation(precursor.activation.clone());
        Self {
            _inner: precursor,
            ions,
            isolation_window,
            activation
        }
    }
}

#[wasm_bindgen]
pub fn generate_isotopic_pattern(formula: &str) -> Result<Vec<SimpleWebPeak>, String> {
    let comp: ChemicalComposition = match formula.parse() {
        Ok(comp) => comp,
        Err(e) => {
            return Err(format!("Bad Formula {}", e));
        }
    };
    log::info!("{}", comp.to_string());
    Ok(isotopic_variants(comp, 0, 1, PROTON)
        .into_iter()
        .map(|p| p.into())
        .collect())
}

#[wasm_bindgen(js_name="SignalContinuity")]
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Default, Hash, Eq)]
pub enum WebSignalContinuity {
    #[default]
    Unknown,
    Centroid,
    Profile,
}

impl From<SignalContinuity> for WebSignalContinuity {
    fn from(value: SignalContinuity) -> Self {
        match value {
            SignalContinuity::Unknown => Self::Unknown,
            SignalContinuity::Centroid => Self::Centroid,
            SignalContinuity::Profile => Self::Profile,
        }
    }
}

#[wasm_bindgen(js_name = "Spectrum")]
pub struct WebSpectrum {
    peaks: PeakDataLevel,
    description: SpectrumDescription,
    precursor: Option<WebPrecursor>,
}

impl WebSpectrum {
    pub fn new(description: SpectrumDescription) -> Self {
        let precursor = description.precursor.clone().map(|p| WebPrecursor::new(p));
        Self {
            peaks: PeakDataLevel::Missing,
            description,
            precursor,
        }
    }

    pub fn new_with_peaks(description: SpectrumDescription, peaks: PeakDataLevel) -> Self {
        let mut this = Self::new(description);
        this.peaks = peaks;
        this
    }
}

#[wasm_bindgen(js_class="Spectrum")]
impl WebSpectrum {
    #[wasm_bindgen(getter)]
    pub fn id(&self) -> String {
        self.description.id.clone()
    }

    #[wasm_bindgen(getter, js_name = "startTime")]
    pub fn start_time(&self) -> f64 {
        self.description.acquisition.start_time()
    }

    #[wasm_bindgen(getter, js_name = "signalContinuity")]
    pub fn signal_continuity(&self) -> WebSignalContinuity {
        self.description.signal_continuity.into()
    }

    #[wasm_bindgen(getter, js_name = "isProfile")]
    pub fn is_profile(&self) -> bool {
        matches!(
            self.description.signal_continuity,
            SignalContinuity::Profile
        )
    }

    #[wasm_bindgen(getter)]
    pub fn index(&self) -> usize {
        self.description.index
    }

    #[wasm_bindgen(getter, js_name = "msLevel")]
    pub fn ms_level(&self) -> u8 {
        self.description.ms_level
    }

    #[wasm_bindgen(getter)]
    pub fn precursor(&self) -> Option<WebPrecursor> {
        self.precursor.clone()
    }

    pub fn params(&self) -> Vec<WebParam> {
        self.description
            .params
            .iter()
            .cloned()
            .map(|p| WebParam(p))
            .collect()
    }

    #[wasm_bindgen(js_name="pickPeaks")]
    pub fn pick_peaks(&mut self, signal_to_noise_threshold: f32) {
        if !self.is_profile() {
            return
        }
        let mut tmp_descr = SpectrumDescription::default();
        let mut tmp_peaks = PeakDataLevel::Missing;

        std::mem::swap(&mut self.description, &mut tmp_descr);
        std::mem::swap(&mut self.peaks, &mut tmp_peaks);

        let mut spec = mzdata::spectrum::MultiLayerSpectrum::from_peaks_data_levels_and_description(tmp_peaks, tmp_descr);
        spec.pick_peaks(signal_to_noise_threshold).unwrap();
        (tmp_peaks, tmp_descr) = spec.into_peaks_and_description();
        self.peaks = tmp_peaks;
        self.description = tmp_descr;
        self.description.signal_continuity = SignalContinuity::Centroid;
    }

    #[wasm_bindgen(getter)]
    pub fn length(&self) -> usize {
        self.peaks.len()
    }

    #[wasm_bindgen(js_name = "hasPeak")]
    pub fn has_peak(&self, query: f64, error_tolerance: WebTolerance) -> Option<SimpleWebPeak> {
        self.peaks
            .search(query, error_tolerance.0)
            .and_then(|i| self.peaks.get(i))
            .map(|p| SimpleWebPeak {
                mz: p.mz,
                intensity: p.intensity,
            })
    }

    #[wasm_bindgen(js_name = "allPeaksFor")]
    pub fn all_peaks_for(&self, query: f64, error_tolerance: WebTolerance) -> Vec<SimpleWebPeak> {
        match &self.peaks {
            PeakDataLevel::Missing => Vec::new(),
            PeakDataLevel::RawData(_) => Vec::new(),
            PeakDataLevel::Centroid(peak_set_vec) => peak_set_vec
                .all_peaks_for(query, error_tolerance.0)
                .into_iter()
                .map(|p| p.into())
                .collect(),
            PeakDataLevel::Deconvoluted(peak_set_vec) => peak_set_vec
                .all_peaks_for(query, error_tolerance.0)
                .into_iter()
                .map(|p| p.into())
                .collect(),
        }
    }

    pub fn at(&self, index: usize) -> Option<SimpleWebPeak> {
        self.peaks.get(index).map(|p| SimpleWebPeak {
            mz: p.mz,
            intensity: p.intensity,
        })
    }

    #[wasm_bindgen(js_name = "basePeak")]
    pub fn base_peak(&self) -> SimpleWebPeak {
        let p = self.peaks.base_peak();
        SimpleWebPeak::from(&p)
    }

    pub fn tic(&self) -> f32 {
        self.peaks.tic()
    }

    pub fn between(&self, low: f64, high: f64) -> Vec<SimpleWebPeak> {
        match &self.peaks {
            PeakDataLevel::Missing => Vec::new(),
            PeakDataLevel::RawData(_) => Vec::new(),
            PeakDataLevel::Centroid(peak_set_vec) => peak_set_vec
                .between(low, high, Tolerance::PPM(20.0))
                .iter()
                .map(|p| p.into())
                .collect(),
            PeakDataLevel::Deconvoluted(peak_set_vec) => peak_set_vec
                .between(low, high, Tolerance::PPM(20.0))
                .iter()
                .map(|p| p.into())
                .collect(),
        }
    }

    #[wasm_bindgen(js_name = "toArray")]
    pub fn to_array(&self) -> Vec<SimpleWebPeak> {
        self.peaks.iter().map(|p| p.into()).collect()
    }
}
