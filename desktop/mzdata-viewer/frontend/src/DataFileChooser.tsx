import Button from "@mui/material/Button";
import FileOpenIcon from "@mui/icons-material/FileOpen";

import { openMZReader, ReaderHandle } from "./reader"

interface DataFileChooserProps {
  dataFile: ReaderHandle | null;
  setDataFile: Function;
}


export function DataFileChooser({
  dataFile,
  setDataFile,
}: DataFileChooserProps) {
  return (
    <Button
      component="label"
      role={undefined}
      variant="contained"
      tabIndex={-1}
      startIcon={<FileOpenIcon />}
      onClick={ () => {
        openMZReader().then(handle => {
            handle ? setDataFile(handle) : setDataFile(null)
        })
      }
    }>
      {dataFile ? dataFile.key : "Choose File"}
    </Button>
  );
}
