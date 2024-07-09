const fs = require('fs');
const named_entities = require('html-entities/lib/index.js');

// Create a Unicode character database of just
// properties we use in the debugger.
let db = {
	cp: { },
	ranges: [ ],
};

// Add character names, categories.
let ucd = JSON.parse(fs.readFileSync('node_modules/ucd-full/UnicodeData.json'));
for (let i = 0; i < ucd.UnicodeData.length; i++)
{
	let cp = ucd.UnicodeData[i];
	let range_re = /^<(.*), First>$/;
	if (!range_re.exec(cp.name))
	{
		if (cp.name == "<control>" && cp['unicode1.0Name']) {
			cp.name = cp['unicode1.0Name'];
		}
		db.cp[parseInt(cp.codepoint, 16)] = {
			name: cp.name,
			cat: cp.category
		};
	}
	else
	{
		let basename = range_re.exec(cp.name)[1];
		db.ranges.push({
			start: parseInt(cp.codepoint, 16),
			end: parseInt(ucd.UnicodeData[i + 1].codepoint, 16),
			name: basename + " ##",
			cat: cp.category
		})
		i++; // skip "Last>" entry
	}
}

// Aliases
let nameAliasesList = JSON.parse(fs.readFileSync('node_modules/ucd-full/NameAliases.json'));
nameAliasesList.NameAliases.forEach(cp => {
	if (cp.type == "correction")
	{
		db.cp[parseInt(cp.codepoint, 16)].name = cp.alias;
	}
	if (cp.type == "abbreviation")
	{
		db.cp[parseInt(cp.codepoint, 16)].abbr = cp.alias;
	}
});

// Properties
const properties_of_interest = {
	"Bidi_Control": true
}
let propList = JSON.parse(fs.readFileSync('node_modules/ucd-full/PropList.json'));
propList.PropList.forEach(range => {
	if (range.property in properties_of_interest)
	{
		for (var cp = parseInt(range.range[0], 16);
		     cp <= parseInt(range.range[1] || range.range[0], 16);
		     cp++)
		{
			if (!('properties' in db.cp[cp]))
				db.cp[cp].props = [];
			db.cp[cp].props.push(range.property)
		}
	}
});

// Emoji Variation Selector Meaning
let emojiVarSeqs = JSON.parse(fs.readFileSync('node_modules/ucd-full/emoji/emoji-variation-sequences.json'));
emojiVarSeqs["emoji-variation-sequences"].forEach(item => {
	let cp = db.cp[parseInt(item.variationSequence[1], 16)];
	let style = item.style;
	if (!cp.emojivarseq) cp.emojivarseq = { };
	if (!cp.emojivarseq[style]) cp.emojivarseq[style] = [];
	cp.emojivarseq[style].push(parseInt(item.variationSequence[0], 16))
});

// HTML Named Entities
for (let cp in db.cp)
{
  let ent = named_entities.encode(String.fromCharCode(cp), { mode: 'extensive' });
  if (/^&/.exec(ent) && !/^&#/.exec(ent))
	db.cp[cp].html5_entity = ent;
}

fs.writeFileSync('lib/unicodeCharacterDatabase.json',
                 "window.unicodeCharacterDatabase = "
                 + JSON.stringify(db));
