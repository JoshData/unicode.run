const fs = require('fs');

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

fs.writeFileSync('lib/unicodeCharacterDatabase.json',
                 "window.unicodeCharacterDatabase = "
                 + JSON.stringify(db));
