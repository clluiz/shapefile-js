export interface Options {
  defaultEncoding?: string;
}

export interface ShapefileObject {
  shp: any;
  dbf?: any;
  cpg?: any;
  prj?: any;
}

export type ShapefileInput = string | ArrayBuffer | SharedArrayBuffer | ArrayBufferView | ShapefileObject;

export interface GeoJSON {
  type: 'FeatureCollection';
  features: any[];
  fileName?: string;
}

/**
 * Combines shapefile geometries and DBF properties into a GeoJSON FeatureCollection.
 */
export function combine(data: [any[], any[] | undefined]): GeoJSON;

/**
 * Parses a zipped shapefile.
 */
export function parseZip(
  buffer: ArrayBuffer | SharedArrayBuffer | ArrayBufferView,
  whiteList?: string[],
  options?: Options
): Promise<GeoJSON | GeoJSON[]>;

/**
 * Main function to load a shapefile from a URL, Buffer, or Object.
 */
export function getShapefile(
  base: ShapefileInput,
  whiteList?: string[],
  options?: Options
): Promise<GeoJSON | GeoJSON[]>;

/**
 * Low-level function to parse DBF data.
 */
export function parseDbf(dbf: any, cpg: any, defaultEncoding?: string): any[];

/**
 * Low-level function to parse SHP data.
 */
export function parseShp(shp: any, prj: any): any[];

/**
 * Internal helper to resolve the default encoding from options.
 */
export function resolveDefaultEncoding(options?: Options): string | undefined;

export default getShapefile;
