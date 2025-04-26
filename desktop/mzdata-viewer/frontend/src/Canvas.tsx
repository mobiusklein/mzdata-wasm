import { IonMobilityFrame } from "mzdata";
import { CanvasActionType, SpectrumCanvasAction, CanvasState } from "mzdata-viewer/src/canvas/component"

import Button from "@mui/material/Button";
import React from "react";

import { useSpectrumViewer } from "./ViewerState";


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
