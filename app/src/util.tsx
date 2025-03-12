import {
  IonMobilityFrame,
  IsotopicModel,
  MZReader,
  Spectrum,
  SpectrumGroup,
} from "mzdata";
import {
  LayerBase,
  PointLayer,
  ProfileLayer,
  PrecursorPeakLayer,
  DeconvolutedLayer,
  IsolationWindowLayer,
  FeatureMapLayerBase,
  FeatureMapPointLayer,
  FeatureMapEllipseLayer,
  DeconvolvedFeatureMapEllipseLayer,
  PointLike,
  FeatureCanvasPoint,
  DeconvolutedPoint,
  ChargedPoint,
  MZPoint,
} from "./canvas/layers";
import { createContext, Dispatch, useContext, useReducer } from "react";
import * as mzdata from "mzdata";

export class SpectrumData {
  spectrum: Spectrum | IonMobilityFrame;
  layers: (LayerBase<PointLike> | FeatureMapLayerBase)[];
  group: SpectrumGroup | undefined;

  get id() {
    return this.spectrum.id;
  }

  get scanRange() {
    const event = this.spectrum.scanEvents[0];
    if (event) {
      const scanWindow = event.scanWindows[0];
      return {
        lowerBound: scanWindow.lowerBound,
        upperBound: scanWindow.upperBound,
      };
    }
  }

  constructor(spectrum: Spectrum | IonMobilityFrame, group?: SpectrumGroup) {
    this.spectrum = spectrum;
    this.group = group;
    this.layers = [];
    this.buildLayers();
  }

  buildLayers() {
    let spectrum = this.spectrum;
    if (spectrum instanceof Spectrum && spectrum.hasIonMobilityDimension()) {
      spectrum = spectrum.asIonMobilityFrame();
      this.spectrum = spectrum;
    }
    if (spectrum instanceof Spectrum) {
      if (spectrum.isProfile) {
        const arrayTable: any = spectrum.rawArrays();
        const mzs = arrayTable["m/z array"] as Float64Array;
        const intensities = arrayTable["intensity array"] as Float32Array;
        this.layers.push(new ProfileLayer(mzs, intensities, {}));
        const centroids = spectrum.centroidPeaks();
        if (centroids && centroids.length > 0) {
          this.layers.push(
            new PointLayer(
              centroids.map((p) => new MZPoint(p.mz, p.intensity)),
              {}
            )
          );
        }
      } else {
        const points = spectrum.centroidPeaks() || [];
        if (points && points.length > 0) {
          this.layers.push(
            new PointLayer(
              points.map((p) => new MZPoint(p.mz, p.intensity)),
              {}
            )
          );
        }
      }
      const deconvolutedCentroids = spectrum.deconvolutedPeaks();
      if (deconvolutedCentroids && deconvolutedCentroids.length > 0) {
        this.layers.push(
          new DeconvolutedLayer(
            deconvolutedCentroids.map(DeconvolutedPoint.fromSource),
            { strokeWidth: 0.5 }
          )
        );
      }
      if (spectrum.msLevel > 1) {
        if (spectrum.precursor) {
          const precIon = spectrum.precursor.ions[0];
          const precursorPoint = new ChargedPoint(
            precIon.mz,
            precIon.intensity,
            precIon.charge || 0
          );
          this.layers.push(new PrecursorPeakLayer(precursorPoint, {}));
        }
      }
      if (this.group) {
        const windows = this.group.products
          .map((x) => x.precursor?.isolationWindow)
          .filter((x) => x !== undefined);
        if (windows.length > 0) {
          const height = this.layers[0].maxY();
          this.layers.push(new IsolationWindowLayer(windows, height, {}));
        }
      }
    } else if (spectrum instanceof IonMobilityFrame) {
      const featurePoints = spectrum.features()?.flatMap((feat) => {
        const points: FeatureCanvasPoint[] = [];
        for (let i = 0; i < feat.length; i++) {
          const p = feat.at(i);
          if (p) {
            points.push(new FeatureCanvasPoint(p.mz, p.intensity, p.time));
          }
        }
        return points;
      });
      if (featurePoints) {
        const layer = new FeatureMapPointLayer(featurePoints, {}, null);
        this.layers.push(layer);
        const ellipseLayer = new FeatureMapEllipseLayer(
          spectrum.features() as mzdata.Feature[],
          {},
          null
        );
        this.layers.push(ellipseLayer);
      }

      if (spectrum.deconvolutedFeatures()) {
        const layer = new DeconvolvedFeatureMapEllipseLayer(
          spectrum.deconvolutedFeatures() as mzdata.DeconvolvedFeature[],
          {},
          null
        );
        this.layers.push(layer);
      }
    }
  }
}

