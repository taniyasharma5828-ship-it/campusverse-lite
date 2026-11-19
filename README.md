# CampusVerse Lite — corrected project

Java 25 LTS / Jakarta Servlets / JSP / JDBC / H2 / Maven / Tomcat 10.1.
The frontend and backend are in this one project. No external API key is required.

## Windows setup

1. Extract the entire ZIP. Open the folder containing pom.xml in Antigravity.
2. Install JDK 25 LTS, Apache Maven, and Tomcat 10.1.
3. In PowerShell, set your actual installation paths, for example:

   $env:JAVA_HOME = 'C:\Program Files\Java\jdk-25'
   $env:CATALINA_HOME = 'C:\Tools\apache-tomcat-10.1'

   Add Maven's bin folder to PATH. Confirm with: mvn -version
4. Stop any previous Tomcat instance. Run .\start-server.bat from the extracted folder.
   This builds/tests the project, copies the WAR to Tomcat and runs it in the terminal.
5. Open http://localhost:8080/campusverse-lite/ and choose a nickname.
6. Open an incognito window and choose a different nickname to test shared chat.
7. Use .\stop-server.bat in another terminal, or Ctrl+C in the server terminal.

Do not run two Tomcat instances against the same embedded H2 database. Do not copy
over a running application's WAR. Keep the startup terminal open.

## Ready-to-deploy WAR

If Maven setup is not ready, deploy deploy/campusverse-lite.war into the webapps
folder of a stopped Tomcat 10.1 installation, then start Tomcat using JDK 25 LTS.
The checked-in WAR was rebuilt from the Java 25 source. Rebuild it after source
changes with: mvn clean verify.

## Database

The default is ./data/campusverse_db.mv.db, relative to the server working directory.
The bundled startup script starts from this project folder, making that location stable.
The database and its tables are created automatically. No database API key is needed.
Keep the data folder when updating your application. To override the location, pass
-Dcampusverse.db.url=jdbc:h2:/absolute/path/campusverse_db in Tomcat's CATALINA_OPTS.
Use persistent writable storage when deploying elsewhere.

## Upgrade checks

- Java 25.0.5 compilation and Maven verification: PASS.
- JUnit Platform: 48 tests passed, zero failed.
- The rebuilt WAR contains Java 25 class files.
- JavaScript syntax and checks/frontend-check.cjs: PASS.
- Tomcat 10.1.34 HTTP checks: all eight JSP views compiled; two session message
  exchange passed; logged-out API blocked; missing CSRF blocked; two-hour expiry
  correct; another student's resolve request blocked; owner's resolve succeeded.
- `mvn clean verify` could not remove generated classes held by an active application;
  `mvn verify` completed successfully without stopping it.
- The startup scripts were not executed as part of this upgrade check.
- Browser visual/responsive QA was not performed on this updated upload. The frontend
  logic checks use a mocked DOM and the live HTTP checks verify server behavior.

## Fixes

- Removed automatic login of every visitor as Milee_Kesarwani.
- Added real nickname entry and session ID rotation.
- Added CSRF enforcement, AJAX headers and legacy JSP form tokens.
- Required a student session for protected routes and the messages API.
- Escaped query notices and safely embedded initial JSON in the HTML script.
- Removed sample profiles, messages, doubts and rooms from the live data flow.
- Loads profile, rooms, matches, questions and replies from backend JSON endpoints.
- Server failures are visible and do not appear as successful local saves.
- Preserves failed message drafts; deduplicates messages by server ID; scopes polling
  results to the room; prevents overlapping polls and cursor jumps after sending.
- Corrected GhostRoom duration parsing and expiry at the exact deadline.
- Removed unsupported GhostRoom topic/subject inputs instead of silently discarding them.
- Removed the reopen action because the backend supports resolve only.
- Empty interest selections now clear previous interests.
- Replaced machine-specific startup paths with environment configuration.
- Disabled unnecessary H2 AUTO_SERVER mode for a single Tomcat deployment.

## Prototype limits

Nickname entry is classroom-demo identity, not password authentication. Anyone who
knows a nickname can reuse that identity. Do not use it for confidential data or
production accounts without adding real authentication. Saved-circle selections
are only in memory for the current page. GhostRooms have a name and expiry; custom
room topics, subjects and actual participant counts are not stored by this schema.
The old public Sites demo is separate and was not changed or redeployed by this fix.
