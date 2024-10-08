import { codepoint_to_utf8, make_surrogate_pair, zeropadhex, lookup_codepoint } from './unicode_utils.mjs'

export const LANGUAGE_ESCAPE_FORMATS = {
  codepoint_uplushex: {
    name: "Hex Code Point",
    format_codepoint: function(codepoint) {
      // See https://stackoverflow.com/questions/1273693/why-is-u-used-to-designate-a-unicode-code-point.
      return "U+" + zeropadhex(codepoint, 4);
    }
  },

  codepoint_decimal: {
    name: "Decimal Code Point",
    shortname: "Decimal",
    format_codepoint: function(codepoint) {
      return codepoint;
    }
  },

  utf16: {
    name: "UTF-16 Big Endian",
    shortname: "UTF-16BE",
    format_codepoint: function(codepoint) {
      if (codepoint <= 65535)
        return zeropadhex(codepoint, 4);
      let sp = make_surrogate_pair(codepoint);
      return zeropadhex(sp.high, 4)
           + " " + zeropadhex(sp.low, 4);
    },
    format_text: function(codepoints) {
      if (codepoint <= 65535)
        return zeropadhex(codepoint, 4);
      let sp = make_surrogate_pair(codepoint);
      return zeropadhex(sp.high, 4)
           + " " + zeropadhex(sp.low, 4);
    }
  },

  utf8: {
    name: "UTF-8",
    format_codepoint: function(codepoint) {
      return codepoint_to_utf8(codepoint)
        .map(b => zeropadhex(b, 2))
        .join(" ");
    }
  },

  javascript: {
    name: "Javascript String Literal",
    shortname: "Javascript",
    format_codepoint: function(codepoint) {
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
    shortname: "Python",
    format_codepoint: function(codepoint) {
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
    shortname: "C/C++/C#",
    format_codepoint: function(codepoint) {
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
    shortname: "Java",
    format_codepoint: function(codepoint) {
      if (codepoint <= 65535)
        return "\\u" + zeropadhex(codepoint, 4);
      let sp = make_surrogate_pair(codepoint);
      return "\\u" + zeropadhex(sp.high, 4)
           + "\\u" + zeropadhex(sp.low, 4);
    }
  },

  swift: {
    // https://docs.swift.org/swift-book/documentation/the-swift-programming-language/stringsandcharacters/
    name: "Swift String Literal",
    shortname: "Swift",
    format_codepoint: function(codepoint) {
      return "\\u{" + zeropadhex(codepoint, 0) + "}";
    }
  },

  php: {
    // https://www.php.net/manual/en/language.types.string.php
    name: "PHP String Literal",
    shortname: "PHP",
    format_codepoint: function(codepoint) {
      if (codepoint <= 127)
        return "\\x" + zeropadhex(codepoint, 2);
      return "\\u{" + zeropadhex(codepoint, 4) + "}";
    }
  },

  html_named_entity: {
    name: "HTML Named Entity",
    format_codepoint: function(codepoint) {
      let codePointInfo = lookup_codepoint(codepoint);
      if (codePointInfo && 'html5_entity' in codePointInfo)
        return codePointInfo.html5_entity;
      // Fall back to hex entities.
      return "&#x" + zeropadhex(codepoint, 0) + ";";
    }
  },

  xml_entity_hex: {
    name: "HTML/XML Hex Entity",
    format_codepoint: function(codepoint) {
      return "&#x" + zeropadhex(codepoint, 0) + ";";
    }
  },

  xml_entity_dec: {
    name: "HTML/XML Decimal Entity",
    format_codepoint: function(codepoint) {
      return "&#" + codepoint + ";";
    }
  },
};

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
        escape: LANGUAGE_ESCAPE_FORMATS[language].format_codepoint(codepoint)
      }
    });
  return escapes;
}