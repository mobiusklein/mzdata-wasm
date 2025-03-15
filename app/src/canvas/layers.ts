import * as d3 from "d3";

import {
  FeatureMapCanvas,
  FeatureProfileCanvas,
  SpectrumCanvas,
  MSCanvasBase,
} from "./canvas";
import { IsolationWindow } from "../../../pkg/mzdata_wasm";
import * as mzdata from "mzdata";

const defaultColor = "steelblue";

const dropZeroRuns = (x: number[]) => {
  const mask = [];
  let runStart = null;
  let runEnd = null;
  for (let i = 0; i < x.length; i++) {
    if (x[i] == 0) {
      if (runStart == null) {
        runStart = i;
      } else {
        runEnd = i;
      }
    } else {
      if (runStart == null) {
        mask.push(i);
      } else if (runEnd != null && runStart != null) {
        mask.push(runStart);
        mask.push(runEnd);
        runStart = null;
        runEnd = null;
      } else {
        mask.push(i);
        runStart = null;
      }
    }
  }
  if (runStart != null) {
    mask.push(runStart);
  }
  return mask;
};

const subsampleResolutionSpacing = (
  x: NumericArray,
  desiredResolution: number
) => {
  const keptIndices = [0];
  if (x.length == 0) return keptIndices;

  let last = x[0];
  for (let i = 1; i < x.length; i++) {
    if (x[i] - last > desiredResolution) {
      keptIndices.push(i);
      last = x[i];
    }
  }
  if (keptIndices[keptIndices.length - 1] != x.length - 1) {
    keptIndices.push(x.length - 1);
  }
  return keptIndices;
};

const arrayMask = (x: NumericArray, ii: number[]) => ii.map((i) => x[i]);

const neutralMass = (mz: number, charge: number) => {
  return mz * Math.abs(charge) - charge * 1.007;
};

const pointNeutralMass = (point: ChargedPoint) => {
  return neutralMass(point.mz, point.charge);
};

export interface PointLike {
  get x(): number;
  get y(): number;
  set x(x: number);
  set y(y: number);
  asPoint(): PointLike;
}

export type PointSelectionType<T extends PointLike> = d3.Selection<
  SVGGElement,
  T,
  HTMLElement,
  any
>;
export type PointListSelectionType<T extends PointLike> = d3.Selection<
  SVGPathElement,
  T[],
  HTMLElement,
  any
>;

export class MZPoint implements PointLike {
  mz: number;
  intensity: number;

  constructor(mz: number, intensity: number) {
    this.mz = mz;
    this.intensity = intensity;
  }

  static empty() {
    return new MZPoint(0, 0);
  }

  get x() {
    return this.mz;
  }

  get y() {
    return this.intensity;
  }

  set x(x: number) {
    this.mz = x;
  }

  set y(y: number) {
    this.intensity = y;
  }

  asPoint(): PointLike {
    return new MZPoint(this.mz, this.intensity);
  }
}

export class ChargedPoint extends MZPoint implements PointLike {
  charge: number;

  constructor(mz: number, intensity: number, charge: number) {
    super(mz, intensity);
    this.charge = charge;
  }
}

export class LabeledPoint extends ChargedPoint implements PointLike {
  label: string;

  constructor(mz: number, intensity: number, charge: number, label: string) {
    super(mz, intensity, charge);
    this.label = label;
  }
}

export class DeconvolutedPoint extends ChargedPoint implements PointLike {
  envelope: MZPoint[];

  constructor(
    mz: number,
    intensity: number,
    charge: number,
    envelope: MZPoint[]
  ) {
    super(mz, intensity, charge);
    this.envelope = envelope;
  }

  static fromSource(peak: mzdata.wasm.SimpleChargedPeak) {
    const envelope = peak.envelope.map((p) => new MZPoint(p.mz, p.intensity));
    return new DeconvolutedPoint(
      peak.mz,
      peak.intensity,
      peak.charge,
      envelope
    );
  }
}

export class FeatureCanvasPoint implements PointLike {
  mz: number;
  intensity: number;
  time: number;

  constructor(mz: number, intensity: number, time: number) {
    this.mz = mz;
    this.intensity = intensity;
    this.time = time;
  }

  get x() {
    return this.mz;
  }

  get y() {
    return this.time;
  }

  set x(x: number) {
    this.mz = x;
  }

  set y(y: number) {
    this.time = y;
  }

  asPoint(): PointLike {
    return new FeatureCanvasPoint(this.mz, this.intensity, this.time);
  }

  static fromSource(p: mzdata.FeaturePoint) {
    return new FeatureCanvasPoint(p.mz, p.intensity, p.time);
  }
}

export class FeatureCanvasPointWithFeature
  extends FeatureCanvasPoint
  implements PointLike
{
  feature: mzdata.Feature;

  constructor(
    mz: number,
    intensity: number,
    time: number,
    feature: mzdata.Feature
  ) {
    super(mz, intensity, time);
    this.feature = feature;
  }

  asPoint(): PointLike {
    return new FeatureCanvasPointWithFeature(
      this.mz,
      this.intensity,
      this.time,
      this.feature
    );
  }
}

export class FeatureCanvasPointWithDeconvolutedFeature
  extends FeatureCanvasPoint
  implements PointLike
{
  feature: mzdata.DeconvolvedFeature;

  constructor(
    mz: number,
    intensity: number,
    time: number,
    feature: mzdata.DeconvolvedFeature
  ) {
    super(mz, intensity, time);
    this.feature = feature;
  }

  asPoint(): PointLike {
    return new FeatureCanvasPointWithDeconvolutedFeature(
      this.mz,
      this.intensity,
      this.time,
      this.feature
    );
  }
}

export class FeatureProfilePoint extends FeatureCanvasPoint {
  get x() {
    return this.time;
  }

  set x(x: number) {
    this.time = x;
  }

  get y() {
    return this.intensity;
  }

  set y(y: number) {
    this.intensity = y;
  }

  asPoint(): PointLike {
    return new FeatureProfilePoint(this.mz, this.intensity, this.time);
  }

  static fromSource(p: mzdata.FeaturePoint) {
    return new FeatureProfilePoint(p.mz, p.intensity, p.time);
  }
}

function pointToProfile<T extends PointLike>(points: T[]): T[] {
  const result = [];
  for (const point of points) {
    const beforePoint = point.asPoint();
    const afterPoint = point.asPoint();
    beforePoint.x -= 1e-6;
    beforePoint.y = -1;
    result.push(beforePoint);
    result.push(point);
    afterPoint.x += 1e-6;
    afterPoint.y = -1;
    result.push(afterPoint);
  }
  return result as T[];
}

export abstract class LayerBase<T extends PointLike> {
  abstract get length(): number;
  abstract get(i: number): T;
  abstract initArtist(canvas: MSCanvasBase<T>): void;
  abstract onBrush(brush: d3.BrushBehavior<unknown>): void;
  abstract remove(): void;
  abstract redraw(canvas: MSCanvasBase<T>): void;
  abstract onHover(canvas: MSCanvasBase<T>, value: any): void;

  asArray(): PointLike[] {
    return Array.from(this);
  }

  [Symbol.iterator](): Iterator<T> {
    let self = this;
    let i = 0;
    const iterator = {
      next() {
        if (i >= self.length) {
          return { value: self.get(0), done: true };
        }
        const value = self.get(i);
        i++;
        return { value: value, done: false };
      },
    };
    return iterator;
  }

  maxX() {
    if (this.length === 0) {
      return 0;
    }
    const point = this.get(this.length - 1);
    return point.x;
  }

  minX() {
    if (this.length === 0) {
      return 0;
    }
    const point = this.get(0);
    return point.x;
  }

  minCoordinate() {
    return this.minX();
  }

  maxCoordinate() {
    return this.maxX();
  }

