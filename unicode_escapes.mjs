const LANGUAGE_ESCAPE_FORMATS = {
  codepoint_uplushex: {
    name: "Hex Code Point",
    func: function(codepoint) {
      // The four/eight-width padding seems to be customary
      // with the U+ prefix. See https://stackoverflow.com/questions/1273693/why-is-u-used-to-designate-a-unicode-code-point.
      if (codepoint <= 65535)
        return "U+" + zeropadhex(codepoint, 4);
      return "U+" + zeropadhex(codepoint, 0);
    }
  },

  codepoint_decimal: {
    name: "Decimal Code Point",
    func: function(codepoint) {
      return codepoint;
    }
  },

  codepoint_utf16: {
    name: "UTF-16",
    func: function(codepoint) {
      // We're assuming big endian or little endian
      // here, I am not sure which.
      if (codepoint <= 65535)
        return zeropadhex(codepoint, 4);
      let sp = surrogate_pair(codepoint);
      return zeropadhex(sp.high, 4)
           + " " + zeropadhex(sp.low, 4);
    }
  },

  codepoint_utf8: {
    name: "UTF-8",
    func: function(codepoint) {
      return get_utf8_bytes(codepoint)
        //.map(b => zeropadhex(b, 2))
        .join(" ");
    }
  },

  javascript: {
    name: "Javascript String Literal",
    func: function(codepoint) {
      if (codepoint <= 127)
        return "\\x" + zeropadhex(codepoint, 2);
      if (codepoint <= 65535)
        return "\\u" + zeropadhex(codepoint, 4);
      // ES6+
      // Prior to ES6, a surrogate pair was required.
      // That's still possible but we don't recommend it.
      return "\\u{" + zeropadhex(codepoint, 0) + "}";
    }
  },

  python: {
    name: "Python String Literal",
    func: function(codepoint) {
      // There is also a \U{NAME} escape.
      if (codepoint <= 127)
        return "\\x" + zeropadhex(codepoint, 2);
      if (codepoint <= 65535)
        return "\\u" + zeropadhex(codepoint, 4);
      return "\\U" + zeropadhex(codepoint, 8);
    }
  },

  cpp: {
    name: "C/C++/C# String Literal",
    func: function(codepoint) {
      // The \x### escape sequence is also possible for
      // any code point, but because it accepts an arbitrary
      // number of hex digits and is terminated at the first
      // non-hex digit, it may not be valid in context, so
      // we don't recommend it. This is true for all three
      // languages.
      //
      // For C, this is since C99.
      //
      // In C++, since C++23, there is also a \N{NAME} escape.
      //
      // Code points that require \U probably can also be
      // encoded as surrogate pairs.
      if (codepoint <= 65535)
        return "\\u" + zeropadhex(codepoint, 4);
      return "\\U" + zeropadhex(codepoint, 8);
    }
  },

  java: {
    // https://docs.oracle.com/javase/specs/jls/se12/html/jls-3.html
    name: "Java String Literal",
    func: function(codepoint) {
      if (codepoint <= 65535)
        return "\\u" + zeropadhex(codepoint, 4);
      let sp = surrogate_pair(codepoint);
      return "\\u" + zeropadhex(sp.high, 4)
           + "\\u" + zeropadhex(sp.low, 4);
    }
  },

  swift: {
    // https://docs.swift.org/swift-book/documentation/the-swift-programming-language/stringsandcharacters/
    name: "Swift",
    func: function(codepoint) {
      return "\\u{" + zeropadhex(codepoint, 0) + "}";
    }
  },

  php: {
    // https://www.php.net/manual/en/language.types.string.php
    name: "PHP String Literal",
    func: function(codepoint) {
      if (codepoint <= 127)
        return "\\x" + zeropadhex(codepoint, 2);
      return "\\u{" + zeropadhex(codepoint, 4) + "}";
    }
  },
};

export function get_utf8_bytes(codepoint)
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

function surrogate_pair(codepoint)
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

function zeropadhex(num, width)
{
  let s = num.toString(16).toUpperCase();
  while (s.length < width)
    s = "0" + s;
  return s;
}

export function create_escape(codepoint, language)
{
  return LANGUAGE_ESCAPE_FORMATS[language](codepoint);
}

export function create_escapes(codepoint, languages)
{
  let escapes = { };
  Object.keys(LANGUAGE_ESCAPE_FORMATS)
    .map(language => {
      escapes[language] = {
        key: language,
        name: LANGUAGE_ESCAPE_FORMATS[language].name,
        escape: LANGUAGE_ESCAPE_FORMATS[language].func(codepoint)
      }
    });
  return escapes;
}