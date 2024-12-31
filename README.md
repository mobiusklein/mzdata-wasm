# `mzdata-wasm`

An experiment to demonstrate how to use Rust and `wasm-bindgen` Web Assembly (WASM) to bundle
up complex data processing logic and render it in a web browser, all in the client.

1. `src/` contains the Rust code that uses `wasm-bindgen`.
2. `lib/` contains the TypeScript wrappers that provide a more ergonomic interface to the WASM bindings.
3. `app/` contains a demo React application that shows how the library can be used to build a lazy-loading spectrum viewer.