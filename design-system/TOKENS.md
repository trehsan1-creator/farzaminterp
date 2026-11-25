# Design Tokens

All UI implementations must use the canonical custom properties in tokens.css. Framework-specific variables may alias these tokens but must not redefine their meaning.

## Color roles
| Role | Value | Use |
|---|---|---|
| Brand navy | #102333 | Brand anchor, navigation, high-emphasis headings |
| Brand blue | #4472F6 | Primary action, active state, focus, links |
| Brand orange | #FF3F1F | Rare emphasis and selective highlights |
| Brand purple | #3C2C7B | Restrained PIP/AI accent |
| Background | #F7F9FC | Main app canvas |
| Surface | #FFFFFF | Cards, menus, forms, tables |
| Border | #E5EAF0 | Dividers and component boundaries |
| Secondary text | #64748B | Supporting labels and metadata |

### Color rules
- Use semantic tokens for success, warning, danger, info, and neutral states.
- Never use orange as a substitute for danger; reserve red for destructive/error states.
- Avoid large saturated blocks and decorative gradients in operational finance screens.
- Check contrast for every real component state.
- Status labels must include text or an accessible icon; never rely on color alone.

## Spacing and shape
Use a 4px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px. Prefer 16–24px content padding on desktop and 12–16px on mobile.
- Small controls: 6px radius.
- Inputs and standard cards: 10px radius.
- Larger panels: 14–16px radius.
- Pills are for compact status tags only.
- Use borders first; shadows communicate layering, not decoration.

## Density
Use compact but breathable density. Standard controls should be approximately 44px high. Table rows are usually 48–56px. Dense mode is allowed only if touch usability and legibility remain acceptable.

## Layout and motion
Use content-driven responsive CSS. Fixed widths are acceptable only for desktop navigation rails and bounded overlays, with mobile adaptations. Use short purposeful transitions. Avoid animated counters, parallax, continuous pulsing, and attention-grabbing motion. Respect reduced-motion preferences.
