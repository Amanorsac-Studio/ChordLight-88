; Amanorsac Studio — Installer & Packaging Standard, the parts NSIS controls.
; Included by electron-builder into its assisted (non-one-click) installer.

; §3.1 — a standalone lives in Program Files\Amanorsac Studio\<Product>\.
; P13 — the buyer can still change it on the directory page.
!macro preInit
  SetRegView 64
  StrCpy $INSTDIR "$PROGRAMFILES64\Amanorsac Studio\${PRODUCT_NAME}"
!macroend

!macro customHeader
  ; P17 / P21 / P22 — first page: what it is, that a key will be asked for and
  ; where it is, and the one permission prompt, explained.
  !define MUI_WELCOMEPAGE_TITLE "${PRODUCT_NAME} ${VERSION}"
  !define MUI_WELCOMEPAGE_TEXT "An 88-key MIDI display that lights the notes you play, names the chord, and reads the Nashville number in your key.$\r$\n$\r$\nWhen it first opens it asks for your licence key — it is under My Apps at amanorsac.studio. One key covers two computers.$\r$\n$\r$\nWindows will ask once for permission — that is to place the application in Program Files, nothing else.$\r$\n$\r$\nAmanorsac Studio · amanorsac.studio"

  ; P15 — the last page says exactly what went where, in text that can be
  ; selected and copied.
  !define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} is installed"
  !define MUI_FINISHPAGE_TEXT "Application$\r$\n$INSTDIR\${PRODUCT_NAME}.exe$\r$\n$\r$\nYour settings and recordings$\r$\n$DOCUMENTS\Amanorsac Studio\${PRODUCT_NAME}\$\r$\n$\r$\nUninstalling never touches that folder.$\r$\n$\r$\nWhat next: open Chordlight 88 and enter the key from My Apps at amanorsac.studio.$\r$\n$\r$\nLicence · amanorsac.studio/legal   Privacy · amanorsac.studio/privacy$\r$\nSupport · hello@amanorsac.studio"
!macroend
