import FormControl from "@mui/material/FormControl";
import ListItem from "@mui/material/ListItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import InputLabel from "@mui/material/InputLabel";
import Input from "@mui/material/Input";
import List from "@mui/material/List";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

import {
  ProcessingParams,
  useSpectrumViewer,
  useSpectrumViewerDispatch,
  ViewerActionType,
} from "./util";
import { IsotopicModel } from "mzdata";
import * as mzdata from 'mzdata';

export interface IsotopicModelOption {
  model: IsotopicModel;
  displayName: string;
}

const MODELS = [
  IsotopicModel.peptide(),
  IsotopicModel.glycopeptide(),
  IsotopicModel.glycan(),
];

export const ISOTOPIC_MODELS: IsotopicModelOption[] = MODELS.map((i) => {
  return {
    model: i,
    displayName: i.name,
  };
});

export function ProcessingConfiguration() {
  const viewState = useSpectrumViewer();
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