  maxY() {
    let maxValue = 0;
    for (let point of this) {
      if (!point) continue;
      if (point.y > maxValue) {
        maxValue = point.y;
      }
    }
    return maxValue;
  }

  minY() {
    return 0;
  }

  searchX(mz: number) {
    if (mz > this.maxX()) {
      return this.length - 1;
    } else if (mz < this.minX()) {
      return 0;
    }
    let lo = 0;
    let hi = this.length - 1;

    while (hi !== lo) {
      let mid = Math.trunc((hi + lo) / 2);
      let value = this.get(mid).x;
      let diff = value - mz;
      if (Math.abs(diff) < 1e-3) {
        let bestIndex = mid;
        let bestError = Math.abs(diff);
        let i = mid;
        while (i > -1) {
          value = this.get(i).x;
          diff = Math.abs(value - mz);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i--;
        }
        i = mid + 1;
        while (i < this.length) {
          value = this.get(i).x;
          diff = Math.abs(value - mz);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i++;
        }
        return bestIndex;
      } else if (hi - lo === 1) {
        let bestIndex = mid;
        let bestError = Math.abs(diff);
        let i = mid;
        while (i > -1) {
          value = this.get(i).x;
          diff = Math.abs(value - mz);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i--;
        }
        i = mid + 1;
        while (i < this.length) {
          value = this.get(i).x;
          diff = Math.abs(value - mz);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i++;
        }
        return bestIndex;
      } else if (diff > 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return 0;
  }

  matchX(mz: number, errorTolerance: number) {
    let i = this.searchX(mz);
    let pt = this.get(i);
    if (Math.abs(pt.x - mz) / mz < errorTolerance) {
      return pt;
    }
    return null;
  }

  abstract slice(begin: number, end: number): LayerBase<T>;

  between(beginX: number, endX: number) {
    let startIdx = this.searchX(beginX);
    while (startIdx > 0 && this.get(startIdx).x > beginX) {
      startIdx--;
    }
    if (this.get(startIdx).x < beginX) startIdx++;

    let endIdx = startIdx;
    while (endIdx < this.length && this.get(endIdx).x < endX) {
      endIdx++;
    }
    return this.slice(startIdx, endIdx);
  }

  //   between(beginMz: number, endMz: number) {
  //     return this.slice(this.searchMz(beginMz), this.searchMz(endMz));
  //   }
}

export abstract class DataLayer<T extends PointLike> extends LayerBase<T> {
  metadata: any;
  _color: string | null;
  points: T[];
  line: PointSelectionType<PointLike> | null;
  path: PointListSelectionType<PointLike> | null;
  brushPatch: PointSelectionType<PointLike> | null;

  strokeWidth: number;

  constructor(metadata: any) {
    super();
    this.metadata = metadata;
    this._color = null;
    this.points = [];
    this.line = null;
    this.path = null;
    this.brushPatch = null;
    this.strokeWidth = metadata.strokeWidth ? metadata.strokeWidth : 1.5;
  }

  sortX() {
    return Array.from(this.points).sort((a, b) => {
      if (a.x < b.x) {
        return -1;
      } else if (a.x > b.x) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  get color(): string {
    return this._color === null ? defaultColor : this._color;
  }

  set color(value: string | null) {
    this._color = value;
  }

  get layerType() {
    return "data";
  }

  onBrush(brush: any) {
    if (this.line) this.line.select(".brush").call(brush.move, null);
  }

  onHover(_canvas: MSCanvasBase<T>, _cursorInfo: any) {
    return;
  }

  redraw(canvas: MSCanvasBase<T>) {
    if (!this.line) return;
    const lineAttrs = this.buildPathCoords(canvas);
    this.line
      .select(".line")
      .transition("DataLayer")
      .attr("d", lineAttrs(this._makeData()) || "");
  }

  remove() {
    this.line?.remove();
    this.path?.remove();
  }

  buildPathCoords(canvas: MSCanvasBase<T>) {
    const path = d3
      .line<PointLike>()
      .x((d) => (canvas.xScale ? canvas.xScale(d.x) || 0 : 0))
      .y((d) => (canvas.yScale ? canvas.yScale(d.y) || 0 : 0));
    return path;
  }

  _makeData(): PointLike[] {
    return pointToProfile(this.asArray());
  }

  styleArtist(path: PointListSelectionType<PointLike>) {
    return path
      .attr("stroke", this.color)
      .attr("stroke-width", this.strokeWidth)
      .attr("fill", "none");
  }

  initArtist(canvas: MSCanvasBase<T>) {
    if (!canvas.container) throw new Error("Uninitialized canvas container");
    this.line = canvas.container.append("g").attr("clip-path", "url(#clip)");
    this.color = canvas.colorCycle.nextColor();
    const points = this._makeData();

    this.path = this.styleArtist(
      this.line
        .append("path")
        .datum(points)
        .attr("class", `line ${this.layerType}`)
    );

    const coords = this.buildPathCoords(canvas)(points) || "";
    this.path.attr("d", coords);

    if (canvas.brush) {
      this.brushPatch = this.line
        .append("g")
        .attr("class", "brush")
        .call(canvas.brush);
    }
  }
}

export class LineArtist<T extends PointLike> extends DataLayer<T> {
  label: string;
  strokeWidth: number;

  get length(): number {
    return this.points.length;
  }

  constructor(points: T[], metadata: any) {
    super(metadata);
    this.points = points;
    this.points = this.sortX();
    this.line = null;
    this.label = metadata.label ? metadata.label : "";
    this._color = metadata.color ? metadata.color : defaultColor;
    this.strokeWidth = metadata.strokeWidth ? metadata.strokeWidth : 2.5;
  }

  sortX() {
    return Array.from(this.points).sort((a, b) => {
      if (a.x < b.x) {
        return -1;
      } else if (a.x > b.x) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  get(i: number) {
    return this.points[i];
  }

  slice(begin: number, end: number): LayerBase<T> {
    return new LineArtist(this.points.slice(begin, end), this.metadata);
  }

  _makeData() {
    const result = pointToProfile(this.points);
    return result;
  }

  styleArtist(path: PointListSelectionType<PointLike>) {
    return path
      .attr("stroke", this.color)
      .attr("stroke-width", this.strokeWidth)
      .attr("fill", "none");
  }

  initArtist(canvas: MSCanvasBase<T>) {
    if (!canvas.container) return;
    this.line = canvas.container.append("g").attr("clip-path", "url(#clip)");
    const points = this._makeData();

    const path = this.line
      .append("path")
      .datum(points as PointLike[])
      .attr("class", `line ${this.layerType}`);

    this.path = this.styleArtist(path);

    this.path.attr("d", this.buildPathCoords(canvas)(points) || "");
  }
}

type NumericArray = Float32Array | Float64Array | number[];

export class ProfileLayer extends DataLayer<MZPoint> {
  get length(): number {
    return this.mz.length;
  }

  mz: NumericArray;
  intensity: NumericArray;
  subsample: boolean;

  constructor(mz: NumericArray, intensity: NumericArray, metadata: any) {
    super(metadata);
    this.subsample = false;
    if (mz.length > 5e4) {
      this.subsample = true;
    }
    this.mz = mz;
    this.intensity = intensity;
  }

  _makeData() {
    if (this.subsample) {
      const spacing = subsampleResolutionSpacing(this.mz, 0.001);
      let subsampledMz = arrayMask(this.mz, spacing);
      let subsampledIntensity = arrayMask(this.intensity, spacing);
      const liveIndices = dropZeroRuns(subsampledIntensity);
      subsampledMz = arrayMask(subsampledMz, liveIndices);
      subsampledIntensity = arrayMask(subsampledIntensity, liveIndices);
      return subsampledMz.map((mz, i) => {
        return new MZPoint(mz, subsampledIntensity[i]);
      });
    } else {
      return this.asArray();
    }
  }

  get(i: number) {
    return new MZPoint(this.mz[i], this.intensity[i]);
  }

  get basePeak() {
    let bestIndex = 0;
    let bestValue = -1;
    for (let i = 0; i < this.length; i++) {
      let val = this.intensity[i];
      if (val > bestValue) {
        bestValue = val;
        bestIndex = i;
      }
    }
    return new MZPoint(this.mz[bestIndex], this.intensity[bestIndex]);
  }

  slice(begin: number, end: number): LayerBase<MZPoint> {
    return new ProfileLayer(
      this.mz.slice(begin, end),
      this.intensity.slice(begin, end),
      this.metadata
    );
  }

  get layerType() {
    return "profile-layer";
  }
}

export class PointLayer<T extends PointLike> extends DataLayer<T> {
  label: PointSelectionType<PointLike> | null;

  get length() {
    return this.points.length;
  }

  constructor(points: T[], metadata: any) {
    super(metadata);
    this.points = points;
    this.points.sort((a, b) => {
      if (a.x < b.x) {
        return -1;
      } else if (a.x > b.x) {
        return 1;
      } else {
        return 0;
      }
    });
    this.line = null;
    this.label = null;
  }

  get basePeak() {
    return this.points.reduce((a, b) => (a.y > b.y ? a : b));
  }

  get(i: number) {
    return this.points[i];
  }

  get layerType() {
    return "centroid-layer";
  }

  slice(begin: number, end: number): PointLayer<T> {
    return new PointLayer(this.points.slice(begin, end), this.metadata);
  }

  _makeData() {
    const result = pointToProfile(this.points);
    return result;
  }

  onHover(canvas: MSCanvasBase<T>, cursorInfo: any) {
    if (!canvas.xScale || !canvas.yScale || !canvas.container) return;
    let mz = cursorInfo.mz;
    let index = this.searchX(mz);
    let peak = this.get(index);
    if (peak === undefined) {
      return;
    }
    if (Math.abs(peak.x - mz) > 0.3) {
      if (this.label !== null) {
        this.label.remove();
        this.label = null;
      }
      return;
    }
    let mzPosition = canvas.xScale(peak.x);
    let intensityPosition = canvas.yScale(peak.y) || 0;
    if (this.label !== null) {
      this.label.remove();
    }
    this.label = canvas.container
      .append("g")
      .attr("transform", `translate(${mzPosition},${intensityPosition - 10})`);
    this.label
      .append("text")
      .text(peak.x.toFixed(3))
      .style("text-anchor", "middle")
      .attr("class", "peak-label");
  }

  remove() {
    super.remove();
    if (this.label !== null) {
      this.label.remove();
    }
  }
}

export class NeutralMassPointLayer extends PointLayer<ChargedPoint> {
  points: ChargedPoint[];
  pointsByMass: ChargedPoint[];

  constructor(points: any[], metadata: any) {
    super(points, metadata);
    if (!(points[0] instanceof ChargedPoint)) {
      points = points.map((p) => new ChargedPoint(p.mz, p.intensity, p.charge));
    }
    this.points = points;
    this.pointsByMass = this.sortMass();
  }

  get(i: number): ChargedPoint {
    return this.points[i];
  }

  sortMass() {
    return Array.from(this.points).sort((a, b) => {
      if (pointNeutralMass(a) < pointNeutralMass(b)) {
        return -1;
      } else if (pointNeutralMass(a) > pointNeutralMass(b)) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  maxMass() {
    return pointNeutralMass(this.pointsByMass[this.pointsByMass.length - 1]);
  }

  minMass() {
    return pointNeutralMass(this.pointsByMass[0]);
  }

  getOverMass(i: number): ChargedPoint {
    return this.pointsByMass[i];
  }

  searchMass(mass: number) {
    if (mass > this.maxMass()) {
      return this.length - 1;
    } else if (mass < this.minMass()) {
      return 0;
    }
    let lo = 0;
    let hi = this.length - 1;

    while (hi !== lo) {
      let mid = Math.trunc((hi + lo) / 2);
      let value = pointNeutralMass(this.getOverMass(mid));
      let diff = value - mass;
      if (Math.abs(diff) < 1e-3) {
        let bestIndex = mid;
        let bestError = Math.abs(diff);
        let i = mid;
        while (i > -1) {
          value = pointNeutralMass(this.getOverMass(i));
          diff = Math.abs(value - mass);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i--;
        }
        i = mid + 1;
        while (i < this.length) {
          value = pointNeutralMass(this.getOverMass(i));
          diff = Math.abs(value - mass);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i++;
        }
        return bestIndex;
      } else if (hi - lo === 1) {
        let bestIndex = mid;
        let bestError = Math.abs(diff);
        let i = mid;
        while (i > -1) {
          value = pointNeutralMass(this.getOverMass(i));
          diff = Math.abs(value - mass);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i--;
        }
        i = mid + 1;
        while (i < this.length) {
          value = pointNeutralMass(this.getOverMass(i));
          diff = Math.abs(value - mass);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i++;
        }
        return bestIndex;
      } else if (diff > 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return 0;
  }

  matchMass(mass: number, errorTolerance: number) {
    let i = this.searchMass(mass);
    let pt = this.getOverMass(i);
    if (Math.abs(pointNeutralMass(pt) - mass) / mass < errorTolerance) {
      return pt;
    }
    return null;
  }
}

export class LabeledPeakLayer extends NeutralMassPointLayer {
  seriesLabel: string;
  points: LabeledPoint[];
  labels: d3.Selection<
    SVGTextElement,
    LabeledPoint,
    SVGGElement,
    PointLike
  > | null;

  constructor(points: LabeledPoint[], metadata: any) {
    super(points, metadata);
    this.points = points;
    this._color = this.metadata.color;
    this.seriesLabel =
      this.metadata.seriesLabel ||
      "labeled-peaks-" + Math.floor(Math.random() * 1e16);
    this.labels = null;
  }

  initArtist(canvas: MSCanvasBase<PointLike>) {
    if (!canvas.container) return;
    const canvasAs = canvas as any as MSCanvasBase<ChargedPoint>;
    super.initArtist(canvasAs);
    this._drawLabels(canvasAs);
  }

  _drawLabels(canvas: SpectrumCanvas) {
    if (!canvas.container || !canvas.xScale || !canvas.yScale) return;
    if (this.labels) {
      this.labels.remove();
    }
    this.labels = canvas.container
      .selectAll(`text.peak-label.${this.seriesLabel}`)
      .data(this.points)
      .enter()
      .append("g")
      .attr("class", `label-${this.seriesLabel}`)
      .attr(
        "transform",
        (d) =>
          `translate(${canvas.xScale ? canvas.xScale(d.mz) : 0},${
            canvas.yScale ? canvas.yScale(d.intensity) || 0 - 10 : 0
          })`
      )
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle");
  }

  redraw(canvas: MSCanvasBase<PointLike>) {
    super.redraw(canvas as MSCanvasBase<ChargedPoint>);
    this._drawLabels(canvas as MSCanvasBase<ChargedPoint>);
  }

  remove() {
    super.remove();
    if (this.labels) {
      this.labels.remove();
    }
  }
}

export class DeconvolutedLayer extends NeutralMassPointLayer {
  points: DeconvolutedPoint[];
  patternColor: string | d3.RGBColor | null;
  patternLine: LineArtist<PointLike> | null;
  patternContainer: PointSelectionType<PointLike> | null;

  constructor(points: DeconvolutedPoint[], metadata: any) {
    super(points, metadata);
    this.points = points;
    this.patternContainer = null;
    this.patternLine = null;
    this.patternColor = null;
  }

  maxY(): number {
    const baseMax = super.maxY();
    return baseMax * 1.25;
  }

  get layerType() {
    return "deconvoluted-layer";
  }

  get(i: number): DeconvolutedPoint {
    return this.points[i];
  }

  onHover(canvas: MSCanvasBase<PointLike>, cursorInfo: any) {
    if (!canvas.xScale || !canvas.yScale || !canvas.container) return;
    super.onHover(canvas as MSCanvasBase<ChargedPoint>, cursorInfo);
    const mz = cursorInfo.mz;
    let index = this.searchX(mz);
    const peak = this.get(index);
    if (peak === undefined) {
      return;
    }
    if (Math.abs(peak.mz - mz) > 1.5) {
      if (this.patternContainer) {
        this.patternContainer.remove();
        this.patternContainer = null;
      }
      if (this.patternLine) {
        this.patternLine.remove();
        this.patternLine = null;
      }
      return;
    }
    if (!this.patternColor) {
      const patternColor = d3.rgb(this.color);
      const totalChannels =
        ((patternColor.r + patternColor.g + patternColor.b) * 1.0) / (125 * 3);
      if (totalChannels < 0.5) {
        this.patternColor = patternColor.brighter(2);
      } else {
        this.patternColor = patternColor.darker(1);
      }
    }
    let averageMz = 0;
    let totalIntensity = 0;
    // let apexPosition = 0;
    let apexIntensity = 0;
    // let i = 0;
    for (let envelopePoint of peak.envelope) {
      averageMz += envelopePoint.mz * envelopePoint.intensity;
      totalIntensity += envelopePoint.intensity;
      if (envelopePoint.intensity > apexIntensity) {
        apexIntensity = envelopePoint.intensity;
        // apexPosition = i;
      }
      // i++;
    }
    const apexMz = averageMz / totalIntensity;
    const apexMzPosition = canvas.xScale(apexMz);
    const apexIntensityPosition = canvas.yScale(apexIntensity * 1.1) || 0;
    if (this.patternContainer) {
      this.patternContainer.remove();
    }
    this.patternContainer = canvas.container
      .append("g")
      .attr(
        "transform",
        `translate(${apexMzPosition},${apexIntensityPosition - 10})`
      );
    this.patternContainer
      .append("text")
      .text(neutralMass(peak.mz, peak.charge).toFixed(3) + `, z=${peak.charge}`)
      .style("text-anchor", "middle")
      .attr("class", "envelope-label");

    if (this.patternLine) {
      this.patternLine.remove();
    }
    this.patternLine = new LineArtist(peak.envelope, {
      color: this.patternColor,
      strokeWidth: 4.0,
    });
    this.patternLine.initArtist(canvas);
  }

  remove() {
    super.remove();
    if (this.patternContainer) {
      this.patternContainer.remove();
      this.patternContainer = null;
    }
    if (this.patternLine) {
      this.patternLine.remove();
    }
  }
}

class AbstractPointLayer<T extends PointLike> extends PointLayer<T> {
  slice(_begin: number, _end: number): AbstractPointLayer<T> {
    return new AbstractPointLayer([], {});
  }
}

export class PrecursorPeakLayer extends AbstractPointLayer<ChargedPoint> {
  mz: number;
  intensity: number;
  charge: number;
  precursorLabel: d3.Selection<
    SVGTextElement,
    PointLike,
    HTMLElement,
    any
  > | null;

  constructor(peak: ChargedPoint, metadata: any) {
    super([peak], metadata);
    this.mz = peak.mz;
    this.intensity = peak.intensity;
    this.charge = peak.charge;
    this.precursorLabel = null;
  }

  maxY() {
    return 1;
  }

  get layerType() {
    return "precursor-layer";
  }

  addLabel(canvas: MSCanvasBase<PointLike>) {
    const canvasAs = canvas as MSCanvasBase<ChargedPoint>;
    if (!canvasAs.container) return;
    const lines = [
      `Prec. m/z: ${this.mz.toFixed(3)}`,
      `Prec. z: ${this.charge}`,
      `Prec. mass: ${neutralMass(this.mz, this.charge).toFixed(3)}`,
    ];

    this.precursorLabel = canvasAs.container
      .append("text")
      .attr(
        "transform",
        `translate(${canvas.width * 0.85},${canvas.height * 0.02})`
      )
      .style("text-anchor", "left")
      .attr("class", "precursor-label");
    this.precursorLabel
      .selectAll("tspan.precursor-label-row")
      .data(lines)
      .enter()
      .append("tspan")
      .attr("dx", 10)
      .attr("dy", 16)
      .attr("x", 0)
      .text((d) => d);
  }

  initArtist(canvas: MSCanvasBase<PointLike>) {
    super.initArtist(canvas as MSCanvasBase<ChargedPoint>);
    this.addLabel(canvas);
  }

  styleArtist(path: PointListSelectionType<PointLike>) {
    let gapSize = 10;
    let dashSize = 5;
    return super
      .styleArtist(path)
      .attr("stroke-dasharray", `${dashSize} 1 ${gapSize}`);
  }

  remove() {
    super.remove();
    if (this.precursorLabel) {
      this.precursorLabel.remove();
    }
  }
}

export class IsolationWindowLayer extends AbstractPointLayer<MZPoint> {
  windows: IsolationWindow[];
  height: number;

  constructor(windows: IsolationWindow[], height: number, metadata: any) {
    super(IsolationWindowLayer._splitWindows(windows, height), metadata);
    this.windows = windows;
    this.height = height;
  }

  maxY() {
    return 1;
  }

  get layerType() {
    return "isolation-window-layer";
  }

  onHover(_canvas: SpectrumCanvas, _cursorInfo: any) {
    return;
  }

  static _splitWindows(windows: IsolationWindow[], height: number) {
    let points = [];
    for (let window of windows) {
      points.push(new MZPoint(window.lowerBound, height));
      points.push(new MZPoint(window.upperBound, height));
    }
    return points;
  }

  styleArtist(path: any) {
    let gapSize = 5;
    let dashSize = 5;
    return super
      .styleArtist(path)
      .attr("stroke-dasharray", `${dashSize} ${gapSize}`);
  }
}

export interface Point3D {
  mz: number;
  time: number;
  intensity: number;
}

export abstract class FeatureMapLayerBase extends LayerBase<FeatureCanvasPoint> {
  abstract get length(): number;
  abstract get(i: number): FeatureCanvasPoint;
  abstract initArtist(canvas: MSCanvasBase<FeatureCanvasPoint>): void;
  abstract onBrush(brush: d3.BrushBehavior<unknown>): void;
  abstract remove(): void;
  abstract onHover(canvas: MSCanvasBase<FeatureCanvasPoint>, value: any): void;

  redraw(canvas: MSCanvasBase<FeatureCanvasPoint>): void {
    this.remove();
    this.initArtist(canvas);
  }

  asArray() {
    return Array.from(this);
  }

  [Symbol.iterator]() {
    let self = this;
    let i = 0;
    const iterator = {
      next() {
        if (i >= self.length) {
          return { value: self.get(0), done: true };
        }
        const value = self.get(i);
        i++;
        return { value: value, done: false };
      },
    };
    return iterator;
  }

  maxX() {
    if (this.length === 0) {
      return 0;
    }
    let maxValue = 0;
    for (let point of this) {
      if (!point) continue;
      if (point.mz > maxValue) {
        maxValue = point.mz;
      }
    }
    return maxValue;
  }

  minX() {
    if (this.length === 0) {
      return 0;
    }
    let minValue = 0;
    for (let point of this) {
      if (!point) continue;
      if (point.mz < minValue) {
        minValue = point.mz;
      }
    }
    return minValue;
  }

  minCoordinate() {
    return this.minX();
  }

  maxCoordinate() {
    return this.maxX();
  }

  maxY() {
    let maxValue = 0;
    for (let point of this) {
      if (!point) continue;
      if (point.intensity > maxValue) {
        maxValue = point.intensity;
      }
    }
    return maxValue;
  }

  minY() {
    return 0;
  }

  minTime() {
    const array = this.asArray();
    if (array.length == 0) return 0;
    return array.map((v) => v.time).reduce((x, y) => Math.min(x, y));
  }

  maxTime() {
    const array = this.asArray();
    if (array.length == 0) return 0;
    return array.map((v) => v.time).reduce((x, y) => Math.max(x, y));
  }

  searchX(mz: number) {
    if (self.length == 0) return 0;
    if (mz > this.maxX()) {
      return this.length - 1;
    } else if (mz < this.minX()) {
      return 0;
    }
    let lo = 0;
    let hi = this.length - 1;

    while (hi !== lo) {
      let mid = Math.trunc((hi + lo) / 2);
      let value = this.get(mid).mz;
      let diff = value - mz;
      if (Math.abs(diff) < 1e-3) {
        let bestIndex = mid;
        let bestError = Math.abs(diff);
        let i = mid;
        while (i > -1) {
          value = this.get(i).mz;
          diff = Math.abs(value - mz);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i--;
        }
        i = mid + 1;
        while (i < this.length) {
          value = this.get(i).mz;
          diff = Math.abs(value - mz);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i++;
        }
        return bestIndex;
      } else if (hi - lo === 1) {
        let bestIndex = mid;
        let bestError = Math.abs(diff);
        let i = mid;
        while (i > -1) {
          value = this.get(i).mz;
          diff = Math.abs(value - mz);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i--;
        }
        i = mid + 1;
        while (i < this.length) {
          value = this.get(i).mz;
          diff = Math.abs(value - mz);
          if (diff < bestError) {
            bestIndex = i;
            bestError = diff;
          } else {
            break;
          }
          i++;
        }
        return bestIndex;
      } else if (diff > 0) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return 0;
  }

  matchX(mz: number, errorTolerance: number) {
    let i = this.searchX(mz);
    let pt = this.get(i);
    if (Math.abs(pt.mz - mz) / mz < errorTolerance) {
      return pt;
    }
    return null;
  }

  abstract slice(begin: number, end: number): FeatureMapLayerBase;

  between(beginMz: number, endMz: number) {
    if (this.length == 0) return this.slice(0, 0);
    let startIdx = this.searchX(beginMz);
    while (startIdx > 0 && this.get(startIdx).mz > beginMz) {
      startIdx--;
    }
    if (this.get(startIdx).mz < beginMz) startIdx++;
    let endIdx = startIdx;
    while (endIdx < this.length && this.get(endIdx).mz < endMz) {
      endIdx++;
    }
    return this.slice(startIdx, endIdx);
  }
}

export class FeatureMapPointLayer extends FeatureMapLayerBase {
  points: FeatureCanvasPoint[];
  metadata: any;
  _color: string | null;

  pointMarkers: any;
  brushPatch: any;
  container: any;

  constructor(
    points: FeatureCanvasPoint[],
    metadata: any,
    color: string | null
  ) {
    super();
    points.sort((a, b) => {
      return a.mz - b.mz;
    });
    this.points = points;
    this.metadata = metadata;
    this._color = color;

    this.pointMarkers = null;
    this.brushPatch = null;
    this.container = null;
  }

  get length(): number {
    return this.points.length;
  }
  get(i: number): FeatureCanvasPoint {
    return this.points[i];
  }
  initArtist(canvas: FeatureMapCanvas): void {
    if (canvas.container === null) return;
    const points = Array.from(this.points);
    points.sort((a, b) => {
      if (a.intensity < b.intensity) {
        return -1;
      } else if (a.intensity == b.intensity) {
        return 0;
      } else {
        return 1;
      }
    });

    if (canvas.container === null) {
      return;
    }

    let zMax = points[points.length - 1]?.intensity || 0;

    this.container = canvas.container
      .append("g")
      .attr("clip-path", "url(#clip)");

    this.pointMarkers = this.container
      .selectAll()
      .data(points)
      .join("circle")
      .attr("cx", (p: FeatureCanvasPoint) => {
        if (canvas.xScale != null) {
          const x = canvas.xScale(p.mz);
          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("cy", (p: FeatureCanvasPoint) => {
        if (canvas.yScale != null) {
          const x = canvas.yScale(p.time);
          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("r", 2)
      .attr("fill", (p: FeatureCanvasPoint) =>
        d3.interpolateCool(Math.sqrt(p.intensity) / Math.sqrt(zMax))
      );

    if (canvas.brush) {
      this.brushPatch = this.container
        .append("g")
        .attr("class", "brush")
        .call(canvas.brush);
    }
  }

  onBrush(brush: any): void {
    if (this.container) this.container.select(".brush").call(brush.move, null);
  }

  remove(): void {
    this.pointMarkers?.remove();
    this.brushPatch?.remove();
  }

  redraw(canvas: FeatureMapCanvas): void {
    this.remove();
    this.initArtist(canvas);
  }

  onHover(_canvas: FeatureMapCanvas, _value: any): void {}

  slice(begin: number, end: number): FeatureMapLayerBase {
    return new FeatureMapPointLayer(
      this.points.slice(begin, end),
      this.metadata,
      this._color
    );
  }
}

export interface Point3DFeature extends Point3D {
  feature: mzdata.Feature;
}

export class FeatureMapEllipseLayer extends FeatureMapLayerBase {
  features: FeatureCanvasPointWithFeature[];
  metadata: any;
  _color: string | null;

  markers: any;
  brushPatch: any;
  container: any;

  constructor(features: mzdata.Feature[], metadata: any, color?: any) {
    super();
    this.features = features.map((feature) => {
      const time = feature.apexTime;
      const mz = feature.averageMz;
      const intensity = feature.totalIonCurrent;
      return new FeatureCanvasPointWithFeature(
        mz,
        time || 0,
        intensity,
        feature
      );
    });
    this.metadata = metadata;
    this._color = color || null;
    this.markers = null;
    this.brushPatch = null;
    this.container = null;
  }

  get length(): number {
    return this.features.length;
  }

  get(i: number): FeatureCanvasPointWithFeature {
    const feat = this.features[i];
    return feat;
  }

  minTime() {
    const array = this.features;
    if (array.length == 0) return 0;
    return array
      .map((v) => v.feature.startTime || 0)
      .reduce((x, y) => Math.min(x, y));
  }

  maxTime() {
    const array = this.features;
    if (array.length == 0) return 0;
    return array
      .map((v) => v.feature.endTime || 0)
      .reduce((x, y) => Math.max(x, y));
  }

  initArtist(canvas: FeatureMapCanvas): void {
    if (canvas.container === null) return;
    let features = Array.from(this.features);

    features.sort((a, b) => a.intensity - b.intensity);

    let zMax = features[features.length - 1]?.intensity || 0;

    this.container = canvas.container
      .append("g")
      .attr("clip-path", "url(#clip)");

    this.markers = this.container
      .selectAll()
      .data(features)
      .join("rect")
      .attr("x", (p: FeatureCanvasPointWithFeature) => {
        if (canvas.xScale != null) {
          const mz = p.feature.mzs.reduce((a, b) => Math.min(a, b));
          const x = canvas.xScale(mz);

          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("y", (p: FeatureCanvasPointWithFeature) => {
        if (canvas.yScale != null) {
          const x = canvas.yScale(p.feature.endTime as number) as number;
          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("width", (p: FeatureCanvasPointWithFeature) => {
        if (canvas.xScale == null) return 2.0;
        const minMz = p.feature.mzs.reduce((a, b) => Math.min(a, b));
        const maxMz = p.feature.mzs.reduce((a, b) => Math.max(a, b));

        const minVal = canvas.xScale(minMz) as number;
        const maxVal = canvas.xScale(maxMz) as number;

        return Math.max(Math.abs(maxVal - minVal), 2.0);
      })
      .attr("height", (p: FeatureCanvasPointWithFeature) => {
        if (canvas.yScale != null) {
          const end = canvas.yScale(p.feature.endTime as number) as number;
          const start = canvas.yScale(p.feature.startTime as number) as number;
          const width = Math.abs(end - start);
          const x = width;

          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("fill", (p: FeatureCanvasPointWithFeature) =>
        d3.interpolateCool(Math.sqrt(p.intensity) / Math.sqrt(zMax))
      )
      .attr("fill-opacity", 0.2)
      .attr("stroke", "black")
      .attr("stroke-width", 0.15);

    if (canvas.brush) {
      this.brushPatch = this.container
        .append("g")
        .attr("class", "brush")
        .call(canvas.brush);
    }
  }
  onBrush(brush: d3.BrushBehavior<unknown>): void {
    if (this.container) this.container.select(".brush").call(brush.move, null);
  }
  remove(): void {
    this.markers?.remove();
    this.brushPatch?.remove();
  }
  redraw(canvas: FeatureMapCanvas): void {
    this.remove();
    this.initArtist(canvas);
  }
  onHover(_canvas: FeatureMapCanvas, _value: any): void {}

  slice(begin: number, end: number): FeatureMapLayerBase {
    const features = this.features.slice(begin, end).map((x) => x.feature);
    return new FeatureMapEllipseLayer(features, this.metadata, this._color);
  }
}

export interface Point3DDeconvolutedFeature extends Point3D {
  feature: mzdata.DeconvolvedFeature;
}

export class DeconvolvedFeatureMapEllipseLayer extends FeatureMapLayerBase {
  features: FeatureCanvasPointWithDeconvolutedFeature[];
  metadata: any;
  _color: string | null;

  markers: any;
  brushPatch: any;
  container: any;
  annotationText: any;

  patternMarkers: d3.Selection<
    SVGRectElement | null,
    Point3DFeature,
    SVGGElement,
    PointLike
  > | null;
  patternContainer: d3.Selection<
    SVGGElement,
    PointLike,
    HTMLElement,
    any
  > | null;

  constructor(
    features: mzdata.DeconvolvedFeature[],
    metadata: any,
    color?: any
  ) {
    super();
    this.features = features
      .map((feature) => {
        const time = feature.apexTime;
        const mz = feature.weightedMZ;
        const intensity = feature.totalIonCurrent;
        return new FeatureCanvasPointWithDeconvolutedFeature(
          mz,
          time || 0,
          intensity,
          feature
        );
      })
      .sort((a, b) => a.mz - b.mz);
    this.metadata = metadata;
    this._color = color || null;
    this.markers = null;
    this.brushPatch = null;
    this.container = null;
    this.patternContainer = null;
    this.patternMarkers = null;
    this.annotationText = null;
  }

  get length(): number {
    return this.features.length;
  }

  get(i: number): FeatureCanvasPoint {
    const feat = this.features[i];
    return feat;
  }

  minTime() {
    const array = this.features;
    if (array.length == 0) return 0;
    return array
      .map((v) => v.feature.startTime || 0)
      .reduce((x, y) => Math.min(x, y));
  }

  maxTime() {
    const array = this.features;
    if (array.length == 0) return 0;
    return array
      .map((v) => v.feature.endTime || 0)
      .reduce((x, y) => Math.max(x, y));
  }

  estimateMZSpread(feature: mzdata.DeconvolvedFeature) {
    const envelope = feature.envelope();
    const monoMZs = envelope[0].mzs;
    return monoMZs;
  }

  initArtist(canvas: FeatureMapCanvas): void {
    if (canvas.container === null) return;
    let features = Array.from(this.features);

    features.sort((a, b) => a.intensity - b.intensity);

    let zMax = features[features.length - 1]?.intensity || 0;

    const self = this;

    this.container = canvas.container
      .append("g")
      .attr("clip-path", "url(#clip)");

    this.markers = this.container
      .selectAll()
      .data(features)
      .join("rect")
      .attr("x", (p: Point3DDeconvolutedFeature) => {
        if (canvas.xScale != null) {
          const mz = self
            .estimateMZSpread(p.feature)
            .reduce((a, b) => Math.min(a, b));
          const x = canvas.xScale(mz);

          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("y", (p: Point3DDeconvolutedFeature) => {
        if (canvas.yScale != null) {
          const x = canvas.yScale(p.feature.endTime as number) as number;
          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("width", (p: Point3DDeconvolutedFeature) => {
        if (canvas.xScale == null) return 2.0;

        const mzs = self.estimateMZSpread(p.feature);

        const minMz = mzs.reduce((a, b) => Math.min(a, b));
        const maxMz = mzs.reduce((a, b) => Math.max(a, b));

        const minVal = canvas.xScale(minMz) as number;
        const maxVal = canvas.xScale(maxMz) as number;

        return Math.max(Math.abs(maxVal - minVal), 2.0);
      })
      .attr("height", (p: Point3DDeconvolutedFeature) => {
        if (canvas.yScale != null) {
          const end = canvas.yScale(p.feature.endTime as number) as number;
          const start = canvas.yScale(p.feature.startTime as number) as number;
          const width = Math.abs(end - start);
          const x = width;

          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("class", "deconvoluted-feature-ellipse")
      .attr("fill", (p: Point3D) =>
        d3.interpolateCividis(Math.sqrt(p.intensity) / Math.sqrt(zMax))
      )
      .attr("fill-opacity", 0.5)
      .attr("stroke", "red")
      .attr("stroke-width", 1);

    if (canvas.brush) {
      this.brushPatch = this.container
        .append("g")
        .attr("class", "brush")
        .call(canvas.brush);
    }
  }
  onBrush(brush: d3.BrushBehavior<unknown>): void {
    this.patternContainer?.remove();
    this.patternMarkers?.remove();
    if (this.container) this.container.select(".brush").call(brush.move, null);
  }

  removePattern() {
    this.patternContainer?.remove();
    this.patternMarkers?.remove();
    this.patternContainer = null;
    this.patternMarkers = null;
    this.annotationText?.remove();
    this.annotationText = null;
  }

  remove(): void {
    this.markers?.remove();
    this.brushPatch?.remove();
    this.removePattern();
  }

  redraw(canvas: FeatureMapCanvas): void {
    this.remove();
    this.initArtist(canvas);
  }

  onHover(canvas: FeatureMapCanvas, value: any): void {
    if (!canvas.xScale || !canvas.yScale || !canvas.container) return;
    const mz = value.mz;
    const time = value.time;
    const { feature, err } = this.features
      .filter(
        (f) =>
          (f.feature.startTime as number) <= time &&
          (f.feature.endTime as number) >= time
      )
      .reduce(
        (
          state: { feature: Point3DDeconvolutedFeature | null; err: number },
          nextFeature: Point3DDeconvolutedFeature
        ) => {
          const err = Math.abs(nextFeature.mz - mz);
          return err < state.err ? { feature: nextFeature, err } : state;
        },
        { feature: null, err: Infinity }
      );

    if (err > 15) {
      this.removePattern();
    }

    if (err > 10 || !feature) return;

    this.removePattern();
    const envelope = feature.feature.envelope().map((e) => {
      const time = e.apexTime;
      const mz = e.averageMz;
      const intensity = e.totalIonCurrent;
      return { mz, time: time || 0, intensity, feature: e };
    });

    let zMax = envelope.reduce(
      (intensity: number, feature: Point3DFeature) =>
        Math.max(intensity, feature.intensity),
      0
    );

    this.patternContainer = canvas.container
      .append("g")
      .attr("clip-path", "url(#clip)");

    this.patternMarkers = this.patternContainer
      .selectAll()
      .data(envelope)
      .join("rect")
      .attr("x", (p: Point3DFeature) => {
        if (canvas.xScale != null) {
          const mz = p.feature.mzs.reduce((a, b) => Math.min(a, b));
          const x = canvas.xScale(mz);

          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("y", (p: Point3DFeature) => {
        if (canvas.yScale != null) {
          const x = canvas.yScale(p.feature.endTime as number) as number;
          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("width", (p: Point3DFeature) => {
        if (canvas.xScale == null) return 2.0;

        const mzs = p.feature.mzs;

        const minMz = mzs.reduce((a, b) => Math.min(a, b));
        const maxMz = mzs.reduce((a, b) => Math.max(a, b));

        const minVal = canvas.xScale(minMz) as number;
        const maxVal = canvas.xScale(maxMz) as number;

        return Math.max(Math.abs(maxVal - minVal), 2.0);
      })
      .attr("height", (p: Point3DFeature) => {
        if (canvas.yScale != null) {
          const end = canvas.yScale(p.feature.endTime as number) as number;
          const start = canvas.yScale(p.feature.startTime as number) as number;
          const width = Math.abs(end - start);
          const x = width;

          return x != undefined ? x : 0.0;
        } else {
          return 0.0;
        }
      })
      .attr("class", "deconvoluted-feature-ellipse")
      .attr("fill", (p: Point3D) =>
        d3.interpolateCividis(Math.sqrt(p.intensity) / Math.sqrt(zMax))
      )
      .attr("fill-opacity", 0.5)
      .attr("stroke", "purple")
      .attr("stroke-width", 2.5);

      const topPosition = canvas.yScale(Math.max.apply(null, envelope.map(f => f.feature.endTime || 0))) || 0;
      const centerPosition = canvas.xScale(envelope.map(f => f.mz).reduce((a, b) => a + b) / envelope.length);


      this.annotationText = canvas.container
        .append("g")
        .attr("transform", `translate(${centerPosition},${topPosition - 10})`);

      this.annotationText
        .append("text")
        .text(feature.feature.weightedNeutralMass.toFixed(2) + `, z=${feature.feature.charge}`)
        .style("text-anchor", "middle")
        .attr("class", "envelope-label");
  }

  slice(begin: number, end: number): FeatureMapLayerBase {
    const features = this.features.slice(begin, end).map((x) => x.feature);
    return new DeconvolvedFeatureMapEllipseLayer(
      features,
      this.metadata,
      this._color
    );
  }
}

export interface ProfilePoint {
  time: number;
  intensity: number;
  mz: number;
}

export abstract class FeatureProfileLayerBase extends DataLayer<FeatureProfilePoint> {
  canvas: FeatureProfileCanvas | null = null;

  abstract get(i: number): FeatureProfilePoint;

  applyMzFilter(_startMz: number, _endMz: number): FeatureProfileLayerBase {
    return this
  }

  asArray(): FeatureProfilePoint[] {
    return Array.from(this);
  }

  [Symbol.iterator]() {
    let self = this;
    let i = 0;
    const iterator = {
      next() {
        if (i >= self.length) {
          return { value: self.get(0), done: true };
        }
        const value = self.get(i);
        i++;
        return { value: value, done: false };
      },
    };
    return iterator;
  }

  minCoordinate() {
    return this.minTime();
  }

  maxCoordinate() {
    return this.maxTime();
  }

  minY() {
    return 0;
  }

  maxY() {
    const array = this.asArray();
    if (array.length == 0) return 0;
    return array.map((v) => v.y).reduce((x, y) => Math.max(x, y));
  }

  minTime() {
    const array = this.asArray();
    if (array.length == 0) return 0;
    return array.map((v) => v.x).reduce((x, y) => Math.min(x, y));
  }

  maxTime() {
    const array = this.asArray();
    if (array.length == 0) return 0;
    return array.map((v) => v.x).reduce((x, y) => Math.max(x, y));
  }

  searchTime(time: number) {
    return this.searchX(time)
  }

  matchTime(time: number, errorTolerance: number) {
    let i = this.searchTime(time);
    let pt = this.get(i);
    if (Math.abs(pt.time - time) / time < errorTolerance) {
      return pt;
    }
    return null;
  }

  abstract slice(begin: number, end: number): FeatureProfileLayerBase;

  between(beginTime: number, endTime: number) {
    if (this.length == 0) return this.slice(0, 0);
    let startIdx = this.searchTime(beginTime);
    while (startIdx > 0 && this.get(startIdx).time > beginTime) {
      startIdx--;
    }
    if (this.get(startIdx).time < beginTime) startIdx++;
    let endIdx = startIdx;
    while (endIdx < this.length && this.get(endIdx).time < endTime) {
      endIdx++;
    }
    return this.slice(startIdx, endIdx);
  }
}

export class FeatureProfileLineLayer extends FeatureProfileLayerBase {
  points: FeatureProfilePoint[];
  feature: mzdata.Feature | mzdata.DeconvolvedFeature;
  label: PointSelectionType<PointLike> | null;
  strokeWidth: number;
  _color: string;

  line: PointSelectionType<PointLike> | null;
  path: PointListSelectionType<PointLike> | null;
  brushPatch: PointSelectionType<PointLike> | null;

  get length(): number {
    return this.points.length;
  }

  constructor(
    points: FeatureProfilePoint[],
    metadata: any,
    feature: mzdata.Feature | mzdata.DeconvolvedFeature,
    canvas?: FeatureProfileCanvas | null
  ) {
    super(metadata);
    this.points = points;
    this.points = this.sortTime();
    this.feature = feature;
    this.line = null;
    this.label = null;
    this._color = metadata.color ? metadata.color : defaultColor;
    this.strokeWidth = metadata.strokeWidth ? metadata.strokeWidth : 2.5;

    this.path = null;
    this.brushPatch = null;
    this.canvas = !canvas ? null : canvas;
  }

  sortTime() {
    return Array.from(this.points).sort((a, b) => {
      if (a.time < b.time) {
        return -1;
      } else if (a.time > b.time) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  get(i: number) {
    return this.points[i];
  }

  slice(begin: number, end: number): FeatureProfileLineLayer {
    return new FeatureProfileLineLayer(
      this.points.slice(begin, end),
      this.metadata,
      this.feature
    );
  }

  between(beginTime: number, endTime: number): FeatureProfileLineLayer {
    if (this.length == 0) return this.slice(0, 0);
    let startIdx = this.searchTime(beginTime);
    while (startIdx > 0 && this.get(startIdx).time > beginTime) {
      startIdx--;
    }
    if (this.get(startIdx).time < beginTime) startIdx++;
    let endIdx = startIdx;
    while (endIdx < this.length && this.get(endIdx).time < endTime) {
      endIdx++;
    }
    return this.slice(startIdx, endIdx);
  }

  _makeData() {
    const result = Array.from(this.points);
    return result;
  }

  styleArtist(path: PointListSelectionType<PointLike>) {
    return path
      .attr("stroke", this._color)
      .attr("stroke-width", this.strokeWidth)
      .attr("fill", "none")
      .attr("marker", "url(#marker-circle)");
  }

  onBrush(brush: any) {
    if (this.line) this.line.select(".brush").call(brush.move, null);
  }

  onHover(canvas: FeatureProfileCanvas, cursorInfo: any) {
    if (!canvas.xScale || !canvas.yScale || !canvas.container) return;
    let mz = cursorInfo.mz;
    let index = this.searchX(mz);
    let point = this.get(index);
    if (point === undefined) {
      return;
    }
    if (Math.abs(point.x - mz) > 0.01) {
      if (this.label !== null) {
        this.label.remove();
        this.label = null;
      }
      return;
    }

    let timePosition = canvas.xScale(point.x);
    let intensityPosition = canvas.yScale(point.y) || 0;
    this.label?.remove();

    this.label = canvas.container
      .append("g")
      .attr(
        "transform",
        `translate(${timePosition},${intensityPosition - 10})`
      );

    let labelExpr = ''

    if (this.feature instanceof mzdata.Feature) {
      labelExpr = this.feature.averageMz.toFixed(3)
    } else if (this.feature instanceof mzdata.DeconvolvedFeature) {
      labelExpr = `${this.feature.weightedNeutralMass.toFixed(3)}, ${this.feature.charge}`
    } else {
      labelExpr = '?'
    }

    this.label
      .append("text")
      .text(labelExpr)
      .style("text-anchor", "middle")
      .style("fill", this.color)
      .attr("class", "peak-label");
  }

  buildPathCoords(canvas: MSCanvasBase<FeatureProfilePoint>) {
    const path = d3
      .line<PointLike>()
      .x((d) => (canvas.xScale ? canvas.xScale(d.x) || 0 : 0))
      .y((d) => (canvas.yScale ? canvas.yScale(d.y) || 0 : 0));
    return path;
  }

  redraw(canvas: FeatureProfileCanvas) {
    super.redraw(canvas);
  }

  remove() {
    super.remove();
    this.label?.remove()
  }

  initArtist(canvas: FeatureProfileCanvas) {
    if (!canvas.container) return;
    super.initArtist(canvas);
  }

  featureMz() {
    return this.feature instanceof mzdata.Feature ? this.feature.averageMz : this.feature.weightedMZ
  }
}


export class FeatureCentroidLineLayer extends FeatureProfileLineLayer {
  static fromProfile(layer: FeatureProfileLineLayer) {
    return new FeatureCentroidLineLayer(layer.points, layer.metadata, layer.feature);
  }

  _makeData() {
    const peaks = this.feature.fitPeaks();
    const params = peaks.models();
    const bestPoint = params
      .map((p: [string: {mu: number}]) => {
        const mu = Object.values(p)[0].mu as number;
        return { x: mu as number, y: peaks.density(mu) };
      })
      .reduce((a, b) => (a.y > b.y ? a : b));
    const bestPointForm = new FeatureProfilePoint(
      this.featureMz(),
      bestPoint.y,
      bestPoint.x
    );
    const profile = pointToProfile([bestPointForm]);
    return profile;
  }
}


export class FeatureProfileLineLayerCollection extends FeatureProfileLayerBase {
  _layers: FeatureProfileLineLayer[];

  constructor(
    layers: FeatureProfileLineLayer[],
    metadata: any,
    canvas?: FeatureProfileCanvas | null
  ) {
    super(metadata);
    this._layers = layers;
    this.canvas = !canvas ? null : canvas;
  }

  get layers() {
    return this._layers;
  }

  set layers(value: FeatureProfileLineLayer[]) {
    this._layers = value;
  }

  maxCoordinate(): number {
    if (this.layers.length == 0) return 0;
    return Math.max.apply(
      null,
      this.layers.map((x) => x.maxCoordinate())
    );
  }

  minCoordinate(): number {
    if (this.layers.length == 0) return 0;
    return Math.min.apply(
      null,
      this.layers.map((x) => x.minCoordinate())
    );
  }

  maxY(): number {
    if (this.layers.length == 0) return 0;
    return (
      Math.max.apply(
        null,
        this.layers.map((x) => x.maxY())
      ) * 1.05
    );
  }

  minY(): number {
    if (this.layers.length == 0) return 0;
    return Math.min.apply(
      null,
      this.layers.map((x) => x.minY())
    );
  }

  maxTime(): number {
    if (this.layers.length == 0) return 0;
    return Math.max.apply(
      null,
      this.layers.map((x) => x.maxTime())
    );
  }

  minTime(): number {
    if (this.layers.length == 0) return 0;
    return Math.min.apply(
      null,
      this.layers.map((x) => x.minTime())
    );
  }

  asArray(): FeatureProfilePoint[] {
    return this.layers.flatMap((x) => x.asArray()).sort((a, b) => a.x - b.x);
  }

  get(i: number): FeatureProfilePoint {
    return this.asArray()[i];
  }

  slice(begin: number, end: number): FeatureProfileLayerBase {
    return new FeatureProfileLineLayerCollection(
      this.layers
        .filter((_) => {
          if (this.canvas && this.canvas.sourceCanvas) {
            // const [start, end] =
            //   this.canvas.sourceCanvas.extentCoordinateInterval;
            // return start <= x.featureMz() && end >= x.featureMz();
            return true;
          } else {
            return true;
          }
        })
        .map((x) => x.slice(begin, end)),
      this.metadata
    );
  }

  between(beginX: number, endX: number) {
    return new FeatureProfileLineLayerCollection(
      this.layers
        .filter((_) => {
          if (this.canvas && this.canvas.sourceCanvas) {
            // const [start, end] =
            //   this.canvas.sourceCanvas.extentCoordinateInterval;
            // return start <= x.featureMz() && end >= x.featureMz()
            return true;
          } else {
            return true;
          }
        })
        .map((x) => x.between(beginX, endX)),
      this.metadata
    );
  }

  get length(): number {
    if (this.layers.length == 0) return 0;
    return this.layers.map((x) => x.length).reduce((a, b) => a + b);
  }

  redraw(canvas: FeatureProfileCanvas) {
    this.layers.forEach((x) => {
      if (this.canvas && this.canvas.sourceCanvas) {
        // const [start, end] =
        //   this.canvas.sourceCanvas.extentCoordinateInterval;
        // if (start <= x.featureMz() && end >= x.featureMz()) {
        //   x.redraw(canvas)
        // } else {
        //   x.remove()
        // }
        x.redraw(canvas);
      } else {
        x.redraw(canvas);
      }
    });
  }

  remove() {
    this.layers.forEach((x) => x.remove());
  }

  initArtist(canvas: FeatureProfileCanvas) {
    if (!canvas.container) return;
    this.layers
      .filter((_) => {
        if (this.canvas && this.canvas.sourceCanvas) {
          // const [start, end] =
          //   this.canvas.sourceCanvas.extentCoordinateInterval;
          // return start <= x.featureMz() && end >= x.featureMz();
          return true;
        } else {
          return true;
        }
      })
      .forEach((x) => x.initArtist(canvas));
  }

  onBrush(brush: any) {
    this.layers.forEach((x) => x.onBrush(brush));
  }

  applyMzFilter(startMz: number, endMz: number) {
    const layers = this.layers.filter(x => {
      let mz = x.featureMz();
      return mz >= startMz && endMz >= mz
    });
    const limit = this.metadata.maxFeatures ? this.metadata.maxFeatures as number : 1000;
    const layersKept = layers.sort((a, b) => b.maxY() - a.maxY()).slice(0, limit);
    return new FeatureProfileLineLayerCollection(layersKept, this.metadata, null);
  }

  onHover(canvas: FeatureProfileCanvas, cursorInfo: any) {
    if (!canvas.xScale || !canvas.yScale || !canvas.container) return;
    let time = cursorInfo.mz as number;
    let intensity = cursorInfo.intensity as number;

    const hits = this.layers
      .map((layer, idx) => {
        const pair: [FeatureProfilePoint, number] = [
          layer.get(layer.searchTime(time)),
          idx,
        ];
        return pair;
      })
      .filter(([pt, _idx]) => {
        return Math.abs(pt.x - time) <= 0.01;
      })
      .sort(
        (
          a: [FeatureProfilePoint, number],
          b: [FeatureProfilePoint, number]
        ) => {
          return (
            Math.abs(a[0].intensity - intensity) -
            Math.abs(b[0].intensity - intensity)
          );
        }
      );

    if (hits.length == 0) {
      return;
    }

    const [minPoint, minIdx] = hits[0];

    this.layers.forEach((x) => {
      x.label?.remove();
    });

    const yDistThreshold = Math.abs(minPoint.intensity - intensity) * 1.5;
    hits
      .filter(([pt, _]) => {
        return Math.abs(pt.intensity - intensity) <= yDistThreshold;
      })
      .slice(0, 10)
      .forEach(([_, idx]) => {
        this.layers[idx].onHover(canvas, cursorInfo);
      });

    this.layers[minIdx].onHover(canvas, cursorInfo);

    // this.layers.forEach((x) => x.onHover(canvas, cursorInfo));
  }
}
