# Build script for Windows with CUDA support
# Run from project root: .\scripts\build-cuda.ps1

param(
    [switch]$Release,
    [switch]$SkipFrontend,
    [string]$CudaPath = $env:CUDA_PATH
)

$ErrorActionPreference = "Stop"

Write-Host "=== Wishmaster Desktop Build (CUDA) ===" -ForegroundColor Cyan

# Check CUDA
if (-not $CudaPath) {
    $CudaPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4"
}

if (-not (Test-Path $CudaPath)) {
    Write-Host "CUDA not found at: $CudaPath" -ForegroundColor Red
    Write-Host "Please install CUDA Toolkit or set CUDA_PATH environment variable" -ForegroundColor Yellow
    exit 1
}

Write-Host "CUDA Path: $CudaPath" -ForegroundColor Green

# Set environment
$env:CUDA_PATH = $CudaPath
$env:PATH = "$CudaPath\bin;$env:PATH"

# Build frontend
if (-not $SkipFrontend) {
    Write-Host "`n=== Building Frontend ===" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Build Rust backend
Write-Host "`n=== Building Rust Backend (CUDA) ===" -ForegroundColor Cyan
Push-Location src-tauri

$buildArgs = @("build")
if ($Release) {
    $buildArgs += "--release"
}
$buildArgs += "--features", "llm-cuda"

cargo @buildArgs
if ($LASTEXITCODE -ne 0) { 
    Pop-Location
    exit $LASTEXITCODE 
}

Pop-Location

# Copy CUDA DLLs
Write-Host "`n=== Copying CUDA DLLs ===" -ForegroundColor Cyan
$targetDir = if ($Release) { "src-tauri\target\release" } else { "src-tauri\target\debug" }

$cudaDlls = @(
    "cudart64_*.dll",
    "cublas64_*.dll", 
    "cublasLt64_*.dll"
)

foreach ($pattern in $cudaDlls) {
    $files = Get-ChildItem -Path "$CudaPath\bin" -Filter $pattern -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        Write-Host "Copying: $($file.Name)"
        Copy-Item $file.FullName -Destination $targetDir -Force
    }
}

# Build Tauri bundle
if ($Release) {
    Write-Host "`n=== Building Tauri Bundle ===" -ForegroundColor Cyan
    npm run tauri:build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    
    # Copy DLLs to bundle
    $bundleDir = "src-tauri\target\release\bundle"
    if (Test-Path $bundleDir) {
        foreach ($pattern in $cudaDlls) {
            $files = Get-ChildItem -Path "$CudaPath\bin" -Filter $pattern -ErrorAction SilentlyContinue
            foreach ($file in $files) {
                # Copy to MSI resources
                $msiDir = "$bundleDir\msi"
                if (Test-Path $msiDir) {
                    Copy-Item $file.FullName -Destination $msiDir -Force
                }
            }
        }
    }
}

Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Output: $targetDir" -ForegroundColor Cyan
