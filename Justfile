wasm:
    wasm-pack build --target bundler

lib:
    cd lib && npm install . && npm run build

dev:
    cd app && npm install . && npm run dev

app:
    cd app && npm run build
    cp app/dist/index.html mzdata-viewer.html