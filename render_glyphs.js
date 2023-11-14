// I don't really understand the landscape of fonts mapping
// Unicode code points to different glyphs depending on the
// locale's language. Surely there is a data file that
// specifies this mapping when a font is constructed, but I
// don't know where to look for it. There might even be an
// industry-standard database of possible mappings. No idea.
// This script extracts the situation out of a chosen font
// by rendering every glyph (using pango) in every language
// and looking for whether the generated PNG images are exact
// matches or not.

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
// (with three-letter codes dropped).
const language_codes = {
  'aa': 'Latin', 'ab': 'Cyrillic', 'ae': 'Avestan', 'af': 'Latin', 'ak': 'Latin',
  'am': 'Ethiopic', 'an': 'Latin', 'ar': 'Arabic', 'ar': 'Syriac', 'as': 'Bangla',
  'av': 'Cyrillic', 'ay': 'Latin', 'az': 'Arabic', 'az': 'Cyrillic', 'az': 'Latin',
  'ba': 'Cyrillic', 'be': 'Cyrillic', 'bg': 'Cyrillic', 'bi': 'Latin', 'bm': 'Latin',
  'bm': 'N’Ko', 'bn': 'Bangla', 'bo': 'Tibetan', 'br': 'Latin', 'bs': 'Cyrillic', 
  'bs': 'Latin', 'ca': 'Latin', 'ce': 'Cyrillic', 'ch': 'Latin', 'co': 'Latin', 
  'cr': 'Latin', 'cr': 'Unified Canadian Aboriginal Syllabics', 'cs': 'Latin', 'cu': 'Cyrillic', 'cv': 'Cyrillic', 
  'cy': 'Latin', 'da': 'Latin', 'de': 'Latin', 'de': 'Runic', 'dv': 'Thaana', 
  'dz': 'Tibetan', 'ee': 'Latin', 'el': 'Greek', 'en': 'Latin', 'en': 'Deseret', 
  'en': 'Shavian', 'eo': 'Latin', 'es': 'Latin', 'et': 'Latin', 'eu': 'Latin', 
  'fa': 'Arabic', 'ff': 'Adlam', 'ff': 'Latin', 'fi': 'Latin', 'fj': 'Latin', 
  'fo': 'Latin', 'fr': 'Latin', 'fr': 'Duployan shorthand', 'fy': 'Latin', 'ga': 'Latin', 
  'gd': 'Latin', 'gl': 'Latin', 'gn': 'Latin', 'gu': 'Gujarati', 'gv': 'Latin', 
  'ha': 'Arabic', 'ha': 'Latin', 'he': 'Hebrew', 'hi': 'Devanagari', 'hi': 'Latin', 
  'hi': 'Mahajani', 'ho': 'Latin', 'hr': 'Latin', 'ht': 'Latin', 'hu': 'Latin', 
  'hy': 'Armenian', 'hz': 'Latin', 'ia': 'Latin', 'id': 'Arabic', 'id': 'Latin', 
  'ie': 'Latin', 'ig': 'Latin', 'ii': 'Latin', 'ii': 'Yi', 'ik': 'Latin', 
  'is': 'Latin', 'it': 'Latin', 'iu': 'Latin', 'iu': 'Unified Canadian Aboriginal Syllabics', 'ja': 'Japanese', 
  'jv': 'Javanese', 'jv': 'Latin', 'ka': 'Georgian', 'kg': 'Latin', 'ki': 'Latin', 
  'kj': 'Latin', 'kk': 'Arabic', 'kk': 'Cyrillic', 'kl': 'Latin', 'km': 'Khmer', 
  'kn': 'Kannada', 'ko': 'Korean', 'kr': 'Latin', 'ks': 'Arabic', 'ks': 'Devanagari', 
  'ku': 'Arabic', 'ku': 'Cyrillic', 'ku': 'Latin', 'kv': 'Cyrillic', 'kv': 'Old Permic', 
  'kw': 'Latin', 'ky': 'Arabic', 'ky': 'Cyrillic', 'ky': 'Latin', 'la': 'Latin', 
  'lb': 'Latin', 'lg': 'Latin', 'li': 'Latin', 'ln': 'Latin', 'lo': 'Lao', 
  'lt': 'Latin', 'lu': 'Latin', 'lv': 'Latin', 'mg': 'Latin', 'mh': 'Latin', 
  'mi': 'Latin', 'mk': 'Cyrillic', 'ml': 'Malayalam', 'mn': 'Cyrillic', 'mn': 'Mongolian', 
  'mn': 'Phags-pa', 'mr': 'Devanagari', 'mr': 'Modi', 'ms': 'Arabic', 'ms': 'Latin', 
  'mt': 'Latin', 'my': 'Myanmar', 'na': 'Latin', 'nb': 'Latin', 'nd': 'Latin', 
  'ne': 'Devanagari', 'ng': 'Latin', 'nl': 'Latin', 'nn': 'Latin', 'no': 'Latin', 
  'nr': 'Latin', 'nv': 'Latin', 'ny': 'Latin', 'oc': 'Latin', 'oj': 'Latin', 
  'oj': 'Unified Canadian Aboriginal Syllabics', 'om': 'Ethiopic', 'om': 'Latin', 'or': 'Odia', 'os': 'Cyrillic', 
  'pa': 'Arabic', 'pa': 'Gurmukhi', 'pi': 'Devanagari', 'pi': 'Sinhala', 'pi': 'Thai', 
  'pl': 'Latin', 'ps': 'Arabic', 'pt': 'Latin', 'qu': 'Latin', 'rm': 'Latin', 
  'rn': 'Latin', 'ro': 'Cyrillic', 'ro': 'Latin', 'ru': 'Cyrillic', 'rw': 'Latin', 
  'sa': 'Devanagari', 'sa': 'Sinhala', 'sa': 'Grantha', 'sa': 'Sharada', 'sa': 'Siddham', 
  'sc': 'Latin', 'sd': 'Arabic', 'sd': 'Devanagari', 'sd': 'Khojki', 'sd': 'Khudawadi', 
  'se': 'Cyrillic', 'se': 'Latin', 'sg': 'Latin', 'sh': 'Unknown Script', 'si': 'Sinhala', 
  'sk': 'Latin', 'sl': 'Latin', 'sm': 'Latin', 'sn': 'Latin', 'so': 'Arabic', 
  'so': 'Latin', 'so': 'Osmanya', 'sq': 'Latin', 'sq': 'Elbasan', 'sr': 'Cyrillic', 
  'sr': 'Latin', 'ss': 'Latin', 'st': 'Latin', 'su': 'Latin', 'su': 'Sundanese', 
  'sv': 'Latin', 'sw': 'Latin', 'ta': 'Tamil', 'te': 'Telugu', 'tg': 'Arabic', 
  'tg': 'Cyrillic', 'tg': 'Latin', 'th': 'Thai', 'ti': 'Ethiopic', 'tk': 'Arabic', 
  'tk': 'Cyrillic', 'tk': 'Latin', 'tl': 'Unknown Script', 'tn': 'Latin', 'to': 'Latin', 
  'tr': 'Arabic', 'tr': 'Latin', 'ts': 'Latin', 'tt': 'Cyrillic', 'tw': 'Unknown Script', 
  'ty': 'Latin', 'ug': 'Arabic', 'ug': 'Cyrillic', 'ug': 'Latin', 'uk': 'Cyrillic', 
  'ur': 'Arabic', 'uz': 'Arabic', 'uz': 'Cyrillic', 'uz': 'Latin', 've': 'Latin', 
  'vi': 'Han', 'vi': 'Latin', 'vo': 'Latin', 'wa': 'Latin', 'wo': 'Arabic', 
  'wo': 'Latin', 'xh': 'Latin', 'yi': 'Hebrew', 'yo': 'Latin', 'za': 'Latin', 
  'za': 'Simplified', 'zh': 'Bopomofo', 'zh': 'Simplified', 'zh': 'Traditional', 'zh': 'Phags-pa', 
  'zu': 'Latin'
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
    let script = language_codes[language];
    if (scripts.indexOf(script) >= 0)
      languages.push(language);
  })

  // The language list is empty, render for English.
  if (languages.length == 0)
    languages.push("en"); 

  languages.forEach(language => {
    corpus.push([codepoint, text, language, font]);
  });

});

