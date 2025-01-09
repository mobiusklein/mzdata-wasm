import { forwardRef, Fragment } from "react";
import { MZReader, Spectrum } from "mzdata";
import "./SpectrumList.css";

import {
    TableContainer,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Paper,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { TableVirtuoso, TableComponents } from "react-virtuoso";
import { useSpectrumViewerDispatch, useSpectrumViewer, ViewerActionType } from './util';


interface RowContext {
    clickHandler: Function
}

const VirtuosoTableComponents: TableComponents<Spectrum, RowContext> = {
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
            onClick={(_) => clickHandler ? clickHandler(props["data-index"]) : undefined}
            />
        );
        return row;
    },
    TableBody: forwardRef<HTMLTableSectionElement>((props, ref) => (
        <TableBody {...props} ref={ref} />
    )),
};

interface Column {
    name: string;
    format?: Function | undefined;
    numeric: boolean;
    width?: number | undefined;
    getter: Function;
}

const columnDefs: Column[] = [
    {
        name: "Index",
        numeric: true,
        getter: (spectrum: Spectrum) => spectrum.index,
    },
    {
        name: "Native ID",
        numeric: false,
        getter: (spectrum: Spectrum) => spectrum.id,
        width: 400,
    },
    {
        name: "Time",
        numeric: true,
        format: (x: number) => x.toFixed(3),
        getter: (spectrum: Spectrum) => spectrum.startTime,
    },
    {
        name: "Base Peak m/z",
        numeric: true,
        format: (x: number) => x.toFixed(2),
        getter: (spectrum: Spectrum) =>
            spectrum.params().filter((par) => par.name == "base peak m/z")[0]?.value,
    },
    {
        name: "Base Peak Int.",
        numeric: true,
        format: (x: number) => x.toExponential(2),
        getter: (spectrum: Spectrum) =>
            spectrum.params().filter((par) => par.name == "base peak intensity")[0]
        ?.value,
    },
    {
        name: "MS Level",
        numeric: true,
        getter: (spectrum: Spectrum) => spectrum.msLevel,
    },
    {
        name: "Prec. m/z",
        numeric: true,
        format: (x: number) => x.toFixed(3),
        getter: (spectrum: Spectrum) =>
            spectrum.precursor ? spectrum.precursor.ions[0].mz : null,
    },
    {
        name: "Prec. z",
        numeric: true,
        getter: (spectrum: Spectrum) =>
            spectrum.precursor ? spectrum.precursor.ions[0].charge : null,
    },
];

function fixedHeaderContent() {
    return (
        <TableRow>
        {columnDefs.map((column) => {
            const style: React.CSSProperties = {};
            if (column.width) {
                style["width"] = column.width;
            }
            return (
                <TableCell
                key={column.name}
                variant="head"
                align={"center"}
                style={style}
                sx={{ backgroundColor: "background.paper" }}
                >
                {column.name}
                </TableCell>
            );
        })}
        </TableRow>
    );
}

function rowContent(_index: number, row: Spectrum, currentSpectrumID: string | undefined) {
    const isCurrentSpectrum = row.id == currentSpectrumID
    return (
        <Fragment>
        {columnDefs.map((column) => {
            let value = column.getter(row);
            if (column.format && value !== undefined && value !== null) {
                value = column.format(value);
            }
            return (
                <TableCell key={column.name} align={"center"} className={isCurrentSpectrum ? "current-spectrum" : ""}>
                {value}
                </TableCell>
            );
        })}
        </Fragment>
    );
}

export function VirtualizedTable() {

    const viewerDispatch = useSpectrumViewerDispatch()
    const viewerState = useSpectrumViewer();
    const mzReader = viewerState.mzReader;
    const onClick = (index: number) => {
        viewerDispatch({
            type: ViewerActionType.CurrentSpectrumIdx,
            value: index
        })
    };

    const isMobile = useMediaQuery("(max-width:500px)");

    return (
        <Paper style={{ height: 400, minWidth: 1000, overflowY: "hidden", overflowX: "hidden", marginLeft: isMobile ? "10em" : 0 }}>
        <TableVirtuoso
        totalCount={mzReader ? mzReader.length : 0}
        itemContent={(index: number) => {
            mzReader?.setDataLoading(false);
            return rowContent(
                index,
                (mzReader as MZReader).at(index) as Spectrum,
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

export function SpectrumList() {
    return VirtualizedTable();
}
