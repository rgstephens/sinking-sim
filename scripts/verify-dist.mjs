import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { releaseMetadata } from "./release-metadata.mjs";

const { version, buildDate } = releaseMetadata;

const index = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
assert.match(index, /id="build-info"/, "production HTML includes the release metadata element");

const assetsDir = new URL("../dist/assets/", import.meta.url);
const assetNames = await readdir(assetsDir);
const assets = await Promise.all(assetNames.map((name) => readFile(join(assetsDir.pathname, name), "utf8")));
const output = assets.join("\n");

assert.ok(output.includes(version), `production assets include version ${version}`);
assert.ok(output.includes(buildDate), `production assets include build date ${buildDate}`);

console.log(`verified production metadata: v${version} · ${buildDate}`);
