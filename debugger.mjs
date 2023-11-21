import bidiFactory from './lib/bidi.min.mjs';

// Ideas
// * font variants? rarely occur except for CJK
// * link to https://www.unicode.org/Public/UNIDATA/StandardizedVariants.txt
// * escape sequences for popular languages, JSON, HTML entity
// * paste a code point?
// * edit text because some control points are not editable (like combining chars) or visible

const bidi = bidiFactory();
const encoder = new TextEncoder();

const default_example_text =
  "Hi 👋🏽!"
  + "\u041D\u0438\u043A\u043E\u043B\u0430\u0439 \u8FD4" // https://tonsky.me/blog/unicode/
  + " שלום (עולם)!"
  + " 🤦🏼‍♂️"
  + "\u202E12345\u202C"
  + "Å\u0333 A\u0333\u030A A\u030A\u0333";

/*
text = 'Hello Ç Ç 2² 实际/實際 \u{1F468}\u{1F3FB} \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} مشکۆ (مشکۆ) مشکۆ!';
text = "(شەقامی شەوکەت سەعید (مشکۆ"; // https://blog.georeactor.com/osm-1
text = "\u{1D160} \uFB2C" // https://www.unicode.org/faq/normalization.html -- NFC normalization is a decomposition
*/

// Unicode Processing Functions
function get_code_points(text, starting_index)
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
      range: [starting_index + index, starting_index + index],
    }
  });

  // Merge neighboring UTF-16 code units that are surrogate
  // pairs into a single element representing the Unicode
  // code point. 
  let i = 0;
  while (i < text.length)
  {
    let cp = text[i].codepoint.int;
    if (cp >= parseInt('D800', 16) && cp <= parseInt('DBFF', 16)
        && i < text.length - 1 /* i.e. there is a surrogate next */)
    {
      let hs_str = text[i].string;
      let ls_str = text[i + 1].string;
      let hs_cp = cp;
      let ls_cp = text[i + 1].codepoint.int;
      cp = (hs_cp - parseInt('D800', 16)) * parseInt('400', 16)
              + ls_cp - parseInt('DC00', 16)
              + parseInt('10000', 16);
      
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
    utf8: encoder.encode(cp.string),

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
  return get_code_points(normalized, 0)
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

function debug_unicode_string(text)
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
  let last_character_index = 0;
  let egcs = splitGraphemeClusters(text)
    .map(cluster => {
      var codepoints = get_code_points(cluster, last_character_index);
      codepoints = codepoints.map(get_code_point_info);
      last_character_index = codepoints[codepoints.length-1].range[1] + 1;
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

  return egcs;
}

function run_unicode_debugger()
{
  // Get the text from this page's URL fragment.

  const fragment = new URLSearchParams(
     window.location.hash.substring(1));
  let text = decodeURIComponent(fragment.get("run"));

  // Copy it into the textarea.

  document.getElementById("input").value = text;

  // Debug the string.

  var textdgb = debug_unicode_string(text);
  console.log(textdgb);

  // Construct the debug table.

  function format_codepoint_code(cp)
  {
    return cp.hex;
  }

  let code_point_count = 0;
  let utf16_code_units = 0;
  let utf8_length = 0;

  let output_table = document.getElementById('output');
  output_table.innerText = ""; // clear

  let warnings_table = document.getElementById('warnings');
  warnings_table.innerText = ""; // clear

  let previous_bidi_info = null;
  let bidi_directions = { };
  let bidi_control_count = 0;
  let control_count = 0;
  let formatting_count = 0;
  let uncombined_combining_chars = 0;
  let has_normalized_form_count = 0;
  let unnormalized_count = 0;

  textdgb.forEach((cluster, i) => {
    // Indicate the BIDI info.
    {
      let text;
      function bidi_text(bidi_level)
      {
        return bidi_level & 1 ? "right-to-left" : "left-to-right";
      }
      if ((cluster.bidi_level.auto%2) == (cluster.bidi_level.ltr%2) && (cluster.bidi_level.ltr%2) == (cluster.bidi_level.rtl%2))
        text = "The following characters will render in " + bidi_text(cluster.bidi_level.auto) + " order.";
      else if ((cluster.bidi_level.auto%2) == (cluster.bidi_level.ltr%2))
        text = "The following characters will render in " + bidi_text(cluster.bidi_level.auto) + " order (unless the BIDI direction is set by the application to right-to-left, which is unusual).";
      else
        text = "The direction that the following characters will render in depends on the application. The characters will render in " + bidi_text(cluster.bidi_level.auto) + " order if the BIDI direction is not specified by the application, or is specified as auto. However, many applications have a default left-to-right BIDI direction.";
      if (text != previous_bidi_info)
      {
        previous_bidi_info = text;

        // Record the BIDI directions that occur in auto and LTR
        // modes. Since RTL mode is uncommon, warnings that
        // punctuation can appear in both directions is unhelpful.
        bidi_directions[cluster.bidi_level.auto % 2] = true;
        bidi_directions[cluster.bidi_level.ltr % 2] = true;

        let row = document.createElement('tr');
        row.setAttribute('class', 'bidi');
        output_table.appendChild(row);
        let cell = document.createElement('td');
        row.appendChild(cell);
        cell.setAttribute('colspan', '4');
        cell.innerText = text;
      }
    }

    function displayCodePoint(codepoint)
    {
      let text = codepoint.string;
      if (codepoint.cat == "Mn") // something for combining characters to attach to
        text = "◌" + text;
      return text;
    }

    // Create the cluster display.
    let row = document.createElement('tr');
    if (i % 2 == 0)
      row.setAttribute('class', 'every-other-row');
    output_table.appendChild(row);
    let cluster_cell = document.createElement('td');
    row.appendChild(cluster_cell);
    cluster_cell.setAttribute('rowspan',
                              cluster.codepoints.length
                              + (cluster.nfc ? 1 : 0)
                              + (cluster.nfd ? 1 : 0));
    cluster_cell.setAttribute('valign', 'top');
    cluster_cell.setAttribute('class', 'unicode-content egc');
    cluster_cell.innerText = displayCodePoint(cluster);

    function createCodePointRow(codepoint, row, hide_character)
    {
      let cell = document.createElement('td');
      row.appendChild(cell);
      cell.setAttribute('class', 'unicode-content codepoint_raw');
      cell.setAttribute('valign', 'top');
      if (!hide_character)
        cell.innerText = displayCodePoint(codepoint);

      cell = document.createElement('td');
      row.appendChild(cell);
      cell.setAttribute('class', 'codepoint_hex');
      cell.setAttribute('valign', 'top');
      cell.innerText = format_codepoint_code(codepoint.codepoint);

      cell = document.createElement('td');
      cell.setAttribute('class', 'codepoint_info');
      row.appendChild(cell);

      let line1 = document.createElement('div');
      line1.setAttribute('class', 'codepoint_name');
      cell.appendChild(line1);
      line1.innerText = codepoint.name;

      let line2 = document.createElement('div');
      line2.setAttribute('class', 'codepoint_attributes');
      cell.appendChild(line2);

      let category_span = document.createElement('span');
      category_span.setAttribute('class', 'codepoint_category');
      line2.appendChild(category_span);
      category_span.innerText = codepoint.cat;

      let bidiTypeMap = {
        L: "LTR",
        R: "RTL",
        AL: "RTL", // Arabic
      };
      if (bidiTypeMap.hasOwnProperty(codepoint.bidiType))
      {
        let span = document.createElement('span');
        span.setAttribute('class', 'codepoint_category');
        line2.appendChild(span);
        span.innerText = bidiTypeMap[codepoint.bidiType];
      }

      let textinfo = [];

      if (codepoint.utf16) // useful for Javascript
        textinfo.push("UTF-16: " + codepoint.utf16.map(format_codepoint_code))

      if (codepoint.bidi_mirrored_replacement)
        textinfo.push("This character is replaced with its mirrored code point " + codepoint.bidi_mirrored_replacement + " in right-to-left text.");

      let other_info = document.createElement('span');
      category_span.setAttribute('class', 'codepoint_category');
      line2.appendChild(other_info);
      other_info.innerText = textinfo.join("; ");
    }

    // Warning about formatting and combining characters
    // that are not a part of a cluster.
    if (cluster.codepoints.length == 1)
    {
      // Control Formatting characters, other than BIDI
      // Control which are separately tagged.
      if (cluster.codepoints[0].cat == "Cf"
          && (!cluster.codepoints[0].props
              || cluster.codepoints[0].props.indexOf("Bidi_Control") == -1))
        formatting_count++;
      if (cluster.codepoints[0].cat.charAt(0) == "M")
        uncombined_combining_chars++;
    }

    // Create the code points.
    cluster.codepoints.forEach((codepoint, ii) => {
      code_point_count++;
      if (!codepoint.utf16)
        utf16_code_units++
      else
        utf16_code_units += codepoint.utf16.length;
      utf8_length += codepoint.utf8.length;

      if (codepoint.props && codepoint.props.indexOf("Bidi_Control") >= 0)
        bidi_control_count++;
      else if (codepoint.cat == "Cf")
        ; // Generally a part of emoji like ZWJs.
      else if (codepoint.cat.charAt(0) == "C")
        control_count++;

      if (ii > 0)
      {
        row = document.createElement('tr');
        if (i % 2 == 0)
          row.setAttribute('class', 'every-other-row');
        output_table.appendChild(row);
      }

      // Hide the first codepoint's character if there's
      // only one codepoint in this EGC and it hasn't been
      // BIDI mirrored.
      let hide_character = cluster.codepoints.length == 1
        && cluster.string == cluster.codepoints[0].string;

      createCodePointRow(codepoint, row, hide_character);

      row.addEventListener("mouseenter", event => {
        let textarea = document.getElementById("input");
        textarea.focus(); // selection doesn't show without focus
        textarea.setSelectionRange(cluster.range[0], cluster.range[1] + 1);
      })

    });

    // Show normalization information.
    if (cluster.nfc && cluster.nfd && JSON.stringify(cluster.nfc) != JSON.stringify(cluster.nfd))
    {
      // The cluster isn't in either NFC or NFD and both
      // forms exist and are distinct, so this is totally bad.
      unnormalized_count++;
      showDecomposition(cluster.nfc, "This character can be encoded by multiple equivalent sequences of code points. This character is in a non-normalized form. There are two standard normal forms. The typically preferred form is the shorter composed form (Unicode NFC normalization) which expresses the same character as:", i);
      showDecomposition(cluster.nfd, "The other form is the decomposed form (Unicode NFD normalization) which expresses the same character as:", i);
    }
    else if (cluster.nfc || cluster.nfd)
    {
      has_normalized_form_count++;
      if (cluster.nfc)
        showDecomposition(cluster.nfc, "This character can be encoded by multiple equivalent sequences of code points. Your text uses the decomposed normalization form (Unicode NFD), but this character can also equivalently occur as a (typically) shorter sequence code points using Unicode NFC (composed) normalization which is typically preferred:", i);
      else if (cluster.nfd)
        showDecomposition(cluster.nfd, "This character can be encoded by multiple equivalent sequences of code points. Your text uses the composed normalization form (Unicode NFC), which is usually preferred, but be aware that this character can also equivalently occur as a longer sequence of code points including this Unicode NFD (decomposed) normalization:", i);
    }

    function showDecomposition(decomposition, text, i)
    {
      let row = document.createElement('tr');
      if (i % 2 == 0)
        row.setAttribute('class', 'every-other-row');
      output_table.appendChild(row);

      // empty cell under the codepoint raw and hex cells
      let cell = document.createElement('td');
      cell.setAttribute('colspan', '2');
      row.appendChild(cell);

      cell = document.createElement('td');
      row.appendChild(cell);
      cell.setAttribute('class', 'codepoint_normalization');
      cell.innerText = text;

      let table = document.createElement('table');
      cell.appendChild(table);
      decomposition.forEach(codepoint => {
        let row = document.createElement('tr');
        table.appendChild(row);
        createCodePointRow(codepoint, row);
      });

    }
  });

  // Length table
  function setElemText(id, text)
  {
    document.getElementById(id).innerText = text;
  }
  setElemText('text-length-egcs', textdgb.length);
  setElemText('text-length-codepoints', code_point_count);
  setElemText('text-length-utf16', utf16_code_units);
  setElemText('text-length-utf8', utf8_length);

  // Warnings
  function addWarning(text)
  {
    let div = document.createElement('div');
    warnings_table.appendChild(div);
    div.innerText = text;
  }
  if (control_count > 0)
    addWarning("Control Codes: The text has invisible control codes.");
  if (formatting_count > 0)
    addWarning("Formatting Characters: The text has invisible formatting characters.");
  if (uncombined_combining_chars)
    addWarning("Uncombined Combining Characters: The text has a combining character that is misplaced and is not combined with another character.");
  if (unnormalized_count)
    addWarning("Unicode can express the same character with different sequences of code points. Some characters are in an unnormalized form. Choose composed (NFC) or decomposed (NFD) normalization.")
  else if (has_normalized_form_count)
    addWarning("Unicode can express the same character with different sequences of code points. Choose composed (NFC) or decomposed (NFD) normalization.")
  if (bidi_control_count > 0)
    addWarning("Bidirectional Control: This text has bidirectional control code points that can change the rendered order of characters unexpectedly.");
  else if (Object.keys(bidi_directions).length > 1)
    addWarning("Bidirectional Text: This text includes parts that are rendered left-to-right and parts that are rendered right-to-left.");
}

function set_url_fragment_text(text) {
  window.location.hash = "#run=" + encodeURIComponent(text);
}

// If there is no URL fragment, set an initial
// example.
{
  const fragment = new URLSearchParams(
     window.location.hash.substring(1));
  if (!fragment.get("run"))
    set_url_fragment_text(default_example_text);
}

// Launch immediately.
run_unicode_debugger();

// Update when the hash changes.
addEventListener("hashchange", (event) => {
  run_unicode_debugger();
});

// Update hash when the input textarea changes.
document.getElementById("input")
  .addEventListener("input", (event) => {
    let text = document.getElementById("input").value;
    set_url_fragment_text(text);
  });
