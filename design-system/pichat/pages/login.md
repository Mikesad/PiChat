# Login page

## Layout

- Full-screen auth surface, no app shell. Split at `lg`: brand/value panel left, form card right.
- Left panel: subtle grid, brand mark, headline, three capability points, security note. Hidden on mobile.
- Right panel: 56px header with theme toggle, centered form card `max-w-sm`, footer note.
- Mobile: brand in the header, form card with 16px horizontal inset, no horizontal scroll.

## Form

- Visible labels for email and password; password has a show/hide control.
- Email uses `type="email"` and `autocomplete="email"`; password uses `autocomplete="current-password"`.
- Validate on submit, show an alert summary plus inline field errors, focus the first invalid field.
- Submit button shows a spinner and disabled state while authenticating.
- SSO is shown as disabled with an explicit "即将开放" label; never fake a successful SSO login.
- Demo note states that any valid email + any password signs in as tenant admin. Real OIDC replaces this.

## Account menu

- Bottom-left avatar opens a disclosure with `模型配置` and `退出登录`.
- Model config is available to tenant admins only.
- Logout opens a danger confirmation; confirming clears the session and returns to `/login`.
- Model configuration is preserved across logout and login.

## Anti-patterns

- Placeholder-only labels, hidden passwords without a toggle, or disabled buttons without explanation.
- Marketing claims that are not reflected in the product.
- External webfonts or emoji icons.
