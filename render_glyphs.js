// I don't really understand the landscape of fonts mapping
// Unicode code points to different glyphs depending on the
// locale's language. Surely there is a way to directly access
// such a list, either from a font directly, or from an open
// source font's source, or maybe there's an industry-standard
// database of code points that ought to look differently.
// Alas, I don't know how to find any of those things. The
// easiest solution was to render every code point using pango
// in a font+fallback that does this mapping well, and just let
// my computer churn while it generates an image of every glyph.
// This script creates a database (glyphs.sqlite) with two tables:
// codepoints map code points and languages to rendered glyphs
// and glyphs maps glyph keys (a hash of the rendered image)
// to a base64-encoded PNG image, as well as the name of the font
// that rendered it, for citation purposes. (It may differ from
// the font chosen below when a fallback font is used.)

// TODO: Update to the latest version of Iosevka and consider
// which alternate is best if I want to use the rendered glyph
// images.

// I've chosen a font that appears to have strong support
// for language-based glyph rendering: Iosevka.
// https://github.com/be5invis/Iosevka
// It handles the Russian/Bulgarian example from
// https://tonsky.me/blog/unicode/.
let font = "Iosevka"; // excellent language handling

// pango recognizes ISO 639-1 two-letter language codes.
// https://docs.gtk.org/Pango/type_func.Language.from_string.html
// A mapping from language codes to Unicode Script names is
// extracted from the table at https://www.unicode.org/cldr/charts/44/supplemental/languages_and_scripts.html
// (with three-letter codes dropped). So we can limit the
// renderings to just the languages that use the primary Script
// of each code point. (It's still a lot.)
const language_codes = {
  aa: [ 'Latin' ],
  ab: [ 'Cyrillic' ],
  ae: [ 'Avestan' ],
  af: [ 'Latin' ],
  ak: [ 'Latin' ],
  am: [ 'Ethiopic' ],
  an: [ 'Latin' ],
  ar: [ 'Arabic', 'Syriac' ],
  as: [ 'Bangla' ],
  av: [ 'Cyrillic' ],
  ay: [ 'Latin' ],
  az: [ 'Arabic', 'Cyrillic', 'Latin' ],
  ba: [ 'Cyrillic' ],
  be: [ 'Cyrillic' ],
  bg: [ 'Cyrillic' ],
  bi: [ 'Latin' ],
  bm: [ 'Latin', 'N’Ko' ],
  bn: [ 'Bangla' ],
  bo: [ 'Tibetan' ],
  br: [ 'Latin' ],
  bs: [ 'Cyrillic', 'Latin' ],
  ca: [ 'Latin' ],
  ce: [ 'Cyrillic' ],
  ch: [ 'Latin' ],
  co: [ 'Latin' ],
  cr: [ 'Latin', 'Unified Canadian Aboriginal Syllabics' ],
  cs: [ 'Latin' ],
  cu: [ 'Cyrillic' ],
  cv: [ 'Cyrillic' ],
  cy: [ 'Latin' ],
  da: [ 'Latin' ],
  de: [ 'Latin', 'Runic' ],
  dv: [ 'Thaana' ],
  dz: [ 'Tibetan' ],
  ee: [ 'Latin' ],
  el: [ 'Greek' ],
  en: [ 'Latin', 'Deseret', 'Shavian' ],
  eo: [ 'Latin' ],
  es: [ 'Latin' ],
  et: [ 'Latin' ],
  eu: [ 'Latin' ],
  fa: [ 'Arabic' ],
  ff: [ 'Adlam', 'Latin' ],
  fi: [ 'Latin' ],
  fj: [ 'Latin' ],
  fo: [ 'Latin' ],
  fr: [ 'Latin', 'Duployan shorthand' ],
  fy: [ 'Latin' ],
  ga: [ 'Latin' ],
  gd: [ 'Latin' ],
  gl: [ 'Latin' ],
  gn: [ 'Latin' ],
  gu: [ 'Gujarati' ],
  gv: [ 'Latin' ],
  ha: [ 'Arabic', 'Latin' ],
  he: [ 'Hebrew' ],
  hi: [ 'Devanagari', 'Latin', 'Mahajani' ],
  ho: [ 'Latin' ],
  hr: [ 'Latin' ],
  ht: [ 'Latin' ],
  hu: [ 'Latin' ],
  hy: [ 'Armenian' ],
  hz: [ 'Latin' ],
  ia: [ 'Latin' ],
  id: [ 'Arabic', 'Latin' ],
  ie: [ 'Latin' ],
  ig: [ 'Latin' ],
  ii: [ 'Latin', 'Yi' ],
  ik: [ 'Latin' ],
  is: [ 'Latin' ],
  it: [ 'Latin' ],
  iu: [ 'Latin', 'Unified Canadian Aboriginal Syllabics' ],
  ja: [ 'Japanese' ],
  jv: [ 'Javanese', 'Latin' ],
  ka: [ 'Georgian' ],
  kg: [ 'Latin' ],
  ki: [ 'Latin' ],
  kj: [ 'Latin' ],
  kk: [ 'Arabic', 'Cyrillic' ],
  kl: [ 'Latin' ],
  km: [ 'Khmer' ],
  kn: [ 'Kannada' ],
  ko: [ 'Korean' ],
  kr: [ 'Latin' ],
  ks: [ 'Arabic', 'Devanagari' ],
  ku: [ 'Arabic', 'Cyrillic', 'Latin' ],
  kv: [ 'Cyrillic', 'Old Permic' ],
  kw: [ 'Latin' ],
  ky: [ 'Arabic', 'Cyrillic', 'Latin' ],
  la: [ 'Latin' ],
  lb: [ 'Latin' ],
  lg: [ 'Latin' ],
  li: [ 'Latin' ],
  ln: [ 'Latin' ],
  lo: [ 'Lao' ],
  lt: [ 'Latin' ],
  lu: [ 'Latin' ],
  lv: [ 'Latin' ],
  mg: [ 'Latin' ],
  mh: [ 'Latin' ],
  mi: [ 'Latin' ],
  mk: [ 'Cyrillic' ],
  ml: [ 'Malayalam' ],
  mn: [ 'Cyrillic', 'Mongolian', 'Phags-pa' ],
  mr: [ 'Devanagari', 'Modi' ],
  ms: [ 'Arabic', 'Latin' ],
  mt: [ 'Latin' ],
  my: [ 'Myanmar' ],
  na: [ 'Latin' ],
  nb: [ 'Latin' ],
  nd: [ 'Latin' ],
  ne: [ 'Devanagari' ],
  ng: [ 'Latin' ],
  nl: [ 'Latin' ],
  nn: [ 'Latin' ],
  no: [ 'Latin' ],
  nr: [ 'Latin' ],
  nv: [ 'Latin' ],
  ny: [ 'Latin' ],
  oc: [ 'Latin' ],
  oj: [ 'Latin', 'Unified Canadian Aboriginal Syllabics' ],
  om: [ 'Ethiopic', 'Latin' ],
  or: [ 'Odia' ],
  os: [ 'Cyrillic' ],
  pa: [ 'Arabic', 'Gurmukhi' ],
  pi: [ 'Devanagari', 'Sinhala', 'Thai' ],
  pl: [ 'Latin' ],
  ps: [ 'Arabic' ],
  pt: [ 'Latin' ],
  qu: [ 'Latin' ],
  rm: [ 'Latin' ],
  rn: [ 'Latin' ],
  ro: [ 'Cyrillic', 'Latin' ],
  ru: [ 'Cyrillic' ],
  rw: [ 'Latin' ],
  sa: [ 'Devanagari', 'Sinhala', 'Grantha', 'Sharada', 'Siddham' ],
  sc: [ 'Latin' ],
  sd: [ 'Arabic', 'Devanagari', 'Khojki', 'Khudawadi' ],
  se: [ 'Cyrillic', 'Latin' ],
  sg: [ 'Latin' ],
  sh: [ 'Unknown Script' ],
  si: [ 'Sinhala' ],
  sk: [ 'Latin' ],
  sl: [ 'Latin' ],
  sm: [ 'Latin' ],
  sn: [ 'Latin' ],
  so: [ 'Arabic', 'Latin', 'Osmanya' ],
  sq: [ 'Latin', 'Elbasan' ],
  sr: [ 'Cyrillic', 'Latin' ],
  ss: [ 'Latin' ],
  st: [ 'Latin' ],
  su: [ 'Latin', 'Sundanese' ],
  sv: [ 'Latin' ],
  sw: [ 'Latin' ],
  ta: [ 'Tamil' ],
  te: [ 'Telugu' ],
  tg: [ 'Arabic', 'Cyrillic', 'Latin' ],
  th: [ 'Thai' ],
  ti: [ 'Ethiopic' ],
  tk: [ 'Arabic', 'Cyrillic', 'Latin' ],
  tl: [ 'Unknown Script' ],
  tn: [ 'Latin' ],
  to: [ 'Latin' ],
  tr: [ 'Arabic', 'Latin' ],
  ts: [ 'Latin' ],
  tt: [ 'Cyrillic' ],
  tw: [ 'Unknown Script' ],
  ty: [ 'Latin' ],
  ug: [ 'Arabic', 'Cyrillic', 'Latin' ],
  uk: [ 'Cyrillic' ],
  ur: [ 'Arabic' ],
  uz: [ 'Arabic', 'Cyrillic', 'Latin' ],
  ve: [ 'Latin' ],
  vi: [ 'Han', 'Latin' ],
  vo: [ 'Latin' ],
  wa: [ 'Latin' ],
  wo: [ 'Arabic', 'Latin' ],
  xh: [ 'Latin' ],
  yi: [ 'Hebrew' ],
  yo: [ 'Latin' ],
  za: [ 'Latin', 'Simplified' ],
  zh: [ 'Bopomofo', 'Simplified', 'Traditional', 'Phags-pa' ],
  zu: [ 'Latin' ]
};

