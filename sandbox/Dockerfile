# Eval sandbox image for `skillet eval --sandbox docker`.
#
# Build:  docker build -t skillet-eval sandbox/
# Auth:   ~/.codex (and ~/.claude + ~/.claude.json) are mounted in at
#         runtime — nothing secret is baked into the image.
#         macOS note: Claude Code stores OAuth credentials in the
#         Keychain, which cannot be mounted; to use the claude harness
#         in the sandbox on macOS, pass an API key through instead:
#           sandbox:
#             env: ["ANTHROPIC_API_KEY"]
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex @anthropic-ai/claude-code

# Trials run as root inside the container; the container is the boundary.
ENV HOME=/root
WORKDIR /workspace
