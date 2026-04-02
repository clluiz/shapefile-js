
import shp, { parseZip, parseDbf, resolveDefaultEncoding } from '../lib/index.js';
import { should as shouldRaw, use, assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';

const should = shouldRaw();
use(chaiAsPromised);

const get = url => fetch(url).then(resp => resp.arrayBuffer());

// Valores corretos do codepage.dbf decodificado com windows-1250
const CODEPAGE_WINDOWS_1250 = ['??', 'Hněvošický háj'];
// Mesmo DBF decodificado como UTF-8 (padrão, sem cpg)
const CODEPAGE_UTF8_FALLBACK  = ['??', 'Hn\uFFFDvo\uFFFDick\uFFFD h\uFFFDj'];

describe('defaultEncoding option', function () {

  // ─── 1. COMPORTAMENTO LEGADO (sem a opção) ────────────────────────────────

  describe('legacy behavior — no options passed', function () {

    it('URL unzipped: sem .cpg usa UTF-8 e mantém comportamento original', function () {
      // no-cpg não tem .cpg → fallback UTF-8
      return shp('http://localhost:3000/test/data/no-cpg')
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_UTF8_FALLBACK);
    });

    it('URL zipped: sem .cpg usa UTF-8 e mantém comportamento original', function () {
      return shp('http://localhost:3000/test/data/no-cpg.zip')
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_UTF8_FALLBACK);
    });

    it('object {shp, dbf}: sem cpg usa UTF-8 e mantém comportamento original', function () {
      return Promise.all([
        get('http://localhost:3000/test/data/no-cpg.shp'),
        get('http://localhost:3000/test/data/no-cpg.dbf'),
      ]).then(([shapefile, dbf]) => shp({ shp: shapefile, dbf }))
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_UTF8_FALLBACK);
    });

    it('buffer zip: sem .cpg usa UTF-8 e mantém comportamento original', function () {
      return get('http://localhost:3000/test/data/no-cpg.zip')
        .then(buf => shp(buf))
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_UTF8_FALLBACK);
    });

    it('.cpg existente é respeitado mesmo sem defaultEncoding', function () {
      // codepage.cpg = "ANSI 1250" → windows-1250; defaultEncoding não é necessário
      return shp('http://localhost:3000/test/data/codepage')
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });
  });

  // ─── 2. defaultEncoding APLICADO CORRETAMENTE ─────────────────────────────

  describe('defaultEncoding applied — sem .cpg no arquivo', function () {

    it('URL unzipped: defaultEncoding decodifica corretamente', function () {
      return shp('http://localhost:3000/test/data/no-cpg', null, { defaultEncoding: 'windows-1250' })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });

    it('URL zipped: defaultEncoding decodifica corretamente', function () {
      return shp('http://localhost:3000/test/data/no-cpg.zip', null, { defaultEncoding: 'windows-1250' })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });

    it('buffer zip: defaultEncoding decodifica corretamente via parseZip', function () {
      return get('http://localhost:3000/test/data/no-cpg.zip')
        .then(buf => parseZip(buf, null, { defaultEncoding: 'windows-1250' }))
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });

    it('object {shp, dbf}: defaultEncoding decodifica corretamente', function () {
      return Promise.all([
        get('http://localhost:3000/test/data/no-cpg.shp'),
        get('http://localhost:3000/test/data/no-cpg.dbf'),
      ]).then(([shapefile, dbf]) =>
        shp({ shp: shapefile, dbf }, null, { defaultEncoding: 'windows-1250' })
      )
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });

    it('aceita o formato raw do .cpg como defaultEncoding ("ANSI 1250")', function () {
      return shp('http://localhost:3000/test/data/no-cpg', null, { defaultEncoding: 'ANSI 1250' })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });
  });

  // ─── 3. .cpg PREVALECE SOBRE defaultEncoding ──────────────────────────────

  describe('.cpg prevalece sobre defaultEncoding', function () {

    it('URL unzipped: .cpg presente ignora defaultEncoding incorreto', function () {
      // codepage.cpg = "ANSI 1250" → windows-1250
      // defaultEncoding errado (UTF-8) não deve ser usado
      return shp('http://localhost:3000/test/data/codepage', null, { defaultEncoding: 'UTF-8' })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });

    it('URL zipped: .cpg presente ignora defaultEncoding incorreto', function () {
      return shp('http://localhost:3000/test/data/codepage.zip', null, { defaultEncoding: 'UTF-8' })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });

    it('object {shp, dbf, cpg}: cpg explícito prevalece sobre defaultEncoding', function () {
      return Promise.all([
        get('http://localhost:3000/test/data/codepage.shp'),
        get('http://localhost:3000/test/data/codepage.dbf'),
        get('http://localhost:3000/test/data/codepage.cpg'),
      ]).then(([shapefile, dbf, cpg]) =>
        shp({ shp: shapefile, dbf, cpg }, null, { defaultEncoding: 'UTF-8' })
      )
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });
  });

  // ─── 4. EDGE CASES ────────────────────────────────────────────────────────

  describe('edge cases', function () {

    it('options = {} (objeto vazio) se comporta como sem options', function () {
      return shp('http://localhost:3000/test/data/no-cpg', null, {})
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_UTF8_FALLBACK);
    });

    it('defaultEncoding = undefined explícito usa UTF-8 (fallback padrão)', function () {
      return shp('http://localhost:3000/test/data/no-cpg', null, { defaultEncoding: undefined })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_UTF8_FALLBACK);
    });

    it('defaultEncoding = null usa UTF-8 (fallback padrão)', function () {
      return shp('http://localhost:3000/test/data/no-cpg', null, { defaultEncoding: null })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_UTF8_FALLBACK);
    });

    it('defaultEncoding inválido lança TypeError antes de iniciar o parsing', function () {
      return shp('http://localhost:3000/test/data/no-cpg', null, { defaultEncoding: 'not-a-real-encoding' })
        .should.be.rejectedWith(TypeError, /Invalid defaultEncoding/);
    });

    it('defaultEncoding inválido via zip também lança TypeError', function () {
      return shp('http://localhost:3000/test/data/no-cpg.zip', null, { defaultEncoding: 'banana' })
        .should.be.rejectedWith(TypeError, /Invalid defaultEncoding/);
    });

    it('defaultEncoding inválido via buffer/parseZip também lança TypeError', function () {
      return get('http://localhost:3000/test/data/no-cpg.zip')
        .then(buf => parseZip(buf, null, { defaultEncoding: 'not-valid' }))
        .should.be.rejectedWith(TypeError, /Invalid defaultEncoding/);
    });

    it('defaultEncoding inválido via object {shp,dbf} também lança TypeError', function () {
      return Promise.all([
        get('http://localhost:3000/test/data/no-cpg.shp'),
        get('http://localhost:3000/test/data/no-cpg.dbf'),
      ]).then(([shapefile, dbf]) =>
        shp({ shp: shapefile, dbf }, null, { defaultEncoding: 'invalid-enc' })
      ).should.be.rejectedWith(TypeError, /Invalid defaultEncoding/);
    });

    it('options não afeta shapefiles sem .dbf', function () {
      return shp('http://localhost:3000/test/data/no-dbf', null, { defaultEncoding: 'windows-1250' })
        .then(item => {
          item.should.contain.keys('type', 'features');
          return item.features;
        }).should.eventually.have.length(14);
    });

    it('options não afeta shapefiles sem .dbf em zip', function () {
      return shp('http://localhost:3000/test/data/no-dbf.zip', null, { defaultEncoding: 'windows-1250' })
        .then(item => {
          item.should.contain.keys('type', 'features');
          return item.features;
        }).should.eventually.have.length(14);
    });

    it('propriedades extras em options são ignoradas silenciosamente', function () {
      return shp('http://localhost:3000/test/data/no-cpg', null, {
        defaultEncoding: 'windows-1250',
        unknownOption: true,
        anotherOne: 42,
      })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });

    it('buffer zip com options não afeta shapefiles sem dbf', function () {
      return get('http://localhost:3000/test/data/no-dbf.zip')
        .then(buf => parseZip(buf, null, { defaultEncoding: 'windows-1250' }))
        .then(item => {
          item.type.should.equal('FeatureCollection');
          return item.features;
        }).should.eventually.have.length(14);
    });

    it('URL com .shp suffix e defaultEncoding funciona corretamente', function () {
      return shp('http://localhost:3000/test/data/no-cpg.shp', null, { defaultEncoding: 'windows-1250' })
        .then(item => item.features.map(f => f.properties.field))
        .should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });

    it('parseDbf exportado respeita o terceiro argumento defaultEncoding', function () {
      return get('http://localhost:3000/test/data/no-cpg.dbf')
        .then(dbfBuf => {
          // sem cpg, usando defaultEncoding como terceiro argumento
          const rows = parseDbf(dbfBuf, undefined, 'windows-1250');
          return rows.map(r => r.field);
        }).should.eventually.deep.equal(CODEPAGE_WINDOWS_1250);
    });
  });

  // ─── 5. UNIT TESTS de resolveDefaultEncoding ──────────────────────────────

  describe('resolveDefaultEncoding unit tests', function () {

    it('retorna undefined quando options é undefined', function () {
      assert.isUndefined(resolveDefaultEncoding(undefined));
    });

    it('retorna undefined quando options é {}', function () {
      assert.isUndefined(resolveDefaultEncoding({}));
    });

    it('retorna undefined quando defaultEncoding é null', function () {
      assert.isUndefined(resolveDefaultEncoding({ defaultEncoding: null }));
    });

    it('retorna undefined quando defaultEncoding é undefined', function () {
      assert.isUndefined(resolveDefaultEncoding({ defaultEncoding: undefined }));
    });

    it('retorna o encoding trimado para valor válido direto', function () {
      assert.equal(resolveDefaultEncoding({ defaultEncoding: '  UTF-8  ' }), 'UTF-8');
    });

    it('retorna windows-XXXX para alias "ANSI XXXX"', function () {
      assert.equal(resolveDefaultEncoding({ defaultEncoding: 'ANSI 1250' }), 'windows-1250');
    });

    it('retorna windows-XXXX para alias apenas o número "1252"', function () {
      assert.equal(resolveDefaultEncoding({ defaultEncoding: '1252' }), 'windows-1252');
    });

    it('lança TypeError para encoding completamente inválido', function () {
      assert.throws(
        () => resolveDefaultEncoding({ defaultEncoding: 'not-a-real-encoding' }),
        TypeError,
        /Invalid defaultEncoding/
      );
    });

    it('lança TypeError para string vazia', function () {
      // string vazia é falsy → retorna undefined (não lança)
      assert.isUndefined(resolveDefaultEncoding({ defaultEncoding: '' }));
    });

    it('lança TypeError para ANSI com número de página inexistente', function () {
      // "ANSI 99999" não existe como windows-99999
      assert.throws(
        () => resolveDefaultEncoding({ defaultEncoding: 'ANSI 99999' }),
        TypeError,
        /Invalid defaultEncoding/
      );
    });

    it('aceita ISO-8859-1', function () {
      assert.equal(resolveDefaultEncoding({ defaultEncoding: 'ISO-8859-1' }), 'ISO-8859-1');
    });

    it('aceita windows-1250 diretamente', function () {
      assert.equal(resolveDefaultEncoding({ defaultEncoding: 'windows-1250' }), 'windows-1250');
    });
  });
});
