!macro customInstall
  SetShellVarContext current
  Delete "$DESKTOP\prototype6.lnk"
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAIN_BINARY_NAME}.lnk"
  
  SetShellVarContext all
  Delete "$DESKTOP\prototype6.lnk"
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAIN_BINARY_NAME}.lnk"
  Delete "$COMMONDESKTOP\prototype6.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$COMMONDESKTOP\${MAIN_BINARY_NAME}.lnk"
!macroend
