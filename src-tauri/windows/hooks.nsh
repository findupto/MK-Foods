!include LogicLib.nsh

; MK Foods POS custom Windows installer integration.
; Tauri's NSIS installer already creates the Start Menu shortcut and
; standard uninstall registry information. This hook adds an app registry
; entry and lets the user opt into extra shortcuts after installation.

!macro NSIS_HOOK_POSTINSTALL
  ; Application registry information (per-machine installer).
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Version" "2.0.0"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Publisher" "MK Foods"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "DisplayName" "MK Foods POS"

  ; Desktop shortcut
  MessageBox MB_YESNO|MB_ICONQUESTION "Create a desktop shortcut for MK Foods POS?" IDYES create_desktop IDNO ask_startup
create_desktop:
  CreateShortCut "$DESKTOP\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

ask_startup:
  ; Windows Startup shortcut (launches the POS when the user signs in).
  MessageBox MB_YESNO|MB_ICONQUESTION "Start MK Foods POS automatically when Windows starts?" IDYES create_startup IDNO ask_quicklaunch
create_startup:
  CreateDirectory "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
  CreateShortCut "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

ask_quicklaunch:
  ; Quick Launch shortcut. Windows 10/11 may hide Quick Launch from the taskbar,
  ; but the shortcut remains available in the user's Quick Launch folder.
  MessageBox MB_YESNO|MB_ICONQUESTION "Create a Quick Launch shortcut for MK Foods POS?" IDYES create_quicklaunch done
create_quicklaunch:
  CreateDirectory "$APPDATA\Microsoft\Internet Explorer\Quick Launch"
  CreateShortCut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\MK Foods POS.lnk" "$INSTDIR\mk-foods-pos.exe" "" "$INSTDIR\mk-foods-pos.exe" 0 SW_SHOWNORMAL "" "MK Foods POS"

done:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\MK Foods POS.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MK Foods POS.lnk"
  Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\MK Foods POS.lnk"
  DeleteRegKey HKLM "Software\MK Foods\MK Foods POS"
  RMDir "$APPDATA\Microsoft\Windows\Start Menu\Programs\MK Foods POS"
!macroend
