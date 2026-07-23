# Design

`checkForUpdate` reuses `~/.skillet/update-check.json` for one hour. After that TTL, it performs a new registry request and compares the returned stable version with the running version. The CLI still starts the request only after selecting a valid non-help command and awaits it after the command completes, so normal work overlaps the network latency.

Registry, parsing, and cache-write failures return no notice and do not affect the command.
