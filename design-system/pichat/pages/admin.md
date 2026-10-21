# Admin pages override

> Overrides `design-system/pichat/MASTER.md` for `/knowledge`, `/knowledge/[id]`, and `/permissions`.

## Scope

Knowledge base management and document-level permissions. Chat keeps its own layout and density.

## Layout

- Sidebar: 280px, shared with chat. Top-level switch: `对话 / 管理`.
- Manage nav: 知识库, 文档权限, 成员与组, 审计日志.
- Topbar: 56px, breadcrumb, theme toggle, current user.
- Content: max-width 1200px, padding 16 / 24 / 32. Page header above a stats strip and table.
- Mobile: sidebar drawer; tables switch to cards below 1280px because the 280px sidebar reduces the usable width. No horizontal page scroll.

## Density 7 (admin)

| Token | Value |
|-------|-------|
| Row height | 48–52px desktop, card rows on mobile |
| Table text | 13px, header 11px medium uppercase tracking |
| Body text | 14px / 1.5 |
| Page title | 24px / 1.2, 600 |
| Section gap | 24px |
| Card padding | 16–20px |

Keep the Swiss style: white surfaces, 1px borders, no heavy shadows, one accent per view.

## Tables

- Container: 1px border, 12px radius, white surface. Header surface-2, 11px text.
- Checkbox column 40px. Row hover surface-2/60. Selected row accent-soft.
- Actions are icon buttons with accessible names; never hover-only.
- Status is icon + text + color; never color alone.
- Mobile cards show the same fields and actions; do not shrink the table into a horizontal scroll.
- Sortable columns use `aria-sort` and a visible sort affordance.
- Footer shows count and active filters; no pagination until a table exceeds 50 rows.

## Drawers and dialogs

- Right drawer 560px desktop, full-width mobile. Fixed header/footer, body scrolls.
- `role="dialog"`, `aria-modal`, labelled title, Escape closes, focus moves in and returns to the trigger.
- Dirty form close asks before discarding.
- Destructive confirmation: danger button, impact summary, typing the resource name when deleting a non-empty knowledge base.
- Bulk permission changes show the affected document count and approximate people count before applying.
- Toast confirms saves: `权限已更新，下一次提问生效`.

## Permission semantics shown in UI

- Knowledge base default access applies to every document in that KB.
- Document exceptions add `read` or `deny`; deny always wins.
- Effective access counts regular users only. Tenant admins can read everything via role override and are
  shown as a separate note, not counted as audience.
- Removing a read grant may not remove access if the user still matches the KB default or another
  group; the UI must warn.
- Access check explains the path: knowledge base default, document exception, explicit deny, or
  tenant-admin override.
- No implicit widening: new knowledge bases start without default access and are only readable by
  tenant admins until a default or document exception is set.

## Directory (members and groups)

- Members and groups are read-only IdP sync; never offer local membership editing in this phase.
- Show the sync source, last sync time, and a clear "read-only" note.
- Member rows show role, groups, status, effective readable document count, and last activity.
- Effective readable count uses the ACL policy and excludes tenant admins from audience counts.
- A member drawer explains groups, document access, and sync source without edit controls.
- A group drawer lists active members and warns when a group has zero members. Document ACLs live in
  文档权限, not in the group page.
- Role changes are not offered until the member sync API exists. If added later, they must be audited.

## Audit

- Read-only, newest first. Filters: free text, action, result.
- Results use icon + text: success, denied, failed. Never color alone.
- Table columns: time, actor, action, resource, result, detail.
- Detail drawer shows summary, resource, actor, metadata key/value pairs, event id, and a read-only note.
- Admin actions append events to the mock event stream; production writes them server-side.
- Failed and denied events stay visible; do not filter them out by default.

## Status system

| Status | Tone | Label |
|--------|------|-------|
| pending | neutral | 排队中 |
| parsing | warning | 解析中 |
| ready | success | 可检索 |
| failed | danger | 解析失败 |
| deleted | neutral | 已删除 |

Status badges use an icon plus text. Failed documents expose retry; parsing documents are not
retrievable.

## Empty / error / loading

- Empty knowledge list: one sentence + 新建知识库.
- Empty documents: upload CTA + explain parsing.
- No filter results: clear filters action.
- No access: explain default deny and link to 文档权限.
- Table loading: skeleton rows, not a page spinner.
- Errors: inline banner with retry; preserve filters.

## Anti-patterns

- Permission matrix (documents × people) as the primary editor.
- Showing only group names without effective member counts.
- Mixing allow and deny in one undifferentiated list.
- Destructive bulk actions without impact preview.
- Implying tenant-admin read access counts as audience.
- Hiding unavailable nav items without explanation.
