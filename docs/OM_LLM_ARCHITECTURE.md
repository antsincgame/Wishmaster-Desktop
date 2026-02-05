# OM Analysis: Подключение LLM без встраивания + Vision

## Проблема

1. **Нельзя компилировать со встроенным LLM** — сборка с `llama-cpp-2` долгая и тяжёлая.
2. **Vision-модели (Llama-3.2-Vision и т.п.) не поддерживаются** — текущий `llama-cpp-2` возвращает NullResult для мультимодальных GGUF.

## Исследование

- **Текущий поток**: Frontend → `invoke('load_model'|'generate')` → Tauri commands → `llm.rs` (llama-cpp-2) → события `llm-token`, `llm-finished`.
- **Зависимости**: `Cargo.toml` — `llama-cpp-2` в default, `llm.rs` — нативная загрузка и генерация.
- **Vision**: Ollama поддерживает vision через OpenAI-совместимый API и свой `/api/chat` (модели llava, qwen2-vl, llama3.2-vision и т.д.).

## Корневая причина (5 почему)

1. **Почему долгая сборка?** — В бинарник входит нативный llama.cpp (`llama-cpp-2`).
2. **Почему Vision не работает?** — llama-cpp-2/текущий GGUF-рантайм не поддерживают мультимодальные модели в этом билде.
3. **Почему LLM встроен?** — Изначально выбран вариант «всё в одном» для офлайн-работы.
4. **Почему нет альтернативы?** — Не было абстракции «провайдер» (native vs remote).
5. **Корень**: Один жёстко встроенный бэкенд вместо выбора «встроенный (опционально) или внешний сервер».

## Решения

| Критерий | A: Только Ollama | B: Два бэкенда (Ollama + native опция) | C: Только OpenAI-совместимый URL |
|----------|------------------|--------------------------------------|-----------------------------------|
| **Суть** | Убрать llama-cpp, только HTTP к Ollama | Native под feature, по умолчанию Ollama | Любой URL (Ollama/LiteLLM/OpenAI) |
| **Время** | Средне | Долго | Средне |
| **Риск** | Низкий | Средний (два пути) | Низкий |
| **Vision** | Да (Ollama) | Да в режиме Ollama | Зависит от сервера |
| **Офлайн** | Нет (нужен Ollama) | Да при native-llm | Нет |
| **Рекомендую** | — | ✅ | — |

**Рекомендация: B** — по умолчанию сборка без LLM (Ollama по HTTP), опциональная feature `native-llm` для встроенного llama.cpp; Vision через Ollama.

## Реализация (план)

1. **Cargo.toml**: feature `native-llm` с `llama-cpp-2` и `cuda`; default без `native-llm`. Добавить `reqwest` для Ollama.
2. **Новый модуль `ollama.rs`**: стриминг чата через POST `/api/chat`, парсинг NDJSON, эмит токенов.
3. **Settings**: `llm_backend` (ollama | native), `ollama_base_url`, `ollama_model`.
4. **commands**: ветвление по `llm_backend`; при ollama — `load_model` = выбор модели по имени, `generate` = вызов Ollama.
5. **Frontend**: настройка бэкенда и URL; на странице моделей при Ollama — список моделей с бэкенда (новая команда `list_ollama_models`).
