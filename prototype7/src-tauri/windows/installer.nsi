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

  ; Register application to launch automatically on Windows boot
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAINBINARYNAME}.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${MAINBINARYNAME}.lnk"
  Delete "$COMMONDESKTOP\${PRODUCTNAME}.lnk"
  Delete "$COMMONDESKTOP\${MAINBINARYNAME}.lnk"

  ; Remove auto-start registry key upon uninstallation
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
!macroend