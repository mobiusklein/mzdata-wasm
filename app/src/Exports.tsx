import { Spectrum, writeMGF, writeMzML } from "mzdata";
import { SpectrumViewerState, useSpectrumViewer } from "./util";
import Button from "@mui/material/Button";
import SaveAltIcon from '@mui/icons-material/SaveAlt';


async function saveToMGF(state: SpectrumViewerState) {
    if (state.spectrumData) {
      if (state.spectrumData.spectrum instanceof Spectrum) {
        const buffer = writeMGF([state.spectrumData.spectrum]);
        const dialog = globalThis.showSaveFilePicker({
            id: "mzdata-viewer",
            suggestedName: "spectrum.mgf"
        })
        dialog.then(async (handle) => {
          const stream = await handle.createWritable();
          await stream.write(buffer)
          await stream.close()
        });
      }
    }
}

async function saveToMzML(state: SpectrumViewerState) {
    if (state.spectrumData && state.mzReader) {
      if (state.spectrumData.spectrum instanceof Spectrum) {
        const buffer = writeMzML([state.spectrumData.spectrum], state.mzReader);
        const dialog = globalThis.showSaveFilePicker({
          id: "mzdata-viewer",
          suggestedName: "spectrum.mzML",
        });
        dialog.then(async (handle) => {
          const stream = await handle.createWritable();
          await stream.write(buffer);
          await stream.close();
        });
      }
    }
}


export function Exports() {
    const state = useSpectrumViewer();
    if (state.spectrumData == null) {
        return <></>
    }
    return <>
          <h3>Export Options</h3>
          {
            (state.spectrumData.spectrum.msLevel || 0) > 1 ? (
              <Button
                startIcon={<SaveAltIcon />}
                variant="contained"
                sx={{ m: 1 }}
                onClick={async (_e) => await saveToMGF(state)}
              >
                Save Processed MGF
              </Button>
            ) : (
              <></>
            )
          }
          {
            state.spectrumData ? (
              <>
                <Button
                  startIcon={<SaveAltIcon />}
                  variant="contained"
                  sx={{ m: 1 }}
                  onClick={async (_e) => await saveToMzML(state)}
                >
                  Save Processed mzML
                </Button>
              </>
            ) : (
              <></>
            )
          }
        </>
}