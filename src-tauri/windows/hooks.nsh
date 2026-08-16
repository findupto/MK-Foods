; MK Foods POS Windows installer integration.
; Fast installation: no optional setup popups or console windows.

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Version" "2.0.0"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Publisher" "MK Foods"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "DisplayName" "MK Foods POS"

  ; Create the normal desktop shortcut without asking extra questions.
  CreateShortCut "$DESKTOP\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\MK Foods POS.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MK Foods POS.lnk"
  Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\MK Foods POS.lnk"

  ; Uninstall means remove the local POS installation data as requested.
  ; Covers the common Tauri app-data locations and legacy MK Foods folders.
  RMDir /r "$APPDATA\pk.mkfoods.pos"
  RMDir /r "$LOCALAPPDATA\pk.mkfoods.pos"
  RMDir /r "$APPDATA\MK Foods POS"
  RMDir /r "$LOCALAPPDATA\MK Foods POS"
  RMDir /r "$APPDATA\mk-foods-pos"
  RMDir /r "$LOCALAPPDATA\mk-foods-pos"
  RMDir /r "$APPDATA\com.mkfoods.pos"
  RMDir /r "$LOCALAPPDATA\com.mkfoods.pos"

  DeleteRegKey HKLM "Software\MK Foods\MK Foods POS"
!macroend
