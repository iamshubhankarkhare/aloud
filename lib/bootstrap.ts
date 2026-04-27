import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export function venvDir(): string {
  return process.env.ALOUD_VENV_DIR ?? join(homedir(), ".claude", "channels", "aloud", ".venv");
}

export function getVenvPython(): string {
  return join(venvDir(), "bin", "python3");
}

export function venvExists(): boolean {
  return existsSync(getVenvPython());
}
