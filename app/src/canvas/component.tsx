import * as React from "react";
import { IonMobilityFrame, Spectrum } from "mzdata";
import {
  FeatureMapCanvas,
  FeatureProfileCanvas,
  ScanRange,
  SpectrumCanvas,
} from "./canvas";
import "./component.css";
import {
  FeatureMapLayerBase,
  FeatureProfileLineLayer,
  LayerBase,
  PointLike,
  FeatureProfilePoint,
  FeatureCanvasPoint,
  FeatureProfileLineLayerCollection,
} from "./layers";
import { useSpectrumViewer, uuidv4 } from "../util";
// import useMediaQuery from "@mui/material/useMediaQuery";
import * as mzdata from "mzdata";
import { Button, } from "@mui/material";
import { range } from "lodash";

export interface SpectrumData {
  id: string;
  spectrum: Spectrum | IonMobilityFrame;
  layers: LayerBase<PointLike>[];
  scanRange?: ScanRange;
}

export interface CanvasProps {
  spectrumData: SpectrumData | null;
}

export function SpectrumCanvasComponent() {
  const canvasHolder = React.useRef<HTMLDivElement | null>(null);
  const canvasHolder2 = React.useRef<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = React.useState<
    SpectrumCanvas | FeatureMapCanvas | FeatureProfileCanvas | null
  >(null);
  const [canvasId] = React.useState(() => uuidv4());

  const [showFeatureProfiles, setShowFeatureProfiles] = React.useState(false);

  const viewerState = useSpectrumViewer();
  const spectrumData = viewerState.spectrumData;

  // const isMobile = useMediaQuery("(max-width:500px)");

  const profileCanvasSwitch = () => () =>
    setShowFeatureProfiles(!showFeatureProfiles);

  const canvasIsCompatibleWith = () => {
    const yesSpec =
      canvas instanceof SpectrumCanvas &&
      spectrumData?.spectrum instanceof Spectrum;
    const yesFeatures =
      canvas instanceof FeatureMapCanvas &&
      spectrumData?.spectrum instanceof IonMobilityFrame;
    return yesSpec || yesFeatures;
  };

  const createCanvas = () => {
    if (canvasHolder.current) {
      const isSpectrum = spectrumData?.spectrum instanceof mzdata.Spectrum;
      const isFrame = spectrumData?.spectrum instanceof mzdata.IonMobilityFrame;
      if (canvas != null) {
        canvas.clear();
      }
      if (isSpectrum) {
        setCanvas(
          new SpectrumCanvas(
            `#${canvasHolder.current.id}`,
            0,
            0,
            undefined,
            [],
            spectrumData?.id,
            spectrumData?.scanRange
          )
        );
      } else if (isFrame) {
        if (showFeatureProfiles && canvasHolder2.current != null) {
          // const profileCanvas = new FeatureProfileCanvas(
          //   `#${canvasHolder2.current.id}`,
          //   0,
          //   0,
          //   undefined,
          //   [],
          //   spectrumData?.id,
          //   spectrumData?.scanRange,
          //   {
          //     xLabel: "ion mobility",
          //     yLabel: "intensity",
          //   }
          // );
        }
        setCanvas(
          new FeatureMapCanvas(
            `#${canvasHolder.current.id}`,
            0,
            0,
            undefined,
            [],
            spectrumData?.id,
            spectrumData?.scanRange
          )
        );
      } else {
      }
    }
  };

  React.useLayoutEffect(() => {
    createCanvas();
  }, [canvasHolder]);

  React.useEffect(() => {
    console.log("Canvas:", canvas);
    if (canvas === null) {
      if (spectrumData) {
        createCanvas();
        return;
      } else {
        return;
      }
    }
    if (spectrumData == null) {
      canvas.remove();
      return;
    }
    if (!canvasIsCompatibleWith()) {
      canvas.remove();
      createCanvas();
    }
    const idMatch = canvas.spectrumID == spectrumData.id;
    if (canvas.layers !== spectrumData.layers) {
      console.log("Updating graph");
      let extent = canvas.extentCoordinateInterval;
      if (canvas.layers.length) {
        canvas.clear();
      }
      canvas.spectrumID = spectrumData.id;

      if (
        showFeatureProfiles &&
        spectrumData.spectrum instanceof IonMobilityFrame
      ) {
        const layers = (
          spectrumData.spectrum.features() as mzdata.Feature[]
        ).map((f) => {
          const points = range(0, f.length).map((i) =>
            FeatureProfilePoint.fromSource(f.at(i) as mzdata.FeaturePoint)
          );
          return new FeatureProfileLineLayer(points, {}, f);
        });
        canvas.addLayers(layers);
      }
      canvas.addLayers(spectrumData.layers as LayerBase<FeatureCanvasPoint>[]);

      canvas.render();
      if (!idMatch) {
        canvas.setExtentByCoordinate(undefined, undefined);
      } else if (extent !== undefined) {
        if (!(extent[0] === 0 && extent[1] === 0)) {
          canvas.setExtentByCoordinate(extent[0], extent[1]);
        }
      }
    }
  }, [spectrumData, canvas, showFeatureProfiles]);
  return (
    <div>
      <div className="spectrum-view-container">
        <div
          className="spectrum-canvas"
          id={`spectrum-canvas-container-${canvasId}`}
          ref={canvasHolder}
        />
        <div className="profile-view-container">
          <div
            className="spectrum-canvas"
            id={`profile-canvas-container-${canvasId}`}
            ref={canvasHolder2}
            style={{ display: showFeatureProfiles ? "block" : "none" }}
          />
        </div>
      </div>
      {spectrumData?.spectrum instanceof IonMobilityFrame ? (
        <Button
          component="label"
          role={undefined}
          variant="contained"
          tabIndex={-1}
          style={{ marginRight: "1em" }}
          onClick={profileCanvasSwitch()}
        >
          {showFeatureProfiles ? <>Hide Profiles</> : <>Show Profiles</>}
        </Button>
      ) : (
        <></>
      )}
    </div>
  );
}

