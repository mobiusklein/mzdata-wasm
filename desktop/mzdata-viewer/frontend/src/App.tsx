import { useState, Fragment, useEffect } from 'react'
import * as mzdata from "mzdata";
import './App.css'
import { ReaderHandle, } from "./reader";



import useMediaQuery from "@mui/material/useMediaQuery";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { styled } from '@mui/material/styles';
import Drawer from "@mui/material/Drawer";
import Divider from "@mui/material/Divider";
import FormControl from '@mui/material/FormControl/FormControl';
import ListItem from '@mui/material/ListItem';
import List from '@mui/material/List';
import Input from '@mui/material/Input';
import InputLabel from '@mui/material/InputLabel';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

import { ProcessingParams } from 'mzdata-viewer/src/util';
import { SpectrumViewerProvider, SpectrumViewerState, useSpectrumViewer, useSpectrumViewerDispatch, ViewerActionType } from './ViewerState';
import { ISOTOPIC_MODELS, IsotopicModelOption } from 'mzdata-viewer/src/ProcessingConfig';
import { DataFileChooser } from './DataFileChooser';
import { SpectrumList } from './SpectrumList';
import { SpectrumCanvasComponent2 } from './Canvas';


export const Offset = styled("div")(({ theme }) => theme.mixins.toolbar);

interface HeaderProps {
  children: string | JSX.Element | JSX.Element[];
}

export function Header({ children }: HeaderProps) {
  return (
    <Fragment>
      <AppBar position="fixed" id="application-header" style={{ zIndex: 999 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Testing <code>mzdata</code> + <code>WASM</code>
          </Typography>
          {children}
        </Toolbar>
      </AppBar>
      <Offset />
    </Fragment>
  );
}


export function ProcessingConfiguration({ viewState }: { viewState: SpectrumViewerState }) {
  const viewDispatch = useSpectrumViewerDispatch();
  const processingParams = viewState.processingParams;

  const currentModels = [];
  const remainingModels = [];
  for (let model of ISOTOPIC_MODELS) {
    const found = processingParams.isotopicModels.find(
      (i) => i.name == model.displayName
    );
    if (found) {
      currentModels.push(model);
    } else {
      remainingModels.push(model);
    }
  }

  const setProcessingParams = (params: ProcessingParams) => {
    debugger
    viewDispatch({
      type: ViewerActionType.ProcessingParams,
      value: params,
    });
  };

  return (
    <List>
      <ListItem>
        <FormControl sx={{}}>
          <FormControlLabel
            style={{ height: "100%", marginLeft: "0.1em" }}
            control={
              <Checkbox
                onChange={(event) => {
                  const newValue = event.target.checked;
                  if (newValue != processingParams.reprofile) {
                    const nextParams = processingParams.copy();
                    nextParams.reprofile = newValue;
                    setProcessingParams(nextParams);
                  }
                }}
                checked={processingParams.reprofile}
              />
            }
            label="Reprofile"
          />
        </FormControl>
      </ListItem>
      <ListItem>
        <FormControl sx={{ m: 1 }}>
          <InputLabel htmlFor="denoise-level">Denoising</InputLabel>
          <Input
            id="denoise-level"
            type="number"
            value={processingParams.denoiseScale}
            aria-valuemin={0}
            onChange={(event) => {
              let newValue = parseFloat(event.target.value);
              if (isNaN(newValue)) {
                return;
              }
              if (newValue != processingParams.denoiseScale) {
                const nextParams = processingParams.copy();
                nextParams.denoiseScale = newValue;
                setProcessingParams(nextParams);
              }
            }}
          />
        </FormControl>
      </ListItem>
      <ListItem>
        <FormControl sx={{}}>
          <FormControlLabel
            style={{ height: "100%", marginLeft: "0.1em" }}
            control={
              <Checkbox
                onChange={(event) => {
                  const newValue = event.target.checked;
                  if (newValue != processingParams.doDeconvolution) {
                    const nextParams = processingParams.copy();
                    nextParams.doDeconvolution = newValue;
                    setProcessingParams(nextParams);
                  }
                }}
                checked={processingParams.doDeconvolution}
              />
            }
            label="Deconvolve"
          />
        </FormControl>
      </ListItem>
      <ListItem>
        <FormControl sx={{ m: 1 }}>
          <InputLabel htmlFor="deconvolution-score">
            Deconvolution Score
          </InputLabel>
          <Input
            id="deconvolution-score"
            type="number"
            value={processingParams.deconvolutionScore}
            aria-valuemin={0}
            onChange={(event) => {
              let newValue = parseFloat(event.target.value);
              if (isNaN(newValue)) {
                return;
              }
              if (newValue != processingParams.deconvolutionScore) {
                const nextParams = processingParams.copy();
                nextParams.deconvolutionScore = newValue;
                setProcessingParams(nextParams);
              }
            }}
          />
        </FormControl>
      </ListItem>
      <ListItem>
        <Autocomplete
          multiple
          id="isotopic-models"
          fullWidth={true}
          options={remainingModels}
          getOptionLabel={(opt: IsotopicModelOption) => opt.displayName}
          value={currentModels}
          onChange={(_e, newValue) => {
            if (!newValue || newValue.length == 0) return;
            const nextParams = processingParams.copy();
            nextParams.isotopicModels = newValue.map((i) => i.model);
            setProcessingParams(nextParams);
          }}
          renderInput={(params) => {
            return (
              <TextField
                {...params}
                variant="standard"
                label="Isotopic Models"
                placeholder="Isotopic models"
              />
            );
          }}
        />
      </ListItem>
      <ListItem>
        <FormControl sx={{ m: 1 }}>
          <InputLabel htmlFor="feature-extraction-size">
            Feature Minimum Size
          </InputLabel>
          <Input
            id="feature-extraction-size"
            type="number"
            value={processingParams.minimumFeatureExtractionSize}
            aria-valuemin={0}
            onChange={(event) => {
              let newValue = parseFloat(event.target.value);
              if (isNaN(newValue)) {
                return;
              }
              if (newValue != processingParams.minimumFeatureExtractionSize) {
                const nextParams = processingParams.copy();
                nextParams.minimumFeatureExtractionSize = newValue;
                setProcessingParams(nextParams);
              }
            }}
          />
        </FormControl>
      </ListItem>
      <ListItem>
        <FormControl sx={{ m: 1 }}>
          <InputLabel htmlFor="feature-extraction-gap-size">
            Feature Gap Size
          </InputLabel>
          <Input
            id="feature-extraction-gap-size"
            type="number"
            value={processingParams.maximumFeatureGapSize}
            aria-valuemin={0}
            onChange={(event) => {
              let newValue = parseFloat(event.target.value);
              if (isNaN(newValue)) {
                return;
              }
              if (newValue != processingParams.maximumFeatureGapSize) {
                const nextParams = processingParams.copy();
                nextParams.maximumFeatureGapSize = newValue;
                setProcessingParams(nextParams);
              }
            }}
          />
        </FormControl>
      </ListItem>
      <ListItem>
        <FormControl sx={{ m: 1 }}>
          <InputLabel htmlFor="mass-error-tolerance">
            Mass Error Tolerance
          </InputLabel>
          <Input
            id="mass-error-tolerance"
            type="text"
            value={processingParams.massErrorTolerance}
            aria-valuemin={0}
            onChange={(event) => {
              let newValue = mzdata.Tolerance.parse(event.target.value);
              if (newValue != processingParams.massErrorTolerance) {
                const nextParams = processingParams.copy();
                nextParams.massErrorTolerance = newValue;
                setProcessingParams(nextParams);
              }
            }}
          />
        </FormControl>
      </ListItem>
    </List>
  );
}



// Permanent Drawer Pattern
export function SideMenu({ viewState }: { viewState: SpectrumViewerState }) {
  const isMobile = useMediaQuery("(max-width:500px)");
  const drawerWidth = isMobile ? "10em" : "15%";
  return (
    <>
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          zIndex: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
            zIndex: 0,
          },
        }}
        variant="permanent"
        anchor="left"
      >
        <Toolbar />
        <Divider />
        <h3>Processing Configuration</h3>
        <ProcessingConfiguration viewState={viewState} />
        <Divider />
      </Drawer>
    </>
  );
}



