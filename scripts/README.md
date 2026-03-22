# scripts

This folder is for helper scripts / runbooks.

- dump-files.ps1: emits a single combined text snapshot of the repo files
- clasp.ps1: repo-local wrapper for `clasp` that resolves the executable explicitly instead of depending on shell PATH/profile state

Usage from `C:\dev\gas\TaskLess`:

```powershell
.\scripts\clasp.ps1 push
.\scripts\clasp.ps1 deploy --deploymentId AKfycbzIq0DUr6h8zXelBVn_mXHR7k0DIg97AL5jvLfyIZrFhEotITNkDpbviGXW8xpr9wo --description "session-context-and-contact-sync"
```

