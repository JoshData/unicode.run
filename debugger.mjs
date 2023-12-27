import bidiFactory from './lib/bidi.min.mjs';
import { get_code_points_from_string, codepoint_to_utf8 } from './unicode_utils.mjs';

const bidi = bidiFactory();


function get_code_point_info(cp)
{
  // Adds general Unicode character database
  // data to the object.

  let cp_decimal = cp.codepoint.int;
  let codePointInfo = unicodeCharacterDatabase.cp[cp_decimal];
  if (!codePointInfo)
  {
    // See if this code point is in a ranage.
    unicodeCharacterDatabase.ranges.forEach(range => {
      if (range.start <= cp_decimal && cp_decimal >= range.end)
        codePointInfo = {
          name: range.name.replace(/##/, "#" + cp.codepoint.hex),
          cat: range.cat
        };
    });
  }
  if (!codePointInfo)
  {
    codePointInfo = {
      name: "Invalid Code Point",
      cat: "??"
    };
  }

  return {
    ...cp,
    
    // Major Unicode Character Data properties
    ...codePointInfo,

    // UTF8 representation
    utf8: codepoint_to_utf8(cp.codepoint.int),

    // BIDI
    bidiType: bidi.getBidiCharTypeName(cp.string),
  }
}


// Normalize the text and if that returns a different
// string, return information about the characters in
// the normalized form.
function get_normalization_info(text, form)
{
  var normalized = text.normalize(form);
  if (normalized == text)
    return null;
  return get_code_points_from_string(normalized)
    .map(get_code_point_info);
}

function add_bidi_levels(text, egcs)
{
  // Since BIDI is computed for whole paragraphs and
  // not at a character level, we have to pass the whole
  // text. It also depends on whether the context of
  // the text has an explicit direction. HTML can
  // defaul to L-to_R, I guess, so we can warn users
  // if the rendering depends on the context by computing
  // the BIDI levels for all three application contexts.

  const bidiAuto = bidi.getEmbeddingLevels(text, null);
  const bidiLtr = bidi.getEmbeddingLevels(text, "ltr");
  const bidiRtl = bidi.getEmbeddingLevels(text, "rtl");

  // But the character indexes that we get back are based
  // on Javascript's UTF-16 representation of the text,
  // not the (merged) code points that we use, and we also
  // have combined code points into extended grapheme
  // clusters. So we have to map the BIDI info back to our
  // data structure.
  let i = 0;
  egcs.forEach(egc => {
    egc.codepoints.forEach(cp => {
      // Read off the BIDI levels and for UTF-16 surrogate
      // pairs, skip over the level stored for the second
      // half of the pair.
      cp.bidi_level = {
        auto: bidiAuto.levels[i],
        ltr: bidiLtr.levels[i],
        rtl: bidiRtl.levels[i] };

      // Get the mirrored character, if any.
      // bidi.getMirroredCharactersMap returned an empty Map
      // but getMirroredCharacter seems to work.
      var mirrored_character = (bidiAuto.levels[i] & 1) //odd number means RTL
        ? bidi.getMirroredCharacter(text[i])
        : null;
      if (mirrored_character !== null)
        cp.bidi_mirrored_replacement = mirrored_character;

      i += cp.string.length;
    });

    // The EGC as a whole hopefully has a single BIDI
    // direction. Take the bidi_level of the first code point.
    egc.bidi_level = egc.codepoints[0].bidi_level;

    // If any characters have a BIDI mirror replacement,
    // recreate the EGC using the replacements so that
    // we get a displayed character.
    egc.string = egc.codepoints.map(cp => {
      return cp.bidi_mirrored_replacement || cp.string;
    }).join("");
  });

  return egcs;
}

export function debug_unicode_string(text, charmap)
{
  // Split the string into extended grapheme clusters, which
  // typically display in a single rectangular area and are
  // typically selectable as an atomic unit, although UIs may
  // allow backspacing through the code points that make up the
  // EGC. They may be made up of more than one Unicode code point.
  // For each, return the EGC itself, the sequence of code points
  // that make up the character, and normalization information
  // for the EGC as a whole (since single code points don't usually
  // have meaningful normalization).
  let next_char_index = 0;
  let egcs = splitGraphemeClusters(text)
    .map(cluster => {
      var codepoints = get_code_points_from_string(cluster);
      codepoints.forEach(cp => {
        cp.range[0] += next_char_index;
        cp.range[1] += next_char_index;
      })

      codepoints = codepoints.map(get_code_point_info);
      next_char_index = codepoints[codepoints.length-1].range[1] + 1;

      // Revise the input character range for each codepoint
      // according to the map from text characters to input
      // characters, if the input was not the text itself.
      if (charmap)
      {
        codepoints.forEach(c => {
          c.range[0] = charmap.get(c.range[0])[0];
          c.range[1] = charmap.get(c.range[1])[1];
        });
      }

      return {
        string: cluster,
        cat: codepoints[0].cat, // used for display

        codepoints: codepoints,
        range: [codepoints[0].range[0], codepoints[codepoints.length-1].range[1]],

        // Normalization
        nfc: get_normalization_info(cluster, "NFC"),
        nfd: get_normalization_info(cluster, "NFD"),
      };
    });

  // Add bidirectional text (BIDI) layout information.
  add_bidi_levels(text, egcs);

  // Group the EGCs into spans with the same BIDI direction
  // across multiple BIDI modes.
  let previous_bidi_info = null;
  let bidi_groups = [];
  egcs.forEach(cluster => {
    let bidi_info;
    function bidi_text(bidi_level)
    {
      return bidi_level & 1 ? "right-to-left" : "left-to-right";
    }
    if ((cluster.bidi_level.auto % 2) == (cluster.bidi_level.ltr % 2))
      bidi_info = bidi_text(cluster.bidi_level.auto);
    else
      bidi_info = "auto-" + bidi_text(cluster.bidi_level.auto);
    if (bidi_info != previous_bidi_info)
    {
      bidi_groups.push({ "dir": bidi_info, "egcs": [] })
      previous_bidi_info = bidi_info;
    }
    bidi_groups[bidi_groups.length - 1]["egcs"].push(cluster);
  });

  return bidi_groups;
}
