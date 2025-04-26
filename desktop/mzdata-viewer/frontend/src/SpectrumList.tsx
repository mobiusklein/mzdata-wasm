import { TableComponents, TableVirtuoso } from "react-virtuoso";
import { useSpectrumViewer, useSpectrumViewerDispatch, ViewerActionType } from "./ViewerState";
import { Paper, Table, TableBody, TableContainer, TableHead, TableRow, useMediaQuery } from "@mui/material";
import { fixedHeaderContent, rowContent, RowContext } from "mzdata-viewer/src/SpectrumList";
import * as mzdata from 'mzdata';
import { forwardRef } from "react";


export const VirtuosoTableComponents: TableComponents<mzdata.Spectrum, RowContext> = {
  Scroller: forwardRef<HTMLDivElement>((props, ref) => (
    <TableContainer component={Paper} {...props} ref={ref} />
  )),
  Table: (props) => (
    <Table
      {...props}
      size={"small"}
      sx={{
        borderCollapse: "separate",
        tableLayout: "fixed",
        minWidth: "100%",
      }}
    />
  ),
  TableHead: forwardRef<HTMLTableSectionElement>((props, ref) => (
    <TableHead {...props} ref={ref} />
  )),
  TableRow: (props) => {
    const clickHandler = props.context?.clickHandler;
    const row = (
      <TableRow
        {...props}
        onClick={(_) =>
          clickHandler ? clickHandler(props["data-index"]) : undefined
        }
      />
    );
    return row;
  },
  TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => (
    <TableBody {...props} ref={ref} />
  )),
};


export function SpectrumList() {
  const viewerDispatch = useSpectrumViewerDispatch();
  const viewerState = useSpectrumViewer();
  const mzReader = viewerState.mzReader;
  const onClick = (index: number) => {
    viewerDispatch({
      type: ViewerActionType.CurrentSpectrumIdx,
      value: index,
    });
  };

  const isMobile = useMediaQuery("(max-width:500px)");

  return (
    <Paper
      style={{
        height: 400,
        minWidth: 1000,
        overflowY: "hidden",
        overflowX: "hidden",
        marginLeft: isMobile ? "10em" : 0,
      }}
    >
      <TableVirtuoso
        totalCount={mzReader ? mzReader.length : 0}
        itemContent={(index: number) => {
          if (!mzReader) throw new Error("Reader not defined")
          const spec = mzReader.headerEntries[index];
          return rowContent(
            index,
            spec,
            viewerState.currentSpectrumID
          );
        }}
        context={{ clickHandler: onClick }}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
      />
    </Paper>
  );
}