//// //// //// //// //// //// //// //// //// //// //// //// //// //// ////

const fs = require('fs');
const { exec } = require('child_process');
const crypto = require("crypto");
const sqlite3 = require('sqlite3');

// Make a list of all glyph-language pairs that we want to render.
let corpus = [];

// Select non-CJK code points. These are missing from UnicodeData.json
// because they are expressed in ranges only.
let ucd = JSON.parse(fs.readFileSync('node_modules/ucd-full/UnicodeData.json'));
let ucsScripts = JSON.parse(fs.readFileSync('node_modules/ucd-full/Scripts.json'));
ucd.UnicodeData.forEach(cp => {
  // Some entries in this database are not code points.
  if (!cp.codepoint) return;

  let codepoint = parseInt(cp.codepoint, 16);
  let text = String.fromCodePoint(codepoint);

  // Control, format, private use, and surrogate code points
  // do not have glyphs.
  if (cp.category.charAt(0) == "C")
    return;

  // Spaces and line/paragraph separators do not have glyphs.
  if (cp.category.charAt(0) == "Z")
    return;

  // Combining characters need something to attach to. The
  // dotted circle is customary.
  if (cp.category.charAt(0) == "M")
    text = "\u25CC" + text;

  // Remove other non-code point entries like for CJK ranges.
  if (cp.name.charAt(0) == "<") // e.g. "<CJK Ideograph, Last>"
    return;

  // Check which scripts this code point is associated with.
  // TODO: Also scan ScriptExtensions data.
  let scripts = [];
  ucsScripts.Scripts.forEach(script => {
    let range0 = parseInt(script.range[0], 16);
    let range1 = parseInt(script.range[1], 16);
    if ((!range1 && codepoint == range0)
        || (range1 && range0 <= codepoint && codepoint <= range1))
    {
      scripts.push(script.script);
    }
  });

  // Find language codes that map to this script.
  let languages = [];
  Object.keys(language_codes).forEach(language => {
    language_codes[language].forEach(script => {
      if (scripts.indexOf(script) >= 0)
        languages.push(language);
    })
  })

  // The language list is empty, render for English.
  // Many code points are not associated with any Script.
  if (languages.length == 0)
    languages.push("en"); 

  languages.forEach(language => {
    corpus.push([codepoint, text, language, font]);
  });

});

