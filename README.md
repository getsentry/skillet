# Skillet

Add evaluations to agent skills and improve them.

Skillet generates eval cases from behavior descriptions, runs them against your skill, and iterates until the skill works. It reads your SKILL.md, understands what the skill should do, and produces YAML eval files that test real behaviors.

## Install

```bash
npx @sentry/skillet install
```

This copies the skillet skill into your agent (auto-detects Claude Code, OpenCode, Pi). Your agent then knows how to use skillet when you ask it to create or improve skills.

## Usage

### Add evals to an existing skill

```bash
npx @sentry/skillet add-eval ./my-skill \
  "should flag N+1 queries in loops" \
  "should NOT flag single .get() calls" \
  "should recommend select_related for FK access"
```

Then run them:

```bash
npx @sentry/skillet eval ./my-skill
```

### Improve a skill

```bash
npx @sentry/skillet improve ./my-skill
```

Reads the skill, generates evals if missing, runs them, and iterates on both the skill and evals until passing.

### Create a new skill

```bash
npx @sentry/skillet create "Django N+1 query reviewer"
```

Generates SKILL.md, evals, runs them, iterates.

### Validate structure

```bash
npx @sentry/skillet validate ./my-skill
```

Fast structural check. No LLM calls. Run before `eval` to catch cheap errors.

## Commands

| Command | What it does |
|---------|-------------|
| `add-eval [path] "behavior" [...]` | Generate eval cases from descriptions |
| `eval [path] [--json]` | Run evals, report pass/fail |
| `improve [path]` | Improve skill + evals iteratively |
| `create "description"` | Generate new skill from scratch |
| `validate [path] [--json]` | Structural check, no LLM |
| `install [path]` | Install skillet skill into agent |

## Credentials

Skillet auto-discovers LLM credentials. No configuration needed when running inside Claude Code, Codex, GitHub Copilot, or any environment with standard API keys set.

Override with `SKILLET_MODEL=provider/model-id` if needed.

## How Evals Work

Eval cases live in `evals/*.eval.yaml` inside the skill directory:

```yaml
evals:
  - name: flags N+1 in loop
    workspace:
      setup: |
        cat > views.py <<'EOF'
        for book in Book.objects.all():
            print(book.author.name)
        EOF
    turns:
      - "Review views.py for query performance issues"
    checks:
      - output_contains: "select_related"
      - output_contains: "N+1"
```

Each case sets up a workspace, sends prompts to an agent loaded with the skill, and checks the output with structural assertions or an LLM judge.

## License

MIT