export class ProcessingParams {
  deconvolutionScore: number;
  denoiseScale: number;
  reprofile: boolean;
  isotopicModels: IsotopicModel[];
  doDeconvolution: boolean;

  minimumFeatureExtractionSize: number;
  maximumFeatureGapSize: number;
  massErrorTolerance: mzdata.Tolerance;

  constructor(
    deconvolutionScore: number,
    denoiseScale: number,
    reprofile: boolean,
    isotopicModels: IsotopicModel[],
    doDeconvolution?: boolean,
    minimumFeatureExtractionSize?: number,
    maximumFeatureGapSize?: number,
    massErrorTolerance?: mzdata.Tolerance
  ) {
    this.deconvolutionScore = deconvolutionScore;
    this.denoiseScale = denoiseScale;
    this.reprofile = reprofile;
    this.isotopicModels = isotopicModels;
    this.doDeconvolution =
      doDeconvolution === undefined ? true : doDeconvolution;
    this.minimumFeatureExtractionSize =
      minimumFeatureExtractionSize === undefined
        ? 3
        : minimumFeatureExtractionSize;
    this.maximumFeatureGapSize =
      maximumFeatureGapSize === undefined ? 0.025 : maximumFeatureGapSize;
    this.massErrorTolerance = massErrorTolerance
      ? massErrorTolerance
      : mzdata.Tolerance.ppm(15.0);
  }

  copy(): ProcessingParams {
    return new ProcessingParams(
      this.deconvolutionScore,
      this.denoiseScale,
      this.reprofile,
      this.isotopicModels,
      this.doDeconvolution,
      this.minimumFeatureExtractionSize,
      this.maximumFeatureGapSize,
      this.massErrorTolerance,
    );
  }

  static default(): ProcessingParams {
    return new ProcessingParams(10, 1, false, [IsotopicModel.peptide()], true);
  }

  applyIonMobilityFrame(frame: IonMobilityFrame) {
    if (!frame.features()) {
      console.log("Extracting features");
      if (frame.msLevel == 1) {
        frame.extractFeatures(
          this.minimumFeatureExtractionSize,
          this.maximumFeatureGapSize,
          this.massErrorTolerance.copy(),
        );
      } else {
        frame.extractFeatures(
          this.minimumFeatureExtractionSize,
          this.maximumFeatureGapSize,
          this.massErrorTolerance.copy(),
        );
      }
      console.log("Done extracting features");
    }
    if (!frame.deconvolutedFeatures() && this.doDeconvolution) {
      if (!this.isotopicModels) throw new Error(this.isotopicModels);
      console.log("Deconvolving features");
      if (frame.msLevel == 1) {
        frame.deconvolveFeatures(
          this.minimumFeatureExtractionSize,
          this.maximumFeatureGapSize,
          this.deconvolutionScore,
          this.isotopicModels.map((i) => i.copy()),
          this.massErrorTolerance.copy(),
        );
      } else {
        frame.deconvolveFeatures(
          this.minimumFeatureExtractionSize,
          this.maximumFeatureGapSize,
          this.deconvolutionScore,
          this.isotopicModels.map((i) => i.copy())
        );
      }
      console.log("Done deconvolving features");
    }
    return frame;
  }

  applySpectrum(spectrum: Spectrum) {
    if (this.reprofile) {
      spectrum.reprofile(0.001, 0.01);
    }
    if (this.denoiseScale > 0) {
      spectrum.denoise(this.denoiseScale);
    }
    if (!spectrum.deconvolutedPeaks() && this.doDeconvolution) {
      if (!this.isotopicModels) {
        throw new Error(this.isotopicModels);
      }
      spectrum.deconvolve(
        this.deconvolutionScore,
        this.isotopicModels.map((i) => i.copy())
      );
    }
    return spectrum;
  }

  apply(spectrum: Spectrum | IonMobilityFrame) {
    console.log("Applying", this);
    if (spectrum instanceof IonMobilityFrame) {
      return this.applyIonMobilityFrame(spectrum);
    } else if (spectrum.hasIonMobilityDimension()) {
      const frame = spectrum.asIonMobilityFrame();
      return this.applyIonMobilityFrame(frame);
    } else {
      return this.applySpectrum(spectrum);
    }
  }
}