export enum CanvasActionType {
  SetData,
  CreateCanvas,
  ToggleFeatureProfiles,
  RenderCanvas,
}

export type SpectrumCanvasAction =
  | { type: CanvasActionType.SetData; data: SpectrumData | null }
  | {
      type: CanvasActionType.CreateCanvas;
      canvas: SpectrumCanvas | FeatureMapCanvas | null;
      canvas2: FeatureProfileCanvas | null;
    }
  | {
      type: CanvasActionType.ToggleFeatureProfiles;
    }
  | {
      type: CanvasActionType.RenderCanvas;
    };

export class CanvasState {
  id: string;
  spectrumData: SpectrumData | null;
  canvas: SpectrumCanvas | FeatureMapCanvas | null;
  profileCanvas: FeatureProfileCanvas | null;
  showFeatureProfiles: boolean;
  canvasHolder: React.MutableRefObject<HTMLDivElement | null>;
  profileCanvasHolder: React.MutableRefObject<HTMLDivElement | null>;

  constructor(
    id: string,
    spectrumData: SpectrumData | null,
    canvas: SpectrumCanvas | FeatureMapCanvas | null,
    profileCanvas: FeatureProfileCanvas | null,
    showFeatureProfiles: boolean,
    canvasHolder: React.MutableRefObject<HTMLDivElement | null>,
    profileCanvasHolder: React.MutableRefObject<HTMLDivElement | null>
  ) {
    this.id = id;
    this.spectrumData = spectrumData;
    this.canvas = canvas;
    this.profileCanvas = profileCanvas;
    this.showFeatureProfiles = showFeatureProfiles;
    this.canvasHolder = canvasHolder;
    this.profileCanvasHolder = profileCanvasHolder;
  }

  copy() {
    return new CanvasState(
      this.id,
      this.spectrumData,
      this.canvas,
      this.profileCanvas,
      this.showFeatureProfiles,
      this.canvasHolder,
      this.profileCanvasHolder
    );
  }

  static createEmpty(
    canvasHolder: React.MutableRefObject<HTMLDivElement | null>,
    profileCanvasHolder: React.MutableRefObject<HTMLDivElement | null>
  ) {
    return new CanvasState(
      uuidv4(),
      null,
      null,
      null,
      false,
      canvasHolder,
      profileCanvasHolder
    );
  }

