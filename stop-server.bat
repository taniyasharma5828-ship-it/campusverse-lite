@echo off
if not exist "%CATALINA_HOME%\bin\shutdown.bat" (
 echo Set CATALINA_HOME to your Tomcat 10.1 folder.
 exit /b 1
)
call "%CATALINA_HOME%\bin\shutdown.bat"
