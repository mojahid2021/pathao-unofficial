#!/usr/bin/env node
// Rewrites package.json for GitHub Packages publishing.
// GitHub Packages requires a scoped package name (@scope/package).
// This script changes the name and publishConfig before `npm publish`
// in the publish-gpr CI job. It does NOT affect the npmjs.com publish job.

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', 'package.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

pkg.name = '@mojahid2021/pathao-unofficial';
pkg.publishConfig = { registry: 'https://npm.pkg.github.com/' };

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`package.json updated: name="${pkg.name}"`);
