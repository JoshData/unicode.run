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