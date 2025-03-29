import * as mzdata from "mzdata"

import { invoke, Channel } from "@tauri-apps/api/core";
import _ from "lodash";
import { ProcessingParams } from '../../../../app/src/util';


type DataBufferMessage =
  | {
      event: "started";
      handleRef: ReaderHandle;
    }
  | {
      event: "finished";
      handleRef: ReaderHandle;
    }
  | Uint8Array;


export async function openMZReader() {
  const response: any = await invoke("open_mzreader_path");
  if (response) {
    const { key, path, peakPicking, loadData } = response;
    return new ReaderHandle(key, path, peakPicking, loadData);
  } else {
    return null;
  }
}


export class ReaderHandle {
  key: string;
  path: string;
  peakPicking: boolean;
  loadData: boolean;

  constructor(
    key: string,
    path: string,
    peakPicking: boolean,
    loadData: boolean
  ) {
    this.key = key;
    this.path = path;
    this.peakPicking = peakPicking;
    this.loadData = loadData;
  }

  async at(index: number, processing?: ProcessingParams) {
    let buffer: Uint8Array | number[] = await invoke("load_data_for", {
      handle: this,
      index: index,
      processing: processing,
    });
    if (buffer instanceof Array) {
        buffer = new Uint8Array(buffer)
    }
    const text = new TextDecoder().decode(buffer);
    if (text.startsWith('[')) {
        return mzdata.IonMobilityFrame.fromBatchJSON(text)[0];
    } else {
        const state = JSON.parse(text);
        return mzdata.Spectrum.fromJSON(state);
    }
  }

  async length() {
    return await invoke("operate_on_handle", {
      handle: this,
      operation: "length",
    });
  }

  async _loadHeadersInner(
    onFinished?: (handle: MZReaderHandle) => void,
    onData?: (handle: MZReaderHandle) => void
  ) {
    const loadChannel = new Channel<DataBufferMessage>();
    const buffer: mzdata.Spectrum[] = [];
    const data = new MZReaderHandle(this, buffer, false);
    loadChannel.onmessage = (message: DataBufferMessage) => {
      if (message instanceof Uint8Array || message instanceof ArrayBuffer) {
        buffer.push(
          ...mzdata.Spectrum.fromBatchJSON(new TextDecoder().decode(message))
        );
        if (onData) {
          onData(data);
        }
      } else if (message.event === "finished") {
        data.loaded = true;
        console.log("Finished loading");
        if (onFinished) {
          onFinished(data);
        }
      }
    };
    const taskHandle = invoke("load_all_headers", {
      handle: this,
      channel: loadChannel,
    });
    return { data, taskHandle };
  }

  async loadHeadersStreaming(
    onFinished?: (handle: MZReaderHandle) => void,
    onData?: (handle: MZReaderHandle) => void
  ) {
    const { data, taskHandle: _ } = await this._loadHeadersInner(
      onFinished,
      onData
    );
    return data;
  }

  async loadHeadersCompleting(
    onFinished?: (handle: MZReaderHandle) => void,
    onData?: (handle: MZReaderHandle) => void
  ) {
    const { data, taskHandle } = await this._loadHeadersInner(
      onFinished,
      onData
    );
    await taskHandle;
    return data;
  }
}


export class MZReaderHandle {
  readerHandle: ReaderHandle;
  headerEntries: mzdata.Spectrum[];
  loaded: boolean;

  static async fromHandle(handle: ReaderHandle) {
    return await handle.loadHeadersStreaming();
  }

  constructor(
    readerHandle: ReaderHandle,
    headerEntries: mzdata.Spectrum[],
    loaded?: boolean
  ) {
    this.readerHandle = readerHandle;
    this.headerEntries = headerEntries;
    this.loaded = loaded ? loaded : false;
  }

  get loadData() {
    return this.readerHandle.loadData;
  }

  set loadData(value: boolean) {
    this.readerHandle.loadData = value;
  }

  setDataLoading(value: boolean) {
    this.loadData = value;
  }

  setPeakPicking(value: boolean) {
    this.readerHandle.peakPicking = value;
  }

  async getSpectrumByIndex(index: number) {
    await this.at(index);
  }

  async at(index: number, processing?: ProcessingParams) {
    return this.readerHandle.loadData
      ? await this.readerHandle.at(index, processing)
      : this.headerEntries[index];
  }

  async *[Symbol.asyncIterator]() {
    let i = 0;
    while (i < this.length) {
      const spec = await this.at(i);
      i++;
      yield spec;
    }
  }

  get length() {
    return this.headerEntries.length;
  }

  get key() {
    return this.readerHandle.key
  }

  get path() {
    return this.readerHandle.path
  }
}