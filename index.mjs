import { debug_unicode_string } from './debugger.mjs';
import { create_escapes, LANGUAGE_ESCAPE_FORMATS } from './unicode_escapes.mjs';
import { make_surrogate_pair, zeropadhex } from './unicode_utils.mjs';

// Ideas
// * font variants? rarely occur except for CJK
// * link to https://www.unicode.org/Public/UNIDATA/StandardizedVariants.txt
// * edit text because some control points are not editable (like combining chars) or visible
// * insert characters to see how they affect output like combining characters and BIDI characters
// * emoji constructor
// * cite libraries used


const default_example_text =
  "Hi 👋🏻! ⇄ שלום!\u200F";
  /*
  + "\u041D\u0438\u043A\u043E\u043B\u0430\u0439 \u8FD4" // https://tonsky.me/blog/unicode/
  + " שלום (עולם)!"
  + " 🤦🏼‍♂️"
  + "\u202E12345\u202C"
  + "Å\u0333 A\u0333\u030A A\u030A\u0333";
*/
/*
text = 'Hello Ç Ç 2² 实际/實際 \u{1F468}\u{1F3FB} \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} مشکۆ (مشکۆ) مشکۆ!';
text = "(شەقامی شەوکەت سەعید (مشکۆ"; // https://blog.georeactor.com/osm-1
text = "\u{1D160} \uFB2C" // https://www.unicode.org/faq/normalization.html -- NFC normalization is a decomposition
*/


function get_input_text()
{
  let text = document.getElementById("input").value;
  let format = get_input_format();

  if (format == "text")
  {
    // Return the text and a null character index map.
    return { text: text,
             charmap: null };
  }

  // Read the input as a series of hex characters
  // giving a stream of code units by grouping
  // sequences of up to 2 (UTF-8), 4 (UTF-16), or 8 (UTF-32)
  // hex characters. If there is a remainder at the
  // end, left-pad the last one with zeroes. This
  // works well if there is only one code unit given,
  // and it prevents thrashing of the text while typing.
  // End code units at non-hex characters (like spaces)
  // so that code units don't need to be zero padded.
  //
  // Make a mapping from code unit indexes to the starting
  // and ending character that makes up the byte.
  let code_units = [];
  let read_chars = 0;
  let code_unit_char_pos = new Map();
  let code_unit_size = 2; // UTF-8
  if (format == "utf16") code_unit_size = 4;
  else if (format == "utf32") code_unit_size = 8;
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
      code_unit_char_pos.set(code_units.length - 1, [i, i]);
    }
    else
    {
      // shift previous value and add this one
      let vv = code_units.pop();
      code_units.push((vv << 4) + v);
      code_unit_char_pos.set(code_units.length - 1,
                           [code_unit_char_pos.get(code_units.length - 1)[0],
                            i]);
    }
    read_chars++;
  }

  if (format == "utf8")
  {
    let decoder = new TextDecoder('utf-8');
    text = decoder.decode(new Uint8Array(code_units));
    return { text: text, charmap: null /* TODO */ };
  }

  if (format == "utf16")
  {
    // The code units match Javascript's internal
    // representation.
    let text = code_units.map(c => String.fromCharCode(c)).join("");
    return { text: text, charmap: code_unit_char_pos };
  }

  if (format == "utf32")
  {
    // Replace code units with surrogate pairs where needed.
    let codepoints_to_char_pos = new Map();
    let text = "";
    for (let i = 0; i < code_units.length; i++)
    {
      let c = code_units[i];
      if (c <= 65535)
      {
        text += String.fromCharCode(c);
        codepoints_to_char_pos.set(text.length - 1, code_unit_char_pos.get(i));
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
        codepoints_to_char_pos.set(text.length - 1, code_unit_char_pos.get(i));
        text += String.fromCharCode(sp.low);
        codepoints_to_char_pos.set(text.length - 1, code_unit_char_pos.get(i));
      }
    }
    return { text: text, charmap: codepoints_to_char_pos };
  }
}

