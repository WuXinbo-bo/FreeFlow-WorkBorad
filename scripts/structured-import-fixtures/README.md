# Formatted clipboard regression coverage

The fixtures contain synthetic content only. They cover article selections,
merged tables and partially selected highlighted code.

| Issue | Expected behavior |
| --- | --- |
| FF-01 Code copy button | Emit HTML and plain text; retain code language and whitespace when pasted as a canvas code element. |
| FF-02 Table geometry | Preserve row/column spans and account for occupied columns. |
| FF-03 Text styling | Retain supported color, highlight, font family, explicit size, emphasis and paragraph alignment. |
| FF-04 Partial selections | Retain available code/table wrappers; recover recognizable orphan row/cell and code-token fragments. |
| FF-05 Selection completeness | Import the entire selected fragment without running article extraction. Explicit web-page imports retain article extraction. |
| FF-06 Clipboard identity | Only matching copy identity permits internal element reuse; identical external text cannot restore stale elements. |
| FF-07 Import lifecycle | Capture data during the native event, serialize commits, and invalidate pending work on undo, redo, board replacement or unmount. New work must proceed before cancelled work finishes. |
| FF-08 Focus and editor recovery | Preserve selected rich/code content on copy and drag; avoid stale paste after editor exit/reopen; route native paste to a focused canvas despite a lingering external DOM selection. |

Run the development server before standalone browser checks:

```sh
npm run start:web
npm run test:clipboard-fidelity
npm run test:clipboard-native
```

Set `CANVAS_TEST_URL` to the development canvas URL if it differs from the
scripts' default. Set `FREEFLOW_TEST_BROWSER_CHANNEL` to `chrome` or `msedge`
to use an installed browser; otherwise Playwright Chromium is used.

The controlled suite checks paste, drop and menu entry points, unsupported MIME
fallback, permission recovery, five consecutive pastes and undo/redo, delayed
imports cancelled by undo/board replacement, repeated editor exit/reopen,
selection copying, serialization restoration and explicit text conversion.
It is included in `npm test`.

The separate native suite exercises real keyboard and mouse input and the real
system clipboard. Avoid copying other content while it runs. Readable original
clipboard items are retained only in memory and restoration is attempted on exit.

External applications can provide plain text without HTML or structural metadata.
FreeFlow cannot reconstruct missing source formatting reliably. Ambiguous text
can explicitly be converted to code; text with tab-separated columns can be
converted to a table, with undo/redo support. Arbitrary web CSS, embedded widgets
and all Word/Excel/WPS-specific formats are outside these fixtures. Native Office
application interoperability still requires manual checks with those applications.
