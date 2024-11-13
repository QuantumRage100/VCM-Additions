:startover
echo (%time%) App started.
echo Installing necessary modules...
call npm install
echo Starting the bot...
node index.js
echo (%time%) WARNING: App closed or crashed, restarting.
goto startover
pause