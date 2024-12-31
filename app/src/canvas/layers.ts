import * as d3 from "d3";

import { SpectrumCanvas } from "./canvas";
import { IsolationWindow } from "../../../pkg/mzdata_wasm";

const defaultColor = "steelblue";

const dropZeroRuns = (x: number[]) => {
    const mask = []
    let runStart = null;
    let runEnd = null;
    for(let i = 0; i < x.length; i++) {
        if (x[i] == 0) {
            if (runStart == null) {
                runStart = i
            } else {
                runEnd = i
            }
        } else {
            if (runStart == null) {
                mask.push(i)
            }
            else if (runEnd != null && runStart != null) {
                mask.push(runStart)
                mask.push(runEnd)
                runStart = null;
                runEnd = null;
            } else {
                mask.push(i)
                runStart = null
            }
        }
    }
    if (runStart != null) {
        mask.push(runStart)
    }
    return mask
}

const subsampleResolutionSpacing = (x: NumericArray, desiredResolution: number) => {
    const keptIndices = [0];
    if (x.length == 0) return keptIndices

    let last = x[0]
    for (let i = 1; i < x.length; i++) {
        if (x[i] - last > desiredResolution) {
            keptIndices.push(i);
            last = x[i]
        }
    }
    if (keptIndices[keptIndices.length - 1] != x.length - 1) {
        keptIndices.push(x.length - 1);
    }
    return keptIndices;
};

const arrayMask = (x: NumericArray, ii: number[]) => ii.map((i) => x[i]);

export interface Point {
    mz: number;
    intensity: number;
}

export interface ChargePoint extends Point {
    charge: number
}

const neutralMass = (mz: number, charge: number) => {
    return mz * Math.abs(charge) - charge * 1.007;
};

const pointNeutralMass = (point: ChargePoint) => {
    return neutralMass(point.mz, point.charge);
};

export type PointSelectionType = d3.Selection<SVGGElement, Point, HTMLElement, any>
export type PointListSelectionType = d3.Selection<SVGPathElement, Point[], HTMLElement, any>;

const pointToProfile = (points: Point[]) => {
    const result = [];
    for (const point of points) {
        const beforePoint = {mz: point.mz, intensity: point.intensity};
        const afterPoint = Object.assign({}, beforePoint);
        beforePoint.mz -= 1e-6;
        beforePoint.intensity = -1;
        result.push(beforePoint);
        result.push(point);
        afterPoint.mz += 1e-6;
        afterPoint.intensity = -1;
        result.push(afterPoint);
    }
    return result;
};

export abstract class LayerBase {
  abstract get length(): number;
  abstract get(i: number): Point;
  abstract initArtist(canvas: SpectrumCanvas): void;
  abstract onBrush(brush: d3.BrushBehavior<unknown>): void;
  abstract remove(): void;
  abstract redraw(canvas: SpectrumCanvas): void;
  abstract onHover(canvas: SpectrumCanvas, value: any): void;

  asArray() {
    return Array.from(this);
  }

  [Symbol.iterator]() {
    let self = this;
    let i = 0;
    const iterator = {
      next() {
        if (i >= self.length) {
          return { value: { mz: 0, intensity: 0 }, done: true };
        }
        const value = self.get(i);
        i++;
        return { value: value, done: false };
      },
    };
    return iterator;
  }

  maxMz() {
    if (this.length === 0) {
      return 0;
    }
    const point = this.get(this.length - 1);
    return point.mz;
  }

  minMz() {
    if (this.length === 0) {
      return 0;
    }
    const point = this.get(0);
    return point.mz;
  }

  minCoordinate() {
    return this.minMz();
  }

  maxCoordinate() {
    return this.maxMz();
  }

  maxIntensity() {
    let maxValue = 0;
    for (let point of this) {
      if (!point) continue;
      if (point.intensity > maxValue) {
        maxValue = point.intensity;
      }
    }
    return maxValue;
  }

  minIntensity() {
    return 0;
  }

  searchMz(mz: number) {
    if (mz > this.maxMz()) {
      return this.length - 1;
    } else if (mz < this.minMz()) {
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

  matchMz(mz: number, errorTolerance: number) {
    let i = this.searchMz(mz);
    let pt = this.get(i);
    if (Math.abs(pt.mz - mz) / mz < errorTolerance) {
      return pt;
    }
    return null;
  }

  abstract slice(begin: number, end: number): LayerBase;

  between(beginMz: number, endMz: number) {
    let startIdx = this.searchMz(beginMz);
    while(startIdx > 0 && this.get(startIdx).mz > beginMz) {
        startIdx--;
    }
    if (this.get(startIdx).mz < beginMz) startIdx++

    let endIdx = startIdx
    while (endIdx < this.length && this.get(endIdx).mz < endMz) {
        endIdx++
    }
    return this.slice(startIdx, endIdx)
  }

//   between(beginMz: number, endMz: number) {
//     return this.slice(this.searchMz(beginMz), this.searchMz(endMz));
//   }
}

export abstract class DataLayer extends LayerBase {
  metadata: any;
  _color: string | null;
  points: Point[];
  line: PointSelectionType | null;
  path: PointListSelectionType | null;
  brushPatch: PointSelectionType | null;

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

  sortMz() {
    return Array.from(this.points).sort((a, b) => {
      if (a.mz < b.mz) {
        return -1;
      } else if (a.mz > b.mz) {
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

  onHover(_canvas: SpectrumCanvas, _cursorInfo: any) {
    return;
  }

  redraw(canvas: SpectrumCanvas) {
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

  buildPathCoords(canvas: SpectrumCanvas) {
    const path = d3
      .line<Point>()
      .x((d) => (canvas.xScale ? canvas.xScale(d.mz) || 0 : 0))
      .y((d) => (canvas.yScale ? canvas.yScale(d.intensity) || 0 : 0));
    return path;
  }

  _makeData(): Point[] {
    return pointToProfile(this.asArray());
  }

  styleArtist(path: PointListSelectionType) {
    return path
      .attr("stroke", this.color)
      .attr("stroke-width", this.strokeWidth)
      .attr("fill", "none");
  }

  initArtist(canvas: SpectrumCanvas) {
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

export class LineArtist extends DataLayer {
    label: string;
    strokeWidth: number

    get length(): number {
        return this.points.length;
    }

    constructor(points: Point[], metadata: any) {
        super(metadata);
        this.points = points;
        this.points = this.sortMz();
        this.line = null;
        this.label = metadata.label ? metadata.label : "";
        this._color = metadata.color ? metadata.color : defaultColor;
        this.strokeWidth = metadata.strokeWidth ? metadata.strokeWidth : 2.5;
    }

    sortMz() {
        return Array.from(this.points).sort((a, b) => {
            if (a.mz < b.mz) {
                return -1;
            } else if (a.mz > b.mz) {
                return 1;
            } else {
                return 0;
            }
        });
    }

    get(i: number) {
        return this.points[i];
    }

    slice(begin: number, end: number): LayerBase {
        return new LineArtist(this.points.slice(begin, end), this.metadata)
    }

    _makeData() {
        const result = pointToProfile(this.points);
        return result;
    }

    styleArtist(path: PointListSelectionType) {
        return path
        .attr("stroke", this.color)
        .attr("stroke-width", this.strokeWidth)
        .attr("fill", "none");
    }

    initArtist(canvas: SpectrumCanvas) {
        if (!canvas.container) return
        this.line = canvas.container.append("g").attr("clip-path", "url(#clip)");
        const points = this._makeData();

        const path = this.line
        .append("path")
        .datum(points)
        .attr("class", `line ${this.layerType}`);

        this.path = this.styleArtist(
            path
        );

        this.path.attr("d", this.buildPathCoords(canvas)(points) || '');
    }
}

type NumericArray = Float32Array | Float64Array | number[];

export class ProfileLayer extends DataLayer {
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
        return { mz: mz, intensity: subsampledIntensity[i] };
      });
    } else {
      return this.asArray();
    }
  }

  get(i: number) {
    return {
      mz: this.mz[i],
      intensity: this.intensity[i],
    };
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
    return { mz: this.mz[bestIndex], intensity: this.intensity[bestIndex] };
  }

  slice(begin: number, end: number) {
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

export class PointLayer extends DataLayer {

    label: PointSelectionType | null

    get length() {
        return this.points.length
    }

    constructor(points: Point[], metadata: any) {
        super(metadata);
        this.points = points;
        this.points.sort((a, b) => {
            if (a.mz < b.mz) {
                return -1;
            } else if (a.mz > b.mz) {
                return 1;
            } else {
                return 0;
            }
        });
        this.line = null;
        this.label = null;
    }

    get basePeak() {
        return this.points.reduce((a, b) => (a.intensity > b.intensity ? a : b));
    }

    get(i: number) {
        return this.points[i];
    }

    get layerType() {
        return "centroid-layer";
    }

    slice(begin: number, end: number) {
        return new PointLayer(this.points.slice(begin, end), this.metadata);
    }

    _makeData() {
        const result = pointToProfile(this.points);
        return result;
    }

    onHover(canvas: SpectrumCanvas, cursorInfo: any) {
        if (!canvas.xScale || !canvas.yScale || !canvas.container) return;
        let mz = cursorInfo.mz;
        let index = this.searchMz(mz);
        let peak = this.get(index);
        if (peak === undefined) {
            return;
        }
        if (Math.abs(peak.mz - mz) > 0.3) {
            if (this.label !== null) {
                this.label.remove();
                this.label = null;
            }
            return;
        }
        let mzPosition = canvas.xScale(peak.mz);
        let intensityPosition = canvas.yScale(peak.intensity) || 0;
        if (this.label !== null) {
            this.label.remove();
        }
        this.label = canvas.container
        .append("g")
        .attr("transform", `translate(${mzPosition},${intensityPosition - 10})`);
        this.label
        .append("text")
        .text(peak.mz.toFixed(3))
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

export class NeutralMassPointLayer extends PointLayer {
    points: ChargePoint[];
    pointsByMass: ChargePoint[];

    constructor(points: ChargePoint[], metadata: any) {
        super(points, metadata);
        this.points = points;
        this.pointsByMass = this.sortMass();
    }

    get(i: number): ChargePoint {
        return this.points[i]
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

    getOverMass(i: number): ChargePoint {
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

export interface LabeledPoint extends ChargePoint {
    label: string
}

export class LabeledPeakLayer extends NeutralMassPointLayer {
    seriesLabel: string;
    points: LabeledPoint[];
    labels: d3.Selection<SVGTextElement, LabeledPoint, SVGGElement, Point> | null;

    constructor(points: LabeledPoint[], metadata: any) {
        super(points, metadata);
        this.points = points;
        this._color = this.metadata.color;
        this.seriesLabel =
        this.metadata.seriesLabel ||
        "labeled-peaks-" + Math.floor(Math.random() * 1e16);
        this.labels = null;
    }

    initArtist(canvas: SpectrumCanvas) {
        if (!canvas.container) return;
        super.initArtist(canvas)
        this._drawLabels(canvas);
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
                `translate(${canvas.xScale ? canvas.xScale(d.mz) : 0},${canvas.yScale ? canvas.yScale(d.intensity) || 0 - 10 : 0})`
        )
        .append("text")
        .text((d) => d.label)
        .attr("text-anchor", "middle");
    }

    redraw(canvas: SpectrumCanvas) {
        super.redraw(canvas);
        this._drawLabels(canvas);
    }

    remove() {
        super.remove();
        if (this.labels) {
            this.labels.remove();
        }
    }
}

export interface DeconvolutionPoint extends ChargePoint {
    envelope: Point[]
}

export class DeconvolutedLayer extends NeutralMassPointLayer {
    points: DeconvolutionPoint[]
    patternColor: string | d3.RGBColor | null;
    patternLine: LineArtist | null;
    patternContainer: PointSelectionType | null;

    constructor(points: DeconvolutionPoint[], metadata: any) {
        super(points, metadata);
        this.points = points;
        this.patternContainer = null;
        this.patternLine = null;
        this.patternColor = null;
    }

    maxIntensity(): number {
        const baseMax = super.maxIntensity();
        return baseMax * 1.25
    }

    get layerType() {
        return "deconvoluted-layer";
    }

    get(i: number): DeconvolutionPoint {
        return this.points[i];
    }

    onHover(canvas: SpectrumCanvas, cursorInfo: any) {
        if (!canvas.xScale || !canvas.yScale || !canvas.container) return;
        super.onHover(canvas, cursorInfo);
        const mz = cursorInfo.mz;
        let index = this.searchMz(mz);
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
            console.log(this.color, totalChannels);
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
            color: this.patternColor, strokeWidth: 4.0
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


class AbstractPointLayer extends PointLayer {
  slice(_begin: number, _end: number) {
    return new PointLayer([], {});
  }
}

export class PrecursorPeakLayer extends AbstractPointLayer {
  mz: number;
  intensity: number;
  charge: number;
  precursorLabel: d3.Selection<SVGTextElement, Point, HTMLElement, any> | null;

  constructor(peak: ChargePoint, metadata: any) {
    super([peak], metadata);
    this.mz = peak.mz;
    this.intensity = peak.intensity;
    this.charge = peak.charge;
    this.precursorLabel = null;
  }

  maxIntensity() {
    return 1;
  }

  get layerType() {
    return "precursor-layer";
  }

  addLabel(canvas: SpectrumCanvas) {
    if (!canvas.container) return;
    const lines = [
      `Prec. m/z: ${this.mz.toFixed(3)}`,
      `Prec. z: ${this.charge}`,
      `Prec. mass: ${neutralMass(this.mz, this.charge).toFixed(3)}`,
    ];

    this.precursorLabel = canvas.container
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

  initArtist(canvas: SpectrumCanvas) {
    super.initArtist(canvas);
    this.addLabel(canvas);
  }

  styleArtist(path: PointListSelectionType) {
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


export class IsolationWindowLayer extends AbstractPointLayer {
    windows: IsolationWindow[]
    height: number

  constructor(windows: IsolationWindow[], height: number, metadata: any) {
    super(IsolationWindowLayer._splitWindows(windows, height), metadata);
    this.windows = windows;
    this.height = height;
  }

  maxIntensity() {
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
      points.push({ mz: window.lowerBound, intensity: height });
      points.push({ mz: window.upperBound, intensity: height });
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
