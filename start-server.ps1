$ErrorActionPreference = 'Stop'
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { throw 'Set JAVA_HOME to your JDK 25 LTS installation.' }
if (-not $env:CATALINA_HOME -or -not (Test-Path "$env:CATALINA_HOME\bin\catalina.bat")) { throw 'Set CATALINA_HOME to your Tomcat 10.1 installation.' }
Set-Location $PSScriptRoot
if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) { throw 'Install Maven and add its bin folder to PATH.' }
& mvn clean verify
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Tomcat was not started.' }
Copy-Item 'target\campusverse-lite.war' "$env:CATALINA_HOME\webapps\campusverse-lite.war" -Force
Write-Host 'Open http://localhost:8080/campusverse-lite/ after Tomcat starts.'
& "$env:CATALINA_HOME\bin\catalina.bat" run
