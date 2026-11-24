import argon2 from "argon2";
import type { Hasher } from "./types.js";

// argon2id with the library defaults (RNF-07). Passwords are never stored or logged in plain text.
export const argon2Hasher: Hasher = {
  hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
  verify: (hash, password) => argon2.verify(hash, password),
};
