# CLI Delta

## MODIFIED Requirements

### Requirement: Current version recommendation

For valid commands other than help and version output, Skillet SHALL check the npm `latest` release in the background at most once per one-hour cache window. When the running version is older, Skillet SHALL let the command finish normally and then recommend `npx -y @sentry/skillet@latest` on stderr. Registry and cache failures SHALL NOT change command output, exit status, or availability.

#### Scenario: Outdated installed binary

- **GIVEN** the running Skillet version is older than npm's latest release
- **WHEN** a valid command completes
- **THEN** its normal output and exit status are preserved
- **AND** stderr identifies both versions and recommends `npx -y @sentry/skillet@latest`

#### Scenario: Registry unavailable

- **WHEN** the update request times out or fails
- **THEN** the selected command completes without an update-check error

#### Scenario: Help or version request

- **WHEN** the user requests help or version output
- **THEN** Skillet returns it without checking the registry

#### Scenario: Repeated installed-binary commands within one hour

- **WHEN** the user runs another valid installed-binary command
- **THEN** Skillet reuses the cached registry result instead of making another request

#### Scenario: First command after one hour

- **GIVEN** the cached registry result is more than one hour old
- **WHEN** the user runs a valid installed-binary command
- **THEN** Skillet refreshes the cached latest version from npm
