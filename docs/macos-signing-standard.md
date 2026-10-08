# AMANORSAC STUDIO — macOS Code Signing & Notarisation Standard

Kept in the repo for the build workflow's sake; the studio's copy is the authority.
Summary of what this repo applies (see .github/workflows/build.yml):

- Developer ID Application identity imported into a keychain the job owns (6 h timeout,
  partition list set), from the org secrets MAC_CERT_P12 / MAC_CERT_PASSWORD (contents, never
  filenames; the .p12 rebuilt with `-macalg sha1 -legacy -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES`).
- Hardened runtime, secure timestamp, no get-task-allow; audio-input entitlement for the inputs.
- Notarised with the App Store Connect API key (ASC_KEY_P8 / ASC_KEY_ID / ASC_ISSUER_ID), status
  checked for "Accepted" explicitly, stapled, then `spctl --assess` as the verdict.
- Team ID SGQVTNFK4Q; certificates expire 2027-02-01.
- macOS runners cost ~10x: concurrency group on, and a public repo or tag-gated macOS jobs.