// Render the glyphs.

const db = new sqlite3.Database('glyphs.sqlite');

db.run("CREATE TABLE glyphs (hash TEXT, png TXT)");
db.run("CREATE TABLE codepoints (codepoint INT, language TXT, glyph TEXT)");

function render_glyph(i)
{
  if (i == corpus.length)
    return;

  let codepoint = corpus[i][0];
  let text = corpus[i][1];
  let language = corpus[i][2];
  let font = corpus[i][3];

  fs.writeFileSync('/tmp/pango-view.txt', text, "utf8");

  exec('pango-view --dpi=300 --language=' + language + ' --font=' + font + ' --output=/tmp/pango-view.png -q /tmp/pango-view.txt',
       { "env": { "LOCALE": "C.UTF8" } }, // unclear if it matters
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
    var blob = fs.readFileSync('/tmp/pango-view.png', null);
    shasum.update(blob);
    let hash = shasum.digest('hex');
    console.log(codepoint, text, language, hash);

    const stmt_glyph = db.prepare("INSERT INTO glyphs VALUES (?, ?)");
    stmt_glyph.run(hash, blob.toString("base64"));
    stmt_glyph.finalize();

    const stmt_cp = db.prepare("INSERT INTO codepoints VALUES (?, ?, ?)");
    stmt_cp.run(codepoint, language, hash);
    stmt_cp.finalize();

    // Render the next one.
    render_glyph(i+1);
  });
}

render_glyph(0);
