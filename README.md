# 🧞 Wishmaster Desktop

**Локальный AI-ассистент с поддержкой llama.cpp для Windows, Linux и macOS**

![Qt](https://img.shields.io/badge/Qt-6.5+-41CD52?style=flat&logo=qt)
![C++](https://img.shields.io/badge/C++-17-00599C?style=flat&logo=cplusplus)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Возможности

- 💬 **Чат с LLM** — поддержка любых GGUF моделей через llama.cpp
- 🎤 **Голосовой ввод** — распознавание речи через whisper.cpp
- 🔊 **Озвучка ответов** — TTS через Silero/Piper (ONNX)
- 🧬 **AI Clone** — создание цифрового клона из ваших сообщений
- 📁 **Управление моделями** — сканирование и добавление моделей
- 📜 **История чатов** — сохранение всех диалогов в SQLite
- 🎨 **Cyberpunk UI** — тёмная тема с неоновыми акцентами

## 🖥️ Платформы

| Платформа | Статус |
|-----------|--------|
| Linux | ✅ Поддерживается |
| Windows | ✅ Поддерживается |
| macOS | ✅ Поддерживается |

## 📋 Требования

- Qt 6.5+
- CMake 3.16+
- C++17 компилятор
- (Опционально) llama.cpp
- (Опционально) whisper.cpp
- (Опционально) ONNX Runtime

## 🔧 Сборка

### Linux

```bash
# Установка зависимостей (Ubuntu/Debian)
sudo apt install qt6-base-dev qt6-multimedia-dev cmake build-essential

# Клонирование и сборка
git clone https://github.com/your/wishmaster-desktop.git
cd wishmaster-desktop

# Получение llama.cpp
git clone https://github.com/ggerganov/llama.cpp external/llama.cpp
git clone https://github.com/ggerganov/whisper.cpp external/whisper.cpp

# Сборка
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

# Запуск
./WishmasterDesktop
```

### Windows

```powershell
# Установите Qt 6.5+ и CMake через официальные установщики
# или через vcpkg/chocolatey

# Сборка
mkdir build
cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

### macOS

```bash
# Установка через Homebrew
brew install qt@6 cmake

# Сборка
mkdir build && cd build
cmake .. -DCMAKE_PREFIX_PATH=$(brew --prefix qt@6)
make -j$(sysctl -n hw.ncpu)
```

## 📁 Структура проекта

```
wishmaster-desktop/
├── CMakeLists.txt          # Главный файл сборки
├── src/
│   ├── main.cpp            # Точка входа
│   ├── mainwindow.cpp/h    # Главное окно
│   ├── chatwidget.cpp/h    # Виджет чата
│   ├── settingsdialog.cpp/h # Диалог настроек
│   ├── modelmanager.cpp/h  # Управление моделями
│   ├── database.cpp/h      # SQLite база данных
│   ├── llm/
│   │   └── llamaengine.cpp/h   # llama.cpp интеграция
│   ├── voice/
│   │   ├── ttsengine.cpp/h     # Text-to-Speech
│   │   └── sttengine.cpp/h     # Speech-to-Text
│   └── persona/
│       └── personaanalyzer.cpp/h # AI Clone анализатор
├── external/
│   ├── llama.cpp/          # Субмодуль llama.cpp
│   └── whisper.cpp/        # Субмодуль whisper.cpp
└── resources/
    └── resources.qrc       # Qt ресурсы
```

## ⚙️ Настройки

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| Temperature | Креативность ответов | 0.7 |
| Max Tokens | Максимум токенов в ответе | 512 |
| Context Length | Размер контекстного окна | 2048 |
| TTS Engine | Движок озвучки | Silero |
| STT Language | Язык распознавания | Русский |

## 🧬 AI Clone

Wishmaster может создать ваш цифровой клон:

1. Напишите минимум 20 сообщений в чат
2. Откройте **Настройки → AI Clone**
3. Нажмите **"Анализировать сообщения"**
4. Переключитесь в режим **Clone**

AI будет отвечать в вашем стиле!

## 🔗 Связанные проекты

- [Wishmaster Android](https://github.com/antsincgame/Jared) — мобильная версия
- [llama.cpp](https://github.com/ggerganov/llama.cpp) — движок LLM
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — движок STT

## 📄 Лицензия

MIT License

## 🙏 Благодарности

- [llama.cpp](https://github.com/ggerganov/llama.cpp) — Georgi Gerganov
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — Georgi Gerganov
- [Silero Models](https://github.com/snakers4/silero-models) — Alexander Veysov
- [Qt Framework](https://www.qt.io/) — The Qt Company
