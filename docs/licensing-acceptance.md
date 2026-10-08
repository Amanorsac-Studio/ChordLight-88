# Licensing acceptance report — Chordlight 88

License Integration Standard §9, A1–A12. Run against the LIVE server with the
RELEASE build and a real key from My Apps. Fill every line; send with the build
(Master Standard §10, item 3). Machine-state folder on Windows:
`%LOCALAPPDATA%\Amanorsac Studio\Chordlight 88\`.

| # | Check | Expected | Result | Who / when |
|---|---|---|---|---|
| A1 | Fresh machine (delete the folder above), open the app | Activation screen | | |
| A2 | Enter `CHRD-0000-0000-0000` | "not one of ours" message; nothing stored | | |
| A3 | Enter the real key | Main interface appears without reopening; `license-proof.dat` exists | | |
| A4 | Open My Apps | This machine listed, labelled with the computer name | | |
| A5 | Quit, disconnect the internet, reopen | Main interface; no error | | |
| A6 | Reconnect, wait an hour or restart | My Apps shows a fresh "last seen" | | |
| A7 | Remove this device in My Apps, restart | App re-activates, device reappears | | |
| A8 | Fill both seats with two other device ids (curl, §9), then activate | "Both of this key's computers are in use (…)" | | |
| A9 | About › Deactivate this device | Activation screen; key and proof files gone; device gone from My Apps | | |
| A10 | Bundles only | n/a — single product | n/a | |
| A11 | Release build contains the §5 key and no other | `cd a5 7d 1c c8 a6 e2 71` once in app.asar (text form, see docs/decisions.md) | | |
| A12 | Release build's default URL | `amanorsac.studio`; no `127.0.0.1` or `localhost` in the licence path | | |

Key tested against: `____-____-____-____`   Build: `Chordlight88-2.0.6-Windows.exe` / `-macOS.dmg`

Tools: `node scripts/verify-proof.mjs '<proof>'` checks a proof by hand with the studio key.
