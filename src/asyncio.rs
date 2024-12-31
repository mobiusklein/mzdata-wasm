use std::pin::Pin;

use futures::Stream;
use js_sys::{Reflect, Uint8Array};
use log::info;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use tokio::io::{simplex, AsyncReadExt, AsyncWriteExt, ReadHalf, SimplexStream, WriteHalf};

use web_sys::{ReadableStream, ReadableStreamDefaultReader};

#[pin_project::pin_project]
pub struct WebReaderPipe {
    stream_reader: ReadableStreamDefaultReader,
    write_half: WriteHalf<SimplexStream>,
    #[pin]
    read_half: ReadHalf<SimplexStream>,
    stream_done: bool,
    buffer_done: bool,
}

impl WebReaderPipe {
    fn new(
        stream_reader: ReadableStreamDefaultReader,
        write_half: WriteHalf<SimplexStream>,
        read_half: ReadHalf<SimplexStream>,
    ) -> Self {
        Self {
            stream_reader,
            write_half,
            read_half,
            stream_done: false,
            buffer_done: false,
        }
    }

    pub fn from_stream(stream: ReadableStream) -> WebReaderPipe {
        let reader = stream.get_reader();
        info!("Retrieving stream reader");
        let reader: ReadableStreamDefaultReader = reader.dyn_into().unwrap();
        info!("Allocating pipe");
        let (read_half, write_half) = simplex(2usize.pow(20u32));
        info!("Pipe Ready");
        Self::new(reader, write_half, read_half)
    }

    pub fn into_stream_reader(
        self,
    ) -> tokio_util::io::StreamReader<
        impl Stream<Item = std::io::Result<bytes::BytesMut>>,
        bytes::BytesMut,
    > {
        let chunk_stream = futures::stream::unfold(self, |mut state| async move {
            if state.buffer_done {
                return None;
            }
            state.pump().await;
            let mut buf = bytes::BytesMut::with_capacity(65536);
            let yielded = state.read_half.read(&mut buf).await;
            match yielded {
                Ok(z) => {
                    if z == 0 && state.stream_done {
                        state.buffer_done = true;
                    }
                    Some((Ok(buf), state))
                }
                Err(e) => Some((Err(e), state)),
            }
        });
        tokio_util::io::StreamReader::new(chunk_stream)
    }

    async fn pump(&mut self) {
        let pinned = Pin::new(self);
        pinned.pump_pinned().await
    }

    async fn pump_pinned(self: std::pin::Pin<&mut Self>) {
        if self.stream_done {
            return;
        }
        let next_chunk = JsFuture::from(self.stream_reader.read());
        let this = self.project();
        if let Some(chunk) = next_chunk.await.ok() {
            let done_key = JsValue::from_str("done");
            let value_key = JsValue::from_str("value");

            info!("Checking if chunk is good");
            if !(Reflect::has(&chunk, &done_key).unwrap()
                && Reflect::has(&chunk, &value_key).unwrap())
            {
                return;
            }

            info!("Updating stream state");
            let value = Reflect::get(&chunk, &done_key).unwrap();
            *this.stream_done = value.is_falsy();

            info!("Fetching new buffer");
            let value = Reflect::get(&chunk, &value_key).unwrap();
            if value.is_falsy() {
                return;
            }

            info!("Coercing buffer");
            let value = Uint8Array::new(&value);

            info!("Writing {} bytes to simplex", value.length());
            this.write_half.write_all(&value.to_vec()).await.unwrap();
        }
    }
}