export class SpectrumViewerState {
  spectrumData: SpectrumData | null;
  processingParams: ProcessingParams;
  mzReader: MZReader | null;
  currentSpectrumIdx: number | null;

  constructor(
    spectrumData: SpectrumData | null,
    processingParams: ProcessingParams,
    mzReader: MZReader | null,
    currentSpectrumIdx: number | null
  ) {
    this.spectrumData = spectrumData;
    this.processingParams = processingParams;
    this.mzReader = mzReader;
    this.currentSpectrumIdx = currentSpectrumIdx;
  }

  copy() {
    return new SpectrumViewerState(
      this.spectrumData,
      this.processingParams,
      this.mzReader,
      this.currentSpectrumIdx
    );
  }

  loadCurrentGroup(spectrum: Spectrum | IonMobilityFrame) {
    if (
      (spectrum.msLevel || 0) == 1 &&
      this.mzReader &&
      this.currentSpectrumIdx
    ) {
      this.mzReader.setDataLoading(true);
      const group = this.mzReader.groupAt(this.currentSpectrumIdx);
      this.mzReader.setDataLoading(false);
      return group;
    }
  }

  loadCurrentSpectrum() {
    if (!this.mzReader || this.currentSpectrumIdx == null) {
      return;
    }
    this.mzReader.setDataLoading(true);
    let spectrum: Spectrum | IonMobilityFrame | undefined = this.mzReader.at(
      this.currentSpectrumIdx
    );
    this.mzReader.setDataLoading(false);
    if (spectrum === undefined) {
      return;
    }
    spectrum = this.processingParams.apply(spectrum);
    const group = this.loadCurrentGroup(spectrum);
    this.spectrumData = new SpectrumData(spectrum, group);
    return this.spectrumData;
  }

  static default() {
    return new this(null, ProcessingParams.default(), null, null);
  }

  get spectraAvailable() {
    return this.mzReader ? this.mzReader.length : 0;
  }

  get currentSpectrumID() {
    return this.spectrumData?.id;
  }
}

export enum ViewerActionType {
  MZReader,
  CurrentSpectrumIdx,
  ProcessingParams,
}

export type SpectrumViewerAction =
  | { type: ViewerActionType.MZReader; value: MZReader | null }
  | { type: ViewerActionType.ProcessingParams; value: ProcessingParams | null }
  | { type: ViewerActionType.CurrentSpectrumIdx; value: number | null };

export const viewReducer = (
  state: SpectrumViewerState,
  action: SpectrumViewerAction
) => {
  const nextState = state.copy();
  switch (action.type) {
    case ViewerActionType.MZReader: {
      nextState.mzReader = action.value;
      nextState.currentSpectrumIdx = null;
      nextState.spectrumData = null;
      break;
    }
    case ViewerActionType.CurrentSpectrumIdx: {
      nextState.currentSpectrumIdx = action.value;
      break;
    }
    case ViewerActionType.ProcessingParams: {
      if (action.value != null) {
        nextState.processingParams = action.value;
      }
      break;
    }
  }
  nextState.loadCurrentSpectrum();
  return nextState;
};

const SpectrumViewerContext = createContext(SpectrumViewerState.default());
const SpectrumViewerDispatchContext =
  createContext<Dispatch<SpectrumViewerAction> | null>(null);

interface SpectrumProviderProps {
  children: (string | JSX.Element)[] | (string | JSX.Element);
}

export function SpectrumViewerProvider({ children }: SpectrumProviderProps) {
  const [state, dispatch] = useReducer(
    viewReducer,
    SpectrumViewerState.default()
  );
  return (
    <SpectrumViewerContext.Provider value={state}>
      <SpectrumViewerDispatchContext.Provider value={dispatch}>
        {children}
      </SpectrumViewerDispatchContext.Provider>
    </SpectrumViewerContext.Provider>
  );
}

export function useSpectrumViewer() {
  return useContext(SpectrumViewerContext);
}

export function useSpectrumViewerDispatch(): Dispatch<SpectrumViewerAction> {
  const ctx = useContext(SpectrumViewerDispatchContext);
  if (ctx == null) {
    throw new Error("Using SpectrumViewerState out of context!");
  }
  return ctx;
}

export //https://stackoverflow.com/a/2117523/1137920
function uuidv4(): string {
  return (([1e7] as any) + -1e3 + -4e3 + -8e3 + -1e11).replace(
    /[018]/g,
    (c: number) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16)
  );
}