console.log(corpus.length + '...');

// Render the glyphs.

const db = new sqlite3.Database('glyphs.sqlite');

db.run("CREATE TABLE glyphs (hash TEXT, font TXT, png TXT, UNIQUE(hash))");
db.run("CREATE TABLE codepoints (codepoint INT, language TXT, glyph TEXT, UNIQUE(codepoint, language))");

function render_glyph(i)
{
  if (i == corpus.length)
    return;

  let codepoint = corpus[i][0];
  let text = corpus[i][1];
  let language = corpus[i][2];
  let font = corpus[i][3];

  // Save text in UTF-8 and specify that in the LOCALE for spawning pango-view.
  let txt_fn = '/tmp/pango-view.txt';
  fs.writeFileSync(txt_fn, text, "utf8");

  let png_fn = "/tmp/pango-view.png";
  let cmd = 'pango-view --dpi=300 --language=' + language + ' --font=' + font + ' --output=' + png_fn + '  --serialize-to=' + png_fn + '.xml -q ' + txt_fn;
  exec(cmd,
       { "env": {
        "HOME": "/home/user", // need to search locally installed fonts
        "LOCALE": "C.UTF8", // unclear if it actually controls input encoding
        "DISPLAY": ":0" // for debugging when '-q' is not included
       } },
       (error, stdout, stderr) => {
    if (error) {
      console.error(`error: ${error.message}`);
      return;
    }

    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }

    var shasum = crypto.createHash('sha1');
    var blob = fs.readFileSync(png_fn, null);
    shasum.update(blob);
    let hash = shasum.digest('hex');

    // From the serialization file extract the font that
    // was used to render the glyph. This might be a different
    // font than the one requested if a fallback font was used.
    var ser = fs.readFileSync(png_fn + '.xml', 'utf8');
    let font = ser.match(/"description" : "(.*)"/)[1];
    font = font.replace(/ 12$/, ''); // strip out the expected font size

    console.log(codepoint, text, language, font, hash);

    const stmt_glyph = db.prepare("INSERT OR IGNORE INTO glyphs VALUES (?, ?, ?)");
    stmt_glyph.run(hash, font, blob.toString("base64"));
    stmt_glyph.finalize();

    const stmt_cp = db.prepare("INSERT INTO codepoints VALUES (?, ?, ?)");
    stmt_cp.run(codepoint, language, hash);
    stmt_cp.finalize();

    // Render the next one.
    render_glyph(i+1);
  });
}

render_glyph(0);
