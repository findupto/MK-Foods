; MK Foods POS custom Windows installer integration.
; Tauri's NSIS installer already creates the Start Menu shortcut and
; standard uninstall registry information. This hook adds application
; registry information and asks about optional shortcuts after install.

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Version" "2.0.0"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Publisher" "MK Foods"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "DisplayName" "MK Foods POS"

  ; Relative jumps avoid NSIS MessageBox label parsing issues.
  MessageBox MB_YESNO|MB_ICONQUESTION "Create a desktop shortcut for MK Foods POS?" IDYES +2
  Goto mk_ask_startup
  CreateShortCut "$DESKTOP\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

mk_ask_startup:
  MessageBox MB_YESNO|MB_ICONQUESTION "Start MK Foods POS automatically when Windows starts?" IDYES +2
  Goto mk_ask_quicklaunch
  CreateDirectory "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
  CreateShortCut "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

mk_ask_quicklaunch:
  MessageBox MB_YESNO|MB_ICONQUESTION "Create a Quick Launch shortcut for MK Foods POS?" IDYES +2
  Goto mk_install_done
  CreateDirectory "$APPDATA\Microsoft\Internet Explorer\Quick Launch"
  CreateShortCut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

mk_install_done:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\MK Foods POS.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MK Foods POS.lnk"
  Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\MK Foods POS.lnk"
  DeleteRegKey HKLM "Software\MK Foods\MK Foods POS"
!macroend
