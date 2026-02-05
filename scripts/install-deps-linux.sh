#!/usr/bin/env bash
# Установка зависимостей для локальной сборки Wishmaster (Linux)
# Запуск: sudo bash scripts/install-deps-linux.sh

set -e
echo "=== Установка зависимостей для сборки Wishmaster ==="

apt-get update
apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  cmake \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libsqlite3-dev \
  pkg-config \
  libglib2.0-dev \
  libgtk-3-dev \
  libclang-dev

echo ""
echo "=== Проверка ==="
CARGO_PATH=""
if command -v cargo >/dev/null 2>&1; then
  CARGO_PATH="$(command -v cargo) ($(cargo --version))"
elif [ -x "$HOME/.cargo/bin/cargo" ]; then
  CARGO_PATH="$HOME/.cargo/bin/cargo ($("$HOME/.cargo/bin/cargo" --version)) — добавьте в PATH"
else
  CARGO_PATH="не найден. Установите: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi
echo "Rust: $CARGO_PATH"
echo "Node: $(command -v node 2>/dev/null && node --version || echo 'не найден')"
if command -v nvcc >/dev/null 2>&1; then
  echo "CUDA: ${CUDA_PATH:-/usr/local/cuda} ($(nvcc --version | head -1))"
else
  echo "CUDA: ${CUDA_PATH:-/usr/local/cuda} (nvcc не в PATH)"
fi
echo ""
echo "Готово. Для сборки выполните в каталоге проекта:"
echo ""
echo '  . "$HOME/.cargo/env" 2>/dev/null || true'
echo '  export PATH="$HOME/.cargo/bin:/usr/local/cuda/bin:$PATH"'
echo '  export CUDA_PATH="/usr/local/cuda"'
echo '  CI=false npm run tauri:build'
echo ""