  isSpectrum() {
    return this.spectrumData?.spectrum instanceof mzdata.Spectrum;
  }

  isFrame() {
    return this.spectrumData?.spectrum instanceof mzdata.IonMobilityFrame;
  }

  isCanvasCompatibleWithData() {
    const yesSpec = this.canvas instanceof SpectrumCanvas && this.isSpectrum();
    const yesFeatures =
      this.canvas instanceof FeatureMapCanvas && this.isFrame();
    return yesSpec || yesFeatures;
  }

  createCanvas() {
    const isSpectrum = this.isSpectrum();
    const isFrame = this.isFrame();
    if (this.canvasHolder.current) {
      if (this.canvas != null) {
        this.clearCanvas();
      }
      if (isSpectrum) {
        this.canvas = new SpectrumCanvas(
          `#${this.canvasHolder.current.id}`,
          0,
          0,
          undefined,
          [],
          this.spectrumData?.id,
          this.spectrumData?.scanRange
        );
      } else if (isFrame) {
        if (
          this.showFeatureProfiles &&
          this.profileCanvasHolder.current != null
        ) {
          this.profileCanvas = new FeatureProfileCanvas(
            `#${this.profileCanvasHolder.current.id}`,
            0,
            250,
            undefined,
            [],
            this.spectrumData?.id,
            this.spectrumData?.scanRange,
            {
              xLabel: "ion mobility",
              yLabel: "intensity",
            }
          );
        }

        this.canvas = new FeatureMapCanvas(
          `#${this.canvasHolder.current.id}`,
          0,
          0,
          undefined,
          [],
          this.spectrumData?.id,
          this.spectrumData?.scanRange
        );

        if (this.profileCanvas) {
          this.profileCanvas.sourceCanvas = this.canvas as FeatureMapCanvas;
        }
      } else {
        this.clearCanvas();
        this.canvas = null;
        this.profileCanvas = null;
      }
    }
  }

  clearCanvas() {
    this.canvas?.clear();
    this.profileCanvas?.clear();
    this.canvas?.removeRedrawEventHandlers();

    // Since the operation
    if (this.canvasHolder.current) {
      while (this.canvasHolder.current.firstChild) {
        this.canvasHolder.current.removeChild(
          this.canvasHolder.current.firstChild
        );
      }
    }

    if (this.profileCanvasHolder.current) {
      while (this.profileCanvasHolder.current.firstChild) {
        this.profileCanvasHolder.current.removeChild(
          this.profileCanvasHolder.current.firstChild
        );
      }
    }
  }

  renderCanvas() {
    console.log("Rendering", this);
    this.clearCanvas();
    if (this.canvasHolder.current == null) return;
    if (this.spectrumData == null) {
      this.clearCanvas();
      return;
    }
    if (this.canvas == null) {
      this.createCanvas();
      if (this.canvas == null) {
        return;
      }
    }

    const idMatch = this.canvas?.spectrumID == this.spectrumData?.id;
    if (this.canvas?.layers !== this.spectrumData?.layers) {
      console.log("Updating graph");
      let extent = this.canvas.extentCoordinateInterval;

      this.clearCanvas();
      this.canvas.spectrumID = this.spectrumData.id;

      if (
        this.showFeatureProfiles &&
        this.spectrumData.spectrum instanceof IonMobilityFrame &&
        this.profileCanvas
      ) {
        let layers =
          this.spectrumData.spectrum.features()?.map((f) => {
            const smoothF = f.clone();
            smoothF.smooth(1);
            const points = range(0, f.length).map((i) =>
              FeatureProfilePoint.fromSource(
                smoothF.at(i) as mzdata.FeaturePoint
              )
            );
            return new FeatureProfileLineLayer(points, {}, f);
          }) || [];

        layers = layers.concat(
          this.spectrumData.spectrum.deconvolutedFeatures()?.map((f) => {
            const smoothF = f.clone();
            smoothF.smooth(1);
            const points = range(0, f.length).map((i) =>
              FeatureProfilePoint.fromSource(
                smoothF.at(i) as mzdata.FeaturePoint
              )
            );
            return new FeatureProfileLineLayer(points, {}, f);
          }) || []
        );
        this.profileCanvas.addLayer(
          new FeatureProfileLineLayerCollection(layers, {})
        );
      }
      this.canvas.addRedrawEventListener((source: FeatureMapCanvas) => {
        if (this.showFeatureProfiles && this.profileCanvas) {
          const [start, end] = source.extentCoordinateInterval
          this.profileCanvas.setMzRange(start, end);
          this.profileCanvas.render();
        }
      })
      this.canvas.addLayers(this.spectrumData.layers as FeatureMapLayerBase[]);
      this.canvas.render();
      if (this.showFeatureProfiles && this.profileCanvas) {
        this.profileCanvas.render()
      }
      if (!idMatch) {
        this.canvas.setExtentByCoordinate(undefined, undefined);
      } else if (extent !== undefined) {
        if (!(extent[0] === 0 && extent[1] === 0)) {
          this.canvas.setExtentByCoordinate(extent[0], extent[1]);
        }
      }
    }
  }

