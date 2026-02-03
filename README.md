# 🧞 Wishmaster Desktop

**Local AI Assistant with Voice Cloning**

![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat&logo=tauri)
![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?style=flat&logo=rust)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)
![License](https://img.shields.io/badge/License-MIT-blue)

[🇷🇺 Русская версия](#-wishmaster-desktop-1)

## ✨ Features

- 💬 **Multi-Model Chat** — Use any GGUF model (Qwen, DeepSeek, Llama, Gemma)
- 🧠 **Long-Term Memory** — AI remembers ALL your conversations across sessions
- 🪞 **Digital Twin** — Export your chat data for fine-tuning your own AI clone
- 🎤 **Voice Input** — Speech recognition via Whisper.cpp
- 🔊 **Voice Cloning** — Create an AI copy of your voice in 6 seconds (Coqui XTTS)
- 📜 **Chat History** — All conversations saved in SQLite with full-text search
- 🎨 **Cyberpunk UI** — Dark theme with neon effects and customizable accent colors
- 🚀 **Lightweight** — ~10 MB binary (vs 150 MB Electron)
- 🔒 **100% Local** — No cloud, no servers, complete privacy

## 🖥️ Platforms

| Platform | Format | Status |
|----------|--------|--------|
| 🐧 Linux | **AppImage** (single file!) | ✅ |
| 🪟 Windows | MSI / EXE | ✅ |
| 🍎 macOS | DMG / .app | ✅ |

### 📦 Linux AppImage

Download `Wishmaster-x.x.x.AppImage`, make it executable, and run:

```bash
chmod +x Wishmaster-*.AppImage
./Wishmaster-*.AppImage
```

No installation required!

## 🛠️ Tech Stack

```
Frontend:  React 18 + TypeScript + Tailwind CSS
Backend:   Tauri 2.0 + Rust
LLM:       llama-cpp-2 (Rust bindings with CUDA)
STT:       Whisper.cpp
TTS:       Coqui XTTS (voice cloning) / espeak-ng / Windows SAPI
Database:  SQLite with FTS5 (full-text search)
```

## 📦 Recommended Models

| Model | RAM | Description |
|-------|-----|-------------|
| **Qwen2.5 7B Q4_K_M** | ~5 GB | Best for Russian |
| **DeepSeek 7B Q4_K_M** | ~3.5 GB | Best for code |
| **Gemma 3n** | ~2 GB | Compact, fast |
| **Llama 3.1 8B Q4_K_M** | ~6 GB | Long context |

## 🔧 Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.75+
- [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Build from Source

```bash
# Clone
git clone https://github.com/antsincgame/Wishmaster-Desktop.git
cd Wishmaster-Desktop

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build release
npm run tauri:build
```

### Linux (Ubuntu/Debian)

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Windows

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++".

### macOS

```bash
xcode-select --install
```

## 🧠 Memory System

Wishmaster features a sophisticated memory system:

1. **Cross-Session Memory** — Search through ALL your conversations
2. **Fact Extraction** — Save important facts, preferences, names
3. **User Persona** — AI analyzes your writing style
4. **Context Injection** — Relevant memories are injected into prompts

## 🪞 Digital Twin Export

Export your conversation data for fine-tuning:

1. **Alpaca Format** — JSONL for Axolotl, LLaMA-Factory
2. **ShareGPT Format** — JSON for FastChat, OpenAssistant
3. **Full Export** — All data including memories and persona

## 🎤 Voice Cloning

Wishmaster uses **Coqui XTTS** for creating an AI clone of your voice:

1. Record ~6 seconds of your speech
2. AI extracts your voice "fingerprint"
3. Any text can now be spoken in your voice!

**Russian language quality:** ⭐⭐⭐⭐ (CER 2.7, UTMOS 3.04)

## 📁 Project Structure

```
wishmaster-desktop/
├── package.json              # NPM configuration
├── vite.config.ts            # Vite build
├── tailwind.config.js        # Tailwind theme
├── src/                      # React frontend
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root component
│   ├── store.ts              # Zustand state management
│   ├── types/                # TypeScript types
│   ├── api/                  # Tauri API layer
│   ├── lib/                  # Utility libraries
│   ├── components/           # UI components
│   │   ├── Sidebar.tsx
│   │   ├── ChatMessage.tsx
│   │   └── ChatInput.tsx
│   └── pages/                # Pages
│       ├── ChatPage.tsx
│       ├── ModelsPage.tsx
│       ├── MemoryPage.tsx
│       ├── VoiceClonePage.tsx
│       └── SettingsPage.tsx
└── src-tauri/                # Rust backend
    ├── Cargo.toml            # Rust dependencies
    ├── tauri.conf.json       # Tauri configuration
    └── src/
        ├── main.rs           # Entry point
        ├── commands.rs       # Tauri commands
        ├── database.rs       # SQLite + FTS5 operations
        ├── errors.rs         # Custom error types
        ├── llm.rs            # llama-cpp-2 integration
        └── voice.rs          # STT/TTS with cloning
```

## ⚙️ Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| Temperature | Response creativity | 0.7 |
| Max Tokens | Max response length | 512 |
| Context Length | AI memory | 2048 |
| Auto Speak | Voice AI responses | Off |

## 🔗 Related Projects

- [Wishmaster Android](https://github.com/antsincgame/Jared) — Mobile version
- [llama.cpp](https://github.com/ggerganov/llama.cpp) — LLM engine
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — STT engine
- [Coqui XTTS](https://github.com/coqui-ai/TTS) — Voice cloning

## 📄 License

MIT License

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) — Desktop app framework
- [llama.cpp](https://github.com/ggerganov/llama.cpp) — Georgi Gerganov
- [Coqui TTS](https://github.com/coqui-ai/TTS) — Coqui AI Team
- [Qwen](https://github.com/QwenLM/Qwen2.5) — Alibaba Cloud

---

# 🧞 Wishmaster Desktop

**Локальный AI-ассистент с клонированием голоса**

## ✨ Возможности

- 💬 **Мульти-модель чат** — выбор любой GGUF модели (Qwen, DeepSeek, Llama, Gemma)
- 🧠 **Долговременная память** — AI помнит ВСЕ разговоры из всех сессий
- 🪞 **Цифровой двойник** — экспорт данных для дообучения личной AI-модели
- 🎤 **Голосовой ввод** — распознавание речи через Whisper.cpp
- 🔊 **Клонирование голоса** — создайте AI-копию своего голоса за 6 секунд (Coqui XTTS)
- 📜 **История чатов** — сохранение всех диалогов в SQLite с полнотекстовым поиском
- 🎨 **Cyberpunk UI** — тёмная тема с неоновыми эффектами
- 🚀 **Компактный** — ~10 MB бинарник (vs 150 MB Electron)
- 🔒 **100% Локально** — без облака, без серверов, полная приватность

## 🖥️ Платформы

| Платформа | Формат | Статус |
|-----------|--------|--------|
| 🐧 Linux | **AppImage** (один файл!) | ✅ |
| 🪟 Windows | MSI / EXE | ✅ |
| 🍎 macOS | DMG / .app | ✅ |

### 📦 Linux AppImage

Скачай `Wishmaster-x.x.x.AppImage`, сделай исполняемым и запусти:

```bash
chmod +x Wishmaster-*.AppImage
./Wishmaster-*.AppImage
```

Никакой установки не требуется!

## 🛠️ Tech Stack

```
Frontend:  React 18 + TypeScript + Tailwind CSS
Backend:   Tauri 2.0 + Rust
LLM:       llama-cpp-2 (Rust bindings с CUDA)
STT:       Whisper.cpp
TTS:       Coqui XTTS (клонирование голоса) / espeak-ng / Windows SAPI
Database:  SQLite с FTS5 (полнотекстовый поиск)
```

## 📦 Рекомендуемые модели

| Модель | RAM | Описание |
|--------|-----|----------|
| **Qwen2.5 7B Q4_K_M** | ~5 GB | Лучший русский язык |
| **DeepSeek 7B Q4_K_M** | ~3.5 GB | Лучший для кода |
| **Gemma 3n** | ~2 GB | Компактная, быстрая |
| **Llama 3.1 8B Q4_K_M** | ~6 GB | Длинный контекст |

## 🔧 Установка

### Предварительные требования

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.75+
- [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Сборка из исходников

```bash
# Клонирование
git clone https://github.com/antsincgame/Wishmaster-Desktop.git
cd Wishmaster-Desktop

# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run tauri:dev

# Сборка релиза
npm run tauri:build
```

### Linux (Ubuntu/Debian)

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Windows

Установите [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) с компонентом "Desktop development with C++".

### macOS

```bash
xcode-select --install
```

## 🧠 Система памяти

Wishmaster имеет продвинутую систему памяти:

1. **Кросс-сессионная память** — поиск по ВСЕМ разговорам
2. **Извлечение фактов** — сохраняйте важные факты, предпочтения, имена
3. **Персона пользователя** — AI анализирует ваш стиль общения
4. **Инъекция контекста** — релевантные воспоминания добавляются в промпт

## 🪞 Экспорт цифрового двойника

Экспортируйте данные для дообучения:

1. **Alpaca Format** — JSONL для Axolotl, LLaMA-Factory
2. **ShareGPT Format** — JSON для FastChat, OpenAssistant
3. **Полный экспорт** — все данные включая память и персону

## 🎤 Клонирование голоса

Wishmaster использует **Coqui XTTS** для создания AI-клона вашего голоса:

1. Запишите ~6 секунд своей речи
2. AI извлечёт "отпечаток" вашего голоса
3. Теперь любой текст может быть озвучен вашим голосом!

**Качество русского языка:** ⭐⭐⭐⭐ (CER 2.7, UTMOS 3.04)

## ⚙️ Настройки

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| Temperature | Креативность ответов | 0.7 |
| Max Tokens | Макс. длина ответа | 512 |
| Context Length | Память AI | 2048 |
| Auto Speak | Озвучивать ответы | Выкл |

## 📄 Лицензия

MIT License

---

**Made with 🦀 Rust + ⚛️ React + 💜 Love**
