import assert from "node:assert/strict"
import test from "node:test"

import { formatUser } from "../src/format-user.js"

test("formats a named user", () => {
  assert.equal(formatUser({ name: "Ada" }), "Ada")
})
