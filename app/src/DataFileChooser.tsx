import { ChangeEvent } from "react";

import Button from "@mui/material/Button";
import { styled } from "@mui/material/styles";
import FileOpenIcon from "@mui/icons-material/FileOpen";

interface DataFileChooserProps {
  dataFile: File | null;
  setDataFile: Function;
}

const VisuallyHiddenInput = styled("input")({
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: 1,
  overflow: "hidden",
  position: "absolute",
  bottom: 0,
  left: 0,
  whiteSpace: "nowrap",
  width: 1,
});

export function DataFileChooser({ dataFile, setDataFile }: DataFileChooserProps) {
  const onChangeHandler = (e: ChangeEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    if (target?.files && target.files.length > 0) {
      console.log(`Updating data file`, dataFile, target.files);
      setDataFile(target.files[0]);
    } else {
      setDataFile(null);
    }
  };
  return (
    <Button
      component="label"
      role={undefined}
      variant="contained"
      tabIndex={-1}
      startIcon={<FileOpenIcon />}
    >
      { dataFile ? dataFile.name : "Choose File" }
      <VisuallyHiddenInput type="file" onChange={onChangeHandler} multiple accept=".mzml, .mgf, .mzml.gz, .mgf.gz" />
    </Button>
  );
}
