# Release-readiness checklist

This checklist does not authorize merging, store uploads, account changes, fees, legal acceptance or publication.

## Review this hardening slice

- [ ] Review strict HTTP(S) validation and the unchanged order/duplicate behavior.
- [ ] Review the conservative **50 URLs per open command** limit and **1,048,576 UTF-16 code units** text limit. Large batches are rejected wholly, never silently truncated. These limits bound accidental tab storms and parsing work; they are not browser limits. Changing them is a deliberate product decision.
- [ ] Review error visibility through a pinned icon's badge/tooltip and rejection of extra in-flight shortcuts. No popup or new permission is introduced.
- [ ] Run `npm run check` and `npm run package` on the exact commit being reviewed.
- [ ] Confirm the ZIP contains exactly the four runtime files and can be loaded after extraction.
- [ ] Check CI for that exact commit. This repository has no CI workflow in this slice; local checks are not a green CI result.

## Manual browser acceptance before distribution

Use a fresh test profile, synthetic clipboard contents and local test web pages. Do not use personal browser tabs or clipboard data.

- [ ] Load unpacked with no extension errors on minimum-supported Chrome 116 and current stable Chrome. Confirm that all four existing permissions are justified.
- [ ] Verify Alt+V/Alt+C are assigned and actually work on each supported operating system; document OS/browser conflicts and custom shortcut assignment.
- [ ] Open two valid URLs mixed with empty lines, invalid hosts, unsupported schemes and duplicates. Check tab order, inactive creation and filtering. Switch windows mid-batch and verify all tabs remain in the starting window.
- [ ] Use two windows and verify Alt+C copies only HTTP(S) tabs from the focused window in order. Preload a nonempty synthetic clipboard, then verify that copying an empty-web-window replaces it with empty text.
- [ ] Test empty clipboard, clipboard denial/failure, and malformed input. Inspect the badge and tooltip; then retry successfully and confirm the badge clears.
- [ ] Test 50 valid URLs and 51 valid URLs. The former opens 50; the latter opens zero and explains how to split the batch. Test oversized text without opening tabs.
- [ ] Repeat shortcuts quickly, including copy during open. There must be no queued second batch or overlapping clipboard operation.
- [ ] Stop/restart the service worker and retry both commands with an already-existing offscreen document. Test offscreen creation failure/retry with a synthetic fault if available.
- [ ] Test a synthetic tab-creation failure partway through a batch; confirm the count and retry warning.
- [ ] Verify no clipboard contents, tab URLs or raw browser error details appear in logs.

## Separate release decisions and assets

- [ ] Confirm whether a store item or previously distributed package exists, then choose the appropriate next manifest version and product name.
- [ ] Add reviewed valid extension/store icons, screenshots, listing text and support contact.
- [ ] Review the README's factual privacy/permission explanation against the final code and prepare required store privacy disclosures. Do not claim that opening remote URLs makes no network requests.
- [ ] Review current Chrome Web Store requirements and any required public privacy/support URLs.
- [ ] Obtain explicit approval for any upload, submission, fees, new legal agreements or publication. Account/store access is separate from a draft code PR.

Official starting points: [publishing workflow](https://developer.chrome.com/docs/webstore/publish), [privacy disclosures](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [listing images](https://developer.chrome.com/docs/webstore/images).
