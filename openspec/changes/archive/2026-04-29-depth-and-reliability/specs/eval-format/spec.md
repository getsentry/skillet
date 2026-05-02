## ADDED Requirements

### Requirement: Generated Eval Setup Validation

Generated eval setup scripts SHALL be preflighted before eval files are written.

#### Scenario: Setup writes nested file without parent directory
- **WHEN** eval generation produces a setup script that writes
  `config/routes.rb` without creating `config/`
- **THEN** setup validation fails during generation
- **AND** the generation retry receives the shell error as feedback

#### Scenario: Valid setup script
- **WHEN** a generated case setup runs successfully in a temp workspace
- **THEN** the eval file may be written
