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
