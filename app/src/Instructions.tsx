import * as React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

export default function InstructionsDialog() {
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const descriptionElementRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (open) {
      const { current: descriptionElement } = descriptionElementRef;
      if (descriptionElement !== null) {
        descriptionElement.focus();
      }
    }
  }, [open]);

  return (
    <React.Fragment>
      <Button
        onClick={handleClickOpen()}
        component="label"
        role={undefined}
        variant="contained"
        tabIndex={-1}
        style={{ marginRight: "1em" }}
      >
        Instructions
      </Button>
      <Dialog
        open={open}
        onClose={handleClose}
        scroll="paper"
        aria-labelledby="scroll-dialog-title"
        aria-describedby="scroll-dialog-description"
        fullWidth={true}
        maxWidth={"md"}
      >
        <DialogTitle id="scroll-dialog-title">Instructions</DialogTitle>
        <DialogContent dividers={true}>
          <DialogContentText
            id="scroll-dialog-description"
            ref={descriptionElementRef}
            tabIndex={-1}
          >
            <p>
              This application runs entirely in the web browser, doing most of
              the processing with the <code>mzdata-wasm</code> library.
            </p>
            <p>
              Pick an
              <code>.mzML</code> or <code>.mgf</code> file and the application
              will lazily load spectra to view. The application includes a set
              of signal processing functions controlled from the sidebar.
            </p>
            <p>
              <ul>
                <li>
                  <b>Reprofiling</b> - Convert centroid spectra into profile spectra
                  ease of viewing and allows denoising.
                </li>
                <li>
                  <b>Denoising</b> - Apply an iterative denoising and baseline
                  reduction.
                </li>
                <li>
                  <b>Deconvolution</b> - Apply a pre-configured <code>mzdeisotope</code> charge
                  state deconvolution treatment to identify isotopic patterns.
                </li>
              </ul>
            </p>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Dismiss</Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
}
