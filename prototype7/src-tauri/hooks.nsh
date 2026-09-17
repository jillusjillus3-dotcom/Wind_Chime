!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext current

  ; Desktop shortcuts
  Delete "$DESKTOP\prototype7.lnk"
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAIN_BINARY_NAME}.lnk"

  ; Start Menu shortcuts
  Delete "$SMPROGRAMS\prototype7.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\prototype7\prototype7.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS\prototype7"
  RMDir "$SMPROGRAMS\${PRODUCTNAME}"

  SetShellVarContext all

  ; Desktop shortcuts (All Users)
  Delete "$DESKTOP\prototype7.lnk"
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAIN_BINARY_NAME}.lnk"
  Delete "$COMMONDESKTOP\prototype7.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$COMMONDESKTOP\${MAIN_BINARY_NAME}.lnk"

  ; Start Menu shortcuts (All Users)
  Delete "$SMPROGRAMS\prototype7.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\prototype7\prototype7.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS\prototype7"
  RMDir "$SMPROGRAMS\${PRODUCTNAME}"
!macroend