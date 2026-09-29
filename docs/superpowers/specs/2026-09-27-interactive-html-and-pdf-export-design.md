# Interactive HTML and PDF export design

**Date:** 2026-09-27
**Status:** Approved (the user delegated remaining choices to the recommended options)
**Depends on:** arrow routing slice 1 (`docs/superpowers/specs/2026-09-27-arrow-routing-design.md`), which provides arrow corner points.

## 1. Goal

Share a project so others can explore it at high fidelity, and print or zoom it without blur.

**Two new exports:**
- **Interactive HTML:** a single read-only file. People can pan and zoom, click a step to see its details, switch boards, and toggle the critical path and flags.
- **PDF:** one landscape paper page per board, drawn as vector shapes with real text. It prints cleanly and stays sharp when zoomed.

**Why a new renderer:**
- PNG blurs when zoomed.
- The current SVG export wraps HTML in `foreignObject`. Word, PowerPoint, Illustrator and Figma often show that blank, and svg2pdf.js cannot draw it.

## 2. Export menu and content

**The menu:** the top bar export menu keeps PNG, SVG and JSON, and adds "Interactive HTML" and "PDF". SVG, and PNG drawn from that SVG, come from the same vector renderer, so they no longer wrap HTML in `foreignObject`.

**What each file contains:**
- **Scope:**
  - Both new exports cover whole boards and ignore the selection.
  - HTML includes every board.
  - PDF has one page per non-empty board, in board order.
  - If every board is empty, the export shows the existing "The board is empty." error.
- **Theme:** the PDF is always light. The HTML follows the viewer's `prefers-color-scheme`.
- **Critical path:** the PDF shows it when it is on in the app at export time. The HTML lets the viewer toggle it.
- **Page header:** each PDF page starts with a small grey line reading "Project · Board · export date".
- **File names:** `<project-slug>.html` and `<project-slug>.pdf`, using the existing `slug` helper.

**Privacy:**
- Both files contain board content only: titles, notes, owners, durations, statuses, actors, lanes, groups, arrows, labels and flags. Chat history is never included.
- The HTML file makes no network requests. A `Content-Security-Policy` meta tag allows only inline script and style and `data:` fonts.

## 3. Vector renderer

A pure module turns a board into an SVG document string drawn to match the canvas.

**What it draws:**
- **Lanes:** bands with name labels.
- **Groups:** frames with titles.
- **Steps:**
  - Outlines come from `shapePath`, with the preset tint or custom hex fill and the same dark or light text rule (`inkOn`).
  - Each step carries its title, note, owner and duration, actor icon, status dot and flag badges.
- **Text nodes:** plain text.
- **Arrows:**
  - Corner points come from the arrow routing module, drawn with the app's corner radius, arrowheads and per-type dash style.
  - Labels sit on a background.
- **Critical path:** highlighted steps and arrows carry a `critical` class, so the HTML can toggle the highlight and the PDF can bake it in.

**Text:**
- Wrapping is measured with Inter through a canvas 2D context at the app's sizes, breaking at spaces and mid-word for long words (the app's `overflow-wrap: anywhere`).
- Titles get as many lines as fit their text box, ending in an ellipsis. This is the app's rule from the title-fit change.
- Each shape's text box (padding, the diamond's middle band, the database lid, the connector's fixed 3 lines, the sticky's top alignment) is defined once in a TypeScript table.
- A browser test renders every shape in the real app and asserts that the renderer's line breaks and text boxes match the DOM.

**Colours:** read from the app's CSS variables at export time. The light set feeds the PDF. Both sets feed the HTML as CSS variables.

**Icons:** the same lucide icons the app uses, drawn as SVG paths.

**Escaping:** all board text is escaped as it is written into SVG. Titles such as `</script>` or `<img onerror=...>` render as text.

## 4. Interactive HTML

**One file contains:**
- inline CSS with light and dark palettes;
- Inter (latin and latin-ext variable woff2, about 180 KB as base64);
- one SVG per board;
- a JSON block of step details, with every `<` escaped as `<`;
- the viewer script.

**What the viewer does:**
- **Pan and zoom:**
  - Pan by drag, zoom with the mouse wheel and pinch.
  - Zoom in, zoom out and fit buttons, and the keys `+`, `-` and Shift+1.
  - It opens fitted to the first board.
- **Board tabs:** in board order. Switching boards re-fits the view.
- **Step details:**
  - Clicking a step opens a side panel with its title, actor, owner, duration, status, note and every flag (kind, text, resolved).
  - Escape or a click on empty space closes it.
- **Toggles:**
  - "Critical path" highlights it and dims the rest, as in the app.
  - "Flags" shows or hides the badges.

**Build and budget:**
- The viewer is plain TypeScript with no framework, compiled at build time into a string the builder inlines. It must stay under 15 KB minified.
- A 200-step project must open and show its first board in under 1 second.

## 5. PDF

**Libraries:**
- `jspdf` and `svg2pdf.js` (MIT) are installed with `sfw`.
- They are dynamically imported only when PDF export runs, so the main bundle does not grow. A build check enforces this.
- Their APIs are verified against their sources during planning.

**Pages:**
- Letter landscape (792×612 pt) when the browser language region is US or CA, otherwise A4 landscape (842×595 pt).
- Margins are 36 pt, with the header line at the top.
- The board is scaled to fit the remaining area and centred, and never drawn larger than 1 CSS px to 1 pt.

**Fonts:**
- Inter Regular and SemiBold static TTF files, under the SIL Open Font License, are added to the repo with the licence. jsPDF cannot use woff2.
- Titles use SemiBold. Other text uses Regular. PDF text is real and selectable.

**File size:** measured in the PDF slice. If a one-board PDF exceeds 1 MB, font subsetting is evaluated as a follow-up.

**Errors and speed:**
- A failure shows the existing error toast, and no partial file is downloaded.
- The existing `exporting` state is shown while it runs.
- A 20-board project must export in under 5 seconds.

## 6. Structure

| Unit | Responsibility |
|---|---|
| `export/vector/textBoxes.ts` | Per-shape text box table |
| `export/vector/text.ts` | Measuring, wrapping, lines-that-fit |
| `export/vector/palette.ts` | Resolving light and dark colours from the theme |
| `export/vector/boardSvg.ts` | Board to SVG string |
| `export/html/viewer.ts` | Viewer script |
| `export/html/buildHtml.ts` | Assembling the HTML file |
| `export/pdf/buildPdf.ts` | Lazy libraries, pages, header, fonts |
| `export/paper.ts` | Paper size from locale, fit arithmetic |
| `io/download.ts` | Existing: saving the file |
| Top bar export menu | Two new items calling the builders |

## 7. Build order

Starts after arrow routing slice 1.

1. **Renderer:** `textBoxes`, `text`, `palette`, `boardSvg`, and the fidelity test against the app.
2. **HTML:** viewer and builder. Then a human playtest.
3. **PDF:** libraries, fonts, pages, and the size measurement.
4. **Wrap-up:** ADRs (one vector renderer for exports; lazy-loaded PDF libraries), README, full verification.

## 8. Testing

**Unit:**
- Wrapping and lines-that-fit.
- The board SVG contains every step, arrow, lane, group and flag.
- Hostile text is inert in the SVG and the JSON.
- Paper size from locale, and the fit arithmetic.

**Browser:**
- **Fidelity:** renderer line breaks and text boxes match the app for every shape.
- **HTML file:**
  - pan and zoom;
  - tabs;
  - details panel;
  - both toggles;
  - no network requests;
  - opens a 200-step project in under 1 second.
- **PDF:** page count, page size, and embedded text strings.
- **Bundle:** the main bundle does not grow.

**Human playtests:** after the HTML slice and at the end.

## 9. Out of scope

- Editing in the HTML file.
- Tiled multi-page PDFs.
- Choosing the paper size by hand.
