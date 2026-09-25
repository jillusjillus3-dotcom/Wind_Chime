!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext current

  ; Desktop shortcuts
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAIN_BINARY_NAME}.lnk"

  ; Start Menu shortcuts
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCTNAME}"

  SetShellVarContext all

  ; Desktop shortcuts (All Users)
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAIN_BINARY_NAME}.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$COMMONDESKTOP\${MAIN_BINARY_NAME}.lnk"

  ; Start Menu shortcuts (All Users)
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCTNAME}"
!macroend