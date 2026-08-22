!macro customInstall
  SetShellVarContext current
  Delete "$DESKTOP\class-diary.lnk"
  Delete "$DESKTOP\ClassDiary.lnk"
  Delete "$DESKTOP\Class Diary.lnk"
  Delete "$DESKTOP\학급일지.lnk"
  Delete "$DESKTOP\학급일지*.lnk"
  Delete "$SMPROGRAMS\class-diary.lnk"
  Delete "$SMPROGRAMS\ClassDiary.lnk"
  Delete "$SMPROGRAMS\학급일지.lnk"
  Delete "$SMPROGRAMS\학급일지*.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\class-diary.lnk"
  Delete "$DESKTOP\ClassDiary.lnk"
  Delete "$DESKTOP\Class Diary.lnk"
  Delete "$DESKTOP\학급일지.lnk"
  Delete "$DESKTOP\학급일지*.lnk"
  Delete "$SMPROGRAMS\class-diary.lnk"
  Delete "$SMPROGRAMS\ClassDiary.lnk"
  Delete "$SMPROGRAMS\학급일지.lnk"
  Delete "$SMPROGRAMS\학급일지*.lnk"

  SetShellVarContext current
  CreateShortCut "$DESKTOP\학급일지.lnk" "$appExe" "" "$appExe" 0
!macroend

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\class-diary.lnk"
  Delete "$DESKTOP\ClassDiary.lnk"
  Delete "$DESKTOP\Class Diary.lnk"
  Delete "$DESKTOP\학급일지.lnk"
  Delete "$DESKTOP\학급일지*.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\class-diary.lnk"
  Delete "$DESKTOP\ClassDiary.lnk"
  Delete "$DESKTOP\Class Diary.lnk"
  Delete "$DESKTOP\학급일지.lnk"
  Delete "$DESKTOP\학급일지*.lnk"
!macroend
