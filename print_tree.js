const fs = require('fs');
const path = require('path');

function printTree(dir, prefix = '') {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).sort();

    files.forEach((file, index) => {
        if (file === 'node_modules' || file.startsWith('.')) return;

        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        const isLast = index === files.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        console.log(`${prefix}${connector}${file}${stats.isDirectory() ? '/' : ''}`);

        if (stats.isDirectory()) {
            printTree(filePath, prefix + childPrefix);
        }
    });
}

console.log('src/');
printTree('src');
