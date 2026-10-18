# Design panel sources

These files are the editable sources for the Impeccable panel's fixed `.impeccable/design.json` interface. The generated snapshot remains byte-compatible with the existing panel. Site design rules remain authoritative in [DESIGN.md](../../DESIGN.md).

| Task | Source |
| --- | --- |
| Snapshot metadata and ordered example inventory | [metadata.json](metadata.json) |
| Color, shadow, motion, breakpoint and typography metadata | [extensions.json](extensions.json) |
| Overview, principles and usage rules | [narrative.json](narrative.json) |
| Individual rendered examples | [components/](components/) |

Edit the relevant source, then run `pnpm generate:design`. Check for drift with `pnpm check:design`; CI runs this check. Do not hand-edit the assembled `.impeccable/design.json` file or mark these source files as generated.

When using Impeccable's document command, reconcile any newly extracted snapshot content into these sources and regenerate before committing. Preserve example order through `metadata.json`; each example keeps its HTML and CSS together so a visual change has one edit location.
