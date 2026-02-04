#!/bin/bash
# Build script for Linux with CUDA support
# Run from project root: ./scripts/build-cuda.sh

set -e

echo "=== Wishmaster Desktop Build (CUDA) ==="

# Check CUDA
CUDA_PATH=${CUDA_PATH:-/usr/local/cuda}

if [ ! -d "$CUDA_PATH" ]; then
    echo "CUDA not found at: $CUDA_PATH"
    echo "Please install CUDA Toolkit or set CUDA_PATH environment variable"
    exit 1
fi

echo "CUDA Path: $CUDA_PATH"

# Set environment
export CUDA_PATH
export PATH="$CUDA_PATH/bin:$PATH"
export LD_LIBRARY_PATH="$CUDA_PATH/lib64:$LD_LIBRARY_PATH"

# Parse arguments
RELEASE=false
SKIP_FRONTEND=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --release) RELEASE=true; shift ;;
        --skip-frontend) SKIP_FRONTEND=true; shift ;;
        *) shift ;;
    esac
done

# Build frontend
if [ "$SKIP_FRONTEND" = false ]; then
    echo ""
    echo "=== Building Frontend ==="
    npm run build
fi

# Build Rust backend
echo ""
echo "=== Building Rust Backend (CUDA) ==="
cd src-tauri

BUILD_ARGS="build --features cuda"
if [ "$RELEASE" = true ]; then
    BUILD_ARGS="$BUILD_ARGS --release"
fi

cargo $BUILD_ARGS
cd ..

# Determine target directory
if [ "$RELEASE" = true ]; then
    TARGET_DIR="src-tauri/target/release"
else
    TARGET_DIR="src-tauri/target/debug"
fi

# Copy CUDA libraries
echo ""
echo "=== Copying CUDA Libraries ==="
CUDA_LIBS=(
    "libcudart.so*"
    "libcublas.so*"
    "libcublasLt.so*"
)

for pattern in "${CUDA_LIBS[@]}"; do
    for lib in $CUDA_PATH/lib64/$pattern; do
        if [ -f "$lib" ]; then
            echo "Copying: $(basename $lib)"
            cp "$lib" "$TARGET_DIR/"
        fi
    done
done

# Build Tauri bundle
if [ "$RELEASE" = true ]; then
    echo ""
    echo "=== Building Tauri Bundle ==="
    npm run tauri:build
    
    # Bundle CUDA into AppImage
    APPIMAGE_DIR="src-tauri/target/release/bundle/appimage"
    if [ -d "$APPIMAGE_DIR" ]; then
        echo ""
        echo "=== Bundling CUDA into AppImage ==="
        
        APPIMAGE=$(find $APPIMAGE_DIR -name "*.AppImage" | head -1)
        if [ -n "$APPIMAGE" ]; then
            chmod +x "$APPIMAGE"
            cd $APPIMAGE_DIR
            
            # Extract
            ./*.AppImage --appimage-extract
            
            # Copy CUDA libs
            mkdir -p squashfs-root/usr/lib
            for pattern in "${CUDA_LIBS[@]}"; do
                for lib in $CUDA_PATH/lib64/$pattern; do
                    if [ -f "$lib" ]; then
                        cp "$lib" squashfs-root/usr/lib/
                    fi
                done
            done
            
            # Update rpath
            BINARY=$(find squashfs-root -name "wishmaster*" -type f -executable | head -1)
            if [ -n "$BINARY" ]; then
                patchelf --set-rpath '$ORIGIN/../lib:$ORIGIN' "$BINARY" 2>/dev/null || true
            fi
            
            # Repack
            rm -f "$APPIMAGE"
            
            # Download appimagetool if needed
            if [ ! -f appimagetool ]; then
                wget -q "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage" -O appimagetool
                chmod +x appimagetool
            fi
            
            ARCH=x86_64 ./appimagetool squashfs-root
            rm -rf squashfs-root appimagetool
            
            cd - > /dev/null
        fi
    fi
fi

echo ""
echo "=== Build Complete ==="
echo "Output: $TARGET_DIR"
