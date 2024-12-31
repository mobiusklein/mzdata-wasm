import { IsotopicModel, MZReader, Spectrum, SpectrumGroup } from "mzdata";
import {
  LayerBase,
  PointLayer,
  ProfileLayer,
  PrecursorPeakLayer,
  DeconvolutedLayer,
  IsolationWindowLayer,
} from "./canvas/layers";
import { createContext, Dispatch, useContext, useReducer } from "react";

export class SpectrumData {
  spectrum: Spectrum;
  layers: LayerBase[];
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

  constructor(spectrum: Spectrum, group?: SpectrumGroup) {
    this.spectrum = spectrum;
    this.group = group;
    this.layers = [];
    this.buildLayers();
  }

  buildLayers() {
    const spectrum = this.spectrum;
    if (spectrum.isProfile) {
      const arrayTable: any = spectrum.rawArrays();
      const mzs = arrayTable["m/z array"] as Float64Array;
      const intensities = arrayTable["intensity array"] as Float32Array;
      this.layers.push(new ProfileLayer(mzs, intensities, {}));
      const centroids = spectrum.centroidPeaks();
      if (centroids && centroids.length > 0) {
        this.layers.push(new PointLayer(centroids, {}));
      }
    } else {
      const points = spectrum.centroidPeaks() || [];
      if (points && points.length > 0) {
        this.layers.push(new PointLayer(points, {}));
      }
    }
    const deconvolutedCentroids = spectrum.deconvolutedPeaks();
    if (deconvolutedCentroids && deconvolutedCentroids.length > 0) {
      this.layers.push(
        new DeconvolutedLayer(deconvolutedCentroids, { strokeWidth: 0.5 })
      );
    }
    if (spectrum.msLevel > 1) {
      if (spectrum.precursor) {
        const precIon = spectrum.precursor.ions[0];
        const precursorPoint = {
          mz: precIon.mz,
          intensity: precIon.intensity,
          charge: precIon.charge || 0,
        };
        this.layers.push(new PrecursorPeakLayer(precursorPoint, {}));
      }
    }
    if (this.group) {
      const windows = this.group.products
        .map((x) => x.precursor?.isolationWindow)
        .filter((x) => x !== undefined);
      if (windows.length > 0) {
        const height = this.layers[0].maxIntensity();
        this.layers.push(new IsolationWindowLayer(windows, height, {}));
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

  constructor(
    deconvolutionScore: number,
    denoiseScale: number,
    reprofile: boolean,
    isotopicModels: IsotopicModel[],
    doDeconvolution?: boolean
  ) {
    this.deconvolutionScore = deconvolutionScore;
    this.denoiseScale = denoiseScale;
    this.reprofile = reprofile;
    this.isotopicModels = isotopicModels;
    this.doDeconvolution =
      doDeconvolution === undefined ? true : doDeconvolution;
  }

  copy(): ProcessingParams {
    return new ProcessingParams(
      this.deconvolutionScore,
      this.denoiseScale,
      this.reprofile,
      this.isotopicModels,
      this.doDeconvolution
    );
  }

  static default(): ProcessingParams {
    return new ProcessingParams(10, 1, false, [IsotopicModel.peptide()], true);
  }

  apply(spectrum: Spectrum) {
    console.log("Applying", this);
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

  loadCurrentGroup(spectrum: Spectrum) {
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
    const spectrum = this.mzReader.at(this.currentSpectrumIdx);
    this.mzReader.setDataLoading(false);
    if (spectrum === undefined) {
      return;
    }
    this.processingParams.apply(spectrum);
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
