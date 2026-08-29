#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse } from "yaml";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const ALLOWED_KEYS = new Set(["name", "description"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [skillDirectory] = process.argv.slice(2);

if (!skillDirectory) {
  fail("Usage: node scripts/validate-skill.mjs <skill-directory>");
}

const skillPath = path.resolve(skillDirectory);
const skillFile = path.join(skillPath, "SKILL.md");

let content;
try {
  content = await readFile(skillFile, "utf8");
} catch (error) {
  fail(`Cannot read ${skillFile}: ${error.message}`);
}

const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
if (!frontmatterMatch) {
  fail("SKILL.md must start with valid YAML frontmatter.");
}

let frontmatter;
try {
  frontmatter = parse(frontmatterMatch[1]);
} catch (error) {
  fail(`Invalid YAML frontmatter: ${error.message}`);
}

if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
  fail("SKILL.md frontmatter must be a YAML mapping.");
}

const unexpectedKeys = Object.keys(frontmatter).filter((key) => !ALLOWED_KEYS.has(key));
if (unexpectedKeys.length > 0) {
  fail(`Unexpected frontmatter key(s): ${unexpectedKeys.sort().join(", ")}.`);
}

const { name, description } = frontmatter;
if (typeof name !== "string" || name.trim().length === 0) {
  fail("SKILL.md frontmatter requires a non-empty string name.");
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) {
  fail("Skill name must use lowercase hyphen-case.");
}

if (name.length > MAX_NAME_LENGTH) {
  fail(`Skill name must not exceed ${MAX_NAME_LENGTH} characters.`);
}

if (path.basename(skillPath) !== name) {
  fail(`Skill directory must be named ${name}.`);
}

if (typeof description !== "string" || description.trim().length === 0) {
  fail("SKILL.md frontmatter requires a non-empty string description.");
}

if (description.length > MAX_DESCRIPTION_LENGTH) {
  fail(`Skill description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`);
}

if (/[<>]/u.test(description)) {
  fail("Skill description cannot contain angle brackets.");
}

console.log("Skill is valid!");
