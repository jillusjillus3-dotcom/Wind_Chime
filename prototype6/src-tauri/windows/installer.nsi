; Wind Chime - Custom NSIS installer
; Desktop shortcut removed.

!macro NSIS_HOOK_POSTINSTALL
  ; Remove any desktop shortcut created by the installer.
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAINBINARYNAME}.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAINBINARYNAME}.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$COMMONDESKTOP\${MAINBINARYNAME}.lnk"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAINBINARYNAME}.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAINBINARYNAME}.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$COMMONDESKTOP\${MAINBINARYNAME}.lnk"
!macroend