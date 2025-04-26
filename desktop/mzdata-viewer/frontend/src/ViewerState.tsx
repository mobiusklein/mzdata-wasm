import { createContext, Dispatch, useContext, useState } from "react";
// import * as mzdata from "mzdata";
import { Spectrum, IonMobilityFrame } from "mzdata";
import { ProcessingParams, SpectrumData } from "mzdata-viewer/src/util";
import { MZReaderHandle } from "./reader";
import _ from "lodash";


export class SpectrumViewerState {
  spectrumData: SpectrumData | null;
  processingParams: ProcessingParams;
  mzReader: MZReaderHandle | null;
  currentSpectrumIdx: number | null;

  constructor(
    spectrumData: SpectrumData | null,
    processingParams: ProcessingParams,
    mzReader: MZReaderHandle | null,
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

  async loadCurrentSpectrum() {
    if (!this.mzReader || this.currentSpectrumIdx == null) {
      return;
    }
    this.mzReader.setDataLoading(true);
    let spectrum: Spectrum | IonMobilityFrame | undefined =
      await this.mzReader.at(this.currentSpectrumIdx, this.processingParams);
    this.mzReader.setDataLoading(false);
    if (spectrum === undefined) {
      return;
    }
    // spectrum = this.processingParams.apply(spectrum);
    this.spectrumData = new SpectrumData(spectrum);
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
  | { type: ViewerActionType.MZReader; value: MZReaderHandle | null }
  | { type: ViewerActionType.ProcessingParams; value: ProcessingParams | null }
  | { type: ViewerActionType.CurrentSpectrumIdx; value: number | null };


function useAsyncReducer<T, A>(
  reducer: (state: T | null, action: A) => Promise<T>,
  initialState: T
): [T, (action: A) => Promise<void>] {
  const [state, setState] = useState(initialState);

  const dispatch = async (action: A) => {
    const result = reducer(state, action);
    const newState = await result;
    setState(newState);
  };

  return [state, dispatch];
};


export const viewReducer = async (
  state: SpectrumViewerState | null,
  action: SpectrumViewerAction,
) => {
  const nextState = state ? state.copy() : SpectrumViewerState.default();
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
  await nextState.loadCurrentSpectrum();
  return nextState
};



const SpectrumViewerContext = createContext(SpectrumViewerState.default());
const SpectrumViewerDispatchContext =
  createContext<Dispatch<SpectrumViewerAction> | null>(null);

interface SpectrumProviderProps {
  children: (string | JSX.Element)[] | (string | JSX.Element);
}



interface SpectrumProviderProps {
  children: (string | JSX.Element)[] | (string | JSX.Element);
}

export function SpectrumViewerProvider({ children }: SpectrumProviderProps) {
  const [state, dispatch] = useAsyncReducer(
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