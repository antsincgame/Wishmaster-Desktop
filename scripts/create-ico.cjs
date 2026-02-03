const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.png');
const outputPath = path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.ico');

pngToIco(inputPath)
  .then(buf => {
    fs.writeFileSync(outputPath, buf);
    console.log('✓ icon.ico created successfully!');
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
