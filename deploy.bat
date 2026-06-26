@echo off
title Liar Game Auto Deploy
echo ==================================================
echo         Liar Game Elite - Auto Deploy Script
echo ==================================================
echo.
echo [1/3] Git 스테이징 추가 중 (git add .)
git add .
echo.
echo [2/3] 변경 사항 커밋 중 (git commit)
git commit -m "style: auto deploy premium white theme and assets"
echo.
echo [3/3] 깃허브 저장소로 푸시 중 (git push)
git push
echo.
echo ==================================================
echo  완료되었습니다! 이제 Hostinger 대시보드에서 'Redeploy'를 눌러주세요.
echo ==================================================
pause
