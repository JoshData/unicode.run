mkdir -p lib

# Get packages listed in package.json and copy
# needed files into lib directory.
npm install
cp node_modules/bidi-js/dist/bidi.min.mjs lib/
cp node_modules/bootstrap/dist/js/bootstrap.bundle.min.js* lib/
cp node_modules/bootstrap/dist/css/bootstrap.min.css* lib/

# Get other packages.
wget -O lib/normalize.css https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css
wget -O lib/string-split-grapheme-clusters.js https://cdn.jsdelivr.net/gh/stdlib-js/string-split-grapheme-clusters@umd/browser.js
