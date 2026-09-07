import test from "node:test";
import assert from "node:assert/strict";
import { originTarget } from "../scripts/http-target.mjs";
test("same-host absolute HTTP targets reload the same local route", () => {
  assert.equal(originTarget("http://127.0.0.1:3100/", "127.0.0.1:3100"), "/");
  assert.equal(
    originTarget("http://127.0.0.1:3100/author?mode=preview", "127.0.0.1:3100"),
    "/author?mode=preview",
  );
  assert.equal(originTarget("/assets/game.js", "localhost"), "/assets/game.js");
  for (const target of [
    "http://other.example/",
    "http://user:pass@localhost/",
    "http://localhost/#fragment",
  ])
    assert.throws(() => originTarget(target, "localhost"));
});
