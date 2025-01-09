import { useState, useEffect, Fragment } from 'react'
import './App.css'

import { DataFileChooser } from "./DataFileChooser";
import { MZReader } from "mzdata";
import { SpectrumList } from './SpectrumList';
import { SpectrumCanvasComponent } from "./canvas/component"
import {
    SpectrumViewerProvider,
    useSpectrumViewer,
    useSpectrumViewerDispatch,
    ViewerActionType,
} from "./util";
import { ProcessingConfiguration } from './ProcessingConfig';

import useMediaQuery from "@mui/material/useMediaQuery";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { styled } from '@mui/material/styles';
import Drawer from "@mui/material/Drawer";
import Divider from "@mui/material/Divider";
import { Exports } from './Exports';
import InstructionsDialog from "./Instructions"

const Offset = styled("div")(({ theme }) => theme.mixins.toolbar);

interface HeaderProps {
    children: string | JSX.Element | JSX.Element[]
}

function Header({children}: HeaderProps) {
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


// Permanent Drawer Pattern
function SideMenu({}) {
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
          <ProcessingConfiguration />
          <Divider />
          <Exports />
        </Drawer>
      </>
    );
}


function Frame() {
    const [dataFile, setDataFile] = useState<File | null>(null);
    const viewStateDispatch = useSpectrumViewerDispatch();
    const viewState = useSpectrumViewer();

    console.log("Base State", viewState)

    useEffect(() => {
      if (dataFile) {
        console.log("Opening", dataFile);
        MZReader.open(dataFile).then((value) => {
          console.log("Finished opening", dataFile);
          // setCurrentSpectrum(null)
          // setMZReader(value)
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
          <InstructionsDialog />
          <DataFileChooser dataFile={dataFile} setDataFile={setDataFile} />
        </Header>
        <div>
          <SideMenu />
        </div>
        <div>
          <SpectrumCanvasComponent />
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
