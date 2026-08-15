!include LogicLib.nsh

; MK Foods POS custom Windows installer integration.
; Tauri's NSIS installer already creates the Start Menu shortcut and
; standard uninstall registry information. This hook adds application
; registry information and optionally creates Desktop, Startup and
; Quick Launch shortcuts.

!macro NSIS_HOOK_POSTINSTALL
  ; Application registry information (per-machine installer).
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Version" "2.0.0"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Publisher" "MK Foods"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "DisplayName" "MK Foods POS"

  ; Ask for a desktop shortcut.
  MessageBox MB_YESNO|MB_ICONQUESTION "Create a desktop shortcut for MK Foods POS?" IDYES mk_create_desktop
  Goto mk_ask_startup
mk_create_desktop:
  CreateShortCut "$DESKTOP\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

mk_ask_startup:
  ; Ask whether MK Foods POS should start with Windows.
  MessageBox MB_YESNO|MB_ICONQUESTION "Start MK Foods POS automatically when Windows starts?" IDYES mk_create_startup
  Goto mk_ask_quicklaunch
mk_create_startup:
  CreateDirectory "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
  CreateShortCut "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

mk_ask_quicklaunch:
  ; Ask whether to create a Quick Launch shortcut.
  ; Windows 10/11 may hide Quick Launch from the taskbar, but the shortcut
  ; remains available in the user's Quick Launch folder.
  MessageBox MB_YESNO|MB_ICONQUESTION "Create a Quick Launch shortcut for MK Foods POS?" IDYES mk_create_quicklaunch
  Goto mk_install_done
mk_create_quicklaunch:
  CreateDirectory "$APPDATA\Microsoft\Internet Explorer\Quick Launch"
  CreateShortCut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

mk_install_done:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\MK Foods POS.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MK Foods POS.lnk"
  Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\MK Foods POS.lnk"
  DeleteRegKey HKLM "Software\MK Foods\MK Foods POS"
  RMDir "$APPDATA\Microsoft\Windows\Start Menu\Programs\MK Foods POS"
!macroend
