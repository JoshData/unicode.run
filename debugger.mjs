import bidiFactory from './lib/bidi.min.mjs';

const bidi = bidiFactory();
const encoder = new TextEncoder();

const default_example_text =
  "Hi 👋🏽!"
  + " שלום (עולם)!"
  + " 🤦🏼‍♂️"
  + "\u202E12345\u202C"
  + "\u20DD";

/*
text = 'Hello Ç Ç 2² 实际/實際 \u{1F468}\u{1F3FB} \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} مشکۆ (مشکۆ) مشکۆ!';
text = "(شەقامی شەوکەت سەعید (مشکۆ"; // https://blog.georeactor.com/osm-1
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
      character: c,
      codepoint: c.codePointAt(0).toString(16),
      range: [starting_index + index, starting_index + index],
    }
  });

  // Merge neighboring UTF-16 code units that are surrogate
  // pairs into a single element representing the Unicode
  // code point. 
  let i = 0;
  while (i < text.length)
  {
    let cp = parseInt(text[i].codepoint, 16);
    if (cp >= parseInt('D800', 16) && cp <= parseInt('DBFF', 16)
        && i < text.length - 1 /* i.e. there is a surrogate next */)
    {
      let hs_str = text[i].character;
      let ls_str = text[i + 1].character;
      let hs_cp = cp;
      let ls_cp = parseInt(text[i + 1].codepoint, 16);
      cp = (hs_cp - parseInt('D800', 16)) * parseInt('400', 16)
              + ls_cp - parseInt('DC00', 16)
              + parseInt('10000', 16);
      
      // Merge the elements.
      text[i] = {
        // The Javascript string representation is
        // the concatenation of the two surrogate
        // pair characters.
        character: hs_str + ls_str,

        // This is the actual Unicode code point.
        codepoint: cp.toString(16),

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
  return {
    ...cp,
    
    // Major Unicode Character Data properties
    ...unicodeCharacterDatabase.cp[parseInt(cp.codepoint, 16)],

    // UTF8 representation
    utf8: encoder.encode(cp.character),

    // BIDI
    bidiType: bidi.getBidiCharTypeName(cp.character),
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

      i += cp.character.length;
    });

    // The EGC as a whole hopefully has a single BIDI
    // direction. Take the bidi_level of the first code point.
    egc.bidi_level = egc.codepoints[0].bidi_level;

    // If any characters have a BIDI mirror replacement,
    // recreate the EGC using the replacements so that
    // we get a displayed character.
    egc.character = egc.codepoints.map(cp => {
      return cp.bidi_mirrored_replacement || cp.character;
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
      last_character_index = codepoints[codepoints.length-1].range[1] + 1;
      return {
        character: cluster,
        codepoints: codepoints.map(get_code_point_info),
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

  function format_codepoint_code(hex)
  {
    return hex.toUpperCase(); 
  }

  let code_point_count = 0;
  let utf16_code_units = 0;
  let utf8_length = 0;

  let output_table = document.getElementById('output');
  output_table.innerText = ""; // clear

  let warnings_table = document.getElementById('warnings');
  warnings_table.innerText = ""; // clear

  let previous_bidi_info = null;
  let bidi_directions_count = 0;
  let bidi_control_count = 0;
  let control_count = 0;
  let formatting_count = 0;
  let uncombined_combining_chars = 0;

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
        bidi_directions_count++;

        let row = document.createElement('tr');
        row.setAttribute('class', 'bidi');
        output_table.appendChild(row);
        let cell = document.createElement('td');
        row.appendChild(cell);
        cell.setAttribute('colspan', '4');
        cell.innerText = text;
      }
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
    cluster_cell.setAttribute('class', 'egc');
    cluster_cell.innerText = cluster.character;

    row.addEventListener("mouseenter", event => {
      let textarea = document.getElementById("input");
      textarea.focus(); // selection doesn't show without focus
      textarea.setSelectionRange(cluster.range[0], cluster.range[1] + 1);
    })

    function createCodePointRow(codepoint, row, hide_character)
    {
      let cell = document.createElement('td');
      row.appendChild(cell);
      cell.setAttribute('class', 'codepoint_raw');
      cell.setAttribute('valign', 'top');
      if (!hide_character)
        cell.innerText = codepoint.character;

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

      let textinfo = [];

      if (codepoint.utf16) // useful for Javascript
        textinfo.push("UTF-16: " + codepoint.utf16.map(format_codepoint_code))

      let bidiTypeMap = {
        L: "Left-to-Right",
        R: "Righ-to-Left",
        AL: "Righ-to-Left", // Arabic
      };
      if (bidiTypeMap.hasOwnProperty(codepoint.bidiType))
        textinfo.push("BIDI: " + bidiTypeMap[codepoint.bidiType])
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
        && cluster.character == cluster.codepoints[0].character;

      createCodePointRow(codepoint, row, hide_character);
    });

    if (cluster.nfc)
      showDecomposition(cluster.nfc, "This character can be composed. Normalize user inputs using Unicode NFC normalization before comparison.", i);
    if (cluster.nfd)
      showDecomposition(cluster.nfd, "This character has a decomposition. Normalize user inputs using Unicode NFC normalization before comparison.", i);

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
  if (bidi_directions_count > 0)
    addWarning("Bidirectional Text: Parts of this text are rendered left-to-right and parts are rendered right-to-left.");
  if (bidi_control_count > 0)
    addWarning("Bidirectional Control: This text has bidirectional control code points that can change the rendered order of characters.");
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
