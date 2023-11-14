const fs = require('fs');

// Create a Unicode character database of just
// properties we use in the debugger.
let db = {
	cp: { }
};

// Add character names, categories.
let ucd = JSON.parse(fs.readFileSync('node_modules/ucd-full/UnicodeData.json'));
ucd.UnicodeData.forEach(cp => {
	// TODO: UnicodeData.json doesn't handle ranges well,
	// so CJK UNIFIED IDEOGRAPH-* characters are missing.
	// See extracted/DerivedName.json instead.
	if (cp.codepoint)
	{
		if (cp.name == "<control>" && cp.aliases)
			cp.name = cp.aliases[0];
		db.cp[parseInt(cp.codepoint, 16)] = {
			name: cp.name,
			cat: cp.category
		};
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
			console.log(cp.toString(16), db.cp[cp])
			if (!('properties' in db.cp[cp]))
				db.cp[cp].props = [];
			db.cp[cp].props.push(range.property)
		}
	}
});

fs.writeFileSync('lib/unicodeCharacterDatabase.json',
                 "window.unicodeCharacterDatabase = "
                 + JSON.stringify(db));
