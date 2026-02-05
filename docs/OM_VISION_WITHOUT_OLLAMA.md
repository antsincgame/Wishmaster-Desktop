# OM Analysis: Vision без Ollama

## Проблема

Нужно использовать Vision-модели (LLaVA, Llama-3.2-Vision, Qwen2-VL и т.д.) **без** установки Ollama.

## Исследование

- **Текущее состояние**: Vision доступен только через бэкенд Ollama (HTTP к `localhost:11434`).
- **llama-cpp-2**: Крейт имеет опциональную фичу **mtmd** (multimodal): загрузка mmproj, `MtmdBitmap` из изображения, токенизация с маркером `<__media__>`, encode + decode. Для этого нужна сборка с `llama-cpp-sys-2/mtmd` и два файла — основной GGUF и mmproj.
- **llama.cpp server**: Официальный сервер llama.cpp поддерживает мультимодальность (`--mmproj`), экспортирует **OpenAI-совместимый** API (`/v1/chat/completions`, стриминг по SSE). Запуск: `llama-server -m model.gguf --mmproj mmproj.gguf --port 8080`.
- **Llamafile**: Один исполняемый файл с vision, тоже может отдавать API (в т.ч. OpenAI-совместимый).
- **Итог**: Vision без Ollama возможен либо (1) своим рантаймом через mtmd в приложении, либо (2) внешним сервером с OpenAI-совместимым API (llama-server / Llamafile).

## Корневая причина (5 почему)

1. **Почему нет Vision без Ollama?** — Сейчас в приложении заложен только путь Ollama для удалённого LLM.
2. **Почему только Ollama?** — Выбран один тип HTTP-бэкенда (Ollama), без абстракции «произвольный OpenAI-совместимый endpoint».
3. **Почему не заложили другой endpoint?** — Изначально ориентировались на «Ollama или native», не на «любой сервер с /v1/chat/completions».
4. **Почему Vision только у Ollama?** — Native (llama-cpp-2) собирался без фичи mtmd и без логики mmproj/изображений.
5. **Корень**: Нет режима «Custom URL» для произвольного OpenAI-совместимого сервера (llama-server, Llamafile и т.д.), который может отдавать Vision.

## Решения

| Критерий | A: Custom URL (OpenAI API) | B: Native + mtmd | C: Только документация |
|----------|----------------------------|------------------|-------------------------|
| **Суть** | Добавить бэкенд «Custom» с URL, вызывать POST /v1/chat/completions, парсить SSE | Включить llama-cpp-2 mtmd, загрузка mmproj, приём картинки, MTMD pipeline | Описать запуск llama-server и обходы |
| **Время** | Средне | Долго | Быстро |
| **Риск** | Низкий | Средний (сборка, форматы) | Нет кода |
| **Vision без Ollama** | Да (llama-server/Llamafile) | Да (в бинарнике) | Только вручную |
| **Рекомендую** | ✅ | Опционально позже | ❌ |

**Рекомендация: A** — добавить бэкенд «Custom URL» (OpenAI-compatible). Пользователь запускает `llama-server -m ... --mmproj ...` или Llamafile с vision и вводит URL (например `http://127.0.0.1:8080`). Приложение не зависит от Ollama, Vision без Ollama достигается за счёт любого сервера с OpenAI-совместимым API.

**Дополнительно на будущее**: Решение B (native + mtmd) даёт полностью встроенный Vision без внешнего процесса; имеет смысл как отдельная фича (feature `native-llm-mtmd`, UI для mmproj и загрузки изображений).

## Реализация (решение A)

1. **Настройки**: `llm_backend`: `"ollama" | "native" | "custom"`, при `custom` — поле `customLlmUrl` (например `http://127.0.0.1:8080`).
2. **Новый модуль** (например `openai_compat.rs` при feature `ollama`): функция `stream_chat(base_url, model, messages, system, temperature, max_tokens, on_token)` — POST `{base_url}/v1/chat/completions`, body в формате OpenAI, разбор SSE-стрима, вызов `on_token` для каждого `choices[0].delta.content`.
3. **commands**: при `llm_backend == "custom"` вызывать этот клиент вместо Ollama; модель можно брать из `ollamaModel` или нового поля `customLlmModel` (многие серверы принимают имя модели в теле запроса).
4. **Frontend**: В настройках добавить выбор «Custom (OpenAI API)» и поле URL (и при необходимости имя модели).
