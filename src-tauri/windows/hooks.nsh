; MK Foods POS custom Windows installer integration.
; Keeps shortcuts/registry clean and offers an explicit choice to remove
; the offline POS database during uninstall.

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Version" "2.0.0"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "Publisher" "MK Foods"
  WriteRegStr HKLM "Software\MK Foods\MK Foods POS" "DisplayName" "MK Foods POS"

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

  ; The POS database lives under Tauri app_data_dir. On Windows this can
  ; resolve through the roaming or local application-data location depending
  ; on the runtime/version, so offer one explicit cleanup covering both.
  MessageBox MB_YESNO|MB_ICONQUESTION "Delete all MK Foods POS local data, orders, settings, users and history?\n\nChoose No to keep your data for a future reinstall." IDYES mk_delete_data
  Goto mk_uninstall_done

mk_delete_data:
  RMDir /r "$APPDATA\pk.mkfoods.pos"
  RMDir /r "$LOCALAPPDATA\pk.mkfoods.pos"
  RMDir /r "$APPDATA\MK Foods POS"
  RMDir /r "$LOCALAPPDATA\MK Foods POS"

mk_uninstall_done:
  DeleteRegKey HKLM "Software\MK Foods\MK Foods POS"
!macroend
