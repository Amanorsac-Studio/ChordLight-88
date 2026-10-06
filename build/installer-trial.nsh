; Amanorsac Studio — Installer & Packaging Standard, the parts NSIS controls.
; Chordlight 88 Free Trial: same pages as the full installer, trial wording.

; §3.1 — Program Files\Amanorsac Studio\<Product>\, beside the full version.
!macro preInit
  SetRegView 64
  StrCpy $INSTDIR "$PROGRAMFILES64\Amanorsac Studio\${PRODUCT_NAME}"
!macroend

!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "${PRODUCT_NAME} ${VERSION}"
  !define MUI_WELCOMEPAGE_TEXT "An 88-key MIDI display that lights the notes you play, names the chord, and reads the Nashville number in your key.$\r$\n$\r$\nThis is the free trial: every feature for 7 days from the first time you open it, with recordings up to 1 minute. After 7 days it locks until you get the full version at amanorsac.studio. No account, no card.$\r$\n$\r$\nWindows will ask once for permission — that is to place the application in Program Files, nothing else.$\r$\n$\r$\nAmanorsac Studio · amanorsac.studio"

  !define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} is installed"
  !define MUI_FINISHPAGE_TEXT "Application$\r$\n$INSTDIR\${PRODUCT_NAME}.exe$\r$\n$\r$\nYour settings and recordings$\r$\n$DOCUMENTS\Amanorsac Studio\Chordlight 88\$\r$\n$\r$\nUninstalling never touches that folder, and the full version picks them up.$\r$\n$\r$\nThe 7-day trial starts the first time you open it.$\r$\n$\r$\nLicence · amanorsac.studio/legal   Privacy · amanorsac.studio/privacy$\r$\nSupport · hello@amanorsac.studio"
!macroend
