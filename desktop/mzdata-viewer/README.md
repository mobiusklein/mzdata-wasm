# mzdata-viewer Dekstop

A desktop application wrapping `mzdata` using Tauri, fronted by the React+D3 `mzdata-viewer`. It does all the heavy computational processing in native code instead of the WASM VM in the browser client. It also has access to the full range of file types that `mzdata` does, including vendor formats like Thermo RAW and Bruker TDF.

## Development Notes

1. Because the backend does most of the processing, anything involving array resampling will be dreadfully slow in dev mode.
2. Large chunks of the frontend needed to be rebuilt because the original assumed fetching spectra from files would be synchronous and because of the previous point, data processing had to be pipelined differently too.
3. The file picker had to be done *outside* of Tauri because Tauri's file dialog could statically pick files *or* directories, but not both, when I wanted both. Thus, we also depend upon `egui-file-dialog`. In principle this could be rebuilt in the webview, but it's a lot of work for no good reason.