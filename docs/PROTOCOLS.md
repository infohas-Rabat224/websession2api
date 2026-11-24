# API Protocol & Capability Specification

## OpenAI-Compatible API (`http://127.0.0.1:8787/v1`)

- `GET /v1/models`: Returns all registered aliases (`deepseek-web`, `glm-web`, `kimi-web`, `qwen-web`, `claude-web`, `chatgpt-web`, `gemini-web`) and `websession/*` prefixed aliases along with live availability and capability metadata.
- `POST /v1/chat/completions`: Supports `messages` (`system`, `developer`, `user`, `assistant`, `tool`), `stream: true` (SSE `data: {...}` + `data: [DONE]`), `max_tokens`, `temperature`, `top_p`, `stop`, and `tools` (when the target provider supports native tool calling).

## Anthropic-Compatible API (`http://127.0.0.1:8787`)

- `POST /v1/messages`: Supports `system`, `messages` (string or content block arrays), `max_tokens`, `stream: true` (Anthropic SSE events `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`), `stop_sequences`, and `tools`.
- `POST /v1/messages/count_tokens`: Returns `{ "input_tokens": <number> }`.

## Explicit Capability & Parameter Enforcement

- Unsupported parameters (e.g. OpenAI `n > 1`, `logprobs`, `audio`, unknown keys, or Anthropic `thinking`) are **explicitly rejected** (`400` / `422`) instead of silently discarded.
- Sending `tools[]` or `tool_result` blocks to a text-only Browser Session provider returns `HTTP 422 UNSUPPORTED_CAPABILITY`. WebSession2API never pretends plain chat text is a structured tool call.
- Active conversations (`conversation_id` / `user_id`) remain pinned to their initial provider and never silently switch providers mid-conversation.
