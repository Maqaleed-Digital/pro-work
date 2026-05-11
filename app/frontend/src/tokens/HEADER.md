# `app/frontend/src/tokens/` — Replicated Maqaleed Design Tokens

**Status:** Local replication per Sponsor decision B-extra (2026-05-11).
**Canonical source:** `/Users/waheebmahmoud/dev/credito-platform/packages/design-tokens/src/`
**Authority:** UX-G1-TOKENS V1.1.1 — RATIFIED 2026-05-09 by Sponsor Waheeb Ghassan Mahmoud.
**Window:** Constitutional Launch Window active D15→D15+41 (~2026-05-16 → 2026-06-26).

## Files

| File | Origin | Discipline |
|---|---|---|
| `colour.css` | canonical V1.0 §3 + V1.1.1 §3.6–§3.8 (23 additive properties) | byte-identical to canonical; anti-mutation per V1.1.1 §10 |
| `typography.css` | canonical V1.0 §4 (IBM Plex Sans Arabic / Sans / Mono) | byte-identical |
| `spacing.css` | canonical V1.0 §5 | byte-identical |
| `motion.css` | canonical V1.0 §6 (incl. `prefers-reduced-motion`) | byte-identical |
| `iconography.css` | canonical V1.0 §7 | byte-identical |
| `elevation.css` | canonical V1.1.1 §3.4 (new) | byte-identical |
| `radius.css` | canonical V1.1.1 §3.5 (new; binding 4/8/12/16 px) | byte-identical |
| `index.css` | NEW — local aggregator + zones-wc.css import | WC-local (does not exist in canonical) |
| `zones-wc.css` | NEW — Nitaqat zone palette, WC-specific additive layer | WC-namespaced (`--maq-wc-zone-*`) per PROPOSAL §5.3 |

## Anti-mutation binding

Per UX-G1 V1.1.1 §10 (Backwards Compatibility / Anti-Mutation Discipline):
- No V1.0 / V1.1.1 CSS custom property is removed or renamed in the replicated copies
- No value is changed
- File diff between canonical and this local replication must show byte-identical content for files 1–7
- WC-local additions live exclusively in `zones-wc.css` under the `--maq-wc-*` namespace

## Post-window extraction TODO

After D15+41 (~2026-06-26):
1. Extract canonical token consumption into a shared package (npm workspace or private package) consumable by `credito-platform`, `prowork`, `societa`, `s2ppro`, `veticare`.
2. Re-evaluate `zones-wc.css` for promotion to canonical G1 (if Nitaqat colour concept is portfolio-useful) or retain as WC-local.
3. Remove this directory in favour of the shared package import.
4. Decision Log entry recording the extraction.

## Verification

Re-replicate at any point with:

```sh
diff -q /Users/waheebmahmoud/dev/credito-platform/packages/design-tokens/src/{colour,typography,spacing,motion,iconography,elevation,radius}.css \
        /opt/prowork/app/frontend/src/tokens/
```

Expected output: zero diffs on the 7 canonical files.
