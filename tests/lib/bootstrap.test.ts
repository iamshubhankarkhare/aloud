import { describe, it, expect } from "bun:test";
import { getVenvPython, venvExists } from "../../lib/bootstrap";
import { homedir } from "os";
import { join } from "path";

describe("bootstrap", () => {
  it("getVenvPython returns expected path", () => {
    const path = getVenvPython();
    expect(path).toBe(join(homedir(), ".claude", "channels", "aloud", ".venv", "bin", "python3"));
  });

  it("venvExists returns false when missing", () => {
    process.env.ALOUD_VENV_DIR = "/tmp/aloud-nonexistent-venv";
    expect(venvExists()).toBe(false);
    delete process.env.ALOUD_VENV_DIR;
  });

  it("ALOUD_VENV_DIR override changes getVenvPython", () => {
    process.env.ALOUD_VENV_DIR = "/tmp/custom-venv";
    expect(getVenvPython()).toBe("/tmp/custom-venv/bin/python3");
    delete process.env.ALOUD_VENV_DIR;
  });
});
