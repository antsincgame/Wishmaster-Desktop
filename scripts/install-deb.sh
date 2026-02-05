#!/usr/bin/env bash
# Установка Wishmaster Desktop из .deb пакета (Linux)
# Запуск из корня проекта: bash scripts/install-deb.sh
# Или с путём к пакету: bash scripts/install-deb.sh /path/to/Wishmaster\ Desktop_1.0.0_amd64.deb

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_DEB="$PROJECT_ROOT/src-tauri/target/release/bundle/deb/Wishmaster Desktop_1.0.0_amd64.deb"

DEB_PATH="${1:-$DEFAULT_DEB}"

if [[ ! -f "$DEB_PATH" ]]; then
  if [[ -n "$1" ]]; then
    echo "Указанный файл не найден: $DEB_PATH"
    echo "Пробуем путь по умолчанию в проекте..."
    DEB_PATH="$DEFAULT_DEB"
  fi
  if [[ ! -f "$DEB_PATH" ]]; then
    echo "Ошибка: файл не найден."
    echo ""
    echo "Варианты:"
    echo "  1) Из корня проекта без аргументов (если уже собирали DEB):"
    echo "     bash scripts/install-deb.sh"
    echo ""
    echo "  2) Сначала собрать пакет: npm run tauri:build:deb"
    echo ""
    echo "  3) Указать реальный путь к .deb, например:"
    echo "     bash scripts/install-deb.sh \"$DEFAULT_DEB\""
    echo "     или: bash scripts/install-deb.sh ~/Загрузки/Wishmaster\\ Desktop_1.0.0_amd64.deb"
    exit 1
  fi
fi

echo "=== Установка Wishmaster Desktop ==="
echo "Пакет: $DEB_PATH"
echo ""

sudo dpkg -i "$DEB_PATH" || true
echo ""
echo "Проверка и установка зависимостей..."
sudo apt-get install -f -y
echo ""
echo "Готово. Запуск: wishmaster-desktop"
