
const fs = require('fs');
const path = require('path');

// Configuración: Carpetas y archivos a IGNORAR
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.vscode'];
const IGNORE_FILES = ['package-lock.json', 'yarn.lock', 'bundle.js', 'install.js', 'PROJECT_INSTALLER.cjs', 'PROYECTO_COMPLETO.txt'];

// Extensiones permitidas (para evitar subir imagenes binarias, etc)
const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md'];

const outputFile = 'PROYECTO_COMPLETO.txt';
let fullContent = '';

function scanDirectory(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                scanDirectory(fullPath);
            }
        } else {
            if (!IGNORE_FILES.includes(file) && ALLOWED_EXTENSIONS.includes(path.extname(file))) {
                readFile(fullPath);
            }
        }
    });
}

function readFile(filePath) {
    // Convertir ruta absoluta a relativa para facilitar la lectura
    const relativePath = path.relative(__dirname, filePath);
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        fullContent += `\n--- START OF FILE ${relativePath} ---\n\n`;
        fullContent += content;
        fullContent += `\n\n--- END OF FILE ${relativePath} ---\n`;
        console.log(`Agregado: ${relativePath}`);
    } catch (err) {
        console.error(`Error leyendo ${relativePath}:`, err.message);
    }
}

console.log('📦 Empaquetando proyecto...');
scanDirectory(__dirname);

fs.writeFileSync(outputFile, fullContent);

console.log('✅ ¡Listo!');
console.log(`📄 Se ha creado el archivo: ${outputFile}`);
console.log('👉 Arrastra ese archivo al chat de IA para que pueda leer todo tu código.');
