!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext current

  ; Desktop shortcuts
  Delete "$DESKTOP\Qi-Bell.lnk"
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAIN_BINARY_NAME}.lnk"

  ; Start Menu shortcuts
  Delete "$SMPROGRAMS\Qi-Bell.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\Qi-Bell\Qi-Bell.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS\Qi-Bell"
  RMDir "$SMPROGRAMS\${PRODUCTNAME}"

  SetShellVarContext all

  ; Desktop shortcuts (All Users)
  Delete "$DESKTOP\Qi-Bell.lnk"
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAIN_BINARY_NAME}.lnk"
  Delete "$COMMONDESKTOP\Qi-Bell.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$COMMONDESKTOP\${MAIN_BINARY_NAME}.lnk"

  ; Start Menu shortcuts (All Users)
  Delete "$SMPROGRAMS\Qi-Bell.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  Delete "$SMPROGRAMS\Qi-Bell\Qi-Bell.lnk"
  Delete "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS\Qi-Bell"
  RMDir "$SMPROGRAMS\${PRODUCTNAME}"
!macroend