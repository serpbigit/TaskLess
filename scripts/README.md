# scripts

This folder is for helper scripts / runbooks.

- dump-files.ps1: emits a single combined text snapshot of the repo files
- clasp.ps1: repo-local wrapper for `clasp` that resolves the executable explicitly instead of depending on shell PATH/profile state

Usage from `C:\dev\gas\TaskLess`:

```powershell
.\scripts\clasp.ps1 push
.\scripts\clasp.ps1 deploy --deploymentId AKfycbx1p8fg0eFua_9qLJ7tTk0P-cd_zLKxAHnc8KRfyIhgaPtwXANfEZ_QjG3a6pvfVefa --description "session-context-and-contact-sync"
```

