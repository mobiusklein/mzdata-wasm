import * as wasm from "mzdata-wasm";
import { MZReader } from "./src";

globalThis.MZReader = MZReader;
globalThis.Project = wasm;