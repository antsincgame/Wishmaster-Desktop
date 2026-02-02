# 🧞 Wishmaster Desktop

**Локальный AI-ассистент с клонированием голоса**

![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat&logo=tauri)
![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?style=flat&logo=rust)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Возможности

- 💬 **Мульти-модель чат** — выбор любой GGUF модели (Qwen, DeepSeek, Llama, Gemma)
- 🎤 **Голосовой ввод** — распознавание речи через Whisper.cpp
- 🔊 **Клонирование голоса** — создайте AI-копию своего голоса за 6 секунд (Coqui XTTS)
- 📜 **История чатов** — сохранение всех диалогов в SQLite
- 🎨 **Cyberpunk UI** — тёмная тема с неоновыми эффектами
- 🚀 **Компактный** — ~10 MB бинарник (vs 150 MB Electron)

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
LLM:       llama-cpp-2 (Rust bindings)
STT:       Whisper.cpp
TTS:       Coqui XTTS (клонирование голоса)
Database:  SQLite (rusqlite)
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

## 🎤 Клонирование голоса

Wishmaster использует **Coqui XTTS** для создания AI-клона вашего голоса:

1. Запишите ~6 секунд своей речи
2. AI извлечёт "отпечаток" вашего голоса
3. Теперь любой текст может быть озвучен вашим голосом!

**Качество русского языка:** ⭐⭐⭐⭐ (CER 2.7, UTMOS 3.04)

## 📁 Структура проекта

```
wishmaster-desktop/
├── package.json              # NPM конфигурация
├── vite.config.ts            # Vite сборка
├── tailwind.config.js        # Tailwind тема
├── src/                      # React frontend
│   ├── main.tsx              # Точка входа
│   ├── App.tsx               # Корневой компонент
│   ├── store.ts              # Zustand state management
│   ├── components/           # UI компоненты
│   │   ├── Sidebar.tsx
│   │   ├── ChatMessage.tsx
│   │   └── ChatInput.tsx
│   └── pages/                # Страницы
│       ├── ChatPage.tsx
│       ├── ModelsPage.tsx
│       ├── VoiceClonePage.tsx
│       └── SettingsPage.tsx
└── src-tauri/                # Rust backend
    ├── Cargo.toml            # Rust зависимости
    ├── tauri.conf.json       # Tauri конфигурация
    └── src/
        ├── main.rs           # Точка входа
        ├── commands.rs       # Tauri команды
        ├── database.rs       # SQLite операции
        ├── llm.rs            # llama-cpp-2 интеграция
        └── voice.rs          # STT/TTS с клонированием
```

## ⚙️ Настройки

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| Temperature | Креативность ответов | 0.7 |
| Max Tokens | Макс. длина ответа | 512 |
| Context Length | Память AI | 2048 |
| Auto Speak | Озвучивать ответы | Выкл |

## 🔗 Связанные проекты

- [Wishmaster Android](https://github.com/antsincgame/Jared) — мобильная версия
- [llama.cpp](https://github.com/ggerganov/llama.cpp) — движок LLM
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — движок STT
- [Coqui XTTS](https://github.com/coqui-ai/TTS) — клонирование голоса

## 📄 Лицензия

MIT License

## 🙏 Благодарности

- [Tauri](https://tauri.app/) — фреймворк для Desktop приложений
- [llama.cpp](https://github.com/ggerganov/llama.cpp) — Georgi Gerganov
- [Coqui TTS](https://github.com/coqui-ai/TTS) — Coqui AI Team
- [Qwen](https://github.com/QwenLM/Qwen2.5) — Alibaba Cloud

---

**Made with 🦀 Rust + ⚛️ React + 💜 Love**
