use std::io;

use js_sys::{Number, Uint8Array};
use wasm_bindgen::prelude::*;
use web_sys::{self, Blob, File, FileReaderSync};

thread_local! {
    static FILE_READER_SYNC: FileReaderSync = FileReaderSync::new().expect("Failed to create FileReaderSync. Help: make sure this is a web worker context.");
}


pub enum BufferHandle {
    Blob(Blob),
    File(File),
}

impl From<Blob> for BufferHandle {
    fn from(value: Blob) -> Self {
        Self::Blob(value)
    }
}

impl From<File> for BufferHandle {
    fn from(value: File) -> Self {
        Self::File(value)
    }
}

impl BufferHandle {
    pub fn size(&self) -> u64 {
        let val = match self {
            BufferHandle::Blob(handle) => handle.size(),
            BufferHandle::File(handle) => handle.size(),
        };
        f64_to_u64_safe(val).expect("Could not convert buffer size to valid integer")
    }

    pub fn slice_with_f64_and_f64(&self, start: f64, end: f64) -> Result<Blob, JsValue> {
        match self {
            BufferHandle::Blob(handle) => handle.slice_with_f64_and_f64(start, end),
            BufferHandle::File(handle) => handle.slice_with_f64_and_f64(start, end),
        }
    }
}

#[wasm_bindgen]
pub struct WebIO {
    handle: BufferHandle,
    position: u64,
}

fn f64_to_u64_safe(val: f64) -> Option<u64> {
    if 0.0 <= val && val <= Number::MAX_SAFE_INTEGER {
        Some(val as u64)
    } else {
        None
    }
}

fn u64_to_f64(val: u64) -> Option<f64> {
    let val = val as f64;
    if val <= Number::MAX_SAFE_INTEGER {
        Some(val)
    } else {
        None
    }
}

impl WebIO {
    pub fn new<B: Into<BufferHandle>>(handle: B) -> Self {
        Self {
            handle: handle.into(),
            position: 0,
        }
    }

    pub fn size(&self) -> u64 {
        self.handle.size()
    }
}

impl io::Read for WebIO {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let buffer_size = buf.len();
        let current_offset = self.position;
        let current_offset_f64 =
            u64_to_f64(current_offset).expect("Failed to convert buffer position to f64");

        let new_offset =
            current_offset.saturating_add(u64::try_from(buffer_size).expect("Buffer too large"));
        let new_offset_f64 = u64_to_f64(new_offset).expect("Failed to convert new position to f64");

        let slc = self
            .handle
            .slice_with_f64_and_f64(current_offset_f64, new_offset_f64)
            .expect("Failed to slice blob");
        let array_buffer = FILE_READER_SYNC.with(|reader| {
            reader
                .read_as_array_buffer(&slc)
                .expect("Failed to read as buffer")
        });

        let array = Uint8Array::new(&array_buffer);
        let actual_read_bytes = array.byte_length();
        let actual_read_bytes_usize =
            usize::try_from(actual_read_bytes).expect("Read too many bytes at once");
        // Copy to output buffer
        array.copy_to(&mut buf[..actual_read_bytes_usize]);
        self.position = current_offset
            .checked_add(actual_read_bytes_usize as u64)
            .expect("New position exceeds u64");
        Ok(actual_read_bytes_usize)
    }
}

impl io::Seek for WebIO {
    fn seek(&mut self, pos: io::SeekFrom) -> io::Result<u64> {
        let n = self.size();
        match pos {
            io::SeekFrom::Start(offset) => {
                self.position = offset.min(n);
            }
            io::SeekFrom::End(offset) => {
                if offset < 0 {
                    if offset.abs() as u64 > n {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidInput,
                            "Invalid seek to negative offset",
                        ));
                    }
                    self.position = n.saturating_sub(offset.abs() as u64);
                } else {
                    self.position = n;
                }
            }
            io::SeekFrom::Current(offset) => {
                if offset < 0 {
                    if offset.abs() as u64 > self.position {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidInput,
                            "Invalid seek to negative offset",
                        ));
                    }
                    self.position = self.position.saturating_sub(offset.abs() as u64);
                } else {
                    self.position = self.position.saturating_add(offset as u64).min(n);
                }
            }
        }
        Ok(self.position)
    }
}