function run_unicode_debugger()
{
  // Get the text.

  let { text, charmap } = get_input_text();

  // Debug the string.

  var textdgb = debug_unicode_string(text, charmap);

  // Construct the debug table.

  function format_codepoint_code(cp)
  {
    return Object.values(create_escapes(cp.int))
      .map(language =>
        "<span class=\"escapecode escapecode_" + language.key + "\" title=\""
        + new Option(language.name).innerHTML
        + "\">"
        + new Option(language.escape).innerHTML
        + "</span>")
      .join("");
  }

  window.inputSelectionTargets = { };

  let code_point_count = 0;
  let utf16_code_units = 0;
  let utf8_length = 0;

  let output_table = document.getElementById('codepoints');
  output_table.innerText = ""; // clear

  let warnings_table = document.getElementById('warnings');
  warnings_table.innerText = ""; // clear

  let previous_bidi_info = null;
  let bidi_directions = { };
  let bidi_rtl_different_count = 0;
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
      if ((cluster.bidi_level.auto%2) == (cluster.bidi_level.ltr%2))
      {
        text = "The following characters will appear in " + bidi_text(cluster.bidi_level.auto) + " order:";
        if ((cluster.bidi_level.auto%2) != (cluster.bidi_level.rtl%2))
          bidi_rtl_different_count++;
      }
      else
        text = "The direction that the following characters will appear in depends on the application. The characters will appear in " + bidi_text(cluster.bidi_level.auto) + " order if the BIDI direction is not specified by the application, or is specified as auto. However, many applications have a default left-to-right BIDI direction:";
      if (text != previous_bidi_info)
      {
        previous_bidi_info = text;

        // Record the BIDI directions that occur in auto and LTR
        // modes. Since RTL mode is uncommon, warnings that
        // punctuation can appear in both directions is unhelpful.
        bidi_directions[cluster.bidi_level.auto % 2] = true;
        bidi_directions[cluster.bidi_level.ltr % 2] = true;

        let row = document.createElement('p');
        output_table.appendChild(row);
        row.setAttribute('class', 'bidi');
        row.innerText = text;
      }
    }

    function displayCodePoint(codepoint, element, css_class)
    {
      let text = codepoint.string;

      // Prepend something for combining characters to attach to.
      if (codepoint.cat.charAt(0) == "M")
        text = "◌" + text;

      // U+2029 Paragraph Separator & U+2028 Line Separator
      else if (codepoint.cat == "Zp" || codepoint.cat == "Zl")
      {
        text = "¶";
        css_class += " codepoint-space";
      }

      // Space characters have no glyph, but by CSS we show
      // how wide the glyph renders.
      else if (codepoint.cat.charAt(0) == "Z")
      {
        element.innerHTML = "<span>" + text + "</span>";
        text = null;
        css_class += " codepoint-space";
      }

      // Show standard abbreviations for characters that
      // (hopefully) don't have a glyph.
      else if (codepoint.abbr)
      {
        element.innerHTML = "<span>" + codepoint.abbr + "</span>";
        text = null;
        css_class += " codepoint-abbreviation";
      }

      // Control characters have no glyph and should almost never
      // appear in text, other than some Cf formatting characters,
      // which are above.
      else if (codepoint.cat.charAt(0) == "C")
      {
        text = "◈";
        css_class += " codepoint-illegal";
      }

      // Invalid Unicode text.
      else if (codepoint.cat == "??")
      {
        text = "�";
        css_class += " codepoint-illegal";
      }

      if (text !== null)
        element.innerText = text;
      element.setAttribute("class", css_class);
    }

    function createCodePointCard(codepoint, row, cluster)
    {
      let card = document.createElement('div');
      row.appendChild(card);
      card.setAttribute('class', 'card codepoint');

      let card_body = document.createElement('div');
      card.appendChild(card_body);
      card_body.setAttribute('class', 'card-body');

      let codepoint_display = document.createElement('div');
      card_body.appendChild(codepoint_display);
      displayCodePoint(codepoint, codepoint_display, "unicode-content codepoint_display");

      let codepoint_hex = document.createElement('h5');
      card_body.appendChild(codepoint_hex);
      codepoint_hex.setAttribute('class', 'card-title codepoint_hex');
      codepoint_hex.innerHTML = format_codepoint_code(codepoint.codepoint);

      let codepoint_name = document.createElement('h6');
      card_body.appendChild(codepoint_name);
      codepoint_name.setAttribute('class', 'card-subtitle codepoint_name');
      codepoint_name.innerText = codepoint.name;

      let codepoint_info = document.createElement('p');
      codepoint_info.setAttribute('class', 'card-text codepoint_attributes');
      card_body.appendChild(codepoint_info);

      let category_span = document.createElement('span');
      category_span.setAttribute('class', 'codepoint_category');
      codepoint_info.appendChild(category_span);
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
        codepoint_info.appendChild(span);
        span.innerText = bidiTypeMap[codepoint.bidiType];
      }

      let textinfo = [];

      if (codepoint.bidi_mirrored_replacement)
        textinfo.push("This character is replaced with its mirrored code point " + codepoint.bidi_mirrored_replacement + " in right-to-left text.");

      let other_info = document.createElement('span');
      category_span.setAttribute('class', 'codepoint_category');
      codepoint_info.appendChild(other_info);
      other_info.innerText = textinfo.join("; ");

      // When a card is clicked, select the text range in the input
      // that it corresponds to. When the input is text, select the
      // entire extended grapheme cluster since code points within
      // a cluster are probably not selectable. But when the input
      // is in code points, the card's range will be selectable.
      card.addEventListener("click", event => {
        let src = codepoint;
        let format = get_input_format();
        if (format == "text" && cluster)
          src = cluster;

        let textarea = document.getElementById("input");
        textarea.setSelectionRange(src.range[0], src.range[1] + 1);

      	// Don't move focus if the user has drag-selected some
      	// text --- they might be about to copy it.
      	if (!window.getSelection().isCollapsed)
      		return;

        textarea.focus(); // selection doesn't show without focus
      })
      for (let ci = codepoint.range[0]; ci <= codepoint.range[1]; ci++)
        window.inputSelectionTargets[ci] = card;


      return card;
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

    // Create the cluster display.
    let cluster_container = document.createElement('div');
    cluster_container.setAttribute('class', 'cluster-container');
    output_table.appendChild(cluster_container);
    if (cluster.codepoints.length > 1 || cluster.nfc || cluster.nfd)
    {
      // Create a border because this cluster has more than just
      // a single card in it.
      cluster_container.classList.add("complex");

      if (cluster.codepoints.length > 1)
      {
        // Show how the cluster renders.
        let codepoint_display = document.createElement('div');
        cluster_container.appendChild(codepoint_display);
        displayCodePoint(cluster, codepoint_display, "unicode-content cluster_display");

        // Explain that this is a cluster.
        let info = document.createElement('p');
        cluster_container.appendChild(info);
        info.innerText = cluster.codepoints.length + " code points make up this extended grapheme cluster:";
      }
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

      let card = createCodePointCard(codepoint, cluster_container, cluster);
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
      let div = document.createElement('div');
      cluster_container.appendChild(div);
      div.setAttribute('class', 'codepoint_normalization');
      
      let explanation = document.createElement('p');
      div.appendChild(explanation);
      explanation.innerText = text;

      decomposition.forEach(codepoint => {
        createCodePointCard(codepoint, div);
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
  function addWarning(css_class, text)
  {
    let div = document.createElement('div');
    warnings_table.appendChild(div);
    div.setAttribute("class", "alert alert-" + css_class);
    div.setAttribute("role", "alert");
    div.innerText = text;
  }
  if (control_count > 0)
    addWarning("danger", "Control Codes: The text has invisible control codes.");
  if (formatting_count > 0)
    addWarning("danger", "Formatting Characters: The text has invisible formatting characters.");
  if (uncombined_combining_chars)
    addWarning("danger", "Uncombined Combining Characters: The text has a combining character that is misplaced and is not combined with another character.");
  if (unnormalized_count)
    addWarning("primary", "Unicode can express the same character with different sequences of code points. Some characters are in an unnormalized form. Choose composed (NFC) or decomposed (NFD) normalization.")
  else if (has_normalized_form_count)
    addWarning("warning", "Unicode can express the same character with different sequences of code points. Choose composed (NFC) or decomposed (NFD) normalization.")
  if (bidi_control_count > 0)
    addWarning("danger", "Bidirectional Control: This text has bidirectional control code points that can change the displayed order of characters unexpectedly.");
  else if (Object.keys(bidi_directions).length > 1)
    addWarning("warning", "Bidirectional Text: This text includes parts that are ordered left-to-right and parts that are ordered right-to-left.");
  /*if (bidi_rtl_different_count > 0) // This is so common and we don't explain it so it's too distracting.
    addWarning("warning", "Text Direction Depends on Context: This text includes parts which may be ordered right-to-left if the application specifies a right-to-left order.");*/

  hiliteSelection();
}

// Control the fixed positioning of the header
// and the top margin of the content area as
// the header's height changes becaue of the
// autosizing on the textarea and the layout
// of the tex.t
const resizeObserver = new ResizeObserver((entries) => {
  // There should be a single entry since we are observing
  // just one element.
  let height = entries[0].borderBoxSize[0].blockSize;
  document.getElementById('content-area')
    .style.marginTop = height + "px";
});
resizeObserver.observe(document.getElementById('header'))

function set_url_fragment(text, format)
{
  let fragment = "#run=" + encodeURIComponent(text);
  if (format != "text")
    fragment += "&f=" + format;
  window.location.hash = fragment;
}

function update_url_fragment()
{
    let text = document.getElementById("input").value;
    let format = get_input_format();
    set_url_fragment(text, format);
}

// If there is no URL fragment, set an initial
// example.
{
  const fragment = new URLSearchParams(
     window.location.hash.substring(1));
  if (!fragment.get("run"))
    set_url_fragment(default_example_text, "text");
}

// Create escape code display format choices and hook up events.
let firstEscapeCode = null;
Object.keys(LANGUAGE_ESCAPE_FORMATS)
  .forEach(key => {
    let choice = document.createElement("a");
    choice.setAttribute("data-key", key);
    choice.setAttribute("title", LANGUAGE_ESCAPE_FORMATS[key].name);
    choice.setAttribute("href", "#");
    choice.setAttribute("onclick", "return false;"); // disable page navigation
    choice.innerText = LANGUAGE_ESCAPE_FORMATS[key].shortname || LANGUAGE_ESCAPE_FORMATS[key].name;
    document.getElementById("select-escape-code-format")
      .querySelector("span")
      .appendChild(choice);
    choice.addEventListener("click", change_escape_code_format);
    if (!firstEscapeCode)
    {
      choice.setAttribute("active", "");
      firstEscapeCode = key;
    }
  });
const escapeCodeStylesheet = document.createElement("style");
document.head.appendChild(escapeCodeStylesheet);
const escapeCodeRules = escapeCodeStylesheet.sheet;
function change_escape_code_format()
{
  let key = this.getAttribute('data-key');
  set_escape_code_format(key);
}
function set_escape_code_format(key)
{
  document.getElementById("select-escape-code-format")
    .querySelectorAll("a")
    .forEach(elem => {
      elem.toggleAttribute('active', elem.getAttribute('data-key') == key);
    });
  if (escapeCodeRules.cssRules.length > 0)
    escapeCodeRules.deleteRule(0); 
  escapeCodeRules.insertRule(".escapecode_" + key + " { display: block }");
}
set_escape_code_format(Object.keys(LANGUAGE_ESCAPE_FORMATS)[0]);

// Hook up events for the input format.
document.getElementById("select-input-format")
  .querySelectorAll("a")
  .forEach(elem => {
    elem.addEventListener("click", change_input_format);
  });
function get_input_format()
{
  let choices = document.getElementById("select-input-format")
    .querySelectorAll("a");
  for (let choice of choices)
    if (choice.hasAttribute('active'))
      return choice.getAttribute('data-key');
  throw "text";
}
function change_input_format()
{
  let key = this.getAttribute('data-key');
  set_input_format(key);
}
function set_input_format(key, isfirstload)
{
  // Don't update the input if there is no change because
  // it will normalize the input.
  if (get_input_format() == key)
    return;

  // Get the current text.
  let { text, charmap } = get_input_text();

  // Update the format selection by changing the "active" span.
  document.getElementById("select-input-format")
    .querySelectorAll("a")
    .forEach(elem => {
      elem.toggleAttribute('active', elem.getAttribute('data-key') == key);
    });

  if (isfirstload)
    return;

  // Render the text in the new format into the input box.
  let format = get_input_format();
  let input;
  if (format == "text")
  {
    input = text;
  }
  else
  {
    // Debug the string to get segmented code points.
    var textdgb = debug_unicode_string(text, charmap);

    // Separate surrogate pairs, code points, and
    // extended grapheme clusters with increasing
    // numbers of spaces. But if there are no
    // surrogate pairs or non-trivial clusters, don't
    // add extraneous spaces.
    let cu_sep = "";
    textdgb.forEach(egc => {
      egc.codepoints.forEach(cp => {
        if (format == "utf16" && cp.utf16)
          cu_sep = " ";
      });
    });
    let cp_sep = cu_sep;
    textdgb.forEach(egc => {
      if (egc.codepoints.length > 1)
        cp_sep = cu_sep + " ";
    });
    let cluster_sep = cp_sep + " ";
    input = "";
    textdgb.forEach(egc => {
      if (input.length != 0)
        input += cluster_sep;
      egc.codepoints.forEach((cp, i) => {
        if (i != 0)
          input += cp_sep;
        if (format == "utf16" && cp.utf16)
          input += zeropadhex(cp.utf16[0].int, 4) + cu_sep + zeropadhex(cp.utf16[1].int, 4);
        else
          input += zeropadhex(cp.codepoint.int, 4);
      });
    });
  }
  document.getElementById("input").value = input;

  update_url_fragment();
}

// Make the textarea grow in height automatically.
// https://stackoverflow.com/a/25621277
{
  const tx = document.getElementById("input");
  tx.style.minHeight = (tx.scrollHeight) + "px";
  tx.style.overflowY = "hidden";
  tx.addEventListener("input", () => {
    tx.style.minHeight = 0;
    tx.style.minHeight = (tx.scrollHeight) + "px";
  }, false);
}

function hiliteSelection()
{
  if (!window.inputSelectionTargets)
    return; // debugger has not been run yet
  let ci = document.getElementById("input").selectionStart;
  let cj = document.getElementById("input").selectionEnd;

  // Show at least one selected cluster.
  if (ci == cj) cj++;

  // Mark clusters as selected..
  document
    .querySelectorAll(".card.codepoint")
    .forEach(elem => {
      elem.classList.remove("selected");
    });
  for (let i = ci; i < cj; i++)
    if (window.inputSelectionTargets[i])
      window.inputSelectionTargets[i].classList.add("selected");

  /* scrolling is really disruptive
  if (window.inputSelectionTargets[ci])
    window.inputSelectionTargets[ci].scrollIntoView();
  else if (window.inputSelectionTargets[ci - 1]) // cursor is beyond the end of text
    window.inputSelectionTargets[ci - 1].scrollIntoView();
   */
}
document.getElementById("input")
  .addEventListener("selectionchange", hiliteSelection);

// Trigger the unicode debugger based on changes to
// the URL fragment.
addEventListener("hashchange", onhashchange);

function onhashchange() {
  // Update inputs from the URL fragment.

  const fragment = new URLSearchParams(
     window.location.hash.substring(1));

  set_input_format(fragment.get("f") || "text", true);

  let text = decodeURIComponent(fragment.get("run"));
  document.getElementById("input").value = text;
  document.getElementById("input").dispatchEvent(new Event('input', { bubbles: true })); // resize

  // Run the debugger.

  run_unicode_debugger();
}

// Launch immediately.
onhashchange();

// Update the hash when the input changes.
// Set the event handler after the page is
// initialized.
document.getElementById("input")
  .addEventListener("input", (event) => {
    // Update hash when the input textarea changes.
    // The hashchange event in turn triggers a re-run
    // of the unicode debugger function, which at the
    // end scrolls the output to match the selection.
    update_url_fragment();
  });
