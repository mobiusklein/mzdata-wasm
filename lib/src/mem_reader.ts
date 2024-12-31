import * as wasm from "mzdata-wasm";
import { Spectrum } from "mzdata-wasm";

export type SpectrumGroup = {
    precursor: Spectrum | null,
    products: Spectrum[]
}

export class MZReader {
  reader: wasm.MemWebMZReader;

  static async open(file: File) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const reader = wasm.MemWebMZReader.from_buffer(buffer);
    return new MZReader(reader);
  }

  private constructor(reader: wasm.MemWebMZReader) {
    this.reader = reader;
  }

  fileFormat() {
    this.reader.file_format
  }

  setDataLoading(value: boolean) {
    this.reader.set_data_loading(value);
    return this;
  }

  setPeakPicking(value: boolean) {
    this.reader.set_peak_picking(value);
    return this;
  }

  get length() {
    return this.reader.length;
  }

  at(index: number) {
    return this.getSpectrumByIndex(index);
  }

  *[Symbol.iterator]() {
    const n = this.reader.length;
    for (let i = 0; i < n; i++) {
      yield this.getSpectrumByIndex(i);
    }
  }

  iter() {
    return this[Symbol.iterator]();
  }

  getSpectrumByIndex(index: number) {
    return this.reader.get_spectrum_by_index(index);
  }

  getSpectrumById(id: string) {
    return this.reader.get_spectrum_by_id(id);
  }

  getSpectrumByTime(time: number) {
    return this.reader.get_spectrum_by_time(time);
  }

  groupAt(index: number): SpectrumGroup | undefined {
    const group = this.reader.group_at(index) as SpectrumGroup | undefined;
    return group
  }
}