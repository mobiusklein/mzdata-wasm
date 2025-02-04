import * as React from "react";
import { IonMobilityFrame, Spectrum } from "mzdata";
import { FeatureMapCanvas, ScanRange, SpectrumCanvas, } from "./canvas";
import "./component.css";
import { LayerBase } from "./layers";
import { useSpectrumViewer } from "../util";
// import useMediaQuery from "@mui/material/useMediaQuery";
import * as mzdata from 'mzdata';

//https://stackoverflow.com/a/2117523/1137920
function uuidv4(): string {
  return ([1e7] as any + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c: number) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}

export interface SpectrumData {
  id: string
  spectrum: Spectrum | IonMobilityFrame
  layers: LayerBase[]
  scanRange?: ScanRange
}

export interface CanvasProps {
  spectrumData: SpectrumData | null;
}


export function SpectrumCanvasComponent() {
  const canvasHolder = React.useRef<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = React.useState<SpectrumCanvas | FeatureMapCanvas | null>(null);
  const [canvasId] = React.useState(() => uuidv4());

  const viewerState = useSpectrumViewer()
  const spectrumData = viewerState.spectrumData;

  // const isMobile = useMediaQuery("(max-width:500px)");

  const canvasIsCompatibleWith = () => {
    const yesSpec = canvas instanceof SpectrumCanvas && spectrumData?.spectrum instanceof Spectrum
    const yesFeatures = canvas instanceof FeatureMapCanvas && spectrumData?.spectrum instanceof IonMobilityFrame

    return yesSpec || yesFeatures
  }

  const createCanvas = () => {
    if (canvasHolder.current) {

      const isSpectrum = spectrumData?.spectrum instanceof mzdata.Spectrum;
      const isFrame = spectrumData?.spectrum instanceof mzdata.IonMobilityFrame;

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
        ));
      } else if (isFrame) {
        setCanvas(new FeatureMapCanvas(
          `#${canvasHolder.current.id}`,
          0,
          0,
          undefined,
          [],
          spectrumData?.id,
          spectrumData?.scanRange
        ));
      } else {}
    }
  }

  React.useLayoutEffect(() => {
    createCanvas()
  }, [canvasHolder]);

  React.useEffect(() => {
    console.log("Canvas:", canvas)
    if (canvas === null) {
      if (spectrumData) {
        createCanvas()
        return
      } else {
        return
      }
    };
    if (spectrumData == null) {
      canvas.remove();
      return
    }
    if (!canvasIsCompatibleWith()) {
      canvas.remove()
      createCanvas()
    }
    const idMatch = canvas.spectrumID == spectrumData.id;
    if (canvas.layers !== spectrumData.layers) {
      console.log("Updating graph")
      let extent = canvas.extentCoordinateInterval;
      if (canvas.layers.length) {
        canvas.clear();
      }
      canvas.spectrumID = spectrumData.id;
      canvas.addLayers(spectrumData.layers);
      canvas.render();
      if (!idMatch) {
        canvas.setExtentByCoordinate(undefined, undefined)
      }
      else if (extent !== undefined) {
        if (!(extent[0] === 0 && extent[1] === 0)) {
          canvas.setExtentByCoordinate(extent[0], extent[1]);
        }
      }
    }
  }, [spectrumData, canvas]);
  return (
    <div className="spectrum-view-container">
      <div
        className="spectrum-canvas"
        id={`spectrum-canvas-container-${canvasId}`}
        ref={canvasHolder}
      />
    </div>
  );
}