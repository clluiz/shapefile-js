import proj4 from 'proj4'
import unzip from './unzip.js';
import binaryAjax from './binaryajax.js';
import parseShp from './parseShp.js';
import parseDbf from 'parsedbf';
const URL = globalThis.URL;
const toUitn8Arr = b => {
  if (!b) {
    throw new Error('forgot to pass buffer');
  }
  if (isArrayBuffer(b)) {
    return new Uint8Array(b);
  }
  if (isArrayBuffer(b.buffer)) {
    if (b.BYTES_PER_ELEMENT === 1) {
      return b;
    }
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  throw new Error('invalid buffer like object')
};
const txtDecoder = new TextDecoder();
const toString = (possibleString) => {
  if (!possibleString) {
    return;
  }
  if (typeof possibleString === 'string') {
    return possibleString;
  }
  if (isArrayBuffer(possibleString) || ArrayBuffer.isView(possibleString) || isDataView(possibleString)) {
    return txtDecoder.decode(possibleString);
  }
}
const toDataView = b => {
  if (!b) {
    throw new Error('forgot to pass buffer');
  }
  if (isDataView(b)) {
    return b;
  }
  if (isArrayBuffer(b)) {
    return new DataView(b);
  }
  if (isArrayBuffer(b.buffer)) {
    return new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  throw new Error('invalid buffer like object')
};

function isArrayBuffer(subject) {
  return subject instanceof globalThis.ArrayBuffer || Object.prototype.toString.call(subject) === '[object ArrayBuffer]';
}
function isDataView(subject) {
  return subject instanceof globalThis.DataView || Object.prototype.toString.call(subject) === '[object DataView]'
}

// regex copiada do parsedbf para reconhecer "ANSI 1250", "1250", etc.
const ANSI_CODEPAGE_REGEX = /^(?:ANSI\s)?(\d+)$/m;

/**
 * Valida e resolve o encoding de `options.defaultEncoding`.
 * Retorna o encoding resolvido (string) ou undefined (quando não definido).
 * Lança TypeError se o encoding for uma string inválida.
 */
function resolveDefaultEncoding(options) {
  const enc = options && options.defaultEncoding;
  if (!enc) {
    return undefined;
  }
  // Tenta o valor direto primeiro
  try {
    new TextDecoder(enc.trim());
    return enc.trim();
  } catch (_) {
    // Tenta a forma alias "ANSI XXXX" ou apenas "XXXX" → "windows-XXXX"
    const match = ANSI_CODEPAGE_REGEX.exec(enc);
    if (match) {
      const resolved = 'windows-' + match[1];
      try {
        new TextDecoder(resolved);
        return resolved;
      } catch (_) {
        // cai no erro abaixo
      }
    }
    throw new TypeError(`Invalid defaultEncoding: "${enc}" is not a supported encoding label.`);
  }
}

export const combine = function ([shp, dbf]) {
  const out = {};
  out.type = 'FeatureCollection';
  out.features = [];
  let i = 0;
  const len = shp.length;
  if (!dbf) {
    dbf = [];
  }
  while (i < len) {
    out.features.push({
      type: 'Feature',
      geometry: shp[i],
      properties: dbf[i] || {}
    });
    i++;
  }
  return out;
};
export const parseZip = async function (buffer, whiteList, options) {
  let key;
  buffer = toUitn8Arr(buffer);
  const zip = await unzip(buffer);
  const names = [];
  whiteList = whiteList || [];
  const defaultEncoding = resolveDefaultEncoding(options);
  for (key in zip) {
    if (key.indexOf('__MACOSX') !== -1) {
      continue;
    }
    if (key.slice(-4).toLowerCase() === '.shp') {
      names.push(key.slice(0, -4));
      zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = zip[key];
    } else if (key.slice(-4).toLowerCase() === '.prj') {
      zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = proj4(zip[key]);
    } else if (key.slice(-5).toLowerCase() === '.json' || whiteList.indexOf(key.split('.').pop()) > -1) {
      names.push(key.slice(0, -3) + key.slice(-3).toLowerCase());
    } else if (key.slice(-4).toLowerCase() === '.dbf' || key.slice(-4).toLowerCase() === '.cpg') {
      zip[key.slice(0, -3) + key.slice(-3).toLowerCase()] = zip[key];
    }
  }
  if (!names.length) {
    throw new Error('no layers founds');
  }
  const geojson = names.map(function (name) {
    let parsed, dbf;
    const lastDotIdx = name.lastIndexOf('.');
    if (lastDotIdx > -1 && name.slice(lastDotIdx).indexOf('json') > -1) {
      parsed = JSON.parse(zip[name]);
      parsed.fileName = name.slice(0, lastDotIdx);
    } else if (whiteList.indexOf(name.slice(lastDotIdx + 1)) > -1) {
      parsed = zip[name];
      parsed.fileName = name;
    } else {
      if (zip[name + '.dbf']) {
        const cpg = zip[name + '.cpg'];
        dbf = parseDbf(zip[name + '.dbf'], cpg || defaultEncoding);
      }
      parsed = combine([parseShp(zip[name + '.shp'], zip[name + '.prj']), dbf]);
      parsed.fileName = name;
    }
    return parsed;
  });
  if (geojson.length === 1) {
    return geojson[0];
  } else {
    return geojson;
  }
};
async function getZip(base, whiteList, options) {
  const a = await binaryAjax(base);
  return parseZip(a, whiteList, options);
}
const handleShp = async (base) => {
  const args = await Promise.all([
    binaryAjax(base, 'shp'),
    binaryAjax(base, 'prj')
  ]);
  let prj = false;
  try {
    if (args[1]) {
      prj = proj4(args[1]);
    }
  } catch (e) {
    prj = false;
  }
  return parseShp(args[0], prj);
};
const handleDbf = async (base, defaultEncoding) => {
  const [dbf, cpg] = await Promise.all([
    binaryAjax(base, 'dbf'),
    binaryAjax(base, 'cpg')
  ]);
  if (!dbf) {
    return;
  }
  return parseDbf(dbf, cpg || defaultEncoding);
};
const checkSuffix = (base, suffix) => {
  const url = new URL(base, globalThis?.document?.location);
  return url.pathname.slice(-4).toLowerCase() === suffix;
};
const fromObject = ({ shp, dbf, cpg, prj }, defaultEncoding) => {
  const things = [
    _parseShp(shp, prj)
  ]
  if (dbf) {
    things.push(_parseDbf(dbf, cpg || defaultEncoding));
  }
  return combine(things);
}
export const getShapefile = async function (base, whiteList, options) {
  const defaultEncoding = resolveDefaultEncoding(options);
  if (typeof base !== 'string') {
    if (isArrayBuffer(base) || ArrayBuffer.isView(base) || isDataView(base)) {
      return parseZip(base, whiteList, options);
    }
    if (base.shp) {
      return fromObject(base, defaultEncoding);
    }
    throw new TypeError('must be a string, some sort of Buffer, or an object with at least a .shp property')
  }
  if (checkSuffix(base, '.zip')) {
    return getZip(base, whiteList, options);
  }
  if (checkSuffix(base, '.shp')) {
    base = base.slice(0, -4);
  }
  const results = await Promise.all([
    handleShp(base),
    handleDbf(base, defaultEncoding)
  ]);
  return combine(results);
};
const _parseShp = function (shp, prj) {
  shp = toDataView(shp);
  prj = toString(prj);
  if (typeof prj === 'string') {
    try {
      prj = proj4(prj);
    } catch (e) {
      prj = false;
    }
  }
  return parseShp(shp, prj);
};
const _parseDbf = function (dbf, cpg, defaultEncoding) {
  dbf = toDataView(dbf);
  cpg = toString(cpg);
  // defaultEncoding já foi validado por resolveDefaultEncoding antes de chegar aqui
  return parseDbf(dbf, cpg || defaultEncoding);
};
export default getShapefile;
export {
  _parseDbf as parseDbf,
  _parseShp as parseShp,
  resolveDefaultEncoding,
}