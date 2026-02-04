#!/usr/bin/env node

/**
 * Проверка синхронизации версий Tauri между NPM и Rust
 * 
 * Проверяет что:
 * - @tauri-apps/api, @tauri-apps/cli и tauri (Rust) на одной мажорной.минорной версии
 * - Предупреждает о потенциальных несовпадениях
 */

const fs = require('fs');
const path = require('path');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function error(msg) {
  console.error(`${colors.red}✗ ${msg}${colors.reset}`);
}

function success(msg) {
  console.log(`${colors.green}✓ ${msg}${colors.reset}`);
}

function warn(msg) {
  console.warn(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

function info(msg) {
  console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`);
}

// Читаем package.json
function getPackageJson() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error('package.json not found');
  }
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

// Читаем package-lock.json
function getPackageLockJson() {
  const lockPath = path.join(__dirname, '..', 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    throw new Error('package-lock.json not found');
  }
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

// Читаем Cargo.toml
function getCargoToml() {
  const cargoPath = path.join(__dirname, '..', 'src-tauri', 'Cargo.toml');
  if (!fs.existsSync(cargoPath)) {
    throw new Error('src-tauri/Cargo.toml not found');
  }
  return fs.readFileSync(cargoPath, 'utf8');
}

// Извлекаем версию из строки типа "version = \"2.10.1\""
function extractRustVersion(cargoContent, packageName) {
  // Ищем строку с пакетом
  const regex = new RegExp(`${packageName}\\s*=\\s*(?:{[^}]*version\\s*=\\s*"([^"]+)"|"([^"]+)")`, 'g');
  const matches = [...cargoContent.matchAll(regex)];
  
  if (matches.length === 0) {
    return null;
  }
  
  // Берем версию из первого match (может быть в группе 1 или 2)
  return matches[0][1] || matches[0][2];
}

// Парсим версию в {major, minor, patch}
function parseVersion(versionString) {
  if (!versionString) return null;
  
  // Убираем префиксы типа ^, ~, >=
  const cleaned = versionString.replace(/^[\^~>=<]+/, '');
  
  const parts = cleaned.split('.');
  if (parts.length < 2) {
    return { major: parseInt(parts[0]) || 0, minor: 0, patch: 0 };
  }
  
  return {
    major: parseInt(parts[0]) || 0,
    minor: parseInt(parts[1]) || 0,
    patch: parseInt(parts[2]) || 0,
  };
}

// Сравниваем major.minor версии
function isCompatible(v1, v2) {
  if (!v1 || !v2) return false;
  return v1.major === v2.major && v1.minor === v2.minor;
}

function formatVersion(v) {
  if (!v) return 'unknown';
  return `${v.major}.${v.minor}.${v.patch}`;
}

// Главная функция
function main() {
  console.log('\n🔍 Проверка синхронизации версий Tauri...\n');
  
  let hasErrors = false;
  
  try {
    // Получаем версии из package-lock.json (актуальные установленные)
    const packageLock = getPackageLockJson();
    const npmApiVersion = packageLock.packages['node_modules/@tauri-apps/api']?.version;
    const npmCliVersion = packageLock.packages['node_modules/@tauri-apps/cli']?.version;
    
    // Получаем версию Rust tauri
    const cargoContent = getCargoToml();
    const rustTauriVersion = extractRustVersion(cargoContent, 'tauri');
    const rustTauriBuildVersion = extractRustVersion(cargoContent, 'tauri-build');
    
    info('Найденные версии:');
    console.log(`  NPM @tauri-apps/api: ${npmApiVersion || 'NOT FOUND'}`);
    console.log(`  NPM @tauri-apps/cli: ${npmCliVersion || 'NOT FOUND'}`);
    console.log(`  Rust tauri: ${rustTauriVersion || 'NOT FOUND'}`);
    console.log(`  Rust tauri-build: ${rustTauriBuildVersion || 'NOT FOUND'}`);
    console.log('');
    
    // Парсим версии
    const npmApi = parseVersion(npmApiVersion);
    const npmCli = parseVersion(npmCliVersion);
    const rustTauri = parseVersion(rustTauriVersion);
    const rustTauriBuild = parseVersion(rustTauriBuildVersion);
    
    // Проверка 1: NPM API vs Rust tauri
    if (!isCompatible(npmApi, rustTauri)) {
      error(`Несовпадение версий: @tauri-apps/api (${formatVersion(npmApi)}) и tauri Rust crate (${formatVersion(rustTauri)})`);
      error('  Tauri требует совпадения major.minor версий между NPM и Rust пакетами!');
      hasErrors = true;
    } else {
      success(`@tauri-apps/api (${formatVersion(npmApi)}) совместима с tauri (${formatVersion(rustTauri)})`);
    }
    
    // Проверка 2: NPM CLI vs Rust tauri
    if (!isCompatible(npmCli, rustTauri)) {
      warn(`Рекомендация: @tauri-apps/cli (${formatVersion(npmCli)}) отличается от tauri (${formatVersion(rustTauri)})`);
      warn('  Это не критично, но лучше синхронизировать версии.');
    } else {
      success(`@tauri-apps/cli (${formatVersion(npmCli)}) совместима с tauri (${formatVersion(rustTauri)})`);
    }
    
    // Проверка 3: tauri vs tauri-build
    if (!isCompatible(rustTauri, rustTauriBuild)) {
      error(`Несовпадение версий: tauri (${formatVersion(rustTauri)}) и tauri-build (${formatVersion(rustTauriBuild)})`);
      hasErrors = true;
    } else {
      success(`tauri (${formatVersion(rustTauri)}) совместима с tauri-build (${formatVersion(rustTauriBuild)})`);
    }
    
    console.log('');
    
    if (hasErrors) {
      error('❌ ПРОВЕРКА НЕ ПРОЙДЕНА\n');
      console.log('Как исправить:');
      console.log('  1. Обновите NPM пакеты: npm update @tauri-apps/api @tauri-apps/cli');
      console.log('  2. Или обновите Cargo.toml до нужных версий');
      console.log('  3. Убедитесь что major.minor версии совпадают\n');
      process.exit(1);
    } else {
      success('✅ ВСЕ ВЕРСИИ СИНХРОНИЗИРОВАНЫ\n');
      process.exit(0);
    }
    
  } catch (err) {
    error(`Ошибка при проверке: ${err.message}`);
    process.exit(1);
  }
}

main();