  checkBeforeRender() {
    if (this.canvas === null) {
      if (this.spectrumData) {
        this.createCanvas();
        return true;
      } else {
        return false;
      }
    }
    if (this.spectrumData == null) {
      this.clearCanvas();
      return false;
    }
    if (!this.isCanvasCompatibleWithData()) {
      this.clearCanvas();
      this.createCanvas();
    }
  }
}

const canvasReducer = (state: CanvasState, action: SpectrumCanvasAction) => {
  state.clearCanvas();
  const nextState = state.copy();
  console.log(action, state);
  switch (action.type) {
    case CanvasActionType.SetData: {
      nextState.spectrumData = action.data;
      if (!nextState.isCanvasCompatibleWithData() && nextState.spectrumData) {
        nextState.createCanvas();
      }
      if (nextState.spectrumData) nextState.renderCanvas();
      break;
    }
    case CanvasActionType.RenderCanvas: {
      if (nextState.spectrumData) nextState.renderCanvas();
      else nextState.clearCanvas();
      break;
    }
    case CanvasActionType.ToggleFeatureProfiles: {
      nextState.showFeatureProfiles = !nextState.showFeatureProfiles;
      // Force canvas creation
      nextState.createCanvas();
      if (nextState.spectrumData) nextState.renderCanvas();
      break;
    }
  }
  return nextState;
};

export function SpectrumCanvasComponent2() {
  const canvasHolder = React.useRef<HTMLDivElement | null>(null);
  const canvasHolder2 = React.useRef<HTMLDivElement | null>(null);

  const [state, dispatch] = React.useReducer(
    canvasReducer,
    CanvasState.createEmpty(canvasHolder, canvasHolder2)
  );

  const viewerState = useSpectrumViewer();
  const spectrumData = viewerState.spectrumData;

  // const isMobile = useMediaQuery("(max-width:500px)");

  const profileCanvasSwitch = () => () =>
    dispatch({ type: CanvasActionType.ToggleFeatureProfiles });

  React.useEffect(() => {
    dispatch({ type: CanvasActionType.SetData, data: spectrumData });
  }, [spectrumData]);
  return (
    <div>
      <div className="spectrum-view-container">
        <div
          className="spectrum-canvas"
          id={`spectrum-canvas-container-${state.id}`}
          ref={canvasHolder}
        />
        <div className="profile-view-container">
          <div
            className="spectrum-canvas"
            id={`profile-canvas-container-${state.id}`}
            ref={canvasHolder2}
            style={{
              display:
                state.showFeatureProfiles &&
                spectrumData?.spectrum instanceof IonMobilityFrame
                  ? "block"
                  : "none",
            }}
          />
        </div>
      </div>
      {spectrumData?.spectrum instanceof IonMobilityFrame ? (
        <div style={{ marginBottom: "0.2em" }}>
          <Button
            component="label"
            role={undefined}
            variant="contained"
            tabIndex={-1}
            style={{ marginRight: "1em" }}
            onClick={profileCanvasSwitch()}
          >
            {state.showFeatureProfiles ? (
              <>Hide Profiles</>
            ) : (
              <>Show Profiles</>
            )}
          </Button>
        </div>
      ) : (
        <></>
      )}
    </div>
  );
}
