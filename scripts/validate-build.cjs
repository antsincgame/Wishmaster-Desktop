#!/usr/bin/env node
/**
 * Pre-build validation script
 * Runs checks before Tauri build to catch configuration errors early
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const TAURI_DIR = path.join(ROOT_DIR, 'src-tauri');

let hasErrors = false;

function log(msg) {
  console.log(`\x1b[36m[validate]\x1b[0m ${msg}`);
}

function success(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function error(msg) {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  hasErrors = true;
}

function warn(msg) {
  console.warn(`\x1b[33m⚠\x1b[0m ${msg}`);
}

// ==================== CHECKS ====================

function checkTauriConfig() {
  log('Checking tauri.conf.json...');
  
  const configPath = path.join(TAURI_DIR, 'tauri.conf.json');
  if (!fs.existsSync(configPath)) {
    error('tauri.conf.json not found');
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    // Check required fields
    if (!config.productName) error('Missing productName in tauri.conf.json');
    if (!config.version) error('Missing version in tauri.conf.json');
    if (!config.identifier) error('Missing identifier in tauri.conf.json');
    if (!config.build?.frontendDist) error('Missing build.frontendDist in tauri.conf.json');
    
    success('tauri.conf.json is valid');
  } catch (e) {
    error(`Invalid JSON in tauri.conf.json: ${e.message}`);
  }
}

function checkCargoToml() {
  log('Checking Cargo.toml...');
  
  const cargoPath = path.join(TAURI_DIR, 'Cargo.toml');
  if (!fs.existsSync(cargoPath)) {
    error('Cargo.toml not found');
    return;
  }

  const content = fs.readFileSync(cargoPath, 'utf-8');
  
  // Check for problematic features that require allowlist
  const problematicFeatures = [
    'protocol-asset',
    'shell-open',
    'shell-execute',
    'fs-all',
    'http-all',
  ];
  
  for (const feature of problematicFeatures) {
    if (content.includes(`"${feature}"`)) {
      warn(`Feature "${feature}" found - ensure it's enabled in tauri.conf.json allowlist`);
    }
  }
  
  success('Cargo.toml checked');
}

function checkPackageJson() {
  log('Checking package.json...');
  
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    error('package.json not found');
    return;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    
    if (!pkg.scripts?.build) error('Missing build script in package.json');
    if (!pkg.scripts?.dev) error('Missing dev script in package.json');
    
    success('package.json is valid');
  } catch (e) {
    error(`Invalid JSON in package.json: ${e.message}`);
  }
}

function checkTypeScript() {
  log('Running TypeScript check...');
  
  try {
    execSync('npx tsc --noEmit', { 
      cwd: ROOT_DIR, 
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    success('TypeScript compilation successful');
  } catch (e) {
    error('TypeScript compilation failed:');
    console.error(e.stdout || e.stderr || e.message);
  }
}

function checkRustCompilation() {
  log('Running Rust check...');
  
  try {
    execSync('cargo check', { 
      cwd: TAURI_DIR, 
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    success('Rust compilation check successful');
  } catch (e) {
    error('Rust compilation check failed:');
    console.error(e.stdout || e.stderr || e.message);
  }
}

function checkRequiredFiles() {
  log('Checking required files...');
  
  const requiredFiles = [
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    'src/main.tsx',
    'src/App.tsx',
    'src-tauri/Cargo.toml',
    'src-tauri/tauri.conf.json',
    'src-tauri/src/main.rs',
  ];
  
  for (const file of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) {
      error(`Required file missing: ${file}`);
    }
  }
  
  success('All required files present');
}

function checkVersionSync() {
  log('Checking version synchronization...');
  
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const tauriPath = path.join(TAURI_DIR, 'tauri.conf.json');
    const cargoPath = path.join(TAURI_DIR, 'Cargo.toml');
    
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf-8'));
    const cargo = fs.readFileSync(cargoPath, 'utf-8');
    
    const cargoVersionMatch = cargo.match(/^version\s*=\s*"([^"]+)"/m);
    const cargoVersion = cargoVersionMatch ? cargoVersionMatch[1] : null;
    
    if (pkg.version !== tauri.version) {
      warn(`Version mismatch: package.json (${pkg.version}) vs tauri.conf.json (${tauri.version})`);
    }
    if (cargoVersion && pkg.version !== cargoVersion) {
      warn(`Version mismatch: package.json (${pkg.version}) vs Cargo.toml (${cargoVersion})`);
    }
    
    success('Version sync checked');
  } catch (e) {
    error(`Version check failed: ${e.message}`);
  }
}

// ==================== MAIN ====================

console.log('\n🔍 Running pre-build validation...\n');

checkRequiredFiles();
checkPackageJson();
checkTauriConfig();
checkCargoToml();
checkVersionSync();

// Only run compilation checks if --full flag is passed
if (process.argv.includes('--full')) {
  checkTypeScript();
  checkRustCompilation();
}

console.log('');

if (hasErrors) {
  console.error('\x1b[31m❌ Validation failed with errors\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m✅ All validations passed\x1b[0m\n');
  process.exit(0);
}
