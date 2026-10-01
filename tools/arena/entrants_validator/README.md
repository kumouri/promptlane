# The entrants validator, vendored

`validate_entry.py` here is a byte-for-byte copy of `tools/validate_entry.py` in
[kumouri/jamobair-entrants](https://github.com/kumouri/jamobair-entrants) (private) — the file its
`validate` check runs on every pull request. Elysium runs this copy on every web submission
(`../validator.mjs`), so the web and GitHub apply one set of rules.

Pinned: blob `d746b0227183e6cf36de99bd7183cb1cd8a7bc99`, from entrants `main` at `615d140`.

**Why a copy, not a fetch.** Anyone who can merge to the entrants repo could change a fetched
validator, and the arena would then run their code on its host. The arena checks the upstream
file's blob sha on every sync and every web write instead. While the sha differs from the pinned
one, web submissions answer 503 and `/admin` → *Teams* shows the difference. Pull requests keep
working throughout.

**Re-vendor** after reading the upstream change:

```sh
gh api 'repos/kumouri/jamobair-entrants/contents/tools/validate_entry.py?ref=main' \
  -H 'Accept: application/vnd.github.raw' > tools/arena/entrants_validator/validate_entry.py
git hash-object tools/arena/entrants_validator/validate_entry.py   # the new blob sha
```

Put the new sha and commit in the *Pinned* line above (`test_teams.mjs` holds the two together),
run `npm run test:arena`, then merge and restart the arena. If the rules changed, the parity tests
in `test_teams.mjs` show where the sync's JavaScript port (`../prompts.mjs`) must follow.
