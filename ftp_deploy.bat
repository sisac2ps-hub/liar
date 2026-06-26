@echo off
title Liar Game Elite - Direct FTP Deploy
echo ==================================================
echo        Liar Game Elite - Direct FTP Deploy
echo ==================================================
echo.
echo [1/3] 프론트엔드 리액트 클라이언트 빌드 중... (npm run client-build)
cmd.exe /c "npm run client-build"
if %errorlevel% neq 0 (
    echo.
    echo [오류] 빌드에 실패했습니다! 위 에러 코드를 확인해 주세요.
    pause
    exit /b %errorlevel%
)
echo.
echo [2/3] 빌드된 에셋 복사 중... (dist -> public)
if exist public\assets (
    rmdir /s /q public\assets
)
xcopy /s /e /y client\dist\* public\
echo.
echo [3/3] 호스팅거 FTP 서버로 파일 다이렉트 업로드 중...
node scratch\ftp_upload.js
if %errorlevel% neq 0 (
    echo.
    echo [오류] FTP 업로드에 실패했습니다!
    pause
    exit /b %errorlevel%
)
echo.
echo ==================================================
echo  배포 완료! 깃허브 푸시 없이 사이트에 즉시 반영되었습니다.
echo  (반영이 안 되면 Hostinger 대시보드에서 'Restart'를 눌러주세요)
echo ==================================================
pause
