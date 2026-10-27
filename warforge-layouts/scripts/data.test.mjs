import { expect, it } from "vitest";
import { validateData } from "./validate-data.mjs";
it("ships a complete, hash-checked, self-contained snapshot", () => {
  expect(validateData()).toMatchObject({
    layouts: 45,
    placements: 720,
    files: 137,
  });
});
