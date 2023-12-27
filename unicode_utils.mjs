export function zeropadhex(num, width)
{
  let s = num.toString(16).toUpperCase();
  while (s.length < width)
    s = "0" + s;
  return s;
}

export function codepoint_to_utf8(codepoint)
{
  // Adapted from https://github.com/mathiasbynens/utf8.js/blob/master/utf8.js
  // encodeCodePoint().
  if ((codepoint & 0xFFFFFF80) == 0) // 1-byte sequence
      return [codepoint];
  function createByte(codepoint, shift) {
    return ((codepoint >> shift) & 0x3F) | 0x80;
  }
  let bytes = [];
  if ((codepoint & 0xFFFFF800) == 0) { // 2-byte sequence
    bytes.push(((codepoint >> 6) & 0x1F) | 0xC0);
  }
  else if ((codepoint & 0xFFFF0000) == 0) { // 3-byte sequence
    bytes.push(((codepoint >> 12) & 0x0F) | 0xE0);
    bytes.push(createByte(codepoint, 6));
  }
  else if ((codepoint & 0xFFE00000) == 0) { // 4-byte sequence
    bytes.push(((codepoint >> 18) & 0x07) | 0xF0);
    bytes.push(createByte(codepoint, 12));
    bytes.push(createByte(codepoint, 6));
  }
  bytes.push((codepoint & 0x3F) | 0x80);
  return bytes;
}

export function make_surrogate_pair(codepoint)
{
  var plane = 0x10000;
  if (codepoint < plane)
    throw "Code point is within the BMP.";
  let x = codepoint - plane;
  return {
    high: parseInt("D800", 16) + (x >> 10),
    low: parseInt("DC00", 16) + (x & parseInt("3FF", 16)),
  };
}

export function get_code_points_from_string(text)
{
  // Since Javascript stores strings as sequences of UTF-16
  // code units, we have to extract the Unicode code points
  // from the string by combining surrogate pairs.

  // Transform the string into an array of objects with
  // string and code point properties. To start with, this
  // is UTF-16 code units.
  text = text.split('').map((c, index) => {
    return {
      string: c,
      codepoint: {
        int: c.codePointAt(0),
        hex: c.codePointAt(0).toString(16).toUpperCase()
      },
      range: [index, index],
    }
  });

  // Merge neighboring UTF-16 code units that are surrogate
  // pairs into a single element representing the Unicode
  // code point. 
  let i = 0;
  while (i < text.length)
  {
    let cp = text[i].codepoint.int;
    if (cp >= 0xD800 && cp <= 0xDBFF
        && i < text.length - 1 /* i.e. there is a surrogate next */)
    {
      let hs_str = text[i].string;
      let ls_str = text[i + 1].string;
      let hs_cp = cp;
      let ls_cp = text[i + 1].codepoint.int;
      cp = (hs_cp - 0xD800) * 0x400
              + ls_cp - 0xDC00
              + 0x10000;
      
      // Merge the elements.
      text[i] = {
        // The Javascript string representation is
        // the concatenation of the two surrogate
        // pair characters.
        string: hs_str + ls_str,

        // This is the actual Unicode code point.
        codepoint: {
          int: cp,
          hex: cp.toString(16)
        },

        // The starting and ending character index.
        range: [text[i].range[0], text[i + 1].range[1]],

        // We may want to show the UTF-16 representation
        // later.
        utf16: [text[i].codepoint, text[i + 1].codepoint],
      };
      text.splice(i + 1, 1); // remove the low surrogate
    }
    i++;
  }

  return text;
}



export function parse_utf16be_hex(text)
{
  let { code_units, posmap } = hex_to_array(text, 4);

  // The code units match Javascript's internal
  // representation.
  text = code_units.map(c => String.fromCharCode(c)).join("");
  return { text, posmap };

}

export function parse_utf32_hex(text)
{
  let { code_units, posmap } = hex_to_array(text, 8);

  // Replace code units with surrogate pairs where needed.
  let codepoints_to_char_pos = new Map();
  text = "";
  for (let i = 0; i < code_units.length; i++)
  {
    let c = code_units[i];
    if (c <= 65535)
    {
      text += String.fromCharCode(c);
      codepoints_to_char_pos.set(text.length - 1, posmap.get(i));
    }
    else
    {
      // Map both halves of the surrogate pair to the same original
      // characters. They'll be combined again when we replace
      // surrogate pairs with their code points.
      // (It seems redundant but since the EGC function requires
      // a Javascript string, we have to form a string and not
      // return Unicode code points here.)
      let sp = make_surrogate_pair(c);
      text += String.fromCharCode(sp.high);
      codepoints_to_char_pos.set(text.length - 1, posmap.get(i));
      text += String.fromCharCode(sp.low);
      codepoints_to_char_pos.set(text.length - 1, posmap.get(i));
    }
  }
  return { text: text, posmap: codepoints_to_char_pos };
}

function hex_to_array(text, code_unit_size)
{
  // Read the text as a series of hex characters in
  // groups of up to 2 (UTF-8), 4 (UTF-16), or 8 (UTF-32)
  // hex characters. End groups at non-hex characters
  // (like spaces) so that groups don't need to be zero padded.
  //
  // If a group has fewer than code_unit_size characters,
  // left-pad it with zeroes. This works well if there is only
  // one code unit given, and it prevents thrashing of the text
  // while typing.
  //
  // Also return a mapping from code unit indexes to the starting
  // and ending character in the text.
  let code_units = [];
  let read_chars = 0;
  let posmap = new Map();
  for (let i = 0; i < text.length; i++)
  {
    let c = text.charAt(i);
    if (!/[A-Fa-f0-9]/.exec(c))
    {
      read_chars = 0; // next character starts a new code unit
      continue;
    }

    let v = parseInt(c, 16);
    if (read_chars % code_unit_size == 0)
    {
      code_units.push(v);
      posmap.set(code_units.length - 1, [i, i]);
    }
    else
    {
      // shift previous value and add this one
      let vv = code_units.pop();
      code_units.push((vv << 4) + v);
      posmap.set(code_units.length - 1,
                           [posmap.get(code_units.length - 1)[0],
                            i]);
    }
    read_chars++;
  }

  return { code_units, posmap };
}