# Model configuration

## Entry point

- Opened from the bottom-left account menu, never from the page header.
- The composer's model selector is the only place the active model is shown.
- Saving a model with "设为默认" immediately updates the composer selector.

## Providers

Support exactly two providers in this phase:

| Provider | Default base URL | Suggested models |
|----------|------------------|------------------|
| OpenCode Go | `https://opencode.ai/zen/go/v1` | `deepseek-v4.1-flash`, `deepseek-v4-pro`, `kimi-k3`, `glm-5.3`, `mimo-v2.5-pro` |
| DeepSeek 官方 | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-reasoner` |

- Base URL and model ID remain editable; the model list is a suggestion, not a hard limit.
- Provider cards show the default endpoint. One config per provider; saving again updates it.
- The display name is optional and defaults to the model ID.

## Form

- Provider radio cards, API Key (password with reveal), Base URL, model ID (datalist), display name,
  and "设为对话默认模型".
- Validate API Key, Base URL (`http/https`), and model ID before saving.
- Configured models list: provider, model, masked key, default badge, missing-key warning, and
  set-default / edit / remove actions.
- Empty state explains that the composer model selector is disabled until a model is configured.

## Security

- Demo only: API Key lives in the current tab's `sessionStorage`; metadata lives in `localStorage`.
- Never put plaintext API keys in `localStorage`, logs, or rendered text. Lists show a masked key.
- Production must store an encrypted key server-side (`model_configs.encrypted_api_key`) and keep the
  browser from holding plaintext.
- Missing keys after a new browser session are shown as "密钥缺失"; the user must re-enter them.

## Layout

- Right drawer 600px on desktop, full width on mobile. Fixed header/footer, scrollable body.
- Provider cards stack below `sm`.
- Focus trap, Escape to close, focus returns to the account menu trigger.

## Anti-patterns

- Editing model settings in the top header.
- Hiding which endpoint or model ID is active.
- Treating a session-only key as permanent configuration.
