# Copy Studio

Entry: `/studio.html`. Local preview remains at port 3012, with loopback-only preview login when explicitly enabled. Production remains authenticated. The complete legacy workbench is retained under Resources and Settings.

## Three workflows

- Batch: topic, direction, verified facts, brand and 3-10 pieces. Optional audience, objective and saved method.
- Imitation: paste a reference, then generate independent adaptations rather than copying wording or competitor facts.
- Research: compare 2-10 pasted samples with manually supplied performance context. Review common patterns, differences, testable hypotheses and missing evidence. Confirm and edit a candidate method before saving it to the existing method library for subsequent writing.

Research is stored per user. Saving a method uses the existing shared method-library permissions. This is retrieval and workflow improvement, not model training. Research does not automatically establish which methods caused better performance.

## Similarity

Studio jobs request semantic checking by default. Character-trigram comparison covers the existing bounded brand-history pool (150 content records, 150 drafts, 100 generation-history items), plus reference samples. Drafts are generated serially so later pieces include preceding results.

Creative review compares up to 20 selected samples, including references and closest text matches, with up to 1600 characters per sample. It evaluates angle, scene, viewpoint, structure, opening and ending; it is not exhaustive or a calibrated originality score. Brand names and essential product facts are not, alone, creative duplication.

High similarity or unavailable creative review triggers at most one rewrite and then re-evaluation. Unavailable review remains flagged, not passed. Manual edits are rechecked against both history and the original references when saved. Failed pieces can be retried. Old workbench tasks retain their original checking configuration.

## Testing

## Migrated Writing Skills

- Word count: choose approximately 100/200/300/500/800/1000 body characters. The request is stored with the job and reused for directed rewrites; it is a model target, not an exact character-count guarantee.
- Structure: analyze a reference into findings, evidence, cautions and editable rules. Explicitly select whether the structure applies to the current creation. Saving reusable rules requires a selected brand.
- Comments: paste real comments after selecting a brand. Candidate quotes that cannot be matched verbatim in the source are removed and flagged. Hypotheses still require human validation.
- Expression: analyze historical brand copy and confirm language/voice rules. Existing brand profiles and their historical samples remain intact. Confirmed knowledge is brand-scoped and reused in generation and rewriting, not treated as verified product facts.
- Directed rewrite: enter per-piece instructions. Revision and status locks prevent conflicting edits. Rewrites are checked against references, same-brand history and other pieces; failures preserve the current body. The original generated body is retained.

Knowledge is stored in `brand_writing_knowledge`, with source, AI result, confirming user, approval flag and revision. Only approved records are used automatically; the latest eight approved records for that brand are retrieved. Owners may revise with version checks or remove records. Approved rules are shared within a brand, consistent with the existing shared brand workspace, while pending analyses remain private to their creator. This is application knowledge retrieval, not model fine-tuning or guaranteed performance improvement.

Browser verification for these skills: `node tests/skills-smoke.js` with Playwright configured. Tests use mocked AI results.

`npm run check`, `npm test`, and `node tests/studio-smoke.js` (requires Playwright). Browser fixtures validate UI and request contracts, not actual paid model results or downstream conversion performance.

No production deployment is performed as part of local testing. Unsaved edits and research forms should be saved before closing the page.