export function Frame() {
  const [dataFile, setDataFile] = useState<ReaderHandle | null>(null);
  const viewStateDispatch = useSpectrumViewerDispatch();
  const viewState = useSpectrumViewer();

  console.log("Base State", viewState);

  useEffect(() => {
    let i = 0;
    if (dataFile) {
      console.log("Opening", dataFile);
      dataFile.loadHeadersStreaming((handle) => {
        console.log("Finished opening", dataFile);
        viewStateDispatch({
          type: ViewerActionType.MZReader,
          value: handle,
        });
      }, (handle) => {
        i++;
        console.log(`Loaded batch ${i} for ${handle.key}`)
        if (i == 1) {
          viewStateDispatch({
            type: ViewerActionType.MZReader,
            value: handle,
          });
        }
      }).then((value) => {
        viewStateDispatch({
          type: ViewerActionType.MZReader,
          value,
        });
      });
    } else {
      viewStateDispatch({
        type: ViewerActionType.MZReader,
        value: null,
      });
    }
  }, [dataFile]);

  return (
    <>
      <Header>
        <DataFileChooser dataFile={dataFile} setDataFile={setDataFile} />
      </Header>
      <div>
        <SideMenu viewState={viewState} />
      </div>
      <div>
        <SpectrumCanvasComponent2 />
      </div>
      <div>{viewState.mzReader ? <SpectrumList /> : <div></div>}</div>
    </>
  );
}


function App() {
    return (
      <SpectrumViewerProvider>
        <Frame />
      </SpectrumViewerProvider>
    );
}


export default App
