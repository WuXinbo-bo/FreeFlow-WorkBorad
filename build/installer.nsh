!macro customInstallMode
  StrCpy $isForceCurrentInstall 1
!macroend

!macro preInit
  SetShellVarContext current
  SetRegView 64
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  SetRegView 32
  StrCmp $R0 "" 0 +2
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  StrCmp $R0 "" 0 +2
  StrCpy $R0 "$LOCALAPPDATA\Programs\FreeFlow"
  StrCpy $InstDir "$R0"
!macroend